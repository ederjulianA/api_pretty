// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { updateOrderEndpoint, getOrdenesEndpoint } = require('../controllers/orderController');
const { anularDocumentoEndpoint } = require('../controllers/orderController');
const verifyToken = require('../middlewares/auth');

// Endpoint POST para crear la orden completa (encabezado y detalle)
router.post('/', verifyToken, orderController.createCompleteOrder);
router.get('/:fac_nro', verifyToken, orderController.getOrder);
// Endpoint GET para obtener el listado de pedidos
router.get('/', verifyToken, getOrdenesEndpoint);
// Endpoint PUT para actualizar un pedido: /api/order/{fac_nro}
router.put('/:fac_nro', verifyToken, updateOrderEndpoint);
router.post('/anular', verifyToken, anularDocumentoEndpoint);

module.exports = router;