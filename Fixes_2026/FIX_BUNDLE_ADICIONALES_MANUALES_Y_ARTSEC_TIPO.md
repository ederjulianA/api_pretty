# Fix: Artículos adicionales eliminados en bundles y tipo incorrecto de art_sec en sync WooCommerce

**Fecha:** 2026-04-15
**Reportado por:** Usuario interno
**Módulo afectado:** Artículos Bundle / Sincronización WooCommerce
**Severidad:** Alta
**Estado:** Pendiente de implementación

---

## Contexto

El sistema permite vender artículos armados (bundles): un producto padre que contiene N componentes definidos en `dbo.articulosArmado`. Al facturar, el sistema expande el bundle en una línea padre (con precio real) y N líneas de componentes (con precio $0), para que el inventario de cada componente se decremente correctamente.

Durante la revisión se identificaron **2 bugs independientes** relacionados con este módulo:

1. Un bug de lógica en `orderModel.js` que elimina artículos adicionales del pedido.
2. Un bug de tipo de dato en `syncWooOrdersController.js` que usa `sql.Int` para un campo `VARCHAR(30)`.

---

## Bug 1 — Artículos adicionales manualmente agregados son eliminados si son componentes de un bundle

### Archivo afectado

`models/orderModel.js` — función `expandirBundles`

### Línea exacta

**Línea 121**

```javascript
if (componentesYaAnadidos.has(artSec)) continue;
```

### Descripción del problema

La función `expandirBundles` tiene dos pasadas:

- **Primera pasada:** detecta los bundles, los expande, y registra los `art_sec` de sus componentes en el `Set componentesYaAnadidos`.
- **Segunda pasada:** agrega las líneas que no son bundles. En esta pasada, si el `art_sec` de la línea está en `componentesYaAnadidos`, la línea se **descarta silenciosamente**.

El propósito original del `Set` era evitar duplicar componentes cuando el pedido llega pre-expandido (flujo COT→VTA donde el frontend ya envía el bundle + sus componentes explícitos). Sin embargo, la condición es demasiado amplia: bloquea **cualquier** artículo cuyo `art_sec` coincida con un componente de algún bundle en el pedido, incluso si el usuario lo agregó de forma manual e intencional como producto adicional.

### Escenario que reproduce el bug

```
Combo "Kit Amor" contiene:
  - art_sec 1530 (Labial Rojo)   × 1 unidad
  - art_sec 1545 (Máscara)       × 1 unidad

El usuario arma el pedido así:
  - 1× Kit Amor (bundle)
  - 1× Labial Rojo (art_sec 1530) — adicional manual, el cliente quiere uno extra

Resultado INCORRECTO (bug activo):
  facturakardes:
  ├── art_sec 1530 → Kit Amor (padre, precio completo)        ✅
  ├── art_sec 1530 → Labial Rojo (componente, precio $0)      ✅
  └── art_sec 1545 → Máscara (componente, precio $0)          ✅
  ❌ La línea adicional manual de Labial Rojo (art_sec 1530) fue eliminada

Resultado CORRECTO (después del fix):
  facturakardes:
  ├── art_sec 1530 → Kit Amor (padre, precio completo)        ✅
  ├── art_sec 1530 → Labial Rojo (componente, precio $0)      ✅
  ├── art_sec 1545 → Máscara (componente, precio $0)          ✅
  └── art_sec 1530 → Labial Rojo adicional (precio normal)    ✅ ← antes era eliminado
```

### Flujos afectados

| Flujo | Función afectada |
|-------|-----------------|
| Nueva cotización | `createCompleteOrder` → `expandirBundles` |
| Nueva factura/venta | `createCompleteOrder` → `expandirBundles` |
| Actualizar cotización/factura | `updateOrder` → `expandirBundles` |
| Cotización → Factura (COT→VTA) | `createCompleteOrder` → `expandirBundles` |

Los 4 flujos usan la misma función `expandirBundles`, por lo que el fix es único y aplica a todos.

