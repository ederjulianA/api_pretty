import { sql, poolPromise } from "../db.js";

const getRoles = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT rol_id, rol_nombre, rol_descripcion, rol_activo
        FROM dbo.Roles
        WHERE rol_activo = 1
        ORDER BY rol_nombre
      `);
    return result.recordset;
  } catch (error) {
    console.error('Error al obtener roles:', error);
    throw error;
  }
};

const getRoleById = async (rol_id) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('rol_id', sql.Int, rol_id)
      .query(`
        SELECT r.rol_id, r.rol_nombre, r.rol_descripcion, r.rol_activo,
               m.mod_id, m.mod_codigo, m.mod_nombre,
               a.acc_id, a.acc_codigo, a.acc_nombre,
               rp.acceso,
               rpa.permitido
        FROM dbo.Roles r
        LEFT JOIN dbo.RolesPermisos rp ON r.rol_id = rp.rol_id
        LEFT JOIN dbo.Modulos m ON rp.mod_id = m.mod_id
        LEFT JOIN dbo.RolesPermisosAcciones rpa ON rp.rolperm_id = rpa.rolperm_id
        LEFT JOIN dbo.Acciones a ON rpa.acc_id = a.acc_id
        WHERE r.rol_id = @rol_id
      `);
    return result.recordset;
  } catch (error) {
    console.error('Error al obtener rol:', error);
    throw error;
  }
};

const createRole = async ({ rol_nombre, rol_descripcion, permisos }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Insertar el rol
    const insertRoleRequest = new sql.Request(transaction);
    const roleResult = await insertRoleRequest
      .input('rol_nombre', sql.VarChar(50), rol_nombre)
      .input('rol_descripcion', sql.VarChar(200), rol_descripcion)
      .query(`
        INSERT INTO dbo.Roles (rol_nombre, rol_descripcion, rol_activo)
        OUTPUT INSERTED.rol_id
        VALUES (@rol_nombre, @rol_descripcion, 1)
      `);

    const rol_id = roleResult.recordset[0].rol_id;

    // Insertar permisos si se proporcionan
    if (permisos && Array.isArray(permisos)) {
      for (const permiso of permisos) {
        const { mod_id, acceso, acciones } = permiso;
        
        // Insertar permiso de rol
        const insertPermRequest = new sql.Request(transaction);
        const permResult = await insertPermRequest
          .input('rol_id', sql.Int, rol_id)
          .input('mod_id', sql.Int, mod_id)
          .input('acceso', sql.Bit, acceso)
          .query(`
            INSERT INTO dbo.RolesPermisos (rol_id, mod_id, acceso)
            OUTPUT INSERTED.rolperm_id
            VALUES (@rol_id, @mod_id, @acceso)
          `);

        const rolperm_id = permResult.recordset[0].rolperm_id;

        // Insertar acciones permitidas
        if (acciones && Array.isArray(acciones)) {
          for (const accion of acciones) {
            const insertActionRequest = new sql.Request(transaction);
            await insertActionRequest
              .input('rolperm_id', sql.Int, rolperm_id)
              .input('acc_id', sql.Int, accion.acc_id)
              .input('permitido', sql.Bit, accion.permitido)
              .query(`
                INSERT INTO dbo.RolesPermisosAcciones (rolperm_id, acc_id, permitido)
                VALUES (@rolperm_id, @acc_id, @permitido)
              `);
          }
        }
      }
    }

    await transaction.commit();
    return { rol_id, message: "Rol creado exitosamente" };
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

const updateRole = async (rol_id, { rol_nombre, rol_descripcion, permisos }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Actualizar el rol
    const updateRoleRequest = new sql.Request(transaction);
    await updateRoleRequest
      .input('rol_id', sql.Int, rol_id)
      .input('rol_nombre', sql.VarChar(50), rol_nombre)
      .input('rol_descripcion', sql.VarChar(200), rol_descripcion)
      .query(`
        UPDATE dbo.Roles
        SET rol_nombre = @rol_nombre,
            rol_descripcion = @rol_descripcion
        WHERE rol_id = @rol_id
      `);

    // Eliminar permisos existentes
    const deletePermsRequest = new sql.Request(transaction);
    await deletePermsRequest
      .input('rol_id', sql.Int, rol_id)
      .query(`
        DELETE FROM dbo.RolesPermisos
        WHERE rol_id = @rol_id
      `);

    // Insertar nuevos permisos
    if (permisos && Array.isArray(permisos)) {
      for (const permiso of permisos) {
        const { mod_id, acceso, acciones } = permiso;
        
        const insertPermRequest = new sql.Request(transaction);
        const permResult = await insertPermRequest
          .input('rol_id', sql.Int, rol_id)
          .input('mod_id', sql.Int, mod_id)
          .input('acceso', sql.Bit, acceso)
          .query(`
            INSERT INTO dbo.RolesPermisos (rol_id, mod_id, acceso)
            OUTPUT INSERTED.rolperm_id
            VALUES (@rol_id, @mod_id, @acceso)
          `);

        const rolperm_id = permResult.recordset[0].rolperm_id;

        if (acciones && Array.isArray(acciones)) {
          for (const accion of acciones) {
            const insertActionRequest = new sql.Request(transaction);
            await insertActionRequest
              .input('rolperm_id', sql.Int, rolperm_id)
              .input('acc_id', sql.Int, accion.acc_id)
              .input('permitido', sql.Bit, accion.permitido)
              .query(`
                INSERT INTO dbo.RolesPermisosAcciones (rolperm_id, acc_id, permitido)
                VALUES (@rolperm_id, @acc_id, @permitido)
              `);
          }
        }
      }
    }

    await transaction.commit();
    return { message: "Rol actualizado exitosamente" };
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

const deleteRole = async (rol_id) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('rol_id', sql.Int, rol_id)
      .query(`
        UPDATE dbo.Roles
        SET rol_activo = 0
        WHERE rol_id = @rol_id
      `);
    return { message: "Rol desactivado exitosamente" };
  } catch (error) {
    console.error('Error al desactivar rol:', error);
    throw error;
  }
};

export { getRoles, getRoleById, createRole, updateRole, deleteRole }; 