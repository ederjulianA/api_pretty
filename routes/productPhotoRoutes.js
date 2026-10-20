import express from 'express';
import productPhotoController from '../controllers/productPhotoController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/productos/{productId}/fotos
router.get('/:productId/fotos', verifyToken, productPhotoController.getProductPhotos);

// POST /api/productos/{productId}/fotos/temp
router.post('/:productId/fotos/temp', verifyToken, productPhotoController.uploadTempPhoto);

// DELETE /api/productos/{productId}/fotos/{fotoId}
router.delete('/:productId/fotos/:photoId', verifyToken, productPhotoController.deletePhoto);

// PUT /api/productos/{productId}/fotos/{fotoId}/principal
router.put('/:productId/fotos/:photoId/principal', verifyToken, productPhotoController.setMainPhoto);

// POST /api/productos/{productId}/fotos/sync-woo
router.post('/:productId/fotos/sync-woo', verifyToken, productPhotoController.syncWithWooCommerce);

// PUT /api/productos/{productId}/fotos/reordenar
router.put('/:productId/fotos/reordenar', verifyToken, productPhotoController.reorderPhotos);

export default router; 