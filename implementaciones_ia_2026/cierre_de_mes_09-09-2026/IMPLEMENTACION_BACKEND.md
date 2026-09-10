# Backend Implementado — Cierre de Mes

**Fecha:** 2026-09-09 · **Versión:** 1.1 · **Estado:** Listo para integrar · migración SQL ya ejecutada en producción

Responde a `pretty_front/IMPLEMENTACIONES_2026_IA/cierre_de_mes_09-09-2026/SOLICITUD_BACKEND.md`.

---

## Cambios de la v1.1 (responde a SOLICITUD_BACKEND_AJUSTES.md)

**AJUSTE-1 — `cancelled` ya no bloquea el cierre.** `pedidos.items[]` gana el campo `resuelto`; `confirmado` conserva su significado. El `422` bloquea por `resuelto`.

**AJUSTE-2 — `no_pagado` anula la VTA asociada.** En la misma transacción que el cambio de estado. `estado-masivo` acepta `motivo` opcional y devuelve `vta_anulada`.

Detalle en cada endpoint más abajo.

## Migración

`EstructuraDatos/04_crear_tablas_cierre_mes.sql` **ya se ejecutó** en `PSDATAFEB2024`: 2 tablas, índice único filtrado, parámetros `comision_woo`/`comision_local` y módulo RBAC `cierre_mes` con 4 acciones para Administrador y Supervisor (**no** Vendedor). El script es idempotente.

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `EstructuraDatos/04_crear_tablas_cierre_mes.sql` | Creado | Tablas, índices, parámetros y RBAC |
| `models/cierreMesModel.js` | Creado | Consultas del período, cálculo del resumen, CRUD del cierre |
| `controllers/cierreMesController.js` | Creado | Los 9 endpoints |
| `routes/cierreMesRoutes.js` | Creado | Rutas bajo `/api/cierre-mes`, todas con `verifyToken` |
| `utils/comisionUtils.js` | Creado | Lectura de comisiones desde `dbo.parametros` |
| `models/ventasKpiModel.js` | Modificado | Eliminados los literales `0.05`/`0.025`/`5.0`/`2.5` |
| `controllers/orderController.js` | Modificado | Exporta `validarBundles` y `validarExistenciasVTA` para reutilizarlas |
| `index.js` | Modificado | Registro de `/api/cierre-mes` |

---

## Diferencias contra el spec

Todas verificadas contra código y datos de producción.

### 1. `rentabilidad` es **utilidad en pesos**, no porcentaje

El spec dejaba el campo sin definir (los ejemplos mostraban `0`). Se guarda `SUM(utilidad_linea)` = `kar_total − (kar_uni × kar_cos)`, en pesos.

Un porcentaje haría imposible el requisito de que el detalle cuadre con la cabecera: los porcentajes no se suman. En pesos, `SUM(cid_rentabilidad) == cie_*_rentabilidad` siempre.

### 2. `fac_sec` es `DECIMAL(12,0)`, no `DECIMAL(18,0)`

Verificado en `INFORMATION_SCHEMA`. `cierre_mes_detalle.fac_sec` usa `DECIMAL(12,0)` para que el tipo calce con `dbo.factura`.

### 3. Anulación en bloque escribe **3 columnas**

El spec pedía reutilizar `orderModel.anularDocumento` *y* escribir `fac_anu_obs`/`fac_anu_fec`, pero esa función escribe `fac_obs` y nunca toca las de anulación. Se escriben las tres: `fac_obs` (compatibilidad con las pantallas que ya lo leen) + `fac_anu_obs` + `fac_anu_fec`, más `fac_usu_cod_mod`/`fac_fch_mod`.

**Solo aplica a este endpoint.** El flujo de anulación del POS queda intacto.

### 4. El preflight ya **no devuelve 502** si WooCommerce falla

Devuelve `200` con:

```json
"pedidos": {
  "woo_disponible": false,
  "woo_error": "WooCommerce inaccesible: timeout",
  "total_woo": null,
  "faltantes": null,
  "total_local": 36,
  "items": [ ... ]
}
```

