# Generador de Catálogo PDF - Prueba de Concepto

Sistema para generar catálogos PDF de productos con calidad profesional de impresión y peso optimizado.

## 📋 Descripción

Este módulo genera catálogos PDF a partir de productos almacenados en la base de datos SQL Server. Incluye:

- ✅ Consulta de productos desde base de datos
- ✅ Optimización de imágenes con Sharp (300x300px, JPEG 85%)
- ✅ Diseño visual profesional (portada, productos, secciones)
- ✅ Layout 3x3 productos por página
- ✅ Configuración de impresión de alta calidad
- ✅ Medición de métricas (tiempo, peso, calidad)

## 🚀 Instalación

Las dependencias ya están incluidas en el `package.json` principal del proyecto. Si necesitas instalarlas:

```bash
npm install
```

**Dependencias requeridas:**
- `puppeteer` - Generación de PDF
- `sharp` - Optimización de imágenes
- `ejs` - Templates HTML
- `axios` - Descarga de imágenes
- `mssql` - Conexión a SQL Server
- `dotenv` - Variables de entorno

## ⚙️ Configuración

### 1. Variables de Entorno

Asegúrate de tener configuradas las variables de entorno en el archivo `.env` del proyecto principal:

```env
DB_SERVER=tu_servidor_sql
DB_DATABASE=tu_base_datos
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_PORT=1433
```

### 2. Configuración de Secciones Informativas

Edita el archivo `config/catalog-config.json` para personalizar:

- Medios de pago
- Condiciones de venta
- Información de contacto

### 3. Logo de la Empresa

Coloca el logo de tu empresa en:
```
poc-catalogo-pdf/assets/logo.png
```

Si no existe, el template funcionará sin logo.

### 4. Imagen Placeholder (Opcional)

Si quieres una imagen placeholder para productos sin imagen:
```
poc-catalogo-pdf/assets/placeholder.jpg
```

## 📖 Uso

### Generar Catálogo Completo

```bash
npm run catalog:generate
```

O directamente:

```bash
node poc-catalogo-pdf/generate-catalog.js
```

### Probar Conexión a Base de Datos

```bash
npm run catalog:test-db
```

## 📊 Resultados

Después de ejecutar el generador, encontrarás:

1. **PDF Generado:**
   - `poc-catalogo-pdf/output/catalogo-poc.pdf`

2. **Reporte de Métricas:**
   - `poc-catalogo-pdf/output/reporte-poc.json`

3. **Imágenes Optimizadas:**
   - `poc-catalogo-pdf/cache/images/original/` - Imágenes originales
   - `poc-catalogo-pdf/cache/images/optimized/` - Imágenes optimizadas

## 📈 Criterios de Éxito

La PoC se considera exitosa si cumple:

| Criterio | Objetivo | Medible |
|----------|----------|---------|
| **Peso del PDF** | < 25 MB | Tamaño archivo |
| **Peso por imagen** | 40-80 KB | Reporte JSON |
| **Tiempo de generación** | < 6 minutos | Logs del script |

## 🔧 Personalización

### Filtrar Productos

Edita `generate-catalog.js` para agregar filtros:

```javascript
const data = await dbCatalog.obtenerDatosCatalogo({
  inv_gru_cod: '1',           // Filtrar por categoría
  tieneExistencia: 1,         // Solo productos con stock
  limite: 600                 // Límite de productos
});
```

### Ajustar Colores y Diseño

Edita `templates/styles/variables.css`:

```css
:root {
  --color-primary: #E91E63;    /* Color principal */
  --color-secondary: #9C27B0;  /* Color secundario */
  /* ... más variables ... */
}
```

### Cambiar Tamaño de Imágenes

Edita `lib/imageOptimizer.js`:

```javascript
const OPTIMIZATION_CONFIG = {
  width: 300,    // Cambiar ancho
  height: 300,   // Cambiar alto
  quality: 85    // Cambiar calidad (1-100)
};
```

## 🐛 Solución de Problemas

### Error: Failed to connect to SQL Server

- Verifica las variables de entorno en `.env`
- Asegúrate de que el servidor SQL Server esté accesible
- Verifica credenciales y permisos

### Error: Puppeteer no se instala

```bash
# En Windows, puede ser necesario:
set PUPPETEER_SKIP_DOWNLOAD=true
npm install puppeteer
```

### PDF muy pesado (> 30 MB)

- Reduce la calidad JPEG en `imageOptimizer.js` (quality: 80)
- Reduce el tamaño de imagen (width/height: 280)
- Verifica que las imágenes se estén optimizando correctamente

### Imágenes no se descargan

- Verifica conectividad a internet
- Verifica que las URLs de imágenes sean accesibles
- Revisa que `art_url_img_servi` o `producto_fotos.url` contengan URLs válidas

### Texto muy pequeño al imprimir

Edita `templates/styles/variables.css`:

```css
--font-size-small: 9pt;  /* Aumentar de 8pt */
--font-size-base: 11pt;  /* Aumentar de 10pt */
```

## 📁 Estructura del Proyecto

```
poc-catalogo-pdf/
├── lib/
│   ├── dbCatalog.js          # Consulta productos desde BD
│   ├── imageOptimizer.js     # Optimización de imágenes
│   └── pdfGenerator.js       # Generación PDF
├── templates/
│   ├── catalog.ejs           # Template principal
│   └── styles/
│       ├── variables.css     # Variables de diseño
│       ├── main.css          # Estilos principales
│       └── print.css         # Estilos de impresión
├── config/
│   └── catalog-config.json   # Configuración de secciones
├── assets/
│   └── logo.png              # Logo de la empresa
├── cache/
│   └── images/               # Imágenes procesadas
├── output/
│   ├── catalogo-poc.pdf      # PDF generado
│   └── reporte-poc.json      # Reporte de métricas
└── generate-catalog.js       # Script principal
```

## 📝 Notas

- Las imágenes se descargan y optimizan en tiempo de ejecución
- El caché de imágenes se mantiene para evitar reprocesar
- El PDF se genera con formato A4, listo para impresión
- Los productos se organizan automáticamente por categoría

## 🔄 Próximos Pasos (Post-PoC)

Si la PoC es exitosa, se puede continuar con:

1. Integración con API REST
2. Sistema de caché inteligente
3. Interfaz de usuario/dashboard
4. Sistema de versionado
5. Distribución automática (WhatsApp, QR, etc.)

## 📞 Soporte

Para problemas o preguntas, consulta la documentación completa en:
`implementaciones_2026/POC-catalogo-pdf-generacion-optimizada.md`
