// models/inventarioSubgrupoModel.js
const { sql, poolPromise } = require('../db');

const getInventarioSubgrupos = async (inv_gru_cod) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    let query;
    
    if (inv_gru_cod) {
      query = "SELECT * FROM inventario_subgrupo WHERE inv_gru_cod = @inv_gru_cod";
      request.input('inv_gru_cod', sql.VarChar(50), inv_gru_cod);
    } else {
      query = "SELECT * FROM inventario_subgrupo";
    }
    
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    throw error;
  }
};

module.exports = { getInventarioSubgrupos };
