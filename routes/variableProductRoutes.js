// routes/variableProductRoutes.js

const express = require('express');
const verifyToken = require('../middlewares/auth');
const {
  createVariable,
  createVariation,
  getVariations,
  syncAttributes,
  convertToVariable,
  updateVariation,
  deleteVariation
} = require('../controllers/variableProductController');

const router = express.Router();

// POST /api/articulos/variable - Crear producto variable (padre)
router.post('/', verifyToken, createVariable);

// POST /api/articulos/variable/:parent_art_sec/variations - Crear variacion
router.post('/:parent_art_sec/variations', verifyToken, createVariation);

// GET /api/articulos/variable/:parent_art_sec/variations - Obtener variaciones
router.get('/:parent_art_sec/variations', verifyToken, getVariations);

// PUT /api/articulos/variable/:parent_art_sec/sync-attributes - Sincronizar atributos con WooCommerce
router.put('/:parent_art_sec/sync-attributes', verifyToken, syncAttributes);

// POST /api/articulos/variable/:art_sec/convert-to-variable - Convertir artículo simple a variable
router.post('/:art_sec/convert-to-variable', verifyToken, convertToVariable);

// PUT /api/articulos/variable/:parent_art_sec/variations/:variation_art_sec - Editar variacion puntual
router.put('/:parent_art_sec/variations/:variation_art_sec', verifyToken, updateVariation);

// DELETE /api/articulos/variable/:parent_art_sec/variations/:variation_art_sec - Eliminar variacion puntual
router.delete('/:parent_art_sec/variations/:variation_art_sec', verifyToken, deleteVariation);

module.exports = router;
