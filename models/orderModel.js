// models/orderModel.js

import { sql, poolPromise} from "../db.js";
import { updateWooOrderStatusAndStock } from "../jobs/updateWooOrderStatusAndStock.js";




const updateOrder = async ({ fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento, fac_nro_woo, fac_obs, fac_fec }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    // 1. Buscar el fac_sec correspondiente al fac_nro
    const headerRes = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query('SELECT fac_sec FROM dbo.factura WHERE fac_nro = @fac_nro');
    if (headerRes.recordset.length === 0) {
      throw new Error("Pedido no encontrado.");
    }   
    const fac_sec = headerRes.recordset[0].fac_sec;

    // 2. Iniciar la transacción
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 3. Actualizar el encabezado en la tabla factura con un nuevo Request
    const updateHeaderQuery = `
      UPDATE dbo.factura
      SET fac_tip_cod = @fac_tip_cod,
          nit_sec = @nit_sec,
          fac_est_fac = @fac_est_fac,
          fac_nro_woo = @fac_nro_woo,
          fac_obs = @fac_obs
          ${fac_fec ? ', fac_fec = @fac_fec' : ''}
      WHERE fac_sec = @fac_sec
    `;
    
    const updateHeaderRequest = new sql.Request(transaction);
    updateHeaderRequest
      .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
      .input('nit_sec', sql.VarChar(16), nit_sec)
      .input('fac_est_fac', sql.Char(1), fac_est_fac)
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .input('fac_nro_woo', sql.VarChar(15), fac_nro_woo)
      .input('fac_obs', sql.VarChar, fac_obs);

    // Solo agregar el parámetro de fecha si se proporciona
    if (fac_fec) {
      updateHeaderRequest.input('fac_fec', sql.Date, fac_fec);
    }  

    await updateHeaderRequest.query(updateHeaderQuery);

    // 4. Eliminar los detalles existentes para este pedido con un nuevo Request
    const deleteDetailsRequest = new sql.Request(transaction);
    await deleteDetailsRequest
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query('DELETE FROM dbo.facturakardes WHERE fac_sec = @fac_sec');

    // 5. Insertar los nuevos detalles (por cada ítem se realiza UN insert)
    // Se espera que cada objeto en details tenga:
    // art_sec, kar_uni, precio_de_venta y kar_lis_pre_cod
    for (let i = 0; i < detalles.length; i++) {
      const detail = detalles[i];
      const newKarSec = i + 1; // Asignar un número de línea secuencial

      // Crear una nueva instancia de Request para cada insert
      const insertDetailRequest = new sql.Request(transaction);
      let kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
      if (descuento > 0 ){
        kar_total = kar_total * (1 - (descuento/100))
      }
      await insertDetailRequest
        .input('fac_sec', sql.Decimal(18, 0), fac_sec)
        .input('NewKarSec', sql.Int, newKarSec)
        .input('art_sec', sql.VarChar(50), detail.art_sec)
        .input('kar_nat', sql.VarChar(1), detail.kar_nat)
        .input('kar_uni', sql.Decimal(17, 2), detail.kar_uni)
        .input('kar_pre_pub', sql.Decimal(17, 2), detail.kar_pre_pub)
        .input('kar_lis_pre_cod', sql.Int, detail.kar_lis_pre_cod)
        .input('kar_des_uno', sql.Decimal(11, 5), descuento)
        .input('kar_total', sql.Decimal(17, 2), kar_total)
        .input('kar_kar_sec_ori', sql.Int, detail.kar_kar_sec_ori)
        .input('kar_fac_sec_ori', sql.Decimal(18, 0), detail.kar_fac_sec_ori)
        .query(`
          INSERT INTO dbo.facturakardes
            (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno, kar_kar_sec_ori, kar_fac_sec_ori)
          VALUES
            (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat, @kar_pre_pub, @kar_total, @kar_lis_pre_cod, @kar_des_uno, @kar_kar_sec_ori, @kar_fac_sec_ori)
        `);
    }

    await transaction.commit();

    // Si se confirma como factura (fac_tip_cod = 'VTA'), actualizar el estado y el inventario en WooCommerce
    if (fac_tip_cod === 'VTA') {
      // Llamamos de forma asíncrona a la función que actualiza el estado del pedido y stock en WooCommerce
      setImmediate(() => {
        updateWooOrderStatusAndStock(fac_nro_woo, detalles)
          .then((msgs) => console.log("WooCommerce update messages:", msgs))
          .catch((err) => console.error("Error updating WooCommerce:", err));
      });
    }

    return { message: "Pedido actualizado exitosamente." };
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


const getOrdenes = async ({ FechaDesde, FechaHasta, nit_ide, nit_nom, fac_nro, fac_est_fac, PageNumber, PageSize, fue_cod, fac_nro_woo }) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    // Declarar e ingresar parámetros
    request.input('FechaDesde', sql.Date, FechaDesde);
    request.input('FechaHasta', sql.Date, FechaHasta);
    request.input('nit_ide', sql.VarChar(16), nit_ide || null);
    request.input('nit_nom', sql.VarChar(100), nit_nom || null);
    request.input('fac_nro', sql.VarChar(15), fac_nro || null);
    request.input('fac_nro_woo', sql.VarChar(15), fac_nro_woo || null);
    request.input('fac_est_fac', sql.Char(1), fac_est_fac || null);
    request.input('PageNumber', sql.Int, PageNumber);
    request.input('PageSize', sql.Int, PageSize);
    request.input('fue_cod', sql.Int, fue_cod);

    const query = `
;WITH PedidoResumen AS (
    SELECT
        f.fac_sec,
        f.fac_fec,
        f.fac_nro_woo,
        n.nit_ide,
        n.nit_nom,
        f.fac_nro,
        f.fac_est_fac,
        SUM(fd.kar_total) AS total_pedido,
        (
          SELECT STRING_AGG(t.fac_nro, '-')
          FROM (
              SELECT DISTINCT f2.fac_nro
              FROM dbo.facturakardes fk2
              INNER JOIN dbo.factura f2
                  ON fk2.fac_sec = f2.fac_sec
              LEFT JOIN dbo.tipo_comprobantes tc2
                  ON f2.f_tip_cod = tc2.tip_cod
              WHERE fk2.kar_fac_sec_ori = f.fac_sec
                AND f2.fac_est_fac = 'A'
                AND fk2.kar_uni > 0
                AND tc2.fue_cod = 1
          ) t
        ) AS documentos
    FROM dbo.factura f
    INNER JOIN dbo.nit n
        ON f.nit_sec = n.nit_sec
    INNER JOIN dbo.facturakardes fd
        ON f.fac_sec = fd.fac_sec
    INNER JOIN dbo.tipo_comprobantes tc
        ON f.f_tip_cod = tc.tip_cod
    WHERE f.fac_fec >= @FechaDesde
      AND f.fac_fec <= @FechaHasta
      AND tc.fue_cod = @fue_cod
      AND (@nit_ide IS NULL OR n.nit_ide = @nit_ide)
      AND (@nit_nom IS NULL OR n.nit_nom LIKE '%' + @nit_nom + '%')
      AND (@fac_nro IS NULL OR f.fac_nro = @fac_nro)
       AND (@fac_nro_woo IS NULL OR f.fac_nro_woo = @fac_nro_woo)
      AND (@fac_est_fac IS NULL OR f.fac_est_fac = @fac_est_fac)    GROUP BY 
        f.fac_sec, f.fac_fec, n.nit_ide, n.nit_nom, f.fac_nro,f.fac_nro_woo, f.fac_est_fac
)
SELECT
    fac_fec,
    nit_ide,
    nit_nom,
    fac_nro,
    fac_nro_woo,
    fac_est_fac,
    total_pedido,
    documentos
FROM PedidoResumen
ORDER BY fac_fec DESC
OFFSET (@PageNumber - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY;
    `;

    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    throw error;
  }
};


