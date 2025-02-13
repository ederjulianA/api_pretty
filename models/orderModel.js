// models/orderModel.js
const { sql, poolPromise } = require('../db');

const createCompleteOrder = async ({ nit_sec, fac_tip_cod = 'VTA', detalles }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Usamos un request vinculado a la transacción para el encabezado
    const request = new sql.Request(transaction);

    // 1. Obtener el nuevo consecutivo para fac_sec desde la tabla secuencia (para 'FACTURA')
    const seqQuery = `
      SELECT sec_num + 1 AS NewFacSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'FACTURA'
    `;
    const seqResult = await request.query(seqQuery);
    if (!seqResult.recordset || seqResult.recordset.length === 0) {
      throw new Error("No se encontró la secuencia para 'FACTURA'");
    }
    const NewFacSec = seqResult.recordset[0].NewFacSec;

    // Actualizar la secuencia (fac_sec)
    await request
      .input('sec_cod', sql.VarChar(50), 'FACTURA')
      .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");

    // 2. Obtener el nuevo consecutivo para fac_nro desde tipo_comprobantes (para 'COT')
    const tipQuery = `
      SELECT tip_con_sec + 1 AS NewConsecFacNro
      FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
      WHERE tip_cod = 'COT'
    `;
    const tipResult = await request.query(tipQuery);
    if (!tipResult.recordset || tipResult.recordset.length === 0) {
      throw new Error("No se encontró el consecutivo para 'COT' en tipo_comprobantes");
    }
    const NewConsecFacNro = tipResult.recordset[0].NewConsecFacNro;

    // Actualizar el consecutivo en tipo_comprobantes
    await request
      .input('tip_cod', sql.VarChar(5), 'COT')
      .query("UPDATE dbo.tipo_comprobantes SET tip_con_sec = tip_con_sec + 1 WHERE tip_cod = @tip_cod");

    // 3. Construir el número de factura final concatenando fac_tip_cod y el nuevo consecutivo
    const FinalFacNro = fac_tip_cod + String(NewConsecFacNro);

    // 4. Insertar el encabezado en la tabla factura
    const insertHeaderQuery = `
      INSERT INTO dbo.factura 
        (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac, fac_fch_cre)
      VALUES
        (@NewFacSec, GETDATE(), @fac_tip_cod ,@fac_tip_cod, @nit_sec, @FinalFacNro, 'A', GETDATE());
    `;
    await request
      .input('NewFacSec', sql.Decimal(18, 0), NewFacSec)
      .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
      .input('nit_sec', sql.VarChar(16), nit_sec)
      .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
      .query(insertHeaderQuery);

    // 5. Insertar cada detalle en la tabla facturakardes  
    // Se espera que 'detalles' sea un arreglo de objetos con la siguiente estructura:
    // { art_sec: 'ART001', kar_uni: 10.00, kar_pre_pub: 25.50 }
    for (const detalle of detalles) {
        // 1. Obtener el nuevo número de línea (kar_sec) para el detalle:
        const detailRequest = new sql.Request(transaction);
        detailRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
        const karSecQuery = `
          SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec 
          FROM dbo.facturakardes 
          WHERE fac_sec = @fac_sec
        `;
        const karSecResult = await detailRequest.query(karSecQuery);
        const NewKarSec = karSecResult.recordset[0].NewKarSec;
      
        // 2. Insertar el detalle usando una nueva instancia de request
        const insertRequest = new sql.Request(transaction);
        insertRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
        insertRequest.input('NewKarSec', sql.Int, NewKarSec);
        insertRequest.input('art_sec', sql.VarChar(30), detalle.art_sec);
        insertRequest.input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni);
        insertRequest.input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub);
      
        const kar_total = Number(detalle.kar_uni) * Number(detalle.kar_pre_pub);
        insertRequest.input('kar_total', sql.Decimal(17, 2), kar_total);
      
        const insertDetailQuery = `
          INSERT INTO dbo.facturakardes
            (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod)
          VALUES
            (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, 'c', @kar_pre_pub, @kar_total, 2)
        `;
        await insertRequest.query(insertDetailQuery);
      }
      

    // Confirmar la transacción
    await transaction.commit();

    // Retornar la información del encabezado generado
    return { fac_sec: NewFacSec, fac_nro: FinalFacNro };
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

module.exports = { createCompleteOrder };
