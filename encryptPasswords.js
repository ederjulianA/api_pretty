// encryptPasswords.js
const sql = require('mssql');
const bcrypt = require('bcrypt');
require('dotenv').config();
const { poolPromise } = require('./db'); // Asegúrate de tener configurado tu db.js

async function encryptPasswords() {
  try {
    const pool = await poolPromise;
    // Obtener todos los usuarios
    const result = await pool.request().query('SELECT usu_cod, usu_pass FROM Usuarios');
    const users = result.recordset;

    for (const user of users) {
      const plainPassword = user.usu_pass;
      // Si la contraseña ya comienza con "$2b$", asumimos que ya está encriptada
      if (!plainPassword.startsWith('$2b$')) {
        // Encriptar la contraseña con un salt de 10 rounds (puedes ajustar este valor)
        const hashed = await bcrypt.hash(plainPassword, 10);
        // Actualizar el registro con la contraseña encriptada
        await pool.request()
          .input('usu_cod', sql.VarChar(100), user.usu_cod)
          .input('usu_pass', sql.VarChar(100), hashed)
          .query('UPDATE Usuarios SET usu_pass = @usu_pass WHERE usu_cod = @usu_cod');
        console.log(`Usuario ${user.usu_cod} actualizado.`);
      } else {
        console.log(`Usuario ${user.usu_cod} ya tiene contraseña encriptada.`);
      }
    }

    console.log("Proceso completado.");
    pool.close();
  } catch (error) {
    console.error("Error encriptando contraseñas:", error);
  }
}

encryptPasswords();
