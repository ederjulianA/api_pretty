# Fix: Sincronización de Pedidos WooCommerce con Bundles

**Fecha:** 2026-02-11
**Bug Reportado:** Los pedidos de WooCommerce con productos bundle NO estaban guardando los componentes en `facturakardes`, causando que el inventario de componentes NO se decrementara.

---

## 🐛 Problema Identificado

### Síntoma
Al sincronizar un pedido de WooCommerce que contiene un producto bundle (artículo armado):
- ✅ Se insertaba la línea del bundle en `facturakardes`
- ❌ **NO se insertaban las líneas de componentes** del bundle
- ❌ **Inventario de componentes NO se decrementaba**
- ❌ Inconsistencia entre stock físico y stock del sistema

### Causa Raíz
En `controllers/syncWooOrdersController.js`, las funciones `createOrder()` y `updateOrder()` procesaban los line items de WooCommerce **directamente sin verificar si eran bundles**.

#### Código Problemático (ANTES)
```javascript
// ❌ INCORRECTO: Insertaba directamente sin expandir bundles
for (const item of orderData.lineItems) {
    const articleInfo = await getArticleInfo(item.sku);
    // ...
    await transaction.request()
        .input('art_sec', sql.Int, articleInfo)
        .input('kar_uni', sql.Int, quantity)
        .input('kar_pre_pub', sql.Decimal(18, 2), karPrePub)
        // ...
        .query(`INSERT INTO facturakardes (...) VALUES (...)`);
}
```

**Problema:** Si `articleInfo` corresponde a un bundle (`art_bundle = 'S'`), solo se insertaba 1 línea en lugar de 1 línea del bundle + N líneas de componentes.

---

## ✅ Solución Implementada

### Cambios Realizados

**Archivo:** `controllers/syncWooOrdersController.js`

#### 1. Expansión de Bundles ANTES del Loop de Inserción

Se agregó lógica de pre-procesamiento que expande los bundles en sus componentes:

```javascript
// ✅ CORRECTO: Pre-procesar items para expandir bundles
const expandedItems = [];

for (const item of orderData.lineItems) {
    const articleInfo = await getArticleInfo(item.sku);

    // Verificar si es bundle
    const bundleCheckResult = await poolPromise.then(pool => pool.request()
        .input('art_sec', sql.VarChar(30), String(articleInfo))
        .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec')
    );

    const esBundle = bundleCheckResult.recordset[0]?.art_bundle === 'S';

    if (esBundle) {
        // 1. Agregar línea del bundle padre (con precio completo)
        expandedItems.push({
            ...item,
            art_sec: articleInfo,
            kar_bundle_padre: null,  // Es el padre
            _es_bundle_padre: true
        });

        // 2. Obtener componentes
        const componentesResult = await poolPromise.then(pool => pool.request()
            .input('bundle_art_sec', sql.VarChar(30), String(articleInfo))
            .query(`
                SELECT ComArtSec, ConKarUni
                FROM dbo.articulosArmado
                WHERE art_sec = @bundle_art_sec
            `)
        );

        // 3. Agregar líneas de componentes con precio $0
        for (const comp of componentesResult.recordset) {
            expandedItems.push({
                id: item.id,
                sku: `${item.sku}_COMP_${comp.ComArtSec}`,
                quantity: item.quantity * comp.ConKarUni,  // Cantidad bundle × cantidad componente
                price: 0,  // ⚠️ Precio $0 para componentes
                subtotal: '0',
                total: '0',
                art_sec: comp.ComArtSec,
                kar_bundle_padre: String(articleInfo),  // ⚠️ Referencia al bundle padre
                _es_componente: true
            });
        }
    } else {
        // Artículo normal
        expandedItems.push({
            ...item,
            art_sec: articleInfo,
            kar_bundle_padre: null
        });
    }
}

// Procesar items expandidos
for (const item of expandedItems) {
    // ...
}
```

#### 2. Manejo Condicional de Precios para Componentes

