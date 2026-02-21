# FIX: Sincronización de Stock para Productos Variables

**Fecha:** 2026-02-21
**Última actualización:** 2026-02-21 (Corrección de parent_woo_id)
**Estado:** ✅ COMPLETADO
**Componente:** `utils/wooStockSync.js`
**Criticidad:** ALTA - Afecta sincronización de todas las variaciones

---

## PROBLEMA

Cuando se creaban compras con artículos variables (variaciones), el sistema no sincronizaba el stock a WooCommerce. Los logs mostraban:

```
[WARN] Artículo 9175-TONO-2 no tiene art_woo_id - omitiendo
[WARN] Artículo 9175-TONO-1 no tiene art_woo_id - omitiendo
[WARN] Ningún artículo tiene art_woo_id - no se sincronizará nada
```

### Causa Raíz

Las variaciones (productos hijos) no tienen `art_woo_id`. En lugar de eso, usan:
- `art_woo_variation_id` - ID de la variación en WooCommerce
- `art_parent_woo_id` - ID del producto padre en WooCommerce (obtenido a través de `art_sec_padre`)

La función `syncDocumentStockToWoo()` solo buscaba `art_woo_id`, ignorando las variaciones completamente.

---

## SOLUCIÓN IMPLEMENTADA

### 1. Actualización de la Query SQL

**Antes (INCORRECTO):**
```sql
SELECT
  a.art_sec, a.art_cod, a.art_woo_id,
  ISNULL(e.existencia, 0) AS existencia
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
WHERE f.fac_nro = @fac_nro
```

**Después (CORRECTO):**
```sql
SELECT
  a.art_sec, a.art_cod, a.art_woo_id, a.art_woo_type,
  a.art_woo_variation_id, padre.art_woo_id AS art_parent_woo_id,
  ISNULL(e.existencia, 0) AS existencia
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
WHERE f.fac_nro = @fac_nro
```

**Cambios críticos:**
- ✅ Agrega `art_woo_type` para identificar si es variación
- ✅ Agrega `art_woo_variation_id` para el ID de variación en WooCommerce
- ✅ **CRÍTICO:** Agrega `LEFT JOIN` a tabla `articulos` como padre para obtener su `art_woo_id` **RENOMBRADO** como `art_parent_woo_id`
  - ⚠️ **NO usar `padre.art_parent_woo_id`** - ese campo puede ser NULL
  - ✅ **USAR `padre.art_woo_id AS art_parent_woo_id`** - el ID de WooCommerce del padre es su propio `art_woo_id`

### 2. Lógica de Procesamiento Bifurcada

Se separó el procesamiento en dos flujos:

```javascript
const productUpdates = [];      // Productos simples
const variationUpdates = [];    // Variaciones (hijas)

for (const item of documentItems) {
  if (item.art_woo_type === 'variation') {
    // Validar IDs de variación
    if (!item.art_woo_variation_id || !item.art_parent_woo_id) {
      skippedCount++;
      continue;
    }
    variationUpdates.push({
      parentId: parseInt(item.art_parent_woo_id),
      variationId: parseInt(item.art_woo_variation_id),
      stock_quantity: newStock,
      art_cod: item.art_cod
    });
  } else {
    // Lógica existente para productos simples
    if (!item.art_woo_id) {
      skippedCount++;
      continue;
    }
    productUpdates.push({
      id: parseInt(item.art_woo_id),
      stock_quantity: newStock
    });
  }
}
```

### 3. Actualización de Variaciones en WooCommerce

Las variaciones **NO pueden** actualizarse en batch (WooCommerce API no lo soporta).

Se procesan individualmente con la ruta correcta:

```javascript
if (variationUpdates.length > 0) {
  for (const variation of variationUpdates) {
    const apiPath = `products/${variation.parentId}/variations/${variation.variationId}`;
    await wcApi.put(apiPath, {
      stock_quantity: variation.stock_quantity
    });
    successCount++;
  }
}
```

### 4. Actualización de `syncArticleStockToWoo()`

También se actualizó la función para sincronizar un artículo individual.

**Detección de tipo:**
```javascript
if (article.art_woo_type === 'variation') {
  // Usar ruta de variación: products/{parentId}/variations/{variationId}
  const apiPath = `products/${article.art_parent_woo_id}/variations/${article.art_woo_variation_id}`;
  await wcApi.put(apiPath, { stock_quantity: newStock });
  // ...
} else {
  // Usar ruta de producto: products/{productId}
  await wcApi.put(`products/${article.art_woo_id}`, { stock_quantity: newStock });
}
```

---

## CAMBIOS EN CÓDIGO

### Archivo: `utils/wooStockSync.js`

**Función `syncDocumentStockToWoo()`:**
- ✅ Actualización de query SQL (líneas ~112-127)
- ✅ Lógica bifurcada para productos vs variaciones (líneas ~148-185)
- ✅ Procesamiento de variaciones individual (líneas ~247-276)
- ✅ Lógica de éxito mejorada (líneas ~278-289)

**Función `syncArticleStockToWoo()`:**
- ✅ Query mejorada para obtener info de variación (líneas ~290-305)
- ✅ Detección de tipo y manejo bifurcado (líneas ~320-357)

---

## FLUJOS DE CASOS DE USO

### Caso 1: Compra con Producto Simple
1. Sistema obtiene `art_woo_id` = 100 (producto simple)
2. `art_woo_type` = 'simple' o NULL
3. Se agrega a `productUpdates`
4. Se actualiza en batch: `POST /products/batch`

