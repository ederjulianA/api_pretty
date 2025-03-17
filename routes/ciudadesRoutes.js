// routes/ciudadesRoutes.js
const express = require('express');
const router = express.Router();
const { getCiudadesEndpoint } = require('../controllers/ciudadesController');

// Endpoint GET para obtener el listado de ciudades
router.get('/', getCiudadesEndpoint);

module.exports = router;
