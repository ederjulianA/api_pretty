# Prueba de Concepto (PoC) - Generador de Catálogo PDF Optimizado

**Proyecto:** Generador de Catálogo PDF - Prueba de Concepto  
**Versión:** PoC v1.0  
**Fecha:** Enero 2025  
**Objetivo:** Validar la viabilidad técnica de generación de PDF con calidad profesional de impresión y peso optimizado

---

## 1. Resumen Ejecutivo

### 1.1 Propósito de la PoC

Demostrar la capacidad técnica para generar un catálogo PDF de productos con:
- **Calidad profesional de impresión** (apto para imprenta)
- **Peso optimizado** (< 25 MB para 600 productos)
- **Balance calidad/tamaño** óptimo para distribución digital

Esta PoC se enfoca **exclusivamente** en la generación del PDF, dejando fuera integraciones complejas, sistemas de caché y funcionalidades avanzadas del MVP completo.

### 1.2 Alcance de la PoC

**SÍ incluye:**
- ✅ Generación de PDF con Puppeteer desde HTML/CSS
- ✅ Optimización de imágenes con Sharp
- ✅ Diseño visual profesional (portada, productos, secciones)
- ✅ Layout 3x3 productos por página
- ✅ Configuración de impresión de alta calidad
- ✅ Script ejecutable manualmente
- ✅ Medición de métricas (tiempo, peso, calidad)
- ✅ Consulta de productos desde base de datos SQL Server (productos reales)
- ✅ Obtención de categorías desde inventario_grupo e inventario_subgrupo

**NO incluye:**
- ❌ Sistema de caché inteligente
- ❌ API REST endpoints
- ❌ Interfaz de usuario/dashboard
- ❌ Sistema de versionado
- ❌ Distribución automática (WhatsApp, QR, etc.)
- ❌ Configuración parametrizable
- ❌ Autenticación/seguridad

### 1.3 Criterios de Éxito

La PoC será considerada exitosa si cumple:

| Criterio | Objetivo | Medible |
|----------|----------|---------|
| **Calidad de impresión** | Texto legible a 8pt, imágenes nítidas en A4 | ✅ Impresión física |
| **Peso del PDF** | < 25 MB para 600 productos | ✅ Tamaño archivo |
| **Peso por imagen** | 40-80 KB por imagen optimizada | ✅ Medición Sharp |
| **Tiempo de generación** | < 6 minutos para 600 productos | ✅ Cronómetro |
| **Calidad visual** | Diseño profesional según manual de marca | ✅ Revisión visual |
| **Reproducibilidad** | Generación consistente en múltiples ejecuciones | ✅ 3 ejecuciones |

### 1.4 Entregables

1. **Script de generación funcional** (`generate-catalog.js`)
2. **Módulo de consulta a base de datos** (`lib/dbCatalog.js`)
3. **Templates HTML/CSS** (portada, productos, secciones)
4. **PDF generado** como demostración
5. **Reporte de resultados** con métricas obtenidas
6. **Documentación técnica** de implementación

---

## 2. Arquitectura Simplificada de la PoC

### 2.1 Flujo de Ejecución

```
[Inicio] 
   ↓
1. Conectar a SQL Server
   ↓
2. Consultar productos desde dbo.articulos (con paginación)
   ↓
3. Consultar categorías desde dbo.inventario_grupo
   ↓
4. Descargar imágenes desde art_url_img_servi o producto_fotos
   ↓
5. Optimizar imágenes con Sharp (300x300px, JPEG 85%)
   ↓
6. Preparar datos para template
   ↓
7. Renderizar HTML con EJS
   ↓
8. Generar PDF con Puppeteer
   ↓
9. Medir métricas (tiempo, peso)
   ↓
[Fin - PDF generado en /output]
```

### 2.2 Estructura de Archivos

```
poc-catalogo-pdf/
├── package.json
├── generate-catalog.js           # Script principal
├── lib/
│   ├── dbCatalog.js              # Consulta productos desde BD
│   ├── imageOptimizer.js         # Optimización de imágenes
│   └── pdfGenerator.js           # Generación PDF
├── templates/
│   ├── catalog.ejs               # Template principal
│   └── styles/
│       ├── variables.css         # Variables de diseño
│       ├── main.css              # Estilos principales
│       └── print.css             # Estilos de impresión
├── assets/
│   ├── logo.png                  # Logo de la empresa
│   └── fonts/                    # Fuentes
├── cache/
│   └── images/                   # Imágenes optimizadas
├── output/
│   └── catalogo-poc.pdf          # PDF generado
└── README.md                     # Instrucciones de uso
```

---

## 3. Especificaciones Técnicas

### 3.1 Tecnologías y Versiones

```json
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "sharp": "^0.33.0",
    "ejs": "^3.1.9",
    "axios": "^1.6.0",
    "mssql": "^10.0.0",
    "dotenv": "^16.3.1"
  }
}
```

**Requisitos del sistema:**
- Node.js 18.x o superior
- Windows Server o Windows 10/11
- Mínimo 4 GB RAM disponible
- 2 GB espacio en disco
- Acceso a base de datos SQL Server (configuración en .env)
- Conexión a internet (para descargar imágenes desde URLs)

---

## 4. Consulta de Datos desde Base de Datos

### 4.1 Estructura de Consultas SQL

**Archivo:** `lib/dbCatalog.js`

Este módulo se conecta a SQL Server y obtiene los datos necesarios para el catálogo:

#### 4.1.1 Consulta de Productos

Utiliza la función existente `getArticulos` del modelo `articulosModel`, que retorna:

```javascript
{
  art_sec,                    // ID del artículo
  art_cod,                    // SKU/Código
  art_nom,                    // Nombre del producto
  art_url_img_servi,          // URL de imagen principal
  inv_gru_cod,                // Código de categoría
  categoria,                  // Nombre de categoría (inv_gru_nom)
  inv_sub_gru_cod,            // Código de subcategoría
  sub_categoria,              // Nombre de subcategoría (inv_sub_gru_nom)
  precio_detal,               // Precio detal (con ofertas aplicadas)
  precio_mayor,               // Precio mayor (con ofertas aplicadas)
  precio_detal_original,      // Precio detal sin ofertas
  precio_mayor_original,      // Precio mayor sin ofertas
  tiene_oferta,               // 'S' o 'N'
  existencia,                 // Stock disponible
  art_woo_id                  // ID en WooCommerce
}
```

**Consulta con paginación:**
- Se consultan productos en lotes para manejar grandes volúmenes
- Por defecto se obtienen todos los productos activos
- Se puede filtrar por categoría, subcategoría, existencia, etc.

