# API Endpoint: Árbol de Valorizado por Categoría y Subcategoría

**Fecha de Implementación:** 2026-02-16
**Versión:** 1.0
**Módulo:** Sistema de Compras con Costo Promedio
**Solicitado por:** Equipo Frontend

---

## 📋 Descripción General

Sistema de 3 endpoints para construir un **árbol drill-down dinámico** de valorizado de inventario con navegación jerárquica:

```
Nivel 1: Categorías (inventario_grupo)
   ↓
Nivel 2: Subcategorías (inventario_subgrupo)
   ↓
Nivel 3: Artículos (articulos)
```

**Patrón lazy-loading:** El frontend carga datos solo cuando el usuario expande un nodo, mejorando significativamente la performance.

**Totales consistentes:** Todos los cálculos se realizan en backend, garantizando precisión financiera en todos los niveles.

---

## 🎯 Endpoints

### Nivel 1: Categorías (Nodos Raíz)

```
GET /api/compras/reportes/valorizado-arbol/categorias
```

### Nivel 2: Subcategorías (Hijos de Categoría)

```
GET /api/compras/reportes/valorizado-arbol/categorias/:inv_gru_cod/subcategorias
```

### Nivel 3: Artículos (Hijos de Subcategoría)

```
GET /api/compras/reportes/valorizado-arbol/subcategorias/:inv_sub_gru_cod/articulos
```

**Autenticación:** Requerida (JWT token en header `x-access-token`)

---

## 📥 Parámetros de Query (Comunes a Todos los Endpoints)

Todos los filtros son **opcionales** y se aplican **consistentemente** en los 3 niveles:

| Parámetro | Tipo | Valores | Descripción |
|-----------|------|---------|-------------|
| `fecha_compra_desde` | string | YYYY-MM-DD | Fecha inicio de última compra |
| `fecha_compra_hasta` | string | YYYY-MM-DD | Fecha fin de última compra |
| `clasificacion_abc` | string | A, B o C | Filtrar por clasificación Pareto |
| `solo_con_stock` | boolean | true\|false | Solo artículos con existencia > 0 |

**Parámetros adicionales para Nivel 3 (Artículos):**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Límite de registros (máximo: 1000) |
| `offset` | number | 0 | Offset para paginación |

---

## 📤 Estructura de Respuestas

### Nivel 1: Categorías

**Request:**
```bash
GET /api/compras/reportes/valorizado-arbol/categorias
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "inv_gru_cod": "1",
      "categoria_nombre": "Maquillaje",
      "total_articulos": 320,
      "valor_total": 45200000,
      "porcentaje_sobre_total": 53.4
    },
    {
      "inv_gru_cod": "2",
      "categoria_nombre": "Cuidado de la Piel",
      "total_articulos": 180,
      "valor_total": 28300000,
      "porcentaje_sobre_total": 33.5
    },
    {
      "inv_gru_cod": "3",
      "categoria_nombre": "Fragancias",
      "total_articulos": 95,
      "valor_total": 11000000,
      "porcentaje_sobre_total": 13.0
    }
  ],
  "resumen_global": {
    "valor_total_inventario": 84500000,
    "total_articulos": 595
  },
  "filtros_aplicados": {}
}
```

**Campos de `data` (categoría):**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `inv_gru_cod` | string | Código de categoría (PK) |
| `categoria_nombre` | string | Nombre de la categoría |
| `total_articulos` | number | Cantidad de artículos en la categoría |
| `valor_total` | number | Valor total del inventario de la categoría |
| `porcentaje_sobre_total` | number | % que representa del valor total global |

---

### Nivel 2: Subcategorías

**Request:**
```bash
GET /api/compras/reportes/valorizado-arbol/categorias/1/subcategorias
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "inv_sub_gru_cod": 5,
      "subcategoria_nombre": "Labiales",
      "total_articulos": 87,
      "valor_total": 11300000,
      "porcentaje_sobre_categoria": 25.0,
      "porcentaje_sobre_total": 13.4
    },
    {
      "inv_sub_gru_cod": 6,
      "subcategoria_nombre": "Sombras",
      "total_articulos": 125,
      "valor_total": 18900000,
      "porcentaje_sobre_categoria": 41.8,
      "porcentaje_sobre_total": 22.4
    },
    {
      "inv_sub_gru_cod": 7,
      "subcategoria_nombre": "Bases",
      "total_articulos": 108,
      "valor_total": 15000000,
      "porcentaje_sobre_categoria": 33.2,
      "porcentaje_sobre_total": 17.8
    }
  ],
  "filtros_aplicados": {
    "inv_gru_cod": "1"
  }
}
```

