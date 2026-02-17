# Guía de Modificación Backend - Agregar kar_cos

**Fecha:** 2026-02-17
**Versión:** 1.0

---

## 📋 Resumen

Esta guía detalla cómo modificar los archivos backend que insertan registros en `facturakardes` para incluir el campo `kar_cos` (costo histórico).

## 🎯 Objetivo

Capturar el costo promedio (`art_bod_cos_cat`) en el momento exacto de cada venta y guardarlo en `kar_cos` para:
- Calcular rentabilidad real considerando precios finales (con descuentos)
- Mantener historial de costos consistente en el tiempo
- Generar reportes precisos en el dashboard de ventas BI

---

## 📂 Archivos a Modificar

Se identificaron **5 archivos** que insertan en `facturakardes`:

1. ✅ `controllers/syncWooOrdersController.js` - Sincronización órdenes WooCommerce
2. ✅ `models/orderModel.js` - Creación de órdenes locales
3. ✅ `models/inventoryModel.js` - Ajustes de inventario
4. ✅ `models/compraModel.js` - Compras (entradas)
5. ⚠️  `implementaciones_2026/sistema_compras_costo_promedio/backend/compraModel.js` - Version antigua (no modificar)

---

## 🔧 Patrón de Modificación

### Paso 1: Importar utilidad de costos

```javascript
// Agregar al inicio del archivo
const { obtenerCostoPromedioActual, obtenerCostosPromedioMultiples } = require('../utils/costoUtils');
```

### Paso 2: Obtener costo antes de insertar

**Opción A: Un solo artículo**
```javascript
// Antes del INSERT en facturakardes
const kar_cos = await obtenerCostoPromedioActual(transaction, art_sec);
```

**Opción B: Múltiples artículos (más eficiente)**
```javascript
// Obtener todos los art_sec de los items
const art_secs = items.map(item => item.art_sec);

// Obtener costos en una sola query
const costosMap = await obtenerCostosPromedioMultiples(transaction, art_secs);

// Usar el costo al insertar cada item
items.forEach(item => {
  const kar_cos = costosMap.get(item.art_sec) || 0;
  // ... INSERT con kar_cos
});
```

### Paso 3: Agregar kar_cos al INSERT

```javascript
// ANTES
await transaction.request()
  .input('fac_sec', sql.Decimal(12, 0), fac_sec)
  .input('kar_sec', sql.Int, kar_sec)
  .input('art_sec', sql.VarChar(30), art_sec)
  .input('kar_uni', sql.Decimal(18, 4), cantidad)
  .input('kar_pre', sql.Decimal(18, 4), precio)
  .input('kar_total', sql.Decimal(18, 4), total)
  .input('kar_nat', sql.VarChar(1), naturaleza)
  .query(`
    INSERT INTO dbo.facturakardes (
      fac_sec, kar_sec, art_sec, kar_uni, kar_pre, kar_total, kar_nat
    ) VALUES (
      @fac_sec, @kar_sec, @art_sec, @kar_uni, @kar_pre, @kar_total, @kar_nat
    )
  `);

// DESPUÉS
const kar_cos = await obtenerCostoPromedioActual(transaction, art_sec);

await transaction.request()
  .input('fac_sec', sql.Decimal(12, 0), fac_sec)
  .input('kar_sec', sql.Int, kar_sec)
  .input('art_sec', sql.VarChar(30), art_sec)
  .input('kar_uni', sql.Decimal(18, 4), cantidad)
  .input('kar_pre', sql.Decimal(18, 4), precio)
  .input('kar_total', sql.Decimal(18, 4), total)
  .input('kar_nat', sql.VarChar(1), naturaleza)
  .input('kar_cos', sql.Decimal(18, 4), kar_cos)  // ← NUEVO
  .query(`
    INSERT INTO dbo.facturakardes (
      fac_sec, kar_sec, art_sec, kar_uni, kar_pre, kar_total, kar_nat, kar_cos
    ) VALUES (
      @fac_sec, @kar_sec, @art_sec, @kar_uni, @kar_pre, @kar_total, @kar_nat, @kar_cos
    )
  `);
```

---

## 📝 Modificaciones Específicas por Archivo

### 1. `controllers/syncWooOrdersController.js`

**Ubicación:** Función que crea líneas de kardex desde órdenes WooCommerce

**Cambios:**
1. Importar `obtenerCostosPromedioMultiples`
2. Extraer todos los `art_sec` de los line_items
3. Obtener costos antes del loop de inserción
4. Agregar `kar_cos` a cada INSERT

