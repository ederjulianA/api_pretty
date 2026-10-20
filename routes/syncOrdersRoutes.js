// routes/syncOrdersRoutes.js
const express = require('express');
const router = express.Router();
const { syncOrdersEndpoint } = require('../controllers/syncOrdersController');
const verifyToken = require('../middlewares/auth');

// Endpoint GET para disparar la sincronización de pedidos desde WooCommerce
router.get('/', verifyToken, syncOrdersEndpoint);

module.exports = router;
