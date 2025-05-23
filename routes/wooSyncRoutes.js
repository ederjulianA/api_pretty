import express from 'express';
import { syncWooProducts } from '../controllers/wooSyncController.js';

const router = express.Router();

/**
 * @route POST /api/woo/sync
 * @desc Synchronize products from WooCommerce to ArticulosHook table
 * @access Private
 */
router.post('/sync', syncWooProducts);

export default router; 