```javascript
// Si es componente de bundle, usar valores en $0
if (item._es_componente) {
    // Componente de bundle: todos los valores en 0/NULL
    precioDetalFinal = 0;
    precioMayorFinal = 0;
    tieneOferta = 'N';
    precioOferta = null;
    descuentoPorcentaje = null;
    codigoPromocion = null;
    descripcionPromocion = null;
} else {
    // Artículo normal o bundle padre: obtener promociones
    const promocionInfo = await getArticuloPromocionInfo(articleInfo, orderData.dateCreated);
    // ...
}
```

#### 3. Campo `kar_bundle_padre` en INSERT

Se agregó el campo `kar_bundle_padre` a la consulta INSERT:

```javascript
.input('kar_bundle_padre', sql.VarChar(30), item.kar_bundle_padre)
.query(`
    INSERT INTO dbo.facturakardes (
        fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni,
        kar_nat, kar_pre, kar_pre_pub, kar_des_uno,
        kar_sub_tot, kar_lis_pre_cod, kar_total,
        kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta,
        kar_precio_oferta, kar_descuento_porcentaje, kar_codigo_promocion, kar_descripcion_promocion,
        kar_bundle_padre  -- ⚠️ NUEVO CAMPO
    )
    VALUES (
        @fac_sec, @kar_sec, @art_sec, @kar_bod_sec, @kar_uni,
        @kar_nat, @kar_pre, @kar_pre_pub, @kar_des_uno,
        @kar_sub_tot, @kar_lis_pre_cod, @kar_total,
        @kar_pre_pub_detal, @kar_pre_pub_mayor, @kar_tiene_oferta,
        @kar_precio_oferta, @kar_descuento_porcentaje, @kar_codigo_promocion, @kar_descripcion_promocion,
        @kar_bundle_padre  -- ⚠️ NUEVO CAMPO
    )
`)
```

---

## 📊 Resultado Esperado

### Ejemplo: Pedido con Bundle

**WooCommerce Order:**
```json
{
  "id": 12345,
  "line_items": [
    {
      "id": 1,
      "sku": "COMBO-AMOR-2024",
      "name": "Combo Amor y Amistad",
      "quantity": 2,
      "price": 50000
    }
  ]
}
```

**Bundle en BD:**
```sql
-- articulos
art_sec = '100', art_cod = 'COMBO-AMOR-2024', art_bundle = 'S'

-- articulosArmado
art_sec = '100', ComArtSec = '50', ConKarUni = 1  -- Labial
art_sec = '100', ComArtSec = '51', ConKarUni = 1  -- Máscara
art_sec = '100', ComArtSec = '52', ConKarUni = 1  -- Rubor
```

### ANTES del Fix (❌ INCORRECTO)

```sql
-- facturakardes: Solo 1 línea
fac_sec | kar_sec | art_sec | kar_uni | kar_pre_pub | kar_bundle_padre
--------|---------|---------|---------|-------------|------------------
12345   | 1       | 100     | 2       | 50000       | NULL
```

**Problema:** Componentes (art_sec 50, 51, 52) NO se decrementan del inventario.

### DESPUÉS del Fix (✅ CORRECTO)

```sql
-- facturakardes: 1 línea bundle + 3 líneas componentes = 4 líneas
fac_sec | kar_sec | art_sec | kar_uni | kar_pre_pub | kar_bundle_padre | Tipo
--------|---------|---------|---------|-------------|------------------|----------------
12345   | 1       | 100     | 2       | 50000       | NULL             | Bundle padre
12345   | 2       | 50      | 2       | 0           | 100              | Componente (Labial)
12345   | 3       | 51      | 2       | 0           | 100              | Componente (Máscara)
12345   | 4       | 52      | 2       | 0           | 100              | Componente (Rubor)
```

**Resultado:**
- ✅ Bundle padre se factura con precio completo ($50,000 × 2 = $100,000)
- ✅ Componentes se escriben con precio $0 (no suman al total)
- ✅ Inventario de componentes se decrementa correctamente (2 unidades c/u)
- ✅ `kar_bundle_padre` permite identificar relación bundle → componentes

