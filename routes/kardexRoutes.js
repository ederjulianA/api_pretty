import express from 'express';
import { getArticleKardex } from '../models/kardexModel.js';

const router = express.Router();

// GET /api/kardex/:art_cod
router.get('/:art_cod', async (req, res) => {
    try {
        const { art_cod } = req.params;
        const { startDate, endDate } = req.query;

        // Validar que art_cod esté presente
        if (!art_cod) {
            return res.status(400).json({
                success: false,
                message: "El código del artículo (art_cod) es requerido"
            });
        }

        // Validar fechas si están presentes
        if ((startDate && !endDate) || (!startDate && endDate)) {
            return res.status(400).json({
                success: false,
                message: "Si se proporciona una fecha, ambas fechas (startDate y endDate) son requeridas"
            });
        }

        const result = await getArticleKardex(art_cod, startDate, endDate);

        // Si no se encontró el artículo
        if (!result.success) {
            return res.status(404).json({
                success: false,
                message: result.message || "Artículo no encontrado"
            });
        }

        // Si no hay movimientos pero el artículo existe
        if (!result.movements || result.movements.length === 0) {
            return res.json({
                success: true,
                data: {
                    article: result.article,
                    movements: [],
                    summary: {
                        totalEntries: 0,
                        finalBalance: result.article?.stock_actual || 0
                    }
                },
                message: "Artículo encontrado pero no tiene movimientos en el período especificado"
            });
        }

        res.json({
            success: true,
            data: result,
            message: "Kardex consultado exitosamente"
        });
    } catch (error) {
        console.error('Error en endpoint kardex:', error);
        res.status(500).json({
            success: false,
            message: "Error consultando el kardex",
            error: error.message
        });
    }
});

export default router; 