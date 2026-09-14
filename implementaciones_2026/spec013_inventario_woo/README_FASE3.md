# SPEC-013 — Fase 3: reconciliación nocturna, vencimiento de remisiones, pantalla completa y configuración de Woo

| | |
|---|---|
| **Spec** | `negocio_prettymakeup/specs/013-sincronizacion-inventario-erp-woocommerce.md` (Tareas 7, 6, 8 y 9) |
| **Ramas** | `api_pretty`: `feature/spec013-fase3-reconciliacion` (desde `develop` `07fff50`) · `pretty_front`: `feature/spec013-fase3-reconciliacion` (desde `develop` `c544e90`) |
| **Fecha** | 14 septiembre 2026 (tarde) |
| **Estado** | **Aprobada por Eder y mergeada el 14/sep/2026 (~15:10):** `api_pretty` `develop` `f2fdd6e` → `main` `c0bdb00`; `pretty_front` `develop` `039f7c9` → `main` `78b230c`; pusheadas; front desplegado por Vercel. **Migración de Fase 3 aplicada en producción** con backup `C:\Ed\PSDATAFEB2024_20260914_pre_spec013_fase3.bak`. Arranque verificado con Node 20/23/25. Pendiente: `update-app.bat` + variables en el `.env` del Windows (§"Para producción"); Tarea 9.1/9.2 en producción esperan OK explícito. |

## Tarea 7 — Reconciliación nocturna (`jobs/reconciliarInventarioWoo.js`)

Cada noche a `WOO_RECONCILIACION_HORA` (default 02:00, hora del servidor) y bajo demanda (`POST /api/woo/reconciliar`):

