import express from 'express';
import { updateDocumentInventory } from '../controllers/documentoInventarioController.js';

const router = express.Router();

// Ruta para actualizar el inventario de WooCommerce basado en un documento
router.post('/documento-inventario', updateDocumentInventory);

export default router; 