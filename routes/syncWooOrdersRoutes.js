import express from 'express';
import { syncWooOrders } from '../controllers/syncWooOrdersController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/sync-orders', verifyToken, syncWooOrders);

export default router; 