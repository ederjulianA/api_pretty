/**
 * Utilidad para sincronizar stock con WooCommerce
 * Fecha: 2026-02-16
 * Usado por: Compras, Ajustes de Inventario, y otros módulos que afecten inventario
 */

const { poolPromise, sql } = require('../db');
const wcPkg = require('@woocommerce/woocommerce-rest-api');
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Configuración de logging
const logLevels = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [WOO-SYNC] ${message}`;

  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
};

// Configurar API de WooCommerce
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3',
  timeout: 30000,
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json'
    }
  }
});

/**
 * Divide un array en chunks
 */
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Reintenta una operación con delay exponencial
 */
const retryOperation = async (operation, maxRetries = 2, delay = 1000) => {
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
 * Sincroniza el stock de los artículos de un documento con WooCommerce
 *
 * @param {string} fac_nro - Número de documento (compra, ajuste, etc.)
 * @param {object} options - Opciones de sincronización
 * @param {number} options.batchSize - Tamaño del lote (default: 10)
 * @param {boolean} options.silent - Modo silencioso (no lanza errores) (default: false)
 * @returns {Promise<object>} Resultado de la sincronización
 */
const syncDocumentStockToWoo = async (fac_nro, options = {}) => {
  const { batchSize = 10, silent = false } = options;

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const messages = [];
  const startTime = new Date();

  try {
    // Validar configuración de WooCommerce
    if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
      const error = 'Faltan variables de entorno de WooCommerce (WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET)';
      log(logLevels.WARN, error);

      if (silent) {
        return {
          success: false,
          synced: false,
          reason: 'WooCommerce no configurado',
          successCount: 0,
          errorCount: 0,
          skippedCount: 0
        };
      }
      throw new Error(error);
    }

    log(logLevels.INFO, `Iniciando sincronización de stock para documento ${fac_nro}`);

    // Obtener artículos del documento con sus IDs de WooCommerce y stock actual
    const pool = await poolPromise;
    const queryResult = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_woo_id,
          ISNULL(e.existencia, 0) AS existencia
        FROM dbo.facturakardes fk
        INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
        INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
        LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
        WHERE f.fac_nro = @fac_nro
      `);

    const documentItems = queryResult.recordset;

    if (!documentItems || documentItems.length === 0) {
      log(logLevels.WARN, `No se encontraron artículos para el documento ${fac_nro}`);
      return {
        success: true,
        synced: false,
        reason: 'Sin artículos en el documento',
        successCount: 0,
        errorCount: 0,
        skippedCount: 0
      };
    }

    log(logLevels.INFO, `Procesando ${documentItems.length} artículos`, {
      fac_nro,
      totalItems: documentItems.length
    });

    // Preparar datos para actualización por lotes
    const productUpdates = [];

    for (const item of documentItems) {
      if (!item.art_woo_id) {
        log(logLevels.WARN, `Artículo ${item.art_cod} no tiene art_woo_id - omitiendo`);
        messages.push(`Artículo ${item.art_cod} no sincronizado con WooCommerce (sin art_woo_id)`);
        skippedCount++;
        continue;
      }

      const newStock = parseFloat(item.existencia) || 0;
      productUpdates.push({
        id: parseInt(item.art_woo_id),
        stock_quantity: newStock
      });
    }

    if (productUpdates.length === 0) {
      log(logLevels.WARN, `Ningún artículo tiene art_woo_id - no se sincronizará nada`);
      return {
        success: true,
        synced: false,
        reason: 'Ningún artículo tiene art_woo_id',
        successCount: 0,
        errorCount: 0,
        skippedCount: documentItems.length
      };
    }

    // Procesar actualizaciones en lotes
    const batches = chunkArray(productUpdates, batchSize);

    log(logLevels.INFO, `Procesando ${batches.length} lotes de ${batchSize} productos`);

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

        successfulUpdates.forEach(item => {
          log(logLevels.INFO, `Producto ${item.id} actualizado: stock = ${item.stock_quantity}`);
          messages.push(`WooCommerce: Producto ${item.id} actualizado con stock ${item.stock_quantity}`);
        });

        failedUpdates.forEach(item => {
          const errorMessage = item.error?.message || 'Error desconocido';
          log(logLevels.ERROR, `Error actualizando producto ${item.id}:`, { error: errorMessage });
          messages.push(`WooCommerce: Error en producto ${item.id} - ${errorMessage}`);
        });

      } catch (batchError) {
        const errorMessage = `Error procesando lote ${batchIndex + 1}: ${batchError.message}`;
        log(logLevels.ERROR, errorMessage, {
          batchIndex,
          batchSize: batch.length,
          error: batchError.message
        });
        errorCount += batch.length;
        messages.push(`WooCommerce: ${errorMessage}`);
      }
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const syncResult = {
      success: errorCount < productUpdates.length, // Éxito si al menos 1 se actualizó
      synced: true,
      fac_nro,
      totalItems: documentItems.length,
      successCount,
      errorCount,
      skippedCount,
      duration: `${duration}s`,
      batchesProcessed: batches.length,
      messages
    };

    log(logLevels.INFO, `Sincronización completada para ${fac_nro}`, {
      successCount,
      errorCount,
      skippedCount,
      duration
    });

    return syncResult;

  } catch (error) {
    log(logLevels.ERROR, `Error general en sincronización de ${fac_nro}`, {
      error: error.message,
      stack: error.stack
    });

    if (silent) {
      return {
        success: false,
        synced: false,
        reason: error.message,
        successCount,
        errorCount: errorCount + 1,
        skippedCount,
        messages
      };
    }

    throw error;
  }
};