#### 4.1.2 Consulta de Categorías

```sql
SELECT 
  inv_gru_cod AS id,
  inv_gru_nom AS nombre,
  inv_gru_cod AS orden
FROM dbo.inventario_grupo
ORDER BY inv_gru_cod
```

#### 4.1.3 Consulta de Imágenes

Las imágenes pueden venir de dos fuentes:
1. **Campo `art_url_img_servi`** en la tabla `articulos` (imagen principal)
2. **Tabla `producto_fotos`** (galería de imágenes, usar la principal con `es_principal = 1`)

**Prioridad:**
- Si existe foto principal en `producto_fotos`, usar esa
- Si no, usar `art_url_img_servi`
- Si ninguna existe, usar placeholder

### 4.2 Estructura de Datos Transformada

El módulo `dbCatalog.js` transforma los datos de la BD al formato esperado por el template:

```javascript
{
  metadata: {
    titulo: "Catálogo de Productos - PoC",
    fecha: "Enero 2025",
    totalProductos: 600,
    empresa: {
      nombre: "Tu Empresa",
      logo: "./assets/logo.png"
    }
  },
  categorias: [
    {
      id: "1",
      nombre: "Labios",
      orden: 1
    }
  ],
  productos: [
    {
      id: "100",
      sku: "MAQ001",
      nombre: "Labial Mate Ruby Red",
      categoria: "Labios",
      subcategoria: "Labiales Mate",
      categoriaId: "1",
      precioDetalle: 25000,
      precioMayor: 18000,
      imagenUrl: "https://...",
      stock: 50,
      esNuevo: false,  // Se puede determinar por fecha de creación
      tieneOferta: "S"
    }
  ],
  secciones: {
    // Configuración manual o desde parámetros
    mediosPago: [...],
    condicionesVenta: [...],
    contacto: {...}
  }
}
```

### 4.3 Configuración de Secciones Informativas

Las secciones de medios de pago, condiciones de venta y contacto pueden configurarse de dos formas:

**Opción 1: Archivo de configuración** (`config/catalog-config.json`)
```json
{
  "secciones": {
    "mediosPago": [...],
    "condicionesVenta": [...],
    "contacto": {...}
  }
}
```

**Opción 2: Parámetros en el script**
```javascript
const secciones = {
  mediosPago: [...],
  condicionesVenta: [...],
  contacto: {...}
};
```

### 4.4 Manejo de Productos sin Imagen

Para productos sin imagen:
- Intentar obtener desde `producto_fotos` (foto principal)
- Si no existe, usar `art_url_img_servi`
- Si tampoco existe, usar placeholder: `./assets/placeholder.jpg`

### 4.5 Implementación del Módulo `lib/dbCatalog.js`

**Archivo:** `lib/dbCatalog.js`

```javascript
require('dotenv').config();
const { sql, poolPromise } = require('../db');
const articulosModel = require('../models/articulosModel');
const { getAllCategories } = require('../models/inventarioGrupoModel');
const ProductPhoto = require('../models/ProductPhoto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Obtiene la URL de imagen principal de un producto
 */
async function obtenerImagenProducto(art_sec, art_url_img_servi) {
  try {
    // 1. Intentar obtener desde producto_fotos (foto principal)
    const pool = await poolPromise;
    const fotoQuery = `
      SELECT TOP 1 url 
      FROM dbo.producto_fotos 
      WHERE art_sec = @art_sec AND es_principal = 1
      ORDER BY posicion ASC
    `;
    const fotoResult = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec.toString())
      .query(fotoQuery);
    
    if (fotoResult.recordset.length > 0) {
      return fotoResult.recordset[0].url;
    }
    
    // 2. Si no hay foto principal, usar art_url_img_servi
    if (art_url_img_servi) {
      return art_url_img_servi;
    }
    
    // 3. Si tampoco existe, retornar null (se usará placeholder)
    return null;
  } catch (error) {
    console.warn(`Error obteniendo imagen para art_sec ${art_sec}:`, error.message);
    return art_url_img_servi || null;
  }
}

/**
 * Transforma un producto de la BD al formato del template
 */
function transformarProducto(producto) {
  return {
    id: producto.art_sec.toString(),
    sku: producto.art_cod,
    nombre: producto.art_nom,
    categoria: producto.categoria,
    subcategoria: producto.sub_categoria,
    categoriaId: producto.inv_gru_cod,
    precioDetalle: parseFloat(producto.precio_detal) || 0,
    precioMayor: parseFloat(producto.precio_mayor) || 0,
    stock: parseFloat(producto.existencia) || 0,
    esNuevo: false, // Se puede determinar por fecha si está disponible
    tieneOferta: producto.tiene_oferta === 'S',
    imagenUrl: null // Se llenará después
  };
}

/**
 * Obtiene todos los datos necesarios para el catálogo
 */
async function obtenerDatosCatalogo(opciones = {}) {
  const {
    inv_gru_cod = null,
    inv_sub_gru_cod = null,
    tieneExistencia = null,
    limite = null
  } = opciones;
  
  try {
    // 1. Obtener categorías
    console.log('   Consultando categorías...');
    const categoriasResult = await getAllCategories();
    const categorias = categoriasResult.data.map((cat, index) => ({
      id: cat.inv_gru_cod,
      nombre: cat.inv_gru_nom,
      orden: index + 1
    }));
    
    // 2. Obtener productos con paginación
    console.log('   Consultando productos...');
    const productos = [];
    let pageNumber = 1;
    const pageSize = 100; // Consultar en lotes de 100
    
    while (true) {
      const productosLote = await articulosModel.getArticulos({
        codigo: null,
        nombre: null,
        inv_gru_cod,
        inv_sub_gru_cod,
        tieneExistencia,
        PageNumber: pageNumber,
        PageSize: pageSize
      });
      
      if (productosLote.length === 0) break;
      
      // Obtener imágenes para cada producto
      for (const producto of productosLote) {
        const imagenUrl = await obtenerImagenProducto(
          producto.art_sec,
          producto.art_url_img_servi
        );
        
        const productoTransformado = transformarProducto(producto);
        productoTransformado.imagenUrl = imagenUrl;
        productos.push(productoTransformado);
        
        // Aplicar límite si se especificó
        if (limite && productos.length >= limite) {
          break;
        }
      }
      
      if (limite && productos.length >= limite) break;
      if (productosLote.length < pageSize) break;
      
      pageNumber++;
    }
    
    // 3. Cargar configuración de secciones
    let secciones;
    try {
      const configPath = path.join(__dirname, '../config/catalog-config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      secciones = config.secciones;
    } catch (error) {
      // Si no existe el archivo, usar valores por defecto
      console.warn('   No se encontró catalog-config.json, usando valores por defecto');
      secciones = {
        mediosPago: [],
        condicionesVenta: [],
        contacto: {}
      };
    }
    
    // 4. Preparar metadata
    const metadata = {
      titulo: "Catálogo de Productos",
      fecha: new Date().toLocaleDateString('es-CO', { 
        year: 'numeric', 
        month: 'long' 
      }),
      totalProductos: productos.length,
      empresa: {
        nombre: "Tu Empresa",
        logo: path.join(__dirname, '../assets/logo.png')
      }
    };
    
    return {
      metadata,
      categorias,
      productos,
      secciones
    };
    
  } catch (error) {
    console.error('Error obteniendo datos del catálogo:', error);
    throw error;
  }
}

module.exports = {
  obtenerDatosCatalogo,
  obtenerImagenProducto,
  transformarProducto
};
```