const getOrder = async (fac_nro) => {
  try {
    const pool = await poolPromise;
    
    // Consulta del encabezado (header)
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
        f.fac_nro_woo,
        f.fac_est_fac,
        c.ciu_nom
      FROM dbo.factura f  
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      LEFT JOIN dbo.Ciudad c ON c.ciu_cod = n.ciu_cod
      WHERE f.fac_nro = @fac_nro;
    `;
    const headerResult = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(headerQuery);
    
    if (headerResult.recordset.length === 0) {
      throw new Error("Pedido no encontrado.");
    }
    
    const header = headerResult.recordset[0];
    const fac_sec = header.fac_sec;
    
    // Consulta de los detalles, uniendo facturakardes, articulosdetalle y la vista vwExistencias
    const detailQuery = `
      SELECT 
        fd.*,
        ad1.art_bod_pre AS precio_detal,
        ad2.art_bod_pre AS precio_mayor,
        vw.existencia,
        a.art_cod,
		  a.art_nom
      FROM dbo.facturakardes fd
      INNER JOIN dbo.articulos a ON fd.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad1 
        ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad2 
        ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
      LEFT JOIN dbo.vwExistencias vw 
        ON a.art_sec = vw.art_sec
      WHERE fd.fac_sec = @fac_sec
      ORDER BY fd.kar_sec;
    `;
    
    const detailResult = await pool.request()
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query(detailQuery);
    
    const details = detailResult.recordset;
    
    return { header, details };
  } catch (error) {
    throw error;
  }
};

const createCompleteOrder = async ({ 
  nit_sec, 
  fac_usu_cod_cre, 
  fac_tip_cod, 
  detalles, 
  descuento, 
  lis_pre_cod, 
  fac_nro_woo, 
  fac_obs,
  fac_fec // Nuevo parámetro opcional
}) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Usamos un Request vinculado a la transacción para operaciones de encabezado
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

    // Actualizar la secuencia para FACTURA
    await request.input('sec_cod', sql.VarChar(50), 'FACTURA')
                 .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");

    // 2. Obtener el nuevo consecutivo para fac_nro desde la tabla tipo_comprobantes, usando el parámetro fac_tip_cod
    const tipRequest = new sql.Request(transaction);
    tipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
    const tipQuery = `
      SELECT tip_con_sec + 1 AS NewConsecFacNro
      FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
      WHERE tip_cod = @fac_tip_cod
    `;
    const tipResult = await tipRequest.query(tipQuery);
    if (!tipResult.recordset || tipResult.recordset.length === 0) {
      throw new Error("No se encontró el consecutivo para el tipo de comprobante en tipo_comprobantes");
    }
    const NewConsecFacNro = tipResult.recordset[0].NewConsecFacNro;

    // Actualizar el consecutivo en tipo_comprobantes con un Request nuevo
    const updateTipRequest = new sql.Request(transaction);
    updateTipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
    await updateTipRequest.query("UPDATE dbo.tipo_comprobantes SET tip_con_sec = tip_con_sec + 1 WHERE tip_cod = @fac_tip_cod");

    // 3. Construir el número de factura final concatenando fac_tip_cod y el nuevo consecutivo
    const FinalFacNro = fac_tip_cod + String(NewConsecFacNro);

    // 4. Insertar el encabezado en la tabla factura
    const insertHeaderQuery = `
      INSERT INTO dbo.factura 
        (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac, fac_fch_cre, fac_usu_cod_cre, fac_nro_woo, fac_obs)
      VALUES
        (@NewFacSec, @fac_fec, @fac_tip_cod, @fac_tip_cod, @nit_sec, @FinalFacNro, 'A', GETDATE(), @fac_usu_cod_cre, @fac_nro_woo, @fac_obs);
    `;
    await request.input('NewFacSec', sql.Decimal(18, 0), NewFacSec)
                 .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
                 .input('nit_sec', sql.VarChar(16), nit_sec)
                 .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
                 .input('fac_nro_woo', sql.VarChar(16), fac_nro_woo)
                 .input('fac_obs', sql.VarChar, fac_obs)
                 .input('fac_usu_cod_cre', sql.VarChar(100), fac_usu_cod_cre)
                 .input('fac_fec', sql.Date, fac_fec || new Date()) // Usa la fecha proporcionada o la fecha actual
                 .query(insertHeaderQuery);

    // 5. Insertar cada detalle en la tabla facturakardes
    for (const detalle of detalles) {
      // 5.1 Obtener el nuevo número de línea (kar_sec) para el detalle
      const detailRequest = new sql.Request(transaction);
      detailRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      const karSecQuery = `
        SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec 
        FROM dbo.facturakardes 
        WHERE fac_sec = @fac_sec
      `;
      const karSecResult = await detailRequest.query(karSecQuery);
      const NewKarSec = karSecResult.recordset[0].NewKarSec;

      // 5.2 Insertar el detalle usando un Request nuevo
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      insertRequest.input('NewKarSec', sql.Int, NewKarSec);
      insertRequest.input('art_sec', sql.VarChar(30), detalle.art_sec);
      insertRequest.input('kar_nat', sql.VarChar(1), detalle.kar_nat);
      insertRequest.input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni);
      insertRequest.input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub);
      insertRequest.input('kar_des_uno', sql.Decimal(11, 5), descuento);
      insertRequest.input('lis_pre_cod', sql.Int, lis_pre_cod);
      insertRequest.input('kar_kar_sec_ori', sql.Int, detalle.kar_kar_sec_ori);
      insertRequest.input('kar_fac_sec_ori', sql.Int, detalle.kar_fac_sec_ori);
      let kar_total = Number(detalle.kar_uni) * Number(detalle.kar_pre_pub);
      if (descuento > 0) {
        kar_total = kar_total * (1 - (descuento / 100));
      }
      insertRequest.input('kar_total', sql.Decimal(17, 2), kar_total);
      
      const insertDetailQuery = `
        INSERT INTO dbo.facturakardes
          (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno, kar_kar_sec_ori, kar_fac_sec_ori)
        VALUES
          (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat, @kar_pre_pub, @kar_total, @lis_pre_cod, @kar_des_uno, @kar_kar_sec_ori, @kar_fac_sec_ori)
      `;
      await insertRequest.query(insertDetailQuery);
    }

    await transaction.commit();

     // Si se confirma como factura (fac_tip_cod = 'VTA'), actualizar el estado y el inventario en WooCommerce
     if (fac_tip_cod === 'VTA') {
      // Llamamos de forma asíncrona a la función que actualiza el estado del pedido y stock en WooCommerce
      setImmediate(() => {
        updateWooOrderStatusAndStock(fac_nro_woo, detalles)
          .then((msgs) => console.log("WooCommerce update messages:", msgs))
          .catch((err) => console.error("Error updating WooCommerce:", err));
      });
    }

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


export  { createCompleteOrder,getOrder, getOrdenes, updateOrder  };
