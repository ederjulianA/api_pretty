# Fix: Violación de Clave Primaria en facturakardes

## 🐛 Problema

**Error:**
```
Violation of PRIMARY KEY constraint 'PK__facturak__526CF66C517133EA'.
Cannot insert duplicate key in object 'dbo.facturakardes'.
The duplicate key value is (4520, 13031).
```

**Causa raíz:**
El sistema estaba usando el `item.id` de WooCommerce directamente como `kar_sec` en la tabla `facturakardes`. Esto causaba violaciones de clave primaria porque:

1. **`item.id` de WooCommerce NO es secuencial por pedido** - Es un ID global que puede ser cualquier número (ej: 13031)
2. **Múltiples pedidos pueden tener el mismo `item.id`** - WooCommerce reutiliza IDs entre diferentes pedidos
3. **La clave primaria es `(fac_sec, kar_sec)`** - Si dos pedidos diferentes intentan usar el mismo `kar_sec`, hay colisión

## 📊 Ejemplo del Error

**Pedido #10543** de WooCommerce:
- Line item 1: `id: 13031` → SKU 9169 (Bundle)
- Line item 2: `id: 13032` → SKU 4641
- Line item 3: `id: 13033` → SKU 4697

Al expandir el bundle, el sistema intentaba:
```sql
INSERT INTO facturakardes (fac_sec, kar_sec, art_sec, ...)
VALUES
  (4520, 13031, 2066, ...),  -- Bundle padre
  (4520, 13031, 1865, ...);  -- Componente 1 del bundle ❌ DUPLICADO!
```

**Resultado:** Error de clave primaria duplicada en `(4520, 13031)`

## ✅ Solución Implementada

### 1. Archivo: `models/orderModel.js`

**Función `updateOrder` (líneas 211-227):**

**❌ Código Anterior (Incorrecto):**
```javascript
for (let i = 0; i < detallesExpandidos.length; i++) {
  const detail = detallesExpandidos[i];
  const newKarSec = i + 1; // ❌ Reiniciaba en 1 siempre

  // ... INSERT con newKarSec
}
```

**✅ Código Nuevo (Correcto):**
```javascript
for (let i = 0; i < detallesExpandidos.length; i++) {
  const detail = detallesExpandidos[i];

  // CORREGIDO: Obtener el siguiente kar_sec de la base de datos
  const karSecRequest = new sql.Request(transaction);
  const karSecQuery = `
    SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec
    FROM dbo.facturakardes
    WHERE fac_sec = @fac_sec
  `;
  const karSecResult = await karSecRequest
    .input('fac_sec', sql.Decimal(18, 0), fac_sec)
    .query(karSecQuery);
  const newKarSec = karSecResult.recordset[0].NewKarSec;

  // ... INSERT con newKarSec
}
```

**Razón del cambio:**
- Si el DELETE previo no se completó (timeout, lock), pueden quedar registros viejos
- Al obtener `MAX(kar_sec) + 1` de la BD, se evitan colisiones incluso si hay datos residuales

---

### 2. Archivo: `controllers/syncWooOrdersController.js`

#### 2.1. Función `createOrder` (líneas 554-557)

**❌ Código Anterior (Incorrecto):**
```javascript
// Procesar items expandidos (incluye bundles + componentes + artículos normales)
for (const item of expandedItems) {
    const articleInfo = item.art_sec;

    // ... código de procesamiento

    await transaction.request()
        .input('fac_sec', sql.Int, facSec)
        .input('kar_sec', sql.Int, item.id)  // ❌ Usaba ID de WooCommerce!
        .input('art_sec', sql.Int, articleInfo)
        // ...
```

**✅ Código Nuevo (Correcto):**
```javascript
// Procesar items expandidos (incluye bundles + componentes + artículos normales)
let karSecCounter = 1; // CORREGIDO: Contador secuencial para kar_sec
for (const item of expandedItems) {
    const articleInfo = item.art_sec;

    // ... código de procesamiento

    await transaction.request()
        .input('fac_sec', sql.Int, facSec)
        .input('kar_sec', sql.Int, karSecCounter++) // ✅ Contador secuencial: 1, 2, 3...
        .input('art_sec', sql.Int, articleInfo)
        // ...
```

#### 2.2. Función `updateOrder` (líneas 809-812)

**❌ Código Anterior (Incorrecto):**
```javascript
// Insertar nuevos detalles (items expandidos)
for (const item of expandedItems) {
    const articleInfo = item.art_sec;

    // ... código de procesamiento

    await transaction.request()
        .input('fac_sec', sql.Int, facSec)
        .input('kar_sec', sql.Int, item.id)  // ❌ Usaba ID de WooCommerce!
        .input('art_sec', sql.Int, articleInfo)
        // ...
```

**✅ Código Nuevo (Correcto):**
```javascript
// Insertar nuevos detalles (items expandidos)
let karSecCounter = 1; // CORREGIDO: Contador secuencial para kar_sec en UPDATE
for (const item of expandedItems) {
    const articleInfo = item.art_sec;

    // ... código de procesamiento

    await transaction.request()
        .input('fac_sec', sql.Int, facSec)
        .input('kar_sec', sql.Int, karSecCounter++) // ✅ Contador secuencial: 1, 2, 3...
        .input('art_sec', sql.Int, articleInfo)
        // ...
```

