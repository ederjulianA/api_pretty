# Implementación Sistema de Costos Históricos

**Fecha:** 2026-02-17
**Estado:** ✅ Diseño Completo - Listo para Ejecución

---

## 📋 Resumen

Sistema completo para capturar costos históricos en ventas y calcular rentabilidad REAL sobre precios finales (incluyendo descuentos, promociones, combos).

## 🎯 Problema Resuelto

- ❌ **Antes:** Utilidad bruta de -$107,211 con rentabilidad teórica del 42.6%
- ✅ **Después:** Utilidad real y rentabilidad calculada sobre precios finales con costos históricos

## 📦 Archivos Creados

### Scripts SQL (Ejecutar en este orden)
```
sql/
├── 06_agregar_kar_cos.sql                  ← 1. Agregar columna kar_cos
├── 07_poblar_kar_cos_historico.sql         ← 2. Migrar datos históricos
└── 08_modificar_vista_usar_kar_cos.sql     ← 3. Actualizar vista
```

### Backend
```
utils/
└── costoUtils.js                            ← Helper functions para costos

Archivos a modificar (ver GUIA_MODIFICACION_BACKEND.md):
- controllers/syncWooOrdersController.js
- models/orderModel.js
- models/inventoryModel.js
- models/compraModel.js
```

### Documentación
```
implementaciones_2026/dashboard_ventas_bi/
├── COSTOS_HISTORICOS.md                     ← Documentación completa
├── GUIA_MODIFICACION_BACKEND.md             ← Guía paso a paso backend
└── README_IMPLEMENTACION_COSTOS_HISTORICOS.md ← Este archivo
```

---

## 🚀 Plan de Implementación

### Fase 1: Base de Datos (15 minutos)

```bash
# 1. Conectar a SQL Server
# 2. Cambiar base de datos en scripts (línea 15)
# 3. Ejecutar en orden:
```

**Script 1:** `06_agregar_kar_cos.sql`
- ✅ Agrega columna `kar_cos DECIMAL(18,4) NULL`
- ✅ Sin riesgo, no afecta datos existentes
- ⏱️ ~1 minuto

**Script 2:** `07_poblar_kar_cos_historico.sql`
- ✅ Actualiza registros históricos con costo actual
- ⚠️  Puede tardar según volumen de datos
- ⏱️ ~5-10 minutos

**Script 3:** `08_modificar_vista_usar_kar_cos.sql`
- ✅ Actualiza vista para usar `kar_cos`
- ✅ Dashboard mostrará datos correctos inmediatamente
- ⏱️ ~1 minuto

**Verificación:**
```sql
-- Confirmar que kar_cos existe y tiene datos
SELECT TOP 5
    fac_sec, art_sec, kar_uni, kar_total, kar_cos
FROM facturakardes
WHERE kar_nat = '-' AND kar_cos > 0
ORDER BY fac_sec DESC;
```

### Fase 2: Backend (30-45 minutos)

**Archivos a modificar:**

1. ✅ `utils/costoUtils.js` - **YA CREADO**

2. 🔧 `controllers/syncWooOrdersController.js`
   ```javascript
   // Agregar al inicio
   const { obtenerCostosPromedioMultiples } = require('../utils/costoUtils');

   // Antes del loop de INSERT
   const art_secs = line_items.map(item => item.art_sec);
   const costosMap = await obtenerCostosPromedioMultiples(transaction, art_secs);

   // En cada INSERT
   const kar_cos = costosMap.get(item.art_sec) || 0;
   .input('kar_cos', sql.Decimal(18, 4), kar_cos)
   ```

3. 🔧 `models/orderModel.js` - Mismo patrón que syncWooOrders

4. 🔧 `models/inventoryModel.js` - Solo para salidas (kar_nat = '-')

5. 🔧 `models/compraModel.js` - Opcional, compras son entradas

**Ver:** `GUIA_MODIFICACION_BACKEND.md` para detalles completos

### Fase 3: Testing (15 minutos)

```bash
# 1. Reiniciar servidor
npm run dev
# o
pm2 restart api_pretty

# 2. Crear venta de prueba
# - Endpoint local: POST /api/ordenes
# - O sincronizar orden WooCommerce

# 3. Verificar en BD
```

**Query de validación:**
```sql
SELECT TOP 5
    f.fac_nro,
    a.art_cod,
    a.art_nom,
    fk.kar_uni,
    fk.kar_total,
    fk.kar_cos,  -- ← Debe tener valor
    (fk.kar_total - (fk.kar_uni * fk.kar_cos)) AS utilidad
FROM facturakardes fk
INNER JOIN factura f ON fk.fac_sec = f.fac_sec
INNER JOIN articulos a ON fk.art_sec = a.art_sec
WHERE fk.kar_nat = '-'
ORDER BY fk.fac_sec DESC;
```

