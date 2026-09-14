# SPEC-013 — Fase 1: punto único de push de stock a WooCommerce

| | |
|---|---|
| **Spec** | `negocio_prettymakeup/specs/013-sincronizacion-inventario-erp-woocommerce.md` (Tareas 1 y 2) |
| **Rama** | `feature/spec013-fase1-push-unico` (desde `develop`) |
| **Fecha** | 14 septiembre 2026 |
| **Estado** | Código listo y probado en modo simulado contra la BD real. `PSDATA_PRUEBAS` creada el 14/sep/2026 (ver sección). **Pendiente:** aplicar la migración en `PSDATA_PRUEBAS`, levantar la instancia 3001, probar push real, pasar a `develop`. |

## Qué cambia

Antes, **nueve** puntos del ERP escribían `stock_quantity = vwExistencias` en WooCommerce con tres implementaciones distintas (`jobs/updateWooOrderStatusAndStock.js`, `utils/wooStockSync.js`, y código propio en dos controllers), dos de ellas sin dejar log. Ahora **todos** pasan por `services/wooStockService.js`:

| Disparador | Archivo | Antes | Ahora |
|---|---|---|---|
| Crear VTA (mostrador o COT→VTA) | `models/orderModel.js` `_createCompleteOrderInternal` | `updateWooOrderStatusAndStock` (stock + estado del pedido mezclados) | `postCommitVentaWoo` → `sincronizarExistenciasWoo(origen='VTA')` + `actualizarEstadoPedidoWoo` (mismo mapeo de estado que antes) |
| Confirmar pedido como VTA | `models/orderModel.js` `updateOrder` | ídem | ídem |
| Anular documento | `models/orderModel.js` `anularDocumento` | ídem — **y mandaba a Woo un estado calculado con el mapeo de facturación (`on-hold` → `completed`)** | solo stock (`origen='ANULACION'`); el estado del pedido no se toca |
| Crear / editar ajuste | `models/inventoryModel.js` | ídem — **mandaba `date_created` al producto** (cambiaba la fecha de publicación en Woo) | `origen='AJT'`, sin `date_created` |
| Crear / editar compra | `controllers/compraController.js` | `syncDocumentStockToWoo` / `syncArticleStockToWoo` (sin log en BD) | `sincronizarDocumentoWoo` / `sincronizarExistenciasWoo` (`origen='COM'`) |
| Cierre de mes (anula VTA) | `controllers/cierreMesController.js` | `syncDocumentStockToWoo` (sin log) | `sincronizarDocumentoWoo(origen='CIERRE_MES')` |
| Botón «Sincronizar» por producto | `controllers/updateWooStockController.js` | implementación propia, **sin log** | wrapper fino → `origen='MANUAL'` + usuario. Misma respuesta para el front |
| Botón «Sincronizar con WooCommerce» por documento | `controllers/documentoInventarioController.js` | implementación propia | wrapper fino → `origen='MANUAL'`. Misma respuesta para el front |
| `PUT /api/confirmOrder/:woo` (huérfano, SEC-10) | `controllers/confirmOrderController.js` | job viejo | delega en el servicio |
| `routes/testSyncRoutes.js`, `routes/wooRoutes.js` (huérfanas, SEC-10) | importan el job viejo | — | el job es ahora un **wrapper de compatibilidad** que delega en el servicio; conserva `getArticleStock/getArticleWooId/getArticleWooInfo/logEder` que usan `productPhotoController` y `wooSyncController` |

Se eliminó `utils/wooStockSync.js` (sin importadores). Desapareció el límite arbitrario de 90 líneas por documento (el servicio lotea).

**Ningún cambio de comportamiento visible para el negocio** salvo los dos arreglos marcados en negrita (anulación ya no marca el pedido como completado; los ajustes ya no cambian la fecha de publicación del producto).

## `services/wooStockService.js` — contrato

```js
const { sincronizarExistenciasWoo, sincronizarDocumentoWoo, actualizarEstadoPedidoWoo } = require('../services/wooStockService');
// o, desde ESM:  import { sincronizarExistenciasWoo } from '../services/wooStockService.js';

// SOLO después de transaction.commit(). Nunca lanza.
await sincronizarExistenciasWoo({ art_secs: ['2218', ...], origen: 'VTA', referencia: 'VTA2210', usuario: 'LAURA' });
// → { ok, enviados, errores, omitidos, pendientes, logId, messages, productUpdates, simulado? }

await sincronizarDocumentoWoo({ fac_nro: 'COM00080', origen: 'COM', usuario });   // resuelve los art_sec del documento
await actualizarEstadoPedidoWoo('11273', 'processing', 'Pago confirmado en el ERP');  // estado del pedido, separado del stock
```

