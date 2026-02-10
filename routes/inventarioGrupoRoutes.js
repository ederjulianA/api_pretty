/**
 * Rutas: Inventario Grupo (Categorías)
 * Base path: /api/categorias
 */

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const inventarioGrupoController = require('../controllers/inventarioGrupoController');

// Listar categorías con paginación y filtros
// GET /api/categorias?page=1&limit=10&inv_gru_cod=1&inv_gru_nom=Maquillaje
router.get('/', inventarioGrupoController.getAllCategories);

// Obtener una categoría específica por código
// GET /api/categorias/1
router.get('/:inv_gru_cod', auth, inventarioGrupoController.getCategoryByCode);

// Verificar si una categoría tiene subcategorías
// GET /api/categorias/1/subcategorias/exists
router.get('/:inv_gru_cod/subcategorias/exists', auth, inventarioGrupoController.checkSubcategories);

// Crear una nueva categoría
// POST /api/categorias
router.post('/', auth, inventarioGrupoController.createCategory);

// Actualizar una categoría existente
// PUT /api/categorias/1
router.put('/:inv_gru_cod', auth, inventarioGrupoController.updateCategory);

module.exports = router;