**Campos de `data` (subcategoría):**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `inv_sub_gru_cod` | number | Código de subcategoría (PK) |
| `subcategoria_nombre` | string | Nombre de la subcategoría |
| `total_articulos` | number | Cantidad de artículos en la subcategoría |
| `valor_total` | number | Valor total del inventario de la subcategoría |
| `porcentaje_sobre_categoria` | number | % que representa del valor de la categoría padre |
| `porcentaje_sobre_total` | number | % que representa del valor total global |

---

### Nivel 3: Artículos

**Request:**
```bash
GET /api/compras/reportes/valorizado-arbol/subcategorias/5/articulos?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": {
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
    "total_registros": 87,
    "limit": 50,
    "offset": 0
  },
  "filtros_aplicados": {
    "inv_sub_gru_cod": 5,
    "limit": 50,
    "offset": 0
  }
}
```

**Nota:** El nivel 3 reutiliza la estructura completa del endpoint de valorizado de inventario. Ver [API_ENDPOINT_VALORIZADO_INVENTARIO.md](API_ENDPOINT_VALORIZADO_INVENTARIO.md) para detalles de campos de artículos.

---

## 🔍 Ejemplos de Uso con Filtros

### Ejemplo 1: Categorías con Stock Positivo

```bash
GET /api/compras/reportes/valorizado-arbol/categorias?solo_con_stock=true
```

Retorna solo categorías que tienen artículos con existencia > 0.

---

### Ejemplo 2: Subcategorías de Productos Tipo A

```bash
GET /api/compras/reportes/valorizado-arbol/categorias/1/subcategorias?clasificacion_abc=A
```

Retorna solo subcategorías de la categoría "1" que contienen productos Tipo A (80% del valor).

---

### Ejemplo 3: Artículos Comprados en Febrero 2026

```bash
GET /api/compras/reportes/valorizado-arbol/subcategorias/5/articulos?fecha_compra_desde=2026-02-01&fecha_compra_hasta=2026-02-28
```

Retorna artículos de la subcategoría "5" cuya última compra fue en febrero 2026.

---

### Ejemplo 4: Drill-down Completo con Filtros Consistentes

**Paso 1:** Obtener categorías Tipo A con stock
```bash
GET /api/compras/reportes/valorizado-arbol/categorias?clasificacion_abc=A&solo_con_stock=true
```

**Paso 2:** Usuario expande categoría "1", obtener subcategorías con los mismos filtros
```bash
GET /api/compras/reportes/valorizado-arbol/categorias/1/subcategorias?clasificacion_abc=A&solo_con_stock=true
```

**Paso 3:** Usuario expande subcategoría "5", obtener artículos con los mismos filtros
```bash
GET /api/compras/reportes/valorizado-arbol/subcategorias/5/articulos?clasificacion_abc=A&solo_con_stock=true&limit=50&offset=0
```

**Beneficio:** Los filtros se aplican consistentemente en los 3 niveles, garantizando coherencia de datos.

---

## ⚠️ Reglas de Negocio

### 1. Totales Calculados en Backend

**Regla:** Todos los totales, porcentajes y agregaciones se calculan en el backend, **nunca en el frontend**.

**Motivo:** Garantizar precisión financiera y consistencia entre niveles.

### 2. Filtros Aplicados en Todos los Niveles

**Regla:** Si se envía `clasificacion_abc=A`, **todos los niveles** filtran solo artículos Tipo A antes de agrupar.

**Ejemplo:**
- Si filtras `clasificacion_abc=A` en categorías:
  - Solo se cuentan artículos Tipo A
  - El `total_articulos` de cada categoría es la cantidad de artículos Tipo A
  - El `valor_total` es la suma del valor de artículos Tipo A

### 3. Solo con Stock

**Regla:** Si se envía `solo_con_stock=true`, se excluyen artículos con existencia <= 0 **antes de agrupar**.

**Impacto:** Las categorías pueden desaparecer si todos sus artículos tienen stock 0.

### 4. Consistencia de Totales Entre Niveles

**Regla:** La suma de valores de subcategorías **debe ser igual** al valor de la categoría padre.

**Garantía:** Implementado en el modelo con queries consistentes.

---

## ❌ Códigos de Error

### 400 Bad Request - Parámetros Inválidos

**Causas:**
- `fecha_compra_desde` o `fecha_compra_hasta` no tienen formato YYYY-MM-DD
- `clasificacion_abc` no es A, B o C
- `solo_con_stock` no es true o false
- `inv_gru_cod` faltante (Nivel 2)
- `inv_sub_gru_cod` faltante o no es número (Nivel 3)

**Ejemplo:**
```json
{
  "success": false,
  "message": "clasificacion_abc debe ser A, B o C"
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
  "message": "Error generando reporte de valorizado por categorías",
  "error": "Detalle del error"
}
```

---

## 🧪 Testing con cURL

