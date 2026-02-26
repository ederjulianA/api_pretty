# Plan de implementación: Ajustes cupones distribuidores en sync de pedidos WooCommerce

**Carpeta:** `implementaciones_2026/ajustes_cupones_distribuidores`  
**Fecha:** Febrero 2026  
**Estado:** Plan (no implementado)  
**Endpoint afectado:** `POST /api/woo/sync-orders`  
**Controlador:** `controllers/syncWooOrdersController.js`

---

## 1. Objetivo

Hacer que el endpoint de sincronización de pedidos WooCommerce refleje de forma correcta los cupones de descuento (por ejemplo **PRETTYDIS** y otros cupones de distribuidor), de modo que:

- El monto total del descuento por cupón quede persistido a nivel de factura.
- Los totales por línea en `facturakardes` coincidan con los que envía WooCommerce (después del cupón).
- La suma de `kar_total` sea coherente con `fac_total_woo` y con la lógica que usa `actualizarListaPrecios`.

---

## 2. Contexto y problema actual

### 2.1 Comportamiento en WooCommerce

- Los pedidos con cupón incluyen:
  - **`coupon_lines`**: código(s) del cupón y metadatos.
  - **`discount_total`**: monto total de descuento del pedido (suma de todos los cupones).
  - En cada **`line_item`**:
    - **`subtotal`**: subtotal de la línea **antes** del descuento del cupón.
    - **`total`**: total de la línea **después** del descuento (reparto proporcional del cupón).
    - **`price`**: precio unitario = `total / quantity` (ya refleja descuento del cupón prorratizado en la línea).
  - A nivel pedido: **`total`** ya incluye el descuento del cupón.

### 2.2 Estructura de base de datos relevante (referencia: `EstructuraDatos/ps_estructura_17022026.sql`)

**Tabla `dbo.factura`:**

| Columna                 | Tipo            | Uso actual / propuesto |
|-------------------------|-----------------|-------------------------|
| `fac_sec`               | decimal(12,0)   | PK                      |
| `fac_nro_woo`           | varchar(15)     | Número pedido WooCommerce |
| `fac_total_woo`         | decimal(17,2)   | Total del pedido en WooCommerce (ya con descuento) ✅ |
| `fac_descuento_general`  | decimal(17,2)   | Hoy solo se llena con `fee_lines` negativos. **Objetivo:** incluir también el descuento de cupones. |
| `fac_obs`               | varchar(1024)   | Observaciones; ya se agrega texto del cupón. Se mantiene. |

**Tabla `dbo.facturakardes`:**

| Columna                   | Tipo            | Uso actual / propuesto |
|---------------------------|-----------------|-------------------------|
| `fac_sec`, `kar_sec`      | decimal(12,0), int | PK                   |
| `kar_pre`                 | decimal(17,2)   | Precio unitario con descuento. Actualmente `item.price`. **Ajuste:** Verificar que es `item.total / quantity` (refleja descuento). |
| `kar_pre_pub`             | decimal(17,2)   | Precio público unitario sin descuento. Actualmente `item.subtotal / quantity`. **Ajuste:** Cambiar a `parseFloat(item.subtotal) / quantity` (coherencia con WooCommerce). |
| `kar_des_uno`             | decimal(11,5)   | % descuento línea. Actualmente `((subtotal - total) / subtotal) * 100`. Se mantiene igual. |
| `kar_sub_tot`             | decimal(17,2)   | Subtotal línea sin descuento. Actualmente `quantity * item.price` (incorrecto - es el total). **Ajuste:** Cambiar a `parseFloat(item.subtotal)` (coherencia con WooCommerce). |
| `kar_total`               | decimal(17,2)   | Total línea con descuento. Actualmente `quantity * item.price` = `item.total` (correcto por coincidencia). **Validar:** Ya refleja el descuento a través de `item.price`. |

No se requieren cambios de estructura de tablas para este plan; solo cambios en la lógica del controlador y en qué valores de WooCommerce se mapean a cada campo.

---

## 3. Cambios propuestos (solo código, sin DDL)

### 3.1 Extraer cupones desde WooCommerce (información, no persistir en `fac_descuento_general`)

**Ubicación:** construcción de `orderData` en `syncWooOrdersController.js` (aprox. líneas 1200–1250).

**Análisis corrector:**

En WooCommerce, `item.price = item.total / quantity`, lo que significa que **`item.price` ya refleja el descuento del cupón prorrateado a nivel de línea**. Por tanto:
- Actualmente `kar_total = quantity * item.price = item.total` → **Ya captura el descuento del cupón a nivel de línea**.
- `fac_descuento_general` viene solo de `fee_lines` negativos (correctamente).
- El monto del cupón está **implícito** en la diferencia `sum(item.subtotal) - sum(item.total)` = `sum(kar_sub_tot) - sum(kar_total)` (después de la corrección de 3.2).

