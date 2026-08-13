/**
 * Rutas de artículos armados (bundles).
 * Base: /api/bundles
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');
const bundleController = require('../controllers/bundleController.js');

router.post('/', verifyToken, bundleController.createBundle);
router.get('/:art_sec/componentes', verifyToken, bundleController.getComponentes);
router.put('/:art_sec/componentes', verifyToken, bundleController.updateComponentes);
router.post('/:art_sec/validar-stock', verifyToken, bundleController.validarStock);

module.exports = router;
