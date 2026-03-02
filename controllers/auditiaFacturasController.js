/**
 * Controlador: Auditoría de Facturas
 * Fecha: 2026-03-01
 * Descripción: Controladores HTTP para endpoints de auditoría de facturas
 */

const {
  obtenerFacturasAuditoria,
  obtenerDetalleFactura,
  obtenerFacturasPorEstadoWoo
} = require('../models/auditiaFacturasModel');

/**
 * Utilidad para calcular fechas de períodos predefinidos
 * (Reutilizada desde ventasKpiController)
 */
const calcularPeriodo = (periodo) => {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);

  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  switch (periodo) {
    case 'hoy':
      return { fechaInicio: inicio, fechaFin: hoy };

    case 'ayer':
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      ayer.setHours(0, 0, 0, 0);
      const ayerFin = new Date(ayer);
      ayerFin.setHours(23, 59, 59, 999);
      return { fechaInicio: ayer, fechaFin: ayerFin };

    case 'ultimos_7_dias':
      const hace7Dias = new Date(inicio);
      hace7Dias.setDate(hace7Dias.getDate() - 7);
      return { fechaInicio: hace7Dias, fechaFin: hoy };

    case 'ultimos_15_dias':
      const hace15Dias = new Date(inicio);
      hace15Dias.setDate(hace15Dias.getDate() - 15);
      return { fechaInicio: hace15Dias, fechaFin: hoy };

    case 'ultimos_30_dias':
      const hace30Dias = new Date(inicio);
      hace30Dias.setDate(hace30Dias.getDate() - 30);
      return { fechaInicio: hace30Dias, fechaFin: hoy };

    case 'semana_actual':
      const primerDiaSemana = new Date(inicio);
      const diaActual = primerDiaSemana.getDay();
      const diff = diaActual === 0 ? -6 : 1 - diaActual;
      primerDiaSemana.setDate(primerDiaSemana.getDate() + diff);
      return { fechaInicio: primerDiaSemana, fechaFin: hoy };

    case 'semana_anterior':
      const inicioSemanaAnterior = new Date(inicio);
      const diaActualAnterior = inicioSemanaAnterior.getDay();
      const diffAnterior = diaActualAnterior === 0 ? -6 : 1 - diaActualAnterior;
      inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() + diffAnterior - 7);
      const finSemanaAnterior = new Date(inicioSemanaAnterior);
      finSemanaAnterior.setDate(finSemanaAnterior.getDate() + 6);
      finSemanaAnterior.setHours(23, 59, 59, 999);
      return { fechaInicio: inicioSemanaAnterior, fechaFin: finSemanaAnterior };

    case 'mes_actual':
      const primerDiaMes = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      return { fechaInicio: primerDiaMes, fechaFin: hoy };

    case 'mes_anterior':
      const primerDiaMesAnterior = new Date(inicio.getFullYear(), inicio.getMonth() - 1, 1);
      const ultimoDiaMesAnterior = new Date(inicio.getFullYear(), inicio.getMonth(), 0);
      ultimoDiaMesAnterior.setHours(23, 59, 59, 999);
      return { fechaInicio: primerDiaMesAnterior, fechaFin: ultimoDiaMesAnterior };

    default:
      const hace30DiasDefault = new Date(inicio);
      hace30DiasDefault.setDate(hace30DiasDefault.getDate() - 30);
      return { fechaInicio: hace30DiasDefault, fechaFin: hoy };
  }
};

/**
 * Formatea una fecha Date a string 'YYYY-MM-DD'
 */
const formatearFecha = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Parsea y valida fechas desde query params.
 * Retorna strings 'YYYY-MM-DD' para evitar problemas de timezone
 * al pasar objetos Date al driver mssql (que los convierte a UTC).
 */
const parsearFechas = (req) => {
  const { periodo, fecha_inicio, fecha_fin } = req.query;

  if (periodo) {
    const periodosValidos = [
      'hoy', 'ayer', 'ultimos_7_dias', 'ultimos_15_dias', 'ultimos_30_dias',
      'semana_actual', 'semana_anterior', 'mes_actual', 'mes_anterior'
    ];

    if (!periodosValidos.includes(periodo)) {
      throw new Error(`Período inválido. Valores válidos: ${periodosValidos.join(', ')}`);
    }

    const { fechaInicio, fechaFin } = calcularPeriodo(periodo);
    return { fechaInicio: formatearFecha(fechaInicio), fechaFin: formatearFecha(fechaFin) };
  }

  if (fecha_inicio && fecha_fin) {
    // Validar formato YYYY-MM-DD con regex antes de usar
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha_inicio) || !dateRegex.test(fecha_fin)) {
      throw new Error('Formato de fecha inválido. Use formato YYYY-MM-DD');
    }

    // Validar que sean fechas reales
    const inicio = new Date(fecha_inicio + 'T00:00:00');
    const fin = new Date(fecha_fin + 'T00:00:00');

    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
      throw new Error('Formato de fecha inválido. Use formato YYYY-MM-DD');
    }

    if (fecha_inicio > fecha_fin) {
      throw new Error('La fecha de inicio no puede ser mayor que la fecha fin');
    }

    // Retornar strings directamente - no objetos Date
    return { fechaInicio: fecha_inicio, fechaFin: fecha_fin };
  }

  const { fechaInicio, fechaFin } = calcularPeriodo('ultimos_30_dias');
  return { fechaInicio: formatearFecha(fechaInicio), fechaFin: formatearFecha(fechaFin) };
};

/**
 * GET /api/auditoria/facturas/listado
 * Obtiene listado de facturas del período con información para auditoría
 */
const getFacturasAuditoria = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);
    const pagina = req.query.pagina || 1;
    const porPagina = req.query.por_pagina || 50;

    const resultado = await obtenerFacturasAuditoria(fechaInicio, fechaFin, pagina, porPagina);

    res.status(200).json({
      success: true,
      data: resultado.facturas,
      paginacion: resultado.paginacion,
      periodo: {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      }
    });

  } catch (error) {
    console.error('Error en getFacturasAuditoria:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo facturas para auditoría',
      error: error.message
    });
  }
};

/**
 * GET /api/auditoria/facturas/detalle/:fac_sec
 * Obtiene detalle completo de una factura específica
 */
const getDetalleFactura = async (req, res) => {
  try {
    const { fac_sec } = req.params;

    if (!fac_sec) {
      return res.status(400).json({
        success: false,
        message: 'Parámetro fac_sec requerido'
      });
    }

    const resultado = await obtenerDetalleFactura(fac_sec);

    res.status(200).json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error('Error en getDetalleFactura:', error);
    res.status(error.message === 'Factura no encontrada' ? 404 : 500).json({
      success: false,
      message: 'Error obteniendo detalle de factura',
      error: error.message
    });
  }
};

/**
 * GET /api/auditoria/facturas/por-estado
 * Obtiene resumen de facturas por estado WooCommerce
 */
const getFacturasPorEstado = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const resultado = await obtenerFacturasPorEstadoWoo(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: resultado,
      periodo: {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      }
    });

  } catch (error) {
    console.error('Error en getFacturasPorEstado:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo facturas por estado',
      error: error.message
    });
  }
};

module.exports = {
  getFacturasAuditoria,
  getDetalleFactura,
  getFacturasPorEstado
};
