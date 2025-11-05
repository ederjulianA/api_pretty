// controllers/authController.js
import { sql, poolPromise } from "../db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
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
               r.rol_id, r.rol_nombre, u.usu_cambia_pass
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

    const secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();

    // Generar el token JWT
    const token = jwt.sign(
      {
        usu_cod: user.usu_cod,
        usu_nom: user.usu_nom,
        rol_id: user.rol_id,
        rol_nombre: user.rol_nombre
      },
     secretKey,
      { 
        algorithm: 'HS256',
        expiresIn: '24h' 
      }
    );

    // Enviar la respuesta
    res.json({
      success: true,
      token,
      usuario: user.usu_cod,
      usuario_nombre: user.usu_nom,
      rol: user.rol_nombre,
      cambia_pass: user.usu_cambia_pass,
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

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const { usu_cod } = req.user;

        // Validar que se proporcionen ambas contraseñas
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Por favor complete todos los campos requeridos'
            });
        }

        const pool = await poolPromise;
        
        // Obtener el usuario actual
        const result = await pool.request()
            .input('usu_cod', sql.VarChar(20), usu_cod)
            .query(`
                SELECT usu_cod, usu_pass
                FROM dbo.Usuarios
                WHERE usu_cod = @usu_cod
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró la cuenta'
            });
        }

        const user = result.recordset[0];

        // Verificar que la contraseña actual sea correcta
        const isValidPassword = await bcrypt.compare(currentPassword, user.usu_pass);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Validar que la nueva contraseña sea diferente a la actual
        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña debe ser diferente a la actual'
            });
        }

        // Validar requisitos de seguridad de la nueva contraseña
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            const errors = [];
            if (newPassword.length < 8) errors.push('tener al menos 8 caracteres');
            if (!/[A-Z]/.test(newPassword)) errors.push('contener al menos una letra mayúscula');
            if (!/[a-z]/.test(newPassword)) errors.push('contener al menos una letra minúscula');
            if (!/\d/.test(newPassword)) errors.push('contener al menos un número');
            if (!/[@$!%*?&.]/.test(newPassword)) errors.push('contener al menos un carácter especial (@$!%*?&.)');

            return res.status(400).json({
                success: false,
                message: 'La contraseña debe ' + errors.join(', ')
            });
        }

        // Encriptar la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Actualizar la contraseña en la base de datos
        await pool.request()
            .input('usu_cod', sql.VarChar(20), usu_cod)
            .input('usu_pass', sql.VarChar(255), hashedPassword)
            .query(`
                UPDATE dbo.Usuarios
                SET usu_pass = @usu_pass,
                    usu_cambia_pass = 0
                WHERE usu_cod = @usu_cod
            `);

        res.json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });

    } catch (error) {
        console.error('Error al cambiar la contraseña:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un error al procesar la solicitud'
        });
    }
};

const changePasswordAdmin = async (req, res) => {
    try {
        const { usu_cod, newPassword } = req.body;

        // Validar que se proporcionen los datos requeridos
        if (!usu_cod || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Por favor complete todos los campos requeridos'
            });
        }

        const pool = await poolPromise;
        
        // Verificar que el usuario existe
        const result = await pool.request()
            .input('usu_cod', sql.VarChar(20), usu_cod)
            .query(`
                SELECT usu_cod
                FROM dbo.Usuarios
                WHERE usu_cod = @usu_cod
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró la cuenta del usuario'
            });
        }

        // Validar requisitos de seguridad de la nueva contraseña
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            const errors = [];
            if (newPassword.length < 8) errors.push('tener al menos 8 caracteres');
            if (!/[A-Z]/.test(newPassword)) errors.push('contener al menos una letra mayúscula');
            if (!/[a-z]/.test(newPassword)) errors.push('contener al menos una letra minúscula');
            if (!/\d/.test(newPassword)) errors.push('contener al menos un número');
            if (!/[@$!%*?&.]/.test(newPassword)) errors.push('contener al menos un carácter especial (@$!%*?&.)');

            return res.status(400).json({
                success: false,
                message: 'La contraseña debe ' + errors.join(', ')
            });
        }

        // Encriptar la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Actualizar la contraseña en la base de datos
        await pool.request()
            .input('usu_cod', sql.VarChar(20), usu_cod)
            .input('usu_pass', sql.VarChar(255), hashedPassword)
            .query(`
                UPDATE dbo.Usuarios
                SET usu_pass = @usu_pass,
                    usu_cambia_pass = 1
                WHERE usu_cod = @usu_cod
            `);

        res.json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });

    } catch (error) {
        console.error('Error al cambiar la contraseña:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un error al procesar la solicitud'
        });
    }
};

export { loginUser, getCurrentPermissions, changePassword, changePasswordAdmin };
 