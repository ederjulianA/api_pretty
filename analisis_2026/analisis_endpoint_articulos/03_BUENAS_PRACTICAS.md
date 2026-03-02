# Buenas Practicas - Endpoint /api/articulos

## 1. Modelo con demasiadas responsabilidades (God Model)

**Archivo:** articulosModel.js (2117 lineas)

El modelo maneja:
- Validacion de articulos
- CRUD de articulos en BD
- Subida de imagenes a Cloudinary
- Sincronizacion con WooCommerce (create, update)
- Generacion de codigos
- Productos variables y variaciones
- Sincronizacion de atributos
- Conversion de simple a variable
- Contenido IA
- Logging a `woo_sync_logs`

**Principio violado:** Single Responsibility Principle (SRP)

**Recomendacion:** Separar en modulos:
```
models/
  articulosModel.js          -> CRUD basico de articulos
  articulosWooSync.js        -> Logica de sincronizacion WooCommerce
  articulosImageService.js   -> Subida de imagenes
  articulosCodigoService.js  -> Generacion de codigos
```

**NOTA DE PRECAUCION:** Esta refactorizacion debe hacerse de forma incremental sin romper las importaciones existentes. Se puede empezar exportando las mismas funciones desde `articulosModel.js` pero delegando internamente a los modulos nuevos.

---

## 2. Validacion de entrada insuficiente/inconsistente

### 2.1 No se validan tipos numericos de precios
```javascript
// articulosController.js:60
if (!art_cod || !art_nom || !categoria || !subcategoria || precio_detal == null || precio_mayor == null)
```

No se valida que `precio_detal` y `precio_mayor` sean numeros positivos. Un string como `"abc"` pasaria la validacion y fallaria en la BD.

### 2.2 No se sanitiza longitud de campos
```javascript
// art_cod en BD es VARCHAR(30), pero no se valida longitud
// art_nom en BD es VARCHAR(100), pero el codigo usa sql.VarChar(250)
```

### 2.3 createArticuloEndpoint no valida precios negativos
Precios de 0 o negativos pasarian la validacion `precio_detal == null`.

**Recomendacion:**
```javascript
const precio_detal_num = parseFloat(precio_detal);
const precio_mayor_num = parseFloat(precio_mayor);

if (isNaN(precio_detal_num) || precio_detal_num < 0) {
    return res.status(400).json({ error: "precio_detal debe ser un numero positivo" });
}
if (isNaN(precio_mayor_num) || precio_mayor_num < 0) {
    return res.status(400).json({ error: "precio_mayor debe ser un numero positivo" });
}
if (art_cod.length > 30) {
    return res.status(400).json({ error: "art_cod no puede exceder 30 caracteres" });
}
if (art_nom.length > 100) {
    return res.status(400).json({ error: "art_nom no puede exceder 100 caracteres" });
}
```

---

## 3. Falta de `COUNT` total en paginacion

**Archivo:** articulosModel.js:500-505

El endpoint `GET /api/articulos` devuelve paginas pero NO el total de registros. El frontend no puede saber cuantas paginas existen.

```javascript
// Actualmente solo retorna:
return result.recordset; // Array de articulos de la pagina

// Deberia retornar:
return {
    data: result.recordset,
    pagination: {
        page: PageNumber,
        pageSize: PageSize,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / PageSize)
    }
};
```

**Recomendacion:** Agregar `COUNT(*) OVER()` al query o un query separado de conteo:

```sql
SELECT *, COUNT(*) OVER() AS total_records
FROM ArticulosBase
ORDER BY ...
OFFSET ...
FETCH NEXT ...
```

---

## 4. `createArticulo` hace commit antes de WooCommerce

**Archivo:** articulosModel.js:631

```javascript
// Commit de la transaccion local
await transaction.commit();  // <-- Commit ANTES de WooCommerce

// 6. Intentar sincronizacion con WooCommerce
try {
    // Si esto falla, el articulo ya esta en BD pero NO en WooCommerce
    const wooProduct = await wcApi.post('products', wooData);
```

**Analisis:** Esto es una **decision de diseno valida** - prioriza la integridad de la BD local sobre la sincronizacion. El articulo queda creado localmente y se puede sincronizar despues. Sin embargo, el problema es que el response devuelve `success: false` si WooCommerce falla, aunque el articulo SI fue creado.

**Recomendacion:** Clarificar en la respuesta:
```javascript
if (Object.keys(response.errors).length > 0) {
    response.partialSuccess = true;  // El articulo fue creado pero hubo errores de sync
    response.message = 'Articulo creado exitosamente en BD, pero con errores de sincronizacion';
}
```

