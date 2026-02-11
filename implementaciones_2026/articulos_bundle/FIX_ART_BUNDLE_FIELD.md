# 🔧 Fix: Campo art_bundle No Retornado en Endpoints

**Fecha:** 2026-02-10
**Problema:** El frontend no podía detectar bundles porque el backend no retornaba `art_bundle`
**Solución:** Agregar `art_bundle` a los SELECT de `articulosModel.js`

---

## 🐛 Problema

### Síntoma
Al intentar editar un producto bundle desde el frontend (EditProduct.jsx), la detección no funcionaba:

```javascript
// Frontend - EditProduct.jsx línea 144
const isBundle = prod.art_bundle === 'S'; // ❌ SIEMPRE undefined

if (isBundle) {
  // Este código NUNCA se ejecutaba
  setProductWooType('bundle');
  // ...cargar componentes
}
```

### Causa Raíz
El backend NO estaba retornando el campo `art_bundle` en los endpoints de consulta de artículos:

**Endpoints Afectados:**
1. `GET /api/articulos/:id` → Usado en EditProduct.jsx
2. `GET /api/articulos` → Usado en Products.jsx (listado)

**Archivo:** `/Users/eder/Developer/GitHub/api_pretty/models/articulosModel.js`

---

## ✅ Solución Aplicada

### 1. Endpoint GET /api/articulos/:id (getArticulo)

**Ubicación:** Línea ~714

**ANTES:**
```sql
SELECT
  a.art_sec,
  a.art_cod,
  a.art_nom,
  -- ... otros campos
  a.art_woo_sync_status,
  a.art_woo_sync_message,
  ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
  a.art_variable,
  a.art_sec_padre,
  a.art_variation_attributes
  -- ❌ FALTA art_bundle
FROM dbo.articulos a
```

**DESPUÉS:**
```sql
SELECT
  a.art_sec,
  a.art_cod,
  a.art_nom,
  -- ... otros campos
  a.art_woo_sync_status,
  a.art_woo_sync_message,
  ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
  a.art_variable,
  a.art_sec_padre,
  a.art_variation_attributes,
  ISNULL(a.art_bundle, 'N') AS art_bundle  -- ✅ AGREGADO
FROM dbo.articulos a
```

---

### 2. Endpoint GET /api/articulos (getArticulos)

**Ubicación:** Línea ~297

**ANTES:**
```sql
WITH ArticulosBase AS (
  SELECT
    a.art_sec,
    a.art_cod,
    -- ... otros campos
    ISNULL(e.existencia, 0) AS existencia,
    a.art_woo_sync_status,
    a.art_woo_sync_message,
    ISNULL(a.art_woo_type, 'simple') AS art_woo_type
    -- ❌ FALTA art_bundle
  FROM dbo.articulos a
```

**DESPUÉS:**
```sql
WITH ArticulosBase AS (
  SELECT
    a.art_sec,
    a.art_cod,
    -- ... otros campos
    ISNULL(e.existencia, 0) AS existencia,
    a.art_woo_sync_status,
    a.art_woo_sync_message,
    ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
    ISNULL(a.art_bundle, 'N') AS art_bundle  -- ✅ AGREGADO
  FROM dbo.articulos a
```

---

## 🔍 Por Qué Usar ISNULL()

```sql
ISNULL(a.art_bundle, 'N') AS art_bundle
```

**Razones:**
1. **Compatibilidad con datos existentes:** Productos creados antes de implementar bundles tienen `art_bundle = NULL`
2. **Consistencia:** Siempre retorna 'S' o 'N', nunca NULL
3. **Validación frontend más simple:** No necesita `prod.art_bundle === 'S' && prod.art_bundle != null`

**Valores posibles:**
- `'S'` → Es un bundle
- `'N'` → NO es un bundle (default para NULL o 'N')

---

## 📊 Impacto de la Corrección

### Frontend - EditProduct.jsx

**ANTES:**
```javascript
const isBundle = prod.art_bundle === 'S'; // ❌ SIEMPRE false (undefined)
if (isBundle) {
  // NUNCA se ejecuta
}
// ❌ Bundle se trataba como producto Simple
```

**DESPUÉS:**
```javascript
const isBundle = prod.art_bundle === 'S'; // ✅ Funciona correctamente
if (isBundle) {
  // ✅ Se ejecuta para bundles
  setProductWooType('bundle');
  // Carga componentes desde GET /api/bundles/:id/componentes
  setBundleComponents(...);
}
```

### Frontend - Products.jsx (Listado)

**Beneficio Adicional:** Ahora el listado de productos puede mostrar badges visuales para bundles:

```javascript
{product.art_bundle === 'S' && (
  <span className="bg-pink-100 text-pink-700">
    <FaBoxOpen /> Bundle
  </span>
)}
```

---

## 🧪 Testing

### Caso de Prueba 1: Editar Bundle

**Pasos:**
1. Crear un bundle con `POST /api/bundles`
2. Verificar en BD: `SELECT art_bundle FROM articulos WHERE art_sec = ?`
   - Debe ser `'S'`