**Por qué NO agregar cupón a `fac_descuento_general`:**

Si `kar_total` ya refleja el cupón y luego sumamos el monto del cupón en `fac_descuento_general`, entonces `getOrder` y `getOrdenes` calcularían `total_final = SUM(kar_total) - fac_descuento_general`, causando un **doble descuento**:
```
Ejemplo:
  item.subtotal = 100
  item.total = 80 (descuento cupón = 20)
  kar_pre_pub = 100 / qty = 100
  kar_total = 80 / qty * qty = 80 ✓ (correcto, ya tiene descuento)
  fac_descuento_general = 20 (el monto del cupón)

  getOrder: total_final = 80 - 20 = 60  ← INCORRECTO (doble descuento)
  Correcto sería: total_final = 80
```

**Acciones:**

1. **Extraer info del cupón para trazabilidad (NO para persistir en descuento)**
   - Calcular `descuentoCupones = parseFloat(order.discount_total) || 0` si está disponible.
   - Documentar en código cuál propiedad de la API se usa.

2. **Mejora en `fac_obs` (opcional)**
   - Si `descuentoCupones > 0`, agregarlo a observaciones:
     ```javascript
     if (descuentoCupones > 0) {
       const codigoCupon = order.coupon_lines?.[0]?.code || '(sin código)';
       observations.push(`Cupón de descuento (${codigoCupon}): -$${descuentoCupones.toFixed(2)}`);
     }
     ```
   - Esto proporciona trazabilidad sin afectar el cálculo de totales.

3. **NO cambiar `fac_descuento_general`**
   - Mantener: `fac_descuento_general = descuentoFeeLines` (solo fee_lines negativos, como hoy).
   - El cupón está **ya aplicado** a nivel de línea en `kar_total`.

4. **Validación**
   - Después de sincronizar un pedido con cupón:
     - `sum(kar_sub_tot) - sum(kar_total)` ≈ monto del cupón (trazabilidad en observaciones).
     - `sum(kar_total)` ≈ `fac_total_woo` (ambos totales finales, sin doble descuento).
     - `fac_descuento_general` = 0 (a menos que haya fee_lines negativos aparte del cupón).

---

### 3.2 Corregir `kar_sub_tot` para que refleje subtotal SIN descuento

**Ubicación:** en `createOrder` y en `updateOrder`, bloque donde se preparan parámetros de línea (aprox. líneas 602–644 y 866–908).

**Situación actual:**

- `kar_total = quantity * item.price` (actualmente correcto - refleja `item.total`).
- `kar_sub_tot = quantity * item.price` (INCORRECTO - debería ser subtotal, no total).
- `kar_pre = item.price` (correcto - es unitario con descuento).
- `kar_pre_pub = subtotal / quantity` (correcto - es unitario sin descuento).

Esto causa que `kar_sub_tot` y `kar_total` sean idénticos, perdiendo la trazabilidad de cuál era el subtotal antes del cupón.

**Cambio requerido:**

```javascript
// ACTUAL (INCORRECTO):
let kar_sub_tot = quantity * item.price;

// CORREGIDO:
let kar_sub_tot = parseFloat(item.subtotal);  // Subtotal ANTES del cupón
```

**Validación por línea:**
- `kar_sub_tot = 100` (subtotal antes del cupón)
- `kar_total = 80` (total después del cupón, si cupón es 20)
- `kar_pre_pub = 100 / qty` (unitario sin descuento)
- `kar_pre = 80 / qty` (unitario con descuento = item.price)
- `kar_des_uno = (100 - 80) / 100 * 100 = 20%` ✓

**Impacto:**
- `sum(kar_sub_tot) - sum(kar_total)` ahora refleja el monto total del cupón (trazabilidad).
- `sum(kar_total)` sigue siendo igual a `fac_total_woo` (sin cambios en totales finales).
- `getOrder` debe usar `total_final = totalDetalles` (ver sección 3.3).

---

### 3.3 Coherencia con `getOrder` y `getOrdenes`

**Ubicación:** métodos `getOrder()` y `getOrdenes()` en `models/orderModel.js`.

**Situación actual:**

```sql
-- getOrder (JS)
total_final = totalDetalles - descuentoGeneral  // donde totalDetalles = SUM(kar_total)

-- getOrdenes (SQL)
total_pedido = SUM(fd.kar_total) - ISNULL(MAX(f.fac_descuento_general), 0)
```

**Con nuestro cambio:**

Dado que `kar_total` ya refleja el cupón (aplicado a nivel de línea) y `fac_descuento_general` contiene SOLO `fee_lines` negativos (no incluye cupones), la fórmula es correcta.

**Sin embargo, para claridad futura:**

