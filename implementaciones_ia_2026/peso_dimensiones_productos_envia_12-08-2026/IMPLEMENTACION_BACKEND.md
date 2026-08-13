# Backend Implementado — Peso y Dimensiones de Productos (envia.com)

**Fecha:** 2026-08-12 · **Estado:** Listo para integrar — migración SQL ya ejecutada en producción (`PSDATAFEB2024`/`VMI1637459`)

---

## Migración SQL — ya aplicada

El script `EstructuraDatos/03_alter_articulos_peso_dimensiones.sql` se ejecutó y verificó contra la base de datos de producción el 2026-08-12. Es idempotente (se puede correr de nuevo sin error si hace falta). Agregó a `dbo.articulos`:

```sql
ALTER TABLE dbo.articulos ADD art_peso DECIMAL(10,3) NULL;         -- kg
ALTER TABLE dbo.articulos ADD art_largo DECIMAL(10,2) NULL;        -- cm
ALTER TABLE dbo.articulos ADD art_ancho DECIMAL(10,2) NULL;        -- cm
ALTER TABLE dbo.articulos ADD art_alto DECIMAL(10,2) NULL;         -- cm
ALTER TABLE dbo.articulos ADD art_peso_fuente VARCHAR(15) NULL;    -- 'estimado_ia' | 'medido' | 'sin_dato'
```

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `EstructuraDatos/03_alter_articulos_peso_dimensiones.sql` | Creado | Migración idempotente de las 5 columnas nuevas |
| `models/articulosModel.js` | Modificado | Validación, persistencia y sync a WooCommerce en `createArticulo`, `updateArticulo`/`updateWooCommerceProduct`, `createVariableProduct`, `createProductVariation`, `updateProductVariation` |
| `controllers/articulosController.js` | Modificado | Acepta y valida los 4 campos en `POST /articulos` y `PUT /articulos/:id_articulo` |
| `controllers/variableProductController.js` | Modificado | Acepta y valida los 4 campos en `POST /articulos/variable`, `POST .../variations` y `PUT .../variations/:variation_art_sec` |
| `jobs/updateWooProductWeightDimensions.js` | Creado | Sync batch (`products/batch`, chunks de 10) de peso/dimensiones hacia WooCommerce para productos ya cargados en BD |
| `routes/woo.js` | Modificado | Nuevo endpoint `POST /api/woo/sync-weight-dimensions` |

No hubo cambios de rutas para los endpoints de producto individual — ya existían, solo se extendió el body que aceptan.

---

## Campos nuevos (todos opcionales/nullable)

| Campo | Tipo | Unidad | Validación |
|-------|------|--------|------------|
| `art_peso` | number | kg | positivo o `null` |
| `art_largo` | number | cm | positivo o `null` |
| `art_ancho` | number | cm | positivo o `null` |
| `art_alto` | number | cm | positivo o `null` |
| `art_peso_fuente` | string | — | libre, máx 15 caracteres (`'estimado_ia'`, `'medido'`, `'sin_dato'`, u otro valor corto — no se valida contra un enum fijo) |

---

## Endpoints Implementados

### POST `/api/articulos` (producto simple/bundle)

**Auth requerida:** Sí (`x-access-token`)

**Request body (agregado al payload actual):**
```json
{
  "art_peso": 0.15,
  "art_largo": 10.5,
  "art_ancho": 5,
  "art_alto": 3,
  "art_peso_fuente": "medido"
}
```

**Response `201`:** el objeto `data` ahora incluye los 4 campos:
```json
{
  "success": true,
  "data": {
    "art_sec": "12345",
    "art_cod": "LAB001",
    "art_max_unidades_pedido": null,
    "art_peso": 0.15,
    "art_largo": 10.5,
    "art_ancho": 5,
    "art_alto": 3,
    "art_peso_fuente": "medido"
  }
}
```

**Comportamiento con WooCommerce:** si al menos uno de `art_peso`/`art_largo`/`art_ancho`/`art_alto` viene con valor, se envían como `weight`/`dimensions` **nativos** en el `POST products` inicial. Si no viene ninguno, no se incluyen en el payload (no tiene sentido "vaciar" un producto que se está creando).

**Errores:** `400` si algún campo no es numérico o es ≤ 0.

---

### PUT `/api/articulos/:id_articulo`

**Auth requerida:** Sí

**Request body (agregado al payload actual):**
```json
{
  "art_peso": 0.15,
  "art_largo": 10.5,
  "art_ancho": 5,
  "art_alto": 3,
  "art_peso_fuente": "medido"
}
```

**Cómo "borrar" un campo ya cargado:** enviar el campo con `null` o `""` (string vacío) explícitamente en el body. Esto persiste `NULL` en BD y sincroniza `weight: ""` / `dimensions.length: ""` (etc.) hacia WooCommerce, que es la forma nativa de indicarle a la API de Woo que vacíe ese campo.