### Caso 2: Compra con Variación
1. Sistema obtiene:
   - `art_woo_type` = 'variation'
   - `art_woo_variation_id` = 505
   - `art_parent_woo_id` = 500 (del padre)
2. Se agrega a `variationUpdates`
3. Se actualiza individual: `PUT /products/500/variations/505`

### Caso 3: Compra Mixta (Producto + Variación)
1. Producto simple → `productUpdates` → batch update
2. Variación → `variationUpdates` → individual update
3. Respuesta muestra ambos tipos: `successCount`, `errorCount`, etc.

---

## RESPUESTA DE SINCRONIZACIÓN

Ejemplo de respuesta exitosa:

```json
{
  "success": true,
  "synced": true,
  "fac_nro": "COM00062",
  "totalItems": 3,
  "successCount": 3,
  "errorCount": 0,
  "skippedCount": 0,
  "duration": "1.23s",
  "batchesProcessed": 1,
  "messages": [
    "WooCommerce: Producto 100 actualizado con stock 50",
    "WooCommerce: Variación 9175-TONO-1 actualizada con stock 25",
    "WooCommerce: Variación 9175-TONO-2 actualizada con stock 30"
  ]
}
```

---

## VALIDACIONES

✅ **Productos simples:**
- Requieren `art_woo_id` (no NULL)
- Actualización en batch (más eficiente)

✅ **Variaciones:**
- Requieren `art_woo_variation_id` (no NULL)
- Requieren `art_parent_woo_id` (no NULL)
- Actualización individual (limitación de WooCommerce API)

✅ **Omisiones:**
- Si falta cualquier ID necesario, se registra como WARN y se incrementa `skippedCount`
- No bloqueamos la sincronización, continuamos con los demás artículos

---

## TESTING

### Test 1: Sincronizar Compra con Variaciones
```bash
curl -X POST http://localhost:3000/api/compras \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nit_sec": "123",
    "fac_fec": "2026-02-21",
    "detalles": [
      {
        "art_sec": "9175-TONO-1",
        "cantidad": 25,
        "costo_unitario": 5000
      },
      {
        "art_sec": "9175-TONO-2",
        "cantidad": 30,
        "costo_unitario": 5000
      }
    ]
  }'
```

Revisar logs:
```
[INFO] Iniciando sincronización de stock para documento COM00062
[INFO] Procesando 2 artículos
[INFO] Procesando 0 lotes de 10 productos simples  <- No hay productos simples
[INFO] Procesando 2 variaciones                   <- Variaciones procesadas
[INFO] Variación 9175-TONO-1 actualizada: stock = 25
[INFO] Variación 9175-TONO-2 actualizada: stock = 30
```

---

## COMPATIBILIDAD

✅ No rompe cambios existentes:
- Productos simples siguen siendo procesados igual
- WooCommerce sync sigue siendo silencioso en compras
- Respuesta mantiene misma estructura

✅ Integración con:
- `controllers/compraController.js` - Llamadas a `syncDocumentStockToWoo()`
- `controllers/inventarioController.js` - Llamadas a `syncArticleStockToWoo()`
- `jobs/syncWooOrders.js` - Si usa estas funciones

---

## ⚠️ DETALLES CRÍTICOS PARA FUTURAS REVISIONES

### Campo correcto para obtener el parent_woo_id

Esta es la fuente más común de errores al sincronizar variaciones:

```javascript
// ❌ INCORRECTO - art_parent_woo_id es un campo en el artículo hijo
padre.art_parent_woo_id  // Puede ser NULL o no existe

// ✅ CORRECTO - art_woo_id del padre (vía JOIN)
padre.art_woo_id AS art_parent_woo_id
```

**Por qué es importante:**
- Las variaciones (productos hijos) NO tienen `art_woo_id`
- Las variaciones tienen `art_woo_variation_id` (el ID de la variación)
- Las variaciones necesitan el ID del padre en WooCommerce
- El ID del padre en WooCommerce está en el campo `art_woo_id` del artículo padre
- Se obtiene via `LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre`

**Patrón correcto usado en otros módulos:**
Este mismo patrón se usa correctamente en:
- `jobs/updateWooOrderStatusAndStock.js` (línea 344)
  ```javascript
  p.art_woo_id AS parent_woo_id
  FROM dbo.articulos a
  LEFT JOIN dbo.articulos p ON a.art_sec_padre = p.art_sec
  ```

---

## NOTAS

1. **Variaciones sin WooCommerce:** Si una variación aún no se sincronizó a WooCommerce (no tiene IDs), se salta pero no bloquea el proceso.

2. **Performance:** Variaciones se actualizan individual (no batch) porque WooCommerce API no soporta variaciones en batch. Esto es normal y no es un problema de performance significativo.

3. **Consistencia entre módulos:** Asegúrese de que cualquier sincronización nueva con WooCommerce use el mismo patrón de JOIN para obtener el parent_woo_id:
   ```sql
   LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
   padre.art_woo_id AS art_parent_woo_id  -- NO padre.art_parent_woo_id
   ```

4. **Testing de variaciones:** Siempre verificar con:
   ```sql
   SELECT
     a.art_sec, a.art_cod, a.art_woo_type, a.art_woo_variation_id,
     a.art_sec_padre, padre.art_woo_id AS parent_woo_id
   FROM dbo.articulos a
   LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
   WHERE a.art_woo_type = 'variation'
   ```
   - Todas las columnas deben ser NOT NULL (excepto art_sec_padre en padres)
   - `parent_woo_id` debe ser el WooCommerce ID del padre
