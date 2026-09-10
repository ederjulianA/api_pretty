/**
 * routes/cierreMesRoutes.js
 *
 * Base: /api/cierre-mes
 *
 * Todos los endpoints exigen verifyToken: el cierre es un proceso contable y no
 * puede quedar expuesto como estan hoy orderRoutes y syncWooOrdersRoutes.
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');

const {
  listarCierresEndpoint,
  obtenerCierreEndpoint,
  validarPeriodoEndpoint,
  preflightEndpoint,
  estadoMasivoEndpoint,
  facturarBloqueEndpoint,
  anularBloqueEndpoint,
  crearCierreEndpoint,
  anularCierreEndpoint
} = require('../controllers/cierreMesController');

// --- Rutas literales: deben ir ANTES de /:cie_sec o Express las captura como parametro ---

// GET /api/cierre-mes/validar?anio=2026&mes=7
router.get('/validar', verifyToken, validarPeriodoEndpoint);

// GET /api/cierre-mes/preflight?anio=2026&mes=7
router.get('/preflight', verifyToken, preflightEndpoint);

// --- Operaciones masivas del wizard ---

// POST /api/cierre-mes/pedidos/estado-masivo
router.post('/pedidos/estado-masivo', verifyToken, estadoMasivoEndpoint);

// POST /api/cierre-mes/cotizaciones/facturar-bloque
router.post('/cotizaciones/facturar-bloque', verifyToken, facturarBloqueEndpoint);

// POST /api/cierre-mes/cotizaciones/anular-bloque
router.post('/cotizaciones/anular-bloque', verifyToken, anularBloqueEndpoint);

// --- CRUD del cierre ---

// GET /api/cierre-mes?page=1&pageSize=20
router.get('/', verifyToken, listarCierresEndpoint);

// POST /api/cierre-mes
router.post('/', verifyToken, crearCierreEndpoint);

// POST /api/cierre-mes/:cie_sec/anular
router.post('/:cie_sec/anular', verifyToken, anularCierreEndpoint);

// GET /api/cierre-mes/:cie_sec  — al final, es el patron mas laxo
router.get('/:cie_sec', verifyToken, obtenerCierreEndpoint);

module.exports = router;