**Nota:** Este módulo reutiliza los modelos existentes (`articulosModel`, `inventarioGrupoModel`) para mantener consistencia con el resto de la aplicación.

---

## 5. Optimización de Imágenes

### 5.1 Especificaciones Sharp

**Archivo:** `lib/imageOptimizer.js`

**Configuración de optimización:**

```javascript
{
  width: 300,              // Ancho fijo
  height: 300,             // Alto fijo
  fit: 'cover',            // Recortar manteniendo proporciones
  position: 'center',      // Centrar el recorte
  format: 'jpeg',          // Formato JPEG
  quality: 85,             // 85% calidad
  progressive: true,       // JPEG progresivo
  mozjpeg: true,           // Usar mozjpeg para mejor compresión
  withMetadata: false      // Eliminar metadata EXIF
}
```

**Resultado esperado:**
- Imagen original: 1-3 MB (variable)
- Imagen optimizada: 40-80 KB (objetivo)
- Reducción: ~95% en peso
- Calidad visual: Indistinguible del original en tamaño impreso

### 5.2 Proceso de Optimización

```javascript
// Pseudocódigo del proceso

async function optimizarImagen(urlImagen, sku) {
  // 1. Descargar imagen desde URL
  const response = await axios.get(urlImagen, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  
  // 2. Guardar original (para comparación)
  await fs.writeFile(`./cache/images/original/${sku}.jpg`, buffer);
  
  // 3. Optimizar con Sharp
  const optimized = await sharp(buffer)
    .resize(300, 300, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({
      quality: 85,
      progressive: true,
      mozjpeg: true
    })
    .toBuffer();
  
  // 4. Guardar optimizada
  await fs.writeFile(`./cache/images/optimized/${sku}.jpg`, optimized);
  
  // 5. Calcular métricas
  const pesoOriginal = buffer.length / 1024; // KB
  const pesoOptimizado = optimized.length / 1024; // KB
  const reduccion = ((pesoOriginal - pesoOptimizado) / pesoOriginal) * 100;
  
  return {
    sku,
    pesoOriginalKB: pesoOriginal.toFixed(2),
    pesoOptimizadoKB: pesoOptimizado.toFixed(2),
    reduccionPorcentaje: reduccion.toFixed(2),
    rutaOptimizada: `./cache/images/optimized/${sku}.jpg`
  };
}
```

### 5.3 Descarga Paralela

Para optimizar tiempo, descargar múltiples imágenes simultáneamente:

```javascript
// Procesar en chunks de 20 imágenes
const CHUNK_SIZE = 20;

async function optimizarTodasLasImagenes(productos) {
  const resultados = [];
  
  for (let i = 0; i < productos.length; i += CHUNK_SIZE) {
    const chunk = productos.slice(i, i + CHUNK_SIZE);
    const promesas = chunk.map(p => optimizarImagen(p.imagenUrl, p.sku));
    const resultadosChunk = await Promise.all(promesas);
    resultados.push(...resultadosChunk);
    
    console.log(`Progreso: ${i + chunk.length}/${productos.length} imágenes`);
  }
  
  return resultados;
}
```

### 5.4 Manejo de Errores

**Imágenes faltantes o errores de descarga:**

```javascript
async function optimizarImagenSafe(urlImagen, sku) {
  try {
    return await optimizarImagen(urlImagen, sku);
  } catch (error) {
    console.warn(`Error con imagen ${sku}:`, error.message);
    
    // Usar imagen placeholder
    return {
      sku,
      error: error.message,
      rutaOptimizada: './assets/placeholder.jpg'
    };
  }
}
```

---

## 6. Generación del PDF

### 6.1 Configuración de Puppeteer

**Archivo:** `lib/pdfGenerator.js`

**Configuración de lanzamiento:**

```javascript
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ]
});
```

**Configuración del PDF:**

