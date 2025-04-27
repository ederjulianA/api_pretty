import express from 'express';
import { updateArticleImagesFromWoo } from '../jobs/updateArticleImagesFromWoo.js';

const router = express.Router();

// Endpoint para actualizar imágenes de artículos
router.post('/update-article-images', async (req, res) => {
    try {
        const { batchSize } = req.body;
        const result = await updateArticleImagesFromWoo(batchSize || 10);

        res.status(200).json(result);
    } catch (error) {
        console.error('Error en update-article-images:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router; 