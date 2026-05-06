# SPEC: Nuevo Formato Cotización — Soporte Backend para PDF Profesional

## Metadata
- **Tipo:** FEATURE
- **Fecha:** 26/04/2026
- **Prioridad estimada:** Media
- **Complejidad estimada:** Baja
- **Requiere migración BD:** Sí (INSERT en `dbo.parametros`)
- **Impacta WooCommerce sync:** No

---

## Resumen Ejecutivo

El frontend POS Pretty implementó el hook `usePrintCotizacion` para generar un PDF profesional de cotizaciones. Este hook requiere dos cambios en el backend: (1) que `GET /api/order/:fac_nro` incluya el campo `fac_obs` en la respuesta, y (2) un nuevo endpoint `GET /api/parametros/datos-pago-cotizacion` que devuelva los datos bancarios configurables desde BD (Bancolombia, Nequi, Daviplata).

Ambos cambios son de bajo riesgo: el primero es solo agregar un campo a un SELECT existente, y el segundo es añadir una función/ruta nueva sin tocar lógica existente.

---

## Estado Actual del Sistema

### Cambio 1 — `getOrder` en `models/orderModel.js`

La función `getOrder` (línea 583) tiene el siguiente SELECT en `headerQuery` (líneas 588-609):

```sql
SELECT 
  f.fac_sec, f.fac_fec, f.fac_tip_cod, f.nit_sec,
  n.nit_ide, n.nit_nom, n.nit_dir, n.nit_tel, n.nit_email,
  f.fac_nro, f.fac_nro_woo, f.fac_est_fac,
  f.fac_descuento_general, f.fac_total_woo,
  c.ciu_nom
FROM dbo.factura f  
LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
LEFT JOIN dbo.Ciudad c ON c.ciu_cod = n.ciu_cod
WHERE f.fac_nro = @fac_nro;
```

El campo `fac_obs` existe en `dbo.factura` (se usa en `updateOrder` línea 179 y en `createCompleteOrder` línea 783) pero **no se retorna** en `getOrder`.

### Cambio 2 — `parametrosModel.js` / `parametrosController.js` / `parametrosRoutes.js`

Ya existe la infraestructura completa de parámetros:
- `models/parametrosModel.js` — `getPedidoMinimo`, `getAllParametros`, `getParametroByCod`, `updateParametro`
- `controllers/parametrosController.js` — handlers para cada función del modelo
- `routes/parametrosRoutes.js` — rutas `GET /`, `GET /:par_cod`, `PUT /:par_cod`

**Observación crítica:** El endpoint genérico `GET /api/parametros/:par_cod` ya existe y podría servir el parámetro `datos_pago_cotizacion` directamente. Sin embargo, la solicitud pide un endpoint dedicado con respuesta `{ success, data }` (no `{ success, parametro }`) y que el JSON ya venga parseado — esto justifica el endpoint específico.

**Observación de `getParametroByCod`:** Usa `sql.VarChar(20)` para `par_cod`. Si el código `'datos_pago_cotizacion'` tiene 22 caracteres, esto **truncará** el input. Hay que usar `sql.VarChar(50)` en la nueva función (el model de `getPedidoMinimo` ya usa `VarChar(50)` correctamente).

---

### Archivos Relevantes Identificados

| Archivo | Rol | Impacto |
|---------|-----|---------|
| `models/orderModel.js` | Query `getOrder` — SELECT del header | **Modificación** — agregar `f.fac_obs` |
| `models/parametrosModel.js` | Acceso a `dbo.parametros` | **Extensión** — nueva función `getDatosPagoCotizacion` |
| `controllers/parametrosController.js` | Handlers REST de parámetros | **Extensión** — nuevo handler |
| `routes/parametrosRoutes.js` | Rutas `/api/parametros` | **Extensión** — nueva ruta GET |
| `dbo.parametros` (BD) | Tabla de configuración | **INSERT** inicial del registro |

---

## Requerimientos Funcionales

1. `GET /api/order/:fac_nro` debe retornar `fac_obs` en el objeto de respuesta del header.
2. `fac_obs` puede ser `NULL` — el frontend maneja el fallback a cadena vacía.
3. `GET /api/parametros/datos-pago-cotizacion` debe retornar los datos bancarios parseados como objeto JSON.
4. La ruta requiere autenticación JWT (`x-access-token`).
5. Si el parámetro no existe en BD, retornar `500` con mensaje descriptivo.
6. El registro `datos_pago_cotizacion` debe insertarse en `dbo.parametros` con los valores reales antes del deploy.