Los pasos 3 y 4 son 100% locales y no tienen por qué caerse con Woo. **El frontend debe bloquear el paso 2 cuando `woo_disponible === false`** y ofrecer reintentar.

### 5. `epayco-pending` no existe en la tienda

El spec lo incluía en los estados de conciliación. WooCommerce responde **400 a toda la consulta** si recibe un estado no registrado. Los estados reales de la tienda son:

`pending · processing · completed · epayco-processing · epayco-on-hold · epayco-completed · epayco-cancelled · epayco-failed · on-hold · cancelled · refunded · failed · checkout-draft`

El backend consulta los estados registrados y filtra la lista antes de contar, así que agregar o quitar estados en el plugin de pagos no rompe el preflight. Los efectivamente usados se devuelven en `pedidos.woo_estados`.

### 6. La lógica COT→VTA ya estaba en el backend

El spec decía que vivía en `POS2.jsx`. En realidad `orderModel._createCompleteOrderInternal` ya estampa `fac_nro_origen` en la COT (líneas 1013-1027) y ya devuelve `{ fac_sec, fac_nro }`. La advertencia de "hoy sólo retorna `{success, message}`" aplicaba a `PUT /api/order/:fac_nro`, no a `POST /api/order`.

Se reutiliza `createCompleteOrder` tal cual; no se reimplementó nada.

---

## 🔴 Discrepancia conocida con el dashboard de ventas

`GET /api/dashboard/ventas/ordenes-canal` reporta para julio 2026 **37 órdenes / $6.989.888**, mientras el cierre reporta **36 / $6.879.088**.

**El correcto es el del cierre.** La diferencia es `VTA2191` del **1 de agosto** ($110.800), que el dashboard cuenta dentro de julio:

- `ventasKpiController.js:115` hace `new Date(fecha_fin + 'T23:59:59')` → en UTC-5 eso es `2026-08-01T04:59:59Z`
- Al pasarlo a `sql.Date`, el driver `mssql` lo manda como **2026-08-01**
- La query usa `fecha_venta <= @fecha_fin` → incluye todo el 1 de agosto

Es un bug **preexistente** de `ventasKpiModel` (ya anotado como pendiente de migrar a `sql.VarChar(10)`), ajeno a esta implementación y fuera de su alcance. El cierre usa rangos semiabiertos `>= 'YYYY-MM-01' AND < 'YYYY-(MM+1)-01'` y no lo padece.

**Si un usuario compara el cierre contra el dashboard, va a ver diferencias.** Conviene corregir el dashboard en un ticket aparte.

---

## Endpoints Implementados

Base: `/api/cierre-mes` · **Todos requieren `x-access-token`.**

Errores comunes a todos: `401` sin token o token inválido · `500` error interno.

---

### 1. GET `/api/cierre-mes`

Listado paginado, más recientes primero.