- Añadir comentario en `getOrder` indicando que `totalDetalles` ya incluye descuentos de cupón (están en `kar_total`).
- `fac_descuento_general` se muestra como informativo (contiene fees, no cupones).

**Nota sobre `actualizarListaPrecios`:**

- No requiere cambios.
- `SUM(kar_total)` ya refleja correctamente el total con descuento de cupón (y sin cambios en esta sección).

---

### 3.4 Observaciones y trazabilidad del cupón

- **`fac_obs`**: mejorar el texto ya existente “Cupón de descuento (PRETTYDIS)” para incluir el monto:
  `Cupón de descuento (PRETTYDIS): -$22.500`
  para facilitar auditoría.

- **Cálculo para observaciones:**
  ```javascript
  const descuentoCupones = parseFloat(order.discount_total) || 0;
  if (descuentoCupones > 0) {
    const codigoCupon = order.coupon_lines?.[0]?.code || '(sin código)';
    observations.push(`Cupón (${codigoCupon}): -$${descuentoCupones.toFixed(2)}`);
  }
  ```

- **Trazabilidad alternativa:** La diferencia `SUM(kar_sub_tot) - SUM(kar_total)` siempre refleja el monto total de descuentos por cupones a nivel de líneas, permitiendo validar en reportes.

---

## 4. Orden sugerido de implementación

| Paso | Tarea | Archivo | Prioridad |
|------|--------|---------|-----------|
| 1 | En `createOrder` y `updateOrder`, cambiar `kar_sub_tot` de `quantity * item.price` a `parseFloat(item.subtotal)`. | `syncWooOrdersController.js` líneas 617, 881 | **CRÍTICA** |
| 2 | Documentar en código que `kar_total = quantity * item.price = item.total` ya refleja el cupón; verificar que `item.price` viene bien de WooCommerce. | `syncWooOrdersController.js` líneas 602-644, 866-908 | Alta |
| 3 | Mejorar texto en `fac_obs` para incluir monto del cupón: `Cupón (PRETTYDIS): -$22.500`. | `syncWooOrdersController.js` líneas 1222-1225 | Media |
| 4 | En `orderModel.js`, actualizar `getOrder`: verificar que `total_final = totalDetalles` (no resta `descuentoGeneral` doble). Comentar que `descuentoGeneral` contiene fees, no cupones. | `models/orderModel.js` líneas 660-668 | Alta |
| 5 | En `orderModel.js`, en `updateOrder` y `createCompleteOrder`: respetar `detail.kar_total` cuando venga del cliente (para flujo COT→VTA). | `models/orderModel.js` líneas 353-356, 939-943 | Alta |
| 6 | Pruebas con pedido real con cupón PRETTYDIS: verificar `kar_sub_tot` > `kar_total`, `SUM(kar_total)` = `fac_total_woo`. | Manual / suite de pruebas | **CRÍTICA** |
| 7 | Pruebas de flujo COT→VTA: abrir COT con cupón, guardar sin cambios, verificar que totales se mantienen. | Manual / suite de pruebas | Alta |

---

## 5. Consideraciones adicionales

### 5.1 Cambio CRÍTICO: `kar_sub_tot`

- **`kar_sub_tot` DEBE ser el subtotal sin descuento** (`item.subtotal`), no el total (`item.total`).
- Esto es el cambio más importante para trazabilidad y evitar confusiones.
- La diferencia `kar_sub_tot - kar_total` permite auditar cuánto se descontó por cupón.

### 5.2 `fac_descuento_general` NO incluye cupones

- `fac_descuento_general` contiene SOLO `fee_lines` negativos.
- El cupón está **implícito** en los valores por línea (`kar_sub_tot` vs `kar_total`).
- Esto evita doble descuento en cálculos de `total_final`.

### 5.3 Múltiples cupones

- Si WooCommerce tiene más de un cupón, `order.discount_total` ya es el total de todos.
- En `fac_obs` se puede listar el primer cupón o todos (según necesidad).

### 5.4 Bundles y componentes

- Los ítems con `price: 0` y `total: 0` (componentes de bundle) deben seguir manejándose igual.
- Usar `item.subtotal` para `kar_sub_tot` siempre, incluso si es 0 (no rompe nada).

### 5.5 Compatibilidad con pedidos sin cupón

- Para pedidos sin cupón: `item.subtotal === item.total`.
- El nuevo código maneja ambos casos igual (sin rama especial).

### 5.6 Validación de estructura API WooCommerce

**Antes de implementar, verificar:**
- `order.discount_total` existe y contiene la suma de descuentos.
- `order.coupon_lines[0].code` existe para obtener el código.
- `line_item.subtotal` y `line_item.total` están disponibles.
- `line_item.price = line_item.total / line_item.quantity` (relación esperada).

---

## 6. Flujo COT → factura de venta (VTA)

