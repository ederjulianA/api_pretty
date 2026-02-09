// utils/variationUtils.js
const { poolPromise, sql } = require('../db');

/**
 * Valida atributos de variacion
 * @param {Object} attributes - Objeto con atributos {Tono: "Rojo Pasion"}
 * @returns {boolean}
 */
const validateVariationAttributes = (attributes) => {
  if (!attributes || typeof attributes !== 'object') {
    return false;
  }

  // Para esta fase, solo permitimos el atributo "Tono"
  const allowedAttributes = ['Tono', 'Color'];
  const attributeKeys = Object.keys(attributes);

  if (attributeKeys.length === 0) {
    return false;
  }

  // Verificar que todos los atributos sean permitidos
  return attributeKeys.every(key => allowedAttributes.includes(key));
};

/**
 * Genera SKU para variacion basado en el codigo padre y atributos
 * IMPORTANTE: art_cod tiene limite de VARCHAR(30)
 * @param {string} parentCode - Codigo del producto padre
 * @param {Object} attributes - Atributos de la variacion
 * @returns {string} SKU generado (max 30 caracteres)
 */
const generateVariationSKU = (parentCode, attributes) => {
  const tono = attributes.Tono || attributes.Color;
  if (!tono) {
    throw new Error('Se requiere atributo Tono o Color para generar SKU');
  }

  // Convertir tono a slug (ej: "Rojo Pasion" -> "ROJO-PASION")
  const tonoSlug = tono
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');

  let sku = `${parentCode}-${tonoSlug}`;

  // CRITICO: art_cod es VARCHAR(30), truncar si excede
  if (sku.length > 30) {
    const maxTonoLength = 30 - parentCode.length - 1; // -1 por el guion
    if (maxTonoLength < 3) {
      throw new Error(`Codigo padre "${parentCode}" es demasiado largo para generar SKU de variacion`);
    }
    sku = `${parentCode}-${tonoSlug.substring(0, maxTonoLength)}`;
  }

  return sku;
};

/**
 * Obtiene todas las variaciones de un producto padre
 * @param {string} parentArtSec - art_sec del producto padre (VARCHAR(30))
 * @returns {Promise<Array>}
 */
const getProductVariations = async (parentArtSec) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('parent_art_sec', sql.VarChar(30), parentArtSec)
      .query(`
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          a.art_woo_variation_id,
          a.art_variation_attributes,
          ad1.art_bod_pre AS precio_detal,
          ad2.art_bod_pre AS precio_mayor,
          ISNULL(e.existencia, 0) AS existencia
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad1
          ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2
          ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        LEFT JOIN dbo.vwExistencias e
          ON a.art_sec = e.art_sec
        WHERE a.art_sec_padre = @parent_art_sec
          AND a.art_woo_type = 'variation'
        ORDER BY a.art_cod
      `);

    return result.recordset.map(record => ({
      ...record,
      art_variation_attributes: record.art_variation_attributes
        ? JSON.parse(record.art_variation_attributes)
        : null
    }));
  } catch (error) {
    console.error('Error obteniendo variaciones:', error);
    throw error;
  }
};

/**
 * Verifica si un producto es variable (padre)
 * @param {string} artSec - art_sec VARCHAR(30)
 * @returns {Promise<boolean>}
 */
const isVariableProduct = async (artSec) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), artSec)
      .query('SELECT art_woo_type FROM dbo.articulos WHERE art_sec = @art_sec');

    return result.recordset.length > 0 &&
           result.recordset[0].art_woo_type === 'variable';
  } catch (error) {
    console.error('Error verificando si es producto variable:', error);
    throw error;
  }
};

/**
 * Obtiene informacion del producto padre de una variacion
 * @param {string} variationArtSec
 * @returns {Promise<Object|null>}
 */
const getParentProduct = async (variationArtSec) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('variation_art_sec', sql.VarChar(30), variationArtSec)
      .query(`
        SELECT
          parent.art_sec,
          parent.art_cod,
          parent.art_nom,
          parent.art_woo_id,
          parent.art_woo_type
        FROM dbo.articulos variation
        INNER JOIN dbo.articulos parent
          ON variation.art_sec_padre = parent.art_sec
        WHERE variation.art_sec = @variation_art_sec
          AND variation.art_woo_type = 'variation'
      `);

    return result.recordset.length > 0 ? result.recordset[0] : null;
  } catch (error) {
    console.error('Error obteniendo producto padre:', error);
    throw error;
  }
};

/**
 * Verifica si un SKU ya existe
 * @param {string} sku
 * @returns {Promise<boolean>}
 */
const skuExists = async (sku) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_cod', sql.VarChar(30), sku)
      .query('SELECT COUNT(*) AS count FROM dbo.articulos WHERE art_cod = @art_cod');

    return result.recordset[0].count > 0;
  } catch (error) {
    console.error('Error verificando existencia de SKU:', error);
    throw error;
  }
};

module.exports = {
  validateVariationAttributes,
  generateVariationSKU,
  getProductVariations,
  isVariableProduct,
  getParentProduct,
  skuExists
};
