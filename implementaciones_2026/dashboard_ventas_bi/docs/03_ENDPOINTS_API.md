# Documentación de Endpoints - Dashboard de Ventas BI

**Fecha:** 2026-02-17
**Versión:** 1.0
**Base URL:** `/api/dashboard/ventas`

---

## 🔐 Autenticación

Todos los endpoints requieren autenticación mediante JWT token.

**Header requerido:**
```
x-access-token: {tu_jwt_token}
```

**Obtener token:**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "usu_cod": "tu_usuario",
  "usu_pass": "tu_password"
}
```

---

## 📅 Parámetros Comunes

### Parámetros de Período

Todos los endpoints aceptan estos parámetros opcionales:

**Opción 1: Período Predefinido**
```
?periodo={nombre_periodo}
```

Períodos disponibles:
- `hoy` - Día actual
- `ayer` - Día anterior
- `ultimos_7_dias` - Últimos 7 días
- `ultimos_15_dias` - Últimos 15 días
- `ultimos_30_dias` - Últimos 30 días (default)
- `semana_actual` - Semana actual (lunes a hoy)
- `semana_anterior` - Semana pasada completa
- `mes_actual` - Mes actual (día 1 a hoy)
- `mes_anterior` - Mes pasado completo

**Opción 2: Fechas Personalizadas**
```
?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
```

Ejemplo: `?fecha_inicio=2026-02-01&fecha_fin=2026-02-17`

---

## 📊 Endpoints Principales

### 1. Dashboard Completo

**Endpoint principal que retorna todos los KPIs en una sola llamada.**

```
GET /api/dashboard/ventas/completo
```

**Query Parameters:**
- `periodo` (opcional): Período predefinido
- `fecha_inicio` + `fecha_fin` (opcional): Rango personalizado

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
    "tendencia_diaria": [...],
    "periodo": {
      "fecha_inicio": "2026-01-18",
      "fecha_fin": "2026-02-17"
    }
  }
}
```

**Ejemplo de uso:**
```bash
# Dashboard de los últimos 30 días
curl -X GET "http://localhost:3000/api/dashboard/ventas/completo?periodo=ultimos_30_dias" \
  -H "x-access-token: tu_token_jwt"

# Dashboard del mes actual
curl -X GET "http://localhost:3000/api/dashboard/ventas/completo?periodo=mes_actual" \
  -H "x-access-token: tu_token_jwt"
```

---

### 2. KPIs Principales

**Obtiene métricas principales de ventas.**

```
GET /api/dashboard/ventas/kpis
```

**Query Parameters:**
- `periodo` (opcional)
- `fecha_inicio` + `fecha_fin` (opcional)

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "ventas_totales": 15500000,
    "numero_ordenes": 234,
    "ticket_promedio": 66239.32,
    "clientes_unicos": 187,
    "unidades_vendidas": 1456,
    "utilidad_bruta_total": 5430000,
    "rentabilidad_promedio": 35.03,
    "costo_total_ventas": 10070000
  },
  "periodo": {
    "fecha_inicio": "2026-01-18",
    "fecha_fin": "2026-02-17"
  }
}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3000/api/dashboard/ventas/kpis?periodo=mes_actual" \
  -H "x-access-token: tu_token_jwt"
```

---

### 3. Tasa de Crecimiento

**Compara ventas del período actual vs anterior.**

```
GET /api/dashboard/ventas/crecimiento
```

**Query Parameters:**
- `periodo` (opcional): Se compara automáticamente con período anterior equivalente

O usar fechas personalizadas:
- `fecha_inicio_actual`
- `fecha_fin_actual`
- `fecha_inicio_anterior`
- `fecha_fin_anterior`

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
  },
  "periodos": {
    "actual": {
      "fecha_inicio": "2026-02-01",
      "fecha_fin": "2026-02-17"
    },
    "anterior": {
      "fecha_inicio": "2026-01-01",
      "fecha_fin": "2026-01-31"
    }
  }
}
```

**Ejemplo:**
```bash
# Comparar mes actual vs mes anterior
curl -X GET "http://localhost:3000/api/dashboard/ventas/crecimiento?periodo=mes_actual" \
  -H "x-access-token: tu_token_jwt"
```

---

### 4. Top Productos

**Productos más vendidos por unidades o ingresos.**

```
GET /api/dashboard/ventas/top-productos
```

