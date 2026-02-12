// controllers/aiController.js
// Controlador para endpoints de optimización con IA

const aiService = require('../services/ai/aiService');
const aiOptimizationModel = require('../models/aiOptimizationModel');
const articulosModel = require('../models/articulosModel');
const bundleModel = require('../models/bundleModel');

/**
 * Genera contenido optimizado con IA para un producto
 * POST /api/articulos/:art_sec/optimize
 */
const generateOptimization = async (req, res) => {
  try {
    const { art_sec } = req.params;
    const { modelo, categoria, idioma } = req.body;

    if (!art_sec) {
      return res.status(400).json({
        success: false,
        error: 'art_sec es requerido'
      });
    }

    // Obtener datos del producto
    const producto = await articulosModel.getArticulo(art_sec);
    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    // Obtener categoría del producto (prioridad: body > producto en BD)
    // Si se proporciona en body, se usa esa; si no, se usa la del producto
    const categoriaNombre = categoria || producto.inv_gru_nom || null;

    // Verificar si es bundle y obtener componentes
    let componentesBundle = null;
    const esBundle = producto.art_bundle === 'S';
    
    if (esBundle) {
      try {
        const bundleData = await bundleModel.getBundleComponents(art_sec);
        if (bundleData?.componentes?.length > 0) {
          componentesBundle = bundleData.componentes.map(c => ({
            nombre: c.art_nom,
            cantidad: c.cantidad,
            codigo: c.art_cod,
            imagen_url: c.art_url_img_servi || null
          }));
        }
      } catch (error) {
        console.warn('[AI Controller] Error obteniendo componentes del bundle:', error.message);
        // Continuar sin componentes si hay error
      }
    }

    // Preparar datos del producto para la IA
    // Nota: La tabla articulos solo tiene art_nom (nombre), NO tiene campo art_des (descripción)
    const productoData = {
      art_sec: producto.art_sec,
      art_nom: producto.art_nom,
      precio_detal: producto.precio_detal || 0,
      precio_mayor: producto.precio_mayor || 0,
      es_bundle: esBundle,
      componentes: componentesBundle
    };

    // Generar contenido optimizado
    const contenido = await aiService.optimizeProduct(productoData, {
      modelo: modelo || 'gpt-4-turbo-preview',
      categoria: categoriaNombre, // Usar categoría del producto o la proporcionada en body
      idioma: idioma || 'es'
    });

    // Obtener la versión guardada
    const versiones = await aiOptimizationModel.getContentVersions(art_sec);
    const ultimaVersion = versiones[0];

    return res.json({
      success: true,
      message: 'Contenido generado exitosamente',
      data: {
        contenido,
        version: ultimaVersion
      }
    });
  } catch (error) {
    console.error('[AI Controller] Error generando optimización:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error generando contenido optimizado'
    });
  }
};

/**
 * Obtiene versiones de contenido IA para un producto
 * GET /api/articulos/:art_sec/ai-content
 */
const getProductContent = async (req, res) => {
  try {
    const { art_sec } = req.params;
    const { tipo } = req.query;

    if (!art_sec) {
      return res.status(400).json({
        success: false,
        error: 'art_sec es requerido'
      });
    }

    const versiones = await aiOptimizationModel.getContentVersions(art_sec, tipo || null);
    const activo = await aiOptimizationModel.getActiveContent(art_sec, tipo || null);

    return res.json({
      success: true,
      data: {
        versiones,
        activo
      }
    });
  } catch (error) {
    console.error('[AI Controller] Error obteniendo contenido:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error obteniendo contenido'
    });
  }
};

/**
 * Aprueba una versión de contenido
 * PUT /api/ai/content/:ai_sec/approve
 */
const approveContent = async (req, res) => {
  try {
    const { ai_sec } = req.params;
    const { comentarios } = req.body;
    const usuario = req.user?.usu_cod || req.body.usuario || 'SISTEMA';

    if (!ai_sec) {
      return res.status(400).json({
        success: false,
        error: 'ai_sec es requerido'
      });
    }

    const contenido = await aiOptimizationModel.approveContent(ai_sec, usuario, comentarios);

    return res.json({
      success: true,
      message: 'Contenido aprobado exitosamente',
      data: contenido
    });
  } catch (error) {
    console.error('[AI Controller] Error aprobando contenido:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error aprobando contenido'
    });
  }
};

/**
 * Rechaza una versión de contenido
 * PUT /api/ai/content/:ai_sec/reject
 */
