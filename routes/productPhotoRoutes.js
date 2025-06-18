import express from 'express';
import productPhotoController from '../controllers/productPhotoController.js';

const router = express.Router();

// GET /api/productos/{productId}/fotos
router.get('/:productId/fotos', productPhotoController.getProductPhotos);

// POST /api/productos/{productId}/fotos/temp
router.post('/:productId/fotos/temp', productPhotoController.uploadTempPhoto);

// DELETE /api/productos/{productId}/fotos/{fotoId}
router.delete('/:productId/fotos/:photoId', productPhotoController.deletePhoto);

// PUT /api/productos/{productId}/fotos/{fotoId}/principal
router.put('/:productId/fotos/:photoId/principal', productPhotoController.setMainPhoto);

// POST /api/productos/{productId}/fotos/sync-woo
router.post('/:productId/fotos/sync-woo', productPhotoController.syncWithWooCommerce);

// PUT /api/productos/{productId}/fotos/reordenar
router.put('/:productId/fotos/reordenar', productPhotoController.reorderPhotos);

export default router; 