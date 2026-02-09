/**
 * Rutas: Carga Inicial de Costos
 * Fecha: 2026-02-09
 */

const express = require('express');
const auth = require('../middlewares/auth');

const {
  exportarPlantillaCostos,
  importarCostosDesdeExcel,
  obtenerResumenCarga,
  obtenerProductosConAlertas,
  aplicarCostosValidados
} = require('../controllers/cargaCostosController');

const router = express.Router();

router.get('/exportar', auth, exportarPlantillaCostos);
router.post('/importar', auth, importarCostosDesdeExcel);
router.get('/resumen', auth, obtenerResumenCarga);
router.get('/alertas', auth, obtenerProductosConAlertas);
router.post('/aplicar', auth, aplicarCostosValidados);

module.exports = router;
