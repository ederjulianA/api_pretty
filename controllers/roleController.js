import { sql, poolPromise } from "../db.js";

const getRoles = async (req, res) => {
  try {
    const { page = 1, limit = 10, active = true } = req.query;
    const offset = (page - 1) * limit;
    const pool = await poolPromise;
    let query = `
      SELECT 
        r.rol_id as id,
        r.rol_nombre as name,
        r.rol_descripcion as description,
        r.rol_activo as active
      FROM dbo.Roles r
      WHERE 1=1
    `;
    if (active !== undefined) {
      query += ` AND r.rol_activo = @active`;
    }
    const countQuery = query.replace('r.rol_id as id, r.rol_nombre as name, r.rol_descripcion as description, r.rol_activo as active', 'COUNT(*) as total');
    const countResult = await pool.request()
      .input('active', sql.Bit, active === 'true')
      .query(countQuery);
    if (!countResult.recordset || countResult.recordset.length === 0) {
      return res.json({
        success: true,
        roles: [],
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: parseInt(page)
        }
      });
    }
    const totalItems = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalItems / limit);
    query += ` ORDER BY r.rol_nombre
               OFFSET @offset ROWS
               FETCH NEXT @limit ROWS ONLY`;
    const result = await pool.request()
      .input('active', sql.Bit, active === 'true')
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, parseInt(limit))
      .query(query);
    res.json({
      success: true,
      roles: result.recordset,
      pagination: {
        totalItems,
        totalPages,
        currentPage: parseInt(page)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message
    });
  }
};

const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const roleResult = await pool.request()
      .input('rol_id', sql.Int, id)
      .query(`
        SELECT 
          r.rol_id as id,
          r.rol_nombre as name,
          r.rol_descripcion as description,
          r.rol_activo as active
        FROM dbo.Roles r
        WHERE r.rol_id = @rol_id
      `);
    if (roleResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado"
      });
    }
    const permissionsResult = await pool.request()
      .input('rol_id', sql.Int, id)
      .query(`
        SELECT 
          m.mod_codigo as module_code,
          m.mod_nombre as module_name,
          rp.acceso as access,
          a.acc_codigo as action_code,
          a.acc_nombre as action_name,
          rpa.permitido as allowed
        FROM dbo.RolesPermisos rp
        INNER JOIN dbo.Modulos m ON rp.mod_id = m.mod_id
        LEFT JOIN dbo.RolesPermisosAcciones rpa ON rp.rolperm_id = rpa.rolperm_id
        LEFT JOIN dbo.Acciones a ON rpa.acc_id = a.acc_id
        WHERE rp.rol_id = @rol_id
          AND m.mod_activo = 1
        ORDER BY m.mod_codigo, a.acc_codigo
      `);
    const permissions = {};
    permissionsResult.recordset.forEach(perm => {
      if (!permissions[perm.module_code]) {
        permissions[perm.module_code] = {
          access: perm.access == 1,
          actions: []
        };
      }
      if (
        perm.action_code &&
        perm.allowed == 1 &&
        !permissions[perm.module_code].actions.includes(perm.action_code)
      ) {
        permissions[perm.module_code].actions.push(perm.action_code);
      }
    });
    const role = {
      ...roleResult.recordset[0],
      permissions
    };
    res.json({
      success: true,
      role
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message
    });
  }
};

const createRole = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { name, description, permissions } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: ["El nombre del rol es requerido"]
      });
    }
    const roleResult = await transaction.request()
      .input('rol_nombre', sql.VarChar(100), name)
      .input('rol_descripcion', sql.VarChar(500), description || '')
      .query(`
        INSERT INTO dbo.Roles (rol_nombre, rol_descripcion, rol_activo)
        OUTPUT INSERTED.rol_id
        VALUES (@rol_nombre, @rol_descripcion, 1)
      `);
    const rol_id = roleResult.recordset[0].rol_id;
    for (const [moduleCode, modulePerm] of Object.entries(permissions)) {
      const moduleResult = await transaction.request()
        .input('mod_codigo', sql.VarChar(50), moduleCode)
        .query('SELECT mod_id FROM dbo.Modulos WHERE mod_codigo = @mod_codigo');
      if (moduleResult.recordset.length === 0) continue;
      const mod_id = moduleResult.recordset[0].mod_id;
      const permResult = await transaction.request()
        .input('rol_id', sql.Int, rol_id)
        .input('mod_id', sql.Int, mod_id)
        .input('acceso', sql.Bit, modulePerm.access ? 1 : 0)
        .query(`
          INSERT INTO dbo.RolesPermisos (rol_id, mod_id, acceso)
          OUTPUT INSERTED.rolperm_id
          VALUES (@rol_id, @mod_id, @acceso)
        `);
      const rolperm_id = permResult.recordset[0].rolperm_id;
      if (modulePerm.actions && modulePerm.actions.length > 0) {
        for (const actionCode of modulePerm.actions) {
          const actionResult = await transaction.request()
            .input('mod_id', sql.Int, mod_id)
            .input('acc_codigo', sql.VarChar(50), actionCode)
            .query('SELECT acc_id FROM dbo.Acciones WHERE mod_id = @mod_id AND acc_codigo = @acc_codigo');
          if (actionResult.recordset.length === 0) continue;
          const acc_id = actionResult.recordset[0].acc_id;
          await transaction.request()
            .input('rolperm_id', sql.Int, rolperm_id)
            .input('acc_id', sql.Int, acc_id)
            .input('permitido', sql.Bit, 1)
            .query(`
              INSERT INTO dbo.RolesPermisosAcciones (rolperm_id, acc_id, permitido)
              VALUES (@rolperm_id, @acc_id, @permitido)
            `);
        }
      }
    }
    await transaction.commit();
    res.status(201).json({
      success: true,
      message: "Rol creado exitosamente",
      role: {
        id: rol_id,
        name,
        description
      }
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud"
    });
  }
};