### Nivel 1: Categorías

```bash
# Todas las categorías
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias' \
  -H 'x-access-token: YOUR_JWT_TOKEN'

# Solo categorías con stock
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias?solo_con_stock=true' \
  -H 'x-access-token: YOUR_JWT_TOKEN'

# Solo categorías Tipo A
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias?clasificacion_abc=A' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Nivel 2: Subcategorías

```bash
# Todas las subcategorías de la categoría "1"
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias/1/subcategorias' \
  -H 'x-access-token: YOUR_JWT_TOKEN'

# Subcategorías Tipo B con stock
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias/1/subcategorias?clasificacion_abc=B&solo_con_stock=true' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

### Nivel 3: Artículos

```bash
# Primera página de artículos de la subcategoría "5"
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/subcategorias/5/articulos?limit=50&offset=0' \
  -H 'x-access-token: YOUR_JWT_TOKEN'

# Artículos comprados en febrero
curl -X GET \
  'http://localhost:3000/api/compras/reportes/valorizado-arbol/subcategorias/5/articulos?fecha_compra_desde=2026-02-01&fecha_compra_hasta=2026-02-28' \
  -H 'x-access-token: YOUR_JWT_TOKEN'
```

---

## 💡 Casos de Uso para Dashboard

### 1. Árbol de Navegación Drill-Down

```javascript
async function cargarArbolValorizado(token) {
  // Paso 1: Cargar nodos raíz (categorías)
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Renderizar categorías en UI tipo árbol
  return data.data.map(cat => ({
    id: cat.inv_gru_cod,
    label: `${cat.categoria_nombre} - $${cat.valor_total.toLocaleString()}`,
    value: cat.valor_total,
    percentage: cat.porcentaje_sobre_total,
    children: [] // Lazy load cuando se expanda
  }));
}

async function expandirCategoria(token, inv_gru_cod) {
  // Paso 2: Cargar hijos cuando el usuario expande
  const response = await fetch(
    `http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias/${inv_gru_cod}/subcategorias`,
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  return data.data.map(sub => ({
    id: sub.inv_sub_gru_cod,
    label: `${sub.subcategoria_nombre} - $${sub.valor_total.toLocaleString()}`,
    value: sub.valor_total,
    percentage: sub.porcentaje_sobre_categoria,
    children: [] // Lazy load artículos
  }));
}

async function expandirSubcategoria(token, inv_sub_gru_cod) {
  // Paso 3: Cargar artículos paginados
  const response = await fetch(
    `http://localhost:3000/api/compras/reportes/valorizado-arbol/subcategorias/${inv_sub_gru_cod}/articulos?limit=20&offset=0`,
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  return data.data.articulos.map(art => ({
    id: art.art_sec,
    label: `${art.art_nom} - $${art.valor_total.toLocaleString()}`,
    value: art.valor_total,
    stock: art.existencia,
    clasificacion: art.clasificacion_abc
  }));
}
```

### 2. Vista de Control de Costos por Categoría

```javascript
async function dashboardControlCostos(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias?solo_con_stock=true',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Mostrar en dashboard con indicadores visuales
  return {
    total_inventario: data.resumen_global.valor_total_inventario,
    categorias: data.data.map(cat => ({
      nombre: cat.categoria_nombre,
      valor: cat.valor_total,
      porcentaje: cat.porcentaje_sobre_total,
      alerta: cat.porcentaje_sobre_total > 50 ? 'Concentración alta' : 'OK'
    }))
  };
}
```

### 3. Análisis de Categorías Tipo A (Pareto)

```javascript
async function analizarCategoriasAltoImpacto(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias?clasificacion_abc=A',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Identificar categorías que concentran el 80% del valor
  const categoriasA = data.data;

  console.log(`${categoriasA.length} categorías concentran el 80% del valor del inventario`);

  // Para cada categoría A, obtener subcategorías detalle
  const analisisDetallado = await Promise.all(
    categoriasA.map(async cat => {
      const subResponse = await fetch(
        `http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias/${cat.inv_gru_cod}/subcategorias?clasificacion_abc=A`,
        { headers: { 'x-access-token': token } }
      );

      const subData = await subResponse.json();

      return {
        categoria: cat.categoria_nombre,
        valor_total: cat.valor_total,
        subcategorias_criticas: subData.data
      };
    })
  );

  return analisisDetallado;
}
```

### 4. Filtro Dinámico con Sincronización de Niveles

```javascript
class ArbolValorizadoComponent {
  constructor(token) {
    this.token = token;
    this.filtros = {
      clasificacion_abc: null,
      solo_con_stock: false,
      fecha_compra_desde: null,
      fecha_compra_hasta: null
    };
  }

