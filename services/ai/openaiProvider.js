// services/ai/openaiProvider.js
// Cliente para interactuar con OpenAI API

require('dotenv').config();
const OpenAI = require('openai');

// Cliente OpenAI (inicialización lazy)
let openai = null;

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
const DEFAULT_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;
const DEFAULT_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS) || 2000;

/**
 * Obtiene o inicializa el cliente OpenAI
 * @returns {OpenAI} Cliente OpenAI
 */
const getOpenAIClient = () => {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API Key no configurada. Verifica OPENAI_API_KEY en .env');
    }
    openai = new OpenAI({
      apiKey: apiKey
    });
  }
  return openai;
};

/**
 * Genera contenido usando OpenAI
 * @param {string} prompt - Prompt para la IA
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Respuesta de OpenAI con contenido y métricas
 */
const generateContent = async (prompt, options = {}) => {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    max_tokens = DEFAULT_MAX_TOKENS,
    response_format = { type: 'json_object' }
  } = options;

  try {
    const client = getOpenAIClient();
    const startTime = Date.now();

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'Eres un experto copywriter para e-commerce. Responde siempre en formato JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens,
      response_format
    });

    const latency = Date.now() - startTime;
    const message = completion.choices[0].message.content;
    const usage = completion.usage;

    // Calcular costo aproximado (precios de GPT-4 Turbo)
    const costoUSD = calculateCost(model, usage);

    return {
      content: message,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens
      },
      costo_usd: costoUSD,
      latency_ms: latency,
      model: model
    };
  } catch (error) {
    console.error('[OpenAI Provider] Error generando contenido:', error);
    throw new Error(`Error en OpenAI: ${error.message}`);
  }
};

/**
 * Calcula el costo aproximado según el modelo y tokens usados
 * @param {string} model - Modelo usado
 * @param {Object} usage - Uso de tokens
 * @returns {number} Costo en USD
 */
const calculateCost = (model, usage) => {
  // Precios aproximados por 1M tokens (febrero 2026)
  const pricing = {
    'gpt-4-turbo-preview': {
      input: 10 / 1000000,  // $10 por 1M tokens input
      output: 30 / 1000000  // $30 por 1M tokens output
    },
    'gpt-4': {
      input: 30 / 1000000,
      output: 60 / 1000000
    },
    'gpt-3.5-turbo': {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000
    }
  };

  const modelPricing = pricing[model] || pricing['gpt-4-turbo-preview'];
  
  const inputCost = (usage.prompt_tokens || 0) * modelPricing.input;
  const outputCost = (usage.completion_tokens || 0) * modelPricing.output;
  
  return parseFloat((inputCost + outputCost).toFixed(6));
};

/**
 * Valida que la API key esté configurada
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '';
};

module.exports = {
  generateContent,
  calculateCost,
  isConfigured,
  DEFAULT_MODEL
};
