/**
 * Rutas: Compras con Costo Promedio Ponderado
 * Fecha: 2026-02-15
 */

const express = require('express');
const auth = require('../middlewares/auth');

const {
  crearCompra,
  listarCompras,
  obtenerCompra,
  reporteVariacionCostos,
  reporteComprasPorProveedor,
  reporteValorizadoInventario,
  reporteArticulosSinCosto
} = require('../controllers/compraController');

const router = express.Router();

// CRUD Básico
router.post('/', auth, crearCompra);
router.get('/', auth, listarCompras);
router.get('/:fac_nro', auth, obtenerCompra);

// Reportes
router.get('/reportes/variacion-costos', auth, reporteVariacionCostos);
router.get('/reportes/por-proveedor', auth, reporteComprasPorProveedor);
router.get('/reportes/valorizado-inventario', auth, reporteValorizadoInventario);
router.get('/reportes/articulos-sin-costo', auth, reporteArticulosSinCosto);

module.exports = router;
