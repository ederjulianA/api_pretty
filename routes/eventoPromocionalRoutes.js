// routes/eventoPromocionalRoutes.js
import express from 'express';
import {
    crearEvento,
    actualizarEvento,
    obtenerEventos,
    obtenerEventoPorId,
    obtenerEventoActivoEndpoint
} from '../controllers/eventoPromocionalController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Rutas de eventos promocionales
// Todas las rutas requieren autenticación
router.post('/', verifyToken, crearEvento);
router.put('/:eve_sec', verifyToken, actualizarEvento);
router.get('/', verifyToken, obtenerEventos);
router.get('/activo', verifyToken, obtenerEventoActivoEndpoint);
router.get('/:eve_sec', verifyToken, obtenerEventoPorId);

export default router;

