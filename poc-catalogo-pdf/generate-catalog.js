const path = require('path');
// Cargar .env desde el directorio raíz del proyecto ANTES de importar cualquier módulo
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs').promises;
const imageOptimizer = require('./lib/imageOptimizer');
const pdfGenerator = require('./lib/pdfGenerator');
// Usar versión simplificada que NO carga WooCommerce (evita errores de dependencias)
const dbCatalog = require('./lib/dbCatalogSimple');
const { subirCatalogo } = require('./lib/azureUploader');
const { purgarCache } = require('./lib/cloudflarePurge');

// Obtener directorio base del script (poc-catalogo-pdf/)
const baseDir = __dirname;

async function generarCatalogo() {
  console.log('='.repeat(60));
  console.log('GENERADOR DE CATÁLOGO PDF - PRUEBA DE CONCEPTO');
  console.log('='.repeat(60));
  console.log('');
  
  const inicio = Date.now();
  
  try {
    // 1. Consultar productos desde base de datos (solo con existencias)
    console.log('📂 Consultando productos desde SQL Server...');
    console.log('   → Filtrando solo productos con stock disponible...');
    const data = await dbCatalog.obtenerDatosCatalogo({
      // Filtrar solo productos con existencias
      tieneExistencia: 1,      // 1 = solo productos con stock
      // inv_gru_cod: null,        // Filtrar por categoría (opcional)
      // inv_sub_gru_cod: null,     // Filtrar por subcategoría (opcional)
      // limite: null              // Sin límite - generar catálogo completo
    });
    console.log(`   ✓ ${data.productos.length} productos obtenidos`);
    console.log(`   ✓ ${data.categorias.length} categorías encontradas`);
    console.log('');
    
    // 2. Optimizar imágenes
    console.log('📸 Optimizando imágenes...');
    const startImagenes = Date.now();
    const resultadosImagenes = await imageOptimizer.optimizarImagenes(data.productos, baseDir);
    const timeImagenes = ((Date.now() - startImagenes) / 1000).toFixed(2);
    console.log(`   ✓ ${resultadosImagenes.exitosas} imágenes optimizadas`);
    console.log(`   ⚠ ${resultadosImagenes.fallidas} imágenes con error`);
    console.log(`   ⏱ Tiempo: ${timeImagenes}s`);
    console.log('');
    
    // Agregar rutas de imágenes optimizadas a productos
    data.productos.forEach(producto => {
      const resultado = resultadosImagenes.detalles.find(r => 
        r.sku === producto.sku || r.sku === producto.art_cod
      );
      if (resultado && resultado.exito && resultado.rutaOptimizada) {
        // Usar imagen optimizada (ruta absoluta del archivo)
        producto.imagenOptimizada = resultado.rutaOptimizada;
      } else if (producto.imagenUrl) {
        // Si la optimización falló pero tenemos URL original, usar esa
        // Puppeteer puede cargar imágenes desde URLs HTTP/HTTPS directamente
        producto.imagenOptimizada = producto.imagenUrl;
        console.log(`   ⚠ Usando URL original para ${producto.sku}: ${producto.imagenUrl.substring(0, 50)}...`);
      } else {
        // No usar placeholder si no existe el archivo, dejar null para que el template maneje
        producto.imagenOptimizada = null;
      }
    });
    
    // 3. Generar PDF
    console.log('📄 Generando PDF...');
    const startPDF = Date.now();
    const resultadoPDF = await pdfGenerator.generar(data, baseDir);
    const timePDF = ((Date.now() - startPDF) / 1000).toFixed(2);
    console.log(`   ✓ PDF generado: ${resultadoPDF.ruta}`);
    console.log(`   📏 Tamaño: ${resultadoPDF.tamanoMB} MB`);
    console.log(`   📄 Páginas: ${resultadoPDF.totalPaginas}`);
    console.log(`   ⏱ Tiempo: ${timePDF}s`);
    console.log('');
    
    // 4. Calcular métricas finales
    const tiempoTotal = ((Date.now() - inicio) / 1000).toFixed(2);
    const promedioImagen = resultadosImagenes.pesoPromedioKB || 0;
    const reduccionPromedio = resultadosImagenes.reduccionPromedioPorc || 0;
    
    // 5. Generar reporte
    console.log('='.repeat(60));
    console.log('RESULTADOS DE LA PRUEBA DE CONCEPTO');
    console.log('='.repeat(60));
    console.log('');
    console.log('OPTIMIZACIÓN DE IMÁGENES:');
    console.log(`  • Imágenes procesadas: ${resultadosImagenes.exitosas}`);
    console.log(`  • Peso promedio: ${promedioImagen.toFixed(2)} KB`);
    console.log(`  • Reducción promedio: ${reduccionPromedio.toFixed(2)}%`);
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
    const tiempoOK = parseFloat(tiempoTotal) <= 360; // 6 minutos
    
    console.log(`  • Peso PDF < 25 MB: ${pesoOK ? '✅' : '❌'} (${resultadoPDF.tamanoMB} MB)`);
    console.log(`  • Peso imagen < 80 KB: ${imagenOK ? '✅' : '❌'} (${promedioImagen.toFixed(2)} KB)`);
    console.log(`  • Tiempo < 6 min: ${tiempoOK ? '✅' : '❌'} (${tiempoTotal}s)`);
    console.log('');
    
    if (pesoOK && imagenOK && tiempoOK) {
      console.log('🎉 ¡PRUEBA DE CONCEPTO EXITOSA!');
    } else {
      console.log('⚠️  Algunos criterios no se cumplieron. Revisar optimizaciones.');
    }
    console.log('');
    console.log('='.repeat(60));

    // 7. Subir a Azure y purgar caché en Cloudflare
    let resultadoNube = { exito: false, omitido: true };
    let resultadoPurga = { exito: false, omitido: true };

    console.log('☁️  Publicando en la nube...');
    try {
      console.log('   🚀 Subiendo a Azure Blob Storage...');
      resultadoNube = await subirCatalogo(resultadoPDF.ruta);
      if (resultadoNube.omitido) {
        console.log('   ℹ️  Subida omitida (sin credenciales Azure).');
      } else {
        console.log(`   ✓ Subida exitosa → ${resultadoNube.url}`);

        console.log('   🧹 Purgando caché en Cloudflare CDN...');
        resultadoPurga = await purgarCache();
        if (resultadoPurga.omitido) {
          console.log('   ℹ️  Purga omitida (sin credenciales Cloudflare).');
        } else {
          console.log('   ✓ Caché purgada. (propagación global: ~30 segundos)');
        }
      }
    } catch (errorNube) {
      console.error(`   ❌ Error en publicación cloud: ${errorNube.message}`);
      console.log('   ⚠️  El PDF local se conserva en:', resultadoPDF.ruta);
    }
    if (resultadoNube.exito) {
      console.log('');
      console.log(`🌐 Catálogo disponible en: ${resultadoNube.url}`);
    }
    console.log('');

    // 8. Guardar reporte en JSON
    const reporte = {
      fecha: new Date().toISOString(),
      exito: pesoOK && imagenOK && tiempoOK,
      metricas: {
        imagenes: {
          procesadas: resultadosImagenes.exitosas,
          fallidas: resultadosImagenes.fallidas,
          pesoPromedioKB: parseFloat(promedioImagen.toFixed(2)),
          reduccionPromedioPorc: parseFloat(reduccionPromedio.toFixed(2))
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
        pesoImagen: { cumple: imagenOK, objetivo: 80, valor: parseFloat(promedioImagen.toFixed(2)) },
        tiempo: { cumple: tiempoOK, objetivo: 360, valor: parseFloat(tiempoTotal) }
      },
      nube: {
        subidaAzure: resultadoNube.exito,
        urlPublica: resultadoNube.url || null,
        purgaCloudflare: resultadoPurga.exito,
      }
    };
    
    // Guardar reporte con mismo timestamp que el PDF
    const nombreReporte = `reporte-${resultadoPDF.timestamp}.json`;
    const reportePath = path.join(baseDir, 'output', nombreReporte);
    await fs.writeFile(reportePath, JSON.stringify(reporte, null, 2));
    console.log(`📊 Reporte guardado en: poc-catalogo-pdf/output/${nombreReporte}`);
    console.log('');
    
    return {
      exito: pesoOK && imagenOK && tiempoOK,
      reporte,
      resultadoPDF
    };
    
  } catch (error) {
    console.error('❌ Error durante la generación:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  generarCatalogo()
    .then(() => {
      console.log('✓ Proceso completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { generarCatalogo };
