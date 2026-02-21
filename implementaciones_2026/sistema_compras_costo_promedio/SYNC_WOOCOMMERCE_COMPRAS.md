# WooCommerce Stock Sync en Compras

**Fecha:** 2026-02-21
**Componente:** `controllers/compraController.js` + `utils/wooStockSync.js`
**Estado:** IMPLEMENTADO

---

## FLUJO DE SINCRONIZACIÓN

### 1. Crear Compra (POST /api/compras)

```javascript
POST /api/compras
{
  "nit_sec": "123",
  "fac_fec": "2026-02-21",
  "detalles": [
    { "art_sec": "9175", "cantidad": 50, "costo_unitario": 1000 },
    { "art_sec": "9175-TONO-1", "cantidad": 25, "costo_unitario": 5000 }
  ]
}
```

**Flujo:**
1. `crearCompra()` registra la compra en BD
2. Obtiene `fac_nro` (ej: COM00062)
3. **Llama a `syncDocumentStockToWoo(fac_nro, { silent: true })`**
4. Retorna respuesta con `woo_sync` object

**Logs esperados:**
```
[COMPRA-SYNC] Iniciando sincronización de stock después de crear compra
  fac_nro: COM00062
  total_items: 2
[WOO-SYNC] Iniciando sincronización de stock para documento COM00062
[WOO-SYNC] Procesando 2 artículos
[WOO-SYNC] Procesando 1 lotes de 10 productos simples
[WOO-SYNC] Producto 100 actualizado: stock = 50
[WOO-SYNC] Variación 9175-TONO-1 actualizada: stock = 25
[COMPRA-SYNC] Resultado de sincronización: { success: true, synced: true, ... }
```

---

### 2. Actualizar Compra (PUT /api/compras/:fac_nro)

#### Caso 2A: Actualizar cantidad de detalle existente

```javascript
PUT /api/compras/COM00062
{
  "detalles": [
    { "kar_sec": 1, "cantidad": 100 }  // Aumenta de 50 a 100
  ]
}
```

**Flujo:**
1. `modificarCompra()` actualiza detalle en BD
2. Retorna `detalles_actualizados` array
3. **Si hay cambios, llama a `syncDocumentStockToWoo(fac_nro, { silent: true })`**
4. Retorna respuesta con `woo_sync` object

**Validación en controller:**
```javascript
const tieneDetallesCambiados =
  (resultado.detalles_actualizados && resultado.detalles_actualizados.length > 0) ||
  (resultado.detalles_nuevos_insertados && resultado.detalles_nuevos_insertados.length > 0);
if (tieneDetallesCambiados) {
  wooSyncResult = await syncDocumentStockToWoo(fac_nro, { silent: true });
}
```

**Logs esperados:**
```
[COMPRA-SYNC] Iniciando sincronización de stock después de actualizar compra
  fac_nro: COM00062
  detalles_actualizados: 1
  detalles_nuevos: 0
[WOO-SYNC] Iniciando sincronización de stock para documento COM00062
[WOO-SYNC] Procesando 2 artículos
[WOO-SYNC] Producto 100 actualizado: stock = 100  ← Stock nuevo (50 → 100)
```

#### Caso 2B: Agregar nuevo detalle a compra existente

```javascript
PUT /api/compras/COM00062
{
  "detalles_nuevos": [
    { "art_sec": "9200", "cantidad": 20, "costo_unitario": 2000 }
  ]
}
```

**Flujo:**
1. `modificarCompra()` inserta nuevo detalle en BD (genera nuevo kar_sec)
2. Retorna `detalles_nuevos_insertados` array
3. **Si hay cambios, llama a `syncDocumentStockToWoo(fac_nro, { silent: true })`**
4. Retorna respuesta con `woo_sync` object

**Logs esperados:**
```
[COMPRA-SYNC] Iniciando sincronización de stock después de actualizar compra
  fac_nro: COM00062
  detalles_actualizados: 0
  detalles_nuevos: 1
[WOO-SYNC] Iniciando sincronización de stock para documento COM00062
[WOO-SYNC] Procesando 3 artículos  ← Ahora hay 3 (se agregó el nuevo)
[WOO-SYNC] Producto 200 actualizado: stock = 20  ← Nuevo producto sincronizado
```

---

## RESPUESTA JSON

### Respuesta de Crear/Actualizar Compra

