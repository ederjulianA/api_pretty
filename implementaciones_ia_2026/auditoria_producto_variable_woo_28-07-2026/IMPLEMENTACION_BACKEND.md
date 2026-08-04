# Backend Implementado — Ajustes de sincronización WooCommerce para productos variables

**Fecha:** 2026-07-28 · **Estado:** Listo para integrar

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `models/articulosModel.js` | Modificado | `updateArticulo`/`updateWooCommerceProduct` omiten `regular_price` para padre variable; `getArticulos` soporta `excluirVariables`; nuevas funciones `updateProductVariation`, `deleteProductVariation` |
| `controllers/updateWooStockController.js` | Modificado | Decide endpoint de WooCommerce según `art_woo_type` (variación, simple o padre variable) |
| `controllers/articulosController.js` | Modificado | Lee query param `excluir_variables` |
| `controllers/variableProductController.js` | Modificado | Nuevos handlers `updateVariation`, `deleteVariation`; `convertToVariable` propaga `statusCode` real |
| `routes/variableProductRoutes.js` | Modificado | Nuevas rutas `PUT`/`DELETE /:parent_art_sec/variations/:variation_art_sec` |

---

## [GAP ADICIONAL] `POST /api/articulos/variable/:art_sec/convert-to-variable` — bloqueo por stock existente

**Detectado tras revisión con el usuario, no estaba en el spec original.**

**Problema:** al convertir un artículo simple a variable, su stock existente (kardex/`vwExistencias`) no se traslada a las variaciones que se crean después — cada variación nueva arranca en 0. Esto dejaba stock "huérfano" atado al padre, que ya no es vendible directamente (y queda excluido del POS por SOLICITUD-4).

**Solución aplicada:** `convertArticuloToVariable` ahora **bloquea la conversión con `400`** si el artículo tiene existencia mayor a 0. El usuario debe ajustar el inventario a 0 antes de convertir (venta, ajuste de salida, etc.).

**Response `400` (nuevo):**
```json
{
  "success": false,
  "message": "El artículo tiene 77 unidades en existencia. Ajuste el inventario a 0 antes de convertirlo a variable, ya que el stock del padre no se traslada automáticamente a las variaciones.",
  "error": "El artículo tiene 77 unidades en existencia. Ajuste el inventario a 0 antes de convertirlo a variable, ya que el stock del padre no se traslada automáticamente a las variaciones."
}
```

**Nota para el frontend:** antes, todos los errores de este endpoint devolvían `500`. Ahora los errores de validación (artículo ya variable, es variación, sin atributos válidos, stock > 0) devuelven `400`; solo errores inesperados devuelven `500`.

---

## [SOLICITUD-1] `PUT /api/articulos/:id_articulo` — padre variable ya no envía precio/stock a Woo

**Sin cambios de contrato.** Internamente, si el artículo tiene `art_woo_type === 'variable'`, el `PUT` a WooCommerce ya no incluye `regular_price` (ni ningún campo de stock). Sigue enviando `name`, `meta_data` y categorías si cambiaron. Simple y bundle no cambian su comportamiento.

---

## [SOLICITUD-2] `PUT /api/updateWooStock/:art_cod` — distingue padre/simple/variación

**Sin cambios de contrato.** Comportamiento interno nuevo:

- `art_woo_type === 'variation'` → actualiza `products/{art_parent_woo_id}/variations/{art_woo_variation_id}`.
- `art_woo_type === 'variable'` (padre) → no-op, responde `200` con `data.stock: null` y mensaje indicando que el padre no gestiona stock propio.
- `simple` o `null` → comportamiento igual al actual (`products/{art_woo_id}`).

**Response 200 (caso padre variable, nuevo):**
```json
{
  "success": true,
  "messages": ["Artículo COD123 es padre variable: no gestiona stock propio en WooCommerce, no-op"],
  "data": { "art_cod": "COD123", "art_sec": "2091", "art_woo_id": 10714, "stock": null }
}
```

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | Falta `art_cod` |
| `404` | `art_cod` no existe, o es variación sin `art_parent_woo_id`/`art_woo_variation_id` asignados |
| `500` | Error de WooCommerce (con reintento automático ante error 500/Cloudflare, igual que antes) |

---

## [SOLICITUD-3] Editar y eliminar variación puntual (nuevo)

### PUT `/api/articulos/variable/:parent_art_sec/variations/:variation_art_sec`

**Auth requerida:** Sí (`x-access-token`)

**Nota:** `parent_art_sec` no se usa para autorización interna (la variación ya conoce su padre vía `art_sec_padre`), pero se mantiene en la ruta por consistencia con el resto del módulo.

