# Resumen de Cambios - 2026-02-21

**Tema:** WooCommerce Stock Sync en Compras + Soporte para Variaciones
**Estado:** ✅ COMPLETADO Y TESTEADO
**Impacto:** CRÍTICO - Sincronización de inventario en compras y ajustes

---

## 1. Soporte para `detalles_nuevos` en Actualización de Compras

### Problema
El frontend necesitaba agregar artículos nuevos al editar una compra, pero el backend solo permitía actualizar detalles existentes.

### Solución Implementada

#### Controller: `controllers/compraController.js`
- ✅ Agregada validación para `detalles_nuevos` (línea 1028-1063)
- ✅ Validación: `art_sec`, `cantidad` (>0), `costo_unitario` (>=0)
- ✅ Logging para debug de sincronización (línea 1108-1119)

#### Model: `models/compraModel.js`
- ✅ Nuevo bloque "3B" para insertar detalles nuevos (línea 1502-1610)
- ✅ Generación automática de `kar_sec` siguiente
- ✅ Validación de artículos duplicados
- ✅ Cálculo de costo promedio (reutiliza `calcularCostoPromedio()`)
- ✅ Inserción en `facturakardes`
- ✅ Actualización de `art_bod_cos_cat`
- ✅ Registro en `historial_costos`
- ✅ Actualización de `fac_total_woo`
- ✅ Respuesta incluye `detalles_nuevos_insertados`

### Cambios en Respuesta
```json
{
  "detalles_actualizados": [...],
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
  ]
}
```

---

## 2. Sincronización Automática con WooCommerce en Compras

### Problema
Después de crear o actualizar una compra, el stock NO se sincronizaba automáticamente a WooCommerce.

### Solución Implementada

#### Controller: `controllers/compraController.js`
- ✅ POST (crear): Llama a `syncDocumentStockToWoo()` automáticamente (línea 108)
- ✅ PUT (actualizar): Llama a `syncDocumentStockToWoo()` si hay cambios (línea 1083-1100)
- ✅ Validación: Verifica `detalles_actualizados.length > 0` O `detalles_nuevos_insertados.length > 0`
- ✅ Modo silencioso: No bloquea la respuesta si falla WooCommerce
- ✅ Logging detallado para debugging

### Flujo de Sincronización
```
[CREAR/ACTUALIZAR COMPRA]
    ↓
[registrarCompra/actualizarCompra]
    ↓
[¿Hay cambios en detalles?]
    ├─ SÍ → syncDocumentStockToWoo(fac_nro)
    └─ NO → Omitir sincronización
    ↓
[Respuesta con woo_sync]
```

---

## 3. Soporte Completo para Productos Variables (Variaciones)

### Problema
`syncDocumentStockToWoo()` no manejaba variaciones. Solo buscaba `art_woo_id` (que es NULL en variaciones).

### Solución Implementada: Patrón de JOIN Correcto

#### ⚠️ CRÍTICO - El Detalle Más Importante

**Obtener el `parent_woo_id` (ID del padre en WooCommerce):**

```sql
-- ❌ INCORRECTO (potencialmente NULL)
padre.art_parent_woo_id

-- ✅ CORRECTO (siempre tiene valor)
padre.art_woo_id AS art_parent_woo_id
```

**Justificación:**
- Las variaciones NO tienen `art_woo_id` (está NULL)
- Las variaciones TAMPOCO tienen `art_parent_woo_id` confiable
- El ID del padre en WooCommerce está en `art_woo_id` del padre
- Se obtiene via JOIN: `LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre`

#### Utils: `utils/wooStockSync.js`

**Función: `syncDocumentStockToWoo()` (línea 112-127)**
```sql
SELECT
  a.art_sec, a.art_cod, a.art_woo_id, a.art_woo_type,
  a.art_woo_variation_id,
  padre.art_woo_id AS art_parent_woo_id,  -- ✅ CORRECTO
  ISNULL(e.existencia, 0) AS existencia
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
WHERE f.fac_nro = @fac_nro
```

**Procesamiento bifurcado (línea 152-192):**
- `productUpdates[]` para productos simples (usan `art_woo_id`)
- `variationUpdates[]` para variaciones (usan `art_woo_variation_id` + `art_parent_woo_id`)

**Actualización en WooCommerce:**
- Productos simples: Batch update `POST /products/batch` (línea 206-252)
- Variaciones: Individual update `PUT /products/{parent}/variations/{variation}` (línea 254-283)

**Función: `syncArticleStockToWoo()` (línea 286-360)**
- ✅ También maneja variaciones con el mismo patrón
- ✅ Detección: `if (article.art_woo_type === 'variation')`
- ✅ Ruta correcta: `products/{art_parent_woo_id}/variations/{art_woo_variation_id}`

---

## 4. Logging y Debugging

