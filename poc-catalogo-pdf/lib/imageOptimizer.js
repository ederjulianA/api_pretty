const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuración de optimización
const OPTIMIZATION_CONFIG = {
  width: 300,
  height: 300,
  fit: 'cover',
  position: 'center',
  format: 'jpeg',
  quality: 85,
  progressive: true,
  mozjpeg: true,
  withMetadata: false
};

// Tamaño de chunk para procesamiento paralelo
const CHUNK_SIZE = 20;

// Timeout para descargas (30 segundos)
const DOWNLOAD_TIMEOUT = 30000;

/**
 * Descarga una imagen desde una URL
 */
async function descargarImagen(urlImagen) {
  try {
    const response = await axios.get(urlImagen, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return Buffer.from(response.data);
  } catch (error) {
    throw new Error(`Error descargando imagen desde ${urlImagen}: ${error.message}`);
  }
}

/**
 * Optimiza una imagen individual
 * @param {string} urlImagen - URL de la imagen a optimizar
 * @param {string} sku - SKU del producto (para nombrar el archivo)
 * @param {string} baseDir - Directorio base del proyecto
 * @returns {Promise<Object>} Resultado de la optimización con métricas
 */
async function optimizarImagen(urlImagen, sku, baseDir) {
  // Si no se proporciona baseDir, calcularlo desde __dirname (poc-catalogo-pdf/lib/)
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }
  const cacheDir = path.join(baseDir, 'cache/images');
  const originalDir = path.join(cacheDir, 'original');
  const optimizedDir = path.join(cacheDir, 'optimized');
  
  // Asegurar que los directorios existen
  await fs.mkdir(originalDir, { recursive: true });
  await fs.mkdir(optimizedDir, { recursive: true });
  
  try {
    // 1. Descargar imagen desde URL
    const buffer = await descargarImagen(urlImagen);
    const pesoOriginal = buffer.length / 1024; // KB
    
    // 2. Guardar original (para comparación/debugging)
    const nombreArchivo = `${sku.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    const rutaOriginal = path.join(originalDir, nombreArchivo);
    await fs.writeFile(rutaOriginal, buffer);
    
    // 3. Optimizar con Sharp
    const optimized = await sharp(buffer)
      .resize(OPTIMIZATION_CONFIG.width, OPTIMIZATION_CONFIG.height, {
        fit: OPTIMIZATION_CONFIG.fit,
        position: OPTIMIZATION_CONFIG.position
      })
      .jpeg({
        quality: OPTIMIZATION_CONFIG.quality,
        progressive: OPTIMIZATION_CONFIG.progressive,
        mozjpeg: OPTIMIZATION_CONFIG.mozjpeg
      })
      .toBuffer();
    
    // 4. Guardar optimizada
    const rutaOptimizada = path.join(optimizedDir, nombreArchivo);
    await fs.writeFile(rutaOptimizada, optimized);
    
    // 5. Calcular métricas
    const pesoOptimizado = optimized.length / 1024; // KB
    const reduccion = pesoOriginal > 0 
      ? ((pesoOriginal - pesoOptimizado) / pesoOriginal) * 100 
      : 0;
    
    return {
      sku,
      exito: true,
      pesoOriginalKB: parseFloat(pesoOriginal.toFixed(2)),
      pesoOptimizadoKB: parseFloat(pesoOptimizado.toFixed(2)),
      reduccionPorcentaje: parseFloat(reduccion.toFixed(2)),
      rutaOptimizada: rutaOptimizada,
      rutaRelativa: `./cache/images/optimized/${nombreArchivo}`
    };
    
  } catch (error) {
    console.warn(`⚠️  Error optimizando imagen ${sku}:`, error.message);
    return {
      sku,
      exito: false,
      error: error.message,
      rutaOptimizada: null,
      rutaRelativa: null
    };
  }
}

/**
 * Optimiza una imagen de forma segura (con manejo de errores y placeholder)
 */
async function optimizarImagenSafe(urlImagen, sku, baseDir) {
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }
  try {
    const resultado = await optimizarImagen(urlImagen, sku, baseDir);
    return resultado;
  } catch (error) {
    console.warn(`⚠️  Error con imagen ${sku}:`, error.message);
    
    // Retornar resultado con error (se usará placeholder en el template)
    return {
      sku,
      exito: false,
      error: error.message,
      rutaOptimizada: null,
      rutaRelativa: null
    };
  }
}

/**
 * Optimiza todas las imágenes de una lista de productos
 * Procesa en chunks paralelos para optimizar tiempo
 * @param {Array} productos - Array de productos con imagenUrl y sku
 * @param {string} baseDir - Directorio base del proyecto
 * @returns {Promise<Object>} Resultado con estadísticas y detalles
 */
async function optimizarImagenes(productos, baseDir) {
  // Si no se proporciona baseDir, calcularlo desde __dirname (poc-catalogo-pdf/lib/)
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }
  console.log(`📸 Iniciando optimización de ${productos.length} imágenes...`);
  
  const resultados = [];
  const productosConImagen = productos.filter(p => p.imagenUrl);
  const productosSinImagen = productos.filter(p => !p.imagenUrl);
  
  console.log(`   → ${productosConImagen.length} productos con imagen`);
  console.log(`   → ${productosSinImagen.length} productos sin imagen (usarán placeholder)`);
  
  // Procesar en chunks para no sobrecargar
  for (let i = 0; i < productosConImagen.length; i += CHUNK_SIZE) {
    const chunk = productosConImagen.slice(i, i + CHUNK_SIZE);
    const promesas = chunk.map(p => 
      optimizarImagenSafe(p.imagenUrl, p.sku || p.art_cod, baseDir)
    );
    
    const resultadosChunk = await Promise.all(promesas);
    resultados.push(...resultadosChunk);
    
    const procesados = Math.min(i + CHUNK_SIZE, productosConImagen.length);
    console.log(`   → Progreso: ${procesados}/${productosConImagen.length} imágenes procesadas`);
  }
  
  // Agregar productos sin imagen al resultado
  productosSinImagen.forEach(p => {
    resultados.push({
      sku: p.sku || p.art_cod,
      exito: false,
      error: 'Sin URL de imagen',
      rutaOptimizada: null,
      rutaRelativa: null
    });
  });
  
  // Calcular estadísticas
  const exitosas = resultados.filter(r => r.exito).length;
  const fallidas = resultados.filter(r => !r.exito).length;
  
  const exitosasConPeso = resultados.filter(r => r.exito && r.pesoOptimizadoKB);
  const pesoPromedioKB = exitosasConPeso.length > 0
    ? exitosasConPeso.reduce((sum, r) => sum + r.pesoOptimizadoKB, 0) / exitosasConPeso.length
    : 0;
  
  const reduccionPromedioPorc = exitosasConPeso.length > 0
    ? exitosasConPeso.reduce((sum, r) => sum + r.reduccionPorcentaje, 0) / exitosasConPeso.length
    : 0;
  
  console.log(`✓ Optimización completada:`);
  console.log(`   → Exitosas: ${exitosas}`);
  console.log(`   → Fallidas: ${fallidas}`);
  console.log(`   → Peso promedio: ${pesoPromedioKB.toFixed(2)} KB`);
  console.log(`   → Reducción promedio: ${reduccionPromedioPorc.toFixed(2)}%`);
  
  return {
    exitosas,
    fallidas,
    total: resultados.length,
    pesoPromedioKB: parseFloat(pesoPromedioKB.toFixed(2)),
    reduccionPromedioPorc: parseFloat(reduccionPromedioPorc.toFixed(2)),
    detalles: resultados
  };
}

/**
 * Limpia el caché de imágenes (opcional, para liberar espacio)
 */
async function limpiarCache(baseDir) {
  if (!baseDir) {
    baseDir = path.join(__dirname, '..');
  }
  const cacheDir = path.join(baseDir, 'cache/images');
  const originalDir = path.join(cacheDir, 'original');
  const optimizedDir = path.join(cacheDir, 'optimized');
  
  try {
    // Limpiar originales
    const archivosOriginales = await fs.readdir(originalDir);
    for (const archivo of archivosOriginales) {
      await fs.unlink(path.join(originalDir, archivo));
    }
    
    // Limpiar optimizadas
    const archivosOptimizados = await fs.readdir(optimizedDir);
    for (const archivo of archivosOptimizados) {
      await fs.unlink(path.join(optimizedDir, archivo));
    }
    
    console.log('✓ Caché de imágenes limpiado');
    return true;
  } catch (error) {
    console.warn('⚠️  Error limpiando caché:', error.message);
    return false;
  }
}

module.exports = {
  optimizarImagen,
  optimizarImagenSafe,
  optimizarImagenes,
  limpiarCache,
  OPTIMIZATION_CONFIG
};
