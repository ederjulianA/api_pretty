# SPEC-015 — Pedido web con cupón: el ERP lo factura igual a lo que cobró Woo

Spec: `negocio_prettymakeup/specs/015-descuento-mayorista-por-monto.md` §5. La parte web (cupones `MAYOROCTUBRE5`/`MAYOROCTUBRE10`, plugin `precios-mayoristas` 2.34.0) está en producción desde el 2/oct/2026.

Ramas: `api_pretty` y `pretty_front` → `feature/spec015-cupon-web-fiel` (desde `develop` = `main`). Sin migración SQL ni variables de entorno nuevas.

## Qué cambia

| # | Dónde | Cambio |
|---|---|---|
| E2 | `models/pedidosWebModel.js` · `editarLineasRemisionWoo` | Si el pedido Woo tiene `coupon_lines` y la edición trae cambios de líneas → **409** con mensaje ("edítalo en WooCommerce → Recalcular"). Woo y la REM no se tocan. Sin cambios sigue devolviendo `sin_cambios`, así que facturar no se bloquea. |
| E5 | `services/wooPedidoMapper.js` · `lineasDifieren` | Además de artículo + cantidad, compara el total cobrado por artículo (tolerancia $1; componentes de bundle excluidos). Un cupón agregado o quitado en wp-admin a un pedido pendiente reemplaza la REM con los totales nuevos. |
| E1 | `pretty_front/src/POS2.jsx` · `facturarDesdeRemision` | REM de pedido web sin cambios de líneas → **no hace el PUT previo**; va directo a `POST /pedidos-web/:rem/facturar` (copia fiel de la REM). |
| E3 | `POS2.jsx` | Pedido web: el descuento se muestra por línea con el `kar_total` guardado (antes tomaba el `kar_des_uno` de la primera línea como % global). El % manual queda deshabilitado. |
| E4 | `POS2.jsx` | Pedido web: la lista mayor/detal es la de la importación; no se recalcula por `monto_mayorista`. |
| E2 (UI) | `POS2.jsx` · `OrderDrawer.jsx` | Pedido web con descuento por línea: aviso "Pedido web con cupón", líneas en solo lectura, "Agregar" avisa en vez de agregar. FACTURAR sigue activo. |

E6 (guardar el código del cupón en `kar_codigo_promocion`) no se hizo: el código ya queda en `fac_obs`.

## Pruebas (3/oct/2026, `PSDATA_PRUEBAS` + `pruebas.prettymakeupcol.com`, backend :3001, front :5174)

- `scripts/prueba-cupon-web.mjs` — **19/19**: REM con 5 % en la línea normal y 0 % en la de oferta (suma = total Woo, cupón en `fac_obs`); PUT con cambio → 409 y nada cambia; PUT igual → `sin_cambios`; VTA idéntica línea a línea con `kar_nat='R'`; cupón agregado por REST a un pedido importado → REM reemplazada con los totales nuevos, y un ciclo más sin cambios no la vuelve a reemplazar. Anula al final lo que crea.
- `scripts/prueba-ui-pos-cupon.mjs` (Playwright) — **10/10**: aviso visible, total $395.000 y descuento $20.000 iguales a Woo, % y lista deshabilitados, FACTURAR desde el POS **sin ningún PUT /order**, VTA idéntica, pedido Woo intacto. Anula al final.
- Regresión SPEC-014: `prueba-editar-rem-woo.mjs` **19/19** y `prueba-web-respaldo.mjs` **17/17** (editar un pedido web *sin* cupón sigue igual).
- E5 contra producción, **solo lectura**: las 26 REM web activas comparadas con sus pedidos Woo → **0 diferencias** (sin falsos positivos).
- Arranque con Node 23.11 y 20.20 (jobs apagados, :3002) → OK.

⚠ Los arneses de SPEC-014 y este usan el mismo artículo (4523). Si uno se interrumpe antes de su limpieza, el otro falla por existencias, no por código: anular los documentos de prueba y repetir.

## Despliegue

Sin migración. Orden: front (push a `main` de `pretty_front` → Vercel) y backend (`update-app.bat`). Cualquiera de los dos solo ya es seguro: el backend rechaza la edición con cupón aunque el front viejo la intente, y el front nuevo funciona con el backend viejo (solo evita el PUT).

Con esto deja de aplicar la regla operativa del 2/oct ("pedidos con cupón solo se facturan desde *Pedidos web*").
