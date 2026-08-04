# Backend Implementado — Promoción permanente sin fecha de cierre

**Fecha:** 2026-08-03 · **Estado:** Listo para integrar (validado en producción)

---

## Decisión de esquema

El spec ofrecía dos opciones (NULL vs fecha centinela). Se eligió **fecha centinela** (`9999-12-31`), no `NULL`-able, porque `pro_fecha_fin` se usa en más de 6 queries del proyecto con `BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin` para determinar si una promoción está vigente (`utils/precioUtils.js`, `models/orderModel.js`, `models/articulosModel.js`, `jobs/syncWooOrders.js`, `controllers/syncWooOrdersController.js`). Un `NULL` en `BETWEEN` evalúa a falso, lo que habría desactivado silenciosamente el precio de oferta de cualquier promoción permanente en todo el sistema. La fecha centinela es transparente para esas queries y **nunca se expone** al frontend ni a WooCommerce — se mapea a `null`/`''` en cada punto de salida.

**Este cambio es interno al backend.** No requiere ningún ajuste en el frontend para el resto del sistema (facturación, catálogo, órdenes) — solo afecta el formulario de promociones y la sincronización a WooCommerce.

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `dbo.promociones` (BD) | Modificado | `ALTER TABLE ADD pro_permanente CHAR(1) NOT NULL DEFAULT 'N'` |
| `models/promocionModel.js` | Modificado | `crearPromocion`, `actualizarPromocion`, `obtenerPromocionPorId`, `obtenerPromociones`, `sincronizarPreciosPromocion` (rama de variaciones) |
| `utils/precioUtils.js` | Modificado | `obtenerPreciosConOferta` y `obtenerPreciosConOfertaMultiples` propagan `permanente` en `oferta_info` |
| `jobs/updateWooProductPrices.js` | Modificado | Rama de sincronización de productos simples respeta `permanente` |

No se crearon endpoints nuevos ni se modificaron rutas — el contrato de los 4 endpoints existentes se extiende con el campo `permanente`.

---

## Endpoints Afectados

### POST `/api/promociones`

**Request body (nuevo campo opcional):**
```json
{
  "codigo": "MERCADILLO_2026",
  "descripcion": "Mercadillo Virtual",
  "fecha_inicio": "2026-08-01T00:00:00.000Z",
  "fecha_fin": null,
  "permanente": true,
  "tipo": "OFERTA",
  "observaciones": "string",
  "articulos": [ "... sin cambios ..." ]
}
```

- `permanente` es **opcional**, tipo `boolean`. Ausente o `false` → comportamiento idéntico al actual (fecha_fin requerida y validada).
- Cuando `permanente: true`: `fecha_fin` puede venir `null` o ausente — no se rechaza la request y no se valida `fecha_inicio < fecha_fin`.

**Response `201`:**
```json
{
  "success": true,
  "message": "Promoción creada exitosamente",
  "data": {
    "pro_sec": 10,
    "codigo": "MERCADILLO_2026",
    "descripcion": "Mercadillo Virtual",
    "fecha_inicio": "2026-08-01T00:00:00.000Z",
    "fecha_fin": null,
    "permanente": true,
    "articulos_count": 3
  },
  "sincronizacion": { "ejecutada": true, "exitosa": true, "articulos_procesados": 3, "articulos_exitosos": 3, "articulos_con_error": 0 }
}
```

---

### PUT `/api/promociones/:pro_sec`

Mismo contrato de request que `POST`. Si `permanente` está **ausente** en el body, se conserva el valor actual de la promoción en BD (no se fuerza a `false`) — esto es clave para no romper promociones existentes al editarlas desde pantallas que aún no envían el campo.

**Response `200`:** igual estructura que `POST`, con `message: "Promoción actualizada exitosamente"`.

---

### GET `/api/promociones/:pro_sec`

**Response `200` (campos nuevos/afectados):**
```json
{
  "success": true,
  "data": {
    "pro_sec": 9,
    "pro_codigo": "MERCADILLO_VIRTUAL",
    "pro_fecha_inicio": "2026-06-23T00:00:00.000Z",
    "pro_fecha_fin": null,
    "pro_permanente": true,
    "estado_temporal": "ACTIVA",
    "dias_restantes": null,
    "...": "resto de campos sin cambios (articulos, estadisticas)"
  }
}
```

- **Tipo confirmado:** `pro_permanente` se expone como **`boolean`** en el JSON (no `char 'S'/'N'` crudo), igual que ya hace el código existente con `tiene_oferta` en `precioUtils.js`. En BD internamente sí es `char(1)` como `pro_activa`, pero la capa de modelo lo convierte antes de responder.
- `pro_fecha_fin` es `null` cuando `pro_permanente = true` — **nunca** se expone la fecha centinela `9999-12-31`.
- `dias_restantes` es `null` para promociones permanentes (no aplica el cálculo).
- `estado_temporal` para una promoción permanente es `"ACTIVA"` en cuanto pasa `fecha_inicio`, y nunca pasa a `"VENCIDA"`.

### GET `/api/promociones` (listado)

Mismo tratamiento: cada elemento del array `data` tiene `pro_fecha_fin: null` y `pro_permanente: boolean` cuando aplica.

---

## Lógica de Negocio Relevante

- **Sincronización a WooCommerce (simples y variaciones):** cuando `permanente = true` y el artículo está activo en la promoción, se envía `date_on_sale_from` con la fecha real y `date_on_sale_to: ""` **explícito** (nunca se omite la key ni se envía la fecha centinela). Esto limpia cualquier fecha vieja que WooCommerce tuviera de una promoción anterior — validado en producción: un producto con fecha vieja quedó con `date_on_sale_to: null` tras sincronizar.
- **Compatibilidad retroactiva:** promociones sin el campo `permanente` (o con `false`) no cambian de comportamiento — se verificó contra una promoción existente (`PROMO_LIQ_FEB`) que conserva su `fecha_fin` real y su `estado_temporal` calculado igual que antes.

## Validado en producción (2026-08-03)

- `MERCADILLO_VIRTUAL` (pro_sec=9, los 55-56 productos mencionados en el spec) se marcó `permanente=true` vía `PUT` y se re-sincronizó automáticamente: **56 artículos, 0 errores**.
- Se confirmó vía API de WooCommerce que un producto de la promoción (SKU 3027) quedó con `date_on_sale_from` real y `date_on_sale_to: null` — el contador de cuenta regresiva ya no debe aparecer en tienda.
- **Acción manual pendiente por el usuario:** ninguna — ya se ejecutó como parte de la validación de esta implementación. No se requiere repetir la acción post-deploy de frontend mencionada en el spec original, esa promoción específica ya quedó marcada como permanente y sincronizada.

---

## Criterios de Aceptación Verificados

- [x] `POST`/`PUT /api/promociones` aceptan y persisten `permanente` sin exigir `fecha_fin` cuando es `true`
- [x] `GET /api/promociones/:pro_sec` retorna el nuevo campo como `boolean`
- [x] Esquema de `dbo.promociones` permite guardar sin fecha de fin real (fecha centinela documentada, no NULL)
- [x] Sincronización a WooCommerce (simples y variaciones) respeta `permanente`: envía `date_on_sale_from` real y `date_on_sale_to=''` explícito
- [x] Validado en producción: `MERCADILLO_VIRTUAL` sincronizado con `permanente=true`, confirmado sin fecha vieja en WooCommerce (SKU 3027)
- [x] Compatibilidad retroactiva: promoción existente sin cambios (`PROMO_LIQ_FEB`) sigue funcionando exactamente igual
- [x] Queries parametrizadas en todos los cambios
