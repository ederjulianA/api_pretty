# Quick Reference: WooCommerce Stock Sync en Compras

## ¿Por qué no se está sincronizando el stock?

### Checklist rápido

```
✅ 1. ¿El artículo tiene art_woo_id?
   SELECT art_cod, art_woo_id FROM dbo.articulos WHERE art_cod = 'XXXXX'
   → Si es NULL, ve a: Módulo Artículos → Sincronizar a WooCommerce

✅ 2. ¿Los env vars de WooCommerce están configurados?
   echo $WC_URL $WC_CONSUMER_KEY $WC_CONSUMER_SECRET
   → Todos deben tener valor

✅ 3. ¿La compra se creó correctamente?
   SELECT fac_nro FROM dbo.factura WHERE fac_nro = 'COM00062'
   → Debe existir el registro

✅ 4. ¿Los detalles de la compra están en facturakardes?
   SELECT COUNT(*) FROM dbo.facturakardes WHERE fac_sec = (
     SELECT fac_sec FROM dbo.factura WHERE fac_nro = 'COM00062'
   )
   → Debe haber al menos 1 registro

✅ 5. ¿Revisaste los logs?
   pm2 logs api_pretty | grep "WOO-SYNC\|COMPRA-SYNC"
   → Busca mensajes de error
```

---

## Logs esperados (éxito)

```
[COMPRA-SYNC] Iniciando sincronización de stock después de crear compra
[WOO-SYNC] Iniciando sincronización de stock para documento COM00062
[WOO-SYNC] Procesando 2 artículos
[WOO-SYNC] Producto 100 actualizado: stock = 50
[WOO-SYNC] Sincronización completada para COM00062
```

---

## Logs de error y soluciones

### Error 1: "Ningún artículo tiene art_woo_id"
```
[WOO-SYNC] Ningún artículo tiene art_woo_id/art_woo_variation_id
```
**Solución:** Los artículos de la compra no están sincronizados a WooCommerce
- Ve a Módulo de Artículos
- Selecciona cada artículo de la compra
- Haz click en "Sincronizar a WooCommerce"

### Error 2: "No se encontraron artículos"
```
[WOO-SYNC] No se encontraron artículos para el documento COM00062
```
**Solución:** La compra no se creó correctamente
- Verifica que los detalles se guardaron en `facturakardes`
- Recrea la compra

### Error 3: "Faltan variables de entorno de WooCommerce"
```
[WOO-SYNC] Faltan variables de entorno de WooCommerce
```
**Solución:** Configura `.env`:
```
WC_URL=https://tu-tienda.com
WC_CONSUMER_KEY=ck_xxxxx
WC_CONSUMER_SECRET=cs_xxxxx
```

### Error 4: Variación sin IDs
```
[WOO-SYNC] Variación 9175-TONO-1 no tiene art_woo_variation_id
```
**Solución:** La variación existe en BD pero no en WooCommerce
- Ve a Módulo de Variaciones
- Sincroniza la variación a WooCommerce

---

## Flujo de actualización

### Caso A: Crear compra
```
POST /api/compras
↓
registrarCompra() en BD
↓
syncDocumentStockToWoo(fac_nro) ← AUTOMÁTICO
↓
Respuesta con woo_sync: { success: true, ... }
```

### Caso B: Actualizar detalles existentes
```
PUT /api/compras/COM00062
{ "detalles": [{ "kar_sec": 1, "cantidad": 100 }] }
↓
actualizarCompra() en BD
↓
SI hay cambios → syncDocumentStockToWoo(fac_nro) ← AUTOMÁTICO
↓
Respuesta con woo_sync: { success: true, ... }
```

### Caso C: Agregar detalles nuevos
```
PUT /api/compras/COM00062
{ "detalles_nuevos": [{ "art_sec": "9300", "cantidad": 10, ... }] }
↓
actualizarCompra() en BD
↓
SI hay cambios → syncDocumentStockToWoo(fac_nro) ← AUTOMÁTICO
↓
Respuesta con woo_sync incluye ambos (antiguos + nuevos)
```

---

## Verificar stock en WooCommerce

### Desde API
```bash
curl -u "ck_xxxxx:cs_xxxxx" \
  https://tu-tienda.com/wp-json/wc/v3/products/100

# Busca: "stock_quantity": 50
```

### Desde Admin WooCommerce
1. Ir a Productos
2. Editar el producto
3. Pestaña "Inventario"
4. Ver "Stock"

---

## Documentación completa

Ver: `implementaciones_2026/sistema_compras_costo_promedio/SYNC_WOOCOMMERCE_COMPRAS.md`
Ver: `implementaciones_2026/productos_variables/FIX_STOCK_SYNC_VARIACIONES.md`
