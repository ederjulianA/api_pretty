// services/ai/aiService.js
// Orquestador principal para servicios de IA

const openaiProvider = require('./openaiProvider');
const promptBuilder = require('./promptBuilder');
const aiOptimizationModel = require('../../models/aiOptimizationModel');

/**
 * Verifica el presupuesto mensual antes de generar contenido
 * @returns {Promise<boolean>} true si está dentro del presupuesto
 */
const checkBudget = async () => {
  try {
    const monthlyBudget = parseFloat(process.env.AI_BUDGET_MONTHLY_USD) || 100;
    const alertThreshold = parseFloat(process.env.AI_BUDGET_ALERT_THRESHOLD) || 0.8;
    const pauseAtLimit = process.env.AI_BUDGET_PAUSE_AT_LIMIT === 'true';

    const currentMonthCost = await aiOptimizationModel.getMonthlyCost();
    
    if (currentMonthCost >= monthlyBudget) {
      if (pauseAtLimit) {
        throw new Error(`Presupuesto mensual de IA excedido ($${monthlyBudget} USD)`);
      }
      console.warn(`[AI Service] Presupuesto mensual alcanzado: $${currentMonthCost} USD`);
    } else if (currentMonthCost >= monthlyBudget * alertThreshold) {
      console.warn(`[AI Service] Presupuesto al ${(currentMonthCost / monthlyBudget * 100).toFixed(0)}%: $${currentMonthCost} / $${monthlyBudget} USD`);
    }

    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Verifica cache por hash de prompt
 * @param {string} promptHash - Hash del prompt
 * @param {number} maxAgeDays - Días máximos de antigüedad (default: 30)
 * @returns {Promise<Object|null>} Contenido cacheado o null
 */
const checkCache = async (promptHash, maxAgeDays = 30) => {
  if (process.env.AI_CACHE_ENABLED !== 'true') {
    return null;
  }

  try {
    const cached = await aiOptimizationModel.getCachedContent(promptHash, maxAgeDays);
    if (cached) {
      console.log(`[AI Service] Cache hit para hash: ${promptHash.substring(0, 8)}...`);
      return cached;
    }
    return null;
  } catch (error) {
    console.error('[AI Service] Error verificando cache:', error);
    return null;
  }
};

/**
 * Optimiza contenido completo de un producto
 * @param {Object} producto - Datos del producto
 * @param {Object} options - Opciones de optimización
 * @returns {Promise<Object>} Contenido optimizado
 */
const optimizeProduct = async (producto, options = {}) => {
  const {
    modelo = openaiProvider.DEFAULT_MODEL,
    categoria = null,
    idioma = 'es',
    tipos = ['all'] // ['all'] o ['titulo_seo', 'meta_description', etc.]
  } = options;

  try {
    // Verificar presupuesto
    await checkBudget();

    // Verificar que OpenAI esté configurado
    if (!openaiProvider.isConfigured()) {
      throw new Error('OpenAI API Key no configurada. Verifica OPENAI_API_KEY en .env');
    }

    // Construir prompt
    const prompt = promptBuilder.buildProductPrompt(producto, categoria);
    const promptHash = promptBuilder.generatePromptHash(prompt);

    // Verificar cache
    const cached = await checkCache(promptHash);
    if (cached) {
      return JSON.parse(cached.ai_contenido);
    }

    // Generar contenido con OpenAI
    console.log(`[AI Service] Generando contenido para producto: ${producto.art_nom}`);
    const aiResponse = await openaiProvider.generateContent(prompt, { model: modelo });

    // Parsear respuesta JSON
    let contenido;
    try {
      contenido = JSON.parse(aiResponse.content);
    } catch (parseError) {
      console.error('[AI Service] Error parseando JSON de OpenAI:', parseError);
      throw new Error('Respuesta de IA no es JSON válido');
    }

    // Validar estructura básica
    if (!contenido.titulo_seo && !contenido.meta_description) {
      throw new Error('Contenido generado no tiene estructura válida');
    }

    // Post-procesar HTML para bundles: insertar imágenes de componentes si no están presentes
    if (producto.es_bundle && producto.componentes && producto.componentes.length > 0) {
      contenido = postProcessBundleHTML(contenido, producto.componentes);
    }

    // Guardar en base de datos con estado Pendiente
    const savedContent = await aiOptimizationModel.saveContent({
      art_sec: producto.art_sec,
      ai_tipo: 'completo',
      ai_contenido: JSON.stringify(contenido),
      ai_modelo: modelo,
      ai_prompt_hash: promptHash,
      ai_tokens_usados: aiResponse.usage.total_tokens,
      ai_costo_usd: aiResponse.costo_usd,
      ai_idioma: idioma,
      ai_estado: 'P' // Pendiente de aprobación
    });

    // Guardar en log de uso
    await aiOptimizationModel.logUsage({
      ai_sec: savedContent.ai_sec,
      log_evento: 'generacion',
      log_modelo: modelo,
      log_tokens_input: aiResponse.usage.prompt_tokens,
      log_tokens_output: aiResponse.usage.completion_tokens,
      log_costo_usd: aiResponse.costo_usd,
      log_latencia_ms: aiResponse.latency_ms
    });

    return contenido;
  } catch (error) {
    console.error('[AI Service] Error optimizando producto:', error);
    throw error;
  }
};

/**
 * Post-procesa el HTML generado para bundles, insertando imágenes de componentes si no están presentes
 * @param {Object} contenido - Contenido generado por IA
 * @param {Array} componentes - Array de componentes del bundle con imágenes
 * @returns {Object} Contenido con HTML procesado
 */
const postProcessBundleHTML = (contenido, componentes) => {
  if (!contenido.descripcion_larga_html) {
    return contenido;
  }

  // Verificar si ya hay imágenes en el HTML
  const tieneImagenes = contenido.descripcion_larga_html.includes('<img');
  
  // Si no tiene imágenes y hay componentes con imágenes, insertarlas
  if (!tieneImagenes && componentes.some(c => c.imagen_url)) {
    const { formatComponentesInfo } = require('../../config/promptTemplates');
    const componentesInfo = formatComponentesInfo(componentes);
    
    // Buscar un lugar apropiado para insertar la sección de componentes
    // Intentar insertar después de la primera sección o antes de "Características Destacadas"
    let html = contenido.descripcion_larga_html;
    
    // Buscar si hay una sección de características o lista
    const caracteristicasIndex = html.indexOf('<h3>Características');
    const ulIndex = html.indexOf('<ul>');
    const insertIndex = caracteristicasIndex > -1 ? caracteristicasIndex : (ulIndex > -1 ? ulIndex : html.length);
    
    // Insertar la sección de componentes con imágenes
    const componentesSection = componentesInfo.info_html;
    html = html.slice(0, insertIndex) + componentesSection + html.slice(insertIndex);
    
    contenido.descripcion_larga_html = html;
    console.log('[AI Service] Imágenes de componentes insertadas en HTML del bundle');
  }
  
  return contenido;
};

/**
 * Genera múltiples versiones de contenido para A/B testing
 * @param {Object} producto - Datos del producto
 * @param {Object} options - Opciones
 * @returns {Promise<Array>} Array de versiones generadas
 */
const generateMultipleVersions = async (producto, options = {}) => {
  const { count = 3, categoria = null } = options;
  const versions = [];

  for (let i = 0; i < count; i++) {
    try {
      const contenido = await optimizeProduct(producto, { categoria });
      versions.push(contenido);
      // Pequeña pausa entre generaciones
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[AI Service] Error generando versión ${i + 1}:`, error);
    }
  }

  return versions;
};

module.exports = {
  optimizeProduct,
  generateMultipleVersions,
  checkBudget,
  checkCache
};
