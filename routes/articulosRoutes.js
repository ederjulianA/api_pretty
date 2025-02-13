// routes/articulosRoutes.js
const express = require('express');
const router = express.Router();
const articulosController = require('../controllers/articulosController');

// Endpoint GET para consulta de artículos
// Ejemplo de uso:
// GET /api/articulos?nombre=rubyface&inv_gru_cod=9&PageNumber=1&PageSize=50
router.get('/', articulosController.getArticulos);

module.exports = router;
