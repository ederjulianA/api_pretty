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
  calcularCostosAutomatico,
  aplicarCostosValidados,
  registrarCostoIndividual,
  aprobarCostoIndividual,
  aprobarCostosMasivo
} = require('../controllers/cargaCostosController');

const router = express.Router();

router.get('/exportar', auth, exportarPlantillaCostos);
router.post('/importar', auth, importarCostosDesdeExcel);
router.get('/resumen', auth, obtenerResumenCarga);
router.get('/alertas', auth, obtenerProductosConAlertas);
router.post('/calcular-automatico', auth, calcularCostosAutomatico);
router.post('/aplicar', auth, aplicarCostosValidados);
router.post('/registrar-individual', auth, registrarCostoIndividual);
router.put('/aprobar/:art_cod', auth, aprobarCostoIndividual);
router.put('/actualizar-estado', auth, aprobarCostosMasivo);

module.exports = router;