### Fix

La distinción correcta es: una línea llegó como **componente pre-expandido** (tiene `kar_bundle_padre` seteado en el input del frontend) vs. una línea que el **usuario agregó manualmente** (no tiene `kar_bundle_padre`). El `art_sec` no es suficiente para discriminar.

**Antes (bug):**
```javascript
// models/orderModel.js — línea 121
// Segunda pasada: añadir líneas que no son bundle y no son componentes ya añadidos
for (const detalle of detalles) {
    const artSec = detalle.art_sec != null ? String(detalle.art_sec) : '';
    if (!artSec) continue;
    if (componentesYaAnadidos.has(artSec)) continue;  // ← BUG: elimina adicionales manuales
    // ...
}
```

**Después (fix):**
```javascript
// models/orderModel.js — línea 121
// Segunda pasada: añadir líneas que no son bundle y no son componentes ya añadidos
// Solo omitir si la línea YA viene marcada como componente explícito (kar_bundle_padre seteado),
// no por mero coincidencia de art_sec — eso bloquearía adicionales manuales legítimos.
for (const detalle of detalles) {
    const artSec = detalle.art_sec != null ? String(detalle.art_sec) : '';
    if (!artSec) continue;
    if (componentesYaAnadidos.has(artSec) && detalle.kar_bundle_padre) continue;  // ← FIX
    // ...
}
```

### Validación post-fix

```sql
-- Crear pedido con: 1× Bundle (que contiene art_sec 1530) + 1× art_sec 1530 manual
-- Verificar que facturakardes tenga:
--   1 línea bundle padre
--   N líneas componentes (precio $0, kar_bundle_padre != NULL)
--   1 línea adicional manual (precio normal, kar_bundle_padre IS NULL)

SELECT
    fk.kar_sec,
    a.art_cod,
    a.art_nom,
    fk.kar_uni,
    fk.kar_pre_pub,
    fk.kar_bundle_padre,
    CASE
        WHEN fk.kar_bundle_padre IS NULL AND a.art_bundle = 'S' THEN 'Bundle padre'
        WHEN fk.kar_bundle_padre IS NOT NULL                    THEN 'Componente bundle'
        ELSE                                                         'Artículo normal/adicional'
    END AS tipo_linea
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
WHERE fk.fac_sec = <fac_sec_del_pedido_prueba>
ORDER BY fk.kar_sec;
```

**Resultado esperado:** la línea adicional manual aparece con `tipo_linea = 'Artículo normal/adicional'` y con precio correcto.

---

## Bug 2 — Tipo de dato incorrecto para `art_sec` en sincronización de pedidos WooCommerce

### Archivo afectado

`controllers/syncWooOrdersController.js` — funciones `createOrder` y `updateOrder`

### Líneas exactas

- **Línea 638** (función `createOrder`)
- **Línea 904** (función `updateOrder`)

```javascript
.input('art_sec', sql.Int, articleInfo)  // ← sql.Int incorrecto
```

### Descripción del problema

El campo `art_sec` en `dbo.articulos` y `dbo.facturakardes` es de tipo `VARCHAR(30)`, no `INT`. La función `getArticleInfo` lo retorna tal como lo devuelve SQL Server (string).

Al pasarlo como `sql.Int`, el driver de mssql intenta una conversión implícita. Para `art_sec` que son valores puramente numéricos (p.ej. `"1530"`) la conversión funciona sin error porque el driver los puede interpretar como número. Sin embargo:

- Si en el futuro algún `art_sec` contiene caracteres no numéricos, el INSERT falla con error de conversión de tipo.
- Es incorrecto semánticamente: el campo en BD es `VARCHAR(30)` y debe tratarse como tal en toda la capa de acceso a datos para mantener consistencia y prevenir errores latentes.
- Viola el principio establecido en el proyecto: **siempre usar `sql.VarChar(30)` para `art_sec`** (documentado en `CLAUDE.md` y en la memoria del proyecto).

