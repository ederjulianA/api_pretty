# SPEC: Cotizar Artículos Sin Saldo

## Metadata
- **Tipo:** FEATURE
- **Fecha:** 26/04/2026
- **Prioridad estimada:** Alta
- **Complejidad estimada:** Baja
- **Requiere migración BD:** No
- **Impacta WooCommerce sync:** No

## Resumen Ejecutivo

Se requiere ajustar el flujo de creación y actualización de órdenes en el backend para distinguir entre documentos tipo `COT` (cotización) y `VTA` (venta). Las cotizaciones no deben validar stock porque no mueven kardex; las ventas deben tener una segunda línea de defensa en el backend que rechace artículos sin existencia, independientemente de si el frontend ya validó.

Los cambios se concentran únicamente en `controllers/orderController.js` — dos modificaciones quirúrgicas sin impacto en BD ni en WooCommerce.

## Estado Actual del Sistema

### Flujo actual en `createCompleteOrder` (línea 66)
1. Valida campos requeridos (`nit_sec`, `detalles`)
2. Llama `await validarBundles(detalles)` — **sin distinguir tipo de documento**
3. Delega al model para crear la orden

### Flujo actual en `updateOrderEndpoint` (línea 45)
1. Valida campos requeridos
2. Delega directamente al model `updateOrder(...)` — **sin ninguna validación de stock**

### Problema 1 — `validarBundles` no es type-aware
`validarBundles()` (línea 11) recibe solo `detalles`, sin saber el tipo de documento. En línea 75, se invoca para **todo tipo**, incluyendo `COT`. Esto bloquea cotizaciones de bundles sin stock.

### Problema 2 — Sin validación backend para VTA
`updateOrderEndpoint` no llama `validarBundles` ni ninguna otra validación de stock. Tampoco existe ninguna función que valide existencias de artículos simples vía `dbo.vwExistencias`. Una llamada directa a la API puede crear una VTA con artículos sin stock.

### Archivos Relevantes Identificados
| Archivo | Rol | Impacto |
|---------|-----|---------|
| `controllers/orderController.js` | Lógica de negocio de órdenes | Alto |
| `models/orderModel.js` | Queries SQL de creación/actualización | Ninguno — no se modifica |
| `models/bundleModel.js` | `validateBundleStock()` — validación de stock de bundles | Referenciado, sin cambios |
| `db.js` | Pool de conexión + tipos SQL | Referenciado, sin cambios |

## Requerimientos Funcionales

1. `createCompleteOrder` debe omitir `validarBundles()` cuando `fac_tip_cod === 'COT'`.
2. `createCompleteOrder` debe invocar `validarExistenciasVTA()` cuando `fac_tip_cod === 'VTA'`.
3. `updateOrderEndpoint` debe invocar `validarExistenciasVTA()` cuando `fac_tip_cod === 'VTA'`.
4. `validarExistenciasVTA()` debe consultar `dbo.vwExistencias` y rechazar si algún artículo padre tiene `existencia <= 0`.
5. Artículos componentes de bundle (`kar_bundle_padre != null`) deben excluirse de la validación individual.
6. El error de existencia insuficiente debe retornar HTTP 400 (no 500) con mensaje descriptivo que liste los artículos sin stock.
7. Las queries deben estar completamente parametrizadas — sin interpolación de strings en valores.

## Requerimientos No Funcionales
- **Performance:** La validación de existencias debe hacerse en un único `SELECT` con `IN (...)` parametrizado, no en un loop de queries individuales.
- **Seguridad:** Queries siempre parametrizadas con `sql.VarChar(30)` para `art_sec`.
- **Logging:** Los errores de validación deben loguearse con `console.error` antes de retornar.
- **Transaccionalidad:** Las validaciones ocurren pre-transacción — no hay rollback que hacer si fallan.

## Análisis Técnico

### Cambios en BD
Ninguno. Se usa `dbo.vwExistencias` ya existente.

### Cambios en Capa Model
Ninguno. La validación de existencias se implementa directamente en el controller (como lo hace `validarBundles`) ya que es pre-transacción y no requiere lógica del model.

### Cambios en Capa Controller — `controllers/orderController.js`