  aplicarFiltros(nuevosFiltros) {
    this.filtros = { ...this.filtros, ...nuevosFiltros };
    this.recargarArbol();
  }

  async recargarArbol() {
    // Construir query params desde filtros
    const params = new URLSearchParams();

    if (this.filtros.clasificacion_abc) {
      params.append('clasificacion_abc', this.filtros.clasificacion_abc);
    }

    if (this.filtros.solo_con_stock) {
      params.append('solo_con_stock', 'true');
    }

    if (this.filtros.fecha_compra_desde) {
      params.append('fecha_compra_desde', this.filtros.fecha_compra_desde);
    }

    if (this.filtros.fecha_compra_hasta) {
      params.append('fecha_compra_hasta', this.filtros.fecha_compra_hasta);
    }

    // Recargar categorías con filtros
    const response = await fetch(
      `http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias?${params}`,
      { headers: { 'x-access-token': this.token } }
    );

    const data = await response.json();

    // Actualizar UI
    this.renderizarCategorias(data.data);
    this.actualizarResumen(data.resumen_global);
  }

  async expandirNodo(tipo, id) {
    // Aplicar los mismos filtros al expandir
    const params = new URLSearchParams();
    Object.keys(this.filtros).forEach(key => {
      if (this.filtros[key]) {
        params.append(key, this.filtros[key]);
      }
    });

    let url;
    if (tipo === 'categoria') {
      url = `http://localhost:3000/api/compras/reportes/valorizado-arbol/categorias/${id}/subcategorias?${params}`;
    } else if (tipo === 'subcategoria') {
      params.append('limit', '50');
      params.append('offset', '0');
      url = `http://localhost:3000/api/compras/reportes/valorizado-arbol/subcategorias/${id}/articulos?${params}`;
    }

    const response = await fetch(url, {
      headers: { 'x-access-token': this.token }
    });

    return await response.json();
  }
}

// Uso:
const arbol = new ArbolValorizadoComponent(token);

// Usuario aplica filtros
arbol.aplicarFiltros({ clasificacion_abc: 'A', solo_con_stock: true });

// Usuario expande una categoría
const subcategorias = await arbol.expandirNodo('categoria', '1');
```

---

## 📊 Beneficios para Frontend

### 1. Performance Mejorada

- **Lazy loading:** Solo carga datos cuando el usuario expande nodos
- **Paginación en artículos:** Evita cargar miles de registros de una vez
- **Transferencia reducida:** Solo se transfieren datos visibles

### 2. Experiencia de Usuario

- **Drill-down dinámico:** Navegación intuitiva tipo explorador de archivos
- **Filtros consistentes:** Mismos filtros en todos los niveles
- **Totales exactos:** No hay discrepancias entre niveles

### 3. Facilidad de Implementación

- **Reutilización de lógica:** Nivel 3 reutiliza endpoint existente
- **Estructura predecible:** Respuestas consistentes en todos los niveles
- **Errores claros:** Mensajes 400 descriptivos para validación

---

## 🔗 Endpoints Relacionados

- `GET /api/compras/reportes/valorizado-inventario` - Valorizado plano sin jerarquía
- `GET /api/compras/reportes/articulos-sin-costo` - Artículos pendientes de costeo
- `GET /api/inventario-grupo` - CRUD de categorías
- `GET /api/inventario-subgrupo` - CRUD de subcategorías

---

## 📝 Notas Técnicas

### Queries SQL

Los 3 endpoints usan queries optimizadas con:
- `LEFT JOIN` para existencias y costos
- `INNER JOIN` para relaciones categoría-subcategoría
- `GROUP BY` para agregaciones
- `WHERE` con filtros consistentes

### Cálculo de Porcentajes

**Nivel 1 (Categorías):**
```
porcentaje_sobre_total = (valor_total_categoria / valor_total_global) × 100
```

**Nivel 2 (Subcategorías):**
```
porcentaje_sobre_categoria = (valor_total_subcategoria / valor_total_categoria) × 100
porcentaje_sobre_total = (valor_total_subcategoria / valor_total_global) × 100
```

**Nivel 3 (Artículos):**
```
porcentaje_valor_total = (valor_total_articulo / valor_total_global) × 100
```

### Clasificación ABC con Filtros

Cuando se aplica `clasificacion_abc=A`:

1. Se calcula la clasificación ABC de **todos los artículos** (global)
2. Se filtran **solo los artículos Tipo A**
3. Se agrupan por categoría/subcategoría **solo los artículos Tipo A**
4. Los totales reflejan **únicamente artículos Tipo A**

**Resultado:** Las categorías muestran solo el valor de sus productos Tipo A, no el total de la categoría.

---

**Última actualización:** 2026-02-16
**Versión de la API:** 1.0
**Estado:** ✅ Implementado
