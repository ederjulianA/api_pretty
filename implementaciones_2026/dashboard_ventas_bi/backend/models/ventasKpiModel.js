/**
 * Modelo: KPIs de Ventas para Dashboard BI
 * Fecha: 2026-02-17
 * Descripción: Funciones para obtener KPIs y métricas de ventas desde vw_ventas_dashboard
 */

const { poolPromise, sql } = require('../db');

/**
 * Obtiene KPIs principales de ventas para un período
 * @param {Date} fechaInicio - Fecha inicio del período
 * @param {Date} fechaFin - Fecha fin del período
 * @returns {Promise<Object>} KPIs principales
 */
const obtenerKPIsPrincipales = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        SELECT
          SUM(total_linea) AS ventas_totales,
          COUNT(DISTINCT fac_nro) AS numero_ordenes,
          CASE
            WHEN COUNT(DISTINCT fac_nro) > 0
            THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
            ELSE 0
          END AS ticket_promedio,
          COUNT(DISTINCT nit_sec) AS clientes_unicos,
          SUM(cantidad_vendida) AS unidades_vendidas,
          SUM(utilidad_linea) AS utilidad_bruta_total,
          AVG(rentabilidad) AS rentabilidad_promedio,
          SUM(costo_total_linea) AS costo_total_ventas
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
      `);

    if (result.recordset.length === 0 || result.recordset[0].ventas_totales === null) {
      return {
        ventas_totales: 0,
        numero_ordenes: 0,
        ticket_promedio: 0,
        clientes_unicos: 0,
        unidades_vendidas: 0,
        utilidad_bruta_total: 0,
        rentabilidad_promedio: 0,
        costo_total_ventas: 0
      };
    }

    const kpis = result.recordset[0];
    return {
      ventas_totales: parseFloat(kpis.ventas_totales || 0),
      numero_ordenes: parseInt(kpis.numero_ordenes || 0),
      ticket_promedio: parseFloat(kpis.ticket_promedio || 0),
      clientes_unicos: parseInt(kpis.clientes_unicos || 0),
      unidades_vendidas: parseFloat(kpis.unidades_vendidas || 0),
      utilidad_bruta_total: parseFloat(kpis.utilidad_bruta_total || 0),
      rentabilidad_promedio: parseFloat(kpis.rentabilidad_promedio || 0),
      costo_total_ventas: parseFloat(kpis.costo_total_ventas || 0)
    };

  } catch (error) {
    console.error('Error en obtenerKPIsPrincipales:', error);
    throw error;
  }
};

/**
 * Calcula tasa de crecimiento comparando dos períodos
 */
const obtenerTasaCrecimiento = async (fechaInicioActual, fechaFinActual, fechaInicioAnterior, fechaFinAnterior) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio_actual', sql.Date, fechaInicioActual)
      .input('fecha_fin_actual', sql.Date, fechaFinActual)
      .input('fecha_inicio_anterior', sql.Date, fechaInicioAnterior)
      .input('fecha_fin_anterior', sql.Date, fechaFinAnterior)
      .query(`
        WITH PeriodoActual AS (
          SELECT
            ISNULL(SUM(total_linea), 0) AS ventas,
            ISNULL(COUNT(DISTINCT fac_nro), 0) AS ordenes
          FROM dbo.vw_ventas_dashboard
          WHERE fecha_venta >= @fecha_inicio_actual
            AND fecha_venta <= @fecha_fin_actual
        ),
        PeriodoAnterior AS (
          SELECT
            ISNULL(SUM(total_linea), 0) AS ventas,
            ISNULL(COUNT(DISTINCT fac_nro), 0) AS ordenes
          FROM dbo.vw_ventas_dashboard
          WHERE fecha_venta >= @fecha_inicio_anterior
            AND fecha_venta <= @fecha_fin_anterior
        )
        SELECT
          pa.ventas AS ventas_actual,
          pp.ventas AS ventas_anterior,
          CASE
            WHEN pp.ventas > 0
            THEN ((pa.ventas - pp.ventas) / pp.ventas * 100)
            ELSE 0
          END AS tasa_crecimiento_ventas,
          pa.ordenes AS ordenes_actual,
          pp.ordenes AS ordenes_anterior,
          CASE
            WHEN pp.ordenes > 0
            THEN ((pa.ordenes - pp.ordenes) / CAST(pp.ordenes AS FLOAT) * 100)
            ELSE 0
          END AS tasa_crecimiento_ordenes
        FROM PeriodoActual pa, PeriodoAnterior pp
      `);

    const data = result.recordset[0];
    return {
      periodo_actual: {
        ventas: parseFloat(data.ventas_actual || 0),
        ordenes: parseInt(data.ordenes_actual || 0)
      },
      periodo_anterior: {
        ventas: parseFloat(data.ventas_anterior || 0),
        ordenes: parseInt(data.ordenes_anterior || 0)
      },
      crecimiento: {
        ventas_porcentaje: parseFloat(data.tasa_crecimiento_ventas || 0),
        ordenes_porcentaje: parseFloat(data.tasa_crecimiento_ordenes || 0)
      }
    };

  } catch (error) {
    console.error('Error en obtenerTasaCrecimiento:', error);
    throw error;
  }
};

/**
 * Obtiene top productos más vendidos
 */
const obtenerTopProductos = async (fechaInicio, fechaFin, limite = 10, ordenarPor = 'unidades') => {
  try {
    const pool = await poolPromise;

    const ordenamiento = ordenarPor === 'ingresos'
      ? 'SUM(total_linea) DESC'
      : 'SUM(cantidad_vendida) DESC';

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .input('limite', sql.Int, limite)
      .query(`
        SELECT TOP (@limite)
          art_cod,
          art_nom,
          categoria,
          subcategoria,
          SUM(cantidad_vendida) AS unidades_vendidas,
          SUM(total_linea) AS ingresos_totales,
          SUM(utilidad_linea) AS utilidad_total,
          AVG(precio_unitario) AS precio_promedio,
          AVG(rentabilidad) AS rentabilidad_promedio,
          COUNT(DISTINCT fac_nro) AS numero_ordenes
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY art_cod, art_nom, categoria, subcategoria
        ORDER BY ${ordenamiento}
      `);

    return result.recordset.map(p => ({
      art_cod: p.art_cod,
      art_nom: p.art_nom,
      categoria: p.categoria,
      subcategoria: p.subcategoria,
      unidades_vendidas: parseFloat(p.unidades_vendidas),
      ingresos_totales: parseFloat(p.ingresos_totales),
      utilidad_total: parseFloat(p.utilidad_total),
      precio_promedio: parseFloat(p.precio_promedio),
      rentabilidad_promedio: parseFloat(p.rentabilidad_promedio),
      numero_ordenes: parseInt(p.numero_ordenes)
    }));

  } catch (error) {
    console.error('Error en obtenerTopProductos:', error);
    throw error;
  }
};

/**
 * Obtiene ventas por categoría
 */
const obtenerVentasPorCategoria = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        WITH TotalVentas AS (
          SELECT ISNULL(SUM(total_linea), 0) AS total
          FROM dbo.vw_ventas_dashboard
          WHERE fecha_venta >= @fecha_inicio
            AND fecha_venta <= @fecha_fin
        )
        SELECT
          categoria,
          COUNT(DISTINCT art_cod) AS productos_diferentes,
          SUM(cantidad_vendida) AS unidades_vendidas,
          SUM(total_linea) AS ventas_totales,
          SUM(utilidad_linea) AS utilidad_total,
          AVG(rentabilidad) AS rentabilidad_promedio,
          CASE
            WHEN (SELECT total FROM TotalVentas) > 0
            THEN (SUM(total_linea) * 100.0 / (SELECT total FROM TotalVentas))
            ELSE 0
          END AS porcentaje_ventas
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY categoria
        ORDER BY ventas_totales DESC
      `);

    return result.recordset.map(c => ({
      categoria: c.categoria,
      productos_diferentes: parseInt(c.productos_diferentes),
      unidades_vendidas: parseFloat(c.unidades_vendidas),
      ventas_totales: parseFloat(c.ventas_totales),
      utilidad_total: parseFloat(c.utilidad_total),
      rentabilidad_promedio: parseFloat(c.rentabilidad_promedio),
      porcentaje_ventas: parseFloat(c.porcentaje_ventas)
    }));

  } catch (error) {
    console.error('Error en obtenerVentasPorCategoria:', error);
    throw error;
  }
};