### Contexto adicional

La misma función `syncWooOrdersController.js` usa correctamente `sql.VarChar(30)` para `art_sec` en las queries de validación bundle (líneas 503 y 521), lo que confirma que el tipo correcto es conocido y fue omitido accidentalmente en el INSERT.

### Fix

**Antes (bug) — `createOrder` línea 638:**
```javascript
await transaction.request()
    .input('fac_sec', sql.Int, facSec)
    .input('kar_sec', sql.Int, karSecCounter++)
    .input('art_sec', sql.Int, articleInfo)      // ← INCORRECTO
    // ...
```

**Después (fix):**
```javascript
await transaction.request()
    .input('fac_sec', sql.Int, facSec)
    .input('kar_sec', sql.Int, karSecCounter++)
    .input('art_sec', sql.VarChar(30), String(articleInfo))  // ← CORRECTO
    // ...
```

**Antes (bug) — `updateOrder` línea 904:**
```javascript
await transaction.request()
    .input('fac_sec', sql.Int, facSec)
    .input('kar_sec', sql.Int, karSecCounter++)
    .input('art_sec', sql.Int, articleInfo)      // ← INCORRECTO
    // ...
```

**Después (fix):**
```javascript
await transaction.request()
    .input('fac_sec', sql.Int, facSec)
    .input('kar_sec', sql.Int, karSecCounter++)
    .input('art_sec', sql.VarChar(30), String(articleInfo))  // ← CORRECTO
    // ...
```

### Validación post-fix

1. Ejecutar `POST /api/woo/sync-orders` con un pedido de WooCommerce que contenga un bundle.
2. Verificar que los registros se insertan correctamente en `facturakardes`.
3. Confirmar que no hay errores de conversión de tipo en los logs de Node.js / PM2.

```bash
pm2 logs api_pretty --lines 100
```

---

## Checklist de implementación

### Bug 1 — `orderModel.js`

- [ ] Modificar línea 121: agregar `&& detalle.kar_bundle_padre` a la condición del `continue`
- [ ] Probar cotización con bundle + artículo adicional que sea componente del bundle
- [ ] Probar factura/venta con bundle + artículo adicional
- [ ] Probar flujo COT→VTA (cotización a factura) — verificar que no duplica componentes
- [ ] Probar pedido sin bundles — verificar que productos normales siguen funcionando igual

### Bug 2 — `syncWooOrdersController.js`

- [ ] Modificar línea 638: `sql.Int` → `sql.VarChar(30)` + `String(articleInfo)` en `createOrder`
- [ ] Modificar línea 904: `sql.Int` → `sql.VarChar(30)` + `String(articleInfo)` en `updateOrder`
- [ ] Ejecutar sync con pedido que contenga bundle
- [ ] Ejecutar sync con pedido de productos normales
- [ ] Verificar logs sin errores de tipo

---

## Archivos modificados

| Archivo | Línea(s) | Tipo de cambio |
|---------|----------|----------------|
| `models/orderModel.js` | 121 | Fix lógica — condición de filtro en segunda pasada de `expandirBundles` |
| `controllers/syncWooOrdersController.js` | 638 | Fix tipo dato — `sql.Int` → `sql.VarChar(30)` en `createOrder` |
| `controllers/syncWooOrdersController.js` | 904 | Fix tipo dato — `sql.Int` → `sql.VarChar(30)` en `updateOrder` |

---

## Referencias

- `implementaciones_2026/articulos_bundle/IMPLEMENTACION_ARTICULOS_BUNDLE.md` — documentación del módulo
- `implementaciones_2026/articulos_bundle/FIX_WOOCOMMERCE_SYNC_BUNDLES.md` — fix previo de sync WooCommerce
- `CLAUDE.md` — convención: `art_sec` siempre como `sql.VarChar(30)`

---

**Última actualización:** 2026-04-15
**Estado:** Documentado, pendiente de implementación y testing
