import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';
import {
  createAdjustment,
  updateAdjustment,
  getAdjustmentById
} from '../controllers/inventoryController.js';

const router = express.Router();

// Ruta para crear un ajuste de inventario
router.post('/adjustment', verifyToken, createAdjustment);
router.get('/adjustment/:fac_nro', verifyToken, getAdjustmentById);
router.put('/adjustment/:fac_nro', verifyToken, updateAdjustment);

export default router; 