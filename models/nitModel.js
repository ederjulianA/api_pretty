// models/nitsModel.js
const { sql, poolPromise } = require('../db');

const createNit = async ({ nit_ide, nit_nom, nit_tel, nit_email, nit_dir, ciu_cod }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Usamos una única instancia de Request ligada a la transacción
    let request = new sql.Request(transaction);

    // Validación 1: Verificar que la ciudad exista en la tabla Ciudad
    const cityResult = await request
      .input('ciu_cod', sql.VarChar(5), ciu_cod)
      .query("SELECT COUNT(*) AS count FROM dbo.Ciudad WHERE ciu_cod = @ciu_cod");
    if (cityResult.recordset[0].count < 1) {
      throw new Error("Error de ciudad, ");
    }

    // Validación 2: Verificar que el nit_ide sea único en la tabla nit
    const nitResult = await request
      .input('nit_ide', sql.VarChar(16), nit_ide)
      .query("SELECT COUNT(*) AS count FROM dbo.nit WHERE nit_ide = @nit_ide");
    if (nitResult.recordset[0].count > 0) {
      throw new Error("Ya existe un cliente registrado con la cédula : " + nit_ide);
    }

    // Obtener el nuevo consecutivo para nit_sec desde la tabla secuencia (para 'CLIENTES')
    const seqQuery = `
      SELECT CAST(sec_num + 1 AS VARCHAR(16)) AS NewNitSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'CLIENTES'
    `;
    const seqResult = await request.query(seqQuery);
    if (!seqResult.recordset || seqResult.recordset.length === 0) {
      throw new Error("No se encontró la secuencia para 'CLIENTES'.");
    }
    const NewNitSec = seqResult.recordset[0].NewNitSec;

    // Actualizar la secuencia en la tabla secuencia para 'CLIENTES'
    await request
      .input('sec_cod', sql.VarChar(50), 'CLIENTES')
      .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");

    // Insertar en la tabla nit
    const insertQuery = `
      INSERT INTO dbo.nit 
        (nit_sec, nit_ide, nit_nom, nit_tel, nit_email, nit_ind_cli, nit_ind_pro, nit_fec_cre, nit_dir, nit_con_pag, ciu_cod)
      VALUES
        (@NewNitSec, @nit_ide, @nit_nom, @nit_tel, @nit_email, 'S', 'N', CONVERT(date, GETDATE()), @nit_dir, 0, @ciu_cod)
    `;
    await request
      .input('NewNitSec', sql.VarChar(16), NewNitSec)
      .input('nit_nom', sql.VarChar(100), nit_nom)
      .input('nit_tel', sql.VarChar(20), nit_tel)
      .input('nit_email', sql.VarChar(100), nit_email)
      .input('nit_dir', sql.VarChar(100), nit_dir)
      .query(insertQuery);

    await transaction.commit();
    return { nit_sec: NewNitSec, message: "Registro de Nit creado exitosamente." };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw error;
  }
};

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

module.exports = { getAllNits, createNit };