```javascript
const pdfConfig = {
  path: './output/catalogo-poc.pdf',
  format: 'A4',
  printBackground: true,        // CRÍTICO: conservar colores
  preferCSSPageSize: false,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="width:100%; text-align:center; font-size:9pt; color:#757575; padding:10px 0;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>
  `,
  margin: {
    top: '15mm',
    right: '15mm',
    bottom: '20mm',
    left: '15mm'
  }
};
```

### 6.2 Proceso de Generación

```javascript
async function generarPDF(datos) {
  const inicio = Date.now();
  
  // 1. Renderizar HTML con EJS
  const html = await ejs.renderFile('./templates/catalog.ejs', datos);
  
  // 2. Lanzar Puppeteer
  const browser = await puppeteer.launch(browserConfig);
  const page = await browser.newPage();
  
  // 3. Cargar HTML
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // 4. Generar PDF
  await page.pdf(pdfConfig);
  
  // 5. Cerrar browser
  await browser.close();
  
  const tiempoTotal = (Date.now() - inicio) / 1000;
  
  // 6. Obtener tamaño del archivo
  const stats = await fs.stat('./output/catalogo-poc.pdf');
  const tamanoMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  return {
    ruta: './output/catalogo-poc.pdf',
    tamanoMB: parseFloat(tamanoMB),
    tiempoSegundos: tiempoTotal.toFixed(2),
    totalPaginas: Math.ceil(datos.productos.length / 9) + 3 // +portada +secciones
  };
}
```

---

## 7. Diseño Visual - Templates

### 7.1 Variables CSS (`templates/styles/variables.css`)

```css
:root {
  /* Colores - AJUSTAR SEGÚN MANUAL DE MARCA */
  --color-primary: #E91E63;
  --color-secondary: #9C27B0;
  --color-accent: #FF4081;
  --color-dark: #212121;
  --color-text: #424242;
  --color-text-light: #757575;
  --color-background: #FAFAFA;
  --color-white: #FFFFFF;
  
  /* Tipografía */
  --font-primary: 'Montserrat', sans-serif;
  --font-secondary: 'Open Sans', sans-serif;
  
  /* Tamaños de fuente para impresión */
  --font-size-base: 10pt;
  --font-size-small: 8pt;
  --font-size-medium: 12pt;
  --font-size-large: 14pt;
  --font-size-xlarge: 24pt;
  --font-size-xxlarge: 32pt;
  
  /* Espaciado */
  --spacing-xs: 4mm;
  --spacing-sm: 8mm;
  --spacing-md: 12mm;
  --spacing-lg: 20mm;
  
  /* Bordes */
  --border-radius: 4mm;
  --border-color: #E0E0E0;
  
  /* Sombras */
  --box-shadow: 0 2mm 8mm rgba(0,0,0,0.1);
}
```

### 7.2 Template Principal (`templates/catalog.ejs`)

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title><%= metadata.titulo %></title>
  
  <!-- Fuentes -->
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
  
  <!-- Estilos -->
  <link rel="stylesheet" href="file:///<%= __dirname %>/templates/styles/variables.css">
  <link rel="stylesheet" href="file:///<%= __dirname %>/templates/styles/main.css">
  <link rel="stylesheet" href="file:///<%= __dirname %>/templates/styles/print.css">
  
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <!-- PORTADA -->
  <div class="portada">
    <div class="portada-background"></div>
    <div class="portada-content">
      <img src="file:///<%= metadata.empresa.logo %>" alt="Logo" class="portada-logo">
      <h1 class="portada-titulo"><%= metadata.titulo %></h1>
      <div class="portada-fecha"><%= metadata.fecha %></div>
      <div class="portada-stats">
        <div class="stat">
          <div class="stat-numero"><%= metadata.totalProductos %></div>
          <div class="stat-label">Productos</div>
        </div>
        <div class="stat">
          <div class="stat-numero"><%= categorias.length %></div>
          <div class="stat-label">Categorías</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PRODUCTOS POR CATEGORÍA -->
  <% categorias.forEach(categoria => { 
    const productosCategoria = productos.filter(p => p.categoriaId === categoria.id);
  %>
    <div class="page-break"></div>
    <div class="categoria-seccion">
      <h2 class="categoria-titulo"><%= categoria.nombre %></h2>
      
      <div class="productos-grid">
        <% productosCategoria.forEach(producto => { %>
          <div class="producto-card <%= producto.stock <= 0 ? 'agotado' : '' %>">
            <!-- Imagen -->
            <div class="producto-imagen-container">
              <img src="file:///<%= producto.imagenOptimizada %>" 
                   alt="<%= producto.nombre %>" 
                   class="producto-imagen">
              <% if (producto.esNuevo) { %>
                <span class="badge-nuevo">NUEVO</span>
              <% } %>
              <% if (producto.stock <= 0) { %>
                <div class="overlay-agotado">AGOTADO</div>
              <% } %>
            </div>
            
            <!-- Info -->
            <div class="producto-info">
              <div class="producto-categoria">
                <%= producto.categoria %>
                <% if (producto.subcategoria) { %> › <%= producto.subcategoria %> <% } %>
              </div>
              <h3 class="producto-nombre"><%= producto.nombre %></h3>
              <div class="producto-sku">SKU: <%= producto.sku %></div>
              
              <!-- Precios -->
              <div class="producto-precios">
                <div class="precio precio-detal">
                  <div class="precio-label">Precio Detal</div>
                  <div class="precio-valor">$<%= producto.precioDetalle.toLocaleString('es-CO') %></div>
                </div>
                <div class="precio precio-mayor">
                  <div class="precio-label">Precio Mayor</div>
                  <div class="precio-valor">$<%= producto.precioMayor.toLocaleString('es-CO') %></div>
                </div>
              </div>
            </div>
          </div>
        <% }); %>
      </div>
    </div>
  <% }); %>

  <!-- MEDIOS DE PAGO -->
  <div class="page-break"></div>
  <div class="seccion-info">
    <h2 class="seccion-titulo">Medios de Pago</h2>
    <div class="medios-grid">
      <% secciones.mediosPago.forEach(medio => { %>
        <div class="medio-card">
          <h3 class="medio-nombre"><%= medio.nombre %></h3>
          <p class="medio-descripcion"><%= medio.descripcion %></p>
          <% if (medio.numero) { %>
            <p class="medio-dato"><%= medio.numero %></p>
          <% } %>
          <% if (medio.cuenta) { %>
            <p class="medio-dato">Cuenta <%= medio.tipo %>: <%= medio.cuenta %></p>
          <% } %>
        </div>
      <% }); %>
    </div>
  </div>

  <!-- CONDICIONES DE VENTA -->
  <div class="page-break"></div>
  <div class="seccion-info">
    <h2 class="seccion-titulo">Condiciones de Venta</h2>
    <ul class="condiciones-lista">
      <% secciones.condicionesVenta.forEach(condicion => { %>
        <li><%= condicion %></li>
      <% }); %>
    </ul>
  </div>

  <!-- CONTACTO -->
  <div class="page-break"></div>
  <div class="seccion-info seccion-contacto">
    <h2 class="seccion-titulo">Información de Contacto</h2>
    <div class="contacto-grid">
      <div class="contacto-item">
        <div class="contacto-label">Teléfono</div>
        <div class="contacto-valor"><%= secciones.contacto.telefono %></div>
      </div>
      <div class="contacto-item">
        <div class="contacto-label">Email</div>
        <div class="contacto-valor"><%= secciones.contacto.email %></div>
      </div>
      <div class="contacto-item">
        <div class="contacto-label">WhatsApp</div>
        <div class="contacto-valor"><%= secciones.contacto.whatsapp %></div>
      </div>
      <div class="contacto-item">
        <div class="contacto-label">Dirección</div>
        <div class="contacto-valor"><%= secciones.contacto.direccion %></div>
      </div>
      <div class="contacto-item">
        <div class="contacto-label">Horario</div>
        <div class="contacto-valor"><%= secciones.contacto.horario %></div>
      </div>
    </div>
  </div>
</body>
</html>
```

### 7.3 Estilos Principales (`templates/styles/main.css`)

