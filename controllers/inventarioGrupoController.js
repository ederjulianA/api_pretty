/**
 * Controller: Inventario Grupo (Categorías)
 * Descripción: Gestión de categorías del inventario
 */

const inventarioGrupoModel = require('../models/inventarioGrupoModel');

/**
 * Obtener todas las categorías con paginación y filtros
 * GET /api/categorias
 * Query params:
 *  - page: número de página (default: 1)
 *  - limit: registros por página (default: 10)
 *  - inv_gru_cod: filtro por código
 *  - inv_gru_nom: filtro por nombre (búsqueda parcial)
 */
const getAllCategories = async (req, res) => {
  try {
    const { page, limit, inv_gru_cod, inv_gru_nom } = req.query;

    const result = await inventarioGrupoModel.getAllCategories({
      page,
      limit,
      inv_gru_cod,
      inv_gru_nom
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener categorías',
      error: error.message
    });
  }
};

/**
 * Obtener una categoría por código
 * GET /api/categorias/:inv_gru_cod
 */
const getCategoryByCode = async (req, res) => {
  try {
    const { inv_gru_cod } = req.params;

    const category = await inventarioGrupoModel.getCategoryByCode(inv_gru_cod);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error al obtener categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener categoría',
      error: error.message
    });
  }
};

/**
 * Crear una nueva categoría
 * POST /api/categorias
 * Body:
 *  - inv_gru_nom: nombre de la categoría (requerido)
 *  - inv_gru_des: descripción de la categoría (opcional)
 */
const createCategory = async (req, res) => {
  try {
    const { inv_gru_nom, inv_gru_des } = req.body;

    // Validaciones
    if (!inv_gru_nom || inv_gru_nom.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la categoría es requerido'
      });
    }

    if (inv_gru_nom.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la categoría no puede exceder 50 caracteres'
      });
    }

    const newCategory = await inventarioGrupoModel.createCategory({
      inv_gru_nom: inv_gru_nom.trim()
    });

    res.status(201).json({
      success: true,
      message: 'Categoría creada exitosamente',
      data: newCategory
    });
  } catch (error) {
    console.error('Error al crear categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear categoría',
      error: error.message
    });
  }
};

/**
 * Actualizar una categoría existente
 * PUT /api/categorias/:inv_gru_cod
 * Body:
 *  - inv_gru_nom: nombre de la categoría (opcional)
 *  - inv_gru_des: descripción de la categoría (opcional)
 */
const updateCategory = async (req, res) => {
  try {
    const { inv_gru_cod } = req.params;
    const { inv_gru_nom } = req.body;

    // Validar que se proporcione al menos un campo para actualizar
    if (!inv_gru_nom) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un campo para actualizar'
      });
    }

    // Validaciones de longitud
    if (inv_gru_nom && inv_gru_nom.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la categoría no puede exceder 50 caracteres'
      });
    }

    const updateData = {};
    if (inv_gru_nom !== undefined) updateData.inv_gru_nom = inv_gru_nom.trim();

    const updatedCategory = await inventarioGrupoModel.updateCategory(
      inv_gru_cod,
      updateData
    );

    res.json({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: updatedCategory
    });
  } catch (error) {
    console.error('Error al actualizar categoría:', error);

    if (error.message === 'Categoría no encontrada') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al actualizar categoría',
      error: error.message
    });
  }
};

/**
 * Verificar si una categoría tiene subcategorías asociadas
 * GET /api/categorias/:inv_gru_cod/subcategorias/exists
 */
const checkSubcategories = async (req, res) => {
  try {
    const { inv_gru_cod } = req.params;

    const hasSubcategories = await inventarioGrupoModel.hasSubcategories(parseInt(inv_gru_cod));

    res.json({
      success: true,
      data: {
        inv_gru_cod: parseInt(inv_gru_cod),
        hasSubcategories: hasSubcategories
      }
    });
  } catch (error) {
    console.error('Error al verificar subcategorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar subcategorías',
      error: error.message
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryByCode,
  createCategory,
  updateCategory,
  checkSubcategories
};
