import express from 'express';
import {
    syncWooProducts,
    auditCategories,
    fixProductCategory,
    fixAllCategories
} from '../controllers/wooSyncController.js';

const router = express.Router();

/**
 * @route POST /api/woo/sync
 * @desc Synchronize products from WooCommerce to ArticulosHook table
 * @query stock_status - 'instock' | 'outofstock' | 'onbackorder' (opcional)
 * @query status - 'publish' | 'draft' | 'pending' (default: 'publish')
 * @query limit - Número máximo de productos a procesar (opcional, default: todos)
 * @query min_stock - Stock mínimo para procesar productos (opcional)
 * @query process_images - 'true' | 'false' - Procesar imágenes (default: 'false' para optimizar)
 * @access Private
 */
router.post('/sync', syncWooProducts);

/**
 * @route GET /api/woo/audit-categories
 * @desc Auditoría de categorías - Lista productos con discrepancias entre sistema local y WooCommerce
 * @query onlyMismatches=true - Muestra solo productos con discrepancias
 * @access Private
 */
router.get('/audit-categories', auditCategories);

/**
 * @route POST /api/woo/fix-category
 * @desc Corrige la categoría de un producto específico
 * @body art_cod (string) - SKU del producto
 * @body action (string) - "sync-from-woo" (recomendado) o "sync-to-woo"
 * @access Private
 */
router.post('/fix-category', fixProductCategory);

/**
 * @route POST /api/woo/fix-all-categories
 * @desc Sincroniza masivamente todas las categorías desde WooCommerce al sistema local
 * @query dry_run - 'true' (default, solo simular) | 'false' (aplicar cambios reales)
 * @access Private
 */
router.post('/fix-all-categories', fixAllCategories);

export default router; 