```css
/* Reset y base */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-primary);
  font-size: var(--font-size-base);
  color: var(--color-text);
  line-height: 1.6;
}

.page-break {
  page-break-before: always;
}

/* PORTADA */
.portada {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  page-break-after: always;
}

.portada-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  opacity: 0.95;
}

.portada-content {
  position: relative;
  z-index: 2;
  text-align: center;
  color: var(--color-white);
  padding: var(--spacing-lg);
}

.portada-logo {
  max-width: 250px;
  margin-bottom: var(--spacing-md);
  filter: brightness(0) invert(1);
}

.portada-titulo {
  font-size: var(--font-size-xxlarge);
  font-weight: 700;
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 3px;
}

.portada-fecha {
  font-size: var(--font-size-large);
  margin-bottom: var(--spacing-lg);
  opacity: 0.9;
}

.portada-stats {
  display: flex;
  justify-content: center;
  gap: 60px;
  margin: var(--spacing-lg) 0;
}

.stat-numero {
  font-size: 48pt;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: var(--font-size-medium);
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.9;
  margin-top: 8px;
}

/* SECCIÓN CATEGORÍA */
.categoria-seccion {
  padding: var(--spacing-md) 0;
}

.categoria-titulo {
  font-size: var(--font-size-xlarge);
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-xs);
  border-bottom: 3px solid var(--color-primary);
}

/* GRID DE PRODUCTOS 3x3 */
.productos-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

/* PRODUCTO CARD */
.producto-card {
  background: var(--color-white);
  border-radius: var(--border-radius);
  overflow: hidden;
  box-shadow: var(--box-shadow);
  page-break-inside: avoid;
  display: flex;
  flex-direction: column;
  position: relative;
}

.producto-card.agotado {
  opacity: 0.7;
}

.producto-imagen-container {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  background: var(--color-background);
  overflow: hidden;
}

.producto-imagen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.badge-nuevo {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--color-accent);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: var(--font-size-small);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  z-index: 2;
}

.overlay-agotado {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 24px;
  font-weight: 700;
  font-size: var(--font-size-large);
  border-radius: 4px;
  z-index: 2;
  letter-spacing: 1px;
}

.producto-info {
  padding: var(--spacing-xs);
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.producto-categoria {
  font-size: var(--font-size-small);
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  font-weight: 600;
}

.producto-nombre {
  font-size: var(--font-size-medium);
  font-weight: 600;
  color: var(--color-dark);
  margin: 0 0 var(--spacing-xs) 0;
  line-height: 1.3;
  min-height: 2.6em;
}

.producto-sku {
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  margin-bottom: var(--spacing-xs);
  font-family: 'Courier New', monospace;
}

.producto-precios {
  border-top: 1px solid var(--border-color);
  padding-top: var(--spacing-xs);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xs);
  margin-top: auto;
}

.precio {
  text-align: center;
}

.precio-label {
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.precio-valor {
  font-size: var(--font-size-large);
  font-weight: 700;
  color: var(--color-dark);
}

.precio-mayor {
  background: linear-gradient(135deg, rgba(233, 30, 99, 0.1), rgba(156, 39, 176, 0.1));
  padding: var(--spacing-xs);
  border-radius: var(--border-radius);
}

.precio-mayor .precio-valor {
  color: var(--color-primary);
  font-size: 16pt;
}

/* SECCIONES INFORMATIVAS */
.seccion-info {
  padding: var(--spacing-md);
}

.seccion-titulo {
  font-size: var(--font-size-xlarge);
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-xs);
  border-bottom: 3px solid var(--color-primary);
}

.medios-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

.medio-card {
  background: var(--color-background);
  padding: var(--spacing-md);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
}

.medio-nombre {
  font-size: var(--font-size-large);
  font-weight: 700;
  color: var(--color-dark);
  margin-bottom: var(--spacing-xs);
}

.medio-descripcion {
  font-size: var(--font-size-base);
  color: var(--color-text);
  margin-bottom: var(--spacing-xs);
}

.medio-dato {
  font-size: var(--font-size-medium);
  font-weight: 600;
  color: var(--color-primary);
  font-family: 'Courier New', monospace;
}

.condiciones-lista {
  list-style-position: inside;
  font-size: var(--font-size-base);
  line-height: 1.8;
}

.condiciones-lista li {
  margin-bottom: var(--spacing-xs);
}

.contacto-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

.contacto-item {
  background: var(--color-background);
  padding: var(--spacing-md);
  border-radius: var(--border-radius);
}

.contacto-label {
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--spacing-xs);
}

.contacto-valor {
  font-size: var(--font-size-medium);
  font-weight: 600;
  color: var(--color-dark);
}
```

### 7.4 Estilos de Impresión (`templates/styles/print.css`)

```css
@media print {
  @page {
    size: A4;
    margin: 15mm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  .producto-card,
  .medio-card,
  .contacto-item {
    page-break-inside: avoid;
  }

  .categoria-seccion {
    page-break-before: always;
  }
}
```

---

## 8. Script Principal de Generación

### 8.1 Estructura del Script (`generate-catalog.js`)