```json
{
  "success": true,
  "fac_nro": "COM00062",
  "message": "Compra registrada exitosamente",
  "data": {
    "fac_sec": 1234,
    "fac_nro": "COM00062",
    "total_items": 3,
    "total_valor": 155000,
    "detalles_actualizacion": [...]
  },
  "detalles_actualizados": [
    {
      "kar_sec": 1,
      "art_sec": "9175",
      "cantidad_original": 50,
      "cantidad_nueva": 100,
      "costo_original": 1000,
      "costo_nuevo": 1000,
      "costo_promedio_anterior": 1200,
      "costo_promedio_nuevo": 1150
    }
  ],
  "detalles_nuevos_insertados": [
    {
      "kar_sec": 3,
      "art_sec": "9200",
      "cantidad": 20,
      "costo_unitario": 2000,
      "total": 40000,
      "costo_promedio_anterior": 0,
      "costo_promedio_nuevo": 2000
    }
  ],
  "woo_sync": {
    "success": true,
    "synced": true,
    "fac_nro": "COM00062",
    "totalItems": 3,
    "successCount": 3,
    "errorCount": 0,
    "skippedCount": 0,
    "duration": "0.84s",
    "batchesProcessed": 1,
    "messages": [
      "WooCommerce: Producto 100 actualizado con stock 100",
      "WooCommerce: Variación 9175-TONO-1 actualizada con stock 25",
      "WooCommerce: Producto 200 actualizado con stock 20"
    ]
  }
}
```

---

## VALIDACIONES Y CASOS ESPECIALES

### ❌ Caso: Artículo sin art_woo_id (producto no sincronizado)

Si un artículo no tiene `art_woo_id`, se omite:

```
[WOO-SYNC] Artículo 9300 (art_woo_type: simple) no tiene art_woo_id - omitiendo
  art_sec: 9300
  art_woo_id: null
  art_woo_type: simple
```

**Respuesta en `woo_sync`:**
```json
{
  "messages": [
    "Artículo 9300 no sincronizado con WooCommerce (sin art_woo_id)"
  ],
  "skippedCount": 1,
  "successCount": 2
}
```

### ❌ Caso: Variación sin IDs completos

Si una variación no tiene `art_woo_variation_id` o `art_parent_woo_id`:

```
[WOO-SYNC] Variación 9175-TONO-3 no tiene art_woo_variation_id o art_parent_woo_id - omitiendo
```

---

### ✅ Caso: WooCommerce no configurado

Si faltan env vars (`WC_URL`, etc.):

```
[WOO-SYNC] Faltan variables de entorno de WooCommerce
```

**En modo silencioso, retorna:**
```json
{
  "success": false,
  "synced": false,
  "reason": "WooCommerce no configurado",
  "successCount": 0,
  "errorCount": 0,
  "skippedCount": 0
}
```

**No bloquea la compra - el `woo_sync` es informativo**

---

## DEBUGGING

### 1. Ver logs de sincronización

```bash
pm2 logs api_pretty | grep "COMPRA-SYNC\|WOO-SYNC"
```

### 2. Verificar que los artículos tienen IDs en BD

```sql
SELECT
  art_sec, art_cod, art_woo_id, art_woo_type,
  art_woo_variation_id, art_parent_woo_id
FROM dbo.articulos
WHERE art_sec IN ('9175', '9175-TONO-1', '9200')
```

### 3. Verificar que la compra se creó correctamente

```sql
SELECT
  f.fac_nro, f.fac_sec, f.fac_est_fac,
  fk.kar_sec, fk.art_sec, fk.kar_uni, fk.kar_pre
FROM dbo.factura f
INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
WHERE f.fac_nro = 'COM00062'
ORDER BY fk.kar_sec
```

### 4. Verificar stock en vwExistencias

```sql
SELECT art_sec, existencia
FROM dbo.vwExistencias
WHERE art_sec IN ('9175', '9175-TONO-1', '9200')
```

---

## PROBLEMA COMÚN: "Ningún artículo tiene art_woo_id"

**Síntoma:**
```
[WOO-SYNC] Ningún artículo tiene art_woo_id/art_woo_variation_id - no se sincronizará nada
```

**Causas posibles:**

1. **Los artículos aún no se sincronizaron a WooCommerce**
   - Artículos nuevos créados en el sistema pero no en WooCommerce
   - Solución: Ir a módulo de artículos → Sincronizar a WooCommerce

2. **Artículos sin definir como productos en WooCommerce**
   - `art_woo_id` está NULL en la BD
   - Solución: Crear el artículo en WooCommerce primero

3. **Variación sin producto padre en WooCommerce**
   - Variación tiene IDs pero el padre no tiene `art_parent_woo_id`
   - Solución: Sincronizar el producto padre primero

---

## INTEGRACIÓN CON OTROS MÓDULOS

### `jobs/syncWooOrders.js`
Importa pedidos de WooCommerce y crea órdenes locales. Al crear estas órdenes (tipo VTA), **NO** ejecuta `syncDocumentStockToWoo()` porque:
- El stock entra desde WooCommerce (no sale)
- Se usa un flujo diferente

### `controllers/inventarioController.js`
Si hay ajustes de inventario que afecten compras, debe llamar a:
```javascript
const { syncArticleStockToWoo } = require('../utils/wooStockSync');
await syncArticleStockToWoo(art_sec, { silent: true });
```

---

## PRÓXIMAS MEJORAS

1. **Webhook de WooCommerce** - Stock actualizado en WooCommerce, sincronizar de vuelta a BD
2. **Cola de sincronización** - Si falla WooCommerce, reintentar después
3. **Caché de IDs** - No buscar `art_woo_id` cada vez, guardar en caché
