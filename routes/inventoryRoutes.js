import express from 'express';
import { createAdjustment } from '../controllers/inventoryController.js';

const router = express.Router();

// Ruta para crear un ajuste de inventario
router.post('/adjustment', createAdjustment);

export default router; 