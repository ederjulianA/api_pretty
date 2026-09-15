# SPEC-014 — Cotización, remisión y factura como un solo flujo en el POS

| | |
|---|---|
| **Spec** | `negocio_prettymakeup/specs/014-cotizacion-remision-factura-pos.md` (reglas y decisiones cerradas por Eder el 15/sep/2026) |
| **Estado** | **Implementado y probado el 15/sep/2026** en `api_pretty` rama `feature/spec014-rem-respaldo` y `pretty_front` rama `feature/spec014-pos-cot-rem-vta`. **Sin merge ni push.** Migración aplicada solo en `PSDATA_PRUEBAS`. |
| **Pruebas** | Backend 41/41 (`prueba-backend-spec014.mjs`) · camino web 17/17 (`prueba-web-respaldo.mjs`) · edición de REM web 19/19 (`prueba-editar-rem-woo.mjs`) · UI con Playwright 22/22 (`prueba-ui-pos.mjs`) · rollback con la bandera en `false` ✔ · arranque con Node 23 y 20 ✔ |

## Qué cambia (resumen para quien mantiene el código)

1. **La naturaleza de kardex la decide el backend** (`utils/documentosUtils.js` → `naturalezaKardex`): COT `C`, REM `-`, VTA `-`; la VTA que nace de una REM lleva **`R`** y solo la crea `facturarRemision`. Lo que mande el cliente en `kar_nat` se ignora. `expandirBundles` hereda la naturaleza del documento.
2. **Modelo de respaldo** (bandera `REM_FACTURA_SIN_KARDEX=true`): al facturar una REM, la REM **sigue `A`** (es el movimiento de kardex), queda cruzada con la VTA (`fac_nro_origen` en ambas cabeceras, líneas con `kar_fac_sec_ori`), deja de vencer, y la VTA no vuelve a descontar. Con la bandera en `false` sigue el relevo de SPEC-013 (REM → `F`, VTA `-`). Las REM `F` existentes se leen como facturadas.
3. **Bloqueo por vínculo** (`destinoActivo`): COT cruzada con REM/VTA activa y REM cruzada con VTA activa no se editan ni anulan (409). Anular el destino libera el origen. Una VTA respaldada (líneas `R`) no se edita por líneas.
4. **REM manuales** desde el POS (sin `fac_nro_woo`): `fac_vence_el` = hoy + `REM_DIAS_VENCIMIENTO`, push `REM_CREADA`, vencen por el mismo job (sin tocar Woo). `factura.fac_vence_el` es la fuente del vencimiento; `woo_pedidos.vence_el` es espejo.
5. **Editar la REM de un pedido web desde el POS** (`pedidosWebModel.editarLineasRemisionWoo`, delegada desde `PUT /order/:rem`): Woo primero (`PUT orders/{id}` con `line_items`, subtotal/total del ERP, nota privada), la REM se reescribe con la respuesta de Woo pasada por `mapearPedidoWoo`, push `REM_EDITADA` de la unión de artículos. Solo con el pedido `pending`/`on-hold`; con pago ya confirmado → 409.
6. **Reportes**: venta = `fac_tip_cod='VTA' AND fac_est_fac='A'`, líneas `kar_nat IN ('-','R')` — `vw_ventas_dashboard` (migración), `auditiaFacturasModel`, `cargaCostosController`, `syncWooOrdersController`. `vwExistencias` y el kardex por artículo no cambian (`R` cae en `ELSE 0`). Cierre de mes: "facturado" = VTA activa cruzada; "pendiente" = sin destino activo. Reconciliación: invariante `doble_kardex` (debe ser 0).
7. **POS** (`POS2.jsx` + `components/pos/BotoneraDocumento.jsx`): botones por tipo, badge con vencimiento/pedido web/origen, solo lectura al estar bloqueado, `existencia_disponible` para editar REM/VTA. **Órdenes**: filtro REMISIONES, "Cruzada con", vencimiento, impresión de REM. **Pedidos web**: "Editar en el POS".

## Archivos

Backend: `utils/documentosUtils.js` (nuevo) · `models/orderModel.js` · `models/pedidosWebModel.js` · `services/wooStockService.js` (origen `REM_EDITADA`, `agregarNotaPedidoWoo`) · `jobs/vencerRemisiones.js` · `jobs/importarPedidosWeb.js` · `jobs/reconciliarInventarioWoo.js` · `controllers/orderController.js` · `controllers/cierreMesController.js` · `models/cierreMesModel.js` · `models/auditiaFacturasModel.js` · `controllers/cargaCostosController.js` · `controllers/syncWooOrdersController.js` · `sql/2026-09-15_spec014_tarea1_vencimiento_vista.sql`.

