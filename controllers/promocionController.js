// controllers/promocionController.js
import promocionModel from '../models/promocionModel.js';

// Crear promoción
const crearPromocion = async (req, res) => {
  try {
    const resultado = await promocionModel.crearPromocion(req.body);
    res.status(201).json(resultado);
  } catch (error) {
    console.error('Error al crear promoción:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Actualizar promoción
const actualizarPromocion = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    const resultado = await promocionModel.actualizarPromocion(pro_sec, req.body);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('Error al actualizar promoción:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Obtener listado de promociones
const obtenerPromociones = async (req, res) => {
  try {
    const resultado = await promocionModel.obtenerPromociones(req.query);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('Error al obtener promociones:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Obtener promoción específica
const obtenerPromocionPorId = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    const resultado = await promocionModel.obtenerPromocionPorId(pro_sec);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('Error al obtener promoción:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Sincronizar precios de una promoción con WooCommerce
const sincronizarPreciosPromocion = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    const opciones = req.body.opciones || {};
    
    console.log(`[PROMOCION] Iniciando sincronización de precios para promoción ${pro_sec}`);
    console.log(`[PROMOCION] Opciones:`, opciones);
    
    const resultado = await promocionModel.sincronizarPreciosPromocion(pro_sec, opciones);
    
    console.log(`[PROMOCION] Resultado de sincronización:`, {
      success: resultado.success,
      articulos_procesados: resultado.data?.articulos_procesados,
      articulos_exitosos: resultado.data?.articulos_exitosos,
      articulos_con_error: resultado.data?.articulos_con_error,
      duracion: resultado.data?.duracion
    });
    
    res.status(200).json(resultado);
  } catch (error) {
    console.error('[PROMOCION] Error al sincronizar precios:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Sincronizar precios de múltiples promociones
const sincronizarPreciosMultiplesPromociones = async (req, res) => {
  try {
    const { pro_secs } = req.body;
    const opciones = req.body.opciones || {};
    
    if (!pro_secs || !Array.isArray(pro_secs) || pro_secs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de pro_secs válido'
      });
    }
    
    console.log(`[PROMOCION] Iniciando sincronización de múltiples promociones:`, pro_secs);
    console.log(`[PROMOCION] Opciones:`, opciones);
    
    const resultado = await promocionModel.sincronizarPreciosMultiplesPromociones(pro_secs, opciones);
    
    console.log(`[PROMOCION] Resultado de sincronización múltiple:`, {
      success: resultado.success,
      total_promociones: resultado.data?.total_promociones,
      promociones_exitosas: resultado.data?.promociones_exitosas,
      promociones_con_error: resultado.data?.promociones_con_error
    });
    
    res.status(200).json(resultado);
  } catch (error) {
    console.error('[PROMOCION] Error al sincronizar múltiples promociones:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Obtener artículos para sincronización
const obtenerArticulosParaSincronizacion = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    const opciones = req.query;
    
    console.log(`[PROMOCION] Analizando artículos para sincronización de promoción ${pro_sec}`);
    
    const resultado = await promocionModel.obtenerArticulosParaSincronizacion(pro_sec, opciones);
    
    console.log(`[PROMOCION] Análisis completado:`, {
      total: resultado.data?.estadisticas?.total,
      listos: resultado.data?.estadisticas?.listos,
      sin_woo_id: resultado.data?.estadisticas?.sin_woo_id,
      inactivos: resultado.data?.estadisticas?.inactivos
    });
    
    res.status(200).json(resultado);
  } catch (error) {
    console.error('[PROMOCION] Error al obtener artículos para sincronización:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Test de sincronización directa con códigos de artículos
const testSincronizacionDirecta = async (req, res) => {
  try {
    const { art_cods } = req.body;
    
    if (!art_cods || !Array.isArray(art_cods) || art_cods.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de art_cods válido'
      });
    }
    
    console.log(`[TEST] Iniciando test de sincronización directa con artículos:`, art_cods);
    
    // Importar la función directamente
    const { updateWooProductPrices } = await import('../jobs/updateWooProductPrices.js');
    
    const resultado = await updateWooProductPrices(art_cods);
    
    console.log(`[TEST] Resultado de test de sincronización:`, {
      totalItems: resultado.summary?.totalItems,
      successCount: resultado.summary?.successCount,
      errorCount: resultado.summary?.errorCount,
      skippedCount: resultado.summary?.skippedCount,
      duration: resultado.summary?.duration
    });
    
    res.status(200).json({
      success: true,
      message: 'Test de sincronización completado',
      data: resultado
    });
  } catch (error) {
    console.error('[TEST] Error en test de sincronización:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

export {
  crearPromocion,
  actualizarPromocion,
  obtenerPromociones,
  obtenerPromocionPorId,
  sincronizarPreciosPromocion,
  sincronizarPreciosMultiplesPromociones,
  obtenerArticulosParaSincronizacion,
  testSincronizacionDirecta
}; 