**Query Parameters:**
- `periodo` (opcional)
- `fecha_inicio` + `fecha_fin` (opcional)
- `limite` (opcional, default: 10): Cantidad de productos a retornar
- `ordenar_por` (opcional, default: "unidades"): `"unidades"` o `"ingresos"`

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "art_cod": "LAB-001",
      "art_nom": "Labial Ruby Face Rojo",
      "categoria": "Maquillaje",
      "subcategoria": "Labiales",
      "unidades_vendidas": 125,
      "ingresos_totales": 6250000,
      "utilidad_total": 2750000,
      "precio_promedio": 50000,
      "rentabilidad_promedio": 44.00,
      "numero_ordenes": 89
    },
    ...
  ],
  "parametros": {
    "limite": 10,
    "ordenar_por": "ingresos"
  },
  "periodo": {
    "fecha_inicio": "2026-01-18",
    "fecha_fin": "2026-02-17"
  }
}
```

**Ejemplos:**
```bash
# Top 10 por unidades vendidas
curl -X GET "http://localhost:3000/api/dashboard/ventas/top-productos?limite=10&ordenar_por=unidades&periodo=mes_actual" \
  -H "x-access-token: tu_token_jwt"

# Top 20 por ingresos
curl -X GET "http://localhost:3000/api/dashboard/ventas/top-productos?limite=20&ordenar_por=ingresos&periodo=ultimos_30_dias" \
  -H "x-access-token: tu_token_jwt"
```

---

### 5. Ventas por Categoría

**Distribución de ventas por categoría de productos.**

```
GET /api/dashboard/ventas/categorias
```

**Query Parameters:**
- `periodo` (opcional)
- `fecha_inicio` + `fecha_fin` (opcional)

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "categoria": "Maquillaje",
      "productos_diferentes": 78,
      "unidades_vendidas": 856,
      "ventas_totales": 9500000,
      "utilidad_total": 3325000,
      "rentabilidad_promedio": 35.00,
      "porcentaje_ventas": 61.29
    },
    {
      "categoria": "Cuidado de la Piel",
      "productos_diferentes": 45,
      "unidades_vendidas": 450,
      "ventas_totales": 4200000,
      "utilidad_total": 1470000,
      "rentabilidad_promedio": 35.00,
      "porcentaje_ventas": 27.10
    },
    ...
  ],
  "periodo": {
    "fecha_inicio": "2026-01-18",
    "fecha_fin": "2026-02-17"
  }
}
```

---

### 6. Ventas por Rentabilidad

**Distribución de ventas por clasificación de rentabilidad.**

```
GET /api/dashboard/ventas/rentabilidad
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "clasificacion": "ALTA",
      "items_vendidos": 234,
      "ventas_totales": 8900000,
      "utilidad_total": 3916000,
      "rentabilidad_promedio": 44.00,
      "numero_ordenes": 156
    },
    {
      "clasificacion": "MEDIA",
      "items_vendidos": 567,
      "ventas_totales": 5200000,
      "utilidad_total": 1456000,
      "rentabilidad_promedio": 28.00,
      "numero_ordenes": 198
    },
    ...
  ],
  "periodo": {...}
}
```

---

### 7. Top Clientes

**Clientes con mayor valor de compras.**

```
GET /api/dashboard/ventas/top-clientes
```