#### Cambio 1 — `validarBundles`: condicionar por `fac_tip_cod`

**Opción A (recomendada) — condicionar en el sitio de llamada:**
```javascript
// En createCompleteOrder, línea 75 actual:
// ANTES:
await validarBundles(detalles);

// DESPUÉS:
if (fac_tip_cod !== 'COT') {
  await validarBundles(detalles);
}
```
Esta opción es preferible porque no cambia la firma de `validarBundles` y mantiene la función con responsabilidad única (solo valida, no decide si debe validar).

#### Cambio 2 — Nueva función `validarExistenciasVTA`

**Contexto confirmado:**
- El POS **no** envía `kar_bundle_padre` en el payload — solo envía artículos simples y bundles padre.
- La expansión bundle → componentes la hace el backend internamente en `expandirBundles()`, ya dentro de la transacción.
- El filtro correcto es excluir bundles padre (`art_bundle = 'S'`) directamente en SQL, ya que su stock se valida por componentes a través de `validarBundles()`.
- Solo existe una bodega → no se necesita filtro `bod_sec`.

```javascript
const validarExistenciasVTA = async (detalles) => {
  if (!detalles?.length) return;
  const pool = await poolPromise;

  const artSecs = [...new Set(detalles.map(d => d.art_sec).filter(Boolean))];
  if (!artSecs.length) return;

  const request = pool.request();
  artSecs.forEach((sec, i) => request.input(`p${i}`, sql.VarChar(30), sec));

  // Excluir bundles padre (art_bundle = 'S') — su stock lo valida validarBundles() por componentes
  const result = await request.query(`
    SELECT a.art_sec, a.art_cod, a.art_nom, ISNULL(e.existencia, 0) AS existencia
    FROM dbo.articulos a
    LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
    WHERE a.art_sec IN (${artSecs.map((_, i) => `@p${i}`).join(',')})
      AND ISNULL(a.art_bundle, 'N') != 'S'
      AND ISNULL(e.existencia, 0) <= 0
  `);

  if (result.recordset.length > 0) {
    const lista = result.recordset
      .map(r => `${r.art_nom} (${r.art_cod})`)
      .join(', ');
    const err = new Error(
      `No se puede generar la factura. Los siguientes artículos no tienen existencia: ${lista}`
    );
    err.statusCode = 400;
    throw err;
  }
};
```

#### Cambio 3 — Invocar `validarExistenciasVTA` en `createCompleteOrder`

```javascript
// Después de la validación de bundles (o en lugar de ella si es COT):
if (fac_tip_cod === 'VTA') {
  await validarExistenciasVTA(detalles);
}
```

#### Cambio 4 — Invocar `validarExistenciasVTA` en `updateOrderEndpoint`

```javascript
// Al inicio del try, antes de llamar updateOrder:
if (fac_tip_cod === 'VTA') {
  await validarExistenciasVTA(detalles);
}
```

#### Cambio 5 — HTTP 400 en `updateOrderEndpoint`

El `catch` actual retorna `res.status(500)` para todos los errores. El error de `validarExistenciasVTA` debe retornar 400. Se puede diferenciar con un campo en el error o ajustar el catch para detectar errores de validación:

```javascript
} catch (error) {
  console.error("Error al actualizar el pedido:", error);
  const statusCode = error.isValidationError ? 400 : 500;
  return res.status(statusCode).json({ success: false, error: error.message });
}
```

O más simple: lanzar el error con una propiedad identificadora desde `validarExistenciasVTA`:
```javascript
const err = new Error(`No se puede generar...`);
err.statusCode = 400;
throw err;
```
Y en el catch:
```javascript
return res.status(error.statusCode || 500).json({ success: false, error: error.message });
```

> **Nota:** `createCompleteOrder` también usa `res.status(500)` en el catch — mismo ajuste aplica ahí.

### Nuevos Endpoints
Ninguno. Son cambios internos a endpoints existentes.

### Principios SOLID Aplicados
- **SRP:** `validarBundles` sigue validando solo bundles; la nueva `validarExistenciasVTA` valida solo existencias simples — cada función tiene una sola responsabilidad.
- **OCP:** `validarBundles` no se modifica internamente; se extiende el comportamiento condicionando su invocación externamente.
- **DIP:** Ambas funciones de validación dependen de `poolPromise` (abstracción del pool), no de una conexión concreta.

