// jobs/updateWooOrderStatusAndStock.js
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

  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
};

// Función para guardar el log en la base de datos
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
      .query(`
        INSERT INTO dbo.woo_sync_logs (
          fac_nro_woo, fac_nro, total_items, success_count, error_count, 
          skipped_count, duration, batches_processed, messages, status, error_details
        ) VALUES (
          @fac_nro_woo, @fac_nro, @total_items, @success_count, @error_count,
          @skipped_count, @duration, @batches_processed, @messages, @status, @error_details
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

// Configura la API de WooCommerce
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
  timeout: 30000, // Aumentado a 30 segundos para lotes grandes
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json',
    }
  }
});

// Función auxiliar para obtener el saldo (stock) actual de un artículo desde la vista vwExistencias
const getArticleStock = async (art_sec) => {
  log(logLevels.INFO, `Consultando stock para art_sec: ${art_sec}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT existencia FROM dbo.vwExistencias WHERE art_sec = @art_sec");

    const stock = result.recordset.length > 0 ? Number(result.recordset[0].existencia) : 0;
    log(logLevels.INFO, `Stock encontrado para art_sec ${art_sec}: ${stock}`, { art_sec, stock });
    return stock;
  } catch (error) {
    log(logLevels.ERROR, `Error obteniendo stock para art_sec ${art_sec}`, {
      error: error.message,
      stack: error.stack,
      art_sec
    });
    throw error;
  }
};

// Función auxiliar para obtener el art_woo_id 
const getArticleWooId = async (art_sec) => {
  log(logLevels.INFO, `Buscando art_woo_id para art_sec: ${art_sec}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT art_woo_id FROM dbo.articulos WHERE art_sec = @art_sec");

    const artWooId = result.recordset.length > 0 ? result.recordset[0].art_woo_id : '';
    log(logLevels.INFO, `art_woo_id encontrado para art_sec ${art_sec}: ${artWooId || 'No encontrado'}`, { art_sec, artWooId });
    return artWooId;
  } catch (error) {
    log(logLevels.ERROR, `Error buscando art_woo_id para art_sec ${art_sec}`, {
      error: error.message,
      stack: error.stack,
      art_sec
    });
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

// Función para actualizar el estado del pedido y el stock de cada artículo en WooCommerce
const updateWooOrderStatusAndStock = async (fac_nro_woo, orderDetails, fac_fec = null, fac_nro = null) => {
  let messages = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const startTime = new Date();
  const BATCH_SIZE = 25;

  try {
    // Validar que orderDetails sea un array y no esté vacío
    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
      throw new Error('orderDetails debe ser un array no vacío de artículos');
    }

    // Validar que fac_nro esté presente
    if (!fac_nro) {
      throw new Error('El número de documento (fac_nro) es obligatorio');
    }

    log(logLevels.INFO, `Iniciando actualización en WooCommerce`, {
      orden: fac_nro_woo || 'N/A',
      documento: fac_nro,
      totalItems: orderDetails.length,
      fecha: fac_fec
    });

    const formattedDate = fac_fec ? formatDateToISO8601(fac_fec) : null;
    log(logLevels.INFO, `Fecha formateada: ${formattedDate || 'No proporcionada'}`);

    // Actualizar estado del pedido si existe
    if (fac_nro_woo) {
      log(logLevels.INFO, `Actualizando estado del pedido ${fac_nro_woo} a 'processing'`);
      try {
        const orderUpdateData = { status: "processing" };
        const orderResponse = await wcApi.put(`orders/${fac_nro_woo}`, orderUpdateData);
        messages.push(`Pedido ${fac_nro_woo} actualizado a 'processing' en WooCommerce.`);
        log(logLevels.INFO, `Pedido actualizado exitosamente`, {
          orderId: fac_nro_woo,
          response: orderResponse.data
        });
      } catch (orderError) {
        log(logLevels.ERROR, `Error actualizando pedido ${fac_nro_woo}`, {
          error: orderError.message,
          details: orderError.response?.data || 'No response data',
          stack: orderError.stack
        });
        messages.push(`Error actualizando pedido ${fac_nro_woo}: ${orderError.message}`);
        errorCount++;
      }
    }

    // Preparar datos para actualización por lotes
    log(logLevels.INFO, `Preparando actualización por lotes para ${orderDetails.length} artículos`);

    // Obtener todos los art_woo_id y stocks primero
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
          stock_quantity: newStock,
          date_created: formattedDate
        });
      } catch (error) {
        log(logLevels.ERROR, `Error preparando actualización para art_sec ${item.art_sec}`, {
          error: error.message,
          art_sec: item.art_sec
        });
        errorCount++;
      }
    }

    // Dividir las actualizaciones en lotes
    const batches = chunkArray(productUpdates, BATCH_SIZE);
    log(logLevels.INFO, `Dividiendo actualizaciones en ${batches.length} lotes de ${BATCH_SIZE} artículos`);

    // Procesar cada lote
    for (const [batchIndex, batch] of batches.entries()) {
      try {
        log(logLevels.INFO, `Procesando lote ${batchIndex + 1}/${batches.length}`);

        const batchData = {
          update: batch
        };

        const response = await wcApi.post('products/batch', batchData);

        // Procesar resultados del lote
        const batchResults = response.data;

        // Contar éxitos y errores del lote
        const successfulUpdates = batchResults.update.filter(item => !item.error);
        const failedUpdates = batchResults.update.filter(item => item.error);

        successCount += successfulUpdates.length;
        errorCount += failedUpdates.length;

        // Agregar mensajes de éxito
        successfulUpdates.forEach(item => {
          messages.push(`Producto ${item.id} actualizado con nuevo stock: ${item.stock_quantity}`);
        });

        // Agregar mensajes de error
        failedUpdates.forEach(item => {
          messages.push(`Error actualizando producto ${item.id}: ${item.error?.message || 'Error desconocido'}`);
        });

        log(logLevels.INFO, `Lote ${batchIndex + 1} completado`, {
          exitosos: successfulUpdates.length,
          errores: failedUpdates.length
        });

      } catch (batchError) {
        log(logLevels.ERROR, `Error procesando lote ${batchIndex + 1}`, {
          error: batchError.message,
          details: batchError.response?.data || 'No response data'
        });
        errorCount += batch.length;
        messages.push(`Error procesando lote ${batchIndex + 1}: ${batchError.message}`);
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
      errorDetails: null
    };

    // Guardar el log en la base de datos
    const logId = await saveSyncLog(logData);
    log(logLevels.INFO, `Log guardado con ID: ${logId}`);

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
      }
    };
  } catch (error) {
    log(logLevels.ERROR, "Error general en updateWooOrderStatusAndStock", {
      error: error.message,
      stack: error.stack,
      details: error,
      fac_nro
    });

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
      }
    };

    try {
      const logId = await saveSyncLog(errorLogData);
      log(logLevels.INFO, `Log de error guardado con ID: ${logId}`);
    } catch (logError) {
      log(logLevels.ERROR, "Error guardando log de error", {
        error: logError.message,
        originalError: error.message,
        fac_nro
      });
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
      }
    };
  }
};

export { updateWooOrderStatusAndStock };