1. Reintenta `woo_sync_pendientes` (pushes que fallaron).
2. Lee `vwExistencias` + ids de Woo de todos los artículos (`art_woo_id` / `art_woo_variation_id`, excluye padres variables) y **todo** el stock de Woo (`GET products?status=any&per_page=100&_fields=…` paginado + `products/{padre}/variations` de cada variable). ~13 s para 2.162 artículos / 1.535 productos.
3. Compara solo lo comparable: producto existe en Woo y `manage_stock=true`. Lo demás se reporta aparte: **`no_existen_en_woo`** (id huérfano — 638 en la copia del 14/sep, casi todos con existencia 0) y **`sin_control_stock`**.
4. Si `autocorregir` (env `WOO_RECONCILIACION_AUTOCORREGIR` o body `{autocorregir:true}`): push de las diferencias por el punto único, `origen=RECONCILIACION`. Nunca escribe en el ERP.
5. **Invariantes** (todos en el reporte):
   - `pedidos_comprometidos_sin_documento`: pedidos Woo en estado que compromete stock sin REM/VTA vigente (debe ser 0).
   - `rem_vencidas_sin_anular`: REM activas con `vence_el` pasado (las resuelve la Tarea 6).
   - `vta_activa_con_pedido_cancelado`: decisión contable humana (hoy: #11142 → VTA2182, #11143 → VTA2177).
   - `negativos_con_pedido_web` / **`negativos_sin_pedido_web`**: existencias negativas explicadas o no por una REM activa / VTA web de los últimos 7 días. Las segundas son el hueco que la alerta de Fase 2 no cubre (38 en la copia del 14/sep).
   - `diferencias_repetidas`: mismo artículo con diferencia en dos reconciliaciones seguidas → algo escribe stock por fuera del ERP.
6. Guarda todo en `woo_reconciliaciones` (`diferencias` e `invariantes` en JSON; columnas nuevas `origen`, `usuario`, `duracion_ms` — migración `sql/2026-09-14_spec013_fase3_reconciliacion.sql`, **aplicada solo en `PSDATA_PRUEBAS`**).

Endpoints (todos `verifyToken`): `POST /api/woo/reconciliar`, `GET /api/woo/reconciliaciones?limite=`, `GET /api/woo/reconciliaciones/:id`. Pantalla: panel **"Reconciliación ERP ↔ WooCommerce"** arriba de "Diferencia Inventario" (`pretty_front/src/components/ReconciliacionWooPanel.jsx`): último reporte, tarjetas, chips de invariantes (clic = detalle), historial, botones "Reconciliar ahora (reporte)" y "Reconciliar y corregir" (con confirmación).

**Probado (caso 14):** reporte 37 diferencias → con autocorregir 37 corregidas (log `RECONCILIACION`) → segunda pasada 0; `diferencias_repetidas` = 37 en la corrida intermedia y 0 después. 401 sin token.

## Tarea 6 — Vencimiento automático (`jobs/vencerRemisiones.js`)

Cada `WOO_VENCIMIENTO_INTERVALO_MIN` (60) si `WOO_VENCIMIENTO_ENABLED=true`: REM activas con `vence_el <= ahora` → `anularRemision(motivo "Sin pago en N días", notificarWoo)` — Woo primero, ERP después, push `REM_ANULADA`. `vence_el = NULL` = sin vencimiento (nunca vence). Un fallo por REM no frena a las demás (queda en `ultima_accion`, reintenta en la siguiente hora).

Endpoints (`verifyToken`): `POST /api/pedidos-web/:rem/extender` body `{hasta: ISO | null, motivo}` (solo REM activas; fecha futura; motivo obligatorio) y `POST /api/pedidos-web/vencer-ahora`. Pantalla: botón 🕒 "Extender o quitar el vencimiento" en cada REM activa (fecha sugerida +5 días; vacío = sin vencimiento); columna "Vence" muestra "sin vencimiento" cuando aplica. `GET /pedidos-web/salud` devuelve también el estado del job de vencimiento.

**Probado (caso 10):** REM28 con `vence_el` forzado 3 h al pasado → `vencer-ahora` la anuló, pedido #11283 `cancelled` en Woo con nota, ERP = Woo (4523 34/34). REM29 extendida +10 días; sin motivo → 400; fecha pasada → 400.

## Tarea 8 — Pantalla completa (lo que faltaba de la versión mínima)

- Nº de pedido enlaza al pedido en **wp-admin** (`{WC_URL}/wp-admin/post.php?post=ID&action=edit`; producción no usa HPOS — verificado `woocommerce_custom_orders_table_enabled=no`). `salud.wc_url` viene del backend.
- `Products.jsx`: botón "Sincronizar" → **"Reconciliar con Woo"** (decisión §8: se conserva porque ya pasa por el punto único con `origen=MANUAL` y usuario). `Orders.jsx`: los dos botones "Sync Woo" → "Reconciliar con Woo" (el spec decía retirarlos; se conservan por la misma razón — misma auditoría, y siguen siendo útiles como herramienta de soporte).
- `Dashboard.jsx`: el panel "Sincronización de Pedidos WooCommerce" **se mantiene con un aviso** de transición: sigue siendo el camino para registrar el atraso (Fase 0) mientras el importador esté en simulación. Se retira al pasar a `real` (fase 3 del §7).

## Tarea 9 — WooCommerce (configuración)

### 9.1 `epayco_reduce_stock_pending = yes` — ✅ validado en staging el 14/sep

Trazado sobre el código **actual** del plugin (`class-wc-transaction-epayco.php`, versión tras la actualización del 2/sep; las líneas del spec eran de la versión anterior): con `yes`, `handle_pending` pasa a `on-hold` (WooCommerce descuenta por su cuenta) y marca `epayco_order.order_stock_discount=1` **sin** `restore_stock`; `handle_approved` no vuelve a descontar (la bandera ya está en 1 y `_order_stock_reduced` frena a WC); `handle_failed` desde `on-hold` devuelve el stock **una sola vez** (`restore_stock` propio, porque el estado `epayco-cancelled` es custom y WC no lo devuelve solo; si el estado de cancelación fuera `cancelled`, deja que WC lo haga y no duplica).

Simulación en `pruebas.prettymakeupcol.com` (plugin activado temporalmente, `wp eval-file` con PHP 8.3, sin pagos reales; producto 4523, stock inicial 34):

| Flujo | Resultado |
|---|---|
| A: pending → (3) pendiente → (1) aprobado | on-hold con stock 33 y **sin devolución**; `epayco-processing` con stock 33 (sin doble descuento) |
| B: pending → (3) → (2) fallido | on-hold 32 → `epayco-cancelled` **33** (devuelto exactamente 1) |
| C: pending → (1) aprobado directo → (1) confirmación | on-hold 32 → `epayco-processing` 32 (un solo descuento) |
| Limpieza | cancelar A y C → 34; pedidos borrados; plugin desactivado de nuevo en staging |

11/12 checks; el único ✘ fue la aserción literal `_order_stock_reduced === 'yes'` (WC lo guarda como `1`). El staging quedó con la opción en `yes` (backup del option en `~/epayco_settings_staging_backup.json` en el servidor). **Caso borde documentado:** un pedido fallido/cancelado que ePayco vuelva a reportar como pendiente (`handle_pending` desde `epayco-cancelled`) podría descontar dos veces en Woo (WC al pasar a on-hold + `restore_stock('decrease')` del plugin); no cambia stock en el ERP, y la reconciliación lo corrige. Es un bug del plugin, no de esta configuración.

### 9.2 Higiene: webhooks y API key de envia.com — pendiente de OK (escritura en producción)

`wp_wc_webhooks` 14, 15, 16 (→ `ecartapi.com`) y `wp_woocommerce_api_keys` id 6 ("Envia.com - API", `read_write`) siguen activos con el plugin desactivado (último acceso 13/sep 22:27). Comandos (SSH producción, PHP 8.3 delante de wp):
```bash
cd ~/domains/prettymakeupcol.com/public_html
WP="/opt/alt/php83/usr/bin/php $(which wp)"
$WP wc webhook list --user=1 --fields=id,name,status,delivery_url            # confirmar 14,15,16
$WP wc webhook delete 14 --force --user=1; $WP wc webhook delete 15 --force --user=1; $WP wc webhook delete 16 --force --user=1
$WP db query "SELECT key_id, description, permissions, last_access FROM wp_woocommerce_api_keys"   # confirmar id 6
$WP db query "DELETE FROM wp_woocommerce_api_keys WHERE key_id = 6"
```

## Variables de entorno nuevas

| Variable | Default | Uso |
|---|---|---|
| `WOO_RECONCILIACION_ENABLED` | `false` | Programa la reconciliación diaria. |
| `WOO_RECONCILIACION_HORA` | `02:00` | Hora local del servidor. |
| `WOO_RECONCILIACION_AUTOCORREGIR` | `false` | `true` → empuja las diferencias (fase 5 del §7). El botón "Reconciliar y corregir" lo hace igual bajo demanda. |
| `WOO_VENCIMIENTO_ENABLED` | `false` | Job horario de vencimiento. |
| `WOO_VENCIMIENTO_INTERVALO_MIN` | `60` | |
| `REM_DIAS_VENCIMIENTO` | `5` | Ya lo usaba el importador para `vence_el`. |

`.env.pruebas` (local): reconciliación activa 02:00 sin autocorregir, vencimiento activo.

## Hallazgo operativo del 14/sep

`wp-cli` en Hostinger falla con "error crítico" porque el PHP de consola es **7.2** y ACF (actualizado el 2/sep) exige ≥7.4 (`Site_Health.php` línea 27). El sitio no está afectado. Invocar siempre `/opt/alt/php83/usr/bin/php $(which wp) …` (memoria `project_prettystore_wpcli_php72_hostinger`).

## Para producción (cuando Eder dé el OK) — spec §7 fases 4 a 6

1. Merge de ambas ramas a `develop` → `main` (front primero, Vercel despliega; backend después con `update-app.bat`). Sin dependencias nuevas.
2. Migración `sql/2026-09-14_spec013_fase3_reconciliacion.sql` en `PSDATAFEB2024` con backup (`aplicar-migracion.js PSDATAFEB2024 <sql>`, `CONFIRMO_PRODUCCION=si`).
3. `.env` de producción: `WOO_RECONCILIACION_ENABLED=true` (autocorregir `false` al principio: fase 4 = modo reporte, revisar el panel unas noches), `WOO_VENCIMIENTO_ENABLED=true` solo cuando el importador esté en `real` (en simulación no hay REM que vencer).
4. Tarea 9.1 en producción: `epayco_reduce_stock_pending=yes` con backup del option (`wp option get woocommerce_epayco_settings > ~/epayco_settings_prod_backup.json` y luego `wp eval` para cambiar la clave). Tarea 9.2: comandos de arriba.
5. Fase 5 del §7: `WOO_RECONCILIACION_AUTOCORREGIR=true` cuando el reporte nocturno tienda a 0.

## Estado del entorno de pruebas al escribir esto

Backend `:3001` con Fase 3 (importador real 60 s, reconciliación 02:00 sin autocorregir, vencimiento 60 min), front `:5174`. `woo_reconciliaciones` en `PSDATA_PRUEBAS` con 4 corridas. REM activas: las de Eder + `REM29` (#11284, extendida al 24/sep). Staging: pedidos de prueba #11283 (cancelado por vencimiento) y #11284; los pedidos de la simulación ePayco (#11285–#11287) se borraron; el plugin ePayco sigue desactivado en staging.