**Request body (todos los campos opcionales, al menos uno requerido):**
```json
{
  "art_nom": "Labial Mate Tono 3",
  "precio_detal": 25000,
  "precio_mayor": 18000,
  "attributes": { "Tono": "Tono 3" }
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": { "art_sec": "2093", "art_woo_variation_id": 10718 },
  "errors": { "wooCommerce": null }
}
```

**Response `200` con fallo no-bloqueante de Woo:**
```json
{
  "success": true,
  "data": { "art_sec": "2093", "art_woo_variation_id": 10718 },
  "errors": { "wooCommerce": { "message": "Error al sincronizar variación con WooCommerce", "details": "..." } }
}
```
El cambio local queda aplicado igual; `art_woo_sync_status`/`art_woo_sync_message` del artículo quedan en `ERROR` para permitir detectar la desincronización (ver sección SOLICITUD-5 más abajo).

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | No se envía ningún campo a actualizar, o `attributes` no es JSON válido / usa atributos no permitidos (solo `Tono`/`Color`) |
| `404` | `variation_art_sec` no existe o no es de tipo `variation` |
| `500` | Error interno inesperado |

---

### DELETE `/api/articulos/variable/:parent_art_sec/variations/:variation_art_sec`

**Auth requerida:** Sí

**Request:** sin body.

**Response `200`:**
```json
{ "success": true, "message": "Variación eliminada" }
```

**Response `200` con fallo no-bloqueante al eliminar en Woo:**
```json
{
  "success": true,
  "message": "Variación eliminada",
  "errors": { "wooCommerce": { "message": "..." } }
}
```
La variación se elimina localmente (BD) aunque WooCommerce falle; queda responsabilidad del frontend/soporte revisar el panel de Woo si esto ocurre.

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | `variation_art_sec` no corresponde a una variación (`art_woo_type <> 'variation'`) |
| `404` | `variation_art_sec` no existe |
| `409` | La variación tiene movimientos de inventario asociados (ventas, ajustes, etc. en el kardex) y no puede eliminarse |
| `500` | Error interno inesperado |

**Regla de negocio aplicada:** si existe cualquier registro de movimiento de inventario (kardex) para esa variación, el DELETE se bloquea con `409` para preservar la trazabilidad histórica. Si no hay movimientos, se elimina físicamente (fotos, promociones asociadas, contenido IA, precios y el registro del artículo) en una sola transacción, y luego se intenta eliminar en WooCommerce.

---

## [SOLICITUD-4] Excluir padre variable del listado en contexto POS

**Endpoint:** `GET /api/articulos` (sin cambios de ruta)

**Nuevo query param opcional:** `excluir_variables` (acepta `"1"` o `"true"`)

- **Sin el parámetro** (comportamiento actual, usado por `Products.jsx`): no cambia nada, el padre variable sigue apareciendo.
- **Con `excluir_variables=1`** (a usar por `POS2.jsx`): la respuesta excluye artículos con `art_woo_type = 'variable'`.

**Ejemplo:**
```
GET /api/articulos?excluir_variables=1&nombre=labial&PageNumber=1&PageSize=20
```

Sin cambios en el esquema de response — solo se reduce el set de resultados cuando el parámetro está presente.

---

## [SOLICITUD-5] Indicador de desincronización — ya existe, sin cambios de backend

Los campos `art_woo_sync_status` (`SUCCESS`/`ERROR`/`PENDING`) y `art_woo_sync_message` **ya existen** en `dbo.articulos` y ya se actualizan automáticamente en:
- `updateArticulo` (edición de producto)
- `createProductVariation` (creación de variación)
- `updateProductVariation` (nuevo — edición de variación)

Ambos campos ya se retornan en `GET /api/articulos` (`articulos[].art_woo_sync_status`, `articulos[].art_woo_sync_message`). El frontend puede usarlos directamente para mostrar un badge de "desincronizado" sin necesidad de un endpoint nuevo ni de heurísticas de fechas.

**Nota:** `deleteProductVariation` no persiste este estado porque el registro se elimina; si falla la sincronización con Woo en el DELETE, el error se retorna directamente en `errors.wooCommerce` de la response (ver arriba), no en el campo persistente (ya no hay fila que actualizar).

---

## Criterios de Aceptación Verificados

- [x] Endpoints responden con el esquema indicado
- [x] Auth vía `x-access-token` aplicado en todas las rutas nuevas/modificadas
- [x] Validaciones de negocio aplicadas (tipo de artículo, atributos permitidos, bloqueo por kardex)
- [x] Transacción SQL en operaciones multi-tabla (edición y eliminación de variación)
- [x] Queries parametrizadas en todos los casos
- [x] El filtro de SOLICITUD-4 es opt-in vía query param — no afecta el panel admin por defecto
- [x] Servidor arranca sin errores de sintaxis tras los cambios
