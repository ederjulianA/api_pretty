const express = require('express');
const router = express.Router();
const { updateWooOrderStatusAndStock } = require('../jobs/updateWooOrderStatusAndStock');
const { verifyToken } = require('../middlewares/authMiddleware');
const { logEder } = require('../jobs/updateWooOrderStatusAndStock');

// Endpoint de prueba para logs
router.get('/test-logs', verifyToken, async (req, res) => {
  try {
    await logEder('Test de logs - ' + new Date().toISOString());
    res.json({
      success: true,
      message: 'Log de prueba guardado correctamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al guardar log de prueba',
      error: error.message
    });
  }
});

// Endpoint para actualizar estado de pedido y stock en WooCommerce
router.post('/update-order-stock', verifyToken, async (req, res) => {
  try {
    const { fac_nro_woo, orderDetails, fac_fec, fac_nro, actualiza_fecha } = req.body;

    // Validar campos requeridos
    if (!fac_nro || !orderDetails || !Array.isArray(orderDetails)) {
      return res.status(400).json({
        success: false,
        message: 'fac_nro y orderDetails son requeridos. orderDetails debe ser un array.'
      });
    }

    const result = await updateWooOrderStatusAndStock(
      fac_nro_woo,
      orderDetails,
      fac_fec,
      fac_nro,
      actualiza_fecha
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar pedido y stock',
      error: error.message
    });
  }
});

module.exports = router; 