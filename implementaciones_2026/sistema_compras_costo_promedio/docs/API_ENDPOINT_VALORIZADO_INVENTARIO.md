# API Endpoint: Valorizado de Inventario

**Fecha de Implementación:** 2026-02-16
**Versión:** 1.0
**Módulo:** Sistema de Compras con Costo Promedio

---

## 📋 Descripción General

Endpoint para obtener el **valorizado completo del inventario** con análisis de rotación y clasificación ABC según el método de Pareto (80-15-5).

Proporciona una visión integral del capital invertido en inventario, permitiendo identificar:
- Productos que concentran la mayor parte del valor (Tipo A)
- Productos de rotación activa vs. inventario muerto
- Artículos que requieren reorden
- Análisis de días sin movimiento

**Ideal para:** Dashboards de control de costos, análisis financiero, gestión de inventarios, toma de decisiones estratégicas.

---

## 🎯 Endpoint

```
GET /api/compras/reportes/valorizado-inventario
```

**Autenticación:** Requerida (JWT token en header `x-access-token`)

---

## 📥 Parámetros de Query (Filtros)

Todos los parámetros son **opcionales**:

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `inv_sub_gru_cod` | number | - | Código de subcategoría de inventario |
| `fecha_compra_desde` | string | - | Fecha inicio de última compra (formato: YYYY-MM-DD) |
| `fecha_compra_hasta` | string | - | Fecha fin de última compra (formato: YYYY-MM-DD) |
| `clasificacion_abc` | string | - | Filtrar por clasificación Pareto (valores: A, B o C) |
| `limit` | number | 100 | Límite de registros (máximo: 1000) |
| `offset` | number | 0 | Offset para paginación |

**Nota:** La tabla `articulos` no tiene campo de estado. Se incluyen todos los artículos que tienen costo asignado en `articulosdetalle`.

### Ejemplos de URL

```bash
# Sin filtros (todos los artículos activos con costo)
GET /api/compras/reportes/valorizado-inventario

# Filtrar por subcategoría
GET /api/compras/reportes/valorizado-inventario?inv_sub_gru_cod=5

# Filtrar por rango de fechas de última compra
GET /api/compras/reportes/valorizado-inventario?fecha_compra_desde=2026-01-01&fecha_compra_hasta=2026-02-15

# Con paginación
GET /api/compras/reportes/valorizado-inventario?limit=50&offset=0

# Combinación de filtros
GET /api/compras/reportes/valorizado-inventario?inv_sub_gru_cod=5&fecha_compra_desde=2026-02-01&limit=100

# Filtrar por clasificación ABC
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=A

# Tipo A por subcategoría
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=A&inv_sub_gru_cod=5

# Tipo C comprados recientemente
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=C&fecha_compra_desde=2026-02-01&fecha_compra_hasta=2026-02-28
```

---

## 📤 Estructura de Respuesta

### Respuesta Exitosa (200 OK)

```json
{
  "success": true,
  "data": {
    "resumen": {
      "total_articulos": 245,
      "articulos_sin_costo": 15,
      "valor_total_inventario": 125750000,
      "clasificacion_abc": {
        "tipo_a": {
          "articulos": 49,
          "valor": 100600000,
          "porcentaje": 80
        },
        "tipo_b": {
          "articulos": 37,
          "valor": 18862500,
          "porcentaje": 15
        },
        "tipo_c": {
          "articulos": 159,
          "valor": 6287500,
          "porcentaje": 5
        }
      }
    },
    "articulos": [
      {
        "art_sec": "ART001",
        "art_cod": "SKU12345",
        "art_nom": "Labial Mate Rojo Intenso",
        "inv_sub_gru_cod": 5,
        "subcategoria_nombre": "Labiales",
        "existencia": 150,
        "costo_unitario": 25000,
        "valor_total": 3750000,
        "ultima_compra": "2026-02-10",
        "ultima_venta": "2026-02-15",
        "dias_sin_venta": 1,
        "dias_sin_compra": 6,
        "clasificacion_abc": "A",
        "porcentaje_valor_total": 2.98,
        "tiene_stock": true,
        "rotacion_activa": true,
        "requiere_reorden": false
      }
      // ... más artículos
    ],
    "total_registros": 245,
    "limit": 100,
    "offset": 0,
    "filtros_aplicados": {
      "solo_activos": true,
      "limit": 100,
      "offset": 0
    }
  }
}
```

