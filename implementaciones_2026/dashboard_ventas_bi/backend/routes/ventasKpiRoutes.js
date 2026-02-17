/**
 * Rutas: Dashboard de Ventas BI
 * Fecha: 2026-02-17
 * Base: /api/dashboard/ventas
 */

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

const {
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
} = require('../controllers/ventasKpiController');

/**
 * Todas las rutas requieren autenticación JWT
 * Base URL: /api/dashboard/ventas
 */

// Dashboard completo - Endpoint principal
// GET /api/dashboard/ventas/completo
router.get('/completo', auth, getDashboardCompleto);

// KPIs principales
// GET /api/dashboard/ventas/kpis
router.get('/kpis', auth, getKPIsPrincipales);

// Tasa de crecimiento
// GET /api/dashboard/ventas/crecimiento
router.get('/crecimiento', auth, getCrecimiento);

// Top productos más vendidos
// GET /api/dashboard/ventas/top-productos
router.get('/top-productos', auth, getTopProductos);

// Ventas por categoría
// GET /api/dashboard/ventas/categorias
router.get('/categorias', auth, getVentasPorCategoria);

// Ventas por rentabilidad
// GET /api/dashboard/ventas/rentabilidad
router.get('/rentabilidad', auth, getVentasPorRentabilidad);

// Top clientes
// GET /api/dashboard/ventas/top-clientes
router.get('/top-clientes', auth, getTopClientes);

// Órdenes por estado
// GET /api/dashboard/ventas/ordenes-estado
router.get('/ordenes-estado', auth, getOrdenesPorEstado);

// Órdenes por canal (WooCommerce vs Local)
// GET /api/dashboard/ventas/ordenes-canal
router.get('/ordenes-canal', auth, getOrdenesPorCanal);

// Tendencia diaria
// GET /api/dashboard/ventas/tendencia-diaria
router.get('/tendencia-diaria', auth, getTendenciaDiaria);

// Ventas por hora del día
// GET /api/dashboard/ventas/ventas-hora
router.get('/ventas-hora', auth, getVentasPorHora);

module.exports = router;
