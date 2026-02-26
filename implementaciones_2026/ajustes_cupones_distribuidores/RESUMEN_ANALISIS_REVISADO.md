# Resumen Ejecutivo: Análisis Revisado - Ajustes Cupones Distribuidores

**Fecha:** 26 Febrero 2026
**Conclusión:** ✅ **Análisis original era correcto en lo fundamental, pero con correcciones críticas identificadas**

---

## El Error de Comprensión Original

El plan original decía: *"kar_total actualmente no refleja el cupón, hay que cambiar a `item.total`"*

**INCORRECTO.** En realidad:
- `item.price` de WooCommerce = `item.total / quantity` (ya refleja cupón prorrateado)
- `kar_total = quantity * item.price = item.total` ✅ (YA captura el cupón)

Lo que **SÍ estaba mal:**
- `kar_sub_tot = quantity * item.price` ❌ (debería ser `item.subtotal`)

---

## Cambio Principal (CRÍTICO)

```javascript
// ❌ ACTUAL (INCORRECTO):
kar_sub_tot = quantity * item.price;  // = item.total (sin trazabilidad)

// ✅ CORREGIDO:
kar_sub_tot = parseFloat(item.subtotal);  // = subtotal antes de cupón
```

**Por qué es importante:**
- `kar_sub_tot` y `kar_total` deben diferir por el monto del cupón
- Permite auditar: diferencia = `sum(kar_sub_tot) - sum(kar_total)`
- Sin esto, no hay trazabilidad de cuánto fue el descuento

---

## Lo que NO hay que hacer

❌ **NO agregar cupón a `fac_descuento_general`** (original lo proponía)

**Por qué:**
- `kar_total` YA refleja cupón (via `item.price`)
- Si sumamos cupón a `fac_descuento_general` → doble-descuento en `getOrder`:
  ```
  total_final = SUM(kar_total) - fac_descuento_general
                    ↓ con cupón    ↓ con cupón
  = DOBLE DESCUENTO ❌
  ```

**Lo correcto:**
- `fac_descuento_general` = solo `fee_lines` (como hoy)
- Cupón está en `kar_total`
- Trazabilidad en observaciones: "Cupón (PRETTYDIS): -$22.500"

---

## Cambios Requeridos por Archivo

### syncWooOrdersController.js
| Líneas | Cambio | Impacto |
|--------|--------|---------|
| 617, 881 | `kar_sub_tot` = subtotal | **CRÍTICO** - trazabilidad |
| 1222-1230 | Mejorar observaciones | Media - es cosmético |
| 602-644, 866-908 | Comentarios documentación | Alta - claridad futura |

### orderModel.js
| Método | Líneas | Cambio | Impacto |
|--------|--------|--------|---------|
| `updateOrder` | 340-365 | Respetar `detail.kar_total` | Alta - preserva cupones en COT→VTA |
| `createCompleteOrder` | 930-960 | Respetar `detail.kar_total` | Alta - idem |
| `getOrder` | 660-668 | Verificar `total_final` | Alta - evita doble resta |

---

## Orden de Implementación (Priorizado)

### 🔴 CRÍTICO (implementar primero)

1. **syncWooOrdersController.js línea 617 y 881**
   - Cambiar `kar_sub_tot` a `parseFloat(item.subtotal)`
   - **Tarea:** 10 minutos
   - **Impacto:** Trazabilidad de cupones

2. **orderModel.js líneas 340-365 y 930-960**
   - Respetar `detail.kar_total` en updateOrder/createCompleteOrder
   - **Tarea:** 15 minutos
   - **Impacto:** Preserva cupones en flujo COT→VTA

### 🟠 ALTA (implementar después)

3. **orderModel.js línea 660-668**
   - Verificar `total_final = totalDetalles` (sin doble resta)
   - **Tarea:** 5 minutos
   - **Impacto:** Evita cálculos incorrectos

4. **Documentación en código**
   - Explicar que `item.price` refleja cupón
   - **Tarea:** 10 minutos
   - **Impacto:** Claridad para futuros desarrolladores

### 🟡 MEDIA (después si hay tiempo)

5. **syncWooOrdersController.js línea 1222-1230**
   - Mejorar texto observaciones con monto del cupón
   - **Tarea:** 5 minutos
   - **Impacto:** UX - info visible en pedidos

---

## Validación (Checklist Post-Implementación)

### Test 1: Pedido con cupón PRETTYDIS
```
✓ kar_sub_tot = 100 (subtotal antes de cupón)
✓ kar_total = 80 (total con cupón)
✓ Diferencia = 20 (monto cupón)
✓ kar_des_uno = 20% (% descuento)
✓ sum(kar_total) ≈ fac_total_woo (totales finales coherentes)
```

### Test 2: Flujo COT→VTA
```
✓ Abrir COT con cupón vía GET /api/orders/:fac_nro
✓ Guardar sin cambios vía PUT /api/orders/:fac_nro
✓ Verificar kar_total preservados (mismo cupón)
✓ Verificar total_final correcto (sin doble resta)
```

### Test 3: Compatibilidad
```
✓ Pedido sin cupón: subtotal = total (sin diferencia)
✓ Pedido con bundle: componentes con price=0 no se rompen
✓ Múltiples cupones: order.discount_total suma todos
```

---

## Comparativa: Original vs Revisado

| Aspecto | Original | Revisado |
|---------|----------|----------|
| `kar_total` | "Hay que cambiar a `item.total`" | YA es correcto (`item.price * qty = item.total`) |
| `kar_sub_tot` | "Usar `item.subtotal`" | ✅ CORRECTO - es el cambio principal |
| `fac_descuento_general` | "Agregar cupón" | ❌ NO - causa doble descuento |
| Impacto | "Múltiples cambios en lógica" | Mínimo (10-15 líneas de código) |
| Complejidad | Alta | Baja |

---

## Riesgo: BAJO

- ✅ Sin cambios de DDL
- ✅ Sin cambios en flujos sin cupón
- ✅ Código defensivo (verifica condiciones)
- ✅ Trazabilidad mejorada

---

## Decisión Recomendada

✅ **PROCEDER CON IMPLEMENTACIÓN**

Los cambios son mínimos, seguros y de **máximo 40 minutos** en total. La documentación está lista en:
- `PLAN_IMPLEMENTACION_CUPONES_SYNC.md` - Plan paso a paso
- `ANALISIS_FLUJO_COT_A_VTA_DESCUENTOS.md` - Análisis detallado
- Documentos ya actualizados con análisis de Claude Code

**Próximo paso:** Asignar desarrollador para implementar según orden de prioridades (CRÍTICO → ALTA → MEDIA).