Cuando el usuario abre una cotización (COT) con cupón y la confirma o modifica, `orderModel.js` NO debe perder los totales por línea con descuento. El modelo hoy recalcula `kar_total = kar_uni * kar_pre_pub * (1 - descuento/100)`, lo que causaría doble-descuento o pérdida del cupón.

**Análisis detallado:** ver `ANALISIS_FLUJO_COT_A_VTA_DESCUENTOS.md`.

**Ajustes necesarios en `orderModel.js`:**

### 6.1 `updateOrder` y `createCompleteOrder` - Respetar `kar_total` enviado

```javascript
// ACTUAL (siempre recalcula):
let kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
if (descuento > 0) {
  kar_total = kar_total * (1 - (descuento / 100));
}

// CORREGIDO (respeta totales cuando vienen del cliente):
let kar_total;
if (detail.kar_total && Number(detail.kar_total) > 0) {
  // Cliente envía total ya calculado (p. ej. desde getOrder)
  kar_total = Number(detail.kar_total);
} else {
  // Línea nueva o cliente envía solo unitarios; recalcular
  kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
  if (descuento > 0) {
    kar_total = kar_total * (1 - (descuento / 100));
  }
}
```

**Impacto:**
- Si el front reenvía detalles de `getOrder` sin modificarlos, se preservan los totales con cupón.
- Si el front modifica cantidades/precios, puede recalcular o dejar que el backend calcule con `descuento %`.

### 6.2 `kar_des_uno` - Derivar del subtotal vs total cuando sea necesario

```javascript
// Si se usa detail.kar_total (del cliente), derivar kar_des_uno:
let kar_des_uno = descuento; // default
if (detail.kar_total && Number(detail.kar_total) > 0) {
  const subtotalLinea = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
  const totalLinea = Number(detail.kar_total);
  if (subtotalLinea > 0) {
    kar_des_uno = ((subtotalLinea - totalLinea) / subtotalLinea) * 100;
  }
}
```

### 6.3 `getOrder` - Verificar que NO resta dos veces

Ver sección 3.3: `total_final = totalDetalles` (no debe restar `fac_descuento_general` porque el cupón ya está en `kar_total`).

---

## 7. Resumen de archivos a tocar

| Archivo | Sección | Cambios | Líneas aprox. |
|---------|---------|---------|---------------|
| `controllers/syncWooOrdersController.js` | `createOrder` | Cambiar `kar_sub_tot = quantity * item.price` a `kar_sub_tot = parseFloat(item.subtotal)` | 617 |
| `controllers/syncWooOrdersController.js` | `updateOrder` | Cambiar `kar_sub_tot = quantity * item.price` a `kar_sub_tot = parseFloat(item.subtotal)` | 881 |
| `controllers/syncWooOrdersController.js` | Observaciones | Mejorar texto del cupón a incluir monto: `Cupón (PRETTYDIS): -$22.500` | 1222-1230 |
| `controllers/syncWooOrdersController.js` | Comentarios | Documentar que `item.price` ya refleja cupón y que `kar_total = quantity * item.price = item.total` | 602-644, 866-908 |
| `models/orderModel.js` | `updateOrder` | Respetar `detail.kar_total` cuando venga del cliente; calcular `kar_des_uno` a partir de subtotal/total | 340-365 |
| `models/orderModel.js` | `createCompleteOrder` | Respetar `detail.kar_total` cuando venga del cliente; calcular `kar_des_uno` a partir de subtotal/total | 930-960 |
| `models/orderModel.js` | `getOrder` | Verificar que `total_final = totalDetalles` (sin doble resta); comentar que cupón está en `kar_total` | 660-668 |
| Este documento | Encabezado | Cambiar estado a “Plan (no implementado)” → “En implementación” → “Completado” | 1-6 |

**No se requieren cambios de DDL** (solo uso correcto de columnas existentes: `kar_sub_tot`, `kar_total`, `fac_obs`, sin agregar cupones a `fac_descuento_general`).

---

## 8. Referencias

- Análisis previo: compatibilidad del endpoint con cupón PRETTYDIS (descuento distribuidor).
- **Análisis flujo COT→VTA:** `ANALISIS_FLUJO_COT_A_VTA_DESCUENTOS.md` (mismo directorio).
- Estructura BD: `EstructuraDatos/ps_estructura_17022026.sql` (tablas `factura`, `facturakardes`).
- Documento funcional cupones WooCommerce: `prettyLocal/wp-content/plugins/precios-mayoristas/ANALISIS_CUPONES_WOOCOMMERCE.md`.
- Endpoint: `POST /api/woo/sync-orders`; controlador: `syncWooOrdersController.js`. Flujo COT→VTA: `PUT /api/orders/:fac_nro` → `orderModel.updateOrder`.
