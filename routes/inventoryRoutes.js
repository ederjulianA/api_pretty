import express from 'express';
import { 
  createAdjustment, 
  updateAdjustment, 
  getAdjustmentById 
} from '../controllers/inventoryController.js';

const router = express.Router();

// Ruta para crear un ajuste de inventario
router.post('/adjustment', createAdjustment);
router.get('/adjustment/:fac_nro', getAdjustmentById);
router.put('/adjustment/:fac_nro', updateAdjustment);

export default router; 