**Si el campo simplemente no viene en el body:** no se toca — se persiste lo que ya había en BD, y no se pisa el valor existente en WooCommerce (mismo criterio que el resto de campos opcionales de este endpoint, como `regular_price`, `name`).

**Response `200`:** sin cambios en la forma; el sync a WooCommerce ocurre de forma no bloqueante (igual que hoy con `art_max_unidades_pedido`).

**Errores:** `400` si algún campo no es numérico o es ≤ 0, mismo tratamiento que el resto del payload.

---

### POST `/api/articulos/variable` (producto variable — padre)

**Auth requerida:** Sí

**Request body (agregado al payload actual):**
```json
{
  "art_peso": 0.15,
  "art_largo": 10.5,
  "art_ancho": 5,
  "art_alto": 3,
  "art_peso_fuente": "estimado_ia"
}
```

**Importante — ver SOLICITUD-4 más abajo:** estos 4 campos en el padre se guardan solo como **referencia** en BD. **No se sincronizan a WooCommerce en el padre** — el padre variable no gestiona peso/dimensiones propios en Woo (igual que ya pasa con `regular_price`/stock, que gestionan las variaciones). Si el catálogo tiene productos variables, el peso/dimensiones real que usa el plugin de envia.com para cotizar debe cargarse en cada variación (ver siguiente endpoint).

---

### POST `/api/articulos/variable/:parent_art_sec/variations` (crear variación)

**Auth requerida:** Sí

**Request body (agregado al payload actual):**
```json
{
  "art_peso": 0.15,
  "art_largo": 10.5,
  "art_ancho": 5,
  "art_alto": 3,
  "art_peso_fuente": "medido"
}
```

Se persiste en BD en el registro de la variación y se sincroniza como `weight`/`dimensions` nativos en el `POST products/{parent_id}/variations` hacia WooCommerce (solo si viene al menos un valor).

---

### PUT `/api/articulos/variable/:parent_art_sec/variations/:variation_art_sec` (editar variación)

**Auth requerida:** Sí

**Request body (agregado al payload actual; todos opcionales — enviar solo lo que se quiera actualizar):**
```json
{
  "art_peso": 0.15,
  "art_largo": 10.5,
  "art_ancho": 5,
  "art_alto": 3,
  "art_peso_fuente": "medido"
}
```

Mismo criterio de "borrar campo" que en `PUT /articulos/:id_articulo`: enviar `null`/`""` explícito para vaciar; omitir el campo para dejarlo intacto.

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | Algún campo no numérico o ≤ 0 |
| `404` | La variación no existe |

---

### POST `/api/woo/sync-weight-dimensions` (sync batch masivo)

**Auth requerida:** No — **esta ruta no tiene `verifyToken`**, igual que el resto de `routes/woo.js` (`/update-article-images`, `/sync-article-image/:art_cod`). Es una inconsistencia preexistente en ese archivo, no algo introducido por esta feature; señalado aquí para que el frontend/equipo decida si conviene protegerla antes de exponerla en un botón de UI pública.

Sincroniza hacia WooCommerce (vía `products/batch`, en lotes de 10, con reintentos) el peso/dimensiones de todos los productos **simples y padres variables** que ya tengan al menos uno de los 4 campos cargado en `dbo.articulos`. No cubre variaciones individuales (`art_woo_type = 'variation'`) — WooCommerce no tiene batch nativo para variaciones; esas se sincronizan una a una vía `PUT .../variations/:variation_art_sec` (ya implementado arriba).

**Request body (opcional):**
```json
{ "art_cods": ["LAB001", "LAB002"] }
```
Si se omite `art_cods`, procesa **todos** los productos pendientes (cualquiera con al menos un campo de peso/dimensiones no nulo). Si `art_cods` viene vacío o no es array, responde `400`.

**Response `200`:**
```json
{
  "success": true,
  "messages": [
    "Producto 1234 actualizado con peso/dimensiones",
    "Error actualizando producto 1235: ..."
  ],
  "summary": {
    "totalItems": 42,
    "successCount": 40,
    "errorCount": 2,
    "skippedCount": 0,
    "duration": "3.21 segundos",
    "batchesProcessed": 5,
    "logId": 118
  },
  "debugLogs": [ ]
}
```

Cada corrida queda registrada en `dbo.woo_sync_logs` (mismo mecanismo que `updateWooProductPrices`), consultable por `logId`.

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | `art_cods` presente pero vacío o no es array |
| `500` | Faltan variables de entorno `WC_*`, o error no controlado |

---

## Resolución de las dudas del SPEC

### SOLICITUD-3 — ¿Cómo se representa "sin dato" al vaciar un campo?

