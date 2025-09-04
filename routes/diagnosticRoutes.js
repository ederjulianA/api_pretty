import express from 'express';
import { 
  getWooProductBySku, 
  compareProductsForSpecialDeals, 
  diagnoseMultipleProducts 
} from '../utils/wooDiagnosticUtils.js';

const router = express.Router();

/**
 * GET /api/diagnostic/product/:sku
 * Obtiene datos completos de un producto desde WooCommerce
 */
router.get('/product/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    
    if (!sku) {
      return res.status(400).json({
        success: false,
        message: 'SKU es requerido'
      });
    }
    
    console.log(`[DIAGNOSTIC API] Obteniendo datos de producto con SKU: ${sku}`);
    
    const productData = await getWooProductBySku(sku);
    
    res.json({
      success: true,
      message: 'Datos del producto obtenidos correctamente',
      data: productData
    });
    
  } catch (error) {
    console.error(`[DIAGNOSTIC API] Error obteniendo producto:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo datos del producto',
      error: error.message
    });
  }
});

/**
 * POST /api/diagnostic/compare
 * Compara dos productos para identificar diferencias
 * Body: { sku1: "string", sku2: "string" }
 */
router.post('/compare', async (req, res) => {
  try {
    const { sku1, sku2 } = req.body;
    
    if (!sku1 || !sku2) {
      return res.status(400).json({
        success: false,
        message: 'Ambos SKUs (sku1 y sku2) son requeridos'
      });
    }
    
    console.log(`[DIAGNOSTIC API] Comparando productos: ${sku1} vs ${sku2}`);
    
    // Obtener datos de ambos productos
    const [product1, product2] = await Promise.all([
      getWooProductBySku(sku1),
      getWooProductBySku(sku2)
    ]);
    
    // Comparar productos
    const comparison = compareProductsForSpecialDeals(product1, product2);
    
    res.json({
      success: true,
      message: 'Comparación completada',
      data: comparison
    });
    
  } catch (error) {
    console.error(`[DIAGNOSTIC API] Error comparando productos:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Error comparando productos',
      error: error.message
    });
  }
});

/**
 * POST /api/diagnostic/multiple
 * Diagnostica múltiples productos
 * Body: { skus: ["sku1", "sku2", "sku3"] }
 */
router.post('/multiple', async (req, res) => {
  try {
    const { skus } = req.body;
    
    if (!Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array de SKUs es requerido'
      });
    }
    
    console.log(`[DIAGNOSTIC API] Diagnosticando ${skus.length} productos`);
    
    const report = await diagnoseMultipleProducts(skus);
    
    res.json({
      success: true,
      message: 'Diagnóstico múltiple completado',
      data: report
    });
    
  } catch (error) {
    console.error(`[DIAGNOSTIC API] Error en diagnóstico múltiple:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Error en diagnóstico múltiple',
      error: error.message
    });
  }
});

/**
 * POST /api/diagnostic/promotion
 * Diagnostica todos los productos de una promoción específica
 * Body: { pro_sec: number }
 */
router.post('/promotion', async (req, res) => {
  try {
    const { pro_sec } = req.body;
    
    if (!pro_sec) {
      return res.status(400).json({
        success: false,
        message: 'pro_sec es requerido'
      });
    }
    
    console.log(`[DIAGNOSTIC API] Diagnosticando promoción: ${pro_sec}`);
    
    // Importar pool para consultar la base de datos
    const { poolPromise, sql } = await import('../db.js');
    const pool = await poolPromise;
    
    // Obtener artículos de la promoción
    const result = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), pro_sec)
      .query(`
        SELECT DISTINCT
          a.art_cod,
          a.art_nom,
          a.art_woo_id,
          pd.pro_det_estado
        FROM dbo.promociones_detalle pd
        INNER JOIN dbo.articulos a ON pd.art_sec = a.art_sec
        WHERE pd.pro_sec = @pro_sec
          AND a.art_woo_id IS NOT NULL
          AND a.art_woo_id > 0
        ORDER BY a.art_cod
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron artículos con WooCommerce ID en esta promoción'
      });
    }
    
    const skus = result.recordset.map(art => art.art_cod);
    const report = await diagnoseMultipleProducts(skus);
    
    // Agregar información de la promoción al reporte
    report.promotion_info = {
      pro_sec,
      total_articles_in_promotion: result.recordset.length,
      articles_with_woo_id: skus.length,
      articles_without_woo_id: result.recordset.length - skus.length
    };
    
    res.json({
      success: true,
      message: 'Diagnóstico de promoción completado',
      data: report
    });
    
  } catch (error) {
    console.error(`[DIAGNOSTIC API] Error diagnosticando promoción:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Error diagnosticando promoción',
      error: error.message
    });
  }
});

export default router;
