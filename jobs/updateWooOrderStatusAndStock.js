// jobs/updateWooOrderStatusAndStock.js
import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Log de inicialización
console.log('Inicializando updateWooOrderStatusAndStock.js - Versión:', new Date().toISOString());

// Configuración de logging
const logLevels = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [WOO] ${message}`;
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

// Función auxiliar para obtener el saldo (stock) actual de un artículo desde la vista vwExistencias
export const getArticleStock = async (art_sec) => {
  log(logLevels.INFO, `Consultando stock para art_sec: ${art_sec}`);
  await logEder(`Consultando stock para art_sec: ${art_sec}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT existencia FROM dbo.vwExistencias WHERE art_sec = @art_sec");

    const stock = result.recordset.length > 0 ? Number(result.recordset[0].existencia) : 0;
    log(logLevels.INFO, `Stock encontrado para art_sec ${art_sec}: ${stock}`, { art_sec, stock });
    await logEder(`Stock encontrado para art_sec ${art_sec}: ${stock}`);
    return stock;
  } catch (error) {
    log(logLevels.ERROR, `Error obteniendo stock para art_sec ${art_sec}`, {
      error: error.message,
      stack: error.stack,
      art_sec
    });
    await logEder(`Error obteniendo stock para art_sec ${art_sec}: ${error.message}`);
    throw error;
  }
};

// Función auxiliar para obtener el art_woo_id 
export const getArticleWooId = async (art_sec) => {
  log(logLevels.INFO, `Buscando art_woo_id para art_sec: ${art_sec}`);
  await logEder(`Buscando art_woo_id para art_sec: ${art_sec}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT art_woo_id FROM dbo.articulos WHERE art_sec = @art_sec");

    const artWooId = result.recordset.length > 0 ? result.recordset[0].art_woo_id : '';
    log(logLevels.INFO, `art_woo_id encontrado para art_sec ${art_sec}: ${artWooId || 'No encontrado'}`, { art_sec, artWooId });
    await logEder(`art_woo_id encontrado para art_sec ${art_sec}: ${artWooId || 'No encontrado'}`);
    return artWooId;
  } catch (error) {
    log(logLevels.ERROR, `Error buscando art_woo_id para art_sec ${art_sec}`, {
      error: error.message,
      stack: error.stack,
      art_sec
    });
    await logEder(`Error buscando art_woo_id para art_sec ${art_sec}: ${error.message}`);
    throw error;
  }
};

const formatDateToISO8601 = (date) => {
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      log(logLevels.WARN, `Fecha inválida proporcionada: ${date}`);
      return null;
    }
    return dateObj.toISOString().slice(0, 19).replace('Z', '');
  } catch (error) {
    log(logLevels.ERROR, 'Error formateando fecha', { error: error.message, date });
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

// Función para actualizar el estado del pedido y el stock de cada artículo en WooCommerce
const updateWooOrderStatusAndStock = async (fac_nro_woo, orderDetails, fac_fec = null, fac_nro = null, actualiza_fecha = 'N') => {
  let messages = [];
  let debugLogs = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const startTime = new Date();
  const BATCH_SIZE = 10; // Reducido para Vercel

  try {
    // Log del valor inicial de actualiza_fecha
    debugLogs.push(log(logLevels.INFO, `Valor inicial de actualiza_fecha: ${actualiza_fecha}`));

    // Validar que orderDetails sea un array y no esté vacío
    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
      const error = 'orderDetails debe ser un array no vacío de artículos';
      debugLogs.push(log(logLevels.ERROR, error));
      throw new Error(error);
    }

    // Validar que fac_nro esté presente
    if (!fac_nro) {
      const error = 'El número de documento (fac_nro) es obligatorio';
      debugLogs.push(log(logLevels.ERROR, error));
      throw new Error(error);
    }

    // Validar actualiza_fecha
    if (actualiza_fecha !== 'S' && actualiza_fecha !== 'N') {
      const error = 'actualiza_fecha debe ser "S" o "N"';
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

    debugLogs.push(log(logLevels.INFO, `Iniciando actualización en WooCommerce`, {
      orden: fac_nro_woo || 'N/A',
      documento: fac_nro,
      totalItems: orderDetails.length,
      fecha: fac_fec
    }));

    const formattedDate = fac_fec ? formatDateToISO8601(fac_fec) : null;
    debugLogs.push(log(logLevels.INFO, `Fecha formateada: ${formattedDate || 'No proporcionada'}`));

    // Actualizar estado del pedido si existe
    if (fac_nro_woo) {
      try {
        const orderUpdateData = { status: "completed" };
        await wcApi.put(`orders/${fac_nro_woo}`, orderUpdateData);
        messages.push(`Pedido ${fac_nro_woo} actualizado a 'completed' en WooCommerce.`);
      } catch (orderError) {
        log(logLevels.ERROR, `Error actualizando pedido ${fac_nro_woo}`, {
          error: orderError.message
        });
        messages.push(`Error actualizando pedido ${fac_nro_woo}: ${orderError.message}`);
        errorCount++;
      }
    }

    // Preparar datos para actualización por lotes
    const productUpdates = [];
    for (const item of orderDetails) {
      try {
        const art_sec = item.art_sec;
        const artWooId = await getArticleWooId(art_sec);

        if (!artWooId) {
          log(logLevels.WARN, `No se encontró art_woo_id para art_sec: ${art_sec}`);
          messages.push(`No se encontró art_woo_id para art_sec: ${art_sec}.`);
          skippedCount++;
          continue;
        }

        const newStock = await getArticleStock(art_sec);
        productUpdates.push({
          id: artWooId,
          date_created: formattedDate,
          stock_quantity: newStock
        });
      } catch (error) {
        log(logLevels.ERROR, `Error preparando actualización para art_sec ${item.art_sec}`, {
          error: error.message
        });
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
          messages.push(`Producto ${item.id} actualizado con nuevo stock: ${item.stock_quantity}`);
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

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    const logData = {
      fac_nro_woo,
      fac_nro,
      totalItems: orderDetails.length,
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
    debugLogs.push(log(logLevels.INFO, `Log guardado con ID: ${logId}`));

    return {
      messages,
      summary: {
        totalItems: orderDetails.length,
        successCount,
        errorCount,
        skippedCount,
        duration: `${duration} segundos`,
        batchesProcessed: batches.length,
        logId,
        fac_nro
      },
      debugLogs
    };
  } catch (error) {
    debugLogs.push(log(logLevels.ERROR, "Error general en updateWooOrderStatusAndStock", {
      error: error.message,
      stack: error.stack,
      details: error,
      fac_nro
    }));

    // Guardar el log de error
    const errorLogData = {
      fac_nro_woo,
      fac_nro,
      totalItems: orderDetails?.length || 0,
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
      const logId = await saveSyncLog(errorLogData);
      debugLogs.push(log(logLevels.INFO, `Log de error guardado con ID: ${logId}`));
    } catch (logError) {
      debugLogs.push(log(logLevels.ERROR, "Error guardando log de error", {
        error: logError.message,
        originalError: error.message,
        fac_nro
      }));
    }

    return {
      messages,
      summary: {
        totalItems: orderDetails?.length || 0,
        successCount,
        errorCount: errorCount + 1,
        skippedCount,
        duration: `${(new Date() - startTime) / 1000} segundos`,
        batchesProcessed: 0,
        logId: null,
        fac_nro
      },
      debugLogs
    };
  }
};

export { updateWooOrderStatusAndStock };