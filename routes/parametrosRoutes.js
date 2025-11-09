const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');
const { 
    getPedidoMinimoEndPoint,
    getAllParametrosEndpoint,
    getParametroByCodEndpoint,
    updateParametroEndpoint
} = require('../controllers/parametrosController');

// Ruta específica para pedido mínimo (debe ir antes de la ruta genérica)
router.get('/pedido-minimo', verifyToken, getPedidoMinimoEndPoint);

// Rutas generales de parámetros
router.get('/', verifyToken, getAllParametrosEndpoint);
router.get('/:par_cod', verifyToken, getParametroByCodEndpoint);
router.put('/:par_cod', verifyToken, updateParametroEndpoint);

module.exports = router;