// services/ai/promptBuilder.js
// Constructor de prompts para diferentes tipos de contenido

const { buildPrompt } = require('../../config/promptTemplates');
const crypto = require('crypto');

/**
 * Construye el prompt principal para optimización completa de producto
 * @param {Object} producto - Datos del producto
 * @param {string} categoria - Categoría del producto
 * @returns {string} Prompt completo
 */
const buildProductPrompt = (producto, categoria = null) => {
  return buildPrompt(producto, categoria);
};

/**
 * Genera hash SHA256 del prompt para cache
 * @param {string} prompt - Prompt completo
 * @returns {string} Hash hexadecimal
 */
const generatePromptHash = (prompt) => {
  return crypto.createHash('sha256').update(prompt).digest('hex');
};

/**
 * Construye prompt para tipo específico de contenido
 * @param {Object} producto - Datos del producto
 * @param {string} tipo - Tipo de contenido ('titulo_seo', 'meta_desc', etc.)
 * @param {string} categoria - Categoría del producto
 * @returns {string} Prompt específico
 */
const buildSpecificPrompt = (producto, tipo, categoria = null) => {
  const basePrompt = buildProductPrompt(producto, categoria);
  
  // Agregar instrucciones específicas según el tipo
  const specificInstructions = {
    'titulo_seo': '\n\nENFOQUE: Genera SOLO el campo "titulo_seo" con máximo 60 caracteres.',
    'meta_description': '\n\nENFOQUE: Genera SOLO el campo "meta_description" con máximo 160 caracteres.',
    'descripcion_corta': '\n\nENFOQUE: Genera SOLO el campo "descripcion_corta" (2-3 líneas).',
    'bullet_points': '\n\nENFOQUE: Genera SOLO el campo "bullet_points" con 5-7 elementos.'
  };
  
  return basePrompt + (specificInstructions[tipo] || '');
};

module.exports = {
  buildProductPrompt,
  generatePromptHash,
  buildSpecificPrompt
};
