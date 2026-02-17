/**
 * Controlador: KPIs de Ventas para Dashboard BI
 * Fecha: 2026-02-17
 * Descripción: Controladores HTTP para endpoints del dashboard de ventas
 */

const {
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
} = require('../models/ventasKpiModel');

/**
 * Utilidad para calcular fechas de períodos predefinidos
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
 * Parsea y valida fechas desde query params
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

    return calcularPeriodo(periodo);
  }

  if (fecha_inicio && fecha_fin) {
    const inicio = new Date(fecha_inicio);
    const fin = new Date(fecha_fin);

    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
      throw new Error('Formato de fecha inválido. Use formato YYYY-MM-DD');
    }

    if (inicio > fin) {
      throw new Error('La fecha de inicio no puede ser mayor que la fecha fin');
    }

    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);

    return { fechaInicio: inicio, fechaFin: fin };
  }

  return calcularPeriodo('ultimos_30_dias');
};

/**
 * GET /api/dashboard/ventas/kpis
 * Obtiene KPIs principales del dashboard
 */
const getKPIsPrincipales = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const kpis = await obtenerKPIsPrincipales(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: kpis,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getKPIsPrincipales:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo KPIs principales',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/crecimiento
 * Obtiene tasa de crecimiento comparando dos períodos
 */
const getCrecimiento = async (req, res) => {
  try {
    const { periodo } = req.query;

    let fechas;

    if (periodo) {
      const periodoActual = calcularPeriodo(periodo);

      const duracionMs = periodoActual.fechaFin - periodoActual.fechaInicio;
      const fechaFinAnterior = new Date(periodoActual.fechaInicio);
      fechaFinAnterior.setMilliseconds(-1);
      const fechaInicioAnterior = new Date(fechaFinAnterior.getTime() - duracionMs);

      fechas = {
        fechaInicioActual: periodoActual.fechaInicio,
        fechaFinActual: periodoActual.fechaFin,
        fechaInicioAnterior: fechaInicioAnterior,
        fechaFinAnterior: fechaFinAnterior
      };
    } else {
      const { fecha_inicio_actual, fecha_fin_actual, fecha_inicio_anterior, fecha_fin_anterior } = req.query;

      if (!fecha_inicio_actual || !fecha_fin_actual || !fecha_inicio_anterior || !fecha_fin_anterior) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren fecha_inicio_actual, fecha_fin_actual, fecha_inicio_anterior, fecha_fin_anterior o un periodo'
        });
      }

      fechas = {
        fechaInicioActual: new Date(fecha_inicio_actual),
        fechaFinActual: new Date(fecha_fin_actual),
        fechaInicioAnterior: new Date(fecha_inicio_anterior),
        fechaFinAnterior: new Date(fecha_fin_anterior)
      };
    }

    const resultado = await obtenerTasaCrecimiento(
      fechas.fechaInicioActual,
      fechas.fechaFinActual,
      fechas.fechaInicioAnterior,
      fechas.fechaFinAnterior
    );

    res.status(200).json({
      success: true,
      data: resultado,
      periodos: {
        actual: {
          fecha_inicio: fechas.fechaInicioActual.toISOString().split('T')[0],
          fecha_fin: fechas.fechaFinActual.toISOString().split('T')[0]
        },
        anterior: {
          fecha_inicio: fechas.fechaInicioAnterior.toISOString().split('T')[0],
          fecha_fin: fechas.fechaFinAnterior.toISOString().split('T')[0]
        }
      }
    });

  } catch (error) {
    console.error('Error en getCrecimiento:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculando tasa de crecimiento',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/top-productos
 * Obtiene top productos más vendidos
 */
const getTopProductos = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);
    const limite = parseInt(req.query.limite) || 10;
    const ordenarPor = req.query.ordenar_por || 'unidades';

    if (!['unidades', 'ingresos'].includes(ordenarPor)) {
      return res.status(400).json({
        success: false,
        message: 'ordenar_por debe ser "unidades" o "ingresos"'
      });
    }

    const productos = await obtenerTopProductos(fechaInicio, fechaFin, limite, ordenarPor);

    res.status(200).json({
      success: true,
      data: productos,
      parametros: {
        limite,
        ordenar_por: ordenarPor
      },
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getTopProductos:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo top productos',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/categorias
 * Obtiene ventas por categoría
 */
const getVentasPorCategoria = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const categorias = await obtenerVentasPorCategoria(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: categorias,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getVentasPorCategoria:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo ventas por categoría',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/rentabilidad
 * Obtiene distribución de ventas por rentabilidad
 */
const getVentasPorRentabilidad = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const rentabilidad = await obtenerVentasPorRentabilidad(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: rentabilidad,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getVentasPorRentabilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo ventas por rentabilidad',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/top-clientes
 * Obtiene top clientes
 */
const getTopClientes = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);
    const limite = parseInt(req.query.limite) || 10;

    const clientes = await obtenerTopClientes(fechaInicio, fechaFin, limite);

    res.status(200).json({
      success: true,
      data: clientes,
      parametros: {
        limite
      },
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getTopClientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo top clientes',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/ordenes-estado
 * Obtiene distribución de órdenes por estado
 */
const getOrdenesPorEstado = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const estados = await obtenerOrdenesPorEstado(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: estados,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getOrdenesPorEstado:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo órdenes por estado',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/ordenes-canal
 * Obtiene distribución de órdenes por canal
 */
const getOrdenesPorCanal = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const canales = await obtenerOrdenesPorCanal(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: canales,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getOrdenesPorCanal:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo órdenes por canal',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/tendencia-diaria
 * Obtiene tendencia de ventas por día
 */
const getTendenciaDiaria = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const tendencia = await obtenerTendenciaDiaria(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: tendencia,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getTendenciaDiaria:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo tendencia diaria',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/ventas-hora
 * Obtiene distribución de ventas por hora del día
 */
const getVentasPorHora = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const ventasHora = await obtenerVentasPorHora(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: ventasHora,
      periodo: {
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en getVentasPorHora:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo ventas por hora',
      error: error.message
    });
  }
};

/**
 * GET /api/dashboard/ventas/completo
 * Obtiene dashboard completo con todos los KPIs
 */
const getDashboardCompleto = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = parsearFechas(req);

    const dashboard = await obtenerDashboardCompleto(fechaInicio, fechaFin);

    res.status(200).json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error('Error en getDashboardCompleto:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo dashboard completo',
      error: error.message
    });
  }
};

module.exports = {
  getKPIsPrincipales,
  getCrecimiento,
  getTopProductos,
  getVentasPorCategoria,
  getVentasPorRentabilidad,
  getTopClientes,
  getOrdenesPorEstado,
  getOrdenesPorCanal,
  getTendenciaDiaria,
  getVentasPorHora,
  getDashboardCompleto
};