Reglas que cumple: lee `vwExistencias` en el momento del push (nunca un valor calculado antes); serializa todos los pushes en una cola FIFO en memoria; `products/batch` en lotes de 10 para simples y `PUT products/{padre}/variations/{id}` para variaciones; 3 reintentos con backoff (1 s, 2 s, 4 s); si Woo sigue fallando deja el artículo en `woo_sync_pendientes` y retorna sin lanzar; siempre escribe en `woo_sync_logs`.

`origen` válidos: `REM_CREADA`, `REM_ANULADA`, `REM_FACTURADA`, `VTA`, `ANULACION`, `COM`, `AJT`, `CIERRE_MES`, `BUNDLE`, `RECONCILIACION`, `MANUAL`, `PENDIENTES`. Otro valor se registra como `DESCONOCIDO` con aviso.

### Variables de entorno (nuevas, todas opcionales)

| Variable | Default | Uso |
|---|---|---|
| `WOO_PUSH_ENABLED` | `true` | `false` → no llama a WooCommerce; registra el log con `status='SIMULADO'` y lo que **habría** enviado. Para el despliegue por fases y para pruebas. |
| `WOO_PUSH_BATCH_SIZE` | `10` | Tamaño del lote de `products/batch`. |

## Migración (Tarea 1) — `sql/2026-09-14_spec013_tarea1_esquema.sql`

Idempotente. Crea: fuente 6 / tipo `REM`, índice único `UX_factura_woo_vigente`, tablas `woo_pedidos`, `woo_sync_cursor`, `woo_sync_pendientes`, `woo_reconciliaciones`, y columnas `origen`/`usuario` en `woo_sync_logs`.

**El servicio funciona sin la migración** (detecta si `woo_sync_logs.origen` existe; si no, guarda origen/usuario dentro de `config` y avisa por consola), pero `woo_sync_pendientes` sí es necesaria para la cola de reintentos — sin ella, un push fallido solo queda en el log.

Orden: `PSDATA_PRUEBAS` primero → producción con backup previo.

### Índice único filtrado por fecha — por qué

`UX_factura_woo_vigente (fac_nro_woo, fac_tip_cod) WHERE fac_est_fac IN ('A','F') AND fac_fch_cre >= '20260914'`. El histórico tiene 7 pedidos Woo con **dos VTA activas cada uno** (misma clienta, mismo total, mismo día) — probablemente facturados dos veces. El índice protege el flujo nuevo sin obligar a limpiarlos ahora; el negocio debe revisarlos:

| Pedido Woo | Tipo | Documento | Fecha | Clienta | Total |
|---|---|---|---|---|---|
| 3402 | COT | COT27 | 2022-11-03 | Stefania Torres | 32000 |
| 3402 | COT | COT29 | 2022-11-03 | Stefania Torres | 32000 |
| 5807 | VTA | VTA505 | 2023-08-29 | Sandra Morales | 108200 |
| 5807 | VTA | VTA529 | 2023-08-29 | Sandra Morales | 108200 |
| 5816 | VTA | VTA504 | 2023-08-29 | Kattia Morales villegas | 100800 |
| 5816 | VTA | VTA530 | 2023-08-29 | Kattia Morales villegas | 100800 |
| 5817 | VTA | VTA503 | 2023-08-29 | Sandra Gomez | 143500 |
| 5817 | VTA | VTA531 | 2023-08-29 | Sandra Gomez | 143500 |
| 5818 | VTA | VTA502 | 2023-08-30 | SILVIA DELGADO | 179600 |
| 5818 | VTA | VTA532 | 2023-08-30 | SILVIA DELGADO | 179600 |
| 6821 | VTA | VTA981 | 2024-04-07 | Juliana Reyes | 57000 |
| 6821 | VTA | VTA995 | 2024-04-07 | Juliana Reyes | 57000 |
| 7459 | VTA | VTA1108 | 2024-07-14 | Sonia Esther Lerma Madero | 200800 |
| 7459 | VTA | VTA1112 | 2024-07-14 | Sonia Esther Lerma Madero | 200800 |

## Pruebas hechas (14/sep/2026, desde el Mac contra la BD real, `WOO_PUSH_ENABLED=false`)

