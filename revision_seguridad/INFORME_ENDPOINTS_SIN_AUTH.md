# Informe de Seguridad — Endpoints sin Autenticación

**Fecha:** 2026-08-13
**Alcance:** `api_pretty` (backend) — validado contra el consumo real en `pretty_front` (solo lectura, sin modificaciones)
**Autor:** Auditoría asistida — hallazgos verificados línea por línea en ambos repos

---

## Resumen ejecutivo

Se encontraron **60 endpoints** en `api_pretty` sin el middleware `verifyToken`/`auth` aplicado. No existe protección global en `index.js` — toda la seguridad es por-ruta, y ~15 archivos completos de `/routes` quedaron sin el patrón que sí usan `articulosRoutes.js`, `promocionRoutes.js` (parcial) y el resto del proyecto.

Se cruzó cada endpoint contra el uso real en `pretty_front` para clasificar el riesgo de remediar:

- **Grupo A — Seguro de proteger ya:** el frontend ya envía `x-access-token` en cada llamada. Agregar `verifyToken` en backend no rompe nada.
- **Grupo B — Requiere coordinación con frontend primero:** el frontend llama al endpoint **sin token** (o con un header que el backend no reconoce). Agregar `verifyToken` directamente **rompería la función en producción**.
- **Grupo C — Huérfanos:** ningún código del frontend los referencia. Bajo riesgo de romper algo al protegerlos, pero conviene confirmar que no los use otro sistema (Postman colecciones, scripts, integraciones internas) antes de asumir que es 100% seguro.

**Hallazgo puntual importante:** el middleware `verifyToken` (`middlewares/auth.js` / `middlewares/authMiddleware.js`) **solo lee `req.headers['x-access-token']`**. El caso `DiferenciaInventario.jsx` (`POST /woo/sync`) envía `Authorization: Bearer <token>` — un header que el backend no reconoce en absoluto. Desde la perspectiva del middleware, esa llamada llega **sin token**, aunque el frontend "crea" que está autenticando.

---

## Metodología

1. Se listaron todos los archivos de `/routes` en `api_pretty` (mezcla CommonJS/ESM) y se revisó, línea por línea, si cada `router.<método>(...)` incluye el middleware de auth como argumento.
2. Se confirmó que no hay `app.use()` global de auth en `index.js` (solo `express.json()`, `cors()`, `fileUpload()`).
3. Para cada endpoint sin auth, se buscó en `pretty_front` (repositorio separado, **no modificado**) si existe una llamada real hacia esa ruta, y si esa llamada incluye el header `x-access-token` (manual o vía el cliente centralizado `axiosInstance` en `src/axiosConfig.js`, que sí lo inyecta automáticamente por interceptor).
4. Se clasificó cada endpoint en Grupo A/B/C según el resultado.

---

## Grupo A — Seguro proteger ahora (frontend ya envía token)

**✅ APLICADO 2026-08-13.** Agregado `verifyToken` a las 6 rutas listadas. Verificado: servidor arranca sin errores, cada endpoint responde `401` sin token, y las rutas de lectura no tocadas intencionalmente (ej. `GET /promociones`) siguen respondiendo `200` sin cambios.

| Endpoint | Archivo backend:línea | Frontend (ref) |
|---|---|---|
| `POST /promociones/` | `routes/promocionRoutes.js:16` | `usePromociones.jsx:123`, `PromocionNew.jsx:423` |
| `PUT /promociones/:pro_sec` | `routes/promocionRoutes.js:17` | `usePromociones.jsx:173`, `PromocionNew.jsx:419` |
| `PUT /updateWooStock/:art_cod` | `routes/updateWooStockRoutes.js:8` | `Products.jsx:293` |
| `PUT/POST /inventory/adjustment` | `routes/inventoryRoutes.js:11-13` | `AjusteNew.jsx:48,205,211` |
| `PUT/POST /bundles/...` | `routes/bundleRoutes.js:10-13` | `EditProduct.jsx:330,640`, `CreateProduct.jsx:396` |
| `GET /proveedor(es)` | `routes/proveedorRoutes.js:6-7` | `ProviderSearchModal.jsx:26-28` |

