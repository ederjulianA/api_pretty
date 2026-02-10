/**
 * Model: Inventario Grupo (Categorías)
 * Descripción: Gestión de categorías del inventario con sincronización WooCommerce
 */

const { sql, poolPromise } = require('../db');
const wooSync = require('../utils/wooCategoriasSync');

/**
 * Obtener categorías con paginación y filtros
 * @param {Object} params - Parámetros de consulta
 * @param {number} params.page - Número de página (default: 1)
 * @param {number} params.limit - Registros por página (default: 10)
 * @param {string} params.inv_gru_cod - Filtro por código de categoría
 * @param {string} params.inv_gru_nom - Filtro por nombre de categoría
 * @returns {Object} Categorías paginadas con metadata
 */
const getAllCategories = async (params = {}) => {
  try {
    const pool = await poolPromise;

    // Parámetros de paginación con valores por defecto
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 10;
    const offset = (page - 1) * limit;

    // Construir condiciones WHERE dinámicamente
    let whereConditions = [];
    let queryParams = [];

    if (params.inv_gru_cod) {
      whereConditions.push('inv_gru_cod = @inv_gru_cod');
      queryParams.push({ name: 'inv_gru_cod', type: sql.VarChar(16), value: params.inv_gru_cod });
    }

    if (params.inv_gru_nom) {
      whereConditions.push('inv_gru_nom LIKE @inv_gru_nom');
      queryParams.push({ name: 'inv_gru_nom', type: sql.VarChar(50), value: `%${params.inv_gru_nom}%` });
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Contar total de registros
    let countRequest = pool.request();
    queryParams.forEach(param => {
      countRequest.input(param.name, param.type, param.value);
    });

    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM dbo.inventario_grupo
      ${whereClause}
    `);

    const totalRecords = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Consulta para obtener los registros paginados
    let dataRequest = pool.request();
    dataRequest.input('limit', sql.Int, limit);
    dataRequest.input('offset', sql.Int, offset);

    queryParams.forEach(param => {
      dataRequest.input(param.name, param.type, param.value);
    });

    const dataResult = await dataRequest.query(`
      SELECT
        inv_gru_cod,
        inv_gru_id,
        inv_gru_nom,
        inv_gru_woo_id,
        inv_gru_est,
        inv_gru_orden
      FROM dbo.inventario_grupo
      ${whereClause}
      ORDER BY inv_gru_cod
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    return {
      data: dataResult.recordset,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalRecords: totalRecords,
        limit: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener una categoría por código
 * @param {string} inv_gru_cod - Código de la categoría
 * @returns {Object} Categoría encontrada
 */
const getCategoryByCode = async (inv_gru_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('inv_gru_cod', sql.VarChar(16), inv_gru_cod)
      .query(`
        SELECT
          inv_gru_cod,
          inv_gru_id,
          inv_gru_nom,
          inv_gru_woo_id,
          inv_gru_est,
          inv_gru_orden
        FROM dbo.inventario_grupo
        WHERE inv_gru_cod = @inv_gru_cod
      `);

    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Crear una nueva categoría con sincronización a WooCommerce
 * @param {Object} categoryData - Datos de la categoría
 * @param {string} categoryData.inv_gru_nom - Nombre de la categoría (requerido)
 * @param {string} categoryData.inv_gru_id - ID de la categoría
 * @param {string} categoryData.inv_gru_est - Estado (A=Activo, I=Inactivo)
 * @param {number} categoryData.inv_gru_orden - Orden de visualización
 * @param {boolean} categoryData.syncWoo - Sincronizar con WooCommerce (default: true)
 * @returns {Object} Categoría creada con información de sincronización
 */
const createCategory = async (categoryData) => {
  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // Obtener el siguiente código de categoría
      const maxCodeResult = await transaction.request().query(`
        SELECT ISNULL(MAX(CAST(inv_gru_cod AS INT)), 0) + 1 AS next_code
        FROM dbo.inventario_grupo
        WHERE ISNUMERIC(inv_gru_cod) = 1
      `);

      const nextCode = maxCodeResult.recordset[0].next_code.toString();

      // Sincronizar con WooCommerce ANTES de insertar en BD local
      // Para tener el woo_id desde el principio
      let wooResult = { success: false, woo_id: null };
      const shouldSyncWoo = categoryData.syncWoo !== false; // Default true

      if (shouldSyncWoo) {
        wooResult = await wooSync.createCategoryInWoo({
          inv_gru_cod: nextCode,
          inv_gru_nom: categoryData.inv_gru_nom
        });

        console.log('Resultado sincronización WooCommerce:', wooResult);
      }

      // Insertar la nueva categoría con woo_id si está disponible
      await transaction.request()
        .input('inv_gru_cod', sql.VarChar(16), nextCode)
        .input('inv_gru_id', sql.VarChar(16), categoryData.inv_gru_id || nextCode)
        .input('inv_gru_nom', sql.VarChar(50), categoryData.inv_gru_nom)
        .input('inv_gru_woo_id', sql.Int, wooResult.woo_id)
        .input('inv_gru_est', sql.Char(1), categoryData.inv_gru_est || 'A')
        .input('inv_gru_orden', sql.SmallInt, categoryData.inv_gru_orden || 0)
        .query(`
          INSERT INTO dbo.inventario_grupo (inv_gru_cod, inv_gru_id, inv_gru_nom, inv_gru_woo_id, inv_gru_est, inv_gru_orden)
          VALUES (@inv_gru_cod, @inv_gru_id, @inv_gru_nom, @inv_gru_woo_id, @inv_gru_est, @inv_gru_orden)
        `);

      // Obtener la categoría creada
      const result = await transaction.request()
        .input('inv_gru_cod', sql.VarChar(16), nextCode)
        .query(`
          SELECT inv_gru_cod, inv_gru_id, inv_gru_nom, inv_gru_woo_id, inv_gru_est, inv_gru_orden
          FROM dbo.inventario_grupo
          WHERE inv_gru_cod = @inv_gru_cod
        `);

      await transaction.commit();

      const createdCategory = result.recordset[0];

      // Agregar información de sincronización WooCommerce
      return {
        ...createdCategory,
        woo_sync: {
          synced: wooResult.success,
          woo_id: wooResult.woo_id,
          error: wooResult.error
        }
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Actualizar una categoría existente con sincronización a WooCommerce
 * @param {string} inv_gru_cod - Código de la categoría
 * @param {Object} categoryData - Datos a actualizar
 * @param {string} categoryData.inv_gru_nom - Nombre de la categoría
 * @param {string} categoryData.inv_gru_id - ID de la categoría
 * @param {string} categoryData.inv_gru_est - Estado
 * @param {number} categoryData.inv_gru_orden - Orden
 * @param {boolean} categoryData.syncWoo - Sincronizar con WooCommerce (default: true)
 * @returns {Object} Categoría actualizada con información de sincronización
 */
const updateCategory = async (inv_gru_cod, categoryData) => {
  try {
    const pool = await poolPromise;

    // Verificar que la categoría existe
    const existingCategory = await getCategoryByCode(inv_gru_cod);
    if (!existingCategory) {
      throw new Error('Categoría no encontrada');
    }

    // Sincronizar con WooCommerce ANTES de actualizar BD local
    let wooResult = { success: false };
    const shouldSyncWoo = categoryData.syncWoo !== false; // Default true

    if (shouldSyncWoo && existingCategory.inv_gru_woo_id) {
      wooResult = await wooSync.updateCategoryInWoo(existingCategory.inv_gru_woo_id, {
        inv_gru_nom: categoryData.inv_gru_nom,
        inv_gru_cod: inv_gru_cod
      });

      console.log('Resultado actualización WooCommerce:', wooResult);
    } else if (shouldSyncWoo && !existingCategory.inv_gru_woo_id) {
      // Si no tiene woo_id, intentar crear en WooCommerce
      wooResult = await wooSync.createCategoryInWoo({
        inv_gru_cod: inv_gru_cod,
        inv_gru_nom: categoryData.inv_gru_nom || existingCategory.inv_gru_nom
      });

      // Si se creó exitosamente, agregar el woo_id a los campos a actualizar
      if (wooResult.success && wooResult.woo_id) {
        categoryData.inv_gru_woo_id = wooResult.woo_id;
      }
    }

    // Construir UPDATE dinámico solo con los campos proporcionados
    let updateFields = [];
    let queryParams = [{ name: 'inv_gru_cod', type: sql.VarChar(16), value: inv_gru_cod }];

    if (categoryData.inv_gru_nom !== undefined) {
      updateFields.push('inv_gru_nom = @inv_gru_nom');
      queryParams.push({ name: 'inv_gru_nom', type: sql.VarChar(50), value: categoryData.inv_gru_nom });
    }

    if (categoryData.inv_gru_id !== undefined) {
      updateFields.push('inv_gru_id = @inv_gru_id');
      queryParams.push({ name: 'inv_gru_id', type: sql.VarChar(16), value: categoryData.inv_gru_id });
    }

    if (categoryData.inv_gru_est !== undefined) {
      updateFields.push('inv_gru_est = @inv_gru_est');
      queryParams.push({ name: 'inv_gru_est', type: sql.Char(1), value: categoryData.inv_gru_est });
    }

    if (categoryData.inv_gru_orden !== undefined) {
      updateFields.push('inv_gru_orden = @inv_gru_orden');
      queryParams.push({ name: 'inv_gru_orden', type: sql.SmallInt, value: categoryData.inv_gru_orden });
    }

    if (categoryData.inv_gru_woo_id !== undefined) {
      updateFields.push('inv_gru_woo_id = @inv_gru_woo_id');
      queryParams.push({ name: 'inv_gru_woo_id', type: sql.Int, value: categoryData.inv_gru_woo_id });
    }

    if (updateFields.length === 0) {
      throw new Error('No se proporcionaron campos para actualizar');
    }

    let request = pool.request();
    queryParams.forEach(param => {
      request.input(param.name, param.type, param.value);
    });

    await request.query(`
      UPDATE dbo.inventario_grupo
      SET ${updateFields.join(', ')}
      WHERE inv_gru_cod = @inv_gru_cod
    `);

    // Retornar la categoría actualizada con información de sincronización
    const updatedCategory = await getCategoryByCode(inv_gru_cod);

    return {
      ...updatedCategory,
      woo_sync: {
        synced: wooResult.success,
        woo_id: updatedCategory.inv_gru_woo_id,
        error: wooResult.error
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verificar si una categoría tiene subcategorías asociadas
 * @param {string} inv_gru_cod - Código de la categoría
 * @returns {boolean} True si tiene subcategorías
 */
const hasSubcategories = async (inv_gru_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('inv_gru_cod', sql.VarChar(16), inv_gru_cod)
      .query(`
        SELECT COUNT(*) AS count
        FROM dbo.inventario_subgrupo
        WHERE inv_gru_cod = @inv_gru_cod
      `);

    return result.recordset[0].count > 0;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAllCategories,
  getCategoryByCode,
  createCategory,
  updateCategory,
  hasSubcategories
};
