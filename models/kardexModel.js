import { sql, poolPromise } from "../db.js";

const getArticleKardex = async (art_cod, startDate = null, endDate = null) => {
  try {
    const pool = await poolPromise;

    // Primero, obtener el art_sec correspondiente al art_cod
    const getArtSecQuery = `
            SELECT art_sec 
            FROM dbo.articulos 
            WHERE art_cod = @art_cod;
        `;

    const artSecResult = await pool.request()
      .input('art_cod', sql.VarChar(30), art_cod)
      .query(getArtSecQuery);

    if (artSecResult.recordset.length === 0) {
      return {
        success: false,
        message: "Artículo no encontrado"
      };
    }

    const art_sec = artSecResult.recordset[0].art_sec;
    const request = pool.request();

    // Preparar los parámetros de fecha si se proporcionan
    let dateFilter = "";
    if (startDate && endDate) {
      dateFilter = "AND f.fac_fec BETWEEN @startDate AND @endDate";
      request
        .input('startDate', sql.Date, new Date(startDate))
        .input('endDate', sql.Date, new Date(endDate));
    }

    request.input('art_sec', sql.VarChar(30), art_sec);

    const query = `
      WITH KardexMovements AS (
        SELECT 
          f.fac_nro as documento,
          f.fac_fec as fecha,
          f.fac_tip_cod as tipo_documento,
          fk.kar_nat as naturaleza,
          fk.kar_uni as cantidad,
          ROW_NUMBER() OVER (ORDER BY f.fac_fec, f.fac_sec) as row_num
        FROM dbo.facturakardes fk
        INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
        WHERE fk.art_sec = @art_sec
        AND f.fac_est_fac = 'A'
        AND fk.kar_nat IN ('+', '-')
        ${dateFilter}
      )
      SELECT 
        k.*,
        SUM(CASE WHEN k.naturaleza = '+' THEN k.cantidad ELSE -k.cantidad END) 
        OVER (ORDER BY k.row_num) as saldo
      FROM KardexMovements k
      ORDER BY k.fecha, k.row_num;
    `;

    const result = await request.query(query);

    // Obtener información del artículo
    const articleQuery = `
      SELECT 
        a.art_cod,
        a.art_nom,
        ve.existencia as stock_actual
      FROM dbo.articulos a
      LEFT JOIN dbo.vwExistencias ve ON a.art_sec = ve.art_sec
      WHERE a.art_sec = @art_sec;
    `;

    const articleResult = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .query(articleQuery);

    return {
      success: true,
      article: articleResult.recordset[0] || null,
      movements: result.recordset,
      summary: {
        totalEntries: result.recordset.length,
        finalBalance: result.recordset.length > 0 ? result.recordset[result.recordset.length - 1].saldo : 0
      }
    };
  } catch (error) {
    console.error('Error en getArticleKardex:', error);
    throw error;
  }
};

export { getArticleKardex }; 