const updateRole = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const roleCheck = await transaction.request()
      .input('rol_id', sql.Int, id)
      .query('SELECT rol_id FROM dbo.Roles WHERE rol_id = @rol_id');
    if (roleCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado"
      });
    }
    await transaction.request()
      .input('rol_id', sql.Int, id)
      .input('rol_nombre', sql.VarChar(100), name)
      .input('rol_descripcion', sql.VarChar(500), description || '')
      .query(`
        UPDATE dbo.Roles
        SET rol_nombre = @rol_nombre,
            rol_descripcion = @rol_descripcion
        WHERE rol_id = @rol_id
      `);
    await transaction.request()
      .input('rol_id', sql.Int, id)
      .query(`
        DELETE FROM dbo.RolesPermisosAcciones
        WHERE rolperm_id IN (
          SELECT rolperm_id FROM dbo.RolesPermisos WHERE rol_id = @rol_id
        );
        DELETE FROM dbo.RolesPermisos WHERE rol_id = @rol_id;
      `);
    for (const [moduleCode, modulePerm] of Object.entries(permissions)) {
      const moduleResult = await transaction.request()
        .input('mod_codigo', sql.VarChar(50), moduleCode)
        .query('SELECT mod_id FROM dbo.Modulos WHERE mod_codigo = @mod_codigo');
      if (moduleResult.recordset.length === 0) continue;
      const mod_id = moduleResult.recordset[0].mod_id;
      const permResult = await transaction.request()
        .input('rol_id', sql.Int, id)
        .input('mod_id', sql.Int, mod_id)
        .input('acceso', sql.Bit, modulePerm.access ? 1 : 0)
        .query(`
          INSERT INTO dbo.RolesPermisos (rol_id, mod_id, acceso)
          OUTPUT INSERTED.rolperm_id
          VALUES (@rol_id, @mod_id, @acceso)
        `);
      const rolperm_id = permResult.recordset[0].rolperm_id;
      if (modulePerm.actions && modulePerm.actions.length > 0) {
        for (const actionCode of modulePerm.actions) {
          const actionResult = await transaction.request()
            .input('mod_id', sql.Int, mod_id)
            .input('acc_codigo', sql.VarChar(50), actionCode)
            .query('SELECT acc_id FROM dbo.Acciones WHERE mod_id = @mod_id AND acc_codigo = @acc_codigo');
          if (actionResult.recordset.length === 0) continue;
          const acc_id = actionResult.recordset[0].acc_id;
          await transaction.request()
            .input('rolperm_id', sql.Int, rolperm_id)
            .input('acc_id', sql.Int, acc_id)
            .input('permitido', sql.Bit, 1)
            .query(`
              INSERT INTO dbo.RolesPermisosAcciones (rolperm_id, acc_id, permitido)
              VALUES (@rolperm_id, @acc_id, @permitido)
            `);
        }
      }
    }
    await transaction.commit();
    res.json({
      success: true,
      message: "Rol actualizado exitosamente",
      role: {
        id: parseInt(id),
        name,
        description
      }
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud"
    });
  }
};

const deleteRole = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { id } = req.params;
    const userCheck = await transaction.request()
      .input('rol_id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM dbo.UsuariosRoles WHERE rol_id = @rol_id');
    if (userCheck.recordset[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "No se puede eliminar el rol porque tiene usuarios asignados"
      });
    }
    await transaction.request()
      .input('rol_id', sql.Int, id)
      .query(`
        DELETE FROM dbo.RolesPermisosAcciones
        WHERE rolperm_id IN (
          SELECT rolperm_id FROM dbo.RolesPermisos WHERE rol_id = @rol_id
        );
        DELETE FROM dbo.RolesPermisos WHERE rol_id = @rol_id;
      `);
    await transaction.request()
      .input('rol_id', sql.Int, id)
      .query('DELETE FROM dbo.Roles WHERE rol_id = @rol_id');
    await transaction.commit();
    res.json({
      success: true,
      message: "Rol eliminado exitosamente"
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud"
    });
  }
};

export { getRoles, getRoleById, createRole, updateRole, deleteRole }; 