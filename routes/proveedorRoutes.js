import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';
import { getProveedorById, searchProveedores } from '../controllers/proveedorController.js';

const router = express.Router();

router.get('/proveedor/:nit_ide', verifyToken, getProveedorById);
router.get('/proveedores', verifyToken, searchProveedores);

export default router; 