**Query Parameters:**
- `periodo` (opcional)
- `fecha_inicio` + `fecha_fin` (opcional)
- `limite` (opcional, default: 10)

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "nit_sec": "123456",
      "nombre": "María González",
      "email": "maria@example.com",
      "numero_ordenes": 8,
      "valor_total_compras": 580000,
      "ticket_promedio": 72500,
      "unidades_compradas": 24,
      "ultima_compra": "2026-02-15",
      "primera_compra": "2026-01-05"
    },
    ...
  ],
  "parametros": {
    "limite": 10
  },
  "periodo": {...}
}
```

---

### 8. Órdenes por Estado

**Distribución de órdenes por estado WooCommerce.**

```
GET /api/dashboard/ventas/ordenes-estado
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "estado": "completed",
      "numero_ordenes": 198,
      "valor_total": 13200000,
      "valor_promedio": 66666.67
    },
    {
      "estado": "processing",
      "numero_ordenes": 28,
      "valor_total": 1850000,
      "valor_promedio": 66071.43
    },
    ...
  ],
  "periodo": {...}
}
```

---

### 9. Órdenes por Canal

**Comparativa WooCommerce vs Local.**

```
GET /api/dashboard/ventas/ordenes-canal
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "canal": "WooCommerce",
      "numero_ordenes": 189,
      "ventas_totales": 12500000,
      "ticket_promedio": 66137.57,
      "utilidad_total": 4375000,
      "rentabilidad_promedio": 35.00
    },
    {
      "canal": "Local",
      "numero_ordenes": 45,
      "ventas_totales": 3000000,
      "ticket_promedio": 66666.67,
      "utilidad_total": 1050000,
      "rentabilidad_promedio": 35.00
    }
  ],
  "periodo": {...}
}
```

---

### 10. Tendencia Diaria

**Evolución de ventas día por día.**

```
GET /api/dashboard/ventas/tendencia-diaria
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "fecha": "2026-02-01",
      "numero_ordenes": 8,
      "ventas_totales": 530000,
      "ticket_promedio": 66250,
      "unidades_vendidas": 42,
      "utilidad_total": 185500
    },
    {
      "fecha": "2026-02-02",
      "numero_ordenes": 12,
      "ventas_totales": 795000,
      "ticket_promedio": 66250,
      "unidades_vendidas": 63,
      "utilidad_total": 278250
    },
    ...
  ],
  "periodo": {...}
}
```

---

### 11. Ventas por Hora

**Distribución de ventas por hora del día.**

```
GET /api/dashboard/ventas/ventas-hora
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "hora": 9,
      "numero_ordenes": 12,
      "ventas_totales": 795000,
      "ticket_promedio": 66250
    },
    {
      "hora": 10,
      "numero_ordenes": 23,
      "ventas_totales": 1523750,
      "ticket_promedio": 66250
    },
    ...
  ],
  "periodo": {...}
}
```

---

## ⚠️ Manejo de Errores

### Error 400 - Bad Request
```json
{
  "success": false,
  "message": "Período inválido. Valores válidos: hoy, ayer, ultimos_7_dias, ..."
}
```

### Error 401 - Unauthorized
```json
{
  "success": false,
  "message": "Token no proporcionado"
}
```

### Error 500 - Server Error
```json
{
  "success": false,
  "message": "Error obteniendo KPIs principales",
  "error": "Detalle del error"
}
```

---

## 🚀 Mejores Prácticas

### 1. Usar Dashboard Completo para Vista Principal
```javascript
// Una sola llamada obtiene todos los KPIs
const response = await fetch('/api/dashboard/ventas/completo?periodo=mes_actual', {
  headers: { 'x-access-token': token }
});
```

### 2. Cachear Resultados
```javascript
// Cachear por 5-15 minutos para reducir carga
const CACHE_TIME = 5 * 60 * 1000; // 5 minutos
```

### 3. Usar Períodos Predefinidos
```javascript
// Más fácil y consistente que calcular fechas
?periodo=mes_actual
// vs
?fecha_inicio=2026-02-01&fecha_fin=2026-02-17
```

### 4. Loading States
```javascript
// Mostrar indicadores de carga
const [loading, setLoading] = useState(true);
const [data, setData] = useState(null);
```

### 5. Error Handling
```javascript
try {
  const response = await fetchDashboard();
  if (!response.success) {
    showError(response.message);
  }
} catch (error) {
  showError('Error de conexión');
}
```

---

## 📊 Ejemplo de Integración Completa

```javascript
// React/Vue/Angular Example
const DashboardVentas = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes_actual');

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/dashboard/ventas/completo?periodo=${periodo}`,
          {
            headers: {
              'x-access-token': localStorage.getItem('token')
            }
          }
        );

        const data = await response.json();

        if (data.success) {
          setDashboard(data.data);
        } else {
          console.error(data.message);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [periodo]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <KPIsCard kpis={dashboard.kpis_principales} />
      <TopProductosChart data={dashboard.top_productos} />
      <CategoriasChart data={dashboard.ventas_por_categoria} />
      <TendenciaChart data={dashboard.tendencia_diaria} />
      <TopClientesTable data={dashboard.top_clientes} />
    </div>
  );
};
```

---

**Versión:** 1.0
**Fecha:** 2026-02-17
**Mantenido por:** Equipo Backend API Pretty