/**
 * Obtiene distribución de ventas por clasificación de rentabilidad
 */
const obtenerVentasPorRentabilidad = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        SELECT
          clasificacion_rentabilidad,
          COUNT(DISTINCT CAST(fac_nro AS VARCHAR) + '-' + art_cod) AS items_vendidos,
          SUM(total_linea) AS ventas_totales,
          SUM(utilidad_linea) AS utilidad_total,
          AVG(rentabilidad) AS rentabilidad_promedio,
          COUNT(DISTINCT fac_nro) AS numero_ordenes
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
          AND clasificacion_rentabilidad IS NOT NULL
        GROUP BY clasificacion_rentabilidad
        ORDER BY
          CASE clasificacion_rentabilidad
            WHEN 'ALTA' THEN 1
            WHEN 'MEDIA' THEN 2
            WHEN 'BAJA' THEN 3
            WHEN 'MINIMA' THEN 4
            WHEN 'PERDIDA' THEN 5
            ELSE 6
          END
      `);

    return result.recordset.map(r => ({
      clasificacion: r.clasificacion_rentabilidad,
      items_vendidos: parseInt(r.items_vendidos),
      ventas_totales: parseFloat(r.ventas_totales),
      utilidad_total: parseFloat(r.utilidad_total),
      rentabilidad_promedio: parseFloat(r.rentabilidad_promedio),
      numero_ordenes: parseInt(r.numero_ordenes)
    }));

  } catch (error) {
    console.error('Error en obtenerVentasPorRentabilidad:', error);
    throw error;
  }
};

/**
 * Obtiene top clientes
 */
const obtenerTopClientes = async (fechaInicio, fechaFin, limite = 10) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .input('limite', sql.Int, limite)
      .query(`
        SELECT TOP (@limite)
          nit_sec,
          cliente_nombre,
          cliente_email,
          COUNT(DISTINCT fac_nro) AS numero_ordenes,
          SUM(total_linea) AS valor_total_compras,
          CASE
            WHEN COUNT(DISTINCT fac_nro) > 0
            THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
            ELSE 0
          END AS ticket_promedio,
          SUM(cantidad_vendida) AS unidades_compradas,
          MAX(fecha_venta) AS ultima_compra,
          MIN(fecha_venta) AS primera_compra
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY nit_sec, cliente_nombre, cliente_email
        ORDER BY valor_total_compras DESC
      `);

    return result.recordset.map(c => ({
      nit_sec: c.nit_sec,
      nombre: c.cliente_nombre,
      email: c.cliente_email,
      numero_ordenes: parseInt(c.numero_ordenes),
      valor_total_compras: parseFloat(c.valor_total_compras),
      ticket_promedio: parseFloat(c.ticket_promedio),
      unidades_compradas: parseFloat(c.unidades_compradas),
      ultima_compra: c.ultima_compra,
      primera_compra: c.primera_compra
    }));

  } catch (error) {
    console.error('Error en obtenerTopClientes:', error);
    throw error;
  }
};

/**
 * Obtiene distribución de órdenes por estado
 */
const obtenerOrdenesPorEstado = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        SELECT
          ISNULL(estado_woo, 'Sin Estado') AS estado,
          COUNT(DISTINCT fac_nro) AS numero_ordenes,
          SUM(total_linea) AS valor_total,
          CASE
            WHEN COUNT(DISTINCT fac_nro) > 0
            THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
            ELSE 0
          END AS valor_promedio
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY estado_woo
        ORDER BY numero_ordenes DESC
      `);

    return result.recordset.map(e => ({
      estado: e.estado,
      numero_ordenes: parseInt(e.numero_ordenes),
      valor_total: parseFloat(e.valor_total),
      valor_promedio: parseFloat(e.valor_promedio)
    }));

  } catch (error) {
    console.error('Error en obtenerOrdenesPorEstado:', error);
    throw error;
  }
};