`weight`/`dimensions` son campos **nativos** del producto/variación en WooCommerce (no `meta_data`), y a diferencia de `_max_unidades_pedido` (que usa `value: ""` dentro de un array `meta_data`), el criterio implementado es:

- Campo **presente en el body con `null`/`""`** → se persiste `NULL` en BD y se envía `""` a WooCommerce (Woo interpreta el string vacío como "sin dato" en campos nativos de peso/dimensiones — comportamiento confirmado contra el schema REST estándar de WooCommerce).
- Campo **ausente del body** → no se toca ni en BD ni en el payload hacia Woo (se preserva el valor existente).

### SOLICITUD-4 — ¿El producto variable propaga peso/dimensiones del padre a las variaciones?

**No, WooCommerce no hereda automáticamente peso/dimensiones del padre a las variaciones** — es un atributo independiente por variación en el schema REST de WooCommerce (mismo comportamiento que `regular_price`, que cada variación gestiona por separado). Por eso se implementó:

- El padre variable (`POST /api/articulos/variable`) acepta los 4 campos pero **solo los guarda como referencia** en BD — no los sincroniza a WooCommerce.
- Cada variación (`POST/PUT .../variations`) acepta y sincroniza sus propios 4 campos.

**Impacto para el frontend:** si se quiere que los 5 productos variables actuales coticen correctamente en envia.com, el formulario de variaciones (no solo el de producto padre) debe exponer estos 4 campos. Esto amplía el alcance original del SPEC (que asumía captura solo en el padre) — queda a criterio de negocio si se prioriza ahora o se deja para una iteración siguiente, dado que solo son 5/844 productos.

### SOLICITUD-5 — Carga masiva de las 844 referencias existentes

**Parcialmente resuelto — mecanismo de sync listo, falta la fuente de datos.** Se implementó `POST /api/woo/sync-weight-dimensions`, que sincroniza a WooCommerce (vía `products/batch`, sin las 844 llamadas individuales que preocupaba el SPEC) cualquier producto que **ya tenga** peso/dimensiones en `dbo.articulos`.

Lo que sigue sin resolver: **no existe ningún proceso que calcule/estime esos valores** para los 844 productos. `art_peso_fuente` es solo un campo de trazabilidad — se persiste tal cual llega en el body, pero backend no corre ninguna IA que lo determine. La estrategia de "estimación IA + medición priorizada" mencionada en el documento de negocio (`negocio_prettymakeup/specs/011-peso-dimensiones-productos-envia.md`, fuera de este repo) sigue pendiente de diseño e implementación como iteración separada. Una vez que esa pieza exista (o se cargue manualmente vía `PUT /articulos/:id` producto por producto), el endpoint de sync batch aquí descrito recoge automáticamente todo lo que tenga dato y lo empuja a WooCommerce.

---

## Criterios de Aceptación

- [x] Las 4 columnas nuevas (+ trazabilidad) — ejecutadas y verificadas en BD de producción (`PSDATAFEB2024`/`VMI1637459`).
- [x] `POST /articulos` y `POST /articulos/variable` aceptan y persisten los 4 campos como opcionales.
- [x] `PUT /articulos/:id` acepta, persiste y sincroniza los 4 campos hacia WooCommerce como campos nativos (`weight`, `dimensions`), no como `meta_data`.
- [x] Auth vía `x-access-token` aplicado en los endpoints de producto individual (sin cambios, ya existía). **Excepción:** `POST /api/woo/sync-weight-dimensions` no tiene auth — ver nota en su sección.
- [x] Validación: numérico positivo o `null`, mismo tratamiento que `art_max_unidades_pedido`.
- [x] Queries parametrizadas.
- [x] SOLICITUD-4 confirmada explícitamente arriba.
- [~] SOLICITUD-5 parcialmente resuelta: mecanismo de sync batch implementado (`POST /api/woo/sync-weight-dimensions`); la fuente de datos (estimación IA + medición para los 844 productos) sigue sin implementar — ver detalle arriba.

**Extra implementado (fuera del SPEC original pero necesario para SOLICITUD-4):** los endpoints de variaciones (`POST`/`PUT .../variations`) también aceptan y sincronizan estos 4 campos, ya que es el único punto donde WooCommerce permite fijar el peso/dimensiones real que usará el plugin de envia.com para productos variables.

**Extra implementado (para SOLICITUD-5):** `jobs/updateWooProductWeightDimensions.js` + `POST /api/woo/sync-weight-dimensions` — sync batch vía `products/batch` (chunks de 10, con reintentos) para no repetir las 844 llamadas individuales que preocupaba el SPEC. Cubre productos simples y padres variables; las variaciones se sincronizan individualmente (WooCommerce no tiene batch nativo para variaciones).
