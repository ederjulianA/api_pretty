# Hallazgos Criticos - Endpoint /api/articulos

## 1. SEGURIDAD: Endpoints sin autenticacion

**Severidad: ALTA**

La mayoria de endpoints NO tienen el middleware `verifyToken`. Solo `GET /` y `GET /next-codigo/generate` lo usan.

```javascript
// routes/articulosRoutes.js - SIN AUTH:
router.get('/validar', validateArticuloEndpoint);           // Sin verifyToken
router.post('/', createArticuloEndpoint);                    // Sin verifyToken - CRITICO
router.get('/:id_articulo', getArticuloEndpoint);           // Sin verifyToken
router.put('/:id_articulo', updateArticuloEndpoint);        // Sin verifyToken - CRITICO
router.get('/articulo/:art_cod', getArticuloByArtCodEndPoint); // Sin verifyToken
```

**Impacto:** Cualquier persona puede crear, modificar y consultar articulos sin autenticacion.

**Recomendacion:**
```javascript
router.get('/validar', verifyToken, validateArticuloEndpoint);
router.post('/', verifyToken, createArticuloEndpoint);
router.get('/:id_articulo', verifyToken, getArticuloEndpoint);
router.put('/:id_articulo', verifyToken, updateArticuloEndpoint);
router.get('/articulo/:art_cod', verifyToken, getArticuloByArtCodEndPoint);
```

---

## 2. Inconsistencia de tipos SQL vs esquema BD

**Severidad: ALTA**

Multiples discrepancias entre los tipos usados en el codigo y los tipos reales en la base de datos:

| Campo | Tipo en BD | Tipo usado en codigo | Archivo:Linea |
|-------|-----------|---------------------|---------------|
| `art_sec` | `VARCHAR(30)` | `sql.Decimal(18, 0)` | articulosModel.js:549,558,569,598,617,627,725,1019,1068,1116,1165 |
| `art_cod` | `VARCHAR(30)` | `sql.VarChar(50)` | articulosModel.js:47,118,509,570,828,1064 |
| `art_nom` | `VARCHAR(100)` | `sql.VarChar(250)` | articulosModel.js:571,1065 |
| `inv_sub_gru_cod` | `SMALLINT` | `sql.Int(4)` | articulosModel.js:1066 |
| `art_woo_id` | `INT` | `sql.Int(4)` | articulosModel.js:1067 (incorrecto uso de sql.Int con argumento) |
| `inv_sub_gru_cod` | `SMALLINT` | `sql.VarChar(50)` | articulosModel.js:572 (en createArticulo) |

### Detalle critico: `art_sec`

En la BD: `art_sec VARCHAR(30) NOT NULL`
En el codigo de `createArticulo` y `updateArticulo`: se usa `sql.Decimal(18, 0)`

Esto funciona por la conversion implicita de SQL Server, pero:
- Puede fallar con `art_sec` no numericos
- Es inconsistente con `createVariableProduct` y `createProductVariation` que SU usan `sql.VarChar(30)` correctamente

### Detalle critico: `inv_sub_gru_cod`

En `createArticulo` (linea 572): `sql.VarChar(50)` -- INCORRECTO, es SMALLINT
En `updateArticulo` (linea 1066): `sql.Int(4)` -- deberia ser sql.SmallInt
En `createVariableProduct` (linea 1376): `sql.SmallInt` -- CORRECTO

### Detalle: `sql.Int(4)`

`sql.Int` en mssql NO acepta argumento de longitud. `sql.Int(4)` no genera error pero el `4` es ignorado. Deberia ser simplemente `sql.Int`.

**Recomendacion:** Unificar todos los tipos para que coincidan con la BD.

---

## 3. Instanciacion duplicada de WooCommerce API

**Severidad: MEDIA**

`updateWooCommerceProduct` (linea 101-106) crea una **nueva instancia** de `WooCommerceRestApi` en cada llamada, a pesar de que ya existe una instancia global `wcApi` (linea 29-34).

```javascript
// Linea 29: instancia global (usada en createArticulo, createVariableProduct, etc.)
const wcApi = new WooCommerceRestApi({ ... });

// Linea 101: NUEVA instancia en cada llamada a updateWooCommerceProduct
const api = new WooCommerceRestApi({ ... });
```

**Impacto:** Overhead innecesario al crear conexiones nuevas por cada actualizacion.

**Recomendacion:** Usar la instancia global `wcApi` en `updateWooCommerceProduct`.

