// models/salesModel.js
import { poolPromise, sql } from "../db.js";

const getSalesSummary = async (start_date, end_date) => {
  const pool = await poolPromise;
  
  // Consulta para obtener las facturas en el rango de fechas
  const invoicesResult = await pool.request()
    .input("start_date", sql.Date, start_date)
    .input("end_date", sql.Date, end_date)
    .query(`
      SELECT 
          f.fac_fec,
          f.fac_nro,
          n.nit_nom,
          n.nit_ide,
          SUM(fd.kar_total) AS total_pedido,
          f.fac_nro_woo
      FROM dbo.factura f
      INNER JOIN dbo.nit n
          ON f.nit_sec = n.nit_sec
      INNER JOIN dbo.facturakardes fd
          ON f.fac_sec = fd.fac_sec
      INNER JOIN dbo.tipo_comprobantes tc
          ON f.f_tip_cod = tc.tip_cod
      WHERE 
          f.fac_fec BETWEEN @start_date AND @end_date
          AND f.fac_est_fac = 'A'
          AND tc.fue_cod = 1
      GROUP BY 
          f.fac_fec, 
          f.fac_nro, 
          n.nit_nom, 
          n.nit_ide,
          f.fac_nro_woo
      ORDER BY f.fac_fec DESC
    `);
  
  const invoices = invoicesResult.recordset;
  
  // Consulta para obtener las ventas diarias (agrupadas por día)
  const dailySalesResult = await pool.request()
    .input("start_date", sql.Date, start_date)
    .input("end_date", sql.Date, end_date)
    .query(`
      SELECT 
          f.fac_fec,
          SUM(fd.kar_total) AS total_ventas_diarias
      FROM dbo.factura f
      INNER JOIN dbo.facturakardes fd
          ON f.fac_sec = fd.fac_sec
      INNER JOIN dbo.tipo_comprobantes tc
          ON f.f_tip_cod = tc.tip_cod
      WHERE 
          f.fac_fec BETWEEN @start_date AND @end_date
          AND f.fac_est_fac = 'A'
          AND tc.fue_cod = 1
      GROUP BY f.fac_fec
      ORDER BY f.fac_fec DESC
    `);
  
  const daily_sales = dailySalesResult.recordset;
  
  return { invoices, daily_sales };
};

export { getSalesSummary };
