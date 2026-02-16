# API Endpoint: Artículos Sin Costo

**Fecha de Implementación:** 2026-02-16
**Versión:** 1.0
**Módulo:** Sistema de Compras con Costo Promedio

---

## 📋 Descripción General

Endpoint para obtener el **listado de artículos sin costo asignado** en `articulosdetalle.art_bod_cos_cat`.

Estos artículos no pueden ser incluidos en el valorizado de inventario hasta que se les asigne un costo mediante:
1. Registro de compras (automático)
2. Carga manual de costos (Fase 0)

**Útil para:**
- Identificar productos pendientes de costeo
- Priorizar asignación de costos antes de compras
- Detectar artículos con stock pero sin valor asignado

---

## 🎯 Endpoint

```
GET /api/compras/reportes/articulos-sin-costo
```

**Autenticación:** Requerida (JWT token en header `x-access-token`)

---

## 📥 Parámetros de Query (Filtros)

Todos los parámetros son **opcionales**:

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `inv_sub_gru_cod` | number | - | Código de subcategoría de inventario |
| `solo_con_existencia` | boolean | false | Solo artículos con stock > 0 |
| `limit` | number | 100 | Límite de registros (máximo: 1000) |
| `offset` | number | 0 | Offset para paginación |

### Ejemplos de URL

```bash
# Todos los artículos sin costo
GET /api/compras/reportes/articulos-sin-costo

# Solo artículos con existencia (PRIORIDAD ALTA)
GET /api/compras/reportes/articulos-sin-costo?solo_con_existencia=true

# Por subcategoría específica
GET /api/compras/reportes/articulos-sin-costo?inv_sub_gru_cod=5

# Con paginación
GET /api/compras/reportes/articulos-sin-costo?limit=50&offset=0
```

---

## 📤 Estructura de Respuesta

### Respuesta Exitosa (200 OK)

```json
{
  "success": true,
  "data": {
    "total_articulos": 253,
    "margen_sugerido": 20,
    "articulos": [
      {
        "art_sec": "ART001",
        "art_cod": "SKU12345",
        "art_nom": "Labial Mate Rojo Intenso",
        "inv_sub_gru_cod": 5,
        "subcategoria_nombre": "Labiales",
        "existencia": 150,
        "precio_mayor": 30000,
        "precio_detal": 35000,
        "costo_sugerido": 25000
      },
      {
        "art_sec": "ART002",
        "art_cod": "SKU67890",
        "art_nom": "Crema Facial Anti-Edad",
        "inv_sub_gru_cod": 8,
        "subcategoria_nombre": "Cremas",
        "existencia": 0,
        "precio_mayor": 50000,
        "precio_detal": 60000,
        "costo_sugerido": 41666.67
      }
    ],
    "filtros_aplicados": {
      "limit": 100,
      "offset": 0
    }
  }
}
```

### Descripción de Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `total_articulos` | number | Cantidad de artículos sin costo en la respuesta |
| `margen_sugerido` | number | Margen utilizado para calcular costo sugerido (%) |
| `articulos` | array | Lista de artículos sin costo |

#### Objeto `articulo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `art_sec` | string | Código secuencial del artículo (PK) |
| `art_cod` | string | SKU del producto |
| `art_nom` | string | Nombre del artículo |
| `inv_sub_gru_cod` | number | Código de subcategoría |
| `subcategoria_nombre` | string | Nombre de la subcategoría |
| `existencia` | number | Cantidad actual en inventario |
| `precio_mayor` | number | Precio mayorista (lis_pre_cod = 2) |
| `precio_detal` | number | Precio detal/retail (lis_pre_cod = 1) |
| `costo_sugerido` | number | Costo calculado: `precio_mayor / 1.20` |

---

## 💡 Costo Sugerido

El endpoint calcula automáticamente un **costo sugerido** basado en el precio mayorista usando la misma fórmula de la Fase 0:

```
Costo Sugerido = Precio Mayor / (1 + margen/100)
```

**Parámetros por defecto:**
- Margen: 20%
- Divisor: 1.20

**Ejemplo:**
```
Precio Mayor: $30,000
Margen: 20%
Costo Sugerido: $30,000 / 1.20 = $25,000
```

Este valor es **solo una sugerencia**. El costo real debe asignarse mediante:
1. Registro de compra real (recomendado)
2. Carga manual si se conoce el costo exacto

---

## ⚠️ Casos de Prioridad

### 1. Artículos con Existencia Sin Costo (CRÍTICO)

```bash
GET /api/compras/reportes/articulos-sin-costo?solo_con_existencia=true
```

Estos artículos:
- ✅ Tienen stock en inventario
- ❌ No tienen costo asignado
- ⚠️ **No se pueden valorizar**

**Impacto:** El valor del inventario está subestimado.

**Acción recomendada:**
1. Asignar costo inmediatamente
2. Usar costo sugerido si no hay historial de compra
3. Registrar la siguiente compra para actualizar a costo real

### 2. Artículos sin Existencia Sin Costo (MEDIA PRIORIDAD)

Estos artículos:
- ❌ No tienen stock
- ❌ No tienen costo

**Acción recomendada:**
- Esperar a la primera compra para asignar costo automáticamente

---

## 🔍 Casos de Uso

### 1. Dashboard: Alerta de Artículos Pendientes

