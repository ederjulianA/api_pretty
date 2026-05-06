const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');
const {
    getPedidoMinimoEndPoint,
    getAllParametrosEndpoint,
    getParametroByCodEndpoint,
    updateParametroEndpoint,
    getDatosPagoCotizacionEndpoint
} = require('../controllers/parametrosController');

// Rutas específicas — deben ir ANTES de /:par_cod
router.get('/pedido-minimo', verifyToken, getPedidoMinimoEndPoint);
router.get('/datos-pago-cotizacion', verifyToken, getDatosPagoCotizacionEndpoint);

// Rutas generales de parámetros
router.get('/', verifyToken, getAllParametrosEndpoint);
router.get('/:par_cod', verifyToken, getParametroByCodEndpoint);
router.put('/:par_cod', verifyToken, updateParametroEndpoint);

module.exports = router;