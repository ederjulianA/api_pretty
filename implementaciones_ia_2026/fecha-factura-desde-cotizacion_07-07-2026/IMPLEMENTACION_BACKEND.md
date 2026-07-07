# Backend Implementado — Fecha de factura respeta fecha de cotización original

**Fecha:** 2026-07-07 · **Estado:** Listo para integrar

---

## Archivos Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `controllers/orderController.js` | Modificado | `createCompleteOrder` ahora destructura `fac_fec` de `req.body` y lo reenvía a `orderModel.createCompleteOrder` |

No se modificó `models/orderModel.js` — ya soportaba el parámetro `fac_fec` opcional (fallback `new Date()`).

---

## Endpoint

### POST `/api/order`

**Auth requerida:** Sí (`x-access-token` header)

**Request body (nuevo campo opcional `fac_fec`):**
```json
{
  "nit_sec": "12345",
  "fac_usu_cod_cre": "admin",
  "fac_tip_cod": "VTA",
  "detalles": [ { "art_sec": "678", "kar_uni": 1 } ],
  "fac_fec": "2026-06-30"
}
```

- `fac_fec` (opcional, string `"YYYY-MM-DD"`): fecha que tomará la factura creada. Si se omite, se usa la fecha actual (comportamiento sin cambios).
- Uso esperado: enviarlo únicamente cuando se factura una cotización existente (`orderType === "COT"`), para que la factura resultante conserve la fecha original de la cotización.

**Response `200`:** Sin cambios respecto al comportamiento actual.
```json
{
  "success": true,
  "fac_sec": "890",
  "fac_nro": "VTA123",
  "message": "Orden creada exitosamente."
}
```

**Errores:** Sin cambios — `400` (falta `nit_sec` o `detalles`), `500` (error de transacción).

---

## Lógica de Negocio Relevante

- `fac_fec` no afecta `fac_fch_cre` (timestamp de auditoría, sigue usando `GETDATE()`).
- Si `fac_fec` se envía, se guarda tal cual en `dbo.factura.fac_fec` (tipo `DATE`, sin componente horario, por lo que no hay riesgo de desfase de zona horaria del driver mssql).

---

## Criterios de Aceptación Verificados

- [x] `POST /api/order` acepta `fac_fec` opcional en el body y lo reenvía a `orderModel.createCompleteOrder`.
- [x] Si `fac_fec` no se envía, el comportamiento es idéntico al actual (fecha de hoy) — fallback ya existente en el modelo (`fac_fec || new Date()`).
- [x] Si `fac_fec` se envía con una fecha válida (`YYYY-MM-DD`), la factura creada refleja esa fecha en `fac_fec`.
- [x] `fac_fch_cre` no se ve afectado por este cambio (columna separada, no tocada).
- [x] Auth vía `x-access-token` sigue aplicado sin cambios.