**Nota:** algunas llamadas a `GET/PUT /order/:fac_nro` y `GET /kardex/:art_cod` también parecen enviar el header en ciertos puntos del código, pero de forma **inconsistente** (ver Grupo B) — se listan ahí por el llamado que sí importa (creación/anulación).

---

## Grupo B — Requiere coordinación con frontend antes de proteger

Si se agrega `verifyToken` a estos endpoints sin antes corregir el frontend, la función correspondiente **dejará de funcionar en producción** (responderá 401/403).

| Endpoint | Archivo backend:línea | Frontend (ref) | Problema detectado |
|---|---|---|---|
| `POST /order/` | `routes/orderRoutes.js:9` | `POS2.jsx:551,787` | Llamada sin header de auth |
| `PUT /order/:fac_nro` | `routes/orderRoutes.js:14` | `POS2.jsx:497` (sin header) vs. `POS2.jsx:731` (con header) | **Inconsistente dentro del mismo archivo** — dos llamadas al mismo endpoint, una con token y otra sin |
| `POST /order/anular` (montado también como `/ordenes/anular`) | `routes/orderRoutes.js:15` | `AnularDocumentoModal.jsx:15` | Sin header — anula facturas/cotizaciones sin auth |
| `POST /nits/` | `routes/nitsRoutes.js:13` | `CreateClientModal.jsx:45` | Sin header — creación de clientes abierta |
| `DELETE /productos/:id/fotos/:photoId` | `routes/productPhotoRoutes.js:13` | `photoService.js:46-49` | Sin header |
| `GET/POST/PUT /productos/.../fotos/*` (galería completa: listar, subir, marcar principal, sync-woo, reordenar) | `routes/productPhotoRoutes.js:7-22` | `photoService.js:8,22,58,70,82` | **Ninguna** llamada de este servicio envía header — toda la galería de fotos queda expuesta |
| `POST /woo/sync-article-image/:art_cod` | `routes/woo.js:35` | `ProductCard.jsx:22,24` | Sin header |
| `POST /woo/sync` (montado desde `wooSyncRoutes.js`, consumido como si fuera `/woo-sync/sync`) | `routes/wooSyncRoutes.js:21` | `DiferenciaInventario.jsx:84-88` | Envía `Authorization: Bearer`, que el backend **no reconoce** — equivale a sin token |
| `POST /documento-inventario` | `routes/documentoInventarioRoutes.js:7` | `Orders.jsx:275` | Sin header |
| `GET /ciudades/` | `routes/ciudadesRoutes.js:7` | `CreateClientModal.jsx:20` | Sin header |
| `GET /categorias/` | `routes/inventarioGrupoRoutes.js:13` | `useCategories.jsx:11` | Sin header |
| Rutas de `/inventario-conteo/*` (crear/editar/eliminar detalle, cambiar estado) | `routes/inventarioConteo.js:6-30` | `ConteoCreate.jsx` (varias líneas), `Conteos.jsx:45,175` | Mayoría sin header explícito — requiere revisión línea por línea antes de proteger, el flujo completo de conteo físico depende de esto |
| `GET /kardex/:art_cod` | `routes/kardexRoutes.js:7` | `ArticleMovementModal.jsx:21` | Header no confirmado explícitamente — verificar antes de proteger |

---

## Grupo C — Huérfanos (sin referencia en el frontend)

No se encontró ninguna llamada desde `pretty_front`. Antes de asumir que protegerlos es 100% seguro, confirmar que no los use otro consumidor (colección Postman, script interno, `pretty_admin` u otro frontend, cron externo).

| Endpoint | Archivo:línea |
|---|---|
| `PUT /confirmOrder/:fac_nro_woo` | `routes/confirmOrderRoutes.js:9` |
| `POST /promociones/:pro_sec/sincronizar-precios` | `routes/promocionRoutes.js:22` |
| `POST /promociones/sincronizar-multiples` | `routes/promocionRoutes.js:23` |
| `POST /promociones/test/sincronizacion-directa` | `routes/promocionRoutes.js:27` |
| `POST /woo/update-article-images` | `routes/woo.js:19` |
| `POST /woo/sync-weight-dimensions` | `routes/woo.js:132` (agregado 2026-08-12, ver nota abajo) |
| `GET /woo/audit-categories` | `routes/wooSyncRoutes.js:29` |
| `POST /woo/fix-category` | `routes/wooSyncRoutes.js:38` |
| `POST /woo/fix-all-categories` | `routes/wooSyncRoutes.js:46` |
| `GET /diagnostic/*` (4 rutas) | `routes/diagnosticRoutes.js:14,50,93,129` |
| `GET /subcategorias/old` | `routes/inventarioSubgrupoRoutes.js:65` |
| `GET /sales/` | `routes/salesRoutes.js:7` |
| `GET /syncOrders/` | `routes/syncOrdersRoutes.js:7` |
| `POST /test/test-sync`, `GET /test/sync-logs*` | `routes/testSyncRoutes.js:8,144,248` |