/**
 * Obtiene distribución de órdenes por canal (WooCommerce vs Local)
 */
const obtenerOrdenesPorCanal = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        SELECT
          canal_venta,
          COUNT(DISTINCT fac_nro) AS numero_ordenes,
          SUM(total_linea) AS ventas_totales,
          CASE
            WHEN COUNT(DISTINCT fac_nro) > 0
            THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
            ELSE 0
          END AS ticket_promedio,
          SUM(utilidad_linea) AS utilidad_total,
          AVG(rentabilidad) AS rentabilidad_promedio
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY canal_venta
        ORDER BY ventas_totales DESC
      `);

    return result.recordset.map(c => ({
      canal: c.canal_venta,
      numero_ordenes: parseInt(c.numero_ordenes),
      ventas_totales: parseFloat(c.ventas_totales),
      ticket_promedio: parseFloat(c.ticket_promedio),
      utilidad_total: parseFloat(c.utilidad_total),
      rentabilidad_promedio: parseFloat(c.rentabilidad_promedio)
    }));

  } catch (error) {
    console.error('Error en obtenerOrdenesPorCanal:', error);
    throw error;
  }
};

/**
 * Obtiene tendencia de ventas por día
 */
const obtenerTendenciaDiaria = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        SELECT
          fecha_venta,
          COUNT(DISTINCT fac_nro) AS numero_ordenes,
          SUM(total_linea) AS ventas_totales,
          CASE
            WHEN COUNT(DISTINCT fac_nro) > 0
            THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
            ELSE 0
          END AS ticket_promedio,
          SUM(cantidad_vendida) AS unidades_vendidas,
          SUM(utilidad_linea) AS utilidad_total
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY fecha_venta
        ORDER BY fecha_venta ASC
      `);

    return result.recordset.map(d => ({
      fecha: d.fecha_venta,
      numero_ordenes: parseInt(d.numero_ordenes),
      ventas_totales: parseFloat(d.ventas_totales),
      ticket_promedio: parseFloat(d.ticket_promedio),
      unidades_vendidas: parseFloat(d.unidades_vendidas),
      utilidad_total: parseFloat(d.utilidad_total)
    }));

  } catch (error) {
    console.error('Error en obtenerTendenciaDiaria:', error);
    throw error;
  }
};

