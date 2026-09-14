# SPEC-013 — Fase 2: importador automático, remisión web (REM), relevo a VTA y anulación

| | |
|---|---|
| **Spec** | `negocio_prettymakeup/specs/013-sincronizacion-inventario-erp-woocommerce.md` (Tareas 3, 4, 5 + versión mínima de la 8) |
| **Ramas** | `api_pretty`: `feature/spec013-fase2-importador` (desde `develop`) · `pretty_front`: `feature/spec013-fase2-pedidos-web` (desde `develop`) |
| **Fecha** | 14 septiembre 2026 |
| **Estado** | **Implementada y probada en `PSDATA_PRUEBAS` + `pruebas.prettymakeupcol.com`** (casos 1–9, 11, 13 y 15 del spec §6). Sin merge, sin push, nada en producción. Pendiente: pruebas de Eder desde la pantalla "Pedidos web" y su OK. |

## Qué hace

Cada 60 s el ERP consulta a WooCommerce los pedidos modificados desde el último cursor y aplica la máquina de estados del spec §4.3:

| Estado Woo | Sin documento | REM `A` | REM `F` + VTA `A` |
|---|---|---|---|
| `pending` / borradores | nada (`SIN_DOC`) | nada | nada |
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

## Saldo insuficiente al crear la REM (spec §4.6) — decisión confirmada con Eder el 14/sep

La REM **se crea igual, con todas sus líneas** (la venta ya ocurrió en la web), `vwExistencias` queda negativa y el push manda ese negativo a Woo (producto "agotado" en la tienda). Lo que se añadió es la **alerta**: `woo_pedidos.alerta` ("Stock insuficiente en N artículos: 4634 (pedidas 8, existencia −3)…"), aviso `WARN` en el log, badge rojo en la fila y chip "⚠ Stock insuficiente" con conteo en la pantalla. La REM sigue operable (confirmar/anular); no pasa a `REVISION` porque eso es para decisiones que el sistema no puede tomar. La alerta se limpia al anular la REM (el stock volvió) y se recalcula al reemplazarla. En modo simulación se anticipa (existencia actual − pedido). Probado con #11282 (4634: 5 disponibles, 8 pedidas → REM27, ERP = Woo = −3, alerta visible). Nota: desde la tienda Woo no deja vender más del stock (sin backorders); el caso aparece cuando el ERP y Woo ya venían descuadrados o por ventas de mostrador simultáneas.

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

## Estado del entorno de pruebas al cerrar la sesión

- Backend con este código corriendo en el Mac en `:3001` (`DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config index.js`, importador **activo en modo real**, 60 s); `pretty_front` en `:5174` apunta ahí. Pantalla: `http://localhost:5174/pedidos-web`.
- REM activas para probar desde la pantalla: `REM9` (#11256, Annerys Lucena, 9292+4702), `REM15` (#11270, Jessica Correa, 4 SKU), `REM20` (#11253, Felipe Valcárcel, 9292×2).
- Pedidos de prueba creados en el staging: #11276–#11280 (clientas "Prueba SPEC013"). El producto de prueba `11275` se borró.
- `woo_pedidos` en `PSDATA_PRUEBAS` tiene 50 filas (2 `REVISION` reales, 18+ `FACTURADO`, 3 `REM_ACTIVA`, resto `SIN_DOC`/`ANULADO`).

## Para producción (cuando Eder dé el OK) — spec §7

1. Aplicar `sql/2026-09-14_spec013_fase2_woo_pedidos.sql` a `PSDATAFEB2024` con backup previo (`aplicar-migracion.js PSDATAFEB2024 <ruta.sql>` exige `CONFIRMO_PRODUCCION=si`).
2. Merge a `develop` → `main` (regla del repo) y `update-app.bat`.
3. `.env` de producción: `WOO_IMPORT_ENABLED=true`, `WOO_IMPORT_MODO=simulacion` durante 2–3 días; revisar `woo_pedidos` (`SELECT estado_erp, ultima_accion, error FROM woo_pedidos ORDER BY actualizado_en DESC`). **Antes de pasar a `real`: Fase 0** (registrar los pedidos de septiembre por el flujo actual, conteo físico → AJT); si no, la primera corrida real creará REM/VTA de todo el backlog contra existencias ficticias — es exactamente lo que hizo en el entorno de pruebas (el Termo 9292 quedó en −34).
4. Pasar a `real`; retirar el bloque "Sincronización de pedidos" del Dashboard (`pretty_front/src/pages/Dashboard.jsx`) — no se tocó en esta fase para no cambiar el flujo del equipo antes de tiempo.

## Rollback

`WOO_IMPORT_ENABLED=false` apaga el job sin tocar código. Las REM ya creadas son documentos válidos (se anulan desde la pantalla). `git revert` del commit de la fase deja la Fase 1 intacta (el punto único de push no cambió de contrato; solo `getWcApi` se movió a `wooClient.js`).
