// routes/aiRoutes.js
// Rutas para optimización de contenido con IA

const express = require('express');
const verifyToken = require('../middlewares/auth');
const aiController = require('../controllers/aiController');

const router = express.Router();

// Generar contenido optimizado para un producto
router.post('/articulos/:art_sec/optimize', verifyToken, aiController.generateOptimization);

// Obtener contenido IA de un producto
router.get('/articulos/:art_sec/ai-content', verifyToken, aiController.getProductContent);

// Aprobar contenido
router.put('/ai/content/:ai_sec/approve', verifyToken, aiController.approveContent);

// Rechazar contenido
router.put('/ai/content/:ai_sec/reject', verifyToken, aiController.rejectContent);

// Obtener contenido pendiente de aprobación
router.get('/ai/pending-approvals', verifyToken, aiController.getPendingApprovals);

// Obtener estadísticas de uso
router.get('/ai/usage-stats', verifyToken, aiController.getUsageStats);

// Optimización masiva
router.post('/ai/batch-optimize', verifyToken, aiController.batchOptimize);

module.exports = router;
