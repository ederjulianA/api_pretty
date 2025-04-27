import express from 'express';
import { getInventoryDifferences } from '../models/inventoryComparisonModel.js';

const router = express.Router();

// GET /api/inventory-comparison
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            filterByCategory,
            sortBy = 'diferencia',
            sortOrder = 'desc'
        } = req.query;

        // Validar parámetros
        if (sortBy && !['diferencia', 'codigo'].includes(sortBy)) {
            return res.status(400).json({
                success: false,
                message: "El parámetro sortBy solo puede ser 'diferencia' o 'codigo'"
            });
        }

        if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
            return res.status(400).json({
                success: false,
                message: "El parámetro sortOrder solo puede ser 'asc' o 'desc'"
            });
        }

        // Convertir parámetros a sus tipos correctos
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            filterByCategory: filterByCategory || null,
            sortBy,
            sortOrder
        };

        const result = await getInventoryDifferences(options);

        res.json({
            success: true,
            data: result.data,
            summary: result.summary,
            message: `Se encontraron ${result.summary.totalItems} artículos con diferencias en el inventario`
        });
    } catch (error) {
        console.error('Error en endpoint inventory-comparison:', error);
        res.status(500).json({
            success: false,
            message: "Error al comparar inventarios",
            error: error.message
        });
    }
});

export default router; 