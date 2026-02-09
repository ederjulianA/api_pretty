const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs').promises;
const path = require('path');

/**
 * Lee y combina todos los archivos CSS
 */
async function cargarEstilos(baseDir) {
  // baseDir debe ser poc-catalogo-pdf/, no poc-catalogo-pdf/lib/
  const stylesDir = path.join(baseDir, 'templates/styles');

  try {
    const variablesCSS = await fs.readFile(
      path.join(stylesDir, 'variables.css'),
      'utf8'
    );
    let mainCSS = await fs.readFile(
      path.join(stylesDir, 'main.css'),
      'utf8'
    );
    const printCSS = await fs.readFile(
      path.join(stylesDir, 'print.css'),
      'utf8'
    );

    // Convertir la imagen de fondo a base64
    const fondoPath = path.join(baseDir, 'assets', 'fondo_1.png');
    try {
      const fondoBase64 = await convertirImagenABase64(fondoPath, baseDir);
      if (fondoBase64) {
        // Reemplazar la URL relativa con la versión base64
        const regex = /url\(['"]?\.\.\/assets\/fondo_1\.png['"]?\)/g;
        const matches = mainCSS.match(regex);
        console.log('   → Referencias a fondo_1.png encontradas:', matches ? matches.length : 0);

        mainCSS = mainCSS.replace(regex, `url('${fondoBase64}')`);
        console.log('   ✓ Imagen de fondo convertida a base64');
        console.log('   → Tamaño base64:', (fondoBase64.length / 1024).toFixed(2), 'KB');
      } else {
        console.warn('   ⚠️  fondoBase64 es null o vacío');
      }
    } catch (error) {
      console.warn('   ⚠️  No se pudo convertir fondo_1.png a base64:', error.message);
    }

    return `${variablesCSS}\n\n${mainCSS}\n\n${printCSS}`;
  } catch (error) {
    console.error('Error cargando estilos CSS:', error);
    throw error;
  }
}

/**
 * Convierte una imagen local a base64 para incrustarla en el HTML
 * Esto garantiza que Puppeteer pueda cargarla correctamente
 */
async function convertirImagenABase64(rutaImagen, baseDir) {
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }
  if (!rutaImagen) {
    return null;
  }
  
  // Si ya es una URL HTTP/HTTPS, retornarla tal cual (Puppeteer puede cargarla)
  if (rutaImagen.startsWith('http://') || rutaImagen.startsWith('https://')) {
    return rutaImagen;
  }
  
  try {
    // Si es una ruta local, convertir a base64
    let rutaAbsoluta;
    if (path.isAbsolute(rutaImagen)) {
      rutaAbsoluta = rutaImagen;
    } else {
      // Limpiar ruta relativa
      let rutaLimpia = rutaImagen;
      if (rutaLimpia.startsWith('./')) {
        rutaLimpia = rutaLimpia.substring(2);
      }
      rutaAbsoluta = path.resolve(baseDir, rutaLimpia);
    }
    
    // Leer archivo y convertir a base64
    const imagenBuffer = await fs.readFile(rutaAbsoluta);
    const base64 = imagenBuffer.toString('base64');
    const extension = path.extname(rutaAbsoluta).toLowerCase().substring(1) || 'jpg';
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.warn(`⚠️  Error convirtiendo imagen a base64 (${rutaImagen}):`, error.message);
    return null;
  }
}

/**
 * Prepara las imágenes en los datos para Puppeteer
 * NUEVA ESTRATEGIA: Usa file:// URLs en lugar de base64 para mejor rendimiento
 */
async function prepararImagenes(datos, baseDir) {
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }

  // Preparar logo de empresa (solo este en base64 porque es pequeño)
  if (datos.metadata.empresa.logo) {
    const logoBase64 = await convertirImagenABase64(
      datos.metadata.empresa.logo,
      baseDir
    );
    if (logoBase64) {
      datos.metadata.empresa.logo = logoBase64;
    }
  }

  // Preparar imágenes de productos - USAR FILE:// URLS en lugar de base64
  console.log('   → Preparando rutas de imágenes para Puppeteer...');
  let procesadas = 0;
  for (let i = 0; i < datos.productos.length; i++) {
    const producto = datos.productos[i];
    if (producto.imagenOptimizada) {
      // Si es URL HTTP/HTTPS, dejarla tal cual
      if (producto.imagenOptimizada.startsWith('http://') ||
          producto.imagenOptimizada.startsWith('https://')) {
        // Ya es una URL, Puppeteer puede cargarla directamente
        continue;
      }

      // Si es ruta local, convertir a file:// URL
      let rutaAbsoluta;
      if (path.isAbsolute(producto.imagenOptimizada)) {
        rutaAbsoluta = producto.imagenOptimizada;
      } else {
        // Limpiar ruta relativa
        let rutaLimpia = producto.imagenOptimizada;
        if (rutaLimpia.startsWith('./')) {
          rutaLimpia = rutaLimpia.substring(2);
        }
        rutaAbsoluta = path.resolve(baseDir, rutaLimpia);
      }

      // Convertir a file:// URL para Puppeteer
      producto.imagenOptimizada = `file://${rutaAbsoluta}`;
      procesadas++;

      // Log de progreso cada 100 imágenes
      if ((i + 1) % 100 === 0) {
        console.log(`   → Progreso: ${i + 1}/${datos.productos.length} imágenes procesadas`);
      }
    }
  }
  console.log(`   ✓ ${procesadas} imágenes preparadas con file:// URLs`);

  return datos;
}

