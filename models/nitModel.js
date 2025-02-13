// models/nitsModel.js
const { sql, poolPromise } = require('../db');

const getAllNits = async ({ nit_ide, nit_nom, PageNumber, PageSize }) => {
  try {
    const pool = await poolPromise;
    
    // Consulta parametrizada (sin los DECLARE, ya que usaremos .input() para definir los parámetros)
    const query = `
WITH NitBase AS (
    SELECT
        nit_sec,
        nit_ide,
        nit_nom,
        nit_tel,
        nit_email,
        nit_ind_cli,
        nit_ind_pro,
        nit_fec_cre,
        nit_dir,
        nit_con_pag,
        nit_bar,
        nit_ciudad,
        ciu_cod
    FROM dbo.nit
    WHERE 1 = 1
      AND (@nit_ide IS NULL OR nit_ide = @nit_ide)
      AND (@nit_nom IS NULL OR nit_nom LIKE '%' + @nit_nom + '%')
)
SELECT *
FROM NitBase
ORDER BY nit_nom
OFFSET (@PageNumber - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY;
    `;

    const result = await pool.request()
      .input('nit_ide', sql.VarChar(16), nit_ide)
      .input('nit_nom', sql.VarChar(100), nit_nom)
      .input('PageNumber', sql.Int, PageNumber)
      .input('PageSize', sql.Int, PageSize)
      .query(query);
      
    return result.recordset;
  } catch (error) {
    throw error;
  }
};

module.exports = { getAllNits };
