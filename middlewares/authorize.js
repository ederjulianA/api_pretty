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

module.exports = { requireAdmin, ROL_ADMINISTRADOR };
