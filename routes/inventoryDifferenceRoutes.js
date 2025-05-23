import express from 'express';
import { getInventoryDifferences } from '../controllers/inventoryDifferenceController.js';

const router = express.Router();

router.get('/differences', getInventoryDifferences);

export default router; 