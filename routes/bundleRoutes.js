/**
 * Rutas de artículos armados (bundles).
 * Base: /api/bundles
 */

const express = require('express');
const router = express.Router();
const bundleController = require('../controllers/bundleController.js');

router.post('/', bundleController.createBundle);
router.get('/:art_sec/componentes', bundleController.getComponentes);
router.put('/:art_sec/componentes', bundleController.updateComponentes);
router.post('/:art_sec/validar-stock', bundleController.validarStock);

module.exports = router;
