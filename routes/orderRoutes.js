// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Endpoint POST para crear la orden completa (encabezado y detalle)
router.post('/', orderController.createCompleteOrder);

module.exports = router;