/**
 * Genera el PDF del catálogo
 * @param {Object} datos - Datos del catálogo (metadata, categorias, productos, secciones)
 * @param {string} baseDir - Directorio base del proyecto (poc-catalogo-pdf/)
 * @returns {Promise<Object>} Resultado con ruta, tamaño, páginas y tiempo
 */
async function generar(datos, baseDir) {
  // Si no se proporciona baseDir, calcularlo desde __dirname (poc-catalogo-pdf/lib/)
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }
  const inicio = Date.now();
  
  try {
    console.log('📄 Iniciando generación de PDF...');
    
    // 1. Cargar estilos CSS
    console.log('   → Cargando estilos CSS...');
    const styles = await cargarEstilos(baseDir);
    
    // 2. Preparar imágenes para Puppeteer (convertir locales a base64)
    console.log('   → Preparando imágenes...');
    const datosPreparados = await prepararImagenes(
      JSON.parse(JSON.stringify(datos)),
      baseDir
    );

    // 3. Convertir imágenes de páginas completas a base64
    console.log('   → Preparando imágenes de páginas completas...');

    // Imagen de Gracias
    const graciasPath = path.join(baseDir, 'assets', 'gracias.png');
    const graciasBase64 = await convertirImagenABase64(graciasPath, baseDir);
    if (graciasBase64) {
      datosPreparados.metadata.imagenGracias = graciasBase64;
      console.log('   ✓ Imagen de gracias preparada');
    } else {
      console.warn('   ⚠️ No se pudo cargar la imagen de gracias');
    }

    // Imagen de Formas de Pago
    const formasPagoPath = path.join(baseDir, 'assets', 'formas_de_pago.png');
    const formasPagoBase64 = await convertirImagenABase64(formasPagoPath, baseDir);
    if (formasPagoBase64) {
      datosPreparados.metadata.imagenFormasPago = formasPagoBase64;
      console.log('   ✓ Imagen de formas de pago preparada');
    } else {
      console.warn('   ⚠️ No se pudo cargar la imagen de formas de pago');
    }

    // Agregar estilos a los datos para el template
    datosPreparados.styles = styles;
    
    // 3. Renderizar HTML con EJS
    console.log('   → Renderizando template HTML...');
    const templatePath = path.join(baseDir, 'templates/catalog.ejs');
    const html = await ejs.renderFile(templatePath, datosPreparados, {
      root: path.join(baseDir, 'templates')
    });
    
    // 4. Configurar Puppeteer para macOS ARM con nueva API (v24+)
    console.log('   → Iniciando Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true, // En Puppeteer 24+, true = nuevo headless
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security', // Permitir carga de imágenes externas
        '--allow-file-access-from-files' // Permitir acceso a archivos locales
      ]
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(300000); // 5 minutos

    // Habilitar intercepción de requests para debugging
    await page.setRequestInterception(false);

    // 5. Guardar HTML temporalmente y cargar desde archivo (permite carga de recursos externos)
    console.log('   → Cargando contenido HTML...');
    console.log(`   → Tamaño HTML: ${(html.length / 1024).toFixed(2)} KB`);

    const tempHtmlPath = path.join(baseDir, 'output', 'temp-catalog.html');
    await fs.writeFile(tempHtmlPath, html, 'utf8');

    // Cargar desde archivo HTML permite que Puppeteer cargue recursos externos
    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: 'networkidle0', // Esperar hasta que se carguen todas las imágenes
      timeout: 300000
    });

    console.log('   → Esperando renderizado completo...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 6. Configurar PDF con nombre único (timestamp)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Formato: 2025-01-29T14-30-00
    const nombreArchivo = `catalogo-${timestamp}.pdf`;
    const outputDir = path.join(baseDir, 'output');
    const outputPath = path.join(outputDir, nombreArchivo);

    // Asegurar que el directorio output existe
    await fs.mkdir(outputDir, { recursive: true });
    const pdfConfig = {
      path: outputPath,
      format: 'A4',
      landscape: true, // Orientación horizontal
      printBackground: true, // CRÍTICO: conservar colores de fondo
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      // Mejorar compatibilidad con visores PDF móviles
      tagged: false, // Desactivar tags para mejor compatibilidad
      outline: false, // Desactivar outline para archivos más simples
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; background: #f58ea3; padding:8px 20px; display:flex; justify-content:space-between; align-items:center; font-family: 'Montserrat', sans-serif; font-size:0;">
          <div style="display:flex; flex-direction:column; gap:2px; color:white;">
            <div style="display:flex; align-items:center; gap:6px; font-size:11pt;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.53-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="white"/>
              </svg>
              <span style="font-weight:600;">Pedidos WhatsApp:</span>
              <span style="font-weight:700; letter-spacing:0.5px;">321 420 7398</span>
            </div>
            <div style="font-size:9pt; font-weight:500; margin-left:24px;">
              www.prettymakeupcol.com
            </div>
          </div>
          <div style="color:white; font-size:10pt; font-weight:500;">
            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        </div>
      `,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '30mm',
        left: '15mm'
      }
    };
    
    // 7. Generar PDF
    console.log('   → Generando PDF (esto puede tardar varios minutos)...');
    await page.pdf(pdfConfig);
    
    // 8. Cerrar browser y limpiar archivo temporal
    await browser.close();

    // Limpiar HTML temporal
    try {
      const tempHtmlPath = path.join(baseDir, 'output', 'temp-catalog.html');
      await fs.unlink(tempHtmlPath);
    } catch (e) {
      // Ignorar si no se puede eliminar
    }

    // 9. Calcular métricas
    const tiempoTotal = (Date.now() - inicio) / 1000;
    const stats = await fs.stat(outputPath);
    const tamanoMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    // Calcular número de páginas aproximado
    // Portada: 1 página
    // Gracias: 1 página
    // Formas de Pago: 1 página
    // Productos: 3 por página (1 fila x 3 columnas)
    const paginasProductos = Math.ceil(datos.productos.length / 3);
    const totalPaginas = 1 + 1 + 1 + paginasProductos; // Portada + Gracias + Formas de Pago + Productos
    
    console.log('✓ PDF generado exitosamente');
    
    return {
      ruta: outputPath,
      nombreArchivo: nombreArchivo,
      rutaRelativa: `./output/${nombreArchivo}`,
      tamanoMB: parseFloat(tamanoMB),
      tiempoSegundos: parseFloat(tiempoTotal.toFixed(2)),
      totalPaginas: totalPaginas,
      timestamp: timestamp
    };
    
  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    throw error;
  }
}

/**
 * Función auxiliar para obtener información del PDF generado
 */
async function obtenerInfoPDF(rutaPDF) {
  try {
    const stats = await fs.stat(rutaPDF);
    return {
      existe: true,
      tamanoBytes: stats.size,
      tamanoMB: (stats.size / (1024 * 1024)).toFixed(2),
      fechaCreacion: stats.birthtime,
      fechaModificacion: stats.mtime
    };
  } catch (error) {
    return {
      existe: false,
      error: error.message
    };
  }
}

module.exports = {
  generar,
  cargarEstilos,
  convertirImagenABase64,
  prepararImagenes,
  obtenerInfoPDF
};
