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
  reporteArticulosSinCosto,
  reporteValorizadoArbolCategorias,
  reporteValorizadoArbolSubcategorias,
  reporteValorizadoArbolArticulos
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

// Reportes - Árbol Valorizado (Drill-down jerárquico)
router.get('/reportes/valorizado-arbol/categorias', auth, reporteValorizadoArbolCategorias);
router.get('/reportes/valorizado-arbol/categorias/:inv_gru_cod/subcategorias', auth, reporteValorizadoArbolSubcategorias);
router.get('/reportes/valorizado-arbol/subcategorias/:inv_sub_gru_cod/articulos', auth, reporteValorizadoArbolArticulos);

module.exports = router;
