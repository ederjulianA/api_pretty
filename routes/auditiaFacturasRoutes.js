/**
 * Rutas: Auditoría de Facturas
 * Fecha: 2026-03-01
 * Base: /api/auditoria/facturas
 */

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

const {
  getFacturasAuditoria,
  getDetalleFactura,
  getFacturasPorEstado
} = require('../controllers/auditiaFacturasController');

/**
 * Todas las rutas requieren autenticación JWT
 * Base URL: /api/auditoria/facturas
 */

// Listado de facturas con paginación
// GET /api/auditoria/facturas/listado
router.get('/listado', auth, getFacturasAuditoria);

// Detalle de una factura específica
// GET /api/auditoria/facturas/detalle/:fac_sec
router.get('/detalle/:fac_sec', auth, getDetalleFactura);

// Resumen de facturas por estado WooCommerce
// GET /api/auditoria/facturas/por-estado
router.get('/por-estado', auth, getFacturasPorEstado);

module.exports = router;
