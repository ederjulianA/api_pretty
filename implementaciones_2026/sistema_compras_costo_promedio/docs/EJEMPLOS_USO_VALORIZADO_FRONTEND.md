# Guía de Uso Frontend: Valorizado de Inventario

**Fecha:** 2026-02-16
**Versión:** 1.0
**Audiencia:** Desarrolladores Frontend

---

## 📋 Tabla de Contenidos

1. [Introducción](#introducción)
2. [Obtener Valor Total Consolidado](#obtener-valor-total-consolidado)
3. [KPIs para Dashboard](#kpis-para-dashboard)
4. [Clasificación ABC (Pareto)](#clasificación-abc-pareto)
5. [Filtros y Casos de Uso Avanzados](#filtros-y-casos-de-uso-avanzados)
6. [Optimización de Performance](#optimización-de-performance)
7. [Ejemplos con Frameworks](#ejemplos-con-frameworks)
8. [Troubleshooting](#troubleshooting)

---

## Introducción

El endpoint `/api/compras/reportes/valorizado-inventario` proporciona **toda la información necesaria** para construir dashboards de control de costos e inventario.

### ¿Qué Obtengo del Endpoint?

```javascript
{
  resumen: {
    total_articulos: 245,              // Artículos con costo asignado
    articulos_sin_costo: 15,           // Artículos sin costo
    valor_total_inventario: 50000000,  // ← VALOR TOTAL CONSOLIDADO
    clasificacion_abc: {               // Análisis de Pareto (80-15-5)
      tipo_a: { articulos: 49, valor: 40000000, porcentaje: 80 },
      tipo_b: { articulos: 37, valor: 7500000, porcentaje: 15 },
      tipo_c: { articulos: 159, valor: 2500000, porcentaje: 5 }
    }
  },
  articulos: [ ... ],  // Array de artículos con detalle
  total_registros: 245,
  limit: 100,
  offset: 0
}
```

---

## Obtener Valor Total Consolidado

### Caso de Uso: "Tengo $50,000,000 en mercancía"

Este es el uso más común: obtener el **valor total del inventario**.

### Implementación Básica

```javascript
// Función para obtener el valor total del inventario
async function obtenerValorInventario(token) {
  try {
    const response = await fetch(
      'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
      {
        method: 'GET',
        headers: {
          'x-access-token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      const valorTotal = data.data.resumen.valor_total_inventario;
      const totalArticulos = data.data.resumen.total_articulos;

      console.log(`💰 Valor total del inventario: $${valorTotal.toLocaleString('es-CO')}`);
      console.log(`📦 Total de artículos: ${totalArticulos}`);

      return {
        valorTotal,
        totalArticulos,
        resumen: data.data.resumen
      };
    } else {
      throw new Error(data.message || 'Error desconocido');
    }

  } catch (error) {
    console.error('❌ Error obteniendo valor del inventario:', error);
    throw error;
  }
}

// Uso
const token = 'tu_jwt_token_aqui';
obtenerValorInventario(token)
  .then(resultado => {
    console.log('Resultado:', resultado);
  });
```

### ¿Por qué `limit=1`?

El parámetro `limit=1` minimiza el payload al traer solo 1 artículo en el array `articulos`, pero el **resumen SIEMPRE incluye datos de TODOS los artículos**:

- ✅ `valor_total_inventario` → Suma de TODOS los productos
- ✅ `total_articulos` → Cuenta TODOS los artículos
- ✅ `clasificacion_abc` → Calculada sobre TODOS los artículos

**Performance:**
- Sin `limit=1`: ~500KB (para 600 productos)
- Con `limit=1`: ~5KB (solo resumen + 1 producto)

---

## KPIs para Dashboard

### Implementación: Dashboard Completo

```javascript
async function cargarDashboardInventario(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
    {
      headers: { 'x-access-token': token }
    }
  );

  const { resumen } = (await response.json()).data;

  return {
    // 📊 KPIs Principales
    kpis: {
      valorTotalInventario: {
        valor: resumen.valor_total_inventario,
        label: 'Valor Total del Inventario',
        formato: `$${resumen.valor_total_inventario.toLocaleString('es-CO')}`,
        icono: '💰'
      },
      totalArticulos: {
        valor: resumen.total_articulos,
        label: 'Artículos con Costo',
        formato: resumen.total_articulos.toLocaleString('es-CO'),
        icono: '📦'
      },
      articulosSinCosto: {
        valor: resumen.articulos_sin_costo,
        label: 'Artículos Pendientes de Costeo',
        formato: resumen.articulos_sin_costo.toLocaleString('es-CO'),
        icono: '⚠️',
        alerta: resumen.articulos_sin_costo > 0
      }
    },

    // 📈 Clasificación ABC (Pareto)
    clasificacionABC: {
      tipoA: {
        label: 'Tipo A - Críticos',
        descripcion: 'Concentran el 80% del valor',
        cantidad: resumen.clasificacion_abc.tipo_a.articulos,
        valor: resumen.clasificacion_abc.tipo_a.valor,
        porcentaje: resumen.clasificacion_abc.tipo_a.porcentaje,
        color: '#FF6384',
        prioridad: 'Alta'
      },
      tipoB: {
        label: 'Tipo B - Importantes',
        descripcion: 'Concentran el 15% del valor',
        cantidad: resumen.clasificacion_abc.tipo_b.articulos,
        valor: resumen.clasificacion_abc.tipo_b.valor,
        porcentaje: resumen.clasificacion_abc.tipo_b.porcentaje,
        color: '#36A2EB',
        prioridad: 'Media'
      },
      tipoC: {
        label: 'Tipo C - Bajo Impacto',
        descripcion: 'Representan el 5% del valor',
        cantidad: resumen.clasificacion_abc.tipo_c.articulos,
        valor: resumen.clasificacion_abc.tipo_c.valor,
        porcentaje: resumen.clasificacion_abc.tipo_c.porcentaje,
        color: '#FFCE56',
        prioridad: 'Baja'
      }
    }
  };
}

// Uso en Dashboard
cargarDashboardInventario(token).then(dashboard => {
  // Renderizar KPIs
  document.getElementById('valor-total').textContent =
    dashboard.kpis.valorTotalInventario.formato;

  document.getElementById('total-articulos').textContent =
    dashboard.kpis.totalArticulos.formato;

  // Alerta si hay artículos sin costo
  if (dashboard.kpis.articulosSinCosto.alerta) {
    document.getElementById('alertas').innerHTML =
      `⚠️ ${dashboard.kpis.articulosSinCosto.valor} artículos sin costo asignado`;
  }

  // Renderizar clasificación ABC (ver siguiente sección)
  renderizarGraficoABC(dashboard.clasificacionABC);
});
```

### HTML de Ejemplo para Dashboard

```html
<div class="dashboard">
  <!-- KPIs Principales -->
  <div class="kpis">
    <div class="kpi-card">
      <span class="kpi-icon">💰</span>
      <h3>Valor Total Inventario</h3>
      <p id="valor-total" class="kpi-value">$0</p>
    </div>

    <div class="kpi-card">
      <span class="kpi-icon">📦</span>
      <h3>Artículos con Costo</h3>
      <p id="total-articulos" class="kpi-value">0</p>
    </div>

    <div class="kpi-card alerta">
      <span class="kpi-icon">⚠️</span>
      <h3>Pendientes de Costeo</h3>
      <p id="alertas" class="kpi-value">0</p>
    </div>
  </div>

  <!-- Gráfico ABC -->
  <div class="grafico-abc">
    <h3>Clasificación ABC (Pareto)</h3>
    <canvas id="chart-abc"></canvas>
  </div>
</div>
```

---

## Clasificación ABC (Pareto)

### ¿Qué es la Clasificación ABC?

La clasificación ABC (también conocida como Principio de Pareto) agrupa los productos en tres categorías según su valor:

- **Tipo A (80%):** 20% de los productos que representan el 80% del valor → **Alta prioridad**
- **Tipo B (15%):** 30% de los productos que representan el 15% del valor → **Media prioridad**
- **Tipo C (5%):** 50% de los productos que representan el 5% del valor → **Baja prioridad**

### Gráfico de Torta (Chart.js)

```javascript
// Requiere Chart.js: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

async function renderizarGraficoABC(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
    { headers: { 'x-access-token': token } }
  );

  const { clasificacion_abc } = (await response.json()).data.resumen;

  // Datos para Chart.js
  const chartData = {
    labels: [
      `Tipo A - Críticos (${clasificacion_abc.tipo_a.articulos} productos)`,
      `Tipo B - Importantes (${clasificacion_abc.tipo_b.articulos} productos)`,
      `Tipo C - Bajo Impacto (${clasificacion_abc.tipo_c.articulos} productos)`
    ],
    datasets: [{
      label: 'Distribución de Valor del Inventario',
      data: [
        clasificacion_abc.tipo_a.valor,
        clasificacion_abc.tipo_b.valor,
        clasificacion_abc.tipo_c.valor
      ],
      backgroundColor: [
        '#FF6384',  // Rojo - Tipo A
        '#36A2EB',  // Azul - Tipo B
        '#FFCE56'   // Amarillo - Tipo C
      ],
      hoverOffset: 4
    }]
  };

  // Configuración
  const config = {
    type: 'pie',
    data: chartData,
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
        title: {
          display: true,
          text: 'Clasificación ABC - Análisis de Pareto'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const valor = context.parsed;
              const porcentaje = context.dataset.data
                .reduce((a, b) => a + b, 0);
              const pct = ((valor / porcentaje) * 100).toFixed(1);
              return `Valor: $${valor.toLocaleString('es-CO')} (${pct}%)`;
            }
          }
        }
      }
    }
  };

  // Renderizar
  const ctx = document.getElementById('chart-abc').getContext('2d');
  new Chart(ctx, config);
}
```

### Gráfico de Barras (Chart.js)

```javascript
async function renderizarBarrasABC(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
    { headers: { 'x-access-token': token } }
  );

  const { clasificacion_abc } = (await response.json()).data.resumen;

  const config = {
    type: 'bar',
    data: {
      labels: ['Tipo A', 'Tipo B', 'Tipo C'],
      datasets: [
        {
          label: 'Cantidad de Productos',
          data: [
            clasificacion_abc.tipo_a.articulos,
            clasificacion_abc.tipo_b.articulos,
            clasificacion_abc.tipo_c.articulos
          ],
          backgroundColor: '#36A2EB',
          yAxisID: 'y'
        },
        {
          label: 'Valor del Inventario',
          data: [
            clasificacion_abc.tipo_a.valor,
            clasificacion_abc.tipo_b.valor,
            clasificacion_abc.tipo_c.valor
          ],
          backgroundColor: '#FF6384',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Cantidad de Productos'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Valor del Inventario ($)'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  };

  const ctx = document.getElementById('chart-abc-barras').getContext('2d');
  new Chart(ctx, config);
}
```

---

## Filtros y Casos de Uso Avanzados

### 1. Valor por Subcategoría

```javascript
async function obtenerValorPorCategoria(token, codigoCategoria) {
  const response = await fetch(
    `http://localhost:3000/api/compras/reportes/valorizado-inventario?inv_sub_gru_cod=${codigoCategoria}&limit=1`,
    { headers: { 'x-access-token': token } }
  );

  const { resumen } = (await response.json()).data;

  return {
    categoria: codigoCategoria,
    valorTotal: resumen.valor_total_inventario,
    totalArticulos: resumen.total_articulos
  };
}

// Ejemplo: Comparar valor entre categorías
async function compararCategorias(token) {
  const categorias = [
    { codigo: 5, nombre: 'Labiales' },
    { codigo: 8, nombre: 'Cremas' },
    { codigo: 12, nombre: 'Perfumes' }
  ];

  const resultados = await Promise.all(
    categorias.map(async cat => {
      const resultado = await obtenerValorPorCategoria(token, cat.codigo);
      return {
        ...cat,
        ...resultado
      };
    })
  );

  // Ordenar por valor descendente
  resultados.sort((a, b) => b.valorTotal - a.valorTotal);

  console.log('Valor por categoría:');
  resultados.forEach(cat => {
    console.log(`${cat.nombre}: $${cat.valorTotal.toLocaleString('es-CO')} (${cat.totalArticulos} productos)`);
  });

  return resultados;
}
```

### 2. Comparación Temporal (Crecimiento del Inventario)

```javascript
async function calcularCrecimientoInventario(token) {
  // Valor actual (todos los artículos)
  const actualResponse = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
    { headers: { 'x-access-token': token } }
  );
  const valorActual = (await actualResponse.json()).data.resumen.valor_total_inventario;

  // Valor hace 30 días (solo productos comprados antes de esa fecha)
  const hace30Dias = new Date();
  hace30Dias.setDate(hace30Dias.getDate() - 30);
  const fechaLimite = hace30Dias.toISOString().split('T')[0];

  const anteriorResponse = await fetch(
    `http://localhost:3000/api/compras/reportes/valorizado-inventario?fecha_compra_hasta=${fechaLimite}&limit=1`,
    { headers: { 'x-access-token': token } }
  );
  const valorAnterior = (await anteriorResponse.json()).data.resumen.valor_total_inventario;

  // Calcular crecimiento
  const crecimientoAbsoluto = valorActual - valorAnterior;
  const crecimientoPorcentual = ((crecimientoAbsoluto / valorAnterior) * 100).toFixed(2);

  return {
    valorActual,
    valorAnterior,
    crecimientoAbsoluto,
    crecimientoPorcentual,
    mensaje: `El inventario creció ${crecimientoPorcentual}% en los últimos 30 días (+$${crecimientoAbsoluto.toLocaleString('es-CO')})`
  };
}

// Uso
calcularCrecimientoInventario(token).then(resultado => {
  console.log(resultado.mensaje);
  // Output: "El inventario creció 12.5% en los últimos 30 días (+$5,500,000)"
});
```

### 3. Listado de Productos con Alto Valor (Tipo A)

```javascript
async function obtenerProductosCriticos(token) {
  // Traer productos con paginación
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=100',
    { headers: { 'x-access-token': token } }
  );

  const { articulos } = (await response.json()).data;

  // Filtrar solo productos Tipo A
  const productosCriticos = articulos.filter(art => art.clasificacion_abc === 'A');

  console.log(`📌 Productos Críticos (Tipo A): ${productosCriticos.length}`);
  console.log('Top 5:');

  productosCriticos.slice(0, 5).forEach((producto, index) => {
    console.log(`${index + 1}. ${producto.art_nom}`);
    console.log(`   SKU: ${producto.art_cod}`);
    console.log(`   Existencia: ${producto.existencia} unidades`);
    console.log(`   Valor: $${producto.valor_total.toLocaleString('es-CO')}`);
    console.log(`   % del total: ${producto.porcentaje_valor_total}%`);
    console.log('---');
  });

  return productosCriticos;
}
```

### 4. Detección de Inventario Muerto

```javascript
async function detectarInventarioMuerto(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1000',
    { headers: { 'x-access-token': token } }
  );

  const { articulos } = (await response.json()).data;

  // Filtrar productos que requieren reorden (más de 90 días sin venta)
  const inventarioMuerto = articulos.filter(art => art.requiere_reorden);

  // Calcular valor total del inventario muerto
  const valorInmovilizado = inventarioMuerto.reduce(
    (sum, art) => sum + art.valor_total,
    0
  );

  console.log(`⚠️ Inventario Muerto Detectado:`);
  console.log(`Productos: ${inventarioMuerto.length}`);
  console.log(`Valor inmovilizado: $${valorInmovilizado.toLocaleString('es-CO')}`);

  // Listar los 10 más costosos
  inventarioMuerto
    .sort((a, b) => b.valor_total - a.valor_total)
    .slice(0, 10)
    .forEach((producto, index) => {
      console.log(`${index + 1}. ${producto.art_nom}`);
      console.log(`   Días sin venta: ${producto.dias_sin_venta}`);
      console.log(`   Valor: $${producto.valor_total.toLocaleString('es-CO')}`);
    });

  return {
    total: inventarioMuerto.length,
    valorInmovilizado,
    productos: inventarioMuerto
  };
}
```

---

## Optimización de Performance

### Estrategia: Carga Progresiva

```javascript
class InventarioService {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.cache = new Map();
  }

  // Obtener solo el resumen (más rápido)
  async obtenerResumen() {
    const cacheKey = 'resumen';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await fetch(
      `${this.baseUrl}/api/compras/reportes/valorizado-inventario?limit=1`,
      { headers: { 'x-access-token': this.token } }
    );

    const data = await response.json();
    const resumen = data.data.resumen;

    // Cachear por 5 minutos
    this.cache.set(cacheKey, resumen);
    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

    return resumen;
  }

  // Obtener productos con paginación
  async obtenerProductosPaginados(pagina = 0, porPagina = 50) {
    const offset = pagina * porPagina;
    const response = await fetch(
      `${this.baseUrl}/api/compras/reportes/valorizado-inventario?limit=${porPagina}&offset=${offset}`,
      { headers: { 'x-access-token': this.token } }
    );

    const data = await response.json();
    return {
      articulos: data.data.articulos,
      totalRegistros: data.data.total_registros,
      hayMasPaginas: offset + porPagina < data.data.total_registros
    };
  }

  // Cargar todos los productos progresivamente
  async* obtenerTodosLosProductos(porPagina = 100) {
    let pagina = 0;
    let hayMas = true;

    while (hayMas) {
      const resultado = await this.obtenerProductosPaginados(pagina, porPagina);
      yield resultado.articulos;

      hayMas = resultado.hayMasPaginas;
      pagina++;
    }
  }
}

// Uso
const service = new InventarioService('http://localhost:3000', token);

// 1. Cargar resumen primero (rápido)
const resumen = await service.obtenerResumen();
renderizarKPIs(resumen);

// 2. Cargar productos progresivamente (si es necesario)
for await (const articulos of service.obtenerTodosLosProductos()) {
  renderizarProductos(articulos);  // Renderizar cada lote
}
```

---

## Ejemplos con Frameworks

### React + Hooks

```jsx
import { useState, useEffect } from 'react';

function DashboardInventario() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
          { headers: { 'x-access-token': token } }
        );

        const data = await response.json();

        if (data.success) {
          setResumen(data.data.resumen);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, []);

  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="dashboard">
      <h1>Dashboard de Inventario</h1>

      <div className="kpis">
        <div className="kpi-card">
          <h3>Valor Total</h3>
          <p>${resumen.valor_total_inventario.toLocaleString('es-CO')}</p>
        </div>

        <div className="kpi-card">
          <h3>Total Artículos</h3>
          <p>{resumen.total_articulos}</p>
        </div>

        {resumen.articulos_sin_costo > 0 && (
          <div className="kpi-card alerta">
            <h3>⚠️ Sin Costo</h3>
            <p>{resumen.articulos_sin_costo} artículos</p>
          </div>
        )}
      </div>

      <div className="clasificacion-abc">
        <h3>Clasificación ABC</h3>
        <div className="abc-grid">
          <div className="abc-card tipo-a">
            <h4>Tipo A - Críticos</h4>
            <p>{resumen.clasificacion_abc.tipo_a.articulos} productos</p>
            <p>${resumen.clasificacion_abc.tipo_a.valor.toLocaleString('es-CO')}</p>
            <p>{resumen.clasificacion_abc.tipo_a.porcentaje}% del valor</p>
          </div>

          <div className="abc-card tipo-b">
            <h4>Tipo B - Importantes</h4>
            <p>{resumen.clasificacion_abc.tipo_b.articulos} productos</p>
            <p>${resumen.clasificacion_abc.tipo_b.valor.toLocaleString('es-CO')}</p>
            <p>{resumen.clasificacion_abc.tipo_b.porcentaje}% del valor</p>
          </div>

          <div className="abc-card tipo-c">
            <h4>Tipo C - Bajo Impacto</h4>
            <p>{resumen.clasificacion_abc.tipo_c.articulos} productos</p>
            <p>${resumen.clasificacion_abc.tipo_c.valor.toLocaleString('es-CO')}</p>
            <p>{resumen.clasificacion_abc.tipo_c.porcentaje}% del valor</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardInventario;
```

### Vue 3 (Composition API)

```vue
<template>
  <div class="dashboard">
    <h1>Dashboard de Inventario</h1>

    <div v-if="loading">Cargando...</div>
    <div v-else-if="error">Error: {{ error }}</div>

    <div v-else class="kpis">
      <div class="kpi-card">
        <h3>Valor Total</h3>
        <p>{{ formatCurrency(resumen.valor_total_inventario) }}</p>
      </div>

      <div class="kpi-card">
        <h3>Total Artículos</h3>
        <p>{{ resumen.total_articulos }}</p>
      </div>

      <div v-if="resumen.articulos_sin_costo > 0" class="kpi-card alerta">
        <h3>⚠️ Sin Costo</h3>
        <p>{{ resumen.articulos_sin_costo }} artículos</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const resumen = ref(null);
const loading = ref(true);
const error = ref(null);

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value);
};

