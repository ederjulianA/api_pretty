# Dashboard de Ventas con Business Intelligence

**Fecha:** 2026-02-17
**Versión:** 1.0
**Estado:** 📋 Documentación Completa - Listo para Implementación

---

## 📋 Resumen Ejecutivo

Implementación completa de un **Dashboard de Ventas con enfoque en Business Intelligence** que permite análisis en tiempo real de ventas, rentabilidad, productos, clientes y tendencias operativas para un ERP de inventario y e-commerce.

**Características principales:**
- ✅ KPIs en tiempo real de ventas consolidadas (WooCommerce + Local)
- ✅ 12 KPIs principales + análisis de tendencias
- ✅ Comparativas de crecimiento vs períodos anteriores
- ✅ Análisis de rentabilidad por producto/categoría
- ✅ Top productos y clientes
- ✅ Períodos predefinidos (hoy, semana, mes, etc.)
- ✅ Segmentación temporal (día, hora, semana)
- ✅ Vista SQL optimizada para performance

---

## 🎯 Objetivos

1. ✅ Proporcionar visibilidad en tiempo real de ventas operativas
2. ✅ Identificar productos y categorías de mejor desempeño
3. ✅ Analizar rentabilidad de ventas realizadas
4. ✅ Monitorear crecimiento día a día
5. ✅ Identificar patrones de venta (hora del día, día de semana)
6. ✅ Analizar comportamiento de clientes (frecuencia, ticket promedio)
7. ✅ Comparar rendimiento entre canales (WooCommerce vs Local)

---

## 📊 KPIs Implementados

### Ventas & Ingresos
1. **Ventas Totales** - Ingresos totales del período
2. **Número de Órdenes** - Cantidad de transacciones
3. **Ticket Promedio (AOV)** - Valor promedio por orden
4. **Tasa de Crecimiento** - % cambio vs período anterior

### Productos
5. **Top 10 Productos Más Vendidos** - Por unidades y por ingresos
6. **Ventas por Categoría** - Distribución por grupo/subgrupo con %
7. **Rotación de Productos** - Unidades vendidas vs inventario

### Rentabilidad
8. **Utilidad Bruta Total** - Ganancia total (ventas - costo)
9. **Rentabilidad Promedio** - % rentabilidad de ventas
10. **Distribución por Clasificación** - ALTA/MEDIA/BAJA/MÍNIMA/PÉRDIDA

### Clientes
11. **Clientes Únicos** - Cantidad de clientes diferentes
12. **Top Clientes** - Por valor total de compras

### Operaciones
13. **Órdenes por Estado** - Distribución (completadas, pendientes, etc.)
14. **Órdenes por Canal** - WooCommerce vs Local

### Tendencias
15. **Tendencia Diaria** - Evolución día por día
16. **Ventas por Hora** - Distribución por hora del día

---

## 🏗️ Arquitectura

### Estructura de Archivos

```
implementaciones_2026/dashboard_ventas_bi/
├── README.md                              # Este archivo
├── docs/
│   ├── 01_KPIS_DEFINICIONES.md           # Definición de cada KPI y fórmulas
│   ├── 02_MODELO_DATOS.md                # Estructura de datos y queries
│   ├── 03_ENDPOINTS_API.md               # Documentación de endpoints
│   └── 04_GUIA_FRONTEND.md               # Guía para consumir desde frontend
├── sql/
│   ├── 01_crear_vista_ventas_dashboard.sql   # Vista principal
│   └── 02_indices_performance.sql            # Índices para optimización
├── backend/
│   ├── models/
│   │   └── ventasKpiModel.js             # Modelo con queries de KPIs
│   ├── controllers/
│   │   └── ventasKpiController.js        # Controlador HTTP
│   └── routes/
│       └── ventasKpiRoutes.js            # Definición de rutas
└── postman/
    └── Dashboard_Ventas_BI.postman_collection.json
```

---

## 🔧 Componentes Técnicos

### 1. Vista SQL Principal: `vw_ventas_dashboard`

Vista optimizada que consolida:
- Facturas y líneas de venta (kardex)
- Información de productos y categorías
- Costo promedio y rentabilidad (columnas calculadas)
- Información de clientes
- Segmentación temporal (año, mes, semana, día, hora)
- Canal de venta (WooCommerce vs Local)