---

## 4. Conflicto de rutas Express

**Severidad: MEDIA**

```javascript
router.get('/:id_articulo', getArticuloEndpoint);
router.get('/articulo/:art_cod', getArticuloByArtCodEndPoint);
```

La ruta `/:id_articulo` es un comodin que captura CUALQUIER segmento. Como esta definida ANTES de `/articulo/:art_cod`, una peticion a `/articulo/ART001` sera capturada por `/:id_articulo` con `id_articulo = "articulo"`.

**Impacto:** El endpoint `GET /api/articulos/articulo/:art_cod` nunca sera alcanzado.

**Recomendacion:** Reordenar las rutas poniendo las rutas especificas ANTES de las parametricas:
```javascript
// Rutas especificas PRIMERO
router.get('/validar', verifyToken, validateArticuloEndpoint);
router.get('/next-codigo/generate', verifyToken, getNextArticuloCodigoEndpoint);
router.get('/articulo/:art_cod', verifyToken, getArticuloByArtCodEndPoint);

// Rutas parametricas DESPUES
router.get('/:id_articulo', verifyToken, getArticuloEndpoint);
```

**NOTA:** En la practica Express SI evalua las rutas en orden, PERO `/articulo` como valor de `:id_articulo` hara que `getArticuloEndpoint` busque un articulo con art_sec="articulo" y falle. La ruta `/articulo/:art_cod` funciona porque Express distingue `/articulo/algo` (2 segmentos) de `/algo` (1 segmento). Sin embargo, la convencion es poner rutas especificas primero para claridad.

**Correccion:** Revisando mas a detalle, `/articulo/:art_cod` tiene 2 segmentos (`articulo` + `:art_cod`) mientras `/:id_articulo` tiene 1 segmento. Express SI los distingue correctamente. No hay conflicto real, pero la ruta `/:id_articulo` SI capturaria paths como `/validar` si no estuvieran definidos antes - lo cual ya esta correcto en el orden actual para `/validar` y `/next-codigo/generate`.

---

## 5. Logging excesivo con datos sensibles en produccion

**Severidad: MEDIA**

```javascript
// articulosController.js:54 - Log del body completo incluyendo posibles datos sensibles
console.log('Request body:', JSON.stringify(req.body, null, 2));
console.log('Request files:', JSON.stringify(req.files, null, 2));

// articulosModel.js:214 - Log de datos completos enviados a WooCommerce
console.log('Actualizando producto en WooCommerce:', {
    art_woo_id,
    art_cod,
    data: JSON.stringify(data, null, 2)  // Incluye precios
});

// articulosModel.js:219-223 - Log de respuesta completa de WooCommerce
console.log('Respuesta de WooCommerce:', {
    data: JSON.stringify(response.data, null, 2)  // Respuesta completa
});
```

**Impacto:**
- Logs excesivamente grandes en produccion
- Posible exposicion de datos de precios/productos en logs
- Performance degradada por serializar JSON grandes

**Recomendacion:** Usar niveles de log (debug vs info) y reducir el volumen de datos logueados.

---

## 6. `throw` de objetos no-Error

**Severidad: BAJA**

En `createArticulo` (linea 804) y `createVariableProduct` (linea 1557):

```javascript
throw {
    success: false,
    message: 'Error al crear el articulo',
    errors
};
```

Se lanza un objeto plano en vez de un `Error`. Esto:
- Pierde el stack trace
- No es atrapado por herramientas de monitoreo como Error
- El controller hace `catch (error) { res.status(500).json({ error: error.message }) }` - pero `error.message` no existe en un objeto plano

**Recomendacion:** Siempre lanzar `new Error()` o una clase personalizada.

---

## 7. `require` dentro de funcion

**Severidad: BAJA**

```javascript
// articulosModel.js:838 - require dentro de getArticuloByArtCod
const { obtenerPreciosArticulo } = require('../utils/precioUtils');

// articulosModel.js:1129 - require dentro de updateArticulo
const bundleModel = require('./bundleModel');

// articulosModel.js:1611 - require dentro de createProductVariation
const { validateVariationAttributes, generateVariationSKU, skuExists } = require('../utils/variationUtils');
```

**Impacto:** Aunque Node.js cachea los requires, es una practica no recomendada. Puede indicar dependencias circulares que se intentan evitar con require lazy.

**Recomendacion:** Mover los requires al inicio del archivo si no hay dependencias circulares.
