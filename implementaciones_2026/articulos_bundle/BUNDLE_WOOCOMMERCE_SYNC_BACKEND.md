# Bundle – Sincronización WooCommerce (Backend)

**Objetivo:** Al crear un bundle con `POST /api/bundles`, crear también el producto en WooCommerce y guardar `art_woo_id` en `articulos`.

---

## Reglas

1. **Tipo en WooCommerce:** siempre `type: 'simple'` (WooCommerce no tiene tipo `bundle`).
2. **Descripción:** HTML con la lista de componentes (nombre, código, cantidad).
3. **Meta obligatorios:** `_precio_mayorista`, `_es_bundle` = `"S"`, opcionalmente `_bundle_componentes_count` y `_bundle_componentes_json`.
4. **Categorías:** mismas que el resto de productos (desde `inventario_subgrupo` / `inventario_grupo` usando `inv_sub_gru_cod` del bundle).
5. **Stock:** `manage_stock: true`, `stock_quantity: 0` (se puede actualizar después con el flujo existente).
6. Si la creación en WooCommerce falla, no se revierte el bundle en BD; se registra el error y se devuelve el bundle creado (el front puede reintentar sync o mostrar aviso).

---

## Cambios en backend

**Archivo:** `models/bundleModel.js`

- Cliente WooCommerce (mismo patrón que `articulosModel.js`: `WooCommerceRestApi` con `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`, `wc/v3`).
- Función `generarDescripcionBundleHTML(componentes)`: recibe array con `{ art_nom, art_cod, cantidad }`, devuelve HTML (lista “Este combo incluye: …”).
- Función `syncBundleToWooCommerce(art_sec, art_nom, art_cod, precio_detal, precio_mayor, componentes, inv_sub_gru_cod)`:
  - Obtiene categorías WooCommerce por `inv_sub_gru_cod` (query a `inventario_subgrupo` + `inventario_grupo`).
  - Arma payload: name, type: 'simple', sku, regular_price, description (HTML), short_description (texto corto), manage_stock, stock_quantity: 0, meta_data (_precio_mayorista, _es_bundle, _bundle_componentes_count, _bundle_componentes_json), categories.
  - `wcApi.post('products', wooData)`.
  - Actualiza `articulos.art_woo_id` con el ID devuelto.
  - En errores de red/API: log y no lanzar (el bundle en BD ya está creado).
- En `createBundle`: después del `commit` de la transacción, obtener componentes con nombres (getBundleComponents o query directa), llamar a `syncBundleToWooCommerce` y devolver en la respuesta `art_woo_id` si aplica.

---

## Respuesta de `POST /api/bundles`

Incluir en `data` (cuando exista):

- `art_woo_id`: ID del producto en WooCommerce (null si el sync falló o no se intentó).

---

## Variables de entorno

Las mismas que para el resto de sync WooCommerce:

- `WC_URL`
- `WC_CONSUMER_KEY`
- `WC_CONSUMER_SECRET`

---

## Pruebas

1. Crear un bundle con `POST /api/bundles`.
2. Comprobar en WooCommerce que existe el producto con el SKU del bundle, tipo “simple”, descripción HTML con los componentes y meta `_es_bundle` y `_precio_mayorista`.
3. Comprobar en BD que `articulos.art_woo_id` tiene el ID del producto creado en WooCommerce.
