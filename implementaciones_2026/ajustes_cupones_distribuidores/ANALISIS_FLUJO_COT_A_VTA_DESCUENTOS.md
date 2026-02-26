# Análisis: flujo COT → factura de venta (VTA) y descuentos / cupones

**Carpeta:** `implementaciones_2026/ajustes_cupones_distribuidores`  
**Fecha:** Febrero 2026  
**Objetivo:** Validar si, al pasar una cotización (COT) con cupón a factura de venta (VTA), el descuento se conserva y se persiste correctamente.

---

## 1. Flujo resumido

1. **Sync WooCommerce** → crea/actualiza pedidos locales como **COT** (`fac_tip_cod = 'COT'`) con `fac_descuento_general` y líneas en `facturakardes` (incl. `kar_total`).
2. El usuario abre la COT (vía `GET /api/orders/:fac_nro` → `getOrder`), puede **agregar, modificar o eliminar ítems** y guardar o **confirmar como factura**.
3. Al guardar o confirmar se llama **`PUT /api/orders/:fac_nro`** → `orderController.updateOrderEndpoint` → **`orderModel.updateOrder`**.
4. En ese proceso el documento puede seguir siendo COT o pasar a **VTA** según lo que envíe el cliente (`fac_tip_cod`).

Se debe asegurar que en todo este flujo el **descuento (cupón)** no se pierda ni se calcule mal.

---

## 2. Modelo actual: `models/orderModel.js`

### 2.1 Encabezado: `fac_descuento_general`

- **updateOrder** recibe `fac_descuento_general` (opcional).
- Si viene definido (`!== undefined`), se actualiza en `factura`.
- Si **no** se envía, la columna no se toca → se **mantiene el valor existente**.

**Conclusión:** El valor de encabezado **sí se conserva** si el cliente no lo modifica.

**IMPORTANTE CON EL PLAN DE SYNC:**
- En sync, `fac_descuento_general` contiene SOLO `fee_lines` negativos (no los cupones).
- El cupón está reflejado a nivel de línea: `kar_sub_tot` > `kar_total` (diferencia = descuento cupón).
- No se debe agregar el cupón a `fac_descuento_general` (evita doble-descuento).

---

### 2.2 Detalles: cómo se calcula `kar_total` (PROBLEMA IDENTIFICADO)

En **updateOrder** (y en **createCompleteOrder**), el total por línea **siempre se recalcula**:

```javascript
let kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
if (descuento > 0) {
  kar_total = kar_total * (1 - (descuento / 100));
}
```

**Problema:** Con el plan de sync, `getOrder` devuelve:
- `kar_total = item.total` (total CON cupón ya aplicado, porque `kar_total = quantity * item.price` y `item.price` refleja cupón)
- `kar_pre_pub = item.subtotal / quantity` (precio sin descuento)
- `kar_sub_tot = item.subtotal` (subtotal sin descuento)

Cuando el front reenvía estos detalles sin modificar, `updateOrder` hace:
```javascript
kar_total = kar_uni * kar_pre_pub = quantity * (subtotal/quantity) = subtotal
```

**Resultado:** Se calcula como subtotal (sin cupón) en lugar de usar el total con cupón que vino de `getOrder`. **Se pierde el descuento por línea**.

**SOLUCIÓN:** `updateOrder` debe respetar `detail.kar_total` cuando viene informado:
```javascript
if (detail.kar_total && Number(detail.kar_total) > 0) {
  kar_total = Number(detail.kar_total); // Usa lo que envía el cliente
} else {
  kar_total = kar_uni * kar_pre_pub * (1 - descuento/100); // Recalcula si es línea nueva
}
```

---

## 3. Controlador: `controllers/orderController.js`

- **updateOrderEndpoint** toma del body: `fac_tip_cod`, `nit_sec`, `fac_est_fac`, `detalles`, `descuento`, `fac_nro_woo`, `fac_obs`, **`fac_descuento_general`**, `fac_est_woo`.
- Pasa todo eso a `updateOrder`. No añade ni quita nada relevante para descuentos.
- **createCompleteOrder** (crear orden nueva) también recibe y pasa `fac_descuento_general`.

Conclusión: el controlador **ya permite** enviar `fac_descuento_general`. La responsabilidad de usarlo bien y de no sobrescribir totales de línea incorrectamente está en el **modelo** y en el **cliente** (qué envía).

---

## 4. Lectura de la orden: `getOrder` y `getOrdenes`

### Con el cambio de sync: kar_total YA refleja cupón

Después del plan de sync:
- `kar_total = item.total` (total CON cupón, porque `item.price` ya refleja el cupón prorrateado)
- `kar_sub_tot = item.subtotal` (subtotal SIN cupón)
- `fac_descuento_general = fee_lines` (NO incluye cupones; estos ya están en `kar_total`)

### getOrder

**Actual (INCORRECTO si kar_total tiene cupón):**
```javascript
total_final = totalDetalles - descuentoGeneral  // Doble resta si cupón está en kar_total y fac_descuento_general tiene cupón
```

**Correcto (con el plan de sync):**
```javascript
total_final = totalDetalles  // kar_total ya refleja cupón, no hay que restar de nuevo
// fac_descuento_general es solo informativo (para fees, no para cupones)
```