Front: `src/POS2.jsx` · `src/components/pos/BotoneraDocumento.jsx` (nuevo) · `src/components/OrderDrawer.jsx` · `src/components/OrderSummary.jsx` (`readOnly`) · `src/components/AnularDocumentoModal.jsx` · `src/hooks/usePrintCotizacion.jsx` · `src/pages/Orders.jsx` · `src/pages/PedidosWeb.jsx`.

## Contratos que cambian

- `POST /order`: acepta `fac_tip_cod: 'REM'` sin `fac_nro_woo`; rechaza con 400 una VTA/REM cuyas líneas apunten a una REM (`kar_fac_sec_ori`); 409 si la COT de origen ya está cruzada. Devuelve `fac_vence_el`, `fac_nro_origen`, `push`.
- `PUT /order/:fac_nro`: `fac_tip_cod` debe coincidir con el real (400 si no); `nit_sec` opcional; 409 bloqueado / VTA respaldada; REM de Woo → Woo primero; devuelve `push` y, para REM de Woo, `cambios`, `resumen`, `alerta`, `sin_cambios`.
- `POST /order/anular` (`/api/ordenes/anular`): acepta `REM` (Woo primero si es de un pedido web); 409 si el documento tiene destino activo; al anular una VTA respaldada devuelve `rem_liberada`.
- `GET /order/:fac_nro`: cabecera con `bloqueado`, `bloqueado_por`, `bloqueado_por_tipo`, `origen`, `fac_vence_el`, `fac_est_woo`; líneas con `existencia_disponible`.
- `GET /ordenes`: `documentos` = destino activo (REM o VTA) y `fac_vence_el`; `fue_cod=6` lista remisiones.
- `POST /pedidos-web/:rem/facturar`: también para REM manuales; devuelve `modelo: 'respaldo' | 'relevo'`.
- `GET /woo/reconciliaciones`: `inv_doble_kardex`.

## Trampas encontradas al implementar

- Un `ALTER TABLE ... ADD` y una sentencia que lea esa columna no pueden ir en el mismo lote de SQL Server: la migración usa `EXEC` / `sp_executesql` para el `UPDATE` y la verificación.
- `POST /order/anular` no lleva token: el usuario viaja en el body (`usuario`), que el front toma de `localStorage.user_pretty`.
- El POS conserva el precio con el que se creó la REM (`kar_pre_pub`): al editar la REM de un pedido web, Woo recibe ese precio (el del pedido) salvo que el POS cambie la lista. Los artículos que se agregan llevan el precio de la lista del ERP.
- Editar `line_items` por REST no mueve `date_modified` del pedido en Woo: el importador no re-lee por eso; si lo re-lee por un cambio de estado, las líneas ya coinciden.
- `WC_URL` no se puede cambiar en caliente, así que el caso "Woo caído → 502" no se pudo simular en el arnés; el camino es un `try/catch` alrededor del `PUT` que lanza `errorNegocio(…, 502)` antes de tocar el ERP.

## Para producción (cuando Eder dé el OK) — spec §8

1. Backup `COPY_ONLY` de `PSDATAFEB2024` (`spec013_inventario_woo/scripts/backup-y-restaurar-bd.js backup`).
2. Migración: `CONFIRMO_PRODUCCION=si node implementaciones_2026/spec013_inventario_woo/scripts/aplicar-migracion.js PSDATAFEB2024 implementaciones_2026/spec014_cot_rem_vta_pos/sql/2026-09-15_spec014_tarea1_vencimiento_vista.sql` (idempotente; compatible con el código actual).
3. Merge `feature/spec014-pos-cot-rem-vta` → `develop` → `main` en `pretty_front` (Vercel despliega). Merge `feature/spec014-rem-respaldo` → `develop` → `main` en `api_pretty`; `update-app.bat` en el Windows **con `REM_FACTURA_SIN_KARDEX=false`** en el `.env` (todo lo nuevo activo salvo el respaldo).
4. Verificar en producción: Órdenes con REMISIONES, una REM manual desde el POS, `GET /pedidos-web/salud`, reconciliación manual (`doble_kardex = 0`).
5. `REM_FACTURA_SIN_KARDEX=true` + `pm2 restart index --update-env`. Desde ahí las VTA de REM nacen `R`.
6. Rollback: bandera a `false` (las VTA `R` ya creadas siguen contándose por la vista) o `git revert` + `update-app.bat`. La columna y la vista no se revierten.
