/**
 * Controlador: Reportes de Rentabilidad
 * Fecha: 2026-02-17
 * Descripción: Endpoints para análisis de rentabilidad de productos
 */

const {
  obtenerReporteRentabilidad,
  obtenerResumenPorClasificacion
} = require('../models/rentabilidadModel');

/**
 * GET /api/reportes/rentabilidad
 * Obtiene reporte detallado de rentabilidad con filtros
 *
 * Query params:
 * - clasificacion: ALTA, MEDIA, BAJA, MINIMA, PERDIDA
 * - rentabilidad_min: número (%)
 * - rentabilidad_max: número (%)
 * - inv_gru_cod: código de grupo
 * - inv_sub_gru_cod: código de subgrupo
 * - solo_con_stock: boolean
 * - ordenar_por: rentabilidad_desc, rentabilidad_asc, utilidad_desc, etc.
 * - limit: número (max 1000, default 100)
 * - offset: número (default 0)
 */
const reporteRentabilidad = async (req, res) => {
  try {
    const {
      clasificacion,
      rentabilidad_min,
      rentabilidad_max,
      inv_gru_cod,
      inv_sub_gru_cod,
      solo_con_stock,
      ordenar_por,
      limit,
      offset
    } = req.query;

    // Validar clasificacion si se proporciona
    const clasificacionesValidas = ['ALTA', 'MEDIA', 'BAJA', 'MINIMA', 'PERDIDA'];
    if (clasificacion && !clasificacionesValidas.includes(clasificacion.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Clasificación inválida. Valores permitidos: ${clasificacionesValidas.join(', ')}`
      });
    }

    // Validar rangos de rentabilidad
    if (rentabilidad_min !== undefined && isNaN(rentabilidad_min)) {
      return res.status(400).json({
        success: false,
        message: 'rentabilidad_min debe ser un número'
      });
    }

    if (rentabilidad_max !== undefined && isNaN(rentabilidad_max)) {
      return res.status(400).json({
        success: false,
        message: 'rentabilidad_max debe ser un número'
      });
    }

    // Construir filtros
    const filtros = {};

    if (clasificacion) {
      filtros.clasificacion = clasificacion.toUpperCase();
    }

    if (rentabilidad_min !== undefined) {
      filtros.rentabilidad_min = parseFloat(rentabilidad_min);
    }

    if (rentabilidad_max !== undefined) {
      filtros.rentabilidad_max = parseFloat(rentabilidad_max);
    }

    if (inv_gru_cod) {
      filtros.inv_gru_cod = inv_gru_cod;
    }

    if (inv_sub_gru_cod) {
      filtros.inv_sub_gru_cod = inv_sub_gru_cod;
    }

    if (solo_con_stock) {
      filtros.solo_con_stock = solo_con_stock === 'true' || solo_con_stock === '1';
    }

    if (ordenar_por) {
      filtros.ordenar_por = ordenar_por;
    }

    if (limit) {
      filtros.limit = parseInt(limit);
    }

    if (offset) {
      filtros.offset = parseInt(offset);
    }

    // Obtener reporte
    const resultado = await obtenerReporteRentabilidad(filtros);

    return res.status(200).json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error('Error en reporteRentabilidad:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener reporte de rentabilidad',
      error: error.message
    });
  }
};

/**
 * GET /api/reportes/rentabilidad/resumen
 * Obtiene resumen de rentabilidad agrupado por clasificación
 */
const resumenRentabilidad = async (req, res) => {
  try {
    const resumen = await obtenerResumenPorClasificacion();

    return res.status(200).json({
      success: true,
      data: resumen
    });

  } catch (error) {
    console.error('Error en resumenRentabilidad:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener resumen de rentabilidad',
      error: error.message
    });
  }
};

module.exports = {
  reporteRentabilidad,
  resumenRentabilidad
};
