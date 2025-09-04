// jobs/updateWooProductPrices.js
import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
import { obtenerPreciosConOferta } from "../utils/precioUtils.js";
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Log de inicialización
console.log('Inicializando updateWooProductPrices.js - Versión:', new Date().toISOString());

// Configuración de logging
const logLevels = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [WOO_PRICES] ${message}`;
  const logData = {
    timestamp,
    level,
    message,
    data: data ? JSON.parse(JSON.stringify(data)) : null
  };

  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }

  return logData;
};

const logEder = async (logDesc) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('LogDesc', sql.NVarChar(sql.MAX), logDesc)
      .query(`
        INSERT INTO dbo.LogEd (LogDesc)
        VALUES (@LogDesc)
      `);
  } catch (error) {
    console.error('Error al guardar en LogEd:', error);
    throw error;
  }
}

// Función para guardar logs de lotes
const saveBatchLog = async (logId, batchIndex, batchData, results) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input("log_id", sql.Int, logId)
      .input("batch_index", sql.Int, batchIndex)
      .input("batch_data", sql.NVarChar(sql.MAX), JSON.stringify(batchData))
      .input("success_count", sql.Int, results.successfulUpdates.length)
      .input("error_count", sql.Int, results.failedUpdates.length)
      .input("success_details", sql.NVarChar(sql.MAX), JSON.stringify(results.successfulUpdates))
      .input("error_details", sql.NVarChar(sql.MAX), JSON.stringify(results.failedUpdates))
      .query(`
        INSERT INTO dbo.woo_sync_batch_logs (
          log_id, batch_index, batch_data, success_count, error_count,
          success_details, error_details
        ) VALUES (
          @log_id, @batch_index, @batch_data, @success_count, @error_count,
          @success_details, @error_details
        )
      `);
  } catch (error) {
    log(logLevels.ERROR, "Error guardando log de lote", {
      error: error.message,
      logId,
      batchIndex
    });
  }
};

// Modificar la función saveSyncLog para incluir más detalles
const saveSyncLog = async (logData) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("fac_nro_woo", sql.VarChar(50), logData.fac_nro_woo)
      .input("fac_nro", sql.VarChar(50), logData.fac_nro)
      .input("total_items", sql.Int, logData.totalItems)
      .input("success_count", sql.Int, logData.successCount)
      .input("error_count", sql.Int, logData.errorCount)
      .input("skipped_count", sql.Int, logData.skippedCount)
      .input("duration", sql.Float, logData.duration)
      .input("batches_processed", sql.Int, logData.batchesProcessed)
      .input("messages", sql.NVarChar(sql.MAX), JSON.stringify(logData.messages))
      .input("status", sql.VarChar(20), logData.status)
      .input("error_details", sql.NVarChar(sql.MAX), logData.errorDetails ? JSON.stringify(logData.errorDetails) : null)
      .input("product_updates", sql.NVarChar(sql.MAX), logData.productUpdates ? JSON.stringify(logData.productUpdates) : null)
      .input("debug_logs", sql.NVarChar(sql.MAX), JSON.stringify(logData.debugLogs))
      .input("order_details", sql.NVarChar(sql.MAX), JSON.stringify(logData.orderDetails))
      .input("config", sql.NVarChar(sql.MAX), JSON.stringify({
        actualiza_fecha: logData.actualiza_fecha,
        fac_fec: logData.fac_fec
      }))
      .query(`
        INSERT INTO dbo.woo_sync_logs (
          fac_nro_woo, fac_nro, total_items, success_count, error_count, 
          skipped_count, duration, batches_processed, messages, status, 
          error_details, product_updates, debug_logs, order_details, config
        ) VALUES (
          @fac_nro_woo, @fac_nro, @total_items, @success_count, @error_count,
          @skipped_count, @duration, @batches_processed, @messages, @status, 
          @error_details, @product_updates, @debug_logs, @order_details, @config
        );
        SELECT SCOPE_IDENTITY() as id;
      `);

    return result.recordset[0].id;
  } catch (error) {
    log(logLevels.ERROR, "Error guardando log en la base de datos", {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Configura la API de WooCommerce con timeout más corto para Vercel
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
  timeout: 8000, // Reducido a 8 segundos para Vercel
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json',
    }
  }
});

// Función auxiliar para obtener el art_woo_id 
export const getArticleWooId = async (art_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_cod", sql.VarChar(50), art_cod)
      .query("SELECT art_woo_id FROM dbo.articulos WHERE art_cod = @art_cod");

    const artWooId = result.recordset.length > 0 ? result.recordset[0].art_woo_id : '';
    return artWooId;
  } catch (error) {
    throw error;
  }
};

// Función para obtener precios y ofertas de un artículo usando precioUtils
export const getArticlePricesAndOffers = async (art_cod) => {
  try {
    // Obtener art_sec
    const pool = await poolPromise;
    const art_sec = await pool.request()
      .input("art_cod", sql.VarChar(50), art_cod)
      .query("SELECT art_sec FROM dbo.articulos WHERE art_cod = @art_cod");

    if (art_sec.recordset.length === 0) {
      return null;
    }

    const art_sec_result = art_sec.recordset[0].art_sec;
    
    // Usar precioUtils
    const preciosData = await obtenerPreciosConOferta(art_sec_result);
    
    // Convertir formato
    const articleData = {
      art_sec: preciosData.art_sec,
      art_cod: preciosData.art_cod,
      art_nom: preciosData.art_nom,
      precio_detal_original: preciosData.precio_detal_original,
      precio_mayor_original: preciosData.precio_mayor_original,
      precio_detal: preciosData.precio_detal,
      precio_mayor: preciosData.precio_mayor,
      precio_oferta: preciosData.oferta_info?.precio_oferta || null,
      descuento_porcentaje: preciosData.oferta_info?.descuento_porcentaje || null,
      pro_fecha_inicio: preciosData.oferta_info?.fecha_inicio || null,
      pro_fecha_fin: preciosData.oferta_info?.fecha_fin || null,
      codigo_promocion: preciosData.oferta_info?.codigo_promocion || null,
      descripcion_promocion: preciosData.oferta_info?.descripcion_promocion || null,
      tiene_oferta: preciosData.tiene_oferta ? 'S' : 'N'
    };

    return articleData;
  } catch (error) {
    throw error;
  }
};

const formatDateToISO8601 = (date, isEndDate = false) => {
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    // Usar UTC para evitar problemas de zona horaria
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    
    // Formatear según el tipo de fecha
    let formattedDate;
    if (isEndDate) {
      // Fecha de fin: siempre 23:59:59
      formattedDate = `${year}-${month}-${day}T23:59:59`;
    } else {
      // Fecha de inicio: siempre 00:00:00
      formattedDate = `${year}-${month}-${day}T00:00:00`;
    }
    
    return formattedDate;
  } catch (error) {
    return null;
  }
};

// Función para dividir un array en chunks
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Función para reintentar operaciones
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
};

// Función para actualizar precios de productos en WooCommerce
const updateWooProductPrices = async (art_cods = [], opciones = {}) => {
  let messages = [];
  let debugLogs = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const startTime = new Date();
  const BATCH_SIZE = 10; // Reducido para Vercel

  try {
    // Validar que art_cods sea un array y no esté vacío
    if (!Array.isArray(art_cods) || art_cods.length === 0) {
      const error = 'art_cods debe ser un array no vacío de códigos de artículos';
      debugLogs.push(log(logLevels.ERROR, error));
      throw new Error(error);
    }

    // Validar configuración de WooCommerce
    if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
      const error = 'Faltan variables de entorno de WooCommerce';
      debugLogs.push(log(logLevels.ERROR, error, {
        WC_URL: Boolean(process.env.WC_URL),
        WC_CONSUMER_KEY: Boolean(process.env.WC_CONSUMER_KEY),
        WC_CONSUMER_SECRET: Boolean(process.env.WC_CONSUMER_SECRET)
      }));
      throw new Error(error);
    }


    // Preparar datos para actualización por lotes
    const productUpdates = [];
    for (const art_cod of art_cods) {
      try {
        // Obtener art_woo_id
        const artWooId = await getArticleWooId(art_cod);

        if (!artWooId) {
          messages.push(`No se encontró art_woo_id para art_cod: ${art_cod}.`);
          skippedCount++;
          continue;
        }

        // Obtener precios y ofertas
        const articleData = await getArticlePricesAndOffers(art_cod);

        if (!articleData) {
          messages.push(`No se encontraron datos de precios para art_cod: ${art_cod}.`);
          skippedCount++;
          continue;
        }

        // Preparar datos para WooCommerce
        const wooData = {
          id: artWooId,
          regular_price: articleData.precio_detal_original.toString(),
          meta_data: [
            {
              key: "_precio_mayorista",
              value: articleData.precio_mayor_original.toString()
            }
          ]
        };

        // Verificar si el artículo está activo en la promoción (si se proporciona la información)
        let articuloActivoEnPromocion = true;
        if (opciones.estadosArticulos && opciones.estadosArticulos[art_cod]) {
          articuloActivoEnPromocion = opciones.estadosArticulos[art_cod] === 'A';
        }

        // Si tiene oferta activa Y el artículo está activo en la promoción, agregar información de oferta
        if (articleData.tiene_oferta === 'S' && articuloActivoEnPromocion) {
          // Si hay precio de oferta específico, usarlo como sale_price
          if (articleData.precio_oferta && articleData.precio_oferta > 0) {
            wooData.sale_price = articleData.precio_oferta.toString();
          } else if (articleData.descuento_porcentaje && articleData.descuento_porcentaje > 0) {
            // Si hay descuento porcentual, calcular el precio de oferta
            const salePrice = articleData.precio_detal * (1 - (articleData.descuento_porcentaje / 100));
            wooData.sale_price = salePrice.toString();
          }

          // Agregar fechas de oferta - priorizar fechas de promoción pasadas como parámetro
          let fechaInicio = null;
          let fechaFin = null;
          
          if (opciones.fechasPromocion && opciones.fechasPromocion.fecha_inicio && opciones.fechasPromocion.fecha_fin) {
            // Usar fechas de promoción pasadas como parámetro (para promociones nuevas o futuras)
            fechaInicio = opciones.fechasPromocion.fecha_inicio;
            fechaFin = opciones.fechasPromocion.fecha_fin;
          } else if (articleData.pro_fecha_inicio && articleData.pro_fecha_fin) {
            // Usar fechas de promoción desde articleData (para promociones activas)
            fechaInicio = articleData.pro_fecha_inicio;
            fechaFin = articleData.pro_fecha_fin;
          }
          
          if (fechaInicio && fechaFin) {
            wooData.date_on_sale_from = formatDateToISO8601(fechaInicio, false); // Fecha de inicio
            wooData.date_on_sale_to = formatDateToISO8601(fechaFin, true); // Fecha de fin (23:59:59)
          }

          // NO agregar meta_data de promoción que interfieren con special deals
          // Solo mantener el precio mayorista que es necesario para el negocio
          // Los meta_data _codigo_promocion, _descripcion_promocion y _descuento_porcentaje
          // están causando que los productos no aparezcan en las secciones de special deals
        } else {
          // Si no tiene oferta O el artículo está inactivo en la promoción, quitar la oferta
          wooData.sale_price = '';
          // IMPORTANTE: Usar cadena vacía en lugar de null para eliminar fechas en WooCommerce
          wooData.date_on_sale_from = '';
          wooData.date_on_sale_to = '';
          
          // Limpiar meta_data de promoción que interfieren con special deals
          wooData.meta_data = wooData.meta_data.filter(meta => 
            !['_codigo_promocion', '_descripcion_promocion', '_descuento_porcentaje'].includes(meta.key)
          );
          
        }

        productUpdates.push(wooData);

      } catch (error) {
        errorCount++;
      }
    }

    // Procesar actualizaciones en lotes más pequeños
    const batches = chunkArray(productUpdates, BATCH_SIZE);
    
    for (const [batchIndex, batch] of batches.entries()) {
      try {
        const batchData = { update: batch };
        const response = await retryOperation(async () => {
          const result = await wcApi.post('products/batch', batchData);
          if (!result || !result.data) {
            throw new Error('Respuesta inválida de WooCommerce');
          }
          return result;
        }, 2, 1000); // Reducir reintentos y tiempo de espera

        const successfulUpdates = response.data.update.filter(item => !item.error);
        const failedUpdates = response.data.update.filter(item => item.error);

        successCount += successfulUpdates.length;
        errorCount += failedUpdates.length;

        // Agregar mensajes de éxito y error
        successfulUpdates.forEach(item => {
          messages.push(`Producto ${item.id} actualizado exitosamente`);
        });

        failedUpdates.forEach(item => {
          const errorMessage = item.error?.message || 'Error desconocido';
          messages.push(`Error actualizando producto ${item.id}: ${errorMessage}`);
        });

      } catch (batchError) {
        const errorMessage = `Error procesando lote ${batchIndex + 1}: ${batchError.message}`;
        log(logLevels.ERROR, errorMessage);
        errorCount += batch.length;
        messages.push(errorMessage);
      }
    }

    // Forzar actualización de cache de WooCommerce
    try {
      // Hacer llamadas individuales a los productos actualizados para forzar la actualización del cache
      const productIds = productUpdates.map(p => p.id).slice(0, 5); // Solo los primeros 5 para no sobrecargar
      
      for (const productId of productIds) {
        try {
          await wcApi.get(`products/${productId}`);
        } catch (productError) {
          // Silenciar errores de cache
        }
      }
    } catch (cacheError) {
      // Silenciar errores de cache
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    const logData = {
      fac_nro_woo: null,
      fac_nro: null,
      totalItems: art_cods.length,
      successCount,
      errorCount,
      skippedCount,
      duration,
      batchesProcessed: batches.length,
      messages,
      status: errorCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      errorDetails: null,
      debugLogs,
      productUpdates
    };

    // Guardar el log en la base de datos
    const logId = await saveSyncLog(logData);

    return {
      messages,
      summary: {
        totalItems: art_cods.length,
        successCount,
        errorCount,
        skippedCount,
        duration: `${duration} segundos`,
        batchesProcessed: batches.length,
        logId
      },
      debugLogs
    };
  } catch (error) {
    debugLogs.push(log(logLevels.ERROR, "Error general en updateWooProductPrices", {
      error: error.message,
      stack: error.stack,
      details: error
    }));

    // Guardar el log de error
    const errorLogData = {
      fac_nro_woo: null,
      fac_nro: null,
      totalItems: art_cods?.length || 0,
      successCount,
      errorCount: errorCount + 1,
      skippedCount,
      duration: (new Date() - startTime) / 1000,
      batchesProcessed: 0,
      messages,
      status: 'ERROR',
      errorDetails: {
        message: error.message,
        stack: error.stack,
        details: error
      },
      debugLogs
    };

    try {
      await saveSyncLog(errorLogData);
    } catch (logError) {
      // Silenciar errores de log
    }

    return {
      messages,
      summary: {
        totalItems: art_cods?.length || 0,
        successCount,
        errorCount: errorCount + 1,
        skippedCount,
        duration: `${(new Date() - startTime) / 1000} segundos`,
        batchesProcessed: 0,
        logId: null
      },
      debugLogs
    };
  }
};

export { updateWooProductPrices }; 