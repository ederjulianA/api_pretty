import { sql, poolPromise } from "../db.js";
import { updateWooOrderStatusAndStock } from "../jobs/updateWooOrderStatusAndStock.js";

const createInventoryAdjustment = async ({ 
    nit_sec, 
    fac_usu_cod_cre, 
    detalles,
    fac_fec,
    fac_obs
  }) => {
    let transaction;
    try {
      const pool = await poolPromise;
      transaction = new sql.Transaction(pool);
      await transaction.begin();
  
      const request = new sql.Request(transaction);
  
      // 1. Obtener el nuevo consecutivo para fac_sec
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
  
      // Actualizar la secuencia
      await request.input('sec_cod', sql.VarChar(50), 'FACTURA')
                   .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");
  
      // 2. Obtener el nuevo consecutivo para ajustes (AJT)
      const tipRequest = new sql.Request(transaction);
      const fac_tip_cod = 'AJT'; // Tipo fijo para ajustes
      tipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
      const tipQuery = `
        SELECT tip_con_sec + 1 AS NewConsecFacNro
        FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
        WHERE tip_cod = @fac_tip_cod
      `;
      const tipResult = await tipRequest.query(tipQuery);
      if (!tipResult.recordset || tipResult.recordset.length === 0) {
        throw new Error("No se encontró el consecutivo para ajustes de inventario");
      }
      const NewConsecFacNro = tipResult.recordset[0].NewConsecFacNro;
  
      // Actualizar el consecutivo en tipo_comprobantes
      const updateTipRequest = new sql.Request(transaction);
      updateTipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
      await updateTipRequest.query("UPDATE dbo.tipo_comprobantes SET tip_con_sec = tip_con_sec + 1 WHERE tip_cod = @fac_tip_cod");
  
      // 3. Construir el número de ajuste
      const FinalFacNro = fac_tip_cod + String(NewConsecFacNro);
  
      // 4. Insertar el encabezado del ajuste
      const insertHeaderQuery = `
        INSERT INTO dbo.factura 
          (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac, fac_fch_cre, fac_usu_cod_cre, fac_obs)
        VALUES
          (@NewFacSec, @fac_fec, @fac_tip_cod, @fac_tip_cod, @nit_sec, @FinalFacNro, 'A', GETDATE(), @fac_usu_cod_cre, @fac_obs);
      `;
      await request.input('NewFacSec', sql.Decimal(18, 0), NewFacSec)
                   .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
                   .input('nit_sec', sql.VarChar(16), nit_sec)
                   .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
                   .input('fac_obs', sql.VarChar, fac_obs)
                   .input('fac_fec', sql.Date, new Date(fac_fec.split('T')[0]))
                   .input('fac_usu_cod_cre', sql.VarChar(100), fac_usu_cod_cre)
                   .query(insertHeaderQuery);
  
      // 5. Insertar los detalles del ajuste
      for (const detalle of detalles) {
        if (!detalle.kar_nat || !['+', '-'].includes(detalle.kar_nat)) {
          throw new Error(`Naturaleza de ajuste inválida para el artículo ${detalle.art_sec}. Debe ser '+' o '-'`);
        }
  
        const detailRequest = new sql.Request(transaction);
        detailRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
        const karSecQuery = `
          SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec 
          FROM dbo.facturakardes 
          WHERE fac_sec = @fac_sec
        `;
        const karSecResult = await detailRequest.query(karSecQuery);
        const NewKarSec = karSecResult.recordset[0].NewKarSec;
  
        const insertRequest = new sql.Request(transaction);
        insertRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
        insertRequest.input('NewKarSec', sql.Int, NewKarSec);
        insertRequest.input('art_sec', sql.VarChar(30), detalle.art_sec);
        insertRequest.input('kar_nat', sql.VarChar(1), detalle.kar_nat);
        insertRequest.input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni);
        insertRequest.input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub || 0);
        
        const insertDetailQuery = `
          INSERT INTO dbo.facturakardes
            (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total)
          VALUES
            (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat, @kar_pre_pub, @kar_uni * @kar_pre_pub)
        `;
        await insertRequest.query(insertDetailQuery);
      }
  
      await transaction.commit();
  
      // Actualizar el stock en WooCommerce
      setImmediate(() => {
        updateWooOrderStatusAndStock(null, detalles)
          .then((msgs) => console.log("WooCommerce stock update messages:", msgs))
          .catch((err) => console.error("Error updating WooCommerce stock:", err));
      });
  
      return { 
        fac_sec: NewFacSec, 
        fac_nro: FinalFacNro,
        message: "Ajuste de inventario creado exitosamente" 
      };
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

export { createInventoryAdjustment }; 