---

## Requerimientos No Funcionales

- **Seguridad:** Endpoint protegido con `verifyToken`. No expone datos sensibles adicionales.
- **Logging:** No se requiere logging especial — los errores ya se loguean con el patrón existente (`console.error`).
- **Transaccionalidad:** No aplica — solo operaciones SELECT e INSERT único.
- **Retrocompatibilidad:** El cambio en `getOrder` es aditivo; no rompe ningún consumidor existente.

---

## Análisis Técnico

### Cambios Propuestos en BD

```sql
-- Ejecutar UNA VEZ en producción antes del deploy
-- Ajustar número de cuenta Bancolombia y titular antes de ejecutar
INSERT INTO dbo.parametros (par_cod, par_value)
VALUES (
  'datos_pago_cotizacion',
  '{"bancolombia":{"tipo":"Ahorros","numero":"123 45678901","titular":"Eder Álvarez · CC 1.098.747.037"},"nequi":{"numero":"321 420 7398","instruccion":"Confirma el pago enviando el comprobante"},"daviplata":{"numero":"321 420 7398","instruccion":"Pago contra entrega disponible en Bucaramanga"}}'
);
```

> ✅ **VERIFICADO con db-explorer:** `par_cod` es `VARCHAR(20) NOT NULL`. El código `'datos_pago_cotizacion'` tiene **22 caracteres** — el INSERT fallará sin ampliar la columna. Se generó `IMPACTO_BD.sql` con dos opciones: ALTER TABLE a VARCHAR(50) (recomendado) o usar código corto `'pago_cotizacion'`.

### Cambios en Capa Model

**`models/orderModel.js` — línea 603:** Agregar `f.fac_obs` antes de `c.ciu_nom`:

```sql
-- Antes:
f.fac_total_woo,
c.ciu_nom

-- Después:
f.fac_total_woo,
f.fac_obs,
c.ciu_nom
```

**`models/parametrosModel.js` — al final, antes de `module.exports`:**

```js
const getDatosPagoCotizacion = async () => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('par_cod', sql.VarChar(50), 'datos_pago_cotizacion')
            .query("SELECT par_value FROM dbo.parametros WHERE par_cod = @par_cod");
        
        if (result.recordset.length === 0) {
            throw new Error('Parámetro datos_pago_cotizacion no encontrado en BD');
        }
        
        return JSON.parse(result.recordset[0].par_value);
    } catch (error) {
        throw error;
    }
};
```

Agregar `getDatosPagoCotizacion` al `module.exports`.

### Cambios en Capa Controller

**`controllers/parametrosController.js` — agregar handler y exportarlo:**

```js
const getDatosPagoCotizacionEndpoint = async (req, res) => {
    try {
        const data = await getDatosPagoCotizacion();
        return res.json({ success: true, data });
    } catch (error) {
        console.error("Error al obtener datos de pago cotización: ", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
```

Actualizar el destructuring del `require` del model y el `module.exports`.

### Nuevos Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/parametros/datos-pago-cotizacion` | Sí | Retorna datos bancarios parseados para PDF cotización |

> ⚠️ **Orden de rutas:** La nueva ruta debe declararse **antes** de `router.get('/:par_cod', ...)` en `parametrosRoutes.js`, o Express la interceptará como si `datos-pago-cotizacion` fuera el valor de `:par_cod`. El archivo actual YA tiene este patrón correcto con `/pedido-minimo` en línea 12.

### Principios SOLID Aplicados

- **SRP:** `getDatosPagoCotizacion` en el modelo tiene una sola responsabilidad — leer y parsear el parámetro bancario.
- **OCP:** Se extiende `parametrosModel`, `parametrosController` y `parametrosRoutes` sin modificar funciones existentes.
- **DIP:** El controller depende de la abstracción del model, no de la BD directamente.

---

## Plan de Implementación

### Fase 1: Cambio en `getOrder` (5 min)
- [ ] Editar `models/orderModel.js` línea 603 — agregar `f.fac_obs,` al SELECT

