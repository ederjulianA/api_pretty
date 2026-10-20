import express from 'express';
import { updateDocumentInventory } from '../controllers/documentoInventarioController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Ruta para actualizar el inventario de WooCommerce basado en un documento
router.post('/documento-inventario', verifyToken, updateDocumentInventory);

export default router; 