### Descripción de Campos del Objeto `articulo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `art_sec` | string | Código secuencial del artículo (PK) |
| `art_cod` | string | SKU del producto |
| `art_nom` | string | Nombre del artículo |
| `inv_sub_gru_cod` | number | Código de subcategoría |
| `subcategoria_nombre` | string | Nombre de la subcategoría |
| `existencia` | number | Cantidad actual en inventario (de `vwExistencias`) |
| `costo_unitario` | number | Costo unitario actual (de `articulosdetalle.pre_cos`) |
| `valor_total` | number | Valor total = existencia × costo_unitario |
| `ultima_compra` | string\|null | Fecha de última compra (tipo `COM`) - formato ISO |
| `ultima_venta` | string\|null | Fecha de última venta (tipo `VTA`) - formato ISO |
| `dias_sin_venta` | number\|null | Días transcurridos desde última venta |
| `dias_sin_compra` | number\|null | Días transcurridos desde última compra |
| `clasificacion_abc` | string | Clasificación Pareto: `"A"`, `"B"` o `"C"` |
| `porcentaje_valor_total` | number | Porcentaje que representa del valor total del inventario |
| `tiene_stock` | boolean | `true` si existencia > 0 |
| `rotacion_activa` | boolean | `true` si última venta fue en los últimos 30 días |
| `requiere_reorden` | boolean | `true` si tiene stock pero no se vende hace más de 90 días |

---

## 🔍 Lógica de Clasificación ABC (Pareto)

La clasificación ABC se calcula ordenando los artículos por **valor total descendente** y acumulando porcentajes:

- **Tipo A**: Artículos que acumulan hasta el **80% del valor total** del inventario
- **Tipo B**: Artículos que acumulan del 80% al **95% del valor total**
- **Tipo C**: Artículos que representan el último **5% del valor total**

### Ejemplo:

```
Producto    | Valor        | % Individual | % Acumulado | Clasificación
------------|--------------|--------------|-------------|---------------
Producto 1  | $10,000,000  | 40%          | 40%         | A
Producto 2  | $6,000,000   | 24%          | 64%         | A
Producto 3  | $4,000,000   | 16%          | 80%         | A  ← Límite 80%
Producto 4  | $2,500,000   | 10%          | 90%         | B
Producto 5  | $1,250,000   | 5%           | 95%         | B  ← Límite 95%
Producto 6  | $750,000     | 3%           | 98%         | C
Producto 7  | $500,000     | 2%           | 100%        | C
```

---

## ⚠️ Casos Especiales

### 1. Artículos sin Costo Asignado

Los artículos sin costo (`pre_cos = NULL` o `pre_cos = 0`) **NO se incluyen** en el array de `articulos`, pero se cuentan en el campo:

```json
{
  "resumen": {
    "articulos_sin_costo": 15  // ← Contador de artículos excluidos
  }
}
```

### 2. Artículos sin Movimientos de Compra/Venta

Si un artículo nunca ha tenido compras o ventas:

```json
{
  "ultima_compra": null,
  "ultima_venta": null,
  "dias_sin_compra": null,
  "dias_sin_venta": null
}
```

La clasificación ABC se calcula **solo por valor**, sin considerar rotación.

### 3. Resultados Vacíos

Si no hay artículos que cumplan los filtros:

