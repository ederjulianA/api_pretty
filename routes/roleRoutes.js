import express from 'express';
import { getRoles, getRoleById, createRole, updateRole, deleteRole } from '../controllers/roleController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';
import authorize from '../middlewares/authorize.js';

const { requirePermission } = authorize;

const router = express.Router();

// Modulo 'admin', accion 'manage_roles' del RBAC. Solo el rol Administrador.

// Ruta para obtener roles
router.get('/', verifyToken, requirePermission('admin', 'manage_roles'), getRoles);

// Ruta para obtener un rol específico
router.get('/:id', verifyToken, requirePermission('admin', 'manage_roles'), getRoleById);

// Ruta para crear un nuevo rol
router.post('/', verifyToken, requirePermission('admin', 'manage_roles'), createRole);

// Ruta para actualizar un rol
router.put('/:id', verifyToken, requirePermission('admin', 'manage_roles'), updateRole);

// Ruta para eliminar un rol
router.delete('/:id', verifyToken, requirePermission('admin', 'manage_roles'), deleteRole);

export default router; 