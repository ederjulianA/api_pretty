/**
 * Controller de artículos armados (bundles).
 * Referencia: implementaciones_2026/articulos_bundle/
 */

const bundleModel = require('../models/bundleModel.js');

/**
 * POST /api/bundles
 * Content-Type: multipart/form-data
 * Body: art_nom, art_cod, inv_sub_gru_cod, precio_detal, precio_mayor, componentes (JSON string), image1, image2, image3, image4
 */
const createBundle = async (req, res) => {
  try {
    const { art_nom, art_cod, inv_sub_gru_cod, subcategoria, precio_detal, precio_mayor, componentes } = req.body;

    if (!art_nom || !art_cod) {
      return res.status(400).json({
        success: false,
        error: 'Faltan art_nom y/o art_cod.'
      });
    }

    const subcategoriaId = inv_sub_gru_cod != null ? inv_sub_gru_cod : subcategoria;
    if (subcategoriaId == null) {
      return res.status(400).json({
        success: false,
        error: 'Debe enviar inv_sub_gru_cod o subcategoria.'
      });
    }

    if (precio_detal == null || precio_mayor == null) {
      return res.status(400).json({
        success: false,
        error: 'Faltan precio_detal y/o precio_mayor.'
      });
    }

    // Parsear componentes (viene como JSON string cuando se envía FormData)
    let componentesParsed;
    try {
      componentesParsed = typeof componentes === 'string' ? JSON.parse(componentes) : componentes;
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'El campo componentes debe ser un JSON válido.'
      });
    }

    if (!Array.isArray(componentesParsed) || componentesParsed.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe enviar un arreglo de componentes con al menos un ítem { art_sec, cantidad }.'
      });
    }

    // Imágenes desde req.files (express-fileupload)
    const image1 = req.files?.image1;
    const image2 = req.files?.image2;
    const image3 = req.files?.image3;
    const image4 = req.files?.image4;
    const images = [image1, image2, image3, image4].filter(item => item !== undefined);

    const result = await bundleModel.createBundle({
      art_nom,
      art_cod,
      inv_sub_gru_cod: subcategoriaId,
      precio_detal: Number(precio_detal),
      precio_mayor: Number(precio_mayor),
      componentes: componentesParsed.map(c => ({
        art_sec: c.art_sec,
        cantidad: parseInt(c.cantidad, 10) || 1
      })),
      images
    });

    res.status(201).json({
      success: true,
      message: 'Bundle creado exitosamente.',
      data: result
    });
  } catch (error) {
    console.error('Error al crear bundle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/bundles/:art_sec/componentes
 */
const getComponentes = async (req, res) => {
  try {
    const { art_sec } = req.params;
    if (!art_sec) {
      return res.status(400).json({ success: false, error: 'art_sec es requerido.' });
    }

    const data = await bundleModel.getBundleComponents(art_sec);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Artículo no encontrado.' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener componentes del bundle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/bundles/:art_sec/componentes
 * Body: { componentes: [{ art_sec, cantidad }] }
 */
const updateComponentes = async (req, res) => {
  try {
    const { art_sec } = req.params;
    const { componentes } = req.body;

    if (!art_sec) {
      return res.status(400).json({ success: false, error: 'art_sec es requerido.' });
    }

    const list = Array.isArray(componentes) ? componentes : [];
    const result = await bundleModel.updateBundleComponents(art_sec, list.map(c => ({
      art_sec: c.art_sec,
      cantidad: parseInt(c.cantidad, 10) || 1
    })));

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error al actualizar componentes del bundle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/bundles/:art_sec/validar-stock
 * Body: { cantidad_bundle: number }
 */
const validarStock = async (req, res) => {
  try {
    const { art_sec } = req.params;
    const { cantidad_bundle } = req.body;

    if (!art_sec) {
      return res.status(400).json({ success: false, error: 'art_sec es requerido.' });
    }

    const result = await bundleModel.validateBundleStock(art_sec, cantidad_bundle);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error al validar stock del bundle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createBundle,
  getComponentes,
  updateComponentes,
  validarStock
};
