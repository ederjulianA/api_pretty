# SPEC-013 — Fase 2: importador automático, remisión web (REM), relevo a VTA y anulación

| | |
|---|---|
| **Spec** | `negocio_prettymakeup/specs/013-sincronizacion-inventario-erp-woocommerce.md` (Tareas 3, 4, 5 + versión mínima de la 8) |
| **Ramas** | `api_pretty`: `feature/spec013-fase2-importador` (desde `develop`) · `pretty_front`: `feature/spec013-fase2-pedidos-web` (desde `develop`) |
| **Fecha** | 14 septiembre 2026 |
| **Estado** | **Implementada y probada en `PSDATA_PRUEBAS` + `pruebas.prettymakeupcol.com`** (casos 1–9, 11, 13 y 15 del spec §6). Sin merge, sin push, nada en producción. Commits `api_pretty`: `028d162` → `33da498` → `a79963c` → `b989c5f` → `6ac1825`; `pretty_front`: `ed668ce` → `829d53e` → `588ca86` → `5bf2071` → `6467915` → `a9c970f`. Eder empezó las pruebas desde la pantalla el 14/sep en la tarde (ver §"Pruebas de Eder"); pendiente su OK para merge. |

## Qué hace

Cada 60 s el ERP consulta a WooCommerce los pedidos modificados desde el último cursor y aplica la máquina de estados del spec §4.3:

| Estado Woo | Sin documento | REM `A` | REM `F` + VTA `A` |
|---|---|---|---|
| `pending`, `epayco-pending` (desde el 14/sep, tarde — ver §"Pendiente de pago también reserva") | **crear REM** si el pedido tiene ≤ `REM_DIAS_VENCIMIENTO` días; más viejo: nada (`SIN_DOC`, "checkout abandonado") | si el pedido cambió: anular y crear otra; si Woo lo movió a/desde `on-hold`: **re-afirmar stock** (`REM_REAFIRMADA`) | nada |
| borradores / papelera | nada (`SIN_DOC`) | nada | nada |
| `on-hold` | **crear REM** (reserva stock) | si el pedido cambió: anular y crear otra | nada |
| `processing`, `completed`, `epayco-processing`, `epayco-completed` | **REM + VTA por relevo** en la misma corrida | **relevo REM→VTA** | nada |
| `cancelled`, `failed`, `epayco-cancelled`, `epayco-failed`, `refunded`, `epayco-refunded` | nada | **anular REM** (stock vuelve) | **`REVISION`** (una persona decide) |

Toda transición que mueve kardex termina en un push al punto único de la Fase 1 (`sincronizarExistenciasWoo`) con `origen` `REM_CREADA` / `REM_FACTURADA` / `REM_ANULADA`. Desde la pantalla "Pedidos web" (o desde el cierre de mes) una persona puede **confirmar el pago** (REM→VTA + pedido Woo → `processing`) o **anular** (REM→`I` + pedido Woo → `cancelled`).

## Archivos

