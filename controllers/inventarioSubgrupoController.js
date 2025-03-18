// controllers/inventarioSubgrupoController.js
const { getInventarioSubgrupos } = require('../models/inventarioSubgrupoModel');

const getInventarioSubgruposEndpoint = async (req, res) => {
  try {
    // Recibir el parámetro opcional inv_gru_cod de la query string
    const { inv_gru_cod } = req.query;
    const subgrupos = await getInventarioSubgrupos(inv_gru_cod);
    return res.json({ success: true, subcategorias: subgrupos });
  } catch (error) {
    console.error("Error al obtener subcategorias:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getInventarioSubgruposEndpoint };
