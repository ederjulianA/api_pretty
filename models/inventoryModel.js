import { sql, poolPromise } from "../db.js";
import { updateWooOrderStatusAndStock } from "../jobs/updateWooOrderStatusAndStock.js";

const createInventoryAdjustment = async ({
  nit_sec,
  fac_usu_cod_cre,
  detalles,
  fac_fec,
  fac_obs,
  actualiza_fecha 
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

    // Actualizar el stock en WooCommerce solo si hay menos de 90 items
    if (detalles.length < 90) {
      try {
        console.log("Actualizando WooCommerce con parámetros:", {
          detalles: detalles.length,
          fac_fec,
          fac_nro: FinalFacNro,
          actualiza_fecha
        });
        const wooResult = await updateWooOrderStatusAndStock(null, detalles, fac_fec, FinalFacNro, actualiza_fecha);
        console.log("WooCommerce stock update result:", wooResult);
      } catch (wooError) {
        console.error("Error updating WooCommerce stock:", wooError);
        // No lanzamos el error para no afectar la transacción principal
      }
    } else {
      console.log("Skipping WooCommerce update due to large number of items (>90)");
    }

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

const updateInventoryAdjustment = async ({
  fac_nro,  // Número del ajuste a actualizar
  nit_sec,
  detalles,
  fac_fec,
  fac_obs,
  actualiza_fecha
}) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);

    // 1. Obtener el fac_sec correspondiente al fac_nro
    const headerRes = await request
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query('SELECT fac_sec, fac_tip_cod FROM dbo.factura WHERE fac_nro = @fac_nro');

    if (headerRes.recordset.length === 0) {
      throw new Error("Ajuste no encontrado.");
    }

    const fac_sec = headerRes.recordset[0].fac_sec;
    const fac_tip_cod = headerRes.recordset[0].fac_tip_cod;

    // Verificar que sea un ajuste
    if (fac_tip_cod !== 'AJT') {
      throw new Error("El documento no es un ajuste de inventario.");
    }

    // 2. Actualizar el encabezado
    const updateHeaderQuery = `
      UPDATE dbo.factura
      SET nit_sec = @nit_sec,
          fac_obs = @fac_obs,
          fac_fec = @fac_fec
      WHERE fac_sec = @fac_sec
    `;

    await request
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .input('nit_sec', sql.VarChar(16), nit_sec)
      .input('fac_obs', sql.VarChar, fac_obs)
      .input('fac_fec', sql.Date, new Date(fac_fec.split('T')[0]))
      .query(updateHeaderQuery);

    // 3. Eliminar los detalles existentes
    await new sql.Request(transaction)
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query('DELETE FROM dbo.facturakardes WHERE fac_sec = @fac_sec');

    // 4. Insertar los nuevos detalles
    for (const detalle of detalles) {
      if (!detalle.kar_nat || !['+', '-'].includes(detalle.kar_nat)) {
        throw new Error(`Naturaleza de ajuste inválida para el artículo ${detalle.art_sec}. Debe ser '+' o '-'`);
      }

      const detailRequest = new sql.Request(transaction);
      detailRequest.input('fac_sec', sql.Decimal(18, 0), fac_sec);
      const karSecQuery = `
        SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec 
        FROM dbo.facturakardes 
        WHERE fac_sec = @fac_sec
      `;
      const karSecResult = await detailRequest.query(karSecQuery);
      const NewKarSec = karSecResult.recordset[0].NewKarSec;

      const insertRequest = new sql.Request(transaction);
      insertRequest.input('fac_sec', sql.Decimal(18, 0), fac_sec)
        .input('NewKarSec', sql.Int, NewKarSec)
        .input('art_sec', sql.VarChar(30), detalle.art_sec)
        .input('kar_nat', sql.VarChar(1), detalle.kar_nat)
        .input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni)
        .input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub || 0);

      const insertDetailQuery = `
        INSERT INTO dbo.facturakardes
          (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total)
        VALUES
          (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat, @kar_pre_pub, @kar_uni * @kar_pre_pub)
      `;
      await insertRequest.query(insertDetailQuery);
    }

    await transaction.commit();

    // Actualizar el stock en WooCommerce solo si hay menos de 90 items
    if (detalles.length < 90) {
      try {
        console.log("Actualizando WooCommerce con parámetros:", {
          detalles: detalles.length,
          fac_fec,
          fac_nro,
          actualiza_fecha
        });
        const wooResult = await updateWooOrderStatusAndStock(null, detalles, fac_fec, fac_nro, actualiza_fecha);
        console.log("WooCommerce stock update result:", wooResult);
      } catch (wooError) {
        console.error("Error updating WooCommerce stock:", wooError);
        // No lanzamos el error para no afectar la transacción principal
      }
    } else {
      console.log("Skipping WooCommerce update due to large number of items (>90)");
    }

    return {
      fac_sec,
      fac_nro,
      message: "Ajuste de inventario actualizado exitosamente"
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

const getAdjustment = async (fac_nro) => {
  try {
    const pool = await poolPromise;

    // Consulta del encabezado
    const headerQuery = `
      SELECT 
        f.fac_sec,
        f.fac_fec,
        f.fac_tip_cod,
        f.nit_sec,
        n.nit_ide,
        n.nit_nom,
        n.nit_dir,
        n.nit_tel,
        n.nit_email,
        f.fac_nro,
        f.fac_est_fac,
        f.fac_obs,
        f.fac_usu_cod_cre,
        f.fac_fch_cre
      FROM dbo.factura f
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      WHERE f.fac_nro = @fac_nro AND f.fac_tip_cod = 'AJT'
    `;

    const headerResult = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(headerQuery);

    if (headerResult.recordset.length === 0) {
      throw new Error("Ajuste de inventario no encontrado.");
    }

    const header = headerResult.recordset[0];
    const fac_sec = header.fac_sec;

    // Consulta de los detalles
    const detailQuery = `
      SELECT 
        fd.kar_sec,
        fd.art_sec,
        a.art_cod,
        a.art_nom,
        fd.kar_nat,
        fd.kar_uni,
        fd.kar_pre_pub,
        fd.kar_total,
        vw.existencia as stock_actual
      FROM dbo.facturakardes fd
      INNER JOIN dbo.articulos a ON fd.art_sec = a.art_sec
      LEFT JOIN dbo.vwExistencias vw ON a.art_sec = vw.art_sec
      WHERE fd.fac_sec = @fac_sec
      ORDER BY fd.kar_sec
    `;

    const detailResult = await pool.request()
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query(detailQuery);

    const details = detailResult.recordset;

    return {
      header,
      details,
      message: "Ajuste de inventario recuperado exitosamente"
    };
  } catch (error) {
    throw error;
  }
};

export { createInventoryAdjustment, updateInventoryAdjustment, getAdjustment }; 