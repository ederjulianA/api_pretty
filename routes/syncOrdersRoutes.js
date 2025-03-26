// routes/syncOrdersRoutes.js
const express = require('express');
const router = express.Router();
const { syncOrdersEndpoint } = require('../controllers/syncOrdersController');

// Endpoint GET para disparar la sincronización de pedidos desde WooCommerce
router.get('/', syncOrdersEndpoint);

module.exports = router;