```json
{
  "success": true,
  "data": {
    "resumen": {
      "total_articulos": 0,
      "articulos_sin_costo": 15,
      "valor_total_inventario": 0,
      "clasificacion_abc": {
        "tipo_a": { "articulos": 0, "valor": 0, "porcentaje": 0 },
        "tipo_b": { "articulos": 0, "valor": 0, "porcentaje": 0 },
        "tipo_c": { "articulos": 0, "valor": 0, "porcentaje": 0 }
      }
    },
    "articulos": [],
    "total_registros": 0
  }
}
```

---

## ❌ Códigos de Error

### 400 Bad Request - Parámetros Inválidos

```json
{
  "success": false,
  "message": "inv_sub_gru_cod debe ser un número"
}
```

**Causas:**
- `inv_sub_gru_cod` no es un número
- `fecha_compra_desde` o `fecha_compra_hasta` no tienen formato YYYY-MM-DD
- `clasificacion_abc` no es A, B o C

### 401 Unauthorized - Token Inválido

```json
{
  "success": false,
  "message": "Token no proporcionado"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Error generando reporte de valorizado de inventario",
  "error": "Detalle del error"
}
```

---

## 🧪 Ejemplos de Uso

### Ejemplo 1: Obtener valorizado completo

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-inventario' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 2: Filtrar por subcategoría "Labiales"

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-inventario?inv_sub_gru_cod=5' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 3: Artículos comprados en febrero 2026

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-inventario?fecha_compra_desde=2026-02-01&fecha_compra_hasta=2026-02-28' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 4: Paginación (primera página de 50 registros)

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=50&offset=0' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 5: Segunda página

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=50&offset=50' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

---

## 📊 Casos de Uso para Dashboard

### 1. KPI Principal: Valor Total del Inventario

```javascript
const { valor_total_inventario } = response.data.resumen;
// Mostrar como métrica principal en el dashboard
```

### 2. Gráfico de Pareto (80-20)

```javascript
const { clasificacion_abc } = response.data.resumen;
// Tipo A: Productos críticos (80% del valor)
// Tipo B: Productos importantes (15% del valor)
// Tipo C: Productos de bajo impacto (5% del valor)
```

### 3. Tabla de Productos de Alta Rotación (Tipo A)

```javascript
const productosA = response.data.articulos.filter(art => art.clasificacion_abc === 'A');
// Mostrar en tabla prioritaria
```

### 4. Alerta de Inventario Muerto

```javascript
const inventarioMuerto = response.data.articulos.filter(art => art.requiere_reorden);
// Productos con stock pero sin ventas hace +90 días
```

### 5. Productos sin Rotación Reciente

```javascript
const sinRotacion = response.data.articulos.filter(art => !art.rotacion_activa);
// Productos sin ventas en últimos 30 días
```

---

## 🔗 Endpoints Relacionados

- `GET /api/compras` - Historial de compras
- `GET /api/compras/:fac_nro` - Detalle de compra específica
- `GET /api/compras/reportes/variacion-costos` - Variación de costos por artículo
- `GET /api/compras/reportes/por-proveedor` - Reporte por proveedor

---

## 📝 Notas Técnicas

### Ordenamiento

Los artículos se retornan ordenados por **valor_total DESC** (mayor a menor). Esto asegura que:
1. Los productos de mayor impacto aparecen primero
2. La clasificación ABC se calcula correctamente (acumulación ordenada)

### Performance

- La query usa `vwExistencias` (VIEW indexada) para obtener existencias
- Se aplican filtros a nivel de SQL para reducir el dataset
- Máximo de 1000 registros por request para prevenir sobrecarga

### Costos Utilizados

El costo unitario se obtiene de:
```sql
articulosdetalle.art_bod_cos_cat
WHERE bod_sec = '1' AND lis_pre_cod = 1
```

**Bodega:** Siempre bodega `'1'` (bodega principal)
**Lista de precios:** Siempre lista `1` (precio detal/retail)
**Campo de costo:** `art_bod_cos_cat` (costo de catálogo por bodega)

---

**Última actualización:** 2026-02-16
**Versión de la API:** 1.0