**Query:** `page` (opcional, default 1) · `pageSize` (opcional, default 20, máx 100)

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "cie_sec": 1, "cie_anio": 2026, "cie_mes": 7, "cie_estado": "A",
      "cie_fec_cierre": "2026-09-09T10:22:11.000Z", "cie_usu_cod": "EDER",
      "cie_total_ordenes": 48, "cie_total_ventas": 8661018.00,
      "cie_total_comision": 388502.65, "cie_total_rentabilidad": 1813809.00,
      "cie_obs": "Cierre revisado con contabilidad",
      "cie_anu_fec": null, "cie_anu_usu_cod": null
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 3 }
}
```

---

### 2. GET `/api/cierre-mes/validar?anio=2026&mes=7`

**Response `200` — puede cerrar:**
```json
{ "success": true, "data": { "puede_cerrar": true, "motivo": null, "codigo": "OK" } }
```

**Response `200` — ya existe:**
```json
{ "success": true, "data": {
  "puede_cerrar": false,
  "motivo": "Ya existe un cierre activo para Julio 2026",
  "codigo": "CIERRE_EXISTENTE",
  "cierre_existente": { "cie_sec": 1, "cie_fec_cierre": "2026-09-09T10:22:11.000Z", "cie_usu_cod": "EDER" }
} }
```

**Response `200` — mes no vencido:**
```json
{ "success": true, "data": {
  "puede_cerrar": false,
  "motivo": "El periodo Septiembre 2026 aun no ha vencido. Solo se puede cerrar un mes ya terminado.",
  "codigo": "MES_NO_VENCIDO"
} }
```

Códigos: `OK` · `CIERRE_EXISTENTE` · `MES_NO_VENCIDO`. `cierre_existente` solo aparece con `CIERRE_EXISTENTE`.

| HTTP | Cuándo |
|---|---|
| `400` | `anio` fuera de 2000-2999 o ausente; `mes` fuera de 1-12 o ausente |

---

### 3. GET `/api/cierre-mes/preflight?anio=2026&mes=7`

Alimenta los pasos 2, 3 y 4 del wizard en un solo request.

**Response `200`:**
```json
{ "success": true, "data": {
  "periodo": { "anio": 2026, "mes": 7, "label": "Julio 2026" },
  "validacion": { "puede_cerrar": true, "motivo": null, "codigo": "OK" },
  "pedidos": {
    "woo_disponible": true,
    "woo_error": null,
    "woo_estados": ["pending","processing","completed","epayco-processing","epayco-completed","on-hold"],
    "total_woo": 36,
    "total_local": 36,
    "faltantes": 0,
    "items": [
      { "fac_sec": 5012, "fac_nro": "COT1911", "fac_nro_woo": "11160",
        "nit_nom": "MARIA PEREZ", "fac_fec": "2026-07-31T00:00:00.000Z",
        "fac_est_woo": "processing", "total": 189000.00,
        "confirmado": true, "resuelto": true, "facturado": true, "fac_nro_origen": "VTA2186" }
    ]
  },
  "cotizaciones": {
    "pendientes": 1,
    "items": [
      { "fac_sec": 5013, "fac_nro": "COT1912", "fac_nro_woo": "11161",
        "nit_nom": "JUAN GOMEZ", "fac_fec": "2026-07-31T00:00:00.000Z",
        "fac_est_woo": "epayco_processing", "total": 245000.00 }
    ]
  },
  "resumen": {
    "canales": [
      { "canal": "WooCommerce", "ordenes": 36, "ventas": 6879088.00,
        "ticket_promedio": 191085.78, "porcentaje_comision": 5.00,
        "comision": 343954.40, "rentabilidad": 1416739.00 },
      { "canal": "Local", "ordenes": 12, "ventas": 1781930.00,
        "ticket_promedio": 148494.17, "porcentaje_comision": 2.50,
        "comision": 44548.25, "rentabilidad": 397070.00 }
    ],
    "totales": { "ordenes": 48, "ventas": 8661018.00, "comision": 388502.65, "rentabilidad": 1813809.00 }
  }
} }
```

**Notas de contrato:**
- `resumen.canales` trae **siempre los dos canales**, aunque el mes no haya tenido movimiento en uno (con ceros).
- `fac_nro_woo` puede ser `null` en `cotizaciones.items` (cotizaciones locales). En `pedidos.items` nunca lo es.
- `fac_est_woo` puede ser `null`; en ese caso `confirmado` es `false`.
- `confirmado` = `fac_est_woo` ∈ `processing`, `completed`, `epayco_processing`, `epayco_completed` (guion **bajo**, como se persiste local). Úsalo para el chip de estado de la grilla.
- **`resuelto`** = `confirmado` **o** `fac_est_woo === 'cancelled'`. **Este es el flag que decide si el pedido bloquea el cierre**, no `confirmado`. Un pedido cancelado tiene `confirmado: false` y `resuelto: true`.
- `refunded`, `failed`, `epayco_failed`, `epayco_cancelled` y `epayco_refunded` dan `resuelto: false` y **siguen bloqueando**: nadie los resolvió dentro del wizard.
- `facturado` = `fac_nro_origen` no nulo.
- `total_woo` y `faltantes` son `null` cuando `woo_disponible` es `false`.

| HTTP | Cuándo |
|---|---|
| `400` | `anio`/`mes` inválidos |

---

### 4. GET `/api/cierre-mes/:cie_sec`

**Response `200`:** cabecera completa (todas las columnas de `cierre_mes`) más `detalle[]`.

```json
{ "success": true, "data": {
  "cie_sec": 1, "cie_anio": 2026, "cie_mes": 7, "cie_estado": "A",
  "cie_fec_cierre": "2026-09-09T10:22:11.000Z", "cie_usu_cod": "EDER",
  "cie_woo_ordenes": 36, "cie_woo_ventas": 6879088.00, "cie_woo_ticket_prom": 191085.78,
  "cie_woo_pct_comision": 5.00, "cie_woo_comision": 343954.40, "cie_woo_rentabilidad": 1416739.00,
  "cie_loc_ordenes": 12, "cie_loc_ventas": 1781930.00, "cie_loc_ticket_prom": 148494.17,
  "cie_loc_pct_comision": 2.50, "cie_loc_comision": 44548.25, "cie_loc_rentabilidad": 397070.00,
  "cie_total_ordenes": 48, "cie_total_ventas": 8661018.00,
  "cie_total_comision": 388502.65, "cie_total_rentabilidad": 1813809.00,
  "cie_obs": "Cierre revisado con contabilidad",
  "cie_anu_obs": null, "cie_anu_fec": null, "cie_anu_usu_cod": null,
  "detalle": [
    { "cid_sec": 1, "cie_sec": 1, "fac_sec": 5090, "fac_nro": "VTA2186",
      "cid_canal": "WooCommerce", "cid_fecha": "2026-07-31T00:00:00.000Z",
      "cid_total": 189000.00, "cid_rentabilidad": 38900.00, "cid_comision": 9450.00 }
  ]
} }
```

| HTTP | Cuándo |
|---|---|
| `400` | `cie_sec` no numérico o ≤ 0 |
| `404` | No existe ese `cie_sec` |

---

### 5. POST `/api/cierre-mes/pedidos/estado-masivo`

**Request:**
```json
{ "fac_secs": [5012, 5013, 5014], "accion": "no_pagado",
  "motivo": "Cliente no pagó tras 60 días" }