- `node --check` y carga real (`import`/`require`) de los 9 archivos tocados: OK.
- `leerExistenciasParaWoo(['2218','NOEXISTE'])` → Termo 9292 (Woo 11236, existencia 26) + omitido "artículo no existe".
- Dos pushes concurrentes → se serializan (logIds consecutivos 2762, 2763); origen inválido → `DESCONOCIDO` con aviso.
- `sincronizarDocumentoWoo('VTA2205')` → 10 artículos resueltos desde kardex (logId 2764).
- Sin la migración aplicada: aviso por consola y log guardado igual (origen/usuario en `config`).
- `actualizarEstadoPedidoWoo` en modo simulado → no llama a Woo.

### Pruebas reales (14/sep/2026, `PSDATA_PRUEBAS` + `pruebas.prettymakeupcol.com` refrescado el mismo día)

Ejecutadas desde el Mac corriendo el código del ERP contra el entorno de pruebas (`DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config …`; no hace falta la instancia del Windows para probar backend):

| # | Caso del spec | Resultado |
|---|---|---|
| 1 | Push real de un artículo (Termo 2218) | Staging pasó de `stock 0 / outofstock` a `26 / instock` (existencia del ERP de pruebas) en 1.7 s; `woo_sync_logs` id 2765 con `origen=MANUAL`, `usuario=claude`, `status=SUCCESS` |
| 12 | Woo caído durante un push (host inválido) | Retorna `ok:false` en 5 s sin lanzar; 2 artículos en `woo_sync_pendientes` con `intentos=1` y el error DNS; log id 2766 `status=ERROR` |
| 12b | Woo vuelve → `reintentarPendientes()` | 2 enviados, cola vacía, log id 2767 `origen=PENDIENTES` |
| 15 | Suite E2E del sitio (`npm run e2e:staging`) | 9/9 tras el refresco del staging |

Producción verificada intacta después de cada prueba (`_stock` del Termo sigue en 0, valor puesto a mano por el equipo el 14/sep a las 09:20 para frenar ventas).

**Pendientes de probar:** caso 11 (VTA de mostrador con REM activa — requiere la Tarea 3/4), caso 13 (índice único con reproceso — Tarea 3), variaciones (`PUT products/{padre}/variations/{id}`; hay 5 productos variables en el catálogo).

## Ambiente de pruebas — `PSDATA_PRUEBAS` (creada el 14/sep/2026)

Creada por Claude con autorización de Eder, desde el Mac vía T-SQL (login `sa` del `.env`):

1. `BACKUP DATABASE PSDATAFEB2024 TO DISK='C:\Ed\PSDATA_20260914_pre_spec013.bak' WITH COPY_ONLY, COMPRESSION` — 84 MB de datos (17 MB comprimido), `RESTORE VERIFYONLY` válido. `COPY_ONLY` para no alterar la cadena de backups de producción. Es además el primer backup de producción desde el 15/abr/2026.
2. `RESTORE DATABASE PSDATA_PRUEBAS ... WITH MOVE` a `...\MSSQL\DATA\PSDATA_PRUEBAS.mdf` / `_0.ldf`, luego `SET RECOVERY SIMPLE` (la copia de febrero `pruebas_ps_02092026` quedó en FULL y su log ya pesa 1.6 GB).
3. Verificado: `factura` 4968, `facturakardes` 45990, `articulos` 2173, `nit` 782, `woo_sync_logs` 1816 — idénticos a producción. Último documento: VTA2207 (7/sep). Termo 9292 (`art_sec` 2218) con existencia 26.

**Forma más simple de probar backend: correr el ERP en el Mac contra el entorno de pruebas.** Existe `.env.pruebas` local (ignorado por git vía `.env.*`) con `PORT=3001`, `DB_DATABASE=PSDATA_PRUEBAS`, `WC_URL=https://pruebas.prettymakeupcol.com`, `WOO_PUSH_ENABLED=true` y la misma key REST de producción (funciona contra el staging porque la BD del staging es copia). Arranque: `DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config index.js` (el preload gana sobre los `dotenv.config()` internos, que no sobrescriben variables ya definidas).

Para la segunda instancia de `api_pretty` en el Windows (puerto 3001, solo necesaria cuando el frontend quiera probar contra pruebas): copiar `.env` a `.env.pruebas` cambiando `DB_DATABASE=PSDATA_PRUEBAS`, `PORT=3001`, `WC_URL=https://pruebas.prettymakeupcol.com` y una key REST creada en ese staging (`WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET`); arrancar con `pm2 start index.js --name api_pretty_pruebas` cargando ese archivo (`dotenv` lee `.env` por defecto: usar `DOTENV_CONFIG_PATH=.env.pruebas` o `node -r dotenv/config index.js dotenv_config_path=.env.pruebas`).

