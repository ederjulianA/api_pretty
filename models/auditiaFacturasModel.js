/**
 * Modelo: Auditoría de Facturas
 * Fecha: 2026-03-01
 * Descripción: Funciones para obtener listado de facturas con propósitos de auditoría
 */

const { poolPromise, sql } = require('../db');

/**
 * Obtiene listado de facturas del período especificado con información de auditoría
 * @param {String} fechaInicioStr - Fecha inicio en formato 'YYYY-MM-DD'
 * @param {String} fechaFinStr - Fecha fin en formato 'YYYY-MM-DD'
 * @param {Number} pagina - Número de página (default: 1)
 * @param {Number} porPagina - Registros por página (default: 50)
 * @returns {Promise<Object>} Listado de facturas con paginación
 */
const obtenerFacturasAuditoria = async (fechaInicioStr, fechaFinStr, pagina = 1, porPagina = 50) => {
  try {
    const pool = await poolPromise;

    // Validar parámetros de paginación
    const paginaNum = Math.max(1, parseInt(pagina) || 1);
    const porPaginaNum = Math.max(10, Math.min(100, parseInt(porPagina) || 50));
    const offset = (paginaNum - 1) * porPaginaNum;

    // Pasar fechas como VARCHAR para evitar conversión UTC del driver mssql.
    // SQL Server parsea 'YYYY-MM-DD' correctamente sin desfase de zona horaria.
    const countResult = await pool.request()
      .input('fecha_inicio', sql.VarChar(10), fechaInicioStr)
      .input('fecha_fin', sql.VarChar(10), fechaFinStr)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.factura f
        WHERE CAST(f.fac_fec AS DATE) >= @fecha_inicio
          AND CAST(f.fac_fec AS DATE) <= @fecha_fin
          AND f.fac_est_fac = 'A'
          AND f.fac_tip_cod = 'VTA'
      `);

    const totalRegistros = countResult.recordset[0].total;
    const totalPaginas = Math.ceil(totalRegistros / porPaginaNum);

    const result = await pool.request()
      .input('fecha_inicio', sql.VarChar(10), fechaInicioStr)
      .input('fecha_fin', sql.VarChar(10), fechaFinStr)
      .input('offset', sql.Int, offset)
      .input('limite', sql.Int, porPaginaNum)
      .query(`
        SELECT
          -- Información de Factura
          f.fac_sec,
          CONVERT(VARCHAR(10), f.fac_fec, 120) AS fecha_factura_str,
          CONVERT(VARCHAR(19), f.fac_fec, 120) AS fecha_factura_completa,
          f.fac_nro,
          f.fac_tip_cod,

          -- Información de WooCommerce
          f.fac_nro_woo AS numero_pedido_woocommerce,
          f.fac_est_woo AS estado_woocommerce,

          -- Información del Cliente
          n.nit_sec,
          n.nit_ide AS identificacion_cliente,
          n.nit_nom AS nombre_cliente,
          n.nit_email,
          n.nit_tel,

          -- Total de la Factura (calculado desde facturakardes)
          (SELECT SUM(fk.kar_total)
           FROM dbo.facturakardes fk
           WHERE fk.fac_sec = f.fac_sec
           AND fk.kar_nat = '-') AS total_factura,

          -- Información de Estado y Auditoría
          f.fac_est_fac AS estado_interno,
          f.fac_usu_cod_cre AS usuario_creacion,
          f.fac_fch_cre AS fecha_creacion,
          f.fac_usu_cod_mod AS usuario_modificacion,
          f.fac_fch_mod AS fecha_modificacion,
          f.fac_nro_origen,

          -- Información adicional
          f.fac_obs AS observaciones,
          f.fac_descuento_general

        FROM dbo.factura f
          LEFT JOIN dbo.nit n ON f.nit_sec = n.nit_sec
        WHERE CAST(f.fac_fec AS DATE) >= @fecha_inicio
          AND CAST(f.fac_fec AS DATE) <= @fecha_fin
          AND f.fac_est_fac = 'A'
          AND f.fac_tip_cod = 'VTA'
        ORDER BY f.fac_fec DESC, f.fac_nro DESC
        OFFSET @offset ROWS
        FETCH NEXT @limite ROWS ONLY
      `);

    // Mapear resultados
    // Usar fecha_factura_str (YYYY-MM-DD) y fecha_factura_completa (YYYY-MM-DD HH:MM:SS)
    // convertidas en SQL para evitar desplazamiento de zona horaria de JavaScript
    const facturas = result.recordset.map(f => ({
      fac_sec: parseInt(f.fac_sec),
      fecha_factura: f.fecha_factura_completa,
      fecha_factura_fecha: f.fecha_factura_str,
      numero_factura: f.fac_nro,
      tipo_documento: f.fac_tip_cod,
      numero_pedido_woocommerce: f.numero_pedido_woocommerce,
      estado_woocommerce: f.estado_woocommerce,
      nit_sec: f.nit_sec,
      identificacion_cliente: f.identificacion_cliente,
      nombre_cliente: f.nombre_cliente,
      email_cliente: f.nit_email,
      telefono_cliente: f.nit_tel,
      total_factura: parseFloat(f.total_factura || 0),
      estado_interno: f.estado_interno,
      usuario_creacion: f.usuario_creacion,
      fecha_creacion: f.fecha_creacion,
      usuario_modificacion: f.usuario_modificacion,
      fecha_modificacion: f.fecha_modificacion,
      numero_factura_origen: f.fac_nro_origen,
      observaciones: f.observaciones,
      descuento_general: parseFloat(f.fac_descuento_general || 0)
    }));

    return {
      facturas,
      paginacion: {
        pagina_actual: paginaNum,
        por_pagina: porPaginaNum,
        total_registros: totalRegistros,
        total_paginas: totalPaginas,
        tiene_pagina_anterior: paginaNum > 1,
        tiene_pagina_siguiente: paginaNum < totalPaginas
      },
      periodo: {
        fecha_inicio: fechaInicioStr,
        fecha_fin: fechaFinStr
      }
    };

  } catch (error) {
    console.error('Error en obtenerFacturasAuditoria:', error);
    throw error;
  }
};

/**
 * Obtiene detalle de una factura específica (líneas y costos)
 * @param {Number} fac_sec - ID de factura
 * @returns {Promise<Object>} Detalle completo de la factura
 */
const obtenerDetalleFactura = async (fac_sec) => {
  try {
    const pool = await poolPromise;

    // Obtener encabezado de factura
    const headerResult = await pool.request()
      .input('fac_sec', sql.Decimal(12, 0), fac_sec)
      .query(`
        SELECT
          f.fac_sec,
          CONVERT(VARCHAR(19), f.fac_fec, 120) AS fac_fec_str,
          f.fac_nro,
          f.fac_nro_woo,
          n.nit_ide,
          n.nit_nom,
          n.nit_email,
          f.fac_est_fac,
          f.fac_est_woo,
          f.fac_descuento_general,
          f.fac_obs
        FROM dbo.factura f
          LEFT JOIN dbo.nit n ON f.nit_sec = n.nit_sec
        WHERE f.fac_sec = @fac_sec
          AND f.fac_est_fac = 'A'
          AND f.fac_tip_cod = 'VTA'
      `);

    if (headerResult.recordset.length === 0) {
      throw new Error('Factura no encontrada');
    }

    const header = headerResult.recordset[0];

    // Obtener líneas de factura
    const lineasResult = await pool.request()
      .input('fac_sec', sql.Decimal(12, 0), fac_sec)
      .query(`
        SELECT
          fk.kar_sec,
          fk.art_sec,
          a.art_cod,
          a.art_nom,
          fk.kar_uni AS cantidad,
          fk.kar_pre AS precio_unitario,
          fk.kar_sub_tot AS subtotal,
          fk.kar_total AS total_linea,
          fk.kar_lis_pre_cod AS lista_precios,
          ad.art_bod_cos_cat AS costo_unitario,
          (fk.kar_uni * ISNULL(ad.art_bod_cos_cat, 0)) AS costo_total_linea,
          (fk.kar_total - (fk.kar_uni * ISNULL(ad.art_bod_cos_cat, 0))) AS utilidad_linea,
          CASE
            WHEN fk.kar_total > 0
            THEN ((fk.kar_total - (fk.kar_uni * ISNULL(ad.art_bod_cos_cat, 0))) / fk.kar_total * 100)
            ELSE 0
          END AS rentabilidad_porcentaje
        FROM dbo.facturakardes fk
          LEFT JOIN dbo.articulos a ON fk.art_sec = a.art_sec
          LEFT JOIN dbo.articulosdetalle ad
            ON a.art_sec = ad.art_sec
            AND ad.lis_pre_cod = 1
            AND ad.bod_sec = '1'
        WHERE fk.fac_sec = @fac_sec
          AND fk.kar_nat = '-'
        ORDER BY fk.kar_sec ASC
      `);

    // Mapear líneas
    const lineas = lineasResult.recordset.map(l => ({
      kar_sec: parseInt(l.kar_sec),
      art_sec: l.art_sec,
      codigo_articulo: l.art_cod,
      nombre_articulo: l.art_nom,
      cantidad: parseFloat(l.cantidad),
      precio_unitario: parseFloat(l.precio_unitario),
      subtotal: parseFloat(l.subtotal),
      total_linea: parseFloat(l.total_linea),
      lista_precios: parseInt(l.lista_precios),
      costo_unitario: parseFloat(l.costo_unitario || 0),
      costo_total_linea: parseFloat(l.costo_total_linea || 0),
      utilidad_linea: parseFloat(l.utilidad_linea || 0),
      rentabilidad_porcentaje: parseFloat(l.rentabilidad_porcentaje || 0)
    }));

    // Calcular totales
    const totales = {
      total_ventas: lineas.reduce((sum, l) => sum + l.total_linea, 0),
      total_costo: lineas.reduce((sum, l) => sum + l.costo_total_linea, 0),
      total_utilidad: lineas.reduce((sum, l) => sum + l.utilidad_linea, 0),
      cantidad_items: lineas.length,
      cantidad_unidades: lineas.reduce((sum, l) => sum + l.cantidad, 0)
    };

    return {
      encabezado: {
        fac_sec: parseInt(header.fac_sec),
        fecha_factura: header.fac_fec_str,
        numero_factura: header.fac_nro,
        numero_pedido_woocommerce: header.fac_nro_woo,
        identificacion_cliente: header.nit_ide,
        nombre_cliente: header.nit_nom,
        email_cliente: header.nit_email,
        estado_interno: header.fac_est_fac,
        estado_woocommerce: header.fac_est_woo,
        descuento_general: parseFloat(header.fac_descuento_general || 0),
        observaciones: header.fac_obs
      },
      lineas,
      totales
    };

  } catch (error) {
    console.error('Error en obtenerDetalleFactura:', error);
    throw error;
  }
};

/**
 * Obtiene reporte de facturas por estado WooCommerce
 * @param {String} fechaInicioStr - Fecha inicio en formato 'YYYY-MM-DD'
 * @param {String} fechaFinStr - Fecha fin en formato 'YYYY-MM-DD'
 * @returns {Promise<Array>}
 */
const obtenerFacturasPorEstadoWoo = async (fechaInicioStr, fechaFinStr) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.VarChar(10), fechaInicioStr)
      .input('fecha_fin', sql.VarChar(10), fechaFinStr)
      .query(`
        SELECT
          ISNULL(f.fac_est_woo, 'Sin Estado') AS estado,
          COUNT(*) AS numero_facturas,
          SUM(ISNULL(t.total_factura, 0)) AS total_ventas
        FROM dbo.factura f
          LEFT JOIN (
            SELECT fk.fac_sec, SUM(fk.kar_total) AS total_factura
            FROM dbo.facturakardes fk
            WHERE fk.kar_nat = '-'
            GROUP BY fk.fac_sec
          ) t ON t.fac_sec = f.fac_sec
        WHERE CAST(f.fac_fec AS DATE) >= @fecha_inicio
          AND CAST(f.fac_fec AS DATE) <= @fecha_fin
          AND f.fac_est_fac = 'A'
          AND f.fac_tip_cod = 'VTA'
        GROUP BY f.fac_est_woo
        ORDER BY numero_facturas DESC
      `);

    return result.recordset.map(r => ({
      estado: r.estado,
      numero_facturas: parseInt(r.numero_facturas),
      total_ventas: parseFloat(r.total_ventas || 0)
    }));

  } catch (error) {
    console.error('Error en obtenerFacturasPorEstadoWoo:', error);
    throw error;
  }
};

module.exports = {
  obtenerFacturasAuditoria,
  obtenerDetalleFactura,
  obtenerFacturasPorEstadoWoo
};
