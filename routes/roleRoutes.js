import express from 'express';
import { getRoles, getRoleById, createRole, updateRole, deleteRole } from '../controllers/roleController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Ruta para obtener roles
router.get('/', verifyToken, getRoles);

// Ruta para obtener un rol específico
router.get('/:id', verifyToken, getRoleById);

// Ruta para crear un nuevo rol
router.post('/', verifyToken, createRole);

// Ruta para actualizar un rol
router.put('/:id', verifyToken, updateRole);

// Ruta para eliminar un rol
router.delete('/:id', verifyToken, deleteRole);

export default router; 