### Fase 2: Nuevo endpoint datos de pago (15 min)
- [ ] Agregar `getDatosPagoCotizacion` en `models/parametrosModel.js`
- [ ] Actualizar `module.exports` en `parametrosModel.js`
- [ ] Agregar `getDatosPagoCotizacionEndpoint` en `controllers/parametrosController.js`
- [ ] Actualizar destructuring del require y `module.exports` en controller
- [ ] Agregar ruta en `routes/parametrosRoutes.js` — **antes** de `router.get('/:par_cod', ...)`

### Fase 3: BD (5 min)
- [ ] Verificar longitud de columna `par_cod` en `dbo.parametros`
- [ ] Ajustar valores reales (número cuenta Bancolombia, titular)
- [ ] Ejecutar INSERT en BD de producción

---

## Casos de Prueba Propuestos (Postman)

### Happy Path

1. **Obtener pedido con fac_obs incluido**
   - Request: `GET /api/order/COT123` con header `x-access-token: <token>`
   - Expected: `200` — body incluye `fac_obs: "texto de observación"` o `fac_obs: null`

2. **Obtener datos de pago cotización**
   - Request: `GET /api/parametros/datos-pago-cotizacion` con header `x-access-token: <token>`
   - Expected: `200` — `{ success: true, data: { bancolombia: {...}, nequi: {...}, daviplata: {...} } }`

### Edge Cases

1. **Pedido sin observaciones**
   - Request: `GET /api/order/:fac_nro` para un pedido con `fac_obs = NULL`
   - Expected: `200` — `fac_obs: null` en respuesta (el frontend hace fallback a `""`)

2. **Parámetro datos_pago con JSON inválido en BD**
   - Expected: `500` con error de `JSON.parse`

### Error Cases

1. **Sin token de auth**
   - Request: `GET /api/parametros/datos-pago-cotizacion` sin header
   - Expected: `401` o `403`

2. **Parámetro no existe en BD**
   - Expected: `500` — `{ success: false, error: "Parámetro datos_pago_cotizacion no encontrado en BD" }`

---

## ⚠️ Gaps y Dudas

### Dudas Técnicas

1. ~~**Longitud de `par_cod`**~~ — ✅ **RESUELTO:** `par_cod VARCHAR(20)` confirmado. `'datos_pago_cotizacion'` tiene 22 chars → **requiere** `ALTER TABLE dbo.parametros ALTER COLUMN par_cod VARCHAR(50) NOT NULL` antes del INSERT. Ver `IMPACTO_BD.sql` para el script completo con rollback.

2. **`getParametroByCod` usa `sql.VarChar(20)`** — Si `par_cod` en BD es mayor de 20 chars, la función genérica también falla silenciosamente (trunca el input). Este bug pre-existente quedaría expuesto si alguien usa el endpoint genérico `GET /api/parametros/datos_pago_cotizacion`.

### Dudas de Negocio

1. **Valores reales de datos bancarios** — El script de INSERT trae valores de ejemplo. ¿Cuáles son el número de cuenta real de Bancolombia y el titular exacto?

2. **¿Se necesita actualizar `fac_obs` en otras funciones de `getOrder`?** — La función retorna el header + detalles + otros campos. ¿Hay alguna otra consulta en el mismo archivo que también deba retornar `fac_obs`? (Revisar `getOrdenes` si el listado de órdenes también lo necesita para el PDF).

### Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `par_cod` truncado por `VARCHAR(20)` | Media | Alto (INSERT falla en producción) | Verificar con `db-explorer` antes de implementar |
| Ruta `datos-pago-cotizacion` interceptada por `/:par_cod` | Baja | Alto (404/respuesta incorrecta) | Declarar la ruta específica ANTES de `/:par_cod` |
| JSON mal formado en `par_value` rompe el endpoint | Baja | Medio | `try/catch` ya contemplado; considerar validación al guardar vía `PUT` |

---

## Dependencias

- [ ] **Requiere `db-explorer`** para verificar longitud de `par_cod` en `dbo.parametros` — **bloqueante** antes de ejecutar INSERT
- [ ] Requiere confirmación de los valores reales de datos bancarios antes de ejecutar script SQL
- [ ] No requiere cambios en permisos/roles — usa autenticación JWT estándar

---

## Estimación

- **Implementación código:** 30 min
- **Verificación BD + script SQL:** 15 min
- **Testing Postman:** 15 min
- **Total:** ~1 hora
