/**
 * Routes: Inventario Subgrupo (Subcategorías)
 * Descripción: Rutas para gestionar subcategorías con sincronización WooCommerce
 */

const express = require('express');
const router = express.Router();
const inventarioSubgrupoController = require('../controllers/inventarioSubgrupoController');
const auth = require('../middlewares/auth');

/**
 * @route   GET /api/subcategorias
 * @desc    Obtener todas las subcategorías con paginación y filtros
 * @access  Private
 * @query   page - Número de página (default: 1)
 * @query   limit - Registros por página (default: 10)
 * @query   inv_gru_cod - Filtro por categoría padre
 * @query   inv_sub_gru_cod - Filtro por código de subcategoría
 * @query   inv_sub_gru_nom - Filtro por nombre de subcategoría (LIKE)
 */
router.get('/', auth, inventarioSubgrupoController.getAllSubcategories);

/**
 * @route   GET /api/subcategorias/:inv_sub_gru_cod
 * @desc    Obtener una subcategoría por código
 * @access  Private
 */
router.get('/:inv_sub_gru_cod', auth, inventarioSubgrupoController.getSubcategoryByCode);

/**
 * @route   POST /api/subcategorias
 * @desc    Crear una nueva subcategoría con sincronización WooCommerce
 * @access  Private
 * @body    inv_sub_gru_nom - Nombre de la subcategoría (requerido)
 * @body    inv_sub_gru_des - Descripción de la subcategoría
 * @body    inv_gru_cod - Código de categoría padre (requerido)
 * @body    syncWoo - Sincronizar con WooCommerce (opcional, default: true)
 */
router.post('/', auth, inventarioSubgrupoController.createSubcategory);

/**
 * @route   PUT /api/subcategorias/:inv_sub_gru_cod
 * @desc    Actualizar una subcategoría existente con sincronización WooCommerce
 * @access  Private
 * @body    inv_sub_gru_nom - Nombre de la subcategoría
 * @body    inv_sub_gru_des - Descripción de la subcategoría
 * @body    inv_gru_cod - Código de categoría padre
 * @body    syncWoo - Sincronizar con WooCommerce (opcional, default: true)
 */
router.put('/:inv_sub_gru_cod', auth, inventarioSubgrupoController.updateSubcategory);

/**
 * @route   GET /api/subcategorias/:inv_sub_gru_cod/productos/exists
 * @desc    Verificar si una subcategoría tiene productos asociados
 * @access  Private
 */
router.get('/:inv_sub_gru_cod/productos/exists', auth, inventarioSubgrupoController.checkProducts);

/**
 * @route   GET /api/subcategorias/old
 * @desc    Endpoint heredado para compatibilidad (sin paginación)
 * @access  Public (mantener compatibilidad con código existente)
 * @query   inv_gru_cod - Filtro opcional por categoría padre
 */
router.get('/old', inventarioSubgrupoController.getInventarioSubgruposEndpoint);

module.exports = router;
