// routes/ciudadesRoutes.js
const express = require('express');
const router = express.Router();
const { getCiudadesEndpoint } = require('../controllers/ciudadesController');
const verifyToken = require('../middlewares/auth');

// Endpoint GET para obtener el listado de ciudades
router.get('/', verifyToken, getCiudadesEndpoint);

module.exports = router;
