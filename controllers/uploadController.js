import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado imágenes' });
    }

    const imageUrls = req.files.map(file => {
      return {
        filename: file.filename,
        path: `/uploads/${file.filename}`,
        fullUrl: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
      };
    });

    res.json({
      message: 'Imágenes subidas exitosamente',
      images: imageUrls
    });
  } catch (error) {
    console.error('Error al subir imágenes:', error);
    res.status(500).json({ error: error.message });
  }
};