// routes/articulosRoutes.js

const express = require('express');
const verifyToken = require('../middlewares/auth'); // Importar el middleware

const router = express.Router();
const articulosController = require('../controllers/articulosController');
const { validateArticuloEndpoint } = require('../controllers/articulosController');
const { createArticuloEndpoint, getArticuloEndpoint, updateArticuloEndpoint, getArticuloByArtCodEndPoint } = require('../controllers/articulosController');

// Endpoint GET para consulta de artículos
// Ejemplo de uso:
// GET /api/articulos?nombre=rubyface&inv_gru_cod=9&PageNumber=1&PageSize=50
router.get('/', verifyToken, articulosController.getArticulos);

// Ejemplo de URL: GET /api/articulos/validar?art_cod=ART001
router.get('/validar', validateArticuloEndpoint);

// Endpoint POST para crear un nuevo artículo
router.post('/', createArticuloEndpoint);

router.get('/:id_articulo', getArticuloEndpoint);
router.put('/:id_articulo', updateArticuloEndpoint);
router.get('/articulo/:art_cod', getArticuloByArtCodEndPoint);

module.exports = router;
