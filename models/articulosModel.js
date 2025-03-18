// models/articulosModel.js
const { sql, poolPromise } = require('../db');


const validateArticulo = async ({ art_cod, art_woo_id }) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    // Si no se proporciona ninguno, se lanza un error.
    if (!art_cod && !art_woo_id) {
      throw new Error("Se debe proporcionar al menos art_cod o art_woo_id.");
    }

    // Configuramos los parámetros. Si alguno no se proporciona, lo dejamos en null.
    request.input('art_cod', sql.VarChar(50), art_cod || null);
    request.input('art_woo_id', sql.VarChar(50), art_woo_id || null);

    // Consulta: se busca cualquier registro donde se cumpla:
    // (@art_cod IS NOT NULL AND art_cod = @art_cod) OR (@art_woo_id IS NOT NULL AND art_woo_id = @art_woo_id)
    const query = `
      SELECT COUNT(*) AS count 
      FROM dbo.articulos 
      WHERE 
        ((@art_cod IS NOT NULL AND art_cod = @art_cod)
         OR (@art_woo_id IS NOT NULL AND art_woo_id = @art_woo_id))
    `;
    const result = await request.query(query);
    const count = result.recordset[0].count;
    return count > 0;
  } catch (error) {
    throw error;
  }
};


const getArticulos = async ({ codigo, nombre, inv_gru_cod, inv_sub_gru_cod, tieneExistencia, PageNumber, PageSize }) => {
  try {
    const pool = await poolPromise;
    
    const query = `
WITH ArticulosBase AS (
    SELECT
        a.art_sec,
        a.art_cod,
        a.art_woo_id,
        a.art_nom,
        a.art_url_img_servi,
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS sub_categoria,
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor,
        ISNULL(e.existencia, 0) AS existencia
    FROM dbo.articulos a
        INNER JOIN dbo.inventario_subgrupo isg
            ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        INNER JOIN dbo.inventario_grupo ig
            ON isg.inv_gru_cod = ig.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1
            ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad2
            ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
        LEFT JOIN dbo.vwExistencias e
            ON a.art_sec = e.art_sec
    WHERE 1 = 1
      AND (@codigo IS NULL OR a.art_cod = @codigo)
      AND (@nombre IS NULL OR a.art_nom LIKE '%' + @nombre + '%')
      -- Aplicamos el filtro en la unión, pero también aquí para mayor claridad:
      AND (@inv_gru_cod IS NULL OR ig.inv_gru_cod = @inv_gru_cod)
      AND (@inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod = @inv_sub_gru_cod)
      AND (
             @tieneExistencia IS NULL 
             OR (@tieneExistencia = 1 AND ISNULL(e.existencia, 0) > 0)
             OR (@tieneExistencia = 0 AND ISNULL(e.existencia, 0) = 0)
          )
)
SELECT *
FROM ArticulosBase
ORDER BY art_nom
OFFSET (@PageNumber - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY
OPTION (RECOMPILE);
    `;

    const result = await pool.request()
      .input('codigo', sql.VarChar(30), codigo)
      .input('nombre', sql.VarChar(100), nombre)
      .input('inv_gru_cod', sql.VarChar(16), inv_gru_cod)
      .input('inv_sub_gru_cod', sql.VarChar(16), inv_sub_gru_cod)
      .input('tieneExistencia', sql.Bit, typeof tieneExistencia !== 'undefined' ? tieneExistencia : null)
      .input('PageNumber', sql.Int, PageNumber)
      .input('PageSize', sql.Int, PageSize)
      .query(query);
      
    return result.recordset;
  } catch (error) {
    throw error;
  }
};

const createArticulo = async ({ art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal, precio_mayor }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    // Usamos un request vinculado a la transacción
    const request = new sql.Request(transaction);
    
    // 1. Obtener el nuevo consecutivo para art_sec desde la tabla secuencia
    const seqQuery = `
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `;
    const seqResult = await request.query(seqQuery);
    if (!seqResult.recordset || seqResult.recordset.length === 0) {
      throw new Error("No se encontró la secuencia para 'ARTICULOS'.");
    }
    const NewArtSec = seqResult.recordset[0].NewArtSec;
    
    // 2. Actualizar la secuencia para 'ARTICULOS'
    await request
      .input('sec_cod', sql.VarChar(50), 'ARTICULOS')
      .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");
    
    // 3. Insertar en la tabla articulos
    const insertArticuloQuery = `
      INSERT INTO dbo.articulos (art_sec, art_cod, art_nom, inv_sub_gru_cod, art_woo_id,pre_sec)
      VALUES (@NewArtSec, @art_cod, @art_nom, @subcategoria, @art_woo_id,'1')
    `;
    await request
      .input('NewArtSec', sql.Decimal(18, 0), NewArtSec)
      .input('art_cod', sql.VarChar(50), art_cod)
      .input('art_nom', sql.VarChar(250), art_nom)
      .input('categoria', sql.VarChar(50), categoria)
      .input('subcategoria', sql.VarChar(50), subcategoria)
      .input('art_woo_id', sql.VarChar(50), art_woo_id)
      .query(insertArticuloQuery);
    
    // 4. Insertar primer registro en articulosdetalle (Precio detall)
    const insertDetalle1Query = `
      INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
      VALUES (@NewArtSec, '1', 1, @precio_detal)
    `;
    await request
      .input('precio_detal', sql.Decimal(17, 2), precio_detal)
      .query(insertDetalle1Query);
    
    // 5. Insertar segundo registro en articulosdetalle (Precio mayor)
    const insertDetalle2Query = `
      INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
      VALUES (@NewArtSec, '1', 2, @precio_mayor)
    `;
    await request
      .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
      .query(insertDetalle2Query);
    
    await transaction.commit();
    return { art_sec: NewArtSec, message: "Artículo creado exitosamente." };
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

module.exports = { getArticulos, validateArticulo, createArticulo };