**Validar dashboard:**
```bash
# Consultar API
curl -H "x-access-token: YOUR_TOKEN" \
  http://localhost:3000/api/dashboard/ventas/kpis?periodo=hoy

# Verificar que utilidad_bruta_total sea coherente
```

---

## ✅ Checklist de Ejecución

### SQL
- [ ] Hacer backup de la base de datos
- [ ] Ejecutar `06_agregar_kar_cos.sql`
- [ ] Verificar que columna kar_cos existe
- [ ] Ejecutar `07_poblar_kar_cos_historico.sql`
- [ ] Verificar que datos históricos tienen kar_cos
- [ ] Ejecutar `08_modificar_vista_usar_kar_cos.sql`
- [ ] Verificar que vista retorna datos

### Backend
- [ ] Confirmar que `utils/costoUtils.js` existe
- [ ] Modificar `syncWooOrdersController.js`
- [ ] Modificar `orderModel.js`
- [ ] Modificar `inventoryModel.js`
- [ ] (Opcional) Modificar `compraModel.js`
- [ ] Reiniciar servidor

### Testing
- [ ] Crear venta de prueba local
- [ ] Verificar kar_cos en BD
- [ ] Sincronizar orden WooCommerce
- [ ] Verificar kar_cos en orden WooCommerce
- [ ] Consultar dashboard de ventas
- [ ] Comparar utilidad antes/después
- [ ] Validar productos sin costo (kar_cos = 0)

### Documentación
- [ ] Leer `COSTOS_HISTORICOS.md` completo
- [ ] Capacitar equipo sobre nuevo sistema
- [ ] Documentar edge cases encontrados

---

## 📊 Resultados Esperados

**Dashboard de Ventas BI:**
- Utilidad Bruta: Valor real (no negativo artificial)
- Rentabilidad Promedio: Calculada sobre precios finales
- Costo Total Ventas: Basado en costos históricos

**Nuevos Campos en Vista:**
- `costo_historico_unitario` - kar_cos
- `rentabilidad_real` - Sobre precio final
- `margen_real` - Margen real de ganancia

**Comparación:**
```
Producto: Labial Mate Professional

ANTES (Teórica):
- Precio lista: $25,000
- Costo actual: $28,000
- Rentabilidad: -12% ❌

DESPUÉS (Real):
- Precio final venta: $19,868
- Costo histórico: $14,500
- Rentabilidad real: 27% ✅
```

---

## 🆘 Troubleshooting

### Problema: Vista no retorna datos después de ejecutar Script 3

**Solución:**
```sql
-- Verificar que los filtros son correctos
SELECT COUNT(*) FROM factura WHERE fac_tip_cod = 'VTA';  -- Debe tener registros
SELECT COUNT(*) FROM facturakardes WHERE kar_nat = '-';  -- Debe tener registros
```

### Problema: kar_cos sigue siendo NULL en nuevas ventas

**Solución:**
- Verificar que el archivo backend fue modificado correctamente
- Verificar que se importó `costoUtils`
- Verificar que se agregó `.input('kar_cos', ...)`
- Revisar logs del servidor por errores

### Problema: Dashboard muestra utilidad incorrecta

**Solución:**
```sql
-- Verificar que la vista usa kar_cos
SELECT TOP 5 costo_historico_unitario, costo_total_linea
FROM vw_ventas_dashboard;

-- No debe usar art_bod_cos_cat (ese es el viejo)
```

### Problema: Productos con kar_cos = 0

**Solución:**
- Normal si el producto no tiene `art_bod_cos_cat` asignado
- Ejecutar sistema de costo promedio para calcular costos
- O asignar costos manualmente en `articulosdetalle`

---

## 📞 Soporte

**Documentación:**
- `COSTOS_HISTORICOS.md` - Documentación completa
- `GUIA_MODIFICACION_BACKEND.md` - Guía backend
- `MEMORY.md` - Recordatorios del sistema

**Archivos de Referencia:**
- Vista: `implementaciones_2026/dashboard_ventas_bi/sql/08_modificar_vista_usar_kar_cos.sql`
- Helper: `utils/costoUtils.js`
- Diagnóstico: `implementaciones_2026/dashboard_ventas_bi/sql/04_diagnostico_periodo_especifico.sql`

---

## 🎉 Siguiente Paso

**Una vez completada la implementación:**

1. Monitorear dashboard por 1-2 días
2. Validar que kar_cos se graba en todas las ventas nuevas
3. Identificar productos sin costo y actualizar
4. Analizar rentabilidad real de promociones y combos
5. Ajustar precios basándose en datos reales

---

**Última actualización:** 2026-02-17
**Estado:** ✅ Listo para implementación
