// controllers/authController.js
import { sql, poolPromise } from "../db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getUserPermissions } from "../models/userRoleModel.js";

const loginUser = async (req, res) => {
  try {
    const { usu_cod, usu_pass } = req.body;

    // Validar que se proporcionaron las credenciales
    if (!usu_cod || !usu_pass) {
      return res.status(400).json({
        success: false,
        message: "Se requieren usuario y contraseña"
      });
    }

    const pool = await poolPromise;
    
    // Buscar el usuario en la base de datos
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(20), usu_cod)
      .query(`
        SELECT u.usu_cod, u.usu_nom, u.usu_pass,
               r.rol_id, r.rol_nombre
        FROM dbo.Usuarios u
        LEFT JOIN dbo.UsuariosRoles ur ON u.usu_cod = ur.usu_cod
        LEFT JOIN dbo.Roles r ON ur.rol_id = r.rol_id
        WHERE u.usu_cod = @usu_cod
          AND r.rol_activo = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas"
      });
    }

    const user = result.recordset[0];

    // Verificar la contraseña
    const validPassword = await bcrypt.compare(usu_pass, user.usu_pass);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas"
      });
    }

    // Obtener los permisos del usuario
    const permisos = await getUserPermissions(usu_cod);

    // Formatear los permisos en la estructura requerida
    const permisosFormateados = {};
    permisos.forEach(permiso => {
      if (!permisosFormateados[permiso.mod_codigo]) {
        permisosFormateados[permiso.mod_codigo] = {
          access: permiso.acceso === 1,
          actions: []
        };
      }
      if (permiso.acc_codigo && permiso.permitido === 1) {
        permisosFormateados[permiso.mod_codigo].actions.push(permiso.acc_codigo);
      }
    });

    // Generar el token JWT
    const token = jwt.sign(
      {
        usu_cod: user.usu_cod,
        usu_nom: user.usu_nom,
        rol_id: user.rol_id,
        rol_nombre: user.rol_nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Enviar la respuesta
    res.json({
      success: true,
      token,
      usuario: user.usu_nom,
      rol: user.rol_nombre,
      permisos: permisosFormateados
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud"
    });
  }
};

const getCurrentPermissions = async (req, res) => {
  try {
    const { usu_cod } = req.user;

    // Obtener los permisos del usuario
    const permisos = await getUserPermissions(usu_cod);

    // Formatear los permisos en la estructura requerida
    const permisosFormateados = {};
    permisos.forEach(permiso => {
      if (!permisosFormateados[permiso.mod_codigo]) {
        permisosFormateados[permiso.mod_codigo] = {
          access: permiso.acceso === 1,
          actions: []
        };
      }
      if (permiso.acc_codigo && permiso.permitido === 1) {
        permisosFormateados[permiso.mod_codigo].actions.push(permiso.acc_codigo);
      }
    });

    res.json({
      success: true,
      permisos: permisosFormateados
    });

  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud"
    });
  }
};

export { loginUser, getCurrentPermissions };
