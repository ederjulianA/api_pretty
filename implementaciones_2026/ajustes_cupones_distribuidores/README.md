# Ajustes cupones distribuidores en sync WooCommerce

**Fecha:** Febrero 2026
**Estado:** ✅ Análisis revisado y validado - Listo para implementación

## Descripción

Sincronización correcta de pedidos con cupones de descuento (ej. **PRETTYDIS**) desde WooCommerce con **mínimo impacto** en el sistema.

**Cambio principal:** Corregir `kar_sub_tot` de `quantity * item.price` a `parseFloat(item.subtotal)` para que refleje subtotal sin descuento. El cupón ya está implícito en `kar_total` (a través de `item.price`), evitando doble-descuento en cálculos.

**Sin cambios de DDL** - Usa columnas existentes de forma correcta.

## Documentos

| Documento | Propósito |
|-----------|-----------|
| [PLAN_IMPLEMENTACION_CUPONES_SYNC.md](PLAN_IMPLEMENTACION_CUPONES_SYNC.md) | **Plan ejecutable** con orden de implementación, archivos a tocar y líneas específicas. Incluye sección de flujo COT→VTA integrada. |
| [ANALISIS_FLUJO_COT_A_VTA_DESCUENTOS.md](ANALISIS_FLUJO_COT_A_VTA_DESCUENTOS.md) | **Análisis detallado** del problema de doble-descuento y soluciones en `orderModel.js`. |

## Cambios Clave

**Sincronización (syncWooOrdersController.js):**
- ❌ ~~`kar_sub_tot = quantity * item.price`~~
- ✅ `kar_sub_tot = parseFloat(item.subtotal)` (subtotal SIN descuento)

**Descuentos:**
- ✅ `kar_total` ya refleja cupón (via `item.price = item.total / quantity`)
- ✅ `fac_descuento_general` contiene SOLO `fee_lines` (NO cupones, para evitar doble-descuento)
- ✅ Cupón visible en: `kar_sub_tot - kar_total` + observaciones

**Flujo COT→VTA (orderModel.js):**
- ✅ `updateOrder` respeta `detail.kar_total` cuando viene del cliente
- ✅ `getOrder` calcula `total_final = totalDetalles` (sin resta doble)

## Impacto

- **Alcance:** Sincronización de pedidos con cupones desde WooCommerce; flujo COT→VTA.
- **Archivos modificados:** 2 controladores + 1 modelo (`syncWooOrdersController.js`, `orderModel.js`).
- **Líneas de código:** ~10-15 cambios significativos (mayoría correcciones simples).
- **Retrocompatibilidad:** 100% (pedidos sin cupones no se ven afectados).
- **Base de datos:** Sin cambios de DDL.

## Validación Post-Implementación

1. **Pedido con PRETTYDIS desde WooCommerce:**
   - `kar_sub_tot` (subtotal) > `kar_total` (total con cupón)
   - Diferencia = monto del cupón
   - `SUM(kar_total)` ≈ `fac_total_woo`

2. **Flujo COT→VTA:**
   - Abrir COT con cupón → Sin modificaciones → Guardar
   - Verificar que totales por línea se preservan

3. **Reportes:**
   - `total_final` correcto (no resta doble)
   - `kar_des_uno` refleja % de descuento por línea

## Referencias Técnicas

- **Estructura BD:** `EstructuraDatos/ps_estructura_17022026.sql` (tablas `factura`, `facturakardes`)
- **Controlador sincronización:** `controllers/syncWooOrdersController.js` (líneas 602-644, 866-908, 1222-1230)
- **Modelo órdenes:** `models/orderModel.js` (métodos `updateOrder`, `createCompleteOrder`, `getOrder`)
