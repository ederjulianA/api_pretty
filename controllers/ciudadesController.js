// controllers/ciudadesController.js
const { getCiudades } = require('../models/ciudadesModel');

const getCiudadesEndpoint = async (req, res) => {
  try {
    const ciudades = await getCiudades();
    return res.json({ success: true, ciudades });
  } catch (error) {
    console.error("Error al obtener ciudades:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getCiudadesEndpoint };