## Plan de Implementación

### Fase 1: Validación de bundles para COT
- [ ] En `createCompleteOrder` (línea 75), envolver `await validarBundles(detalles)` con `if (fac_tip_cod !== 'COT')`

### Fase 2: Función `validarExistenciasVTA`
- [ ] Agregar la función `validarExistenciasVTA` antes de `updateOrderEndpoint` en el archivo
- [ ] Ajustar el error para incluir `statusCode = 400`

### Fase 3: Invocar en `createCompleteOrder`
- [ ] Agregar `if (fac_tip_cod === 'VTA') await validarExistenciasVTA(detalles)` después del bloque de bundles
- [ ] Ajustar catch de `createCompleteOrder` para usar `error.statusCode || 500`

### Fase 4: Invocar en `updateOrderEndpoint`
- [ ] Agregar `if (fac_tip_cod === 'VTA') await validarExistenciasVTA(detalles)` al inicio del try
- [ ] Ajustar catch de `updateOrderEndpoint` para usar `error.statusCode || 500`

## Casos de Prueba Propuestos (Postman)

### Happy Path
1. **COT con bundle sin stock — debe crear**
   - Request: `POST /api/orders` con `fac_tip_cod: "COT"`, bundle con stock = 0
   - Expected: `201` — orden creada exitosamente

2. **VTA con todos los artículos con stock — debe crear**
   - Request: `POST /api/orders` con `fac_tip_cod: "VTA"`, artículos con existencia > 0
   - Expected: `201` — orden creada exitosamente

3. **COT con artículos simples sin stock — debe crear**
   - Request: `POST /api/orders` con `fac_tip_cod: "COT"`, artículo con existencia = 0
   - Expected: `201` — orden creada (COT no valida existencias)

### Edge Cases
1. **VTA con mezcla de artículos con y sin stock**
   - Expected: `400` con lista de los artículos sin stock en el mensaje

2. **VTA con bundle — componentes sin stock**
   - Expected: `400` desde `validarBundles` (camino ya existente, no afectado)

3. **VTA al actualizar orden (`PUT`) con artículo sin stock**
   - Request: `PUT /api/orders/:fac_nro` con `fac_tip_cod: "VTA"`, artículo sin existencia
   - Expected: `400` con mensaje descriptivo

### Error Cases
1. **VTA con artículos sin existencia**
   - Expected: `400` — `"No se puede generar la factura. Los siguientes artículos no tienen existencia: ..."`

2. **VTA con bundle con stock insuficiente**
   - Expected: `400` (o 500 si el catch no se ajusta) — `"Stock insuficiente para el bundle..."`
   - **Acción:** Asegurar que el catch de ambos endpoints retorne 400 para errores de validación

## ✅ Gaps Resueltos

| Gap | Respuesta |
|-----|-----------|
| ¿`vwExistencias` filtra por bodega? | Solo existe 1 bodega — no se necesita filtro `bod_sec` |
| ¿Frontend envía `kar_bundle_padre`? | **No.** El POS solo envía artículos simples y bundles padre. El filtro correcto es `art_bundle != 'S'` en SQL |
| ¿`PED` o `AJT` deben validar existencias? | No están en scope. `PED` no mueve kardex; `AJT` son ajustes fuera de este flujo |

### Riesgos Residuales
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `catch` retorna 500 para errores de validación y el frontend no puede diferenciarlo | Alta | Bajo | Agregar `err.statusCode = 400` en `validarExistenciasVTA` y usar `error.statusCode \|\| 500` en los catch |

## Dependencias
- [x] ~~Confirmar estructura de `dbo.vwExistencias`~~ — sin bodegas, no aplica
- [x] ~~Confirmar campo `kar_bundle_padre`~~ — no existe en payload; filtrar por `art_bundle` en SQL
- [x] ~~Confirmar scope de tipos de documento~~ — solo VTA

## Estimación
- **Implementación:** 1–2 horas
- **Testing manual (Postman):** 1 hora
- **Total:** 2–3 horas