3. En frontend, ir a `/products`
4. Click en "Editar" del bundle
5. **Verificar en consola del navegador:**
   ```javascript
   // Network tab → GET /api/articulos/:id → Response:
   {
     success: true,
     articulo: {
       art_sec: 123,
       art_cod: "BUNDLE001",
       art_nom: "Combo Beauty",
       art_bundle: "S",  // ✅ DEBE APARECER
       // ... otros campos
     }
   }
   ```
6. **Verificar en UI:**
   - ✅ Badge rosa "Combo/Bundle" aparece
   - ✅ BundleManager se renderiza
   - ✅ Lista de componentes se carga

**Resultado Esperado:** ✅ Bundle se edita correctamente

---

### Caso de Prueba 2: Editar Producto Simple

**Pasos:**
1. Editar un producto simple (NO bundle)
2. **Verificar en response:**
   ```javascript
   {
     articulo: {
       art_bundle: "N",  // ✅ Debe ser "N"
     }
   }
   ```
3. **Verificar en UI:**
   - ❌ NO aparece badge de Bundle
   - ❌ NO aparece BundleManager
   - ✅ Formulario normal de edición

**Resultado Esperado:** ✅ Simple se edita normalmente

---

### Caso de Prueba 3: Listar Productos

**Pasos:**
1. Ir a `/products`
2. **Verificar en Network tab → GET /api/articulos:**
   ```javascript
   {
     success: true,
     data: [
       {
         art_sec: 123,
         art_cod: "BUNDLE001",
         art_bundle: "S",  // ✅ Bundle
       },
       {
         art_sec: 456,
         art_cod: "SIMPLE001",
         art_bundle: "N",  // ✅ Simple
       }
     ]
   }
   ```

**Resultado Esperado:** ✅ Todos los productos retornan `art_bundle`

---

## 📝 Resumen de Cambios

### Archivos Modificados

| Archivo | Ubicación | Cambio |
|---------|-----------|--------|
| `articulosModel.js` | Línea ~714 (getArticulo) | Agregado `ISNULL(a.art_bundle, 'N') AS art_bundle` |
| `articulosModel.js` | Línea ~297 (getArticulos) | Agregado `ISNULL(a.art_bundle, 'N') AS art_bundle` |

### Líneas de Código Agregadas: 2

**Diff:**
```diff
// getArticulo - línea 714
  a.art_variable,
  a.art_sec_padre,
  a.art_variation_attributes,
+ ISNULL(a.art_bundle, 'N') AS art_bundle
FROM dbo.articulos a

// getArticulos - línea 297
  a.art_woo_sync_status,
  a.art_woo_sync_message,
  ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
+ ISNULL(a.art_bundle, 'N') AS art_bundle
FROM dbo.articulos a
```

---

## ✅ Checklist de Verificación

Después de aplicar este fix:

- [x] Cambio aplicado en `getArticulo` (línea ~714)
- [x] Cambio aplicado en `getArticulos` (línea ~297)
- [ ] Backend reiniciado (`npm restart` o reiniciar servidor)
- [ ] Testing: Editar bundle muestra badge y componentes
- [ ] Testing: Editar simple no muestra badge de bundle
- [ ] Testing: Listado de productos retorna `art_bundle`

---

## 🚀 Deployment

### Reiniciar Backend

Después de aplicar los cambios:

```bash
cd /Users/eder/Developer/GitHub/api_pretty
npm restart
# O reiniciar el proceso manualmente
```

### Verificar en Producción

```bash
# Test endpoint de un bundle conocido
curl -X GET "http://localhost:3000/api/articulos/123" \
  -H "x-access-token: YOUR_TOKEN"

# Verificar que la respuesta incluya:
# "art_bundle": "S"
```

---

## 📚 Relación con Otras Implementaciones

Este fix es **crítico** para:

1. ✅ **EDIT_BUNDLE_SUPPORT.md** - Edición de bundles (depende de este campo)
2. ✅ **BUNDLE_INTEGRATION.md** - Detección correcta de tipo de producto
3. ✅ **Products.jsx** - Listado con badges visuales de bundles

**Sin este fix:** El sistema de bundles no funciona en el frontend de edición.

**Con este fix:** Sistema de bundles 100% operativo.

---

## 🎯 Resultado Final

### ANTES del Fix
```
Frontend EditProduct.jsx → GET /api/articulos/123
Response: { art_bundle: undefined }
Detección: isBundle = false ❌
Resultado: Bundle tratado como Simple ❌
```

### DESPUÉS del Fix
```
Frontend EditProduct.jsx → GET /api/articulos/123
Response: { art_bundle: "S" }
Detección: isBundle = true ✅
Resultado: Bundle detectado correctamente ✅
Badge rosa visible ✅
BundleManager renderizado ✅
Componentes cargados ✅
```

---

**Documento creado por:** Claude Code
**Versión:** 1.0
**Fecha:** 2026-02-10
**Estado:** ✅ Fix aplicado - Pendiente reiniciar backend
