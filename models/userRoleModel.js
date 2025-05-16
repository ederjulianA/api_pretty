import { sql, poolPromise } from "../db.js";

const getUserRoles = async (usu_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(20), usu_cod)
      .query(`
        SELECT ur.usurol_id, ur.usu_cod, ur.rol_id, ur.fecha_asignacion,
               r.rol_nombre, r.rol_descripcion,
               m.mod_id, m.mod_codigo, m.mod_nombre,
               a.acc_id, a.acc_codigo, a.acc_nombre,
               rp.acceso,
               rpa.permitido
        FROM dbo.UsuariosRoles ur
        INNER JOIN dbo.Roles r ON ur.rol_id = r.rol_id
        LEFT JOIN dbo.RolesPermisos rp ON r.rol_id = rp.rol_id
        LEFT JOIN dbo.Modulos m ON rp.mod_id = m.mod_id
        LEFT JOIN dbo.RolesPermisosAcciones rpa ON rp.rolperm_id = rpa.rolperm_id
        LEFT JOIN dbo.Acciones a ON rpa.acc_id = a.acc_id
        WHERE ur.usu_cod = @usu_cod
          AND r.rol_activo = 1
        ORDER BY r.rol_nombre, m.mod_nombre, a.acc_nombre
      `);
    return result.recordset;
  } catch (error) {
    console.error('Error al obtener roles de usuario:', error);
    throw error;
  }
};

const assignRoleToUser = async ({ usu_cod, rol_id }) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('usu_cod', sql.VarChar(20), usu_cod)
      .input('rol_id', sql.Int, rol_id)
      .query(`
        INSERT INTO dbo.UsuariosRoles (usu_cod, rol_id, fecha_asignacion)
        VALUES (@usu_cod, @rol_id, GETDATE())
      `);
    return { message: "Rol asignado exitosamente" };
  } catch (error) {
    console.error('Error al asignar rol:', error);
    throw error;
  }
};

const removeRoleFromUser = async ({ usu_cod, rol_id }) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('usu_cod', sql.VarChar(20), usu_cod)
      .input('rol_id', sql.Int, rol_id)
      .query(`
        DELETE FROM dbo.UsuariosRoles
        WHERE usu_cod = @usu_cod AND rol_id = @rol_id
      `);
    return { message: "Rol removido exitosamente" };
  } catch (error) {
    console.error('Error al remover rol:', error);
    throw error;
  }
};

const getUserPermissions = async (usu_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(20), usu_cod)
      .query(`
        SELECT DISTINCT
          m.mod_id,
          m.mod_codigo,
          m.mod_nombre,
          a.acc_id,
          a.acc_codigo,
          a.acc_nombre,
          MAX(CAST(rp.acceso AS INT)) as acceso,
          MAX(CAST(rpa.permitido AS INT)) as permitido
        FROM dbo.UsuariosRoles ur
        INNER JOIN dbo.Roles r ON ur.rol_id = r.rol_id
        INNER JOIN dbo.RolesPermisos rp ON r.rol_id = rp.rol_id
        INNER JOIN dbo.Modulos m ON rp.mod_id = m.mod_id
        LEFT JOIN dbo.RolesPermisosAcciones rpa ON rp.rolperm_id = rpa.rolperm_id
        LEFT JOIN dbo.Acciones a ON rpa.acc_id = a.acc_id
        WHERE ur.usu_cod = @usu_cod
          AND r.rol_activo = 1
          AND m.mod_activo = 1
        GROUP BY m.mod_id, m.mod_codigo, m.mod_nombre, a.acc_id, a.acc_codigo, a.acc_nombre
        ORDER BY m.mod_nombre, a.acc_nombre
      `);
    return result.recordset;
  } catch (error) {
    console.error('Error al obtener permisos de usuario:', error);
    throw error;
  }
};

export { getUserRoles, assignRoleToUser, removeRoleFromUser, getUserPermissions }; 