const rejectContent = async (req, res) => {
  try {
    const { ai_sec } = req.params;
    const { comentarios } = req.body;
    const usuario = req.user?.usu_cod || req.body.usuario || 'SISTEMA';

    if (!ai_sec) {
      return res.status(400).json({
        success: false,
        error: 'ai_sec es requerido'
      });
    }

    if (!comentarios) {
      return res.status(400).json({
        success: false,
        error: 'comentarios es requerido para rechazar contenido'
      });
    }

    const contenido = await aiOptimizationModel.rejectContent(ai_sec, usuario, comentarios);

    return res.json({
      success: true,
      message: 'Contenido rechazado',
      data: contenido
    });
  } catch (error) {
    console.error('[AI Controller] Error rechazando contenido:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error rechazando contenido'
    });
  }
};

/**
 * Obtiene contenido pendiente de aprobación
 * GET /api/ai/pending-approvals
 */
const getPendingApprovals = async (req, res) => {
  try {
    const { art_sec, tipo, limit } = req.query;

    const pendientes = await aiOptimizationModel.getPendingApprovals({
      art_sec: art_sec || null,
      ai_tipo: tipo || null,
      limit: limit || null
    });

    return res.json({
      success: true,
      count: pendientes.length,
      data: pendientes
    });
  } catch (error) {
    console.error('[AI Controller] Error obteniendo pendientes:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error obteniendo contenido pendiente'
    });
  }
};

/**
 * Obtiene estadísticas de uso de IA
 * GET /api/ai/usage-stats
 */
const getUsageStats = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;

    const stats = await aiOptimizationModel.getUsageStats({
      fecha_desde: fecha_desde ? new Date(fecha_desde) : null,
      fecha_hasta: fecha_hasta ? new Date(fecha_hasta) : null
    });

    const monthlyCost = await aiOptimizationModel.getMonthlyCost();
    const budget = parseFloat(process.env.AI_BUDGET_MONTHLY_USD) || 100;

    return res.json({
      success: true,
      data: {
        stats,
        monthly_cost: monthlyCost,
        monthly_budget: budget,
        budget_usage_percent: ((monthlyCost / budget) * 100).toFixed(2)
      }
    });
  } catch (error) {
    console.error('[AI Controller] Error obteniendo estadísticas:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error obteniendo estadísticas'
    });
  }
};

/**
 * Optimización masiva por categoría
 * POST /api/ai/batch-optimize
 */
const batchOptimize = async (req, res) => {
  try {
    const { categoria, subcategoria, limit = 50, modelo } = req.body;

    if (!categoria) {
      return res.status(400).json({
        success: false,
        error: 'categoria es requerida'
      });
    }

    // Obtener productos de la categoría
    const { sql, poolPromise } = require('../db');
    const pool = await poolPromise;
    
    let query = `
      SELECT TOP ${limit} 
        a.art_sec, a.art_cod, a.art_nom,
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
      LEFT JOIN dbo.inventario_subgrupo s ON s.inv_sub_gru_cod = a.inv_sub_gru_cod
      LEFT JOIN dbo.inventario_grupo g ON g.inv_gru_cod = s.inv_gru_cod
      WHERE (a.art_tiene_contenido_ia IS NULL OR a.art_tiene_contenido_ia = 'N')
    `;

    const request = pool.request();
    
    if (subcategoria) {
      query += ' AND a.inv_sub_gru_cod = @subcategoria';
      request.input('subcategoria', sql.SmallInt, parseInt(subcategoria));
    } else {
      query += ' AND g.inv_gru_cod = @categoria';
      request.input('categoria', sql.SmallInt, parseInt(categoria));
    }

    const result = await request.query(query);
    const productos = result.recordset;

    const resultados = {
      total: productos.length,
      exitosos: 0,
      errores: 0,
      detalles: []
    };

    // Procesar cada producto
    for (const producto of productos) {
      try {
        await aiService.optimizeProduct(producto, {
          modelo: modelo || 'gpt-4-turbo-preview',
          categoria: categoria
        });
        resultados.exitosos++;
        resultados.detalles.push({
          art_sec: producto.art_sec,
          art_cod: producto.art_cod,
          status: 'success'
        });
        
        // Rate limiting: pausa de 1 segundo entre productos
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        resultados.errores++;
        resultados.detalles.push({
          art_sec: producto.art_sec,
          art_cod: producto.art_cod,
          status: 'error',
          error: error.message
        });
      }
    }

    return res.json({
      success: true,
      message: `Procesados ${resultados.total} productos`,
      data: resultados
    });
  } catch (error) {
    console.error('[AI Controller] Error en optimización masiva:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error en optimización masiva'
    });
  }
};

module.exports = {
  generateOptimization,
  getProductContent,
  approveContent,
  rejectContent,
  getPendingApprovals,
  getUsageStats,
  batchOptimize
};
