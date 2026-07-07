# Backend Implementado — Asignar/Quitar Categoría WooCommerce por Promoción

**Fecha:** 2026-06-23 · **Estado:** Listo para integrar

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `controllers/wooCategoriaController.js` | Creado | 3 handlers + helper de batch processing |
| `routes/wooCategoriaRoutes.js` | Creado | 3 rutas protegidas con `verifyToken` |
| `index.js` | Modificado | Import y registro de `wooCategoriaRoutes` bajo `/api/woo` |

---

## Endpoints Implementados

### GET `/api/woo/categorias`

**Auth requerida:** Sí (`x-access-token` header)

Lista todas las categorías de WooCommerce. Pagina automáticamente si hay más de 100.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "id": 42, "name": "Black Friday", "slug": "black-friday", "count": 0 },
    { "id": 15, "name": "Ofertas", "slug": "ofertas", "count": 120 }
  ]
}
```

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `401` | Token ausente o inválido |
| `500` | WooCommerce API no responde |

---

### POST `/api/woo/promo/:pro_sec/asignar-categoria`

**Auth requerida:** Sí

Agrega una categoría WooCommerce a todos los artículos de la promoción que tengan `art_woo_id` válido. **Modo aditivo:** lee las categorías actuales del producto en Woo antes de hacer el PUT — nunca sobreescribe las categorías existentes. Si el producto ya tiene la categoría asignada, lo omite sin error.

**Parámetros URL:**
- `:pro_sec` — ID de la promoción (numérico)

**Request body:**
```json
{
  "woo_category_id": 42,
  "woo_category_name": "Black Friday"
}
```

- `woo_category_id` — requerido, entero positivo
- `woo_category_name` — opcional, solo se usa para logging

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "total": 25,
    "exitosos": 23,
    "omitidos": 1,
    "errores": 1,
    "detalle_errores": [
      { "art_cod": "ABC123", "art_nom": "Producto X", "error": "Request failed with status code 404" }
    ]
  }
}
```

- `total` — artículos procesados (con `art_woo_id` válido)
- `exitosos` — actualizados correctamente en WooCommerce
- `omitidos` — artículos sin `art_woo_id` (variaciones sin ID propio, o artículos no publicados en Woo)
- `errores` — fallos individuales de WooCommerce (no detienen el resto del procesamiento)
- `detalle_errores` — lista de artículos fallidos con su mensaje de error

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | Falta `woo_category_id` en el body, o no es entero positivo |
| `401` | Token ausente o inválido |
| `500` | Error interno del servidor |

> **Nota sobre 404:** Si la promoción no existe, `obtenerArticulosParaSincronizacion` retorna un array vacío (no lanza error). La respuesta será `200` con `total: 0`. Si se requiere un 404 explícito en ese caso, comunicarlo para extender el modelo.

---

### POST `/api/woo/promo/:pro_sec/quitar-categoria`

**Auth requerida:** Sí

Remueve una categoría del array de categorías de cada producto en WooCommerce. Operación idempotente: si el producto no tenía esa categoría, se cuenta como exitoso sin hacer PUT.

**Parámetros URL:**
- `:pro_sec` — ID de la promoción (numérico)

**Request body:**
```json
{
  "woo_category_id": 42
}
```

- `woo_category_id` — requerido, entero positivo

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "total": 25,
    "exitosos": 23,
    "omitidos": 1,
    "errores": 1,
    "detalle_errores": [
      { "art_cod": "ABC123", "art_nom": "Producto X", "error": "mensaje del error" }
    ]
  }
}
```

**Errores:**
| HTTP | Cuándo |
|------|--------|
| `400` | Falta `woo_category_id` en el body, o no es entero positivo |
| `401` | Token ausente o inválido |
| `500` | Error interno del servidor |

---

## Lógica de Negocio Relevante

### Artículos omitidos
Los artículos de la promoción que **no** tienen `art_woo_id` (o tienen `art_woo_id = 0`) se cuentan en `omitidos` y no se procesan. Esto incluye variaciones de productos variables que gestionan su stock por `art_woo_variation_id`, no por `art_woo_id`. Las categorías en WooCommerce se asignan al producto padre, no a las variaciones individuales.

### Rate limiting
Se procesan en batches de 10 artículos con 100ms de pausa entre batches para no saturar la API de WooCommerce. Para promociones con muchos artículos, el tiempo de respuesta puede tardar varios segundos — el frontend debe mostrar un indicador de progreso y **no cancelar la petición por timeout** (la petición puede tardar hasta ~30s para 300 artículos).

### Errores parciales
Los errores individuales de WooCommerce no detienen el procesamiento. El endpoint siempre retorna `200` con el resumen de resultados, incluso si algunos artículos fallaron. El frontend puede mostrar `detalle_errores` al usuario para que decida cómo proceder.

---

## Criterios de Aceptación Verificados

- [x] `GET /api/woo/categorias` retorna array de categorías con `id`, `name`, `slug`, `count`
- [x] `POST /api/woo/promo/:pro_sec/asignar-categoria` agrega la categoría sin eliminar las existentes (GET + merge + PUT)
- [x] `POST /api/woo/promo/:pro_sec/quitar-categoria` remueve solo la categoría indicada (GET + filter + PUT)
- [x] Los 3 endpoints tienen `verifyToken` aplicado
- [x] Respuesta incluye `total`, `exitosos`, `omitidos`, `errores`, `detalle_errores`
- [x] Artículos sin `art_woo_id` se omiten sin error
- [x] Errores individuales de WooCommerce no detienen el procesamiento de los demás artículos
- [x] Queries SQL parametrizadas (reutilizando `promocionModel.obtenerArticulosParaSincronizacion`)