/**
 * Obtiene tendencia de ventas por hora del día
 */
const obtenerVentasPorHora = async (fechaInicio, fechaFin) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('fecha_inicio', sql.Date, fechaInicio)
      .input('fecha_fin', sql.Date, fechaFin)
      .query(`
        SELECT
          hora,
          COUNT(DISTINCT fac_nro) AS numero_ordenes,
          SUM(total_linea) AS ventas_totales,
          CASE
            WHEN COUNT(DISTINCT fac_nro) > 0
            THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
            ELSE 0
          END AS ticket_promedio
        FROM dbo.vw_ventas_dashboard
        WHERE fecha_venta >= @fecha_inicio
          AND fecha_venta <= @fecha_fin
        GROUP BY hora
        ORDER BY hora ASC
      `);

    return result.recordset.map(h => ({
      hora: parseInt(h.hora),
      numero_ordenes: parseInt(h.numero_ordenes),
      ventas_totales: parseFloat(h.ventas_totales),
      ticket_promedio: parseFloat(h.ticket_promedio)
    }));

  } catch (error) {
    console.error('Error en obtenerVentasPorHora:', error);
    throw error;
  }
};

/**
 * Obtiene dashboard completo con todos los KPIs
 */
const obtenerDashboardCompleto = async (fechaInicio, fechaFin) => {
  try {
    // Ejecutar todas las consultas en paralelo
    const [
      kpisPrincipales,
      topProductos,
      ventasPorCategoria,
      ventasPorRentabilidad,
      topClientes,
      ordenesPorEstado,
      ordenesPorCanal,
      tendenciaDiaria
    ] = await Promise.all([
      obtenerKPIsPrincipales(fechaInicio, fechaFin),
      obtenerTopProductos(fechaInicio, fechaFin, 10, 'ingresos'),
      obtenerVentasPorCategoria(fechaInicio, fechaFin),
      obtenerVentasPorRentabilidad(fechaInicio, fechaFin),
      obtenerTopClientes(fechaInicio, fechaFin, 10),
      obtenerOrdenesPorEstado(fechaInicio, fechaFin),
      obtenerOrdenesPorCanal(fechaInicio, fechaFin),
      obtenerTendenciaDiaria(fechaInicio, fechaFin)
    ]);

    return {
      kpis_principales: kpisPrincipales,
      top_productos: topProductos,
      ventas_por_categoria: ventasPorCategoria,
      ventas_por_rentabilidad: ventasPorRentabilidad,
      top_clientes: topClientes,
      ordenes_por_estado: ordenesPorEstado,
      ordenes_por_canal: ordenesPorCanal,
      tendencia_diaria: tendenciaDiaria,
      periodo: {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      }
    };

  } catch (error) {
    console.error('Error en obtenerDashboardCompleto:', error);
    throw error;
  }
};

module.exports = {
  obtenerKPIsPrincipales,
  obtenerTasaCrecimiento,
  obtenerTopProductos,
  obtenerVentasPorCategoria,
  obtenerVentasPorRentabilidad,
  obtenerTopClientes,
  obtenerOrdenesPorEstado,
  obtenerOrdenesPorCanal,
  obtenerTendenciaDiaria,
  obtenerVentasPorHora,
  obtenerDashboardCompleto
};
