import express from 'express';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Ruta para subir una sola imagen
router.post('/upload-single', (req, res) => {
    upload.single('image')(req, res, function(err) {
        if (err) {
            console.error('Error en upload single:', err);
            return res.status(400).json({
                success: false,
                error: 'Error al subir la imagen. Asegúrate de usar el campo "image"'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se ha proporcionado ninguna imagen'
            });
        }

        const imageUrl = {
            filename: req.file.filename,
            path: `/uploads/${req.file.filename}`,
            fullUrl: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
        };

        res.json({
            success: true,
            message: 'Imagen subida exitosamente',
            image: imageUrl
        });
    });
});

// Ruta para subir múltiples imágenes
router.post('/upload-multiple', (req, res) => {
    upload.array('images', 5)(req, res, function(err) {
        if (err) {
            console.error('Error en upload multiple:', err);
            return res.status(400).json({
                success: false,
                error: 'Error al subir las imágenes. Asegúrate de usar el campo "images"'
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se han proporcionado imágenes'
            });
        }

        const imageUrls = req.files.map(file => ({
            filename: file.filename,
            path: `/uploads/${file.filename}`,
            fullUrl: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
        }));

        res.json({
            success: true,
            message: 'Imágenes subidas exitosamente',
            images: imageUrls
        });
    });
});

export default router;