| Archivo | Qué es |
|---|---|
| `services/wooClient.js` (CJS, nuevo) | Cliente REST de Woo compartido (memoizado). `wooStockService` ahora lo usa. |
| `services/wooPedidoMapper.js` (ESM, nuevo) | Pedido Woo → cliente (`nit_sec`), líneas (`art_sec` por SKU → `variation_id` → `product_id`), observaciones, clasificación del estado. Extraído de `syncWooOrdersController.js`. Solo escribe `dbo.nit` si se le pide (`resolverNitSec({crear:true})`). |
| `models/pedidosWebModel.js` (ESM, nuevo) | `crearRemision`, `facturarRemision` (relevo, una transacción), `anularRemision`, `upsertWooPedido`, cursor/lock, `listarPedidosWeb`. |
| `jobs/importarPedidosWeb.js` (ESM, nuevo) | El job: `iniciarImportadorPedidosWeb()` (setInterval + guarda en memoria + lock en BD), `ejecutarCiclo()`, `procesarPedido()`, `decidirAccion()` (máquina de estados pura), `estadoImportador()`. |
| `controllers/pedidosWebController.js` + `routes/pedidosWebRoutes.js` (nuevos) | `GET /api/pedidos-web`, `GET /salud`, `GET /:woo_order_id/documentos`, `POST /:rem/facturar`, `POST /:rem/anular`, `POST /importar-ahora`. **Todas con `verifyToken`.** |
| `index.js` | Monta `/api/pedidos-web`; arranca el importador **después** de `app.listen` si `WOO_IMPORT_ENABLED=true`; banner muestra modo e intervalo. |
| `models/orderModel.js` | `_createCompleteOrderInternal` acepta `fac_est_woo` y `fac_total_woo` y valida REM duplicada; `anularDocumento` recibe `usuario` (→ `fac_usu_cod_mod`, log del push), acepta `REM` (push `REM_ANULADA`), escribe `fac_anu_obs`/`fac_anu_fec`, exige `fac_est_fac='A'`. |
| `models/inventoryModel.js`, `controllers/inventoryController.js` | Pushes `AJT` con `usuario` (observación (a) de Fase 1). |
| `controllers/orderController.js` | Pasa `req.user?.usu_cod` a `anularDocumento`. |
| `controllers/syncWooOrdersController.js` | La COT del importador manual ya escribe `fac_fch_cre = GETDATE()` (observación (b)). |
| `models/cierreMesModel.js`, `controllers/cierreMesController.js` | Cierre de mes reconoce REM: pedidos del periodo y pendientes incluyen `REM` (`A` o `F`); facturar/anular en bloque y estado masivo enrutan una REM activa a `facturarRemision`/`anularRemision`. |
| `sql/2026-09-14_spec013_fase2_woo_pedidos.sql` | Columnas nuevas en `woo_pedidos`: `woo_created_gmt`, `woo_cliente`, `woo_email`, `ultima_accion`, `alerta`. Idempotente. **Aplicada solo en `PSDATA_PRUEBAS`.** |
| `pretty_front/src/pages/PedidosWeb.jsx` (+ ruta `/pedidos-web` en `App.jsx` y menú) | Pantalla mínima: búsqueda por nº de pedido/documento, clienta y rango de fechas; filtros por estado con conteos (+ "Stock insuficiente"); tabla; salud del job; "Importar ahora", "Confirmar pago", "Anular"; detalle de documentos (incluye REM anuladas). Permiso: módulo `orders` o rol Administrador. |

### Convención del relevo REM → VTA (observación (c) de Fase 1)

VTA nueva con `fac_sec` propio; la REM queda en `F` con `REM.fac_nro_origen = VTA.fac_nro` (igual que COT→VTA, que es lo que leen `getOrdenes` y el cierre de mes); la VTA guarda además `VTA.fac_nro_origen = REM.fac_nro`, copia `fac_est_woo`, `fac_total_woo`, `fac_descuento_general` y `nit_sec`, y sus líneas son copia fiel de la REM (`kar_nat='-'`, `kar_fac_sec_ori`/`kar_kar_sec_ori` → REM, mismos precios, promos y costos). Todo en una transacción con `UPDLOCK` sobre la REM; idempotente (una REM `F` devuelve su VTA sin hacer nada).

## Variables de entorno (nuevas, todas opcionales)

| Variable | Default | Uso |
|---|---|---|
| `WOO_IMPORT_ENABLED` | `false` | `true` arranca el job dentro del proceso de la API. |
| `WOO_IMPORT_MODO` | `simulacion` | `simulacion`: solo escribe `woo_pedidos` (`estado_erp='SIMULADO'`, `ultima_accion` = lo que habría hecho); no toca `factura`, ni Woo, ni crea clientes. `real`: crea REM/VTA y empuja stock. |
| `WOO_IMPORT_INTERVALO_SEG` | `60` | Intervalo del polling (mínimo 15). |
| `WOO_IMPORT_SOLAPE_MIN` | `5` | Minutos que se restan al cursor en cada consulta (ver "modified_after es exclusivo"). |
| `WOO_IMPORT_MAX_INTENTOS` | `20` | Reintentos por pedido antes de `estado_erp='ERROR'`. |
| `WOO_IMPORT_USUARIO` | `SISTEMA` | `fac_usu_cod_cre` de los documentos que crea el job. |
| `REM_DIAS_VENCIMIENTO` | `5` | Días para `woo_pedidos.vence_el` (la Tarea 6 lo consumirá; hoy solo se muestra). |

