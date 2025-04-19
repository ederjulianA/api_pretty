// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { updateOrderEndpoint, getOrdenesEndpoint } = require('../controllers/orderController');
const { anularDocumentoEndpoint } = require('../controllers/orderController');

// Endpoint POST para crear la orden completa (encabezado y detalle)
router.post('/', orderController.createCompleteOrder);
router.get('/:fac_nro', orderController.getOrder);
// Endpoint GET para obtener el listado de pedidos
router.get('/', getOrdenesEndpoint);
// Endpoint PUT para actualizar un pedido: /api/order/{fac_nro}
router.put('/:fac_nro', updateOrderEndpoint);
router.post('/anular', anularDocumentoEndpoint);

module.exports = router;