### getOrdenes

**SQL actual:**
```sql
total_pedido = SUM(fd.kar_total) - ISNULL(MAX(f.fac_descuento_general), 0)
```

**Está correcta** si `fac_descuento_general` contiene SOLO `fee_lines` (no cupones). El cupón ya está en `kar_total`.

---

## 5. Ajustes necesarios en `orderModel.js`

### 5.1 En `updateOrder` y `createCompleteOrder`: Respetar `detail.kar_total`

**Problema actual:**
```javascript
// Siempre recalcula, perdiendo el cupón
let kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
```

**Solución:**
```javascript
// Respeta el total enviado (desde getOrder con cupón), o recalcula si es línea nueva
let kar_total;
if (detail.kar_total && Number(detail.kar_total) > 0) {
  // Cliente envía total ya calculado
  kar_total = Number(detail.kar_total);
} else {
  // Línea nueva; recalcular con fórmula
  kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
  if (descuento > 0) {
    kar_total = kar_total * (1 - (descuento / 100));
  }
}
```

### 5.2 En `updateOrder` y `createCompleteOrder`: Derivar `kar_des_uno` correctamente

Cuando se usa `detail.kar_total` del cliente, calcular el % de descuento a partir del subtotal vs total:

```javascript
let kar_des_uno = descuento; // default

if (detail.kar_total && Number(detail.kar_total) > 0) {
  // Derivar % de la diferencia subtotal vs total
  const subtotalLinea = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
  const totalLinea = Number(detail.kar_total);
  if (subtotalLinea > 0) {
    kar_des_uno = ((subtotalLinea - totalLinea) / subtotalLinea) * 100;
  }
}
```

### 5.3 En `getOrder`: Verificar NO resta doble

```javascript
// Verificar que total_final = totalDetalles (NO resta descuentoGeneral)
// porque kar_total ya refleja el cupón
const totalDetalles = details.reduce((sum, detail) => sum + parseFloat(detail.kar_total || 0), 0);
header.total_final = totalDetalles;  // ✓ Correcto
// NO hacer: header.total_final = totalDetalles - descuentoGeneral;
```

Comentar en el código:
```javascript
// Nota: descuentoGeneral contiene solo fee_lines negativos, no cupones.
// Los cupones ya están reflejados en kar_total de cada línea.
```

### 5.4 Sin cambios en `fac_descuento_general`

- Mantener como está: se actualiza si el cliente lo envía, o se deja intacto.
- No incluir cupones en este campo (el cupón ya está en `kar_total` por línea).

---

## 6. Resumen de cambios

| Aspecto | Estado actual | Cambio requerido |
|--------|------------------|------------------|
| **syncWooOrdersController.js - `kar_sub_tot`** | `quantity * item.price` | Cambiar a `parseFloat(item.subtotal)` |
| **syncWooOrdersController.js - `kar_total`** | `quantity * item.price` (ya correcto) | Documentar que = `item.total` (cupón incluido) |
| **syncWooOrdersController.js - observaciones** | “Cupón de descuento (PRETTYDIS)” | Mejorar a “Cupón (PRETTYDIS): -$22.500” |
| **fac_descuento_general** | Solo fee_lines negativos | Mantener igual; NO agregar cupones |
| **orderModel.updateOrder - `kar_total`** | Siempre recalculado | Respetar cuando `detail.kar_total` existe |
| **orderModel.createCompleteOrder - `kar_total`** | Siempre recalculado | Respetar cuando `detail.kar_total` existe |
| **orderModel.updateOrder - `kar_des_uno`** | Usa `descuento` global | Derivar de subtotal/total cuando se usa `detail.kar_total` |
| **orderModel.getOrder - `total_final`** | `totalDetalles - descuentoGeneral` | Cambiar a `totalDetalles` (no resta doble) |

---

## 7. Estrategia de implementación (MÍNIMO IMPACTO)

Este análisis está **integrado en PLAN_IMPLEMENTACION_CUPONES_SYNC.md** (sección 6). Los cambios son:

**Fase 1: Sincronización (syncWooOrdersController.js)**
1. Cambiar `kar_sub_tot` a `parseFloat(item.subtotal)` ← CRÍTICO
2. Documentar que `kar_total` ya refleja cupón (via `item.price`)
3. Mejorar observaciones con monto del cupón

**Fase 2: Orden Model (orderModel.js)**
1. `updateOrder`: respetar `detail.kar_total` cuando existe
2. `updateOrder`: derivar `kar_des_uno` de subtotal vs total
3. `getOrder`: verificar `total_final = totalDetalles` (no resta doble)
4. `createCompleteOrder`: aplicar mismos cambios que `updateOrder`

**Impacto:**
- Mínimo código a cambiar (pocas líneas por archivo)
- Totales finales NO cambian (solo trazabilidad)
- Compatible con pedidos sin cupón (sin rama especial)
- Evita doble-descuento en cálculos

**Validación post-implementación:**
- Pedido con PRETTYDIS: `kar_sub_tot - kar_total` = monto del cupón
- COT→VTA: abrir COT con cupón, guardar sin cambios, verificar totales preservados
- `SUM(kar_total)` debe coincidir con `fac_total_woo`