`.env.pruebas` (local) ya tiene `WOO_IMPORT_ENABLED=true`, `WOO_IMPORT_MODO=real`. Producción arrancará en `simulacion` (spec §7 fase 2).

## Saldo insuficiente al crear la REM (spec §4.6) — "deber ser" acordado con Eder el 14/sep

**Sistema:** la REM **se crea igual, con todas sus líneas** (la venta ya ocurrió en la web; bloquearla escondería el problema), `vwExistencias` queda negativa y el push manda ese negativo a Woo (producto "agotado" en la tienda, que frena más ventas). Se marca `woo_pedidos.alerta` ("Stock insuficiente en N artículos: 4634 (pedidas 8, existencia −3)…"), sale `WARN` en el log, y la pantalla muestra badge rojo + chip "⚠ Stock insuficiente" con conteo. La REM sigue operable (confirmar/anular): no pasa a `REVISION`, que es para decisiones que el sistema no puede tomar. **La alerta es un estado vivo:** cada ciclo re-evalúa las REM activas y las filas con alerta (`revisarAlertasSaldo`) — si entra la compra/ajuste que faltaba se apaga sola; si una venta de mostrador deja sin saldo una REM creada con stock, aparece. Se limpia al anular la REM; se recalcula al reemplazarla; en simulación se anticipa (existencia − pedido). "Confirmar pago" con alerta no se bloquea (el pago es un hecho contable; si ya pagó por ePayco el job factura solo) pero la pantalla obliga a leer la advertencia ("Facturar de todas formas").

**Persona (procedimiento):** antes de despachar, el filtro "⚠ Stock insuficiente" debe estar vacío. Por fila: (1) contar físicamente; (2) si el producto **sí está**, registrar la entrada que faltaba (compra o ajuste `+` con motivo real) — la alerta se apaga sola; (3) si **no está**, hablar con la clienta y ejecutar la decisión **en wp-admin** (menos cantidad / otro producto → el job reemplaza la REM; cancelar → el job anula y devuelve stock) y ajustar el cobro; (4) si ya pagó y espera reposición, la alerta queda como deuda de producto hasta que entre la compra. **No hacer:** tocar stock en Woo a mano ni "Sincronizar" para forzar el número (P1), anular la REM sin hablar con la clienta, ajustar inventario sin conteo físico (así se llegó al caso 9292).

**Por qué aparece:** desde la tienda Woo no deja vender más del stock (sin backorders), así que una REM negativa siempre significa que el ERP tenía menos de lo que Woo mostraba: descuadre previo, venta de mostrador simultánea (ventana ≤60 s) o entrada no registrada en el ERP. Lo que la alerta **no** ve: ERP dice que hay y físicamente no (solo el conteo). Pendiente para la Tarea 7: reportar existencias negativas **sin pedido web asociado**.

**Probado:** #11282 (4634: 5 disponibles, 8 pedidas por REST) → REM27, ERP = Woo = −3, alerta y filtro visibles. Luego Eder registró desde la UI **AJT209 (+4 de 4634)** → en el siguiente ciclo la alerta se apagó sola ("Alerta de saldo resuelta…"), ERP = Woo = 1, y el push `AJT` salió con `usuario=EDER` (observación (a) de Fase 1 confirmada en uso real).

## Pendiente de pago también reserva (decisión de Eder, 14/sep/2026 ~19:00, rama `feature/spec013-pending-rem`)

