const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser } = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/authorize');

// Modulo 'admin', accion 'manage_users' del RBAC (dbo.Modulos / dbo.Acciones).
// Hoy solo el rol Administrador lo tiene; Supervisor y Vendedor no.
router.get('/', verifyToken, requirePermission('admin', 'manage_users'), getUsers);
router.post('/', verifyToken, requirePermission('admin', 'manage_users'), createUser);
router.put('/:id', verifyToken, requirePermission('admin', 'manage_users'), updateUser);

module.exports = router; 