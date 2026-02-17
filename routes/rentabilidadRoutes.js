/**
 * Rutas: Reportes de Rentabilidad
 * Fecha: 2026-02-17
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');
const {
  reporteRentabilidad,
  resumenRentabilidad
} = require('../controllers/rentabilidadController');

/**
 * GET /api/reportes/rentabilidad
 * Reporte detallado de rentabilidad con filtros
 *
 * Query params:
 * - clasificacion: ALTA | MEDIA | BAJA | MINIMA | PERDIDA
 * - rentabilidad_min: número (ej: 20 para 20%)
 * - rentabilidad_max: número (ej: 50 para 50%)
 * - inv_gru_cod: código de grupo de inventario
 * - inv_sub_gru_cod: código de subgrupo de inventario
 * - solo_con_stock: true | false
 * - ordenar_por: rentabilidad_desc | rentabilidad_asc | utilidad_desc | utilidad_potencial_desc | valor_inventario_desc
 * - limit: número (max 1000, default 100)
 * - offset: número (default 0)
 *
 * Ejemplos:
 * - /api/reportes/rentabilidad?clasificacion=ALTA&limit=50
 * - /api/reportes/rentabilidad?rentabilidad_min=30&solo_con_stock=true
 * - /api/reportes/rentabilidad?inv_gru_cod=9&ordenar_por=utilidad_desc
 */
router.get('/rentabilidad', verifyToken, reporteRentabilidad);

/**
 * GET /api/reportes/rentabilidad/resumen
 * Resumen agrupado por clasificación de rentabilidad
 *
 * Retorna:
 * - Cantidad de productos por clasificación
 * - Rentabilidad promedio por clasificación
 * - Valor de inventario por clasificación
 * - Utilidad potencial por clasificación
 */
router.get('/rentabilidad/resumen', verifyToken, resumenRentabilidad);

module.exports = router;