Revisando la pantalla con producción ya en modo real, Eder pidió que los pedidos "Pendiente de pago" también entren al flujo REM ("si se confirma el pago se le debe facturar y despachar"). Se le mostró primero la evidencia de Woo en producción (marzo–sep/2026): 245 pedidos salieron de `pending`, **244 movidos por ePayco y 1 por una persona (para cancelarlo)**; el 100 % de los que pagaron lo hicieron en < 2 h; los que quedan en `pending` son checkouts abandonados en la pasarela (8 hoy, $1,59M, 2 de la misma clienta que reintentó). Se le ofrecieron tres opciones (botón manual "Reservar stock" — recomendada —, REM automática 5 días, REM automática 24 h) y eligió **REM automática para todo `pending`, 5 días**. Implementación:

| Cambio | Dónde |
|---|---|
| `pending` y `epayco-pending` → `PENDIENTE_PAGO` (igual que `on-hold`). Borradores/papelera siguen `SIN_COMPROMISO`. | `services/wooPedidoMapper.js` (`ESTADOS`, `wooHaDescontadoStock`) |
| Guarda: un `pending` con más de `REM_DIAS_VENCIMIENTO` días al procesarlo **no crea REM** ("checkout abandonado, no se reserva stock"). Solo frena la creación; si ya tiene REM sigue el flujo normal. | `jobs/importarPedidosWeb.js` (`pendingAbandonado` → `decidirAccion`) |
| **Re-afirmación de stock**: con REM activa, si Woo cambia el estado entre un estado que no descuenta (`pending`) y uno que sí (`on-hold`), Woo mueve `_stock` por su cuenta y el importador vuelve a escribir el número del ERP (`origen=REM_REAFIRMADA`). Caso real: #11254 fue `on-hold` → `pending` el 4/sep y Woo devolvió el stock. | `jobs/importarPedidosWeb.js` (caso `NADA`), `models/pedidosWebModel.js` (`reafirmarStockRemision`), `services/wooStockService.js` (`ORIGENES`) |
| **Orden en `facturarRemision` con `notificarWoo`**: primero pedido Woo → `processing`, después el push `REM_FACTURADA`. Antes era al revés con el comentario "processing no mueve stock (ya lo descontó en on-hold)", que deja de ser cierto para una REM nacida de `pending`: Woo descuenta al pasar a `processing` y habría quedado `Woo = ERP − n`. | `models/pedidosWebModel.js` |
| `POST /api/pedidos-web/importar-ahora` acepta `{reprocesar:true}`: vuelve a decidir sobre pedidos ya vistos en la misma versión (necesario para aplicar la regla nueva al backlog tras reposicionar el cursor). | `jobs/importarPedidosWeb.js` (`ejecutarCiclo`), `controllers/pedidosWebController.js` |

Sin migración ni cambios en `pretty_front`. **Pruebas** (`scripts/prueba-pending-rem.mjs` + `prueba-pending-viejo.mjs`, staging + `PSDATA_PRUEBAS`, 14/sep 19:15–19:25): T1 pending → REM31 (+5 d, ERP=Woo) ✔ · T2 pending→processing en Woo → relevo VTA2230, Woo descontó por su cuenta y el push lo corrigió ✔ · T3 confirmar pago desde el ERP → Woo processing primero, VTA2231, ERP=Woo ✔ · T4 pending→on-hold→pending con REM33: dos `REM_REAFIRMADA`, ERP=Woo en ambas ✔ · T5 cancelado en Woo → REM34 anulada, stock vuelve ✔ · T6 vencimiento → REM35 anulada + Woo cancelled ✔ · T7 pending de 8 días → sin REM, "checkout abandonado" ✔ (la REST de Woo ignora `date_created_gmt` al editar; se retrocedió por SQL en la BD de staging). Ensayo del backlog de septiembre en staging con `{cursor:'2026-09-01', reprocesar:true}`: 62 leídos, 0 errores, sin pushes espurios — pero en staging los 8 `pending` reales ya estaban `cancelled` (allí el cron de Woo sí corre; ver hallazgo abajo). Arranque verificado con Node 23 y 20.

