// controllers/articulosController.js
const articulosModel = require('../models/articulosModel');
const { validateArticulo , createArticulo,getArticulo ,updateArticuloEndpoint } = require('../models/articulosModel');


const updateArticuloEndpoint = async (req, res) => {
  try {
    const { id_articulo } = req.params;
    const { art_cod, art_nom, inv_gru_cod, inv_sub_gru_cod, art_woo_id, precio_detal, precio_mayor } = req.body;

    if (!id_articulo || !art_cod || !art_nom || !inv_gru_cod || !inv_sub_gru_cod || !art_woo_id || precio_detal == null || precio_mayor == null) {
      return res.status(400).json({
        success: false,
        error: "Todos los campos son requeridos: art_cod, art_nom, inv_gru_cod, inv_sub_gru_cod, art_woo_id, precio_detal y precio_mayor."
      });
    }

    const result = await updateArticulo({
      id_articulo,
      art_cod,
      art_nom,
      inv_gru_cod,
      inv_sub_gru_cod,
      art_woo_id,
      precio_detal,
      precio_mayor
    });

const createArticuloEndpoint = async (req, res) => {
  try {
    const { art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal, precio_mayor } = req.body;
    
    // Validar que se envíen todos los campos requeridos
    if (!art_cod || !art_nom || !categoria || !subcategoria || !art_woo_id || precio_detal == null || precio_mayor == null) {
      return res.status(400).json({ success: false, error: "Todos los campos son requeridos: art_cod, art_nom, inv_gru_cod, inv_sub_gru_cod, art_woo_id, precio_detal y precio_mayor." });
    }
    
    const result = await createArticulo({ art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal, precio_mayor });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error("Error al crear artículo:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};


const validateArticuloEndpoint = async (req, res) => {
  try {
    const { art_cod, art_woo_id } = req.query;
    
    if (!art_cod && !art_woo_id) {
      return res.status(400).json({ success: false, error: "Se debe proporcionar al menos art_cod o art_woo_id." });
    }

    const exists = await validateArticulo({ art_cod, art_woo_id });
    return res.json({ success: true, exists });
  } catch (error) {
    console.error("Error al validar artículo:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getArticulos = async (req, res) => {
  try {
    // Extraer parámetros de la query string
    const { codigo, nombre, inv_gru_cod, inv_sub_gru_cod, tieneExistencia, PageNumber, PageSize } = req.query;
    
    // Convertir y validar los parámetros:
    // - Si el parámetro es una cadena vacía, se asigna null.
    // - Para tieneExistencia se convierte a 1 o 0 (aceptando también "true" o "false").
    const params = {
      codigo: codigo && codigo.trim() !== '' ? codigo : null,
      nombre: nombre && nombre.trim() !== '' ? nombre : null,
      inv_gru_cod: inv_gru_cod && inv_gru_cod.trim() !== '' ? inv_gru_cod : null,
      inv_sub_gru_cod: inv_sub_gru_cod && inv_sub_gru_cod.trim() !== '' ? inv_sub_gru_cod : null,
      tieneExistencia: (typeof tieneExistencia !== 'undefined' && tieneExistencia !== '')
                        ? (tieneExistencia === '1' || tieneExistencia.toLowerCase() === 'true' ? 1 : 0)
                        : null,
      PageNumber: PageNumber ? parseInt(PageNumber, 10) : 1,
      PageSize: PageSize ? parseInt(PageSize, 10) : 10
    };

    const articulos = await articulosModel.getArticulos(params);
    res.json({success:true,articulos});
  } catch (error) {
    console.error('Error al obtener artículos:', error);
    res.status(500).json({success:false, error: error.message });
  }
};

module.exports = { getArticulos, validateArticuloEndpoint, createArticuloEndpoint   };