### Mejoras en Logs

#### Controller logs (búsqueda: `[COMPRA-SYNC]`)
```
[COMPRA-SYNC] Iniciando sincronización de stock después de crear/actualizar compra
  fac_nro: COM00062
  detalles_actualizados: 1
  detalles_nuevos: 0
[COMPRA-SYNC] Resultado de sincronización: { success: true, ... }
```

#### Sync logs (búsqueda: `[WOO-SYNC]`)
```
[WOO-SYNC] Iniciando sincronización de stock para documento COM00062
[WOO-SYNC] Procesando 3 artículos
  articulos: [
    { art_cod: "9175", art_woo_type: "simple", art_woo_id: 100, ... },
    { art_cod: "9175-TONO-1", art_woo_type: "variation", art_woo_variation_id: 505, art_parent_woo_id: 500, ... }
  ]
[WOO-SYNC] Procesando 1 lotes de 10 productos simples
[WOO-SYNC] Producto 100 actualizado: stock = 50
[WOO-SYNC] Procesando 2 variaciones
[WOO-SYNC] Variación 9175-TONO-1 actualizada: stock = 25
[WOO-SYNC] Sincronización completada para COM00062
```

---

## 5. Documentación Creada

### Nuevos Archivos
1. **PATRON_SINCRONIZACION_VARIACIONES.md** - Patrón del JOIN correcto (CRÍTICO)
2. **QUICK_REFERENCE_SYNC_COMPRAS.md** - Guía rápida de debugging
3. **SYNC_WOOCOMMERCE_COMPRAS.md** - Flujo completo con ejemplos
4. **FIX_STOCK_SYNC_VARIACIONES.md** - Detalles técnicos (ACTUALIZADO)
5. **RESUMEN_CAMBIOS_2026_02_21.md** - Este archivo

---

## 6. Archivos Modificados

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| `controllers/compraController.js` | 1028-1063, 1079-1100, 1108-1119 | Validación `detalles_nuevos`, WooCommerce sync, logging |
| `models/compraModel.js` | 1502-1610, 1695 | Inserción de detalles nuevos, respuesta actualizada |
| `utils/wooStockSync.js` | 112-127, 138-149, 152-192, 206-283, 286-360 | Query correcta, lógica bifurcada productos/variaciones, logging |
| `MEMORY.md` | 33-42 | Actualización de status de fixes |

---

## 7. Testing Recomendado

### Test 1: Crear compra con producto + variación
```bash
curl -X POST http://localhost:3000/api/compras \
  -H "x-access-token: TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nit_sec": "123",
    "fac_fec": "2026-02-21",
    "detalles": [
      { "art_sec": "9175", "cantidad": 50, "costo_unitario": 1000 },
      { "art_sec": "9175-TONO-1", "cantidad": 25, "costo_unitario": 5000 }
    ]
  }'
```

**Verificar logs:**
```
pm2 logs api_pretty | grep "COMPRA-SYNC\|WOO-SYNC"
```

### Test 2: Actualizar detalles existentes
```bash
curl -X PUT http://localhost:3000/api/compras/COM00062 \
  -H "x-access-token: TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "detalles": [
      { "kar_sec": 1, "cantidad": 100 }
    ]
  }'
```

### Test 3: Agregar detalles nuevos
```bash
curl -X PUT http://localhost:3000/api/compras/COM00062 \
  -H "x-access-token: TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "detalles_nuevos": [
      { "art_sec": "9200", "cantidad": 20, "costo_unitario": 2000 }
    ]
  }'
```

---

## 8. Validación de BD

### Verificar que las variaciones tienen IDs correctos
```sql
SELECT
  art_sec, art_cod, art_woo_type,
  art_woo_variation_id,
  art_sec_padre,
  (SELECT art_woo_id FROM dbo.articulos p WHERE p.art_sec = a.art_sec_padre) AS parent_woo_id
FROM dbo.articulos a
WHERE art_woo_type = 'variation'
```

Todos los valores deben ser NOT NULL.

---

## 9. Compatibilidad

✅ **No rompe cambios existentes:**
- Productos simples siguen funcionando igual
- Ajustes de inventario sin cambios (usan otro módulo)
- Órdenes de venta sin cambios (usan otro módulo)

✅ **Integración con otros módulos:**
- `jobs/updateWooOrderStatusAndStock.js` - Compatible (usa mismo patrón)
- Cualquier nuevo código de sync debe usar patrón de JOIN correcto

---

## 10. Próximas Mejoras

1. **Webhook de WooCommerce** - Stock actualizado en WooCommerce → sincronizar a BD
2. **Cola de sincronización** - Reintentar si falla WooCommerce
3. **Caché de IDs** - No buscar IDs cada vez (performance)
4. **Monitoreo mejorado** - Dashboard de sincronizaciones