**Hallazgo que condiciona el despliegue — WP-Cron de producción muerto desde el 31/jul/2026 20:35.** Todos los eventos (`woocommerce_cancel_unpaid_orders`, preload de WP Rocket, `imagify`, `bf_epayco_event`, `wp_version_check`…) están congelados en esa hora: es el momento exacto en que se puso `DISABLE_WP_CRON=true` + cron de hPanel. El PHP por defecto de la consola es 7.2 y con él WordPress ni carga (ACF; y WooCommerce 9 exige 7.4), así que un cron que invoque `php …/wp-cron.php` sin ruta nunca pudo correr. Lo que sí sigue vivo es Action Scheduler (runner propio) — por eso el 31/jul pareció que "funcionaba". Consecuencia para esta regla: Woo tiene `woocommerce_hold_stock_minutes=60`, es decir, **su regla nativa es cancelar todo `pending` sin pagar a los 60 min**; hoy no se aplica porque el cron está muerto. Al arreglar el cron, Woo cancelaría de inmediato los 8 `pending` actuales y cualquier REM de `pending` viviría ~1 h, no 5 días. Para que mande la decisión de Eder hay que **dejar `hold_stock_minutes` en blanco antes de reactivar el cron** (o aceptar la regla de 60 min y que la REM de pending sea, en la práctica, una reserva de una hora). `cron_data=no` en ePayco: la confirmación de pagos no depende del cron.

## Incidente del primer despliegue a producción (14/sep/2026, 14:48) — corregido con hotfix `78e40a1`

`update-app.bat` hizo `git pull` a `main` (`3422bf4`), `pm2 restart`, y el health check (`http://localhost:3000/`, 12 intentos × 5 s) nunca respondió → **rollback automático a la Fase 1** (`43ef515`), que volvió a responder 200. Producción no quedó afectada. Causa, reproducida en el Mac con Node 23: **ciclo ESM/CJS en el arranque**. `pedidosWebModel.js` importaba `orderModel.js` de forma estática, con lo que `orderModel` entraba al grafo ESM de `index.js` (`pedidosWebRoutes → pedidosWebController → pedidosWebModel → orderModel`); cuando el evaluador llegaba a `routes/orderRoutes.js` (CommonJS) → `require('../controllers/orderController')` → `require('../models/orderModel')`, el módulo estaba enlazado pero sin evaluar y Node ≤23 devolvía el namespace vacío: `ReferenceError: Cannot access 'getOrdenes' before initialization` → pm2 en bucle. **Node 25 (el de desarrollo) evalúa el módulo al vuelo y por eso todas las pruebas pasaron.** Fix: `orderModel` se carga con `import()` en el momento de uso (`crearRemision`, `anularRemision`), así queda fuera del grafo estático como antes de la Fase 2. Verificado arranque + endpoints con Node 20.20, 23.11 y 25.2, y el flujo REM30 crear/anular con Node 23. **Lección para el checklist de despliegue:** antes de mergear a `main`, arrancar el backend con Node 20 y 23 (`~/.nvm/versions/node/v20.20.0/bin/node -r dotenv/config index.js` con `PORT=3003`) y pedir `/`, `/api/pedidos-web/salud` y `/api/ordenes/<fac_nro>`. Pendiente: confirmar la versión exacta de Node del Windows (`node -v`).

## Hallazgos técnicos que condicionan el diseño

