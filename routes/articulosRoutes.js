// routes/articulosRoutes.js

const express = require('express');
const verifyToken = require('../middlewares/auth'); // Importar el middleware

const router = express.Router();
const articulosController = require('../controllers/articulosController');
const {
    validateArticuloEndpoint,
    createArticuloEndpoint,
    getArticuloEndpoint,
    updateArticuloEndpoint,
    getArticuloByArtCodEndPoint,
    getNextArticuloCodigoEndpoint
} = require('../controllers/articulosController');

// Endpoint GET para consulta de artículos
// Ejemplo de uso:
// GET /api/articulos?nombre=rubyface&inv_gru_cod=9&PageNumber=1&PageSize=50
router.get('/', verifyToken, articulosController.getArticulos);

// Ejemplo de URL: GET /api/articulos/validar?art_cod=ART001
router.get('/validar', verifyToken, validateArticuloEndpoint);

// Endpoint para obtener siguiente código disponible
router.get('/next-codigo/generate', verifyToken, getNextArticuloCodigoEndpoint);

// Endpoint POST para crear un nuevo artículo
router.post('/', verifyToken, createArticuloEndpoint);

// Endpoints para obtener y actualizar artículos
router.get('/articulo/:art_cod', verifyToken, getArticuloByArtCodEndPoint);
router.get('/:id_articulo', verifyToken, getArticuloEndpoint);
router.put('/:id_articulo', verifyToken, updateArticuloEndpoint);

module.exports = router;