```javascript
const path = require('path');
const imageOptimizer = require('./lib/imageOptimizer');
const pdfGenerator = require('./lib/pdfGenerator');
const dbCatalog = require('./lib/dbCatalog');

async function generarCatalogo() {
  console.log('='.repeat(60));
  console.log('GENERADOR DE CATÁLOGO PDF - PRUEBA DE CONCEPTO');
  console.log('='.repeat(60));
  console.log('');
  
  const inicio = Date.now();
  
  try {
    // 1. Consultar productos desde base de datos
    console.log('📂 Consultando productos desde SQL Server...');
    const data = await dbCatalog.obtenerDatosCatalogo({
      // Opciones de filtrado (opcionales)
      // inv_gru_cod: null,        // Filtrar por categoría
      // inv_sub_gru_cod: null,     // Filtrar por subcategoría
      // tieneExistencia: null,      // null = todos, 1 = con stock, 0 = sin stock
      // limite: 600                // Límite de productos (opcional)
    });
    console.log(`   ✓ ${data.productos.length} productos obtenidos`);
    console.log(`   ✓ ${data.categorias.length} categorías encontradas`);
    console.log('');
    
    // 2. Optimizar imágenes
    console.log('📸 Optimizando imágenes...');
    const startImagenes = Date.now();
    const resultadosImagenes = await imageOptimizer.optimizarImagenes(data.productos);
    const timeImagenes = ((Date.now() - startImagenes) / 1000).toFixed(2);
    console.log(`   ✓ ${resultadosImagenes.exitosas} imágenes optimizadas`);
    console.log(`   ⚠ ${resultadosImagenes.fallidas} imágenes con error`);
    console.log(`   ⏱ Tiempo: ${timeImagenes}s`);
    console.log('');
    
    // Agregar rutas de imágenes optimizadas a productos
    data.productos.forEach(producto => {
      const resultado = resultadosImagenes.detalles.find(r => r.sku === producto.sku || r.sku === producto.art_cod);
      producto.imagenOptimizada = resultado ? resultado.rutaOptimizada : './assets/placeholder.jpg';
    });
    
    // 3. Generar PDF
    console.log('📄 Generando PDF...');
    const startPDF = Date.now();
    const resultadoPDF = await pdfGenerator.generar({
      metadata: data.metadata,
      categorias: data.categorias,
      productos: data.productos,
      secciones: data.secciones,
      __dirname: __dirname
    });
    const timePDF = ((Date.now() - startPDF) / 1000).toFixed(2);
    console.log(`   ✓ PDF generado: ${resultadoPDF.ruta}`);
    console.log(`   📏 Tamaño: ${resultadoPDF.tamanoMB} MB`);
    console.log(`   📄 Páginas: ${resultadoPDF.totalPaginas}`);
    console.log(`   ⏱ Tiempo: ${timePDF}s`);
    console.log('');
    
    // 4. Calcular métricas finales
    const tiempoTotal = ((Date.now() - inicio) / 1000).toFixed(2);
    const promedioImagen = (resultadosImagenes.pesoPromedioKB).toFixed(2);
    const reduccionPromedio = (resultadosImagenes.reduccionPromedioPorc).toFixed(2);
    
    // 5. Generar reporte
    console.log('='.repeat(60));
    console.log('RESULTADOS DE LA PRUEBA DE CONCEPTO');
    console.log('='.repeat(60));
    console.log('');
    console.log('OPTIMIZACIÓN DE IMÁGENES:');
    console.log(`  • Imágenes procesadas: ${resultadosImagenes.exitosas}`);
    console.log(`  • Peso promedio: ${promedioImagen} KB`);
    console.log(`  • Reducción promedio: ${reduccionPromedio}%`);
    console.log('');
    console.log('GENERACIÓN DE PDF:');
    console.log(`  • Tamaño final: ${resultadoPDF.tamanoMB} MB`);
    console.log(`  • Total páginas: ${resultadoPDF.totalPaginas}`);
    console.log(`  • Peso por página: ${(resultadoPDF.tamanoMB / resultadoPDF.totalPaginas).toFixed(2)} MB`);
    console.log('');
    console.log('TIEMPOS:');
    console.log(`  • Optimización imágenes: ${timeImagenes}s`);
    console.log(`  • Generación PDF: ${timePDF}s`);
    console.log(`  • TOTAL: ${tiempoTotal}s`);
    console.log('');
    
    // 6. Evaluar criterios de éxito
    console.log('CRITERIOS DE ÉXITO:');
    const pesoOK = resultadoPDF.tamanoMB <= 25;
    const imagenOK = promedioImagen <= 80;
    const tiempoOK = tiempoTotal <= 360; // 6 minutos
    
    console.log(`  • Peso PDF < 25 MB: ${pesoOK ? '✅' : '❌'} (${resultadoPDF.tamanoMB} MB)`);
    console.log(`  • Peso imagen < 80 KB: ${imagenOK ? '✅' : '❌'} (${promedioImagen} KB)`);
    console.log(`  • Tiempo < 6 min: ${tiempoOK ? '✅' : '❌'} (${tiempoTotal}s)`);
    console.log('');
    
    if (pesoOK && imagenOK && tiempoOK) {
      console.log('🎉 ¡PRUEBA DE CONCEPTO EXITOSA!');
    } else {
      console.log('⚠️  Algunos criterios no se cumplieron. Revisar optimizaciones.');
    }
    console.log('');
    console.log('='.repeat(60));
    
    // 7. Guardar reporte en JSON
    const reporte = {
      fecha: new Date().toISOString(),
      exito: pesoOK && imagenOK && tiempoOK,
      metricas: {
        imagenes: {
          procesadas: resultadosImagenes.exitosas,
          fallidas: resultadosImagenes.fallidas,
          pesoPromedioKB: parseFloat(promedioImagen),
          reduccionPromedioPorc: parseFloat(reduccionPromedio)
        },
        pdf: {
          tamanoMB: resultadoPDF.tamanoMB,
          totalPaginas: resultadoPDF.totalPaginas,
          pesoPorPaginaMB: parseFloat((resultadoPDF.tamanoMB / resultadoPDF.totalPaginas).toFixed(2))
        },
        tiempos: {
          optimizacionImagenesS: parseFloat(timeImagenes),
          generacionPDFS: parseFloat(timePDF),
          totalS: parseFloat(tiempoTotal)
        }
      },
      criterios: {
        pesoPDF: { cumple: pesoOK, objetivo: 25, valor: resultadoPDF.tamanoMB },
        pesoImagen: { cumple: imagenOK, objetivo: 80, valor: parseFloat(promedioImagen) },
        tiempo: { cumple: tiempoOK, objetivo: 360, valor: parseFloat(tiempoTotal) }
      }
    };
    
    await fs.writeFile('./output/reporte-poc.json', JSON.stringify(reporte, null, 2));
    console.log('📊 Reporte guardado en: ./output/reporte-poc.json');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error durante la generación:', error);
    process.exit(1);
  }
}

// Ejecutar
generarCatalogo();
```

---

## 9. Plan de Ejecución de la PoC

### 9.1 Preparación (Día 1)

**Tiempo estimado:** 4 horas

**Tareas:**
1. ✅ Crear estructura de directorios
2. ✅ Instalar dependencias npm (incluyendo mssql para SQL Server)
3. ✅ Configurar conexión a base de datos SQL Server (.env)
4. ✅ Implementar módulo `lib/dbCatalog.js` para consultas
5. ✅ Preparar assets (logo, fuentes, placeholder)
6. ✅ Configurar manual de marca en variables CSS
7. ✅ Crear archivo de configuración para secciones informativas

**Resultado esperado:**
- Proyecto configurado y listo para desarrollo
- Conexión a BD funcionando
- Consultas de productos y categorías operativas

### 9.2 Desarrollo (Días 2-3)

**Tiempo estimado:** 12 horas

**Día 2 - Optimización de Imágenes (6h):**
1. ✅ Implementar `lib/imageOptimizer.js`
2. ✅ Probar descarga de imágenes desde URLs
3. ✅ Probar optimización con Sharp
4. ✅ Validar calidad de imágenes optimizadas
5. ✅ Ajustar parámetros de compresión
6. ✅ Implementar descarga paralela

