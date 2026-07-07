# Backend Implementado — Unidades Máximas por Pedido (sync WooCommerce)

**Fecha:** 2026-07-07 · **Estado:** Listo para integrar

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `models/articulosModel.js` | Modificado | Nueva columna en INSERT/UPDATE de `dbo.articulos`, validación `validarMaxUnidadesPedido`, envío de `meta_data` a WooCommerce en creación simple, variable y edición, y campo agregado al SELECT de `getArticulo` |
| `controllers/articulosController.js` | Modificado | Validación 400 y paso del campo en `createArticuloEndpoint` y `updateArticuloEndpoint` |
| `controllers/variableProductController.js` | Modificado | Validación 400 y paso del campo en `createVariable` |
| BD `dbo.articulos` | Modificado | `ALTER TABLE dbo.articulos ADD art_max_unidades_pedido INT NULL` (ya ejecutado en desarrollo) |

---

## Endpoints Modificados

### POST `/api/articulos/` (creación simple)

**Auth requerida:** Sí (`x-access-token`)

**Request body (nuevo campo, opcional):**
```json
{ "art_max_unidades_pedido": 5 }
```
Si se omite o es `null`/`""`, no se aplica límite.

**Response `201`:** sin cambios de esquema, ahora incluye `data.art_max_unidades_pedido`.

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | `art_max_unidades_pedido` no es entero positivo ni null |

---

### POST `/api/articulos/variable` (creación variable)

**Auth requerida:** Sí

**Request body (nuevo campo, opcional):**
```json
{ "art_max_unidades_pedido": 5 }
```

**Response `201`:** incluye `data.art_max_unidades_pedido` en el producto padre.

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | `art_max_unidades_pedido` no es entero positivo ni null |

---

### PUT `/api/articulos/:id_articulo` (edición)

**Auth requerida:** Sí

**Request body (nuevo campo, opcional):**
```json
{ "art_max_unidades_pedido": 5 }
```
Enviar `null` para quitar el límite existente.

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | `art_max_unidades_pedido` no es entero positivo ni null |

---

### GET `/api/articulos/:id_articulo`

Ahora retorna `art_max_unidades_pedido` (puede ser `null`).

---

## Lógica de Negocio Relevante

- El límite se envía a WooCommerce como `meta_data` con `key: "_max_unidades_pedido"` (no existe campo nativo de Woo para límites >1 unidad).
- **Pendiente de confirmar con el administrador de la tienda:** el `meta_key` exacto que interpretará el plugin/theme de WooCommerce. Mientras no se confirme e instale el plugin correspondiente, el valor se guarda en POS Pretty y se envía a Woo, pero no tendrá efecto visible en la restricción de compra.
- Errores de sincronización a Woo se registran en los campos existentes `art_woo_sync_status`/`art_woo_sync_message` (mismo mecanismo ya usado para el resto de la sincronización de artículos) — no bloquean el guardado local.
- Si el valor enviado es `null`, vacío o se omite, se persiste `NULL` y no se agrega `meta_data` a Woo.

---

## Criterios de Aceptación Verificados

- [x] Columna `art_max_unidades_pedido` agregada a `dbo.articulos` (NULL-able)
- [x] Los 3 endpoints (crear simple, crear variable, editar) persisten el campo correctamente
- [x] El valor se envía como `meta_data` en las llamadas `wcApi.post`/`wcApi.put` hacia WooCommerce
- [x] Auth vía `x-access-token` aplicado (sin cambios)
- [x] Validación: entero positivo o null; rechaza negativos/decimales con 400
- [x] Errores de sync a Woo se registran en `art_woo_sync_status`/`art_woo_sync_message` sin bloquear el guardado local
- [x] Queries parametrizadas
