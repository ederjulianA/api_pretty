// jobs/updateWooProductWeightDimensions.js
import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

console.log('Inicializando updateWooProductWeightDimensions.js - Versión:', new Date().toISOString());

const logLevels = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [WOO_WEIGHT_DIM] ${message}`;
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

const saveSyncLog = async (logData) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("fac_nro_woo", sql.VarChar(50), null)
      .input("fac_nro", sql.VarChar(50), null)
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
          fac_nro_woo, fac_nro, total_items, success_count, error_count,
          skipped_count, duration, batches_processed, messages, status,
          error_details, product_updates, debug_logs
        ) VALUES (
          @fac_nro_woo, @fac_nro, @total_items, @success_count, @error_count,
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

const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
  timeout: 8000,
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json',
    }
  }
});

const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

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

/**
 * Arma el payload weight/dimensions nativo de WooCommerce a partir de una fila de dbo.articulos.
 * Solo incluye una key si el valor no es null (evita pisar con "" datos que WooCommerce
 * ya tuviera cargados manualmente y que la BD local aún no capturó).
 */
const armarPesoDimensionesWoo = (row) => {
  const wooData = {};

  if (row.art_peso !== null && row.art_peso !== undefined) {
    wooData.weight = row.art_peso.toString();
  }

  const hayDimension = row.art_largo !== null || row.art_ancho !== null || row.art_alto !== null;
  if (hayDimension) {
    wooData.dimensions = {};
    if (row.art_largo !== null && row.art_largo !== undefined) wooData.dimensions.length = row.art_largo.toString();
    if (row.art_ancho !== null && row.art_ancho !== undefined) wooData.dimensions.width = row.art_ancho.toString();
    if (row.art_alto !== null && row.art_alto !== undefined) wooData.dimensions.height = row.art_alto.toString();
  }

  return wooData;
};

/**
 * Sincroniza peso/dimensiones hacia WooCommerce en batch (products/batch, hasta 100/llamada)
 * para productos simples y padres variables que ya tengan al menos un valor cargado en BD.
 * No cubre variaciones individuales (art_woo_type = 'variation') — WooCommerce no tiene
 * batch nativo para variaciones; esas se sincronizan una a una vía updateProductVariation.
 * @param {string[]} [art_cods] - Si se omite, procesa TODOS los productos con datos pendientes de sync.
 */
const updateWooProductWeightDimensions = async (art_cods = null) => {
  let messages = [];
  let debugLogs = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const startTime = new Date();
  const BATCH_SIZE = 10;

  try {
    if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
      const error = 'Faltan variables de entorno de WooCommerce';
      debugLogs.push(log(logLevels.ERROR, error));
      throw new Error(error);
    }

    const pool = await poolPromise;
    const request = pool.request();

    let whereClause = `
      WHERE a.art_woo_id IS NOT NULL
        AND ISNULL(a.art_woo_type, 'simple') <> 'variation'
        AND (a.art_peso IS NOT NULL OR a.art_largo IS NOT NULL OR a.art_ancho IS NOT NULL OR a.art_alto IS NOT NULL)
    `;

    if (Array.isArray(art_cods) && art_cods.length > 0) {
      const params = art_cods.map((cod, i) => {
        const paramName = `art_cod_${i}`;
        request.input(paramName, sql.VarChar(30), cod);
        return `@${paramName}`;
      });
      whereClause += ` AND a.art_cod IN (${params.join(', ')})`;
    }

    const result = await request.query(`
      SELECT a.art_sec, a.art_cod, a.art_woo_id, a.art_peso, a.art_largo, a.art_ancho, a.art_alto
      FROM dbo.articulos a
      ${whereClause}
    `);

    const rows = result.recordset;

    if (rows.length === 0) {
      const message = 'No hay productos con peso/dimensiones pendientes de sincronizar';
      debugLogs.push(log(logLevels.INFO, message));
      const logId = await saveSyncLog({
        totalItems: 0,
        successCount: 0,
        errorCount: 0,
        skippedCount: 0,
        duration: (new Date() - startTime) / 1000,
        batchesProcessed: 0,
        messages: [message],
        status: 'SUCCESS',
        errorDetails: null,
        productUpdates: [],
        debugLogs
      });
      return {
        messages: [message],
        summary: { totalItems: 0, successCount: 0, errorCount: 0, skippedCount: 0, duration: '0 segundos', batchesProcessed: 0, logId },
        debugLogs
      };
    }

    const productUpdates = [];
    for (const row of rows) {
      const wooPesoDimensiones = armarPesoDimensionesWoo(row);
      if (Object.keys(wooPesoDimensiones).length === 0) {
        skippedCount++;
        continue;
      }
      productUpdates.push({ id: row.art_woo_id, art_cod: row.art_cod, ...wooPesoDimensiones });
    }

    const batches = chunkArray(productUpdates, BATCH_SIZE);

    for (const [batchIndex, batch] of batches.entries()) {
      try {
        const batchData = { update: batch.map(({ art_cod, ...wooData }) => wooData) };
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

        successfulUpdates.forEach(item => {
          messages.push(`Producto ${item.id} actualizado con peso/dimensiones`);
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
      totalItems: rows.length,
      successCount,
      errorCount,
      skippedCount,
      duration,
      batchesProcessed: batches.length,
      messages,
      status: errorCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      errorDetails: null,
      productUpdates,
      debugLogs
    };

    const logId = await saveSyncLog(logData);

    return {
      messages,
      summary: {
        totalItems: rows.length,
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
    debugLogs.push(log(logLevels.ERROR, "Error general en updateWooProductWeightDimensions", {
      error: error.message,
      stack: error.stack
    }));

    const errorLogData = {
      totalItems: 0,
      successCount,
      errorCount: errorCount + 1,
      skippedCount,
      duration: (new Date() - startTime) / 1000,
      batchesProcessed: 0,
      messages,
      status: 'ERROR',
      errorDetails: { message: error.message, stack: error.stack },
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
        totalItems: 0,
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

export { updateWooProductWeightDimensions };
