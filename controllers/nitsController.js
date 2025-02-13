// controllers/nitsController.js
const nitsModel = require('../models/nitModel');

const getNits = async (req, res) => {
  try {
    // Extraer parámetros de la query string
    const { nit_ide, nit_nom, PageNumber, PageSize } = req.query;
    
    // Validar y convertir los parámetros:
    const params = {
      nit_ide: nit_ide && nit_ide.trim() !== '' ? nit_ide : null,
      nit_nom: nit_nom && nit_nom.trim() !== '' ? nit_nom : null,
      PageNumber: PageNumber ? parseInt(PageNumber, 10) : 1,
      PageSize: PageSize ? parseInt(PageSize, 10) : 10
    };

    const nits = await nitsModel.getAllNits(params);
    res.json({success:true, nits});
  } catch (error) {
    console.error('Error al obtener Nits:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getNits };
