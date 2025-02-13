// models/cursosModel.js
const { sql, poolPromise } = require('../db');

// Obtener todos los cursos
const getAllCategories = async () => {
    try {
        const pool = await poolPromise;
          // Consulta para obtener los registros paginados
       const dataResult = await pool.request()
          .query(`
            SELECT * FROM inventario_grupo
            ORDER BY inv_gru_cod
          `);

  
       return {

          data: dataResult.recordset           // Los cursos de la página solicitada
        };
    } catch (error) {
      throw error;
    }
  };

  module.exports = { getAllCategories };