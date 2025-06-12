// routes/authRoutes.js
import express from 'express';
import { loginUser, getCurrentPermissions, changePassword, changePasswordAdmin } from '../controllers/authController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Ruta para el login
router.post('/login', loginUser);

// Ruta para obtener permisos actualizados
router.get('/permissions', verifyToken, getCurrentPermissions);

router.post('/change-password', verifyToken, changePassword);

router.post('/change-password-admin', verifyToken, changePasswordAdmin);

export default router;