---

## 5. Importaciones inconsistentes en el controller

**Archivo:** articulosController.js:1-3

```javascript
const articulosModel = require('../models/articulosModel');
const { validateArticulo, createArticulo, getArticulo, updateArticulo, getArticuloByArtCod } = require('../models/articulosModel');
```

Se importa el modulo completo Y funciones destructuradas del mismo modulo. Algunos usos acceden via `articulosModel.getArticulos()` y otros directamente como `getArticulo()`.

**Recomendacion:** Usar un solo estilo:
```javascript
const articulosModel = require('../models/articulosModel');
// Usar siempre articulosModel.getArticulos(), articulosModel.createArticulo(), etc.
```

---

## 6. Manejo de errores inconsistente

### 6.1 Algunos endpoints devuelven stack trace en produccion

```javascript
// articulosController.js:115 - Devuelve stack en desarrollo
stack: process.env.NODE_ENV === 'development' ? error.stack : undefined

// articulosController.js:48 - NUNCA devuelve stack
return res.status(500).json({ success: false, error: error.message });
```

### 6.2 `createArticuloEndpoint` devuelve datos recibidos en el error

```javascript
// articulosController.js:74 - Devuelve datos del request en la respuesta de error
receivedData: {
    art_cod, art_nom, categoria, subcategoria, precio_detal, precio_mayor
}
```

Esto es util para debugging pero puede exponer datos en produccion.

### 6.3 Respuestas HTTP inconsistentes

| Funcion | Error de validacion | Error interno |
|---------|-------------------|---------------|
| getArticulos | N/A | 500 |
| validateArticuloEndpoint | 400 | 500 |
| createArticuloEndpoint | 400 | 500 |
| getArticuloEndpoint | 400 | 500 |
| updateArticuloEndpoint | 400 | 500 |
| getArticuloByArtCodEndPoint | 400 | 500 |
| getNextArticuloCodigoEndpoint | N/A | 500 |

Esto es consistente en HTTP status. Sin embargo, el formato de la respuesta varia (algunos incluyen `missingFields`, otros no).

---

## 7. `getArticuloByArtCod` vs `getArticulo` - Logica de precios diferente

**Archivo:** articulosModel.js:812-851 vs 852-1029

| Aspecto | getArticuloByArtCod | getArticulo |
|---------|-------------------|-------------|
| Precios | Via `precioUtils.obtenerPreciosArticulo()` | Via SQL JOIN con ofertas |
| Costos | NO incluye | SI incluye |
| Ofertas | NO incluye info de oferta | SI incluye |
| Rentabilidad | NO | SI |
| Categorias | NO | SI |

Dos endpoints que devuelven un articulo individual con informacion muy diferente. Esto puede confundir al frontend.

**Recomendacion:** Unificar la respuesta o documentar claramente la diferencia de cada endpoint y su caso de uso.

---

## 8. Logging con `console.log` y `console.error`

El proyecto tiene Winston + Loki configurados segun CLAUDE.md, pero `articulosModel.js` y `articulosController.js` usan exclusivamente `console.log` y `console.error`.

**Recomendacion:** Migrar a Winston logger para tener:
- Niveles de log (debug, info, warn, error)
- Formato estructurado
- Envio a Loki para monitoreo centralizado

---

## 9. Transaccion con llamadas externas

**Archivo:** articulosModel.js:524-631

En `createArticulo`, la transaccion SQL incluye:
1. Generar secuencia (con UPDLOCK)
2. INSERT articulo
3. **Subir imagenes a Cloudinary** (llamada HTTP externa, potencialmente lenta)
4. INSERT precios
5. COMMIT

Si la subida de imagenes tarda 30 segundos, la transaccion mantiene el UPDLOCK/HOLDLOCK en la tabla `secuencia` durante todo ese tiempo, bloqueando otros INSERT.

**Recomendacion:** Separar la subida de imagenes fuera de la transaccion:
```javascript
// 1. Subir imagenes primero (fuera de transaccion)
const imageUrls = await uploadImages(images);

// 2. Luego la transaccion solo hace operaciones de BD
const transaction = new sql.Transaction(pool);
await transaction.begin();
// ... INSERT articulo, precios ...
await transaction.commit();
```

**NOTA:** `createVariableProduct` (linea 1306) ya implementa este patron correctamente - sube imagenes dentro de la transaccion pero hace commit antes de WooCommerce.