**Migración de Tarea 1 aplicada en `PSDATA_PRUEBAS` el 14/sep/2026** (8 objetos verificados; segunda ejecución idempotente OK; producción sigue sin migrar). Corrección hecha al aplicarla: `tipo_comprobantes` exige `tip_lon`/`tip_cli`/`tip_est` (NOT NULL) — la fila `REM` copia los de VTA (`6, 1, 'A'`).

La key REST `apiMiPunto` de producción funciona también contra `pruebas.prettymakeupcol.com` (la BD del staging es copia de la de producción y conserva la misma fila en `wp_woocommerce_api_keys`), así que `.env.pruebas` puede reutilizar `WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET` cambiando solo `WC_URL`.

## Scripts (`scripts/`)

| Script | Uso |
|---|---|
| `backup-y-restaurar-bd.js [pre\|backup\|restore\|todo]` | Backup `COPY_ONLY` + `VERIFYONLY` de `BD_ORIGEN` (default `PSDATAFEB2024`) a `BAK_PATH` (default `C:\Ed\<origen>_<fecha>.bak`) y, si se pide, restore como `BD_DESTINO` (default `PSDATA_PRUEBAS`) con `RECOVERY SIMPLE` y comparación de conteos. Es el script con el que se creó `PSDATA_PRUEBAS`; sirve para el backup previo a migrar producción. |
| `aplicar-migracion.js <BD> [ruta.sql]` | Aplica la migración a la BD nombrada (aborta si el contexto no coincide), la ejecuta dos veces para probar idempotencia y verifica. Para `PSDATAFEB2024` exige `CONFIRMO_PRODUCCION=si`. |
| `ver-pushes.js [sku…]` | Últimos 10 `woo_sync_logs` con `origen`/usuario, cola de pendientes y ERP vs Woo por SKU. Solo lectura. |

Todos leen el `.env` del repo; para apuntar a pruebas: `DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config scripts/….js`.

## Pruebas manuales desde la interfaz (Eder, 14/sep/2026 — en curso)

Backend local (`DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config index.js`, puerto 3001) + `pretty_front` (`npm run dev`, 5174, `API_TARGET=http://localhost:3001`). Producto de prueba: Termo 9292 (arranca en ERP=26 / Woo=26). Verificación con `ver-pushes.js 9292`; criterio: **ERP = Woo** y ninguna pantalla se comporta distinto.

| # | Acción | Esperado |
|---|---|---|
| 1 | Venta de mostrador ×2 | 24/24, `origen=VTA` + usuario |
| 2 | Anular esa venta | 26/26, `ANULACION`; el pedido Woo no cambia de estado |
| 3 | Compra ×5 | 31/31, `COM` |
| 4 | Ajuste a 3 | 3/3, `AJT` |
| 5 | Botón "Sincronizar" del producto | `MANUAL` + usuario, sin cambio |
| 6 | Dashboard → Sincronización de pedidos (13/sep, En espera) → #11273 como COT → finalizar a factura | −7/−7, `VTA`; pedido en staging → "Completado" (mapeo actual) |

Resultados: _(pendiente de que Eder los reporte)_.

## Verificación tras desplegar

```sql
-- Todo push nuevo debe traer origen (tras la migración)
SELECT TOP 20 id, created_at, origen, usuario, fac_nro, status, success_count, error_count FROM dbo.woo_sync_logs ORDER BY id DESC;
-- Nada debe quedar sin origen después de la fecha de despliegue
SELECT COUNT(*) FROM dbo.woo_sync_logs WHERE origen IS NULL AND created_at > '<fecha despliegue>';
-- Pendientes (deben tender a 0)
SELECT * FROM dbo.woo_sync_pendientes;
```

Manual: registrar una compra de prueba y una VTA de mostrador en `PSDATA_PRUEBAS` apuntando al staging de Woo, y verificar que el `_stock` del producto en `pruebas.prettymakeupcol.com` queda igual a `vwExistencias`.

## Rollback

`git revert` del commit de la fase. La migración no estorba si se queda aplicada (tablas nuevas vacías, columnas nullable, el índice solo afecta filas creadas desde el 14/sep/2026 y solo bloquea duplicados reales).

## Relación con el plan de seguridad

No se tocó autenticación ni se borraron rutas. `confirmOrderRoutes.js` (SEC-10) y `documentoInventarioRoutes.js` (SEC-17) siguen en su cola; lo único que cambió es que ya no son caminos de push independientes.

## Siguiente

Fase 2 del spec: `jobs/importarPedidosWeb.js` en modo simulación (Tarea 3). Requiere `node-cron` (no hay scheduler en el ERP) y la migración de Tarea 1 aplicada (`woo_pedidos`, `woo_sync_cursor`).