**Ejemplo:**
```javascript
// Obtener costos de todos los productos de una vez
const art_secs = line_items.map(item => item.art_sec);
const costosMap = await obtenerCostosPromedioMultiples(transaction, art_secs);

// Insertar cada línea con su costo
for (const item of line_items) {
  const kar_cos = costosMap.get(item.art_sec) || 0;

  await transaction.request()
    // ... otros inputs
    .input('kar_cos', sql.Decimal(18, 4), kar_cos)
    .query(`INSERT INTO facturakardes (..., kar_cos) VALUES (..., @kar_cos)`);
}
```

### 2. `models/orderModel.js`

**Ubicación:** Función de creación de órdenes locales

**Cambios:** Similares a syncWooOrdersController.js

**Consideración especial:**
- Si hay promociones/descuentos, `kar_total` debe reflejar el precio FINAL
- El costo (`kar_cos`) se mantiene sin cambios (no se descuenta)

### 3. `models/inventoryModel.js`

**Ubicación:** Ajustes de inventario

**Consideración:**
- Solo agregar `kar_cos` para **salidas** (`kar_nat = '-'`)
- Para entradas (`kar_nat = '+'`), `kar_cos` puede ser NULL o 0

### 4. `models/compraModel.js`

**Ubicación:** Creación de compras

**Consideración:**
- Las compras son **entradas** (`kar_nat = '+'`)
- `kar_cos` puede dejarse NULL para entradas
- El sistema de costo promedio se encarga de actualizar `art_bod_cos_cat`

---

## ⚠️ Consideraciones Importantes

### 1. **Solo para SALIDAS (ventas)**
```javascript
// Solo obtener kar_cos si es una salida
const kar_cos = (kar_nat === '-')
  ? await obtenerCostoPromedioActual(transaction, art_sec)
  : 0;
```

### 2. **Transacciones SQL**
- SIEMPRE obtener el costo DENTRO de la transacción
- Si la transacción falla, el costo no se guarda (consistencia)

### 3. **Performance**
- Para múltiples items, usar `obtenerCostosPromedioMultiples` (1 query)
- Evitar `obtenerCostoPromedioActual` en loops (N queries)

### 4. **Manejo de Errores**
- Si `obtenerCostoPromedioActual` falla, retorna 0
- La venta NO debe bloquearse si falta el costo
- Log del error pero continuar la operación

### 5. **Valores NULL vs 0**
- Si no existe costo: usar `0` (no NULL)
- `ISNULL(kar_cos, 0)` en queries SQL

---

## ✅ Checklist de Implementación

Para cada archivo:

- [ ] Importar `costoUtils` al inicio
- [ ] Identificar dónde se hace INSERT en facturakardes
- [ ] Agregar lógica para obtener kar_cos
- [ ] Agregar `.input('kar_cos', ...)` al request
- [ ] Agregar `kar_cos` a la columna del INSERT
- [ ] Agregar `@kar_cos` al VALUES del INSERT
- [ ] Probar con una venta de prueba
- [ ] Verificar que kar_cos se guarda correctamente

---

## 🧪 Testing

### Test Manual

1. **Ejecutar scripts SQL:**
   ```bash
   06_agregar_kar_cos.sql
   07_poblar_kar_cos_historico.sql
   08_modificar_vista_usar_kar_cos.sql
   ```

2. **Reiniciar servidor:**
   ```bash
   npm run dev
   # o
   pm2 restart api_pretty
   ```

3. **Crear venta de prueba:**
   - Usar endpoint de creación de orden local
   - O sincronizar una orden desde WooCommerce

4. **Verificar en BD:**
   ```sql
   SELECT TOP 5
       fac_sec,
       art_sec,
       kar_uni,
       kar_pre,
       kar_total,
       kar_cos,  -- ← Debe tener valor
       kar_nat
   FROM facturakardes
   ORDER BY fac_sec DESC;
   ```

5. **Validar dashboard:**
   - Consultar `/api/dashboard/ventas/kpis?periodo=hoy`
   - Verificar que utilidad_bruta sea coherente

---

## 🔄 Rollback

Si algo falla:

```sql
-- Eliminar columna kar_cos
ALTER TABLE dbo.facturakardes
DROP COLUMN kar_cos;

-- Restaurar vista anterior
-- (ejecutar versión anterior de 01_crear_vista_ventas_dashboard.sql)
```

---

## 📚 Referencias

- `utils/costoUtils.js` - Funciones helper de costos
- `implementaciones_2026/dashboard_ventas_bi/COSTOS_HISTORICOS.md` - Documentación completa
- `MEMORY.md` - Campo `kar_cos` agregado a memoria del proyecto

---

## ✨ Próximos Pasos

Después de completar todas las modificaciones:

1. Crear varias ventas de prueba
2. Validar que kar_cos se graba correctamente
3. Verificar dashboard de ventas BI
4. Monitorear logs por errores
5. Documentar cualquier edge case encontrado
