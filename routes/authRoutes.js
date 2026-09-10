// routes/authRoutes.js
import express from 'express';
import { loginUser, getCurrentPermissions, changePassword, changePasswordAdmin } from '../controllers/authController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/authorize.js';
import { loginLimiter } from '../middlewares/rateLimits.js';

const router = express.Router();

// Ruta para el login. El limitador va antes del controlador: frena la fuerza
// bruta sin llegar siquiera a consultar la BD ni a ejecutar bcrypt.
router.post('/login', loginLimiter, loginUser);

// Ruta para obtener permisos actualizados
router.get('/permissions', verifyToken, getCurrentPermissions);

router.post('/change-password', verifyToken, changePassword);

// Resetea la password de OTRO usuario sin pedir la actual: solo administradores.
router.post('/change-password-admin', verifyToken, requireAdmin, changePasswordAdmin);

export default router;