---

## 🧪 Plan de Pruebas

### Prerequisito: Base de Datos
Asegurar que el campo `kar_bundle_padre` existe en `facturakardes`:

```sql
-- Verificar campo
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'facturakardes' AND COLUMN_NAME = 'kar_bundle_padre';

-- Si no existe, ejecutar migración:
-- implementaciones_2026/articulos_bundle/01_migracion_bundles.sql
```

### Caso de Prueba 1: Pedido con Solo Bundle

**Setup:**
1. Crear bundle de prueba en WooCommerce con SKU `TEST-BUNDLE-001`
2. Bundle tiene 3 componentes en `articulosArmado`
3. Crear orden en WooCommerce con 1 unidad del bundle

**Endpoint:** `POST /api/woo/sync-orders`

**Validación:**
```sql
-- Debe haber 4 líneas en facturakardes (1 bundle + 3 componentes)
SELECT
    fk.kar_sec,
    a.art_cod,
    a.art_nom,
    fk.kar_uni,
    fk.kar_pre_pub,
    fk.kar_bundle_padre,
    CASE
        WHEN fk.kar_bundle_padre IS NULL AND a.art_bundle = 'S' THEN 'Bundle Padre'
        WHEN fk.kar_bundle_padre IS NOT NULL THEN 'Componente'
        ELSE 'Normal'
    END as tipo
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
WHERE fk.fac_sec = <fac_sec_generado>
ORDER BY fk.kar_sec;
```

**Resultado Esperado:**
```
kar_sec | art_cod           | kar_uni | kar_pre_pub | kar_bundle_padre | tipo
--------|-------------------|---------|-------------|------------------|----------------
1       | TEST-BUNDLE-001   | 1       | 50000       | NULL             | Bundle Padre
2       | COMP-001          | 1       | 0           | <art_sec_bundle> | Componente
3       | COMP-002          | 1       | 0           | <art_sec_bundle> | Componente
4       | COMP-003          | 1       | 0           | <art_sec_bundle> | Componente
```

### Caso de Prueba 2: Pedido Mixto (Bundle + Artículos Normales)

**Setup:**
1. Crear orden en WooCommerce con:
   - 2× Bundle `TEST-BUNDLE-001`
   - 1× Producto simple `LABIAL-ROJO`

**Validación:**
```sql
-- Debe haber 5 líneas:
-- - 1 línea bundle padre
-- - 3 líneas componentes (bundle tiene 3 componentes)
-- - 1 línea producto simple
SELECT COUNT(*) as total_lineas
FROM dbo.facturakardes
WHERE fac_sec = <fac_sec_generado>;
-- Esperado: 5

SELECT
    SUM(CASE WHEN kar_bundle_padre IS NULL AND art_bundle = 'S' THEN 1 ELSE 0 END) as bundles_padre,
    SUM(CASE WHEN kar_bundle_padre IS NOT NULL THEN 1 ELSE 0 END) as componentes,
    SUM(CASE WHEN kar_bundle_padre IS NULL AND art_bundle = 'N' THEN 1 ELSE 0 END) as normales
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
WHERE fk.fac_sec = <fac_sec_generado>;
-- Esperado: bundles_padre=1, componentes=3, normales=1
```

### Caso de Prueba 3: Actualización de Pedido (updateOrder)

**Setup:**
1. Crear orden en WooCommerce con 1× Bundle
2. Sincronizar con `POST /api/woo/sync-orders`
3. Editar orden en WooCommerce (cambiar cantidad a 2× Bundle)
4. Re-sincronizar

**Validación:**
```sql
-- Después de actualización, debe haber 4 líneas con cantidades × 2
SELECT kar_sec, art_cod, kar_uni, kar_pre_pub
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
WHERE fk.fac_sec = <fac_sec>;
-- Línea 1 (bundle): kar_uni = 2
-- Líneas 2-4 (componentes): kar_uni = 2 cada una
```

