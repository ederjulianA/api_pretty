# Definiciones de KPIs - Dashboard de Ventas BI

**Fecha:** 2026-02-17
**Versión:** 1.0

---

## 📊 KPIs Principales

### 1. Ventas Totales

**Definición:** Suma total de ingresos generados por todas las ventas en el período.

**Fórmula:**
```
Ventas Totales = Σ (precio_unitario × cantidad_vendida)
```

**Campos SQL:**
```sql
SUM(total_linea) AS ventas_totales
```

**Interpretación:**
- Métrica fundamental de desempeño del negocio
- Indica el volumen de facturación del período
- Se usa como base para calcular otros KPIs

**Ejemplo:**
- Si vendes 100 productos a $50,000 c/u = $5,000,000 en ventas totales

---

### 2. Número de Órdenes

**Definición:** Cantidad de transacciones únicas completadas.

**Fórmula:**
```
Número de Órdenes = COUNT(DISTINCT fac_nro)
```

**Campos SQL:**
```sql
COUNT(DISTINCT fac_nro) AS numero_ordenes
```

**Interpretación:**
- Mide el volumen de transacciones
- Permite calcular promedios (ticket promedio)
- Indica la frecuencia de compra

**Ejemplo:**
- 234 órdenes procesadas en el mes

---

### 3. Ticket Promedio (AOV - Average Order Value)

**Definición:** Valor promedio de cada orden.

**Fórmula:**
```
Ticket Promedio = Ventas Totales / Número de Órdenes
```

**Campos SQL:**
```sql
CASE
  WHEN COUNT(DISTINCT fac_nro) > 0
  THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
  ELSE 0
END AS ticket_promedio
```

**Interpretación:**
- Mide cuánto gasta cada cliente por transacción
- KPI clave para estrategias de upselling/cross-selling
- Valores bajos sugieren oportunidad de aumentar venta por cliente

**Ejemplo:**
- Ventas: $5,000,000 / Órdenes: 100 = Ticket Promedio: $50,000

---

### 4. Clientes Únicos

**Definición:** Cantidad de clientes diferentes que realizaron compras.

**Fórmula:**
```
Clientes Únicos = COUNT(DISTINCT nit_sec)
```

**Campos SQL:**
```sql
COUNT(DISTINCT nit_sec) AS clientes_unicos
```

**Interpretación:**
- Mide la base de clientes activos
- Permite calcular frecuencia de compra
- Indica penetración de mercado

**Ejemplo:**
- 187 clientes diferentes compraron en el mes

---

### 5. Unidades Vendidas

**Definición:** Cantidad total de productos vendidos.

**Fórmula:**
```
Unidades Vendidas = Σ cantidad_vendida
```

**Campos SQL:**
```sql
SUM(cantidad_vendida) AS unidades_vendidas
```

**Interpretación:**
- Mide volumen físico de ventas
- Complementa la métrica de ventas en dinero
- Útil para gestión de inventario

**Ejemplo:**
- 1,456 unidades vendidas en el mes

---

### 6. Utilidad Bruta Total

**Definición:** Ganancia total antes de gastos operativos.

**Fórmula:**
```
Utilidad Bruta = Σ (precio_venta - costo_promedio) × cantidad
```

**Campos SQL:**
```sql
SUM(total_linea - costo_total_linea) AS utilidad_bruta_total
-- O equivalente:
SUM(utilidad_linea) AS utilidad_bruta_total
```

**Interpretación:**
- Mide la ganancia antes de gastos operativos
- KPI fundamental para rentabilidad del negocio
- Base para calcular rentabilidad porcentual

**Ejemplo:**
- Ventas: $15,500,000 - Costos: $10,070,000 = Utilidad: $5,430,000

---

### 7. Rentabilidad Promedio

**Definición:** Porcentaje promedio de ganancia sobre el precio de venta.

**Fórmula:**
```
Rentabilidad (%) = ((Precio Venta - Costo) / Precio Venta) × 100
Rentabilidad Promedio = AVG(rentabilidad)
```

**Campos SQL:**
```sql
AVG(rentabilidad) AS rentabilidad_promedio
```

**Interpretación:**
- Mide eficiencia del pricing
- Indica cuánto de cada peso vendido es ganancia
- Valores bajos indican presión de márgenes

**Ejemplo:**
- Rentabilidad promedio: 35.03% = De cada $100 vendidos, $35.03 son ganancia

---

### 8. Costo Total de Ventas

**Definición:** Suma de costos de todos los productos vendidos.

**Fórmula:**
```
Costo Total = Σ (costo_promedio_unitario × cantidad_vendida)
```

**Campos SQL:**
```sql
SUM(costo_total_linea) AS costo_total_ventas
```

**Interpretación:**
- Mide inversión en productos vendidos
- Base para calcular utilidad y rentabilidad
- Esencial para análisis financiero

**Ejemplo:**
- $10,070,000 en costos de productos vendidos

---

## 📈 KPIs de Crecimiento

### 9. Tasa de Crecimiento de Ventas

**Definición:** Porcentaje de aumento o disminución vs período anterior.

**Fórmula:**
```
Tasa de Crecimiento (%) = ((Ventas Actual - Ventas Anterior) / Ventas Anterior) × 100
```

**Interpretación:**
- Positivo = Crecimiento
- Negativo = Decrecimiento
- Compara períodos equivalentes

**Ejemplo:**
- Mes actual: $8,500,000 vs Mes anterior: $7,200,000 = +18.06% de crecimiento

---

### 10. Tasa de Crecimiento de Órdenes