/**
 * Sincroniza el stock de un artículo específico con WooCommerce
 *
 * @param {string} art_sec - Secuencia del artículo
 * @param {object} options - Opciones
 * @param {boolean} options.silent - Modo silencioso (default: false)
 * @returns {Promise<object>} Resultado de la sincronización
 */
const syncArticleStockToWoo = async (art_sec, options = {}) => {
  const { silent = false } = options;

  try {
    // Validar configuración
    if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
      if (silent) {
        return { success: false, synced: false, reason: 'WooCommerce no configurado' };
      }
      throw new Error('Faltan variables de entorno de WooCommerce');
    }

    // Obtener art_woo_id y stock actual
    const pool = await poolPromise;
    const articleResult = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .query(`
        SELECT
          a.art_woo_id,
          a.art_cod,
          ISNULL(e.existencia, 0) AS existencia
        FROM dbo.articulos a
        LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
        WHERE a.art_sec = @art_sec
      `);

    if (articleResult.recordset.length === 0) {
      if (silent) {
        return { success: false, synced: false, reason: 'Artículo no encontrado' };
      }
      throw new Error(`Artículo ${art_sec} no encontrado`);
    }

    const article = articleResult.recordset[0];

    if (!article.art_woo_id) {
      log(logLevels.WARN, `Artículo ${article.art_cod} no tiene art_woo_id`);
      if (silent) {
        return { success: false, synced: false, reason: 'Sin art_woo_id' };
      }
      throw new Error(`Artículo ${article.art_cod} no tiene art_woo_id`);
    }

    const newStock = parseFloat(article.existencia) || 0;

    // Actualizar en WooCommerce
    await wcApi.put(`products/${article.art_woo_id}`, {
      stock_quantity: newStock
    });

    log(logLevels.INFO, `Artículo ${article.art_cod} sincronizado: stock = ${newStock}`);

    return {
      success: true,
      synced: true,
      art_sec,
      art_cod: article.art_cod,
      art_woo_id: article.art_woo_id,
      stock: newStock
    };

  } catch (error) {
    log(logLevels.ERROR, `Error sincronizando artículo ${art_sec}`, {
      error: error.message
    });

    if (silent) {
      return {
        success: false,
        synced: false,
        reason: error.message
      };
    }

    throw error;
  }
};

module.exports = {
  syncDocumentStockToWoo,
  syncArticleStockToWoo
};
