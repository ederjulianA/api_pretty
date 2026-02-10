/**
 * Controller: Inventario Subgrupo (Subcategorías)
 * Descripción: Controlador para gestionar subcategorías con sincronización WooCommerce
 */

const inventarioSubgrupoModel = require('../models/inventarioSubgrupoModel');

/**
 * Obtener todas las subcategorías con paginación y filtros
 * GET /api/subcategorias
 * Query params: page, limit, inv_gru_cod, inv_sub_gru_cod, inv_sub_gru_nom
 */
const getAllSubcategories = async (req, res) => {
  try {
    const { page, limit, inv_gru_cod, inv_sub_gru_cod, inv_sub_gru_nom } = req.query;

    const result = await inventarioSubgrupoModel.getAllSubcategories({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      inv_gru_cod: inv_gru_cod || undefined,
      inv_sub_gru_cod: inv_sub_gru_cod ? parseInt(inv_sub_gru_cod) : undefined,
      inv_sub_gru_nom: inv_sub_gru_nom
    });

    res.json({
      success: true,
      message: 'Subcategorías obtenidas exitosamente',
      ...result
    });
  } catch (error) {
    console.error('Error obteniendo subcategorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener subcategorías',
      error: error.message
    });
  }
};

/**
 * Obtener una subcategoría por código
 * GET /api/subcategorias/:inv_sub_gru_cod
 */
const getSubcategoryByCode = async (req, res) => {
  try {
    const { inv_sub_gru_cod } = req.params;

    const subcategory = await inventarioSubgrupoModel.getSubcategoryByCode(parseInt(inv_sub_gru_cod));

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategoría no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Subcategoría obtenida exitosamente',
      data: subcategory
    });
  } catch (error) {
    console.error('Error obteniendo subcategoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener subcategoría',
      error: error.message
    });
  }
};

/**
 * Crear una nueva subcategoría
 * POST /api/subcategorias
 * Body: { inv_sub_gru_nom, inv_sub_gru_des, inv_gru_cod, syncWoo }
 */
const createSubcategory = async (req, res) => {
  try {
    const { inv_sub_gru_nom, inv_gru_cod, syncWoo } = req.body;

    // Validaciones
    if (!inv_sub_gru_nom || inv_sub_gru_nom.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la subcategoría es requerido'
      });
    }

    if (inv_sub_gru_nom.length > 40) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la subcategoría no puede exceder 40 caracteres'
      });
    }

    if (!inv_gru_cod) {
      return res.status(400).json({
        success: false,
        message: 'El código de categoría padre (inv_gru_cod) es requerido'
      });
    }

    const newSubcategory = await inventarioSubgrupoModel.createSubcategory({
      inv_sub_gru_nom: inv_sub_gru_nom.trim(),
      inv_gru_cod: inv_gru_cod,
      syncWoo: syncWoo
    });

    res.status(201).json({
      success: true,
      message: 'Subcategoría creada exitosamente',
      data: newSubcategory
    });
  } catch (error) {
    console.error('Error creando subcategoría:', error);

    // Errores específicos
    if (error.message === 'Categoría padre no encontrada') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al crear subcategoría',
      error: error.message
    });
  }
};

/**
 * Actualizar una subcategoría existente
 * PUT /api/subcategorias/:inv_sub_gru_cod
 * Body: { inv_sub_gru_nom, inv_sub_gru_des, inv_gru_cod, syncWoo }
 */
const updateSubcategory = async (req, res) => {
  try {
    const { inv_sub_gru_cod } = req.params;
    const { inv_sub_gru_nom, inv_gru_cod, syncWoo } = req.body;

    // Validar que se proporciona al menos un campo para actualizar
    if (inv_sub_gru_nom === undefined && inv_gru_cod === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un campo para actualizar (inv_sub_gru_nom, inv_gru_cod)'
      });
    }

    // Validaciones de longitud
    if (inv_sub_gru_nom !== undefined) {
      if (inv_sub_gru_nom.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'El nombre de la subcategoría no puede estar vacío'
        });
      }

      if (inv_sub_gru_nom.length > 40) {
        return res.status(400).json({
          success: false,
          message: 'El nombre de la subcategoría no puede exceder 40 caracteres'
        });
      }
    }

    const updateData = { syncWoo };
    if (inv_sub_gru_nom !== undefined) updateData.inv_sub_gru_nom = inv_sub_gru_nom.trim();
    if (inv_gru_cod !== undefined) updateData.inv_gru_cod = inv_gru_cod;

    const updatedSubcategory = await inventarioSubgrupoModel.updateSubcategory(
      parseInt(inv_sub_gru_cod),
      updateData
    );

    res.json({
      success: true,
      message: 'Subcategoría actualizada exitosamente',
      data: updatedSubcategory
    });
  } catch (error) {
    console.error('Error actualizando subcategoría:', error);

    // Errores específicos
    if (error.message === 'Subcategoría no encontrada') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message === 'Categoría padre no encontrada') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al actualizar subcategoría',
      error: error.message
    });
  }
};

/**
 * Verificar si una subcategoría tiene productos asociados
 * GET /api/subcategorias/:inv_sub_gru_cod/productos/exists
 */
const checkProducts = async (req, res) => {
  try {
    const { inv_sub_gru_cod } = req.params;

    const hasProducts = await inventarioSubgrupoModel.hasProducts(parseInt(inv_sub_gru_cod));

    res.json({
      success: true,
      message: 'Verificación completada',
      data: {
        inv_sub_gru_cod: parseInt(inv_sub_gru_cod),
        hasProducts: hasProducts
      }
    });
  } catch (error) {
    console.error('Error verificando productos de subcategoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar productos',
      error: error.message
    });
  }
};

/**
 * Función heredada para compatibilidad
 * GET /api/subcategorias/old
 * Query params: inv_gru_cod (opcional)
 */
const getInventarioSubgruposEndpoint = async (req, res) => {
  try {
    const { inv_gru_cod } = req.query;
    const subgrupos = await inventarioSubgrupoModel.getInventarioSubgrupos(inv_gru_cod);
    return res.json({ success: true, subcategorias: subgrupos });
  } catch (error) {
    console.error("Error al obtener subcategorias:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAllSubcategories,
  getSubcategoryByCode,
  createSubcategory,
  updateSubcategory,
  checkProducts,
  getInventarioSubgruposEndpoint // Compatibilidad
};
