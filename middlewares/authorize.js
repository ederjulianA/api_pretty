// middlewares/authorize.js
//
// Autorizacion por rol. Complementa a verifyToken, que solo responde
// "¿este token es valido?" — nunca "¿este usuario puede hacer esto?".
//
// El rol se consulta contra la BD en cada request, NO se lee del JWT.
// El token dura 24h y lleva el rol congelado al momento del login: si a
// alguien se le retira el rol de administrador, su token viejo seguiria
// diciendo que lo es. Consultar la BD hace que el cambio surta efecto ya.
//
// CommonJS a proposito: asi lo pueden consumir tanto las rutas ESM
// (import) como las CommonJS (require) del proyecto, que es mixto.

const { sql, poolPromise } = require('../db.js');

// dbo.Roles verificado 2026-09-10: 1=Administrador, 2=Vendedor, 3=Supervisor.
const ROL_ADMINISTRADOR = 1;

/**
 * Exige que el usuario del token tenga el rol Administrador activo.
 * Debe montarse DESPUES de verifyToken, que es quien define req.user.
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.usu_cod) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(100), req.user.usu_cod)
      .input('rol_id', sql.Int, ROL_ADMINISTRADOR)
      .query(`
        SELECT TOP 1 1 AS es_admin
        FROM dbo.UsuariosRoles ur
        INNER JOIN dbo.Roles r ON r.rol_id = ur.rol_id
        WHERE ur.usu_cod = @usu_cod
          AND ur.rol_id = @rol_id
          AND r.rol_activo = 1
      `);

    if (result.recordset.length === 0) {
      // 403 y no 404: el usuario esta autenticado, simplemente no le alcanza.
      return res.status(403).json({
        success: false,
        message: 'Esta operacion requiere rol de administrador'
      });
    }

    return next();
  } catch (error) {
    console.error('Error verificando rol de administrador:', error);
    // Ante un fallo al verificar permisos se deniega. Nunca dejar pasar
    // "por si acaso": un error de BD no puede convertirse en un bypass.
    return res.status(500).json({
      success: false,
      message: 'No se pudo verificar los permisos'
    });
  }
};

/**
 * Exige que el usuario tenga acceso a un modulo del RBAC y, opcionalmente, a
 * una accion concreta dentro de el.
 *
 * Estructura real de las tablas, verificada contra la BD el 2026-09-10 (el
 * informe la habia deducido mal del codigo y proponia un mod_codigo que no
 * existe en RolesPermisos):
 *
 *   UsuariosRoles(usu_cod, rol_id) -> Roles(rol_id, rol_activo)
 *   RolesPermisos(rolperm_id, rol_id, mod_id, acceso)   -> acceso al modulo
 *   Modulos(mod_id, mod_codigo, mod_activo)
 *   Acciones(acc_id, mod_id, acc_codigo)                -> la accion pertenece a UN modulo
 *   RolesPermisosAcciones(rolperm_id, acc_id, permitido)
 *
 * Un usuario puede tener varios roles: basta con que uno se lo conceda.
 *
 * @param {string} mod_codigo  p.ej. 'admin', 'products', 'cierre_mes'
 * @param {string|null} acc_codigo  p.ej. 'manage_users'. Si es null, solo se
 *                                  exige acceso al modulo.
 */
const requirePermission = (mod_codigo, acc_codigo = null) => async (req, res, next) => {
  try {
    if (!req.user || !req.user.usu_cod) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(100), req.user.usu_cod)
      .input('mod_codigo', sql.VarChar(50), mod_codigo)
      .input('acc_codigo', sql.VarChar(50), acc_codigo)
      .query(`
        SELECT TOP 1 1 AS permitido
        FROM dbo.UsuariosRoles ur
        INNER JOIN dbo.Roles r
                ON r.rol_id = ur.rol_id AND r.rol_activo = 1
        INNER JOIN dbo.RolesPermisos rp
                ON rp.rol_id = r.rol_id AND rp.acceso = 1
        INNER JOIN dbo.Modulos m
                ON m.mod_id = rp.mod_id AND m.mod_codigo = @mod_codigo AND m.mod_activo = 1
        LEFT JOIN dbo.Acciones a
               ON a.mod_id = m.mod_id AND a.acc_codigo = @acc_codigo
        LEFT JOIN dbo.RolesPermisosAcciones rpa
               ON rpa.rolperm_id = rp.rolperm_id AND rpa.acc_id = a.acc_id
        WHERE ur.usu_cod = @usu_cod
          AND (@acc_codigo IS NULL OR rpa.permitido = 1)
      `);

    if (result.recordset.length === 0) {
      // Se registra para poder distinguir un permiso legitimamente denegado de
      // un mod_codigo/acc_codigo mal escrito, que denegaria a todo el mundo.
      console.warn(
        `[PERMISO-DENEGADO] usuario=${req.user.usu_cod} modulo=${mod_codigo} ` +
        `accion=${acc_codigo || '(solo modulo)'} ruta=${req.method} ${req.originalUrl}`
      );
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para realizar esta operacion'
      });
    }

    return next();
  } catch (error) {
    console.error('Error verificando permisos:', error);
    // Falla cerrado: un error de BD no puede convertirse en un bypass.
    return res.status(500).json({
      success: false,
      message: 'No se pudo verificar los permisos'
    });
  }
};

module.exports = { requireAdmin, requirePermission, ROL_ADMINISTRADOR };
