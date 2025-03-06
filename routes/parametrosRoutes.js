const express = require('express');
const router = express.Router();
const { getPedidoMinimoEndPoint } = require('../controllers/parametrosController');


router.get('/pedido-minimo',getPedidoMinimoEndPoint);

module.exports = router;