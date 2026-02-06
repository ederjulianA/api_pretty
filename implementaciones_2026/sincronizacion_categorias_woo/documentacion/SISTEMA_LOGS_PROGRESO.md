# Sistema de Logs de Progreso en Tiempo Real

**Fecha:** 2026-02-05
**Versión:** 2.0 - Optimizado

---

## Resumen de Cambios

Se eliminaron todos los logs de depuración verbosos y se implementó un sistema de progreso en tiempo real que muestra el avance de la sincronización de forma clara y concisa.

---

## Logs Eliminados ❌

Los siguientes logs verbosos fueron eliminados para mejorar la legibilidad:

```javascript
// ANTES (Logs excesivos)
console.log('Processing product:', { id, sku, name, stock_quantity, regular_price });
console.log('Getting art_sec for art_cod:', sku);
console.log('Found art_sec:', art_sec);
console.log('Categorías del sistema local:', { categoria, subcategoria });
console.log('Categorías de WooCommerce:', { categoria, subcategoria });
console.warn('Discrepancia de categorías detectada:', { ... });
console.log('Procesando imágenes del producto:', { productId, imageCount });
console.log('Imagen ya existe, saltando:', { woo_photo_id, position });
console.log('Nueva imagen guardada:', { woo_photo_id, position, tipo });
console.log('Price information:', { wholesalePrice, retailPrice, meta_data });
console.log('Fetching art_woo_id for art_sec:', art_sec);
console.log('art_woo_id result:', artWooId);
console.log('systemStock result:', systemStock);
console.log(`Retrieved ${products.length} products from page ${page}`);
console.log(`Completed batch ${page}/${totalPages}. Processed ${totalProcessed} products so far`);
```

---

## Nuevo Sistema de Logs ✅

### 1. Log de Inicio

```
========================================
🔄 SINCRONIZACIÓN DE PRODUCTOS INICIADA
========================================
Total de productos: 1500
Páginas a procesar: 15
Tamaño de lote: 100
========================================
```

**Información proporcionada:**
- Total de productos a sincronizar
- Número de páginas (lotes de 100)
- Tamaño de cada lote

---

### 2. Logs de Progreso en Tiempo Real

Se muestra cada 10 productos procesados:

```
📊 Progreso: 10/1500 (0.7%) | Restantes: 1490 | Velocidad: 2.50/s | Tiempo restante: ~9.9 min | Actualizados: 8 | Creados: 2 | Errores: 0
📊 Progreso: 20/1500 (1.3%) | Restantes: 1480 | Velocidad: 2.67/s | Tiempo restante: ~9.2 min | Actualizados: 16 | Creados: 4 | Errores: 0
📊 Progreso: 30/1500 (2.0%) | Restantes: 1470 | Velocidad: 2.73/s | Tiempo restante: ~9.0 min | Actualizados: 24 | Creados: 6 | Errores: 0
...
📊 Progreso: 1500/1500 (100.0%) | Restantes: 0 | Velocidad: 2.80/s | Tiempo restante: ~0.0 min | Actualizados: 1200 | Creados: 300 | Errores: 5
```

**Información proporcionada:**
- **Progreso:** Productos procesados / Total (Porcentaje)
- **Restantes:** Productos que faltan por procesar
- **Velocidad:** Productos por segundo
- **Tiempo restante:** Estimación en minutos
- **Actualizados:** Productos que existían y se actualizaron
- **Creados:** Productos nuevos insertados
- **Errores:** Número de errores encontrados

---

### 3. Log de Finalización

```
========================================
✅ SINCRONIZACIÓN COMPLETADA
========================================
Total procesados: 1500/1500
Actualizados: 1200
Creados: 300
Errores: 5
Tiempo total: 8.93 minutos
========================================
```

**Información proporcionada:**
- Resumen de productos procesados
- Desglose de actualizaciones y creaciones
- Total de errores
- Tiempo total de ejecución

---

## Ejemplo de Output Completo