**Ventajas:**
- ✅ Queries más simples y legibles
- ✅ Performance optimizada con índices
- ✅ Reutilizable para múltiples KPIs
- ✅ Mantenimiento centralizado

### 2. Modelo Node.js (`ventasKpiModel.js`)

11 funciones especializadas:
- `obtenerKPIsPrincipales()` - Métricas globales
- `obtenerTasaCrecimiento()` - Comparativa períodos
- `obtenerTopProductos()` - Productos más vendidos
- `obtenerVentasPorCategoria()` - Análisis por categoría
- `obtenerVentasPorRentabilidad()` - Distribución rentabilidad
- `obtenerTopClientes()` - Mejores clientes
- `obtenerOrdenesPorEstado()` - Estados de órdenes
- `obtenerOrdenesPorCanal()` - WooCommerce vs Local
- `obtenerTendenciaDiaria()` - Evolución diaria
- `obtenerVentasPorHora()` - Patrón horario
- `obtenerDashboardCompleto()` - Todos los KPIs en paralelo

### 3. API REST

**Base URL:** `/api/dashboard/ventas`

11 endpoints protegidos con JWT:
- `GET /completo` - Dashboard completo
- `GET /kpis` - KPIs principales
- `GET /crecimiento` - Tasa de crecimiento
- `GET /top-productos` - Top productos
- `GET /categorias` - Ventas por categoría
- `GET /rentabilidad` - Distribución rentabilidad
- `GET /top-clientes` - Top clientes
- `GET /ordenes-estado` - Órdenes por estado
- `GET /ordenes-canal` - Órdenes por canal
- `GET /tendencia-diaria` - Tendencia diaria
- `GET /ventas-hora` - Ventas por hora

---

## 📅 Períodos Predefinidos

El sistema soporta períodos predefinidos para facilitar consultas:

| Código | Descripción | Ejemplo |
|--------|-------------|---------|
| `hoy` | Día actual (00:00 a 23:59) | Hoy 17 Feb |
| `ayer` | Día anterior completo | 16 Feb |
| `ultimos_7_dias` | Últimos 7 días | 10 Feb - 17 Feb |
| `ultimos_15_dias` | Últimos 15 días | 2 Feb - 17 Feb |
| `ultimos_30_dias` | Últimos 30 días (default) | 18 Ene - 17 Feb |
| `semana_actual` | Semana actual (lun-hoy) | 16 Feb - 17 Feb |
| `semana_anterior` | Semana pasada completa | 9 Feb - 15 Feb |
| `mes_actual` | Mes actual (día 1 a hoy) | 1 Feb - 17 Feb |
| `mes_anterior` | Mes pasado completo | 1 Ene - 31 Ene |

**También soporta fechas personalizadas:**
```
?fecha_inicio=2026-02-01&fecha_fin=2026-02-17
```

---

## 📖 Ejemplos de Uso

### Dashboard Completo
```bash
GET /api/dashboard/ventas/completo?periodo=ultimos_30_dias
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "kpis_principales": {
      "ventas_totales": 15500000,
      "numero_ordenes": 234,
      "ticket_promedio": 66239.32,
      "clientes_unicos": 187,
      "unidades_vendidas": 1456,
      "utilidad_bruta_total": 5430000,
      "rentabilidad_promedio": 35.03,
      "costo_total_ventas": 10070000
    },
    "top_productos": [...],
    "ventas_por_categoria": [...],
    "ventas_por_rentabilidad": [...],
    "top_clientes": [...],
    "ordenes_por_estado": [...],
    "ordenes_por_canal": [...],
    "tendencia_diaria": [...]
  }
}
```

### KPIs Principales del Mes Actual
```bash
GET /api/dashboard/ventas/kpis?periodo=mes_actual
```

### Top 20 Productos por Ingresos
```bash
GET /api/dashboard/ventas/top-productos?limite=20&ordenar_por=ingresos&periodo=ultimos_7_dias
```

### Comparativa de Crecimiento
```bash
GET /api/dashboard/ventas/crecimiento?periodo=mes_actual
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "periodo_actual": {
      "ventas": 8500000,
      "ordenes": 145
    },
    "periodo_anterior": {
      "ventas": 7200000,
      "ordenes": 132
    },
    "crecimiento": {
      "ventas_porcentaje": 18.06,
      "ordenes_porcentaje": 9.85
    }
  }
}
```

---

## ⚡ Performance y Optimización

### Índices Recomendados

