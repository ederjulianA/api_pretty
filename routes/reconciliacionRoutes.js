/**
 * routes/reconciliacionRoutes.js — SPEC-013, Tarea 7. Montado en /api/woo (spec: POST /api/woo/reconciliar).
 * Todas con verifyToken.
 */
import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';
import { ejecutarReconciliacion, listarReconciliaciones, obtenerReconciliacion, estadoReconciliacion } from '../jobs/reconciliarInventarioWoo.js';

const router = express.Router();

/** POST /api/woo/reconciliar  body opcional {autocorregir: true|false} (default: WOO_RECONCILIACION_AUTOCORREGIR) */
router.post('/reconciliar', verifyToken, async (req, res) => {
  try {
    const autocorregir = typeof req.body?.autocorregir === 'boolean' ? req.body.autocorregir : null;
    const r = await ejecutarReconciliacion({ autocorregir, origen: 'MANUAL', usuario: req.user?.usu_cod || 'SISTEMA' });
    res.status(r.error ? 500 : 200).json({ success: !r.error && !r.omitido, reporte: r });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/woo/reconciliaciones?limite= — historial (resumen por fila) + estado del scheduler */
router.get('/reconciliaciones', verifyToken, async (req, res) => {
  try {
    const [reconciliaciones, estado] = await Promise.all([listarReconciliaciones({ limite: req.query.limite }), estadoReconciliacion()]);
    res.json({ success: true, reconciliaciones, estado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/woo/reconciliaciones/:id — reporte completo (diferencias + invariantes) */
router.get('/reconciliaciones/:id', verifyToken, async (req, res) => {
  try {
    const r = await obtenerReconciliacion(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: 'Reconciliación no encontrada' });
    res.json({ success: true, reconciliacion: r });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
