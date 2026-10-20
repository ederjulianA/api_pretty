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
router.get('/', verifyToken, obtenerPromociones);
router.get('/:pro_sec', verifyToken, obtenerPromocionPorId);

// Rutas de sincronización de precios
router.post('/:pro_sec/sincronizar-precios', verifyToken, sincronizarPreciosPromocion);
router.post('/sincronizar-multiples', verifyToken, sincronizarPreciosMultiplesPromociones);
router.get('/:pro_sec/articulos-sincronizacion', verifyToken, obtenerArticulosParaSincronizacion);

// Ruta de test para sincronización directa
router.post('/test/sincronizacion-directa', verifyToken, testSincronizacionDirecta);

export default router; 