```

`accion`: `"confirmar"` → `completed` · `"no_pagado"` → `cancelled`. Se aplica local **y** en WooCommerce.

`motivo` es **opcional** y solo se usa con `no_pagado`: queda como observación de anulación de la VTA. Si no se envía, se usa `"Anulada por cierre de mes: pedido no pagado"`.

Los `fac_secs` duplicados se procesan una sola vez.

**El cambio dispara los emails estándar de WooCommerce** — es el comportamiento buscado, no se suprime nada.

### `no_pagado` anula además la VTA asociada

Si la COT tiene `fac_nro_origen` apuntando a una VTA **activa**, esa venta se anula en la **misma transacción** que el cambio de estado del pedido:

- `fac_est_fac = 'I'`, `fac_obs`, `fac_anu_obs`, `fac_anu_fec`, `fac_usu_cod_mod`, `fac_fch_mod`
- Si la anulación falla, **el pedido tampoco queda cancelado** (rollback): no puede quedar un pedido muerto con la factura viva.
- **El stock se revierte solo.** `dbo.vwExistencias` filtra `fac_est_fac = 'A'`, así que al marcar la cabecera todas las líneas del documento salen del cálculo — incluidas las de bundle, que comparten `fac_sec` con su padre. Es el mismo mecanismo del que ya depende la anulación del POS.
- Tras el commit se empuja el stock resultante a WooCommerce (valor absoluto, idempotente). Es best-effort: si falla, la operación local ya quedó firme y se registra en el log.
- Una VTA anulada así **desaparece del detalle del cierre y de los totales**, porque `obtenerFacturasPeriodo` solo toma `fac_est_fac='A'`.

⚠️ **La acción es de una sola vía.** Si después se marca `confirmar`, la VTA **no** se des-anula — hay que refacturar la cotización desde el POS.

**Response `200`** (best-effort: `success: true` aunque haya fallos parciales):
```json
{ "success": true, "data": {
  "totalItems": 3, "successCount": 2, "errorCount": 1,
  "resultados": [
    { "fac_sec": 5012, "fac_nro": "COT1904", "ok": true,  "local": true,  "woo": true,  "vta_anulada": "VTA2177", "mensaje": "Actualizado a cancelled; VTA2177 anulada" },
    { "fac_sec": 5013, "fac_nro": "COT1912", "ok": true,  "local": true,  "woo": false, "vta_anulada": null,      "mensaje": "Actualizado localmente; WooCommerce fallo: Invalid order ID" },
    { "fac_sec": 5014, "fac_nro": null,      "ok": false, "local": false, "woo": false, "vta_anulada": null,      "mensaje": "No existe el documento 5014" }
  ]
} }
```

`ok: true` con `woo: false` significa **el sistema local quedó actualizado pero WooCommerce no** — hay que resincronizar. `fac_nro` es `null` si el documento no existe.

`vta_anulada` trae el `fac_nro` de la venta anulada, o `null` si la COT no tenía factura activa asociada (o si la acción fue `confirmar`).

Se procesa en lotes de 10 con pausa de 100 ms para no saturar la API de WooCommerce.

| HTTP | Cuándo |
|---|---|
| `400` | `fac_secs` no es arreglo o está vacío; algún `fac_sec` inválido; `accion` distinta de `confirmar`/`no_pagado`; `motivo` no es texto |

---

### 6. POST `/api/cierre-mes/cotizaciones/facturar-bloque`

**Request:**
```json
{ "fac_secs": [5013, 5015] }
```

**Response `200`:**
```json
{ "success": true, "data": {
  "totalItems": 2, "successCount": 1, "errorCount": 1,
  "resultados": [
    { "fac_sec": 5013, "fac_nro": "COT1912", "ok": true, "fac_nro_generado": "VTA2207", "fac_sec_generado": 5090 },
    { "fac_sec": 5015, "fac_nro": "COT1914", "ok": false, "mensaje": "No se puede generar la factura. Los siguientes artículos no tienen existencia: LABIAL ROJO (12345)" }
  ]
} }
```

**Garantías:**
- **Una transacción SQL por cotización.** Un fallo individual no aborta el bloque ni deja documentos a medias.
- Se procesan **secuencialmente**: cada factura toma `UPDLOCK/HOLDLOCK` sobre `dbo.secuencia` y `dbo.tipo_comprobantes`; en paralelo se bloquearían entre sí.
- Conserva de la COT: `fac_fec`, `fac_descuento_general`, `lis_pre_cod`, y el `kar_total` línea a línea (que es lo que preserva cupones y descuentos ya aplicados).
- Genera `fac_tip_cod='VTA'` con `kar_nat='-'`, trazabilidad vía `kar_kar_sec_ori`/`kar_fac_sec_ori`, y estampa `fac_nro_origen` en la COT apuntando a la VTA.
- Valida existencias y stock de bundles con las mismas funciones que usa el POS.
- `fac_nro` se genera con `dbo.secuencia` + `dbo.tipo_comprobantes` bajo `UPDLOCK, HOLDLOCK`.

**Motivos de `ok: false`** (en `mensaje`): documento inexistente · no es COT · cotización anulada · ya facturada (indica el `fac_nro_origen`) · sin líneas · sin existencias · ya existe una VTA activa con ese `fac_nro_woo`.

| HTTP | Cuándo |
|---|---|
| `400` | `fac_secs` no es arreglo, está vacío, o algún valor es inválido |

---

### 7. POST `/api/cierre-mes/cotizaciones/anular-bloque`

**Request:**
```json
{ "fac_secs": [5013, 5015], "fac_obs": "Cliente no confirmó el pago tras 60 días" }
```

`fac_obs` obligatorio, **mínimo 10 caracteres** (se valida sobre el texto sin espacios sobrantes).

**Response `200`:**
```json
{ "success": true, "data": {
  "totalItems": 2, "successCount": 1, "errorCount": 1,
  "resultados": [
    { "fac_sec": 5013, "fac_nro": "COT1912", "ok": true,  "mensaje": "Cotizacion anulada" },
    { "fac_sec": 5015, "fac_nro": "COT1914", "ok": false, "mensaje": "La cotizacion COT1914 ya fue facturada (VTA2186); no se puede anular" }
  ]
} }
```

Escribe `fac_est_fac='I'`, `fac_obs`, `fac_anu_obs`, `fac_anu_fec`, `fac_usu_cod_mod`, `fac_fch_mod`. Nunca borrado físico.

| HTTP | Cuándo |
|---|---|
| `400` | `fac_secs` inválido; `fac_obs` ausente o con menos de 10 caracteres |

---

### 8. POST `/api/cierre-mes`

**Request:**
```json
{ "anio": 2026, "mes": 7, "cie_obs": "Cierre revisado con contabilidad" }
```

`cie_obs` es opcional (texto o `null`).

**Response `201`:**
```json
{ "success": true, "data": {
  "cie_sec": 1, "cie_anio": 2026, "cie_mes": 7, "cie_estado": "A",
  "cie_fec_cierre": "2026-09-09T10:22:11.000Z", "cie_usu_cod": "EDER",
  "cie_obs": "Cierre revisado con contabilidad",
  "canales": [ { "canal": "WooCommerce", "ordenes": 36, "ventas": 6879088.00, "ticket_promedio": 191085.78, "porcentaje_comision": 5.00, "comision": 343954.40, "rentabilidad": 1416739.00 },
               { "canal": "Local", "ordenes": 12, "ventas": 1781930.00, "ticket_promedio": 148494.17, "porcentaje_comision": 2.50, "comision": 44548.25, "rentabilidad": 397070.00 } ],
  "totales": { "ordenes": 48, "ventas": 8661018.00, "comision": 388502.65, "rentabilidad": 1813809.00 },
  "detalle_registros": 48
} }
```

**Garantías:**
- Revalida **en el servidor** las dos reglas de período. No confía en el frontend.
- Cabecera y detalle se escriben en **una sola transacción**, y las facturas se leen dentro de ella.
- Los porcentajes se leen de `dbo.parametros` en ese instante y se **congelan** en `cie_woo_pct_comision`/`cie_loc_pct_comision`. Cambiarlos después no altera cierres ya generados.
- La comisión se calcula y redondea **por factura** y luego se suma, así `SUM(cid_comision)` cuadra exactamente con `cie_*_comision`.
- El detalle incluye todas las `fac_tip_cod='VTA' AND fac_est_fac='A'` del período, ambos canales, incluidas las generadas durante el propio cierre. Excluye COT, AJT, COM y anulados.
- Rango semiabierto: `fac_fec >= 'YYYY-MM-01' AND fac_fec < 'YYYY-(MM+1)-01'`.

| HTTP | Cuándo |
|---|---|
| `400` | `anio`/`mes` inválidos; `cie_obs` no es texto |
| `409` | `codigo: "CIERRE_EXISTENTE"` (incluye `cierre_existente`) o `codigo: "MES_NO_VENCIDO"` |
| `422` | `codigo: "PERIODO_CON_PENDIENTES"` — quedan cotizaciones sin facturar o pedidos sin confirmar |

**Cuerpo del `422`:**
```json
{ "success": false,
  "error": "El periodo tiene documentos sin resolver",
  "codigo": "PERIODO_CON_PENDIENTES",
  "pendientes": {
    "cotizaciones_sin_facturar": 1,
    "pedidos_sin_resolver": 2,
    "pedidos_sin_confirmar": 2,
    "cotizaciones": [ { "fac_sec": 5013, "fac_nro": "COT1912" } ],
    "pedidos": [ { "fac_sec": 5020, "fac_nro": "COT1920", "fac_est_woo": "on_hold" } ]
  } }