### Caso de Prueba 4: Verificación de Inventario

**Setup:**
1. Anotar stock inicial de componentes:
   ```sql
   SELECT art_sec, existencia FROM dbo.vwExistencias WHERE art_sec IN ('50', '51', '52');
   ```
2. Crear orden con 5× Bundle (3 componentes c/u)
3. Sincronizar

**Validación:**
```sql
-- Stock debe decrementar en 5 unidades por componente
SELECT art_sec, existencia FROM dbo.vwExistencias WHERE art_sec IN ('50', '51', '52');
-- Esperado: stock_inicial - 5 para cada componente
```

---

## 🚨 Puntos Críticos

### 1. Orden de Procesamiento
⚠️ La expansión de bundles **DEBE ocurrir ANTES** de iniciar la transaction.
✅ Implementado correctamente: expansión se hace fuera del loop de INSERT.

### 2. Precio de Componentes
⚠️ Los componentes **SIEMPRE deben tener `kar_pre_pub = 0`** para no duplicar el total.
✅ Implementado: `if (item._es_componente) { price: 0 }`

### 3. Cantidad de Componentes
⚠️ La cantidad del componente es: `cantidad_bundle × ConKarUni`
✅ Implementado: `quantity: item.quantity * comp.ConKarUni`

### 4. Referencia al Padre
⚠️ `kar_bundle_padre` debe apuntar al `art_sec` del bundle, NO al SKU.
✅ Implementado: `kar_bundle_padre: String(articleInfo)`

### 5. Compatibilidad con Productos Normales
⚠️ Productos normales deben seguir funcionando sin cambios.
✅ Implementado: `kar_bundle_padre: null` para artículos normales.

---

## 📝 Logging para Debugging

El código actualizado incluye logs detallados:

```
[BUNDLE DETECTED] Artículo COMBO-AMOR-2024 es un bundle, expandiendo componentes...
[BUNDLE] Encontrados 3 componentes para bundle COMBO-AMOR-2024
[BUNDLE] Total items a insertar (después de expansión): 4
[BUNDLE COMPONENT] Insertando componente de bundle, precios en $0
Insertando item: {
  facSec: 12345,
  itemId: 1,
  artSec: '50',
  quantity: 2,
  price: 0,
  esBundle: false,
  esComponente: true,
  kar_bundle_padre: '100'
}
```

---

## ✅ Checklist de Validación

Antes de aprobar el fix:

- [ ] Campo `kar_bundle_padre` existe en `facturakardes`
- [ ] Migración SQL ejecutada (`01_migracion_bundles.sql`)
- [ ] Prueba Caso 1: Pedido con solo bundle genera líneas correctas
- [ ] Prueba Caso 2: Pedido mixto genera líneas correctas
- [ ] Prueba Caso 3: Actualización de pedido funciona
- [ ] Prueba Caso 4: Inventario se decrementa correctamente
- [ ] Productos normales siguen funcionando sin cambios
- [ ] Logs muestran expansión de bundles
- [ ] No hay errores en consola de Node.js

---

## 🔄 Rollback Plan

Si se detectan problemas después del despliegue:

1. **Revertir cambios en código:**
   ```bash
   git revert <commit_hash_del_fix>
   ```

2. **Limpiar registros incorrectos en BD** (si es necesario):
   ```sql
   -- Eliminar componentes huérfanos (solo si hay inconsistencias)
   DELETE FROM dbo.facturakardes
   WHERE kar_bundle_padre IS NOT NULL
   AND fac_sec IN (SELECT fac_sec FROM dbo.factura WHERE fac_fecha > '2026-02-11');
   ```

3. **Re-sincronizar pedidos afectados:**
   - Marcar pedidos para re-sincronización
   - Ejecutar `POST /api/woo/sync-orders` nuevamente

---

**Última actualización:** 2026-02-11
**Estado:** ✅ Fix implementado, pendiente testing
**Archivos modificados:**
- `controllers/syncWooOrdersController.js` (2 funciones: `createOrder`, `updateOrder`)
