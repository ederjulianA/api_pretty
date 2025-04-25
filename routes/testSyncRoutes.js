import express from 'express';
import { updateWooOrderStatusAndStock } from '../jobs/updateWooOrderStatusAndStock.js';
import { poolPromise, sql } from '../db.js';

const router = express.Router();

// Endpoint para probar la sincronización de inventario
router.post('/test-sync', async (req, res) => {
    try {
        // Validar que fac_nro esté presente
        if (!req.body.fac_nro) {
            return res.status(400).json({
                success: false,
                message: "El número de documento (fac_nro) es obligatorio"
            });
        }

        const testData = {
            fac_nro_woo: req.body.fac_nro_woo || null,
            orderDetails: req.body.orderDetails || [
                {
                    art_sec: "ART001",
                    cantidad: 10
                },
                {
                    art_sec: "ART002",
                    cantidad: 5
                }
            ],
            fac_fec: req.body.fac_fec || new Date(),
            fac_nro: req.body.fac_nro // Ahora es obligatorio
        };

        const result = await updateWooOrderStatusAndStock(
            testData.fac_nro_woo,
            testData.orderDetails,
            testData.fac_fec,
            testData.fac_nro
        );

        res.json({
            success: true,
            message: "Prueba de sincronización completada",
            data: result
        });
    } catch (error) {
        console.error("Error en la prueba de sincronización:", error);
        res.status(500).json({
            success: false,
            message: "Error en la prueba de sincronización",
            error: error.message
        });
    }
});

// Endpoint para consultar logs de sincronización
router.get('/sync-logs', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            fac_nro_woo,
            fac_nro,
            status,
            startDate,
            endDate
        } = req.query;

        const offset = (page - 1) * limit;
        let whereClause = [];
        let params = [];

        if (fac_nro_woo) {
            whereClause.push('fac_nro_woo = @fac_nro_woo');
            params.push({ name: 'fac_nro_woo', value: fac_nro_woo, type: sql.VarChar(50) });
        }

        if (fac_nro) {
            whereClause.push('fac_nro = @fac_nro');
            params.push({ name: 'fac_nro', value: fac_nro, type: sql.VarChar(50) });
        }

        if (status) {
            whereClause.push('status = @status');
            params.push({ name: 'status', value: status, type: sql.VarChar(20) });
        }

        if (startDate) {
            whereClause.push('created_at >= @startDate');
            params.push({ name: 'startDate', value: new Date(startDate), type: sql.DateTime });
        }

        if (endDate) {
            whereClause.push('created_at <= @endDate');
            params.push({ name: 'endDate', value: new Date(endDate), type: sql.DateTime });
        }

        const whereClauseStr = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

        const pool = await poolPromise;
        const request = pool.request();

        // Agregar parámetros
        params.forEach(param => {
            request.input(param.name, param.type, param.value);
        });

        // Obtener total de registros
        const countResult = await request
            .query(`SELECT COUNT(*) as total FROM dbo.woo_sync_logs ${whereClauseStr}`);

        // Obtener logs
        const logsResult = await request
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, parseInt(limit))
            .query(`
                SELECT 
                    id,
                    fac_nro_woo,
                    fac_nro,
                    total_items,
                    success_count,
                    error_count,
                    skipped_count,
                    duration,
                    batches_processed,
                    messages,
                    status,
                    error_details,
                    created_at
                FROM dbo.woo_sync_logs
                ${whereClauseStr}
                ORDER BY created_at DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            `);

        res.json({
            success: true,
            data: {
                logs: logsResult.recordset,
                pagination: {
                    total: countResult.recordset[0].total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(countResult.recordset[0].total / limit)
                }
            }
        });
    } catch (error) {
        console.error("Error consultando logs:", error);
        res.status(500).json({
            success: false,
            message: "Error consultando logs",
            error: error.message
        });
    }
});

// Endpoint para obtener un log específico
router.get('/sync-logs/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    id,
                    fac_nro_woo,
                    fac_nro,
                    total_items,
                    success_count,
                    error_count,
                    skipped_count,
                    duration,
                    batches_processed,
                    messages,
                    status,
                    error_details,
                    created_at
                FROM dbo.woo_sync_logs
                WHERE id = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Log no encontrado"
            });
        }

        res.json({
            success: true,
            data: result.recordset[0]
        });
    } catch (error) {
        console.error("Error consultando log:", error);
        res.status(500).json({
            success: false,
            message: "Error consultando log",
            error: error.message
        });
    }
});

export default router; 