**Día 3 - Generación PDF (6h):**
1. ✅ Crear templates HTML/CSS
2. ✅ Implementar `lib/pdfGenerator.js`
3. ✅ Configurar Puppeteer
4. ✅ Generar primer PDF de prueba
5. ✅ Ajustar diseño y estilos
6. ✅ Optimizar configuración de PDF

**Resultado esperado:**
- Generación completa funcional

### 9.3 Testing y Ajustes (Día 4)

**Tiempo estimado:** 6 horas

**Tareas:**
1. ✅ Ejecutar generación con dataset completo
2. ✅ Medir todas las métricas
3. ✅ Imprimir muestra física del PDF
4. ✅ Evaluar calidad de impresión
5. ✅ Ajustar parámetros según resultados
6. ✅ Repetir pruebas hasta cumplir criterios
7. ✅ Documentar resultados

**Resultado esperado:**
- PDF que cumple todos los criterios de éxito
- Reporte de métricas completo

### 9.4 Documentación (Día 5)

**Tiempo estimado:** 4 horas

**Tareas:**
1. ✅ Documentar proceso de instalación
2. ✅ Documentar uso del script
3. ✅ Crear reporte final de la PoC
4. ✅ Preparar presentación de resultados
5. ✅ Archivar código fuente

**Resultado esperado:**
- Documentación completa de la PoC
- Presentación para stakeholders

---

## 10. Instrucciones de Uso

### 10.1 Instalación

```bash
# 1. Clonar o descargar el proyecto
cd poc-catalogo-pdf

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
# Crear archivo .env con:
# DB_SERVER=tu_servidor
# DB_DATABASE=tu_base_datos
# DB_USER=tu_usuario
# DB_PASSWORD=tu_password
# DB_PORT=1433

# 4. Verificar conexión a base de datos
# Ejecutar: node -e "require('./lib/dbCatalog.js').testConnection()"

# 5. Verificar assets
# Debe existir: assets/logo.png
```

### 10.2 Ejecución

```bash
# Ejecutar generación completa
node generate-catalog.js

# Resultado:
# - ./output/catalogo-poc.pdf
# - ./output/reporte-poc.json
# - ./cache/images/optimized/ (imágenes procesadas)

# Opciones de ejecución:
# node generate-catalog.js --limite 600          # Limitar a 600 productos
# node generate-catalog.js --categoria "1"       # Filtrar por categoría
# node generate-catalog.js --con-stock           # Solo productos con stock
```

### 10.3 Validación de Resultados

**1. Verificar PDF generado:**
```bash
# Ver propiedades del archivo
ls -lh ./output/catalogo-poc.pdf

# Abrir PDF
start ./output/catalogo-poc.pdf  # Windows
open ./output/catalogo-poc.pdf   # macOS
```

**2. Revisar reporte:**
```bash
# Ver reporte de métricas
cat ./output/reporte-poc.json
```

**3. Validar calidad de impresión:**
- Abrir PDF en Adobe Reader o equivalente
- Imprimir 2-3 páginas de muestra
- Verificar:
  - Texto legible (especialmente SKU a 8pt)
  - Imágenes nítidas
  - Colores correctos
  - Alineación correcta

---

## 11. Métricas y Criterios de Evaluación

### 11.1 Métricas Principales

| Métrica | Objetivo | Cómo Medir |
|---------|----------|------------|
| **Peso del PDF** | < 25 MB | Propiedades del archivo |
| **Peso promedio imagen** | 40-80 KB | Reporte JSON |
| **Tiempo de generación** | < 6 minutos | Logs del script |
| **Calidad de impresión** | Profesional | Impresión física |
| **Reducción de peso** | > 90% | Comparar original vs optimizada |

### 11.2 Checklist de Validación

**Optimización de Imágenes:**
- [ ] Todas las imágenes descargadas correctamente
- [ ] Imágenes optimizadas a 300x300px
- [ ] Peso promedio entre 40-80 KB
- [ ] Reducción > 90% respecto a original
- [ ] Calidad visual aceptable

**Generación del PDF:**
- [ ] PDF generado sin errores
- [ ] Tamaño total < 25 MB
- [ ] Todas las páginas presentes
- [ ] No hay páginas en blanco inesperadas
- [ ] Paginación correcta en footer

**Calidad Visual:**
- [ ] Portada con branding correcto
- [ ] Grid 3x3 consistente
- [ ] Imágenes nítidas y centradas
- [ ] Textos legibles (especialmente 8pt)
- [ ] Colores fieles al manual de marca
- [ ] Espaciado apropiado
- [ ] Productos agotados visualmente diferenciados
- [ ] Badges "NUEVO" visibles

**Calidad de Impresión:**
- [ ] Texto nítido en papel
- [ ] Imágenes sin pixelación
- [ ] Colores reproducidos correctamente
- [ ] Sin bandas o artefactos
- [ ] Márgenes apropiados

### 11.3 Formato del Reporte

**Archivo:** `output/reporte-poc.json`

```json
{
  "fecha": "2025-01-23T14:30:00.000Z",
  "exito": true,
  "metricas": {
    "imagenes": {
      "procesadas": 598,
      "fallidas": 2,
      "pesoPromedioKB": 62.5,
      "reduccionPromedioPorc": 94.2
    },
    "pdf": {
      "tamanoMB": 19.8,
      "totalPaginas": 72,
      "pesoPorPaginaMB": 0.28
    },
    "tiempos": {
      "optimizacionImagenesS": 145.2,
      "generacionPDFS": 98.7,
      "totalS": 243.9
    }
  },
  "criterios": {
    "pesoPDF": {
      "cumple": true,
      "objetivo": 25,
      "valor": 19.8
    },
    "pesoImagen": {
      "cumple": true,
      "objetivo": 80,
      "valor": 62.5
    },
    "tiempo": {
      "cumple": true,
      "objetivo": 360,
      "valor": 243.9
    }
  }
}
```

---

## 12. Solución de Problemas

### 12.1 Problemas Comunes

**Problema: Puppeteer no se instala en Windows**
```
Error: Failed to download Chromium
```
**Solución:**
```bash
# Instalar con variable de entorno
set PUPPETEER_SKIP_DOWNLOAD=true
npm install puppeteer
```

**Problema: Error de conexión a SQL Server**
```
Error: Failed to connect to SQL Server
```
**Solución:**
```bash
# Verificar variables de entorno en .env
DB_SERVER=tu_servidor
DB_DATABASE=tu_base_datos
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_PORT=1433

# Verificar que el servidor SQL Server está accesible
# Probar conexión manual con sqlcmd o SQL Server Management Studio
```