onMounted(async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(
      'http://localhost:3000/api/compras/reportes/valorizado-inventario?limit=1',
      { headers: { 'x-access-token': token } }
    );

    const data = await response.json();

    if (data.success) {
      resumen.value = data.data.resumen;
    } else {
      error.value = data.message;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>
```

---

## Troubleshooting

### Error: "Invalid column name 'pre_cos'"

**Causa:** Versión antigua del backend.

**Solución:** El campo correcto es `art_bod_cos_cat`. Asegúrate de tener la última versión del backend (2026-02-16 o posterior).

### Error: "Invalid column name 'art_est'"

**Causa:** La tabla `articulos` no tiene campo de estado.

**Solución:** Actualiza el backend. El parámetro `solo_activos` fue eliminado.

### Error 401: Unauthorized

**Causa:** Token JWT inválido o expirado.

**Solución:**
```javascript
// Verificar que el token se envíe correctamente
headers: {
  'x-access-token': token  // ← Nombre correcto del header
}
```

### Valores en $0

**Causa:** Los artículos no tienen `art_bod_cos_cat` asignado.

**Solución:**
1. Ejecutar Fase 0: Carga inicial de costos
2. Verificar con: `GET /api/carga-costos/resumen`

### Performance Lenta

**Problema:** El endpoint tarda mucho con 600+ productos.

**Solución:**
```javascript
// Usar limit=1 para solo obtener el resumen
fetch('/api/compras/reportes/valorizado-inventario?limit=1')

// O paginar si necesitas los productos
fetch('/api/compras/reportes/valorizado-inventario?limit=100&offset=0')
```

---

## Resumen de Mejores Prácticas

✅ **Usar `limit=1` para obtener solo el resumen** (más rápido)
✅ **Cachear el resumen por 5-10 minutos** (evitar llamadas innecesarias)
✅ **Usar paginación si necesitas listar productos** (`limit` + `offset`)
✅ **Formatear valores monetarios** con `toLocaleString('es-CO')`
✅ **Manejar errores y estados de carga** (UX)
✅ **Validar token JWT** antes de hacer llamadas

❌ **NO traer todos los productos sin paginación** (carga lenta)
❌ **NO calcular el total en el frontend** (ya viene calculado)
❌ **NO hacer polling constante** (usar caché o websockets)

---

**Última actualización:** 2026-02-16
**Versión:** 1.0
**Documentación de API:** [API_ENDPOINT_VALORIZADO_INVENTARIO.md](API_ENDPOINT_VALORIZADO_INVENTARIO.md)