```javascript
async function verificarArticulosSinCosto(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/articulos-sin-costo?solo_con_existencia=true&limit=10',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  if (data.success && data.data.total_articulos > 0) {
    console.log(`⚠️ ALERTA: ${data.data.total_articulos} artículos con stock sin costo asignado`);

    // Mostrar los primeros 5
    data.data.articulos.slice(0, 5).forEach(art => {
      console.log(`- ${art.art_nom} (${art.art_cod})`);
      console.log(`  Stock: ${art.existencia} | Costo sugerido: $${art.costo_sugerido}`);
    });
  }

  return data.data;
}
```

### 2. Pre-validación Antes de Registrar Compra

```javascript
async function validarProductoTieneCosto(token, art_sec) {
  const response = await fetch(
    `http://localhost:3000/api/compras/reportes/articulos-sin-costo?limit=1000`,
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();
  const articulosSinCosto = data.data.articulos.map(art => art.art_sec);

  if (articulosSinCosto.includes(art_sec)) {
    return {
      tiene_costo: false,
      mensaje: 'Este producto no tiene costo asignado. La compra asignará el primer costo.'
    };
  }

  return { tiene_costo: true };
}
```

### 3. Generar Reporte Excel de Pendientes

```javascript
async function exportarArticulosSinCosto(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/articulos-sin-costo?limit=1000',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Convertir a formato CSV
  const csv = [
    ['SKU', 'Nombre', 'Categoría', 'Existencia', 'Precio Mayor', 'Costo Sugerido'].join(','),
    ...data.data.articulos.map(art => [
      art.art_cod,
      `"${art.art_nom}"`,
      `"${art.subcategoria_nombre}"`,
      art.existencia,
      art.precio_mayor,
      art.costo_sugerido
    ].join(','))
  ].join('\n');

  // Descargar CSV
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'articulos_sin_costo.csv';
  a.click();
}
```

### 4. Asignación Masiva de Costos Sugeridos

```javascript
async function aplicarCostosSugeridos(token) {
  // 1. Obtener artículos sin costo
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/articulos-sin-costo?limit=1000',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // 2. Preparar datos para carga masiva (usando endpoint de Fase 0)
  const costosParaCargar = data.data.articulos
    .filter(art => art.precio_mayor > 0)  // Solo con precio mayor válido
    .map(art => ({
      art_sec: art.art_sec,
      art_cod: art.art_cod,
      costo_propuesto: art.costo_sugerido
    }));

  console.log(`Preparados ${costosParaCargar.length} costos para asignar`);

  // 3. Usar endpoint de Fase 0 para importar
  // POST /api/carga-costos/importar
  // (Ver documentación de Fase 0)
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
  "message": "Error obteniendo artículos sin costo",
  "error": "Detalle del error"
}
```

---

## 🧪 Ejemplos de Uso con cURL

### Ejemplo 1: Todos los artículos sin costo

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/articulos-sin-costo' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 2: Solo con existencia (prioridad alta)

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/articulos-sin-costo?solo_con_existencia=true' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 3: Por subcategoría

```bash
curl -X GET \
  'http://localhost:3000/api/compras/reportes/articulos-sin-costo?inv_sub_gru_cod=5' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Ejemplo 4: Con paginación

```bash
# Primera página
curl -X GET \
  'http://localhost:3000/api/compras/reportes/articulos-sin-costo?limit=50&offset=0' \
  -H 'x-access-token: YOUR_JWT_TOKEN'

# Segunda página
curl -X GET \
  'http://localhost:3000/api/compras/reportes/articulos-sin-costo?limit=50&offset=50' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

---

## 🔗 Endpoints Relacionados

- `GET /api/compras/reportes/valorizado-inventario` - Ver artículos CON costo
- `GET /api/carga-costos/resumen` - Estado de carga de costos (Fase 0)
- `POST /api/carga-costos/calcular-automatico` - Asignar costos automáticamente
- `POST /api/compras` - Registrar compra (asigna costo automáticamente)

---

## 📊 Integración con Valorizado de Inventario

El contador `articulos_sin_costo` del endpoint de valorizado proviene de esta misma query:

```javascript
// En el valorizado
GET /api/compras/reportes/valorizado-inventario?limit=1

// Retorna:
{
  resumen: {
    articulos_sin_costo: 253  // ← Este número
  }
}

// Para ver el detalle de esos 253 artículos:
GET /api/compras/reportes/articulos-sin-costo
```

---

## 📝 Notas Técnicas

### Cálculo del Costo Sugerido

El costo sugerido se calcula en el controlador, no en la BD:

```javascript
const margenSugerido = 20; // 20% de margen por defecto
const costo_sugerido = art.precio_mayor
  ? parseFloat((art.precio_mayor / (1 + margenSugerido / 100)).toFixed(2))
  : 0;
```

### Campos de Precio

- `precio_mayor`: De `articulosdetalle` con `lis_pre_cod = 2`
- `precio_detal`: De `articulosdetalle` con `lis_pre_cod = 1`
- Ambos en bodega `'1'`

### Performance

- Máximo 1000 registros por request
- Query optimizada con LEFT JOINs
- Ordenado por `art_cod` (SKU)

---

**Última actualización:** 2026-02-16
**Versión de la API:** 1.0
