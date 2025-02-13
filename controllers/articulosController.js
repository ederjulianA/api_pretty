// controllers/articulosController.js
const articulosModel = require('../models/articulosModel');

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

module.exports = { getArticulos };
