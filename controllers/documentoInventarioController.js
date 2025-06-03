import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

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
const getArticleStock = async (art_sec) => {
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
const getArticleWooId = async (art_sec) => {
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
      .query(`
        INSERT INTO dbo.woo_sync_logs (
          fac_nro, total_items, success_count, error_count, 
          skipped_count, duration, batches_processed, messages, status, 
          error_details, product_updates, debug_logs
        ) VALUES (
          @fac_nro, @total_items, @success_count, @error_count,
          @skipped_count, @duration, @batches_processed, @messages, @status, 
          @error_details, @product_updates, @debug_logs
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

export const updateDocumentInventory = async (req, res) => {
  const { fac_nro } = req.body;
  let messages = [];
  let debugLogs = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const startTime = new Date();
  const BATCH_SIZE = 10;

  if (!fac_nro) {
    return res.status(400).json({
      success: false,
      message: 'El número de documento (fac_nro) es obligatorio'
    });
  }

  try {
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

    // Obtener los artículos del documento con sus IDs de WooCommerce y existencias
    const pool = await poolPromise;
    const result = await pool.request()
      .input("fac_nro", sql.VarChar(50), fac_nro)
      .query(`
        SELECT a.art_woo_id, e.existencia, a.art_cod
        FROM facturakardes fk
        LEFT JOIN articulos a ON a.art_sec = fk.art_sec
        LEFT JOIN vwExistencias e ON e.art_sec = a.art_sec
        WHERE fk.fac_sec = (SELECT fac_sec FROM factura WHERE fac_nro = @fac_nro)
      `);

    const documentItems = result.recordset;

    if (!documentItems || documentItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontraron artículos para el documento ${fac_nro}`
      });
    }

    debugLogs.push(log(logLevels.INFO, `Iniciando actualización de inventario para documento ${fac_nro}`, {
      totalItems: documentItems.length
    }));

    // Preparar datos para actualización por lotes
    const productUpdates = [];
    for (const item of documentItems) {
      try {
        if (!item.art_woo_id) {
          log(logLevels.WARN, `No se encontró art_woo_id para el artículo ${item.art_cod}`);
          messages.push(`No se encontró art_woo_id para el artículo ${item.art_cod} `);
          skippedCount++;
          continue;
        }

        const newStock = item.existencia || 0;
        productUpdates.push({
          id: item.art_woo_id,
          stock_quantity: newStock
        });
      } catch (error) {
        log(logLevels.ERROR, `Error preparando actualización para artículo`, {
          error: error.message
        });
        errorCount++;
      }
    }

    // Procesar actualizaciones en lotes
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
        }, 2, 1000);

        const successfulUpdates = response.data.update.filter(item => !item.error);
        const failedUpdates = response.data.update.filter(item => item.error);

        successCount += successfulUpdates.length;
        errorCount += failedUpdates.length;

        // Guardar log del lote
        await saveBatchLog(null, batchIndex, batchData, {
          successfulUpdates,
          failedUpdates
        });

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

    // Guardar el log en la base de datos
    const logData = {
      fac_nro,
      totalItems: documentItems.length,
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

    const logId = await saveSyncLog(logData);
    debugLogs.push(log(logLevels.INFO, `Log guardado con ID: ${logId}`));

    return res.json({
      success: true,
      data: {
        messages,
        summary: {
          totalItems: documentItems.length,
          successCount,
          errorCount,
          skippedCount,
          duration: `${duration} segundos`,
          batchesProcessed: batches.length,
          logId,
          fac_nro
        },
        debugLogs
      }
    });

  } catch (error) {
    debugLogs.push(log(logLevels.ERROR, "Error general en updateDocumentInventory", {
      error: error.message,
      stack: error.stack,
      details: error,
      fac_nro
    }));

    const errorLogData = {
      fac_nro,
      totalItems: 0,
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

    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el inventario',
      error: error.message,
      debugLogs
    });
  }
}; 