**Problema: Imágenes no se descargan**
```
Error: connect ETIMEDOUT
```
**Solución:**
- Verificar conectividad a internet
- Verificar que URLs de imágenes son accesibles
- Aumentar timeout en axios
- Implementar retry logic
- Verificar que `art_url_img_servi` o `producto_fotos.url` contienen URLs válidas

**Problema: PDF muy pesado (> 30 MB)**
**Posibles causas:**
1. Calidad de Sharp muy alta (> 85%)
2. Imágenes no optimizadas correctamente
3. Muchas páginas con imágenes grandes

**Solución:**
```javascript
// Reducir calidad en Sharp
.jpeg({
  quality: 80, // Bajar de 85 a 80
  progressive: true,
  mozjpeg: true
})

// O reducir tamaño de imagen
.resize(280, 280) // Bajar de 300 a 280
```

**Problema: Texto muy pequeño al imprimir**
**Solución:**
```css
/* Aumentar tamaños de fuente */
--font-size-small: 9pt;  /* Era 8pt */
--font-size-base: 11pt;  /* Era 10pt */
```

**Problema: Colores no se imprimen**
**Solución:**
```css
/* Asegurar en CSS */
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* Y en Puppeteer config */
printBackground: true
```

**Problema: No se obtienen productos de la BD**
```
Error: No se encontraron productos
```
**Solución:**
- Verificar que la tabla `articulos` tiene datos
- Verificar que los filtros aplicados no excluyen todos los productos
- Revisar que las relaciones con `inventario_grupo` e `inventario_subgrupo` son correctas
- Verificar permisos de usuario de BD para leer las tablas necesarias

### 12.2 Ajustes de Optimización

**Si necesitas reducir más el peso:**

1. **Reducir calidad JPEG:**
```javascript
quality: 80  // Bajar de 85
```

2. **Reducir tamaño de imagen:**
```javascript
.resize(280, 280)  // Bajar de 300
```

3. **Reducir productos por página:**
```css
.productos-grid {
  grid-template-columns: repeat(2, 1fr); /* De 3 a 2 */
}
```

**Si necesitas mejorar la calidad:**

1. **Aumentar calidad JPEG:**
```javascript
quality: 90  // Subir de 85
```

2. **Aumentar tamaño de imagen:**
```javascript
.resize(350, 350)  // Subir de 300
```

3. **Usar formato PNG para imágenes con transparencia:**
```javascript
.png({ compressionLevel: 9 })
```

---

## 13. Próximos Pasos Post-PoC

### 13.1 Si la PoC es Exitosa

**Validaciones completadas:**
- ✅ Calidad de impresión profesional
- ✅ Peso optimizado < 25 MB
- ✅ Tiempo de generación aceptable
- ✅ Diseño visual aprobado

**Continuar con MVP completo:**
1. Integrar con SQL Server
2. Implementar sistema de caché
3. Crear API REST
4. Desarrollar interfaz de usuario
5. Implementar distribución automática

### 13.2 Si se Requieren Ajustes

**Áreas a optimizar:**
- [ ] Calidad de imagen vs peso
- [ ] Diseño visual
- [ ] Tiempo de generación
- [ ] Layout de productos
- [ ] Tipografía y legibilidad

**Iteración:**
1. Identificar ajustes necesarios
2. Modificar parámetros
3. Regenerar y probar
4. Validar nuevamente

### 13.3 Documentación de Lecciones Aprendidas

Documentar:
- Configuración óptima de Sharp
- Configuración óptima de Puppeteer
- Parámetros de diseño que funcionaron mejor
- Problemas encontrados y soluciones
- Tiempos reales de ejecución
- Sugerencias para el MVP

---

## 14. Apéndices

### Apéndice A: Comandos Útiles

```bash
# Ver tamaño de directorios
du -sh ./cache/images/*
du -sh ./output/*

# Contar archivos en caché
ls -1 ./cache/images/optimized/ | wc -l

# Ver info de un PDF
pdfinfo ./output/catalogo-poc.pdf  # Linux/Mac

# Comparar tamaños
ls -lh ./cache/images/original/MAQ001.jpg
ls -lh ./cache/images/optimized/MAQ001.jpg
```

### Apéndice B: Estructura Completa del Proyecto

```
poc-catalogo-pdf/
├── package.json
├── package-lock.json
├── README.md
├── .env                          # Variables de entorno (BD, etc.)
├── generate-catalog.js
├── lib/
│   ├── dbCatalog.js             # Consulta productos desde SQL Server
│   ├── imageOptimizer.js
│   └── pdfGenerator.js
├── config/
│   └── catalog-config.json       # Configuración de secciones (opcional)
├── templates/
│   ├── catalog.ejs
│   └── styles/
│       ├── variables.css
│       ├── main.css
│       └── print.css
├── lib/
│   ├── imageOptimizer.js
│   └── pdfGenerator.js
├── assets/
│   ├── logo.png
│   ├── placeholder.jpg
│   └── fonts/
│       ├── Montserrat-Regular.ttf
│       └── OpenSans-Regular.ttf
├── cache/
│   └── images/
│       ├── original/
│       └── optimized/
├── output/
│   ├── catalogo-poc.pdf
│   └── reporte-poc.json
└── node_modules/
```

### Apéndice C: Especificaciones de Impresión

**Recomendaciones para imprenta:**

- **Formato:** A4 (210mm x 297mm)
- **Resolución:** 300 DPI (equivalente)
- **Espacio de color:** RGB (para digital) o CMYK (para imprenta profesional)
- **Sangrado:** No aplicable (PDF final sin sangrado)
- **Tipo de papel recomendado:** Couché 150-200g para mejor resultado
- **Acabado:** Mate o brillante según preferencia
- **Encuadernación:** Wire-O o espiral recomendado

---

**FIN DEL DOCUMENTO - PRUEBA DE CONCEPTO**

---

## Resumen de Entregables

1. ✅ **Código fuente completo** del generador
2. ✅ **Dataset de prueba** con 600 productos
3. ✅ **Templates HTML/CSS** profesionales
4. ✅ **PDF generado** como demostración
5. ✅ **Reporte de métricas** en JSON
6. ✅ **Documentación técnica** completa

**Tiempo estimado total:** 5 días (26 horas efectivas)

**Recursos necesarios:**
- 1 Desarrollador Backend (Node.js)
- 1 Diseñador (para validar diseño visual)
- Acceso a servidor Windows para pruebas
- Dataset de productos reales (o generado)
- Logo e imágenes de productos

**Inversión estimada:** 5 días-persona

**Riesgo:** Bajo (tecnologías probadas y maduras)

**ROI esperado:** Alto (validación técnica previa a MVP completo)
