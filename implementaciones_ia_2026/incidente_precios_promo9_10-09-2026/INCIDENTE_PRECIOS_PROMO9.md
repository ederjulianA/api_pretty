# Incidente: precios base sobrescritos en la promo 9 (Mercadillo Virtual)

**Fecha del daño:** 2026-08-12, 19:20:44 – 19:47:16 (hora del servidor)
**Detectado:** 2026-09-10
**Alcance:** 34 de los 56 artículos de la promo 9 (`MERCADILLO_VIRTUAL`, pro_sec 9). Ninguna otra promo está activa, así que no hay más artículos afectados por esta vía.

## Qué pasó

1. Ese día se ejecutó el lote de **estimación IA de peso/dimensiones** (spec `negocio_prettymakeup/specs/012-estimacion-ia-peso-dimensiones.md`, guardado a las 19:02). El script one-off actualizó **268 productos** vía `GET /api/articulos/:id` → `PUT /api/articulos/:id`, uno cada ~6 s. Hay evidencia en `woo_sync_logs` (ids 2456+, una entrada cada ~4 s desde 19:20:44) y en `articulos.art_woo_sync_message` (respuesta de Woo con `date_modified` 19:21–19:46, en orden ascendente de `art_cod`).
2. El spec indica tomar `precio_detal` y `precio_mayor` del GET y devolverlos en el PUT. Pero `getArticulo` (`models/articulosModel.js` ~L1040) devuelve esos dos campos **con la promoción activa ya aplicada**; los precios base van en `precio_detal_original` / `precio_mayor_original`, que el spec no menciona.
3. Para cada artículo de la promo 9 (activa y permanente), el script leyó `precio_detal = precio_mayor = precio_oferta` y lo escribió como precio base en `articulosdetalle` (listas 1 y 2). `updateArticulo` no valida que el precio base sea mayor a la oferta activa.
4. `updateArticulo` luego llamó `updateWooCommerceProduct`, que mandó a WooCommerce `regular_price = oferta`, `_precio_mayorista = oferta` y `categories = [grupo, subgrupo]`. Consecuencias en Woo:
   - `sale_price` quedó vacío y `on_sale = false` (una oferta igual al precio regular no se sostiene). `date_on_sale_from = 2026-06-23` quedó como residuo.
   - Se **reemplazó la lista de categorías**, eliminando la 769 "Mercadillo virtual" (que solo existe en Woo, asignada por `scripts/asignar-categoria-woo-promo.js`). **Por eso no se ven en la categoría.**
5. Los 22 artículos de la promo que están bien no pasaron por ese PUT (17 tienen `art_woo_sync_status` NULL; 5 se editaron antes de que existiera la promo).

Nadie editó precios a mano: el "usuario" fue el script del lote, con un token válido.

## Impacto secundario

Pedidos Woo importados después del 12-ago con artículos afectados quedaron con `kar_pre_pub_detal = kar_pre_pub_mayor = oferta` en `facturakardes`: 10 líneas VTA activas en 6 documentos (09-ago → 28-ago, ej. VTA2190, VTA2194), sus 10 líneas COT origen, y 4 líneas en 3 COT anuladas. El precio cobrado (`kar_pre`) es correcto; solo se distorsiona el "descuento" que muestran los dashboards para esas líneas.

## Recuperación

Los precios originales se recuperaron de `dbo.carga_inicial_costos` (snapshot feb-2026) y se validaron contra dos fuentes independientes: el `pro_det_descuento_porcentaje` de la promo (`oferta / (1 - pct)` = detal en los 34 casos) y `kar_pre_pub_detal/mayor` de la última venta previa al incidente. Las tres coinciden.

Orden de ejecución (ver `RESTAURAR_PRECIOS_PROMO9.sql`):
1. Ejecutar el SQL (hace backup, verifica estado, actualiza 34+34 filas, verifica).
2. Re-sincronizar la promo 9 a WooCommerce (guardar la promo desde `/promociones` o llamar el sync de promociones). Esa vía (`jobs/updateWooProductPrices.js`) envía `regular_price = precio_detal_original`, `_precio_mayorista`, `sale_price` y fechas, **sin tocar categorías**. No usar `PUT /api/articulos/:id` para esto.
3. `node scripts/asignar-categoria-woo-promo.js 9 769` para devolver la categoría.
4. Verificar en Woo el SKU 4593: `on_sale=true`, regular 27900, sale 13950, mayorista 18800, categoría 769.

## Para que no se repita

- **Backend (`updateArticulo`)**: rechazar con 400 un `precio_detal`/`precio_mayor` menor o igual al precio de oferta de una promo activa (`utils/precioUtils.js` ya tiene la regla "oferta < ambos precios"; hoy solo se aplica al crear la promo, no al editar el artículo). Habría bloqueado los 34 escritos.
- **Backend (`updateWooCommerceProduct`)**: no reemplazar la lista completa de categorías en Woo; conservar las que no gestiona el ERP (o al menos la 769).
- **Spec 012 / script de estimación IA**: usar `precio_detal_original` / `precio_mayor_original` en el round-trip. Aplica a cualquier consumidor que lea `GET /api/articulos/:id` y devuelva el payload completo en el PUT.
- 268 de los 594 productos con `art_peso_fuente = 'estimado_ia'` no tienen `art_woo_sync_status` (se cargaron por otra vía, no por el PUT). No fueron afectados por esto.