```sql
-- Índice en factura por fecha
CREATE INDEX IX_factura_fac_fec ON dbo.factura(fac_fec);

-- Índice en factura por estado
CREATE INDEX IX_factura_fac_est_fac ON dbo.factura(fac_est_fac) WHERE fac_est_fac = 'A';

-- Índice compuesto en facturakardes
CREATE INDEX IX_facturakardes_fac_sec_art_sec
ON dbo.facturakardes(fac_sec, art_sec) INCLUDE (kar_uni, kar_total);
```

### Estrategias de Optimización

1. **Vista materializada** (opcional): Para dashboards con millones de registros
2. **Caché en aplicación**: Cachear resultados del dashboard completo por 5-15 minutos
3. **Queries en paralelo**: `obtenerDashboardCompleto()` ejecuta todas las consultas simultáneamente
4. **OPTION (RECOMPILE)**: Para queries con parámetros variables (fechas)

---

## 📋 Checklist de Implementación

### Fase 1: Base de Datos
- [ ] Ejecutar `sql/01_crear_vista_ventas_dashboard.sql`
- [ ] Verificar que la vista retorna datos correctamente
- [ ] Ejecutar `sql/02_indices_performance.sql`
- [ ] Probar performance de queries principales

### Fase 2: Backend
- [ ] Copiar `backend/models/ventasKpiModel.js` a `/models/`
- [ ] Copiar `backend/controllers/ventasKpiController.js` a `/controllers/`
- [ ] Copiar `backend/routes/ventasKpiRoutes.js` a `/routes/`
- [ ] Registrar rutas en `index.js`:
  ```javascript
  const ventasKpiRoutes = require('./routes/ventasKpiRoutes');
  app.use('/api/dashboard/ventas', ventasKpiRoutes);
  ```
- [ ] Reiniciar servidor: `pm2 restart api_pretty`

### Fase 3: Pruebas
- [ ] Importar colección de Postman
- [ ] Probar endpoint `/completo` con diferentes períodos
- [ ] Probar cada endpoint individual
- [ ] Verificar tiempos de respuesta (deben ser < 2 segundos)
- [ ] Probar con fechas personalizadas
- [ ] Probar manejo de errores (fechas inválidas, etc.)

### Fase 4: Documentación y Entrega
- [ ] Revisar documentación en `/docs`
- [ ] Compartir colección de Postman con equipo frontend
- [ ] Documentar ejemplos de respuesta
- [ ] Capacitar al equipo en uso de endpoints

---

## 🔒 Seguridad

- ✅ Todos los endpoints protegidos con middleware `auth` (JWT)
- ✅ Validación de parámetros de entrada
- ✅ Sanitización de fechas
- ✅ Queries parametrizadas (prevención SQL injection)
- ✅ Manejo de errores con try/catch
- ✅ Logs de errores para debugging

---

## 📚 Documentación Detallada

Ver carpeta `/docs` para documentación completa:

1. **[01_KPIS_DEFINICIONES.md](docs/01_KPIS_DEFINICIONES.md)** - Definición matemática de cada KPI
2. **[02_MODELO_DATOS.md](docs/02_MODELO_DATOS.md)** - Estructura de la vista y queries SQL
3. **[03_ENDPOINTS_API.md](docs/03_ENDPOINTS_API.md)** - Especificación completa de API
4. **[04_GUIA_FRONTEND.md](docs/04_GUIA_FRONTEND.md)** - Guía para integración frontend

---

## 🚀 Próximos Pasos (Futuras Mejoras)

1. **Alertas Automáticas**: Notificaciones cuando caen las ventas
2. **Predicción con ML**: Forecasting de ventas futuras
3. **Análisis ABC**: Clasificación de productos por importancia
4. **Cohort Analysis**: Análisis de cohortes de clientes
5. **Exportación a Excel/PDF**: Reportes descargables
6. **Dashboard Visual**: Frontend con gráficos interactivos (Chart.js, D3.js)
7. **WebSockets**: Actualización en tiempo real sin polling

---

## 📞 Soporte

Para dudas o problemas:
1. Revisar logs del servidor: `pm2 logs api_pretty`
2. Verificar queries SQL en SQL Server Management Studio
3. Consultar documentación en `/docs`
4. Revisar ejemplos en colección de Postman

---

**Versión:** 1.0
**Autor:** Claude Code
**Fecha:** 2026-02-17
**Estado:** 📋 Listo para Implementación
