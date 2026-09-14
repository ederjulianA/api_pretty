/**
 * routes/pedidosWebRoutes.js — SPEC-013, Fase 2. Pantalla "Pedidos web".
 * Todas con verifyToken desde el día uno (no entran en la cola de endpoints abiertos de revision_seguridad/).
 */
import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';
import { listar, salud, documentos, facturar, anular, importarAhora, extender, vencerAhora } from '../controllers/pedidosWebController.js';

const router = express.Router();

router.get('/', verifyToken, listar);
router.get('/salud', verifyToken, salud);
router.post('/importar-ahora', verifyToken, importarAhora);
router.post('/vencer-ahora', verifyToken, vencerAhora);
router.post('/:fac_nro_rem/extender', verifyToken, extender);
router.get('/:woo_order_id/documentos', verifyToken, documentos);
router.post('/:fac_nro_rem/facturar', verifyToken, facturar);
router.post('/:fac_nro_rem/anular', verifyToken, anular);

export default router;
