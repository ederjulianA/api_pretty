// routes/inventarioSubgrupoRoutes.js
const express = require('express');
const router = express.Router();
const { getInventarioSubgruposEndpoint } = require('../controllers/inventarioSubgrupoController');

// Endpoint GET para obtener el listado de subcategorías, con filtro opcional por inv_gru_cod
router.get('/', getInventarioSubgruposEndpoint);

module.exports = router;
 