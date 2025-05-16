import { sql, poolPromise } from "../db.js";

const getModules = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT m.mod_id, m.mod_codigo, m.mod_nombre, m.mod_descripcion, m.mod_activo,
               a.acc_id, a.acc_codigo, a.acc_nombre, a.acc_descripcion
        FROM dbo.Modulos m
        LEFT JOIN dbo.Acciones a ON m.mod_id = a.mod_id
        WHERE m.mod_activo = 1
        ORDER BY m.mod_nombre, a.acc_nombre
      `);
    return result.recordset;
  } catch (error) {
    console.error('Error al obtener módulos:', error);
    throw error;
  }
};

const getModuleById = async (mod_id) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('mod_id', sql.Int, mod_id)
      .query(`
        SELECT m.mod_id, m.mod_codigo, m.mod_nombre, m.mod_descripcion, m.mod_activo,
               a.acc_id, a.acc_codigo, a.acc_nombre, a.acc_descripcion
        FROM dbo.Modulos m
        LEFT JOIN dbo.Acciones a ON m.mod_id = a.mod_id
        WHERE m.mod_id = @mod_id
        ORDER BY a.acc_nombre
      `);
    return result.recordset;
  } catch (error) {
    console.error('Error al obtener módulo:', error);
    throw error;
  }
};

const createModule = async ({ mod_codigo, mod_nombre, mod_descripcion, acciones }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Insertar el módulo
    const insertModuleRequest = new sql.Request(transaction);
    const moduleResult = await insertModuleRequest
      .input('mod_codigo', sql.VarChar(50), mod_codigo)
      .input('mod_nombre', sql.VarChar(100), mod_nombre)
      .input('mod_descripcion', sql.VarChar(200), mod_descripcion)
      .query(`
        INSERT INTO dbo.Modulos (mod_codigo, mod_nombre, mod_descripcion, mod_activo)
        OUTPUT INSERTED.mod_id
        VALUES (@mod_codigo, @mod_nombre, @mod_descripcion, 1)
      `);

    const mod_id = moduleResult.recordset[0].mod_id;

    // Insertar acciones si se proporcionan
    if (acciones && Array.isArray(acciones)) {
      for (const accion of acciones) {
        const insertActionRequest = new sql.Request(transaction);
        await insertActionRequest
          .input('mod_id', sql.Int, mod_id)
          .input('acc_codigo', sql.VarChar(50), accion.acc_codigo)
          .input('acc_nombre', sql.VarChar(100), accion.acc_nombre)
          .input('acc_descripcion', sql.VarChar(200), accion.acc_descripcion)
          .query(`
            INSERT INTO dbo.Acciones (mod_id, acc_codigo, acc_nombre, acc_descripcion)
            VALUES (@mod_id, @acc_codigo, @acc_nombre, @acc_descripcion)
          `);
      }
    }

    await transaction.commit();
    return { mod_id, message: "Módulo creado exitosamente" };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw error;
  }
};

const updateModule = async (mod_id, { mod_codigo, mod_nombre, mod_descripcion, acciones }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Actualizar el módulo
    const updateModuleRequest = new sql.Request(transaction);
    await updateModuleRequest
      .input('mod_id', sql.Int, mod_id)
      .input('mod_codigo', sql.VarChar(50), mod_codigo)
      .input('mod_nombre', sql.VarChar(100), mod_nombre)
      .input('mod_descripcion', sql.VarChar(200), mod_descripcion)
      .query(`
        UPDATE dbo.Modulos
        SET mod_codigo = @mod_codigo,
            mod_nombre = @mod_nombre,
            mod_descripcion = @mod_descripcion
        WHERE mod_id = @mod_id
      `);

    // Eliminar acciones existentes
    const deleteActionsRequest = new sql.Request(transaction);
    await deleteActionsRequest
      .input('mod_id', sql.Int, mod_id)
      .query(`
        DELETE FROM dbo.Acciones
        WHERE mod_id = @mod_id
      `);

    // Insertar nuevas acciones
    if (acciones && Array.isArray(acciones)) {
      for (const accion of acciones) {
        const insertActionRequest = new sql.Request(transaction);
        await insertActionRequest
          .input('mod_id', sql.Int, mod_id)
          .input('acc_codigo', sql.VarChar(50), accion.acc_codigo)
          .input('acc_nombre', sql.VarChar(100), accion.acc_nombre)
          .input('acc_descripcion', sql.VarChar(200), accion.acc_descripcion)
          .query(`
            INSERT INTO dbo.Acciones (mod_id, acc_codigo, acc_nombre, acc_descripcion)
            VALUES (@mod_id, @acc_codigo, @acc_nombre, @acc_descripcion)
          `);
      }
    }

    await transaction.commit();
    return { message: "Módulo actualizado exitosamente" };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw error;
  }
};

const deleteModule = async (mod_id) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('mod_id', sql.Int, mod_id)
      .query(`
        UPDATE dbo.Modulos
        SET mod_activo = 0
        WHERE mod_id = @mod_id
      `);
    return { message: "Módulo desactivado exitosamente" };
  } catch (error) {
    console.error('Error al desactivar módulo:', error);
    throw error;
  }
};

export { getModules, getModuleById, createModule, updateModule, deleteModule }; 