```

`pedidos_sin_confirmar` es **alias** de `pedidos_sin_resolver`, con el mismo valor, para no romper al frontend ya desplegado. Migrá a `pedidos_sin_resolver`; el alias se retira en una próxima versión.

`pendientes.pedidos` lista los **no resueltos**: los `cancelled` ya no aparecen.

El `409` por concurrencia está garantizado por el índice único filtrado, no solo por la validación aplicativa: dos cierres simultáneos del mismo período no pueden coexistir.

---

### 9. POST `/api/cierre-mes/:cie_sec/anular`

**Request:**
```json
{ "cie_anu_obs": "Se detectó una factura duplicada en el período" }
```

`cie_anu_obs` obligatorio, **mínimo 10 caracteres**.

**Response `200`:**
```json
{ "success": true, "data": {
  "cie_sec": 1, "cie_anio": 2026, "cie_mes": 7, "cie_estado": "I",
  "cie_anu_fec": "2026-09-09T14:05:33.000Z", "cie_anu_usu_cod": "EDER",
  "cie_anu_obs": "Se detectó una factura duplicada en el período"
} }
```

Nunca borrado físico: cabecera y detalle se conservan. Al quedar `cie_estado='I'` el índice único libera el período y se puede volver a cerrar.

| HTTP | Cuándo |
|---|---|
| `400` | `cie_sec` inválido; `cie_anu_obs` ausente o con menos de 10 caracteres |
| `404` | No existe ese `cie_sec` |
| `409` | `codigo: "CIERRE_YA_ANULADO"` |

---

## Comisiones parametrizadas

`dbo.parametros`:

| `par_cod` | Valor inicial | Aplica a |
|---|---|---|
| `comision_woo` | `5.0` | canal WooCommerce |
| `comision_local` | `2.5` | canal Local |

Editables con el `PUT /api/parametros/:par_cod` que ya existe.

Si el parámetro falta, no es numérico o cae fuera de `[0, 100]`, se usa el default histórico (5.0 / 2.5) y se registra `[COMISION]` en el log. Los consumen tanto el cierre como `GET /api/dashboard/ventas/ordenes-canal`.

---

## Verificado

- [x] Tablas y el índice único filtrado `UX_cierre_mes_periodo` en el script de migración
- [x] Los 9 endpoints responden con el esquema indicado
- [x] `verifyToken` en **todos** los endpoints nuevos — probado: sin token → `401`
- [x] `validar` rechaza el mes en curso → `MES_NO_VENCIDO` (probado con septiembre 2026)
- [x] `validar` rechaza `anio`/`mes` inválidos o ausentes → `400`
- [x] Consultas del preflight contra datos reales de julio 2026: **36 pedidos**, **1 cotización pendiente**, **48 VTA (36 Woo / 12 Local)** — coinciden exactamente con los volúmenes del spec
- [x] Resumen por canal: Woo $6.879.088 / Local $1.781.930 — coincide con el spec
- [x] Comisión suma-del-detalle == comisión sobre el total (diferencia 0.00 en julio 2026); el método por factura garantiza el cuadre en todos los casos
- [x] Conteo de pedidos WooCommerce de julio 2026: **36** vs 36 locales → `faltantes: 0`
- [x] `GET /api/dashboard/ventas/ordenes-canal` sigue funcionando tras el refactor, con fallback a defaults y advertencia en log
- [x] Sin literales `0.05`/`0.025`/`5.0`/`2.5` en `ventasKpiModel.js`
- [x] El servidor arranca sin errores con las rutas nuevas registradas
- [x] Queries parametrizadas, sin concatenación de valores en SQL

### Verificado en la v1.1

- [x] Migración ejecutada en producción: índice único filtrado `([cie_estado]='A')`, `fac_sec DECIMAL(12,0)`, RBAC con 4 acciones para Administrador y Supervisor
- [x] `preflight` devuelve `resuelto: true` / `confirmado: false` para COT1904 y COT1905 (`cancelled`) — **0 pedidos sin resolver** en julio 2026
- [x] `POST /api/cierre-mes` ya no bloquea por pedidos cancelados
- [x] `POST /:cie_sec/anular` verificado end-to-end: deja `cie_estado='I'` y **libera el período** (`validar` vuelve a `puede_cerrar: true`)
- [x] `motivo` no-texto → `400`

**Pendiente de verificar en ejecución:** la anulación de VTA de AJUSTE-2 sobre datos reales, y `facturar-bloque`. Ambos escriben en producción y `estado-masivo` además notifica al cliente por WooCommerce.

---

## Fuera de alcance (reportado, no modificado)

- `routes/orderRoutes.js` y `routes/syncWooOrdersRoutes.js` siguen **sin middleware de auth**. Conviene un ticket aparte: protegerlos rompe consumidores hoy.
- El off-by-one de fechas en `ventasKpiController.js:115` descrito arriba.
