# Sincronización de Bundles con WooCommerce

**Estado actual:** Los productos bundle **no se sincronizan** a WooCommerce al crearlos con `POST /api/bundles`.

---

## Cómo funciona hoy

### Productos simples y variables (articulosModel)
- Al crear un artículo **simple** por el flujo de artículos, después del INSERT en BD se llama a la API de WooCommerce: `wcApi.post('products', wooData)` con `type: 'simple'`, y se guarda `art_woo_id` en `articulos`.
- Los productos **variables** tienen su propio flujo de creación en WooCommerce (padre + variaciones).

### Bundles (bundleModel)
- `POST /api/bundles` solo hace INSERT en:
  - `articulos` (con `art_bundle = 'S'`)
  - `articulosdetalle` (precios)
  - `articulosArmado` (componentes)
- **No** se llama a WooCommerce: el bundle no se crea en la tienda y `art_woo_id` queda NULL.

### Consecuencia
- Los bundles creados por la API **no aparecen en WooCommerce**.
- Si existe un job o proceso que “sincroniza productos locales → WooCommerce” y lee solo `articulos` con `art_woo_id`, los bundles sin `art_woo_id` podrían crearse en Woo como productos genéricos (si ese flujo los incluye), pero **no** con la lógica específica de bundle (descripción de componentes, meta `_es_bundle`, etc.).

---

## Cómo debería funcionar (Fase 4 – documentado)

Según `IMPLEMENTACION_ARTICULOS_BUNDLE.md`:

1. En WooCommerce el bundle debe crearse como producto **`type: 'simple'`** (WooCommerce no tiene tipo `bundle` nativo).
2. Descripción larga: HTML con la lista de componentes (ej. “Este combo incluye: 1× Producto A, 2× Producto B…”).
3. Meta en WooCommerce:
   - `_precio_mayorista` (precio mayor).
   - `_es_bundle` = `"S"`.
   - `_bundle_componentes_count`, `_bundle_componentes_json` (opcional, para referencia).

Para implementarlo habría que:

- En `bundleModel.createBundle`, después del `commit` y de tener `art_secStr` y los componentes, llamar a una función tipo `syncBundleToWooCommerce(art_secStr, art_nom, art_cod, precio_detal, precio_mayor, componentes)` que:
  - Arme el payload (name, type: 'simple', sku, regular_price, description HTML, meta_data).
  - Haga `wcApi.post('products', wooData)`.
  - Actualice `articulos.art_woo_id` con el ID devuelto por WooCommerce.
- Opcional: al actualizar componentes del bundle (`updateBundleComponents`), actualizar también el producto en WooCommerce (descripción y meta) con `wcApi.put(\`products/${art_woo_id}\`, ...)`.

---

## Resumen

| Flujo                         | ¿Sync a WooCommerce? |
|------------------------------|------------------------|
| Crear artículo simple (articulos) | Sí (articulosModel)   |
| Crear producto variable      | Sí (articulosModel)   |
| **Crear bundle (POST /api/bundles)** | **No (pendiente Fase 4)** |

Si quieres que los bundles se creen/actualicen en WooCommerce al usar la API de bundles, el siguiente paso es implementar la Fase 4 (función de sync en bundleModel + llamada desde createBundle y opcionalmente desde updateBundleComponents).
