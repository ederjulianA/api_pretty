// routes/authRoutes.js
import express from 'express';
import { loginUser, getCurrentPermissions, changePassword, changePasswordAdmin } from '../controllers/authController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/authorize.js';

const router = express.Router();

// Ruta para el login
router.post('/login', loginUser);

// Ruta para obtener permisos actualizados
router.get('/permissions', verifyToken, getCurrentPermissions);

router.post('/change-password', verifyToken, changePassword);

// Resetea la password de OTRO usuario sin pedir la actual: solo administradores.
router.post('/change-password-admin', verifyToken, requireAdmin, changePasswordAdmin);

export default router;