1. **`modified_after` de la REST de Woo es exclusivo** (probado el 14/sep: con el cursor exacto no vuelven los pedidos modificados en ese mismo segundo) y muchos pedidos comparten `date_modified_gmt` (cancelaciones masivas). El solape de 5 min es obligatorio; la idempotencia por `fac_nro_woo` hace inofensivo el reproceso.
2. **`status=any`, no lista de estados.** Con el plugin de ePayco desactivado (staging) sus estados custom no están en el enum de la REST y `status=epayco-processing` devuelve 400. Con `any` llegan igual; el filtro lo hace la máquina de estados.
3. **Una edición de líneas por REST no cambia `date_modified` del pedido** (almacenamiento CPT: solo status/`customer_note`/fechas lo tocan). En wp-admin sí (guardar el pedido). Consecuencia: un pedido editado por API sin cambio de estado no se detecta hasta el siguiente cambio de estado o la reconciliación (Tarea 7). Documentado como limitación conocida.
4. **Al anular desde el ERP, primero Woo y después el ERP.** Woo devuelve stock por su cuenta al cancelar (`wc_maybe_increase_stock_levels`); si el ERP empuja antes, el incremento posterior deja `Woo = ERP + n` (se observó 2 vs 3 en la primera prueba). Cancelando primero, el push de la anulación re-afirma el número del ERP. Si Woo rechaza la cancelación, **no** se anula en el ERP (evita una segunda REM si el pago llega después). Pasar a `processing` no mueve stock, así que ahí el orden no importa.
5. **Pedidos con error no frenan el cursor**: quedan en `woo_pedidos` con `error`/`intentos` y se releen **por id** en cada ciclo. Los `REVISION` no se reprocesan hasta que Woo cambie el pedido.
6. **COT legada sin facturar** para el mismo pedido → `REVISION` ("BLOQUEADO_COT"), nunca una REM encima (evita doble descuento cuando el equipo facture la COT). Solo aplica a lo que quede del flujo viejo durante la transición.
7. **Timeouts de red Mac → SQL Server** durante las pruebas (3 de 45 pedidos, "Failed to cancel request in 5000ms" / `ETIMEDOUT`, cada uno ~5 min por `requestTimeout`): el job los manejó bien (sin documentos parciales gracias al rollback por corte de conexión, reintento por id al siguiente ciclo, lock del cursor renovado por pedido). En producción la API y la BD están en la misma máquina.

## Pruebas (14/sep/2026, `PSDATA_PRUEBAS` + staging, `WOO_IMPORT_MODO=real`)