**Nota sobre `POST /woo/sync-weight-dimensions`:** este endpoint se implementó el 2026-08-12 como parte de la feature de peso/dimensiones para envia.com (ver `implementaciones_ia_2026/peso_dimensiones_productos_envia_12-08-2026/`), siguiendo deliberadamente el mismo patrón sin auth que el resto de `routes/woo.js` para mantener consistencia con el archivo. Al no tener consumidor en el frontend todavía (se llamaría manualmente o desde un script), es el candidato más simple de todo el listado para agregarle `verifyToken` sin ningún riesgo de romper nada.

---

## Casos especiales detectados

1. **`orderRoutes.js` montado dos veces** — en `index.js`, el mismo archivo de rutas se registra bajo `/api/order` y también bajo `/api/ordenes`. `AnularDocumentoModal.jsx` llama a `/ordenes/anular`, que resuelve al mismo controlador desprotegido que `/order/anular`.
2. **`GET /nits/` en Node no es el que usa el frontend** — `Clients.jsx` obtiene el listado de clientes vía un microservicio Spring aparte (`springService.js` → `springAxios`), no vía `api_pretty`. El endpoint Node `GET /nits/` queda sin auth y sin consumidor conocido desde el frontend actual — confirmar si algo más lo usa antes de decidir su tratamiento.
3. **Header incorrecto en `DiferenciaInventario.jsx`** — usa `Authorization: Bearer` en vez de `x-access-token`. Es un bug independiente de la falta de auth: aunque el backend ya validara ese endpoint, la llamada actual del frontend fallaría igual. Si se decide proteger `/woo/sync`, hay que corregir también ese header en el frontend (fuera del alcance de este repo, coordinaría con el equipo de frontend).

---

## Recomendación de plan de acción

1. **Grupo A primero** — agregar `verifyToken` a las 6 rutas listadas. Cambio mecánico, mismo patrón ya usado en el resto del proyecto (`router.<método>('/ruta', verifyToken, controller)`), sin coordinación externa necesaria.
2. **Grupo C, solo el nuevo (`sync-weight-dimensions`)** — protegerlo ahora, ya que no tiene consumidor y así no queda como una superficie abierta más tiempo del necesario.
3. **Grupo B — coordinar con frontend antes de tocar backend:**
   - Priorizar por severidad de negocio: `order`/`anular` (anulación de facturas) y `nits` (creación de clientes) primero, por ser escritura/destructivo sobre datos financieros.
   - Para cada endpoint, el frontend necesita agregar el header `x-access-token` en la llamada correspondiente (o migrar esa llamada a pasar por `axiosInstance`, que ya lo inyecta automáticamente vía interceptor — sería la solución más robusta a largo plazo, ya que evita que se repita este problema).
   - Caso especial `DiferenciaInventario.jsx`: corregir el nombre del header de `Authorization: Bearer` a `x-access-token`.
   - Una vez el frontend esté enviando el token en todos los puntos de llamada (incluyendo los casos inconsistentes como `POS2.jsx` con `/order/:fac_nro`), recién ahí agregar `verifyToken` en el backend.
4. **Resto de Grupo C (huérfanos)** — antes de proteger, confirmar con el equipo si hay otro consumidor (Postman, scripts, integraciones). Si se confirma que no hay nadie llamándolos, protegerlos sin riesgo; si hay un consumidor externo desconocido, aplicar el mismo proceso de coordinación que el Grupo B.

**No se modificó ningún archivo de código en este análisis** — este documento es solo diagnóstico. La implementación de los cambios de `verifyToken` queda pendiente de aprobación explícita, dado el riesgo de romper flujos en producción si se aplica en el orden incorrecto.