**Definición:** Porcentaje de aumento/disminución en número de transacciones.

**Fórmula:**
```
Tasa de Crecimiento Órdenes (%) = ((Órdenes Actual - Órdenes Anterior) / Órdenes Anterior) × 100
```

**Interpretación:**
- Mide cambio en volumen de transacciones
- Puede diferir de crecimiento en ventas (cambio en ticket promedio)

**Ejemplo:**
- Mes actual: 145 órdenes vs Mes anterior: 132 órdenes = +9.85% de crecimiento

---

## 🏆 KPIs de Productos

### 11. Top Productos por Unidades

**Definición:** Productos más vendidos por cantidad.

**Fórmula:**
```
Ranking por: Σ cantidad_vendida DESC
```

**Interpretación:**
- Identifica productos de mayor rotación
- Útil para gestión de inventario
- Productos populares aunque no sean los más rentables

---

### 12. Top Productos por Ingresos

**Definición:** Productos que generan más ingresos.

**Fórmula:**
```
Ranking por: Σ (precio × cantidad) DESC
```

**Interpretación:**
- Identifica productos que más aportan a ventas
- Productos de alto valor aunque no sean los más vendidos
- Priorizar en marketing y stock

---

### 13. Ventas por Categoría

**Definición:** Distribución de ventas por grupo de productos.

**Métricas por categoría:**
- Ventas totales
- Unidades vendidas
- Productos diferentes
- Porcentaje del total
- Rentabilidad promedio

**Interpretación:**
- Identifica categorías más exitosas
- Permite optimizar mix de productos
- Base para decisiones de compra

---

## 💰 KPIs de Rentabilidad

### 14. Distribución por Clasificación

**Clasificaciones:**
- **ALTA:** ≥ 40% de rentabilidad
- **MEDIA:** 20% - 40%
- **BAJA:** 10% - 20%
- **MÍNIMA:** 0% - 10%
- **PÉRDIDA:** < 0%

**Interpretación:**
- Evalúa salud del pricing
- Identifica productos problemáticos
- Alerta sobre ventas bajo costo

---

## 👥 KPIs de Clientes

### 15. Frecuencia de Compra

**Definición:** Promedio de órdenes por cliente.

**Fórmula:**
```
Frecuencia = Número de Órdenes / Clientes Únicos
```

**Interpretación:**
- Mide lealtad y recurrencia
- Valores bajos = oportunidad de fidelización
- Valores altos = clientes recurrentes

**Ejemplo:**
- 234 órdenes / 187 clientes = 1.25 órdenes por cliente

---

### 16. Valor Total por Cliente

**Definición:** Ingresos promedio por cliente.

**Fórmula:**
```
Valor por Cliente = Ventas Totales / Clientes Únicos
```

**Interpretación:**
- Similar a CLV (Customer Lifetime Value) pero para el período
- Indica valor promedio de cada cliente
- Base para segmentación

---

## 📊 KPIs Operacionales

### 17. Órdenes por Estado

**Estados comunes:**
- `completed` - Completadas
- `processing` - En proceso
- `pending` - Pendientes
- `on_hold` - En espera
- `cancelled` - Canceladas

**Interpretación:**
- Mide eficiencia operativa
- Altas cancelaciones = problemas
- Muchas pendientes = problemas de procesamiento

---

### 18. Órdenes por Canal

**Canales:**
- **WooCommerce** - Ventas online
- **Local** - Ventas presenciales/directas

**Métricas por canal:**
- Número de órdenes
- Ventas totales
- Ticket promedio
- Utilidad total
- Rentabilidad promedio

**Interpretación:**
- Compara rendimiento de canales
- Identifica canal más rentable
- Optimiza estrategia omnicanal

---

## 📅 KPIs de Tendencias

### 19. Tendencia Diaria

**Métricas por día:**
- Ventas totales
- Número de órdenes
- Ticket promedio
- Unidades vendidas
- Utilidad total

**Interpretación:**
- Identifica patrones semanales
- Detecta días de mayor/menor venta
- Base para staffing y logística

---

### 20. Ventas por Hora

**Definición:** Distribución de ventas por hora del día.

**Interpretación:**
- Identifica horarios pico
- Optimiza horarios de atención
- Planifica recursos operativos
- Útil para campañas con horarios específicos

---

## 🎯 Interpretación de Métricas Combinadas

### Análisis de Salud del Negocio

**Escenario Saludable:**
- ✅ Ventas totales creciendo
- ✅ Número de órdenes creciendo
- ✅ Rentabilidad > 30%
- ✅ Ticket promedio estable o creciendo
- ✅ Sin productos en PÉRDIDA

**Señales de Alerta:**
- ⚠️ Ventas crecen pero rentabilidad baja
- ⚠️ Ticket promedio en descenso
- ⚠️ Alta proporción de productos con rentabilidad BAJA
- ⚠️ Clientes únicos no crecen (dependencia de pocos clientes)

---

## 📏 Rangos de Referencia (Retail Maquillaje)

| KPI | Malo | Regular | Bueno | Excelente |
|-----|------|---------|-------|-----------|
| Rentabilidad | < 15% | 15-25% | 25-40% | > 40% |
| Ticket Promedio | < $30k | $30k-$50k | $50k-$80k | > $80k |
| Frecuencia Cliente | < 1.2 | 1.2-1.5 | 1.5-2.0 | > 2.0 |
| Tasa Crecimiento Mensual | < 0% | 0-5% | 5-15% | > 15% |

---

**Nota:** Estos rangos son referenciales y deben ajustarse según el contexto específico del negocio, estacionalidad, y condiciones de mercado.