## Ejecución de la restauración — 2026-09-10 (autorizada por Eder)

| Fase | Resultado |
|------|-----------|
| 1. Pre-verificación | 34 dañados, 34 con fuente, sin backup previo |
| 2. `RESTAURAR_PRECIOS_PROMO9.sql` (vía `ejecutar_restauracion.js`) | backup `dbo.bak_articulosdetalle_promo9_20260910` (112 filas), 34 + 34 filas actualizadas, guardia OK, verificación 0 pendientes |
| 3. Post-verificación BD | 0 dañados; los 55 ítems activos con oferta < detal y < mayor |
| 4. `promocionModel.sincronizarPreciosPromocion(9)` | 56/56 productos sincronizados a Woo, 0 errores |
| 5. `node scripts/asignar-categoria-woo-promo.js 9 769` | 34 categorías restauradas, 21 ya la tenían, 0 errores |
| 6. Verificación en vivo en Woo | 55/55 con `on_sale=true`, regular = detal, sale = oferta, `_precio_mayorista` = mayor, categoría 769 |

La tabla de backup `dbo.bak_articulosdetalle_promo9_20260910` queda en BD; se puede eliminar cuando se confirme en la tienda que todo está bien.

**No corregido (pendiente de decisión):** las 24 líneas de `facturakardes` con `kar_pre_pub_detal/mayor = oferta` (impacto secundario) y los dos hardenings de backend listados arriba.

## Hardening aplicado — 2026-09-10 (rama `develop`, sin commit)

| # | Cambio | Archivo | Efecto |
|---|--------|---------|--------|
| 1 | `validarPreciosBaseContraOferta()` + `asegurarPreciosBaseValidos()` | `utils/precioUtils.js`, `models/articulosModel.js` | `updateArticulo` y `updateProductVariation` rechazan un precio base ≤ precio oferta fijo de la promo activa. El controlador responde `400` con `code: PRECIO_BASE_MENOR_OFERTA`. Habría bloqueado las 34 escrituras. |
| 2 | `fusionarCategoriasWoo()` | `models/articulosModel.js` (`updateWooCommerceProduct`) | Lee las categorías actuales del producto en Woo, reemplaza solo las que gestiona el ERP (todos los `inv_gru_woo_id`/`inv_sub_gru_woo_id`) y conserva el resto (769 Mercadillo, etc.). Si no puede leer Woo, omite `categories`. |
| 3 | Precios opcionales en `PUT /api/articulos/:id` | `controllers/articulosController.js`, `models/articulosModel.js` | `precio_detal`/`precio_mayor` van juntos (ambos o ninguno). Sin ellos no se toca `articulosdetalle`; a Woo se envían los vigentes en BD. El frontend siempre los envía → compatible. |
| 4 | `sale_price` coherente | `models/articulosModel.js` (`updateWooCommerceProduct`) | Si el artículo tiene promo activa en el ERP, el PUT a Woo incluye `sale_price` + `date_on_sale_from/to` (permanente → `''`). Sin promo en el ERP no se toca la oferta de Woo. |
| 5 | Historial de precios | `EstructuraDatos/05_historial_precios.sql` (**ejecutado en producción el 2026-09-10**, probado con UPDATE + ROLLBACK: registra solo cambios reales de `art_bod_pre`, con `usu_cod`/login/app/host), `models/articulosModel.js` | Tabla `historial_precios` + trigger `AFTER UPDATE` en `articulosdetalle` (cualquier vía de escritura). El modelo deja `req.user.usu_cod` en `SESSION_CONTEXT('usu_cod')` dentro de la transacción y lo limpia antes del commit/rollback. Inofensivo mientras el trigger no exista. |
| 6 | Docs | `CLAUDE.md`, `AGENTS.md` (punto 8 de Critical Considerations), `negocio_prettymakeup/specs/012-…md` (§4 paso 4 reescrito: no enviar precios, dry-run, usuario propio), `IMPLEMENTACION_BACKEND.md` de peso/dimensiones | — |

**Pruebas (2026-09-10):** 9 unitarias (regla + guardas del controlador, incluido el caso exacto del incidente → `400`) y E2E idempotente sobre el SKU 4593 real: PUT con precios conserva 769 y envía `sale_price 13950`; PUT sin precios no toca BD. Scripts en el scratchpad de la sesión, no en el repo.

**Observación fuera de alcance:** los 4 campos de peso/dimensiones que no vengan en el body del `PUT` se guardan como `NULL` (misma clase de problema: "el PUT pisa lo que no mandas"). Documentado en el spec 012; no se cambió.
