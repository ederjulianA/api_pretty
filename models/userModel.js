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

const getAllUsers = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query('SELECT u.usu_cod as id, u.usu_nom as name, u.usu_email as email, ur.rol_id, r.rol_nombre FROM Usuarios u LEFT JOIN UsuariosRoles ur ON ur.usu_cod = u.usu_cod left join Roles r on r.rol_id = ur.rol_id');
    return result.recordset;
  } catch (error) {
    throw error;
  }
};

const createUser = async ({ name, email, role_id }) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Insertar usuario
    const userResult = await transaction.request()
      .input('usu_nom', sql.VarChar(100), name)
      .input('usu_email', sql.VarChar(100), email)
      .query('INSERT INTO Usuarios (usu_nom, usu_email) OUTPUT INSERTED.usu_cod as id VALUES (@usu_nom, @usu_email)');
    const usu_cod = userResult.recordset[0].id;
    // Insertar relación usuario-rol
    await transaction.request()
      .input('usu_cod', sql.VarChar(100), usu_cod)
      .input('rol_id', sql.Int, role_id)
      .query('INSERT INTO UsuariosRoles (usu_cod, rol_id) VALUES (@usu_cod, @rol_id)');
    await transaction.commit();
    return { id: usu_cod, name, email, role_id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateUser = async (id, { name, email, role_id }) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Actualizar datos del usuario
    await transaction.request()
      .input('usu_cod', sql.VarChar(100), id)
      .input('usu_nom', sql.VarChar(100), name)
      .input('usu_email', sql.VarChar(100), email)
      .query('UPDATE Usuarios SET usu_nom = @usu_nom, usu_email = @usu_email WHERE usu_cod = @usu_cod');
    // Actualizar rol en UsuariosRoles
    // Verificar si existe el registro
    const checkResult = await transaction.request()
      .input('usu_cod', sql.VarChar(100), id)
      .query('SELECT 1 FROM UsuariosRoles WHERE usu_cod = @usu_cod');

    if (checkResult.recordset.length > 0) {
      // Si existe, actualizar
      await transaction.request()
        .input('usu_cod', sql.VarChar(100), id)
        .input('rol_id', sql.Int, role_id)
        .query('UPDATE UsuariosRoles SET rol_id = @rol_id WHERE usu_cod = @usu_cod');
    } else {
      // Si no existe, insertar
      await transaction.request()
        .input('usu_cod', sql.VarChar(100), id)
        .input('rol_id', sql.Int, role_id)
        .query('INSERT INTO UsuariosRoles (usu_cod, rol_id) VALUES (@usu_cod, @rol_id)');
    }
    await transaction.commit();
    return { name, email, role_id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { findUserByCod, getAllUsers, createUser, updateUser };
