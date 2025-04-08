import express from 'express';
import { getProveedorById, searchProveedores } from '../controllers/proveedorController.js';

const router = express.Router();

router.get('/proveedor/:nit_ide', getProveedorById);
router.get('/proveedores', searchProveedores);

export default router; 