```bash
$ curl -X POST http://localhost:3000/api/woo/sync -H "x-access-token: $TOKEN"

# En los logs del servidor:
========================================
🔄 SINCRONIZACIÓN DE PRODUCTOS INICIADA
========================================
Total de productos: 1500
Páginas a procesar: 15
Tamaño de lote: 100
========================================

📊 Progreso: 10/1500 (0.7%) | Restantes: 1490 | Velocidad: 2.50/s | Tiempo restante: ~9.9 min | Actualizados: 8 | Creados: 2 | Errores: 0
📊 Progreso: 20/1500 (1.3%) | Restantes: 1480 | Velocidad: 2.67/s | Tiempo restante: ~9.2 min | Actualizados: 16 | Creados: 4 | Errores: 0
📊 Progreso: 30/1500 (2.0%) | Restantes: 1470 | Velocidad: 2.73/s | Tiempo restante: ~9.0 min | Actualizados: 24 | Creados: 6 | Errores: 0
📊 Progreso: 40/1500 (2.7%) | Restantes: 1460 | Velocidad: 2.75/s | Tiempo restante: ~8.8 min | Actualizados: 32 | Creados: 8 | Errores: 0
📊 Progreso: 50/1500 (3.3%) | Restantes: 1450 | Velocidad: 2.78/s | Tiempo restante: ~8.7 min | Actualizados: 40 | Creados: 10 | Errores: 0
...
📊 Progreso: 1490/1500 (99.3%) | Restantes: 10 | Velocidad: 2.80/s | Tiempo restante: ~0.1 min | Actualizados: 1192 | Creados: 298 | Errores: 5
📊 Progreso: 1500/1500 (100.0%) | Restantes: 0 | Velocidad: 2.80/s | Tiempo restante: ~0.0 min | Actualizados: 1200 | Creados: 300 | Errores: 5

========================================
✅ SINCRONIZACIÓN COMPLETADA
========================================
Total procesados: 1500/1500
Actualizados: 1200
Creados: 300
Errores: 5
Tiempo total: 8.93 minutos
========================================
```

---

## Ventajas del Nuevo Sistema

### ✅ Legibilidad
- **Antes:** 50+ líneas de logs por producto (75,000+ líneas para 1500 productos)
- **Ahora:** 150 líneas totales para 1500 productos (reducción del 99.8%)

### ✅ Información Útil
- Progreso en tiempo real
- Estimación de tiempo restante
- Velocidad de procesamiento
- Estadísticas en vivo

### ✅ Performance
- Menos I/O de logs
- Menor uso de CPU en logging
- Logs más rápidos de leer

### ✅ Monitoreo
- Fácil detectar si el proceso está avanzando
- Identificar cuellos de botella (velocidad baja)
- Ver errores acumulados en tiempo real

---

## Frecuencia de Actualización

El sistema actualiza cada **10 productos procesados** o cuando se completa el 100%.

**Ejemplo de frecuencia:**
- 1500 productos = 150 logs de progreso
- 100 productos = 10 logs de progreso
- 50 productos = 5 logs de progreso

**Personalización:**

Si deseas cambiar la frecuencia, modifica esta línea en `wooSyncController.js`:

```javascript
// Cambiar de 10 a otro valor
if (totalProcessed % 10 === 0 || totalProcessed === totalProducts) {
    // Mostrar progreso
}

// Ejemplos:
// Cada 5 productos:  totalProcessed % 5 === 0
// Cada 20 productos: totalProcessed % 20 === 0
// Cada 50 productos: totalProcessed % 50 === 0
```

---

## Cálculos de las Métricas

### Porcentaje de Progreso
```javascript
const percentage = ((totalProcessed / totalProducts) * 100).toFixed(1);
// Ejemplo: (1500 / 1500) * 100 = 100.0%
```

### Productos Restantes
```javascript
const remaining = totalProducts - totalProcessed;
// Ejemplo: 1500 - 1200 = 300 productos restantes
```

### Tiempo Transcurrido
```javascript
const startTime = Date.now();
// ... procesamiento ...
const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
// Resultado en segundos
```

### Velocidad (Productos/Segundo)
```javascript
const productsPerSecond = (totalProcessed / (elapsed || 1)).toFixed(2);
// Ejemplo: 1500 productos / 536 segundos = 2.80 productos/segundo
```

### Tiempo Restante Estimado
```javascript
const estimatedRemaining = ((remaining / (productsPerSecond || 1)) / 60).toFixed(1);
// Ejemplo: (300 / 2.80) / 60 = 1.8 minutos
```

---

## Manejo de Errores

Los errores se acumulan silenciosamente en el array `errors` y se muestran:

1. **En tiempo real:** En la métrica "Errores: X" de cada log de progreso
2. **Al final:** En el resumen de sincronización
3. **En la respuesta JSON:** Si hay errores, se incluyen en el campo `errors`

**Ejemplo de respuesta con errores:**

```json
{
  "success": true,
  "message": "Synchronization completed successfully",
  "stats": {
    "totalProcessed": 1500,
    "totalUpdated": 1200,
    "totalCreated": 300,
    "totalErrors": 5,
    "expectedTotal": 1500
  },
  "errors": [
    {
      "productId": "PROD123",
      "error": "No art_sec found for art_cod",
      "details": {
        "art_cod": "PROD123",
        "productId": 12345,
        "name": "Producto sin código"
      }
    }
  ]
}
```

