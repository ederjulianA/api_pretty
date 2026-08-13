import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';
import {
  crearPromocion,
  actualizarPromocion,
  obtenerPromociones,
  obtenerPromocionPorId,
  sincronizarPreciosPromocion,
  sincronizarPreciosMultiplesPromociones,
  obtenerArticulosParaSincronizacion,
  testSincronizacionDirecta
} from '../controllers/promocionController.js';

const router = express.Router();

// Rutas básicas de promociones
router.post('/', verifyToken, crearPromocion);
router.put('/:pro_sec', verifyToken, actualizarPromocion);
router.get('/', obtenerPromociones);
router.get('/:pro_sec', obtenerPromocionPorId);

// Rutas de sincronización de precios
router.post('/:pro_sec/sincronizar-precios', sincronizarPreciosPromocion);
router.post('/sincronizar-multiples', sincronizarPreciosMultiplesPromociones);
router.get('/:pro_sec/articulos-sincronizacion', obtenerArticulosParaSincronizacion);

// Ruta de test para sincronización directa
router.post('/test/sincronizacion-directa', testSincronizacionDirecta);

export default router; 