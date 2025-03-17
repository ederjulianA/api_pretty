// models/ciudadesModel.js
const { sql, poolPromise } = require('../db');

const getCiudades = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM ciudad");
    return result.recordset;
  } catch (error) {
    throw error;
  }
};

module.exports = { getCiudades };