---

## Comparación Antes/Después

### Antes (Logs Verbosos)

```
Processing product: { id: 123, sku: 'PROD001', name: 'Labial', stock_quantity: 50, regular_price: '15000' }
Getting art_sec for art_cod: PROD001
Found art_sec: 789
Categorías del sistema local: { categoria: 'Maquillaje', subcategoria: 'Labiales' }
Categorías de WooCommerce: { categoria: 'Maquillaje', subcategoria: 'Labiales' }
Procesando imágenes del producto: { productId: 123, imageCount: 3 }
Imagen ya existe, saltando: { woo_photo_id: 456, position: 0 }
Imagen ya existe, saltando: { woo_photo_id: 457, position: 1 }
Nueva imagen guardada: { woo_photo_id: 458, position: 2, tipo: 'image/jpeg' }
Price information: { wholesalePrice: 12000, retailPrice: 15000, meta_data: [...] }
Fetching art_woo_id for art_sec: 789
art_woo_id result: 123
systemStock result: 50
Retrieved 100 products from page 1
Completed batch 1/15. Processed 1 products so far
```
**14 líneas por producto** × 1500 productos = **21,000 líneas**

### Ahora (Logs Optimizados)

```
========================================
🔄 SINCRONIZACIÓN DE PRODUCTOS INICIADA
========================================
Total de productos: 1500
Páginas a procesar: 15
Tamaño de lote: 100
========================================

📊 Progreso: 10/1500 (0.7%) | Restantes: 1490 | Velocidad: 2.50/s | Tiempo restante: ~9.9 min | Actualizados: 8 | Creados: 2 | Errores: 0
...
📊 Progreso: 1500/1500 (100.0%) | Restantes: 0 | Velocidad: 2.80/s | Tiempo restante: ~0.0 min | Actualizados: 1200 | Creados: 300 | Errores: 5

========================================
✅ SINCRONIZACIÓN COMPLETADA
========================================
Total procesados: 1500/1500
Actualizados: 1200
Creados: 300
Errores: 5
Tiempo total: 8.93 minutos
========================================
```
**160 líneas totales** (reducción del **99.2%**)

---

## Monitoreo en Tiempo Real

### Con PM2

```bash
# Ver logs en tiempo real
pm2 logs api_pretty --lines 20

# Salida esperada:
0|api_pre | 📊 Progreso: 230/1500 (15.3%) | Restantes: 1270 | Velocidad: 2.75/s | Tiempo restante: ~7.7 min | Actualizados: 184 | Creados: 46 | Errores: 0
```

### Con tail

```bash
# Si usas archivo de logs
tail -f /path/to/logs/app.log

# Ver solo líneas de progreso
tail -f /path/to/logs/app.log | grep "📊 Progreso"
```

### Con npm run dev

Los logs aparecen directamente en la terminal:

```bash
npm run dev

# Verás en tiempo real:
📊 Progreso: 50/1500 (3.3%) | Restantes: 1450 | Velocidad: 2.78/s | Tiempo restante: ~8.7 min | Actualizados: 40 | Creados: 10 | Errores: 0
```

---

## Troubleshooting

### El progreso está muy lento (< 1 producto/segundo)

**Posibles causas:**
- Base de datos lenta (revisar queries)
- WooCommerce API lenta (verificar timeout)
- Muchas imágenes por producto
- Red lenta

**Solución:**
- Aumentar `BATCH_SIZE` de 100 a 200
- Verificar índices en base de datos
- Revisar logs de SQL Server

### No veo logs de progreso

**Posibles causas:**
- Pocos productos (< 10)
- Proceso detenido

**Verificar:**
```bash
# Ver si el proceso está corriendo
ps aux | grep node

# Ver últimos logs
pm2 logs api_pretty --lines 50
```

### Errores aumentan rápidamente

**Posibles causas:**
- Productos sin SKU
- Productos sin categoría en sistema local
- Conexión perdida con WooCommerce

**Revisar:**
```json
// Respuesta JSON incluye detalles de errores
{
  "errors": [
    {
      "productId": "PROD123",
      "error": "No art_sec found for art_cod",
      "details": { ... }
    }
  ]
}
```

---

## Resumen

✅ **Logs optimizados para máxima legibilidad**
✅ **Progreso en tiempo real cada 10 productos**
✅ **Métricas útiles: porcentaje, velocidad, tiempo restante**
✅ **Reducción del 99.2% en volumen de logs**
✅ **Fácil monitoreo con PM2, tail o consola**

---

**Fecha de implementación:** 2026-02-05
**Archivo modificado:** [`/controllers/wooSyncController.js`](../controllers/wooSyncController.js)
