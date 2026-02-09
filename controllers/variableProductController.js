// controllers/variableProductController.js
const {
  createVariableProduct,
  createProductVariation,
  syncVariableProductAttributes
} = require('../models/articulosModel');
const { getProductVariations } = require('../utils/variationUtils');

/**
 * Crea un producto variable (padre)
 * POST /api/articulos/variable
 */
const createVariable = async (req, res) => {
  try {
    const {
      art_nom,
      art_cod,
      categoria,
      subcategoria,
      precio_detal_referencia,
      precio_mayor_referencia
    } = req.body;

    // Parsear attributes si viene como string (desde form-data de Postman)
    let attributes;
    try {
      attributes = typeof req.body.attributes === 'string'
        ? JSON.parse(req.body.attributes)
        : req.body.attributes;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'El campo attributes debe ser un JSON válido'
      });
    }

    if (!art_nom || !art_cod || !subcategoria || !attributes) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: art_nom, art_cod, subcategoria, attributes'
      });
    }

    // express-fileupload: extraer imagenes nombradas (image1, image2, etc.)
    const image1 = req.files?.image1;
    const image2 = req.files?.image2;
    const image3 = req.files?.image3;
    const image4 = req.files?.image4;
    const images = [image1, image2, image3, image4].filter(item => item !== undefined);

    const result = await createVariableProduct({
      art_nom,
      art_cod,
      categoria,
      subcategoria,
      precio_detal_referencia,
      precio_mayor_referencia,
      attributes,
      images
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en createVariable:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear producto variable',
      error: error.message || error.error
    });
  }
};

/**
 * Crea una variacion de un producto variable
 * POST /api/articulos/variable/:parent_art_sec/variations
 */
const createVariation = async (req, res) => {
  try {
    const { parent_art_sec } = req.params;
    const {
      art_nom,
      precio_detal,
      precio_mayor
    } = req.body;

    // Parsear attributes si viene como string (desde form-data de Postman)
    let attributes;
    try {
      attributes = typeof req.body.attributes === 'string'
        ? JSON.parse(req.body.attributes)
        : req.body.attributes;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'El campo attributes debe ser un JSON válido'
      });
    }

    if (!parent_art_sec || !art_nom || !attributes || !precio_detal || !precio_mayor) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: parent_art_sec, art_nom, attributes, precio_detal, precio_mayor'
      });
    }

    // express-fileupload: extraer imagenes nombradas
    const image1 = req.files?.image1;
    const image2 = req.files?.image2;
    const image3 = req.files?.image3;
    const image4 = req.files?.image4;
    const images = [image1, image2, image3, image4].filter(item => item !== undefined);

    const result = await createProductVariation({
      parent_art_sec,
      art_nom,
      attributes,
      precio_detal,
      precio_mayor,
      images
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en createVariation:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear variacion',
      error: error.message || error.error
    });
  }
};

/**
 * Obtiene todas las variaciones de un producto variable
 * GET /api/articulos/variable/:parent_art_sec/variations
 */
const getVariations = async (req, res) => {
  try {
    const { parent_art_sec } = req.params;

    if (!parent_art_sec) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere parent_art_sec'
      });
    }

    const variations = await getProductVariations(parent_art_sec);

    res.json({
      success: true,
      count: variations.length,
      data: variations
    });
  } catch (error) {
    console.error('Error en getVariations:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener variaciones',
      error: error.message
    });
  }
};

/**
 * Sincroniza los atributos de un producto variable con WooCommerce
 * PUT /api/articulos/variable/:parent_art_sec/sync-attributes
 */
const syncAttributes = async (req, res) => {
  try {
    const { parent_art_sec } = req.params;

    if (!parent_art_sec) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere parent_art_sec'
      });
    }

    const result = await syncVariableProductAttributes(parent_art_sec);

    res.json(result);
  } catch (error) {
    console.error('Error en syncAttributes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar atributos',
      error: error.message || error.error
    });
  }
};

module.exports = {
  createVariable,
  createVariation,
  getVariations,
  syncAttributes
};