---

## 🔍 ¿Por Qué Falló Ahora?

Este código funcionaba antes, pero empezó a fallar por:

1. **Pedidos con bundles**: Al expandir bundles, múltiples líneas usan el mismo `item.id` (del bundle padre)
2. **Mayor carga concurrente**: Más sincronizaciones simultáneas aumentaron la probabilidad de colisión
3. **Pedidos complejos**: El pedido #10543 tenía 3 items que se expandieron a 8 líneas tras procesar bundles

## 📈 Impacto de la Corrección

### Antes (Incorrecto)
```
facturakardes:
  (fac_sec: 4520, kar_sec: 13031, art_sec: 2066) ← Bundle padre
  (fac_sec: 4520, kar_sec: 13031, art_sec: 1865) ← ❌ ERROR! Clave duplicada
```

### Después (Correcto)
```
facturakardes:
  (fac_sec: 4520, kar_sec: 1, art_sec: 2066) ← Bundle padre
  (fac_sec: 4520, kar_sec: 2, art_sec: 1865) ← ✅ Componente 1
  (fac_sec: 4520, kar_sec: 3, art_sec: 1866) ← ✅ Componente 2
  (fac_sec: 4520, kar_sec: 4, art_sec: 1867) ← ✅ Componente 3
  (fac_sec: 4520, kar_sec: 5, art_sec: 1868) ← ✅ Componente 4
  (fac_sec: 4520, kar_sec: 6, art_sec: 1869) ← ✅ Componente 5
  (fac_sec: 4520, kar_sec: 7, art_sec: 2067) ← ✅ Artículo 2
  (fac_sec: 4520, kar_sec: 8, art_sec: 2068) ← ✅ Artículo 3
```

## 🧪 Pruebas de Verificación

### 1. Verificar el pedido problemático

```sql
-- Ver si el pedido #10543 ahora se sincroniza correctamente
SELECT f.fac_nro, f.fac_nro_woo, COUNT(*) as total_lineas
FROM factura f
INNER JOIN facturakardes k ON f.fac_sec = k.fac_sec
WHERE f.fac_nro_woo = '10543'
GROUP BY f.fac_nro, f.fac_nro_woo;

-- Ver detalles de los kar_sec generados
SELECT k.fac_sec, k.kar_sec, k.art_sec, a.art_cod, a.art_nom, k.kar_bundle_padre
FROM facturakardes k
INNER JOIN factura f ON k.fac_sec = f.fac_sec
INNER JOIN articulos a ON k.art_sec = a.art_sec
WHERE f.fac_nro_woo = '10543'
ORDER BY k.kar_sec;
```

### 2. Probar sincronización completa

```bash
# Ejecutar sincronización de pedidos de hoy
curl -X POST http://localhost:3000/api/woo/sync-orders \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "FechaDesde": "2026-02-12",
    "FechaHasta": "2026-02-12",
    "Estado": "processing"
  }'
```

### 3. Verificar integridad de claves primarias

```sql
-- Buscar duplicados en facturakardes (NO debería devolver registros)
SELECT fac_sec, kar_sec, COUNT(*) as duplicados
FROM facturakardes
GROUP BY fac_sec, kar_sec
HAVING COUNT(*) > 1;
```

## 📚 Lecciones Aprendidas

1. **Nunca usar IDs externos como claves primarias internas**: Los IDs de sistemas externos (WooCommerce, APIs) no garantizan unicidad en nuestro contexto
2. **Generar secuencias localmente**: Siempre controlar la generación de IDs secuenciales dentro de transacciones
3. **Validar después de expansiones**: Al expandir bundles u otras estructuras, verificar que las claves primarias se mantienen únicas
4. **Usar `MAX() + 1` en actualizaciones**: Para evitar problemas con datos residuales tras DELETEs fallidos

## 🔄 Código de Referencia

### Patrón correcto para generar kar_sec

```javascript
// En CREACIÓN de pedidos (syncWooOrdersController.js)
let karSecCounter = 1;
for (const item of expandedItems) {
  await transaction.request()
    .input('kar_sec', sql.Int, karSecCounter++)
    // ... resto del INSERT
}

// En ACTUALIZACIÓN de pedidos (orderModel.js)
const karSecQuery = `
  SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec
  FROM dbo.facturakardes
  WHERE fac_sec = @fac_sec
`;
const newKarSec = karSecResult.recordset[0].NewKarSec;
```

## ✅ Estado Final

- ✅ **orderModel.js** - `updateOrder()` corregido para usar `MAX(kar_sec) + 1`
- ✅ **syncWooOrdersController.js** - `createOrder()` corregido con contador secuencial
- ✅ **syncWooOrdersController.js** - `updateOrder()` corregido con contador secuencial
- ✅ **Probado** con pedido #10543 (3 items → 8 líneas tras expansión de bundle)

## 📅 Fecha de Corrección

2026-02-12

---

**Autor:** Claude Code + Eder
**Archivo relacionado:** `implementaciones_2026/articulos_bundle/FIX_WOOCOMMERCE_SYNC_BUNDLES.md`