Primero **simulación** sobre los 45 pedidos modificados en septiembre: 0 errores de mapeo (SKU simples, variaciones `4760-TONO-1`/`9282-03-LATIN`, EAN), plan correcto para cada uno, y detectó dos casos reales para el negocio (#11142 y #11143: pedidos de julio cancelados en Woo el 10/sep con VTA2182/VTA2177 aún activas en el ERP → `REVISION`).

Después **modo real** (cursor al 1/sep): 45 leídos, 19 REM creadas, 14 de ellas facturadas por relevo en la misma corrida, 2 `REVISION`, 3 timeouts de red recuperados en el ciclo siguiente. Verificación: **66/66 artículos tocados con ERP = Woo** (1 sin `art_woo_id`, omitido), secuencias consistentes (`secuencia.FACTURA` = `MAX(fac_sec)`, `tip_con_sec` REM/VTA = máximo real), todas las REM con `fac_fch_cre`, REM `F` ↔ VTA `A` enlazadas en ambos sentidos, `kar_nat='-'`.

| # spec | Caso | Resultado |
|---|---|---|
| 1 | on-hold 2 SKU (#11246, #11247…) | REM `A`, kardex `-`, push `REM_CREADA`, Woo = existencia |
| 2 | #11246 → processing | `REM1` → `F`, `VTA2224` `A` (`fac_nro_origen` cruzados, `fac_est_woo` copiado), existencia igual, push `REM_FACTURADA` |
| 3 | #11247 → cancelled | `REM2` → `I`, stock sube, push `REM_ANULADA` (5 artículos) |
| 4 | #11277 creado ya `processing` | `REM21` + `VTA2225` en la misma corrida |
| 5 | #11276 `pending` → luego `on-hold` | nada (`SIN_DOC`) → `REM22` al pasar a on-hold |
| 6 | #11278 con SKU inexistente | sin REM parcial, `intentos` 1→2→3 con el error visible; al existir el SKU en el ERP, el reintento por id creó `REM23` y limpió el error |
| 7 | #11253 editado (9292 ×1 → ×2) | `REM6` → `I`, `REM20` `A` ×2, Termo −31 → −33, ERP = Woo |
| 8 | `POST /pedidos-web/REM22/facturar` (token) | `VTA2226`, pedido Woo → `processing` con nota "Pago confirmado en el ERP por claude"; segunda llamada → `ya_facturada` sin cambios |
| 9 | `POST /pedidos-web/REM25/anular` | REM `I`, pedido Woo `cancelled` con nota, **ERP = Woo (34/34)** tras corregir el orden Woo→ERP; sin motivo → 400; REM ya facturada → 400 con mensaje claro |
| 11 | VTA de mostrador ×1 de 9292 con `REM9` y `REM20` activas | existencia −33 → −34, push `VTA`, Woo = −34 |
| 13 | Segundo ciclo sobre el mismo rango (cursor al 1/sep) | 0 documentos nuevos para los 43 ya procesados; solo reintentó por id los 3 con error |
| 15 | Suite E2E del sitio (`npm run e2e:staging`) | 9/9 |
| — | `GET /api/pedidos-web` sin token | 401 |
| — | Cierre de mes | `obtenerCotizacionesPendientes(2026,9)` devuelve las 3 REM activas; `obtenerPedidosPeriodo` 20 REM + 1 COT |

**Pendientes de probar:** caso 10 (vencimiento — Tarea 6, no implementada), caso 12 con el job (Woo caído a mitad de ciclo; el push ya lo cubrió en Fase 1), caso 14 (reconciliación — Tarea 7), pedidos con **bundles** (no hubo ninguno en septiembre; el código los expande vía `expandirBundles` como el POS).

## Ajustes posteriores a la primera entrega (misma tarde del 14/sep, a pedido de Eder)

- **Ruta 404:** la pantalla se registró primero en `src/routes/AppRoutes.jsx`, que **nadie importa**; las rutas reales están en `src/App.jsx` (`829d53e`).
- **Búsqueda** por nº de pedido Woo o documento (`11270`, `#11270`, `REM15`, `vta2224`; ignora el filtro de estado), clienta (nombre/email, LIKE) y rango de fechas inclusivo en hora de Colombia (`33da498`, `588ca86`). Se recuerda en `localStorage`.
- **REM anulada conserva su referencia:** al reprocesar un pedido cancelado el job solo veía documentos vigentes y dejaba la fila en `SIN_DOC` sin REM; `obtenerDocumentosPedidoWoo` incluye ahora las REM en `I` (`rem_anulada`) → estado `ANULADO` con la REM más reciente (`33da498`). Los pedidos #11278–#11280 se recompusieron solos vía reintento por id.
- **Alerta de saldo** (sección anterior): `a79963c`, `5bf2071`, `6ac1825`, `a9c970f`.
- **Popup de documentos:** código y nombre del artículo (JOIN `articulos`), etiqueta de promo por línea, unidades, **total del documento**, descuento general y total pagado en Woo (incluye envío) (`b989c5f`, `6467915`).

## Pruebas de Eder desde la pantalla (14/sep, tarde — en curso)

Plan entregado en el chat (flujos A–L: confirmar pago, anular, pedido desde la tienda, pago confirmado en Woo, cancelado en Woo, edición en wp-admin, pedido que nace pagado, pendiente de pago, Importar ahora, POS con REM activa, cierre de mes, otras pantallas). Evidencia de que ya empezó: #11281 (FACTURADO, REM26) y AJT209 aparecieron desde la UI. Criterio: ERP = Woo tras cada flujo (`ver-pushes.js <sku…>`), wp-admin del staging con el estado esperado, filtro "Con error" vacío.

## Estado del entorno de pruebas al cerrar la sesión

- Backend con este código corriendo en el Mac en `:3001` (`DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config index.js`, importador **activo en modo real**, 60 s); `pretty_front` en `:5174` apunta ahí. Pantalla: `http://localhost:5174/pedidos-web`.
- REM activas al escribir esto: `REM9` (#11256, Annerys Lucena, 9292+4702), `REM15` (#11270, Jessica Correa, 4 SKU), `REM20` (#11253, Felipe Valcárcel, 9292×2), `REM27` (#11282, "CasoSaldo Prueba SPEC013", 4634×8, alerta ya resuelta). Eder puede haber cambiado esto desde la pantalla.
- Pedidos de prueba creados en el staging por Claude: #11276–#11280 y #11282 (clientas "Prueba SPEC013"). El producto de prueba `11275` se borró. Documentos de prueba en `PSDATA_PRUEBAS`: REM1…REM27, VTA2210…VTA2227 (usuario `SISTEMA`/`claude`), AJT209 (Eder).
- `woo_pedidos` en `PSDATA_PRUEBAS`: ~52 filas (2 `REVISION` reales, ~20 `FACTURADO`, REM activas, resto `SIN_DOC`/`ANULADO`).

## Para producción (cuando Eder dé el OK) — spec §7

1. Aplicar `sql/2026-09-14_spec013_fase2_woo_pedidos.sql` a `PSDATAFEB2024` con backup previo (`aplicar-migracion.js PSDATAFEB2024 <ruta.sql>` exige `CONFIRMO_PRODUCCION=si`).
2. Merge a `develop` → `main` (regla del repo) y `update-app.bat`.
3. `.env` de producción: `WOO_IMPORT_ENABLED=true`, `WOO_IMPORT_MODO=simulacion` durante 2–3 días; revisar `woo_pedidos` (`SELECT estado_erp, ultima_accion, error FROM woo_pedidos ORDER BY actualizado_en DESC`). **Antes de pasar a `real`: Fase 0** (registrar los pedidos de septiembre por el flujo actual, conteo físico → AJT); si no, la primera corrida real creará REM/VTA de todo el backlog contra existencias ficticias — es exactamente lo que hizo en el entorno de pruebas (el Termo 9292 quedó en −34).
4. Pasar a `real`; retirar el bloque "Sincronización de pedidos" del Dashboard (`pretty_front/src/pages/Dashboard.jsx`) — no se tocó en esta fase para no cambiar el flujo del equipo antes de tiempo.

### Qué hace y qué no hace la simulación (confirmado con Eder el 14/sep)

Solo escribe `woo_pedidos` (`SIMULADO` + `ultima_accion`) y `woo_sync_cursor`. **No** toca `factura`, `facturakardes`, `nit`, `woo_sync_logs`, ni nada en Woo (ningún PUT/POST). El flujo actual del equipo sigue intacto. No hay pérdida posible de registros.

### Transición simulación → real (después de la Fase 0)

El cursor avanza durante la simulación, así que un pedido que entró `on-hold` en esos días y sigue `on-hold` no se relee solo. Al cambiar a `real`: cambiar `WOO_IMPORT_MODO=real`, reiniciar, y **reposicionar el cursor al inicio de la simulación** (`POST /api/pedidos-web/importar-ahora` con `{"cursor":"YYYY-MM-DDT00:00:00Z"}`). El ciclo re-evalúa todo de forma idempotente (las filas `SIMULADO` se reprocesan por diseño): lo que ya tiene VTA por COT → `FACTURADO` sin tocar nada; `on-hold` sin documento → REM; cancelados → `SIN_DOC`; COT pendiente → `REVISION` (facturarla o anularla por el flujo viejo). **Hacerlo antes de la Fase 0 convertiría el backlog en REM/VTA contra existencias ficticias** (efecto Termo −34 de pruebas).

## Rollback

`WOO_IMPORT_ENABLED=false` apaga el job sin tocar código. Las REM ya creadas son documentos válidos (se anulan desde la pantalla). `git revert` del commit de la fase deja la Fase 1 intacta (el punto único de push no cambió de contrato; solo `getWcApi` se movió a `wooClient.js`).
