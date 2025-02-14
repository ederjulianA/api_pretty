// models/userModel.js
const { sql, poolPromise } = require('../db');

const findUserByCod = async (usu_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(100), usu_cod)
      .query('SELECT * FROM Usuarios WHERE usu_cod = @usu_cod');
    return result.recordset[0]; // Retorna el usuario encontrado o undefined si no existe
  } catch (error) {
    throw error;
  }
};

module.exports = { findUserByCod };
