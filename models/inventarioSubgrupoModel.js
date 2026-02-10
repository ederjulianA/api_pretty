/**
 * Model: Inventario Subgrupo (Subcategorías)
 * Descripción: Gestión de subcategorías del inventario con sincronización WooCommerce
 */

const { sql, poolPromise } = require('../db');
const wooSync = require('../utils/wooSubcategoriasSync');

/**
 * Obtener subcategorías con paginación y filtros
 * @param {Object} params - Parámetros de consulta
 * @param {number} params.page - Número de página (default: 1)
 * @param {number} params.limit - Registros por página (default: 10)
 * @param {number} params.inv_gru_cod - Filtro por código de categoría padre
 * @param {number} params.inv_sub_gru_cod - Filtro por código de subcategoría
 * @param {string} params.inv_sub_gru_nom - Filtro por nombre de subcategoría
 * @returns {Object} Subcategorías paginadas con metadata
 */
const getAllSubcategories = async (params = {}) => {
  try {
    const pool = await poolPromise;

    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 10;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];

    if (params.inv_gru_cod) {
      whereConditions.push('isg.inv_gru_cod = @inv_gru_cod');
      queryParams.push({ name: 'inv_gru_cod', type: sql.VarChar(16), value: params.inv_gru_cod });
    }

    if (params.inv_sub_gru_cod) {
      whereConditions.push('isg.inv_sub_gru_cod = @inv_sub_gru_cod');
      queryParams.push({ name: 'inv_sub_gru_cod', type: sql.SmallInt, value: parseInt(params.inv_sub_gru_cod) });
    }

    if (params.inv_sub_gru_nom) {
      whereConditions.push('isg.inv_sub_gru_nom LIKE @inv_sub_gru_nom');
      queryParams.push({ name: 'inv_sub_gru_nom', type: sql.VarChar(40), value: `%${params.inv_sub_gru_nom}%` });
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
      FROM dbo.inventario_subgrupo isg
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
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_id,
        isg.inv_sub_gru_nom,
        isg.inv_gru_cod,
        ig.inv_gru_nom AS categoria_nombre,
        isg.inv_sub_gru_woo_id,
        ig.inv_gru_woo_id AS categoria_woo_id,
        isg.inv_sub_gru_est,
        isg.inv_sub_gru_parend_woo,
        isg.inv_sub_gru_orden
      FROM dbo.inventario_subgrupo isg
      LEFT JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
      ${whereClause}
      ORDER BY isg.inv_gru_cod, isg.inv_sub_gru_cod
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
 * Obtener una subcategoría por código
 * @param {number} inv_sub_gru_cod - Código de la subcategoría
 * @returns {Object} Subcategoría encontrada
 */
const getSubcategoryByCode = async (inv_sub_gru_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('inv_sub_gru_cod', sql.SmallInt, inv_sub_gru_cod)
      .query(`
        SELECT
          isg.inv_sub_gru_cod,
          isg.inv_sub_gru_id,
          isg.inv_sub_gru_nom,
          isg.inv_gru_cod,
          ig.inv_gru_nom AS categoria_nombre,
          isg.inv_sub_gru_woo_id,
          ig.inv_gru_woo_id AS categoria_woo_id,
          isg.inv_sub_gru_est,
          isg.inv_sub_gru_parend_woo,
          isg.inv_sub_gru_orden
        FROM dbo.inventario_subgrupo isg
        LEFT JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
        WHERE isg.inv_sub_gru_cod = @inv_sub_gru_cod
      `);

    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Crear una nueva subcategoría con sincronización a WooCommerce
 * @param {Object} subcategoryData - Datos de la subcategoría
 * @param {string} subcategoryData.inv_sub_gru_nom - Nombre (requerido)
 * @param {string} subcategoryData.inv_sub_gru_id - ID
 * @param {string} subcategoryData.inv_gru_cod - Código de categoría padre (requerido)
 * @param {string} subcategoryData.inv_sub_gru_est - Estado (A=Activo, I=Inactivo)
 * @param {number} subcategoryData.inv_sub_gru_orden - Orden
 * @param {boolean} subcategoryData.syncWoo - Sincronizar con WooCommerce (default: true)
 * @returns {Object} Subcategoría creada con información de sincronización
 */
const createSubcategory = async (subcategoryData) => {
  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // Verificar que la categoría padre existe
      const parentResult = await transaction.request()
        .input('inv_gru_cod', sql.VarChar(16), subcategoryData.inv_gru_cod)
        .query('SELECT inv_gru_cod, inv_gru_woo_id FROM dbo.inventario_grupo WHERE inv_gru_cod = @inv_gru_cod');

      if (parentResult.recordset.length === 0) {
        throw new Error('Categoría padre no encontrada');
      }

      const parentCategory = parentResult.recordset[0];

      // Obtener el siguiente código de subcategoría
      const maxCodeResult = await transaction.request().query(`
        SELECT ISNULL(MAX(inv_sub_gru_cod), 0) + 1 AS next_code
        FROM dbo.inventario_subgrupo
      `);

      const nextCode = maxCodeResult.recordset[0].next_code;

      // Sincronizar con WooCommerce
      let wooResult = { success: false, woo_id: null };
      const shouldSyncWoo = subcategoryData.syncWoo !== false;

      if (shouldSyncWoo) {
        wooResult = await wooSync.createSubcategoryInWoo({
          inv_sub_gru_cod: nextCode,
          inv_sub_gru_nom: subcategoryData.inv_sub_gru_nom,
          inv_gru_cod: subcategoryData.inv_gru_cod,
          inv_gru_woo_id: parentCategory.inv_gru_woo_id
        });

        console.log('Resultado sincronización subcategoría WooCommerce:', wooResult);
      }

      // Insertar la nueva subcategoría
      await transaction.request()
        .input('inv_sub_gru_cod', sql.SmallInt, nextCode)
        .input('inv_sub_gru_id', sql.VarChar(16), subcategoryData.inv_sub_gru_id || nextCode.toString())
        .input('inv_sub_gru_nom', sql.VarChar(40), subcategoryData.inv_sub_gru_nom)
        .input('inv_gru_cod', sql.VarChar(16), subcategoryData.inv_gru_cod)
        .input('inv_sub_gru_woo_id', sql.Int, wooResult.woo_id)
        .input('inv_sub_gru_est', sql.Char(1), subcategoryData.inv_sub_gru_est || 'A')
        .input('inv_sub_gru_parend_woo', sql.Int, parentCategory.inv_gru_woo_id)
        .input('inv_sub_gru_orden', sql.SmallInt, subcategoryData.inv_sub_gru_orden || 0)
        .query(`
          INSERT INTO dbo.inventario_subgrupo (
            inv_sub_gru_cod, inv_sub_gru_id, inv_sub_gru_nom, inv_gru_cod,
            inv_sub_gru_woo_id, inv_sub_gru_est, inv_sub_gru_parend_woo, inv_sub_gru_orden
          )
          VALUES (
            @inv_sub_gru_cod, @inv_sub_gru_id, @inv_sub_gru_nom, @inv_gru_cod,
            @inv_sub_gru_woo_id, @inv_sub_gru_est, @inv_sub_gru_parend_woo, @inv_sub_gru_orden
          )
        `);

      // Obtener la subcategoría creada
      const result = await transaction.request()
        .input('inv_sub_gru_cod', sql.SmallInt, nextCode)
        .query(`
          SELECT
            isg.inv_sub_gru_cod,
            isg.inv_sub_gru_id,
            isg.inv_sub_gru_nom,
            isg.inv_gru_cod,
            ig.inv_gru_nom AS categoria_nombre,
            isg.inv_sub_gru_woo_id,
            ig.inv_gru_woo_id AS categoria_woo_id,
            isg.inv_sub_gru_est,
            isg.inv_sub_gru_parend_woo,
            isg.inv_sub_gru_orden
          FROM dbo.inventario_subgrupo isg
          LEFT JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
          WHERE isg.inv_sub_gru_cod = @inv_sub_gru_cod
        `);

      await transaction.commit();

      const createdSubcategory = result.recordset[0];

      return {
        ...createdSubcategory,
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
 * Actualizar una subcategoría existente con sincronización a WooCommerce
 * @param {number} inv_sub_gru_cod - Código de la subcategoría
 * @param {Object} subcategoryData - Datos a actualizar
 * @returns {Object} Subcategoría actualizada con información de sincronización
 */
const updateSubcategory = async (inv_sub_gru_cod, subcategoryData) => {
  try {
    const pool = await poolPromise;

    // Verificar que la subcategoría existe
    const existingSubcategory = await getSubcategoryByCode(inv_sub_gru_cod);
    if (!existingSubcategory) {
      throw new Error('Subcategoría no encontrada');
    }

    // Si se cambia la categoría padre, verificar que existe y obtener su woo_id
    let newParentWooId = existingSubcategory.categoria_woo_id;
    if (subcategoryData.inv_gru_cod && subcategoryData.inv_gru_cod !== existingSubcategory.inv_gru_cod) {
      const parentResult = await pool.request()
        .input('inv_gru_cod', sql.VarChar(16), subcategoryData.inv_gru_cod)
        .query('SELECT inv_gru_woo_id FROM dbo.inventario_grupo WHERE inv_gru_cod = @inv_gru_cod');

      if (parentResult.recordset.length === 0) {
        throw new Error('Categoría padre no encontrada');
      }

      newParentWooId = parentResult.recordset[0].inv_gru_woo_id;
    }

    // Sincronizar con WooCommerce
    let wooResult = { success: false };
    const shouldSyncWoo = subcategoryData.syncWoo !== false;

    if (shouldSyncWoo && existingSubcategory.inv_sub_gru_woo_id) {
      wooResult = await wooSync.updateSubcategoryInWoo(existingSubcategory.inv_sub_gru_woo_id, {
        inv_sub_gru_nom: subcategoryData.inv_sub_gru_nom,
        inv_sub_gru_cod: inv_sub_gru_cod,
        inv_gru_woo_id: newParentWooId
      });

      console.log('Resultado actualización subcategoría WooCommerce:', wooResult);
    } else if (shouldSyncWoo && !existingSubcategory.inv_sub_gru_woo_id) {
      // Si no tiene woo_id, crear en WooCommerce
      wooResult = await wooSync.createSubcategoryInWoo({
        inv_sub_gru_cod: inv_sub_gru_cod,
        inv_sub_gru_nom: subcategoryData.inv_sub_gru_nom || existingSubcategory.inv_sub_gru_nom,
        inv_gru_cod: subcategoryData.inv_gru_cod || existingSubcategory.inv_gru_cod,
        inv_gru_woo_id: newParentWooId
      });

      if (wooResult.success && wooResult.woo_id) {
        subcategoryData.inv_sub_gru_woo_id = wooResult.woo_id;
        subcategoryData.inv_sub_gru_parend_woo = newParentWooId;
      }
    }

    // Construir UPDATE dinámico
    let updateFields = [];
    let queryParams = [{ name: 'inv_sub_gru_cod', type: sql.SmallInt, value: inv_sub_gru_cod }];

    if (subcategoryData.inv_sub_gru_nom !== undefined) {
      updateFields.push('inv_sub_gru_nom = @inv_sub_gru_nom');
      queryParams.push({ name: 'inv_sub_gru_nom', type: sql.VarChar(40), value: subcategoryData.inv_sub_gru_nom });
    }

    if (subcategoryData.inv_sub_gru_id !== undefined) {
      updateFields.push('inv_sub_gru_id = @inv_sub_gru_id');
      queryParams.push({ name: 'inv_sub_gru_id', type: sql.VarChar(16), value: subcategoryData.inv_sub_gru_id });
    }

    if (subcategoryData.inv_gru_cod !== undefined) {
      updateFields.push('inv_gru_cod = @inv_gru_cod');
      queryParams.push({ name: 'inv_gru_cod', type: sql.VarChar(16), value: subcategoryData.inv_gru_cod });
    }

    if (subcategoryData.inv_sub_gru_est !== undefined) {
      updateFields.push('inv_sub_gru_est = @inv_sub_gru_est');
      queryParams.push({ name: 'inv_sub_gru_est', type: sql.Char(1), value: subcategoryData.inv_sub_gru_est });
    }

    if (subcategoryData.inv_sub_gru_orden !== undefined) {
      updateFields.push('inv_sub_gru_orden = @inv_sub_gru_orden');
      queryParams.push({ name: 'inv_sub_gru_orden', type: sql.SmallInt, value: subcategoryData.inv_sub_gru_orden });
    }

    if (subcategoryData.inv_sub_gru_woo_id !== undefined) {
      updateFields.push('inv_sub_gru_woo_id = @inv_sub_gru_woo_id');
      queryParams.push({ name: 'inv_sub_gru_woo_id', type: sql.Int, value: subcategoryData.inv_sub_gru_woo_id });
    }

    if (subcategoryData.inv_sub_gru_parend_woo !== undefined) {
      updateFields.push('inv_sub_gru_parend_woo = @inv_sub_gru_parend_woo');
      queryParams.push({ name: 'inv_sub_gru_parend_woo', type: sql.Int, value: subcategoryData.inv_sub_gru_parend_woo });
    }

    if (updateFields.length === 0) {
      throw new Error('No se proporcionaron campos para actualizar');
    }

    let request = pool.request();
    queryParams.forEach(param => {
      request.input(param.name, param.type, param.value);
    });

    await request.query(`
      UPDATE dbo.inventario_subgrupo
      SET ${updateFields.join(', ')}
      WHERE inv_sub_gru_cod = @inv_sub_gru_cod
    `);

    // Retornar la subcategoría actualizada
    const updatedSubcategory = await getSubcategoryByCode(inv_sub_gru_cod);

    return {
      ...updatedSubcategory,
      woo_sync: {
        synced: wooResult.success,
        woo_id: updatedSubcategory.inv_sub_gru_woo_id,
        error: wooResult.error
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verificar si una subcategoría tiene productos asociados
 * @param {number} inv_sub_gru_cod - Código de la subcategoría
 * @returns {boolean} True si tiene productos
 */
const hasProducts = async (inv_sub_gru_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('inv_sub_gru_cod', sql.SmallInt, inv_sub_gru_cod)
      .query(`
        SELECT COUNT(*) AS count
        FROM dbo.articulos
        WHERE inv_sub_gru_cod = @inv_sub_gru_cod
      `);

    return result.recordset[0].count > 0;
  } catch (error) {
    throw error;
  }
};

// Mantener compatibilidad con función anterior
const getInventarioSubgrupos = async (inv_gru_cod) => {
  const result = await getAllSubcategories({ inv_gru_cod, limit: 1000 });
  return result.data;
};

module.exports = {
  getAllSubcategories,
  getSubcategoryByCode,
  createSubcategory,
  updateSubcategory,
  hasProducts,
  getInventarioSubgrupos // Compatibilidad
};
