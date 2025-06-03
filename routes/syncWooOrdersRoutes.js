import express from 'express';
import { syncWooOrders } from '../controllers/syncWooOrdersController.js';

const router = express.Router();

router.post('/sync-orders', syncWooOrders);

export default router; 