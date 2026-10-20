import express from 'express';
import { getInventoryDifferences } from '../controllers/inventoryDifferenceController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/differences', verifyToken, getInventoryDifferences);

export default router; 