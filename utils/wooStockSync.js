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
    // Soporta tanto productos simples como variaciones
    const pool = await poolPromise;
    const queryResult = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_woo_id,
          a.art_woo_type,
          a.art_woo_variation_id,
          padre.art_woo_id AS art_parent_woo_id,
          ISNULL(e.existencia, 0) AS existencia
        FROM dbo.facturakardes fk
        INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
        INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
        LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
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
      totalItems: documentItems.length,
      articulos: documentItems.map(d => ({
        art_cod: d.art_cod,
        art_woo_type: d.art_woo_type,
        art_woo_id: d.art_woo_id,
        art_woo_variation_id: d.art_woo_variation_id,
        art_parent_woo_id: d.art_parent_woo_id,
        existencia: d.existencia
      }))
    });

    // Preparar datos para actualización por lotes
    const productUpdates = [];
    const variationUpdates = [];

    for (const item of documentItems) {
      const newStock = parseFloat(item.existencia) || 0;

      // Manejo de variaciones (productos hijos)
      if (item.art_woo_type === 'variation') {
        if (!item.art_woo_variation_id || !item.art_parent_woo_id) {
          log(logLevels.WARN, `Variación ${item.art_cod} no tiene art_woo_variation_id o art_parent_woo_id - omitiendo`);
          messages.push(`Variación ${item.art_cod} no sincronizada (sin IDs de WooCommerce)`);
          skippedCount++;
          continue;
        }

        variationUpdates.push({
          parentId: parseInt(item.art_parent_woo_id),
          variationId: parseInt(item.art_woo_variation_id),
          stock_quantity: newStock,
          art_cod: item.art_cod
        });
      }
      // Manejo de productos simples
      else {
        if (!item.art_woo_id) {
          log(logLevels.WARN, `Artículo ${item.art_cod} (art_woo_type: ${item.art_woo_type}) no tiene art_woo_id - omitiendo`, {
            art_sec: item.art_sec,
            art_woo_id: item.art_woo_id,
            art_woo_type: item.art_woo_type
          });
          messages.push(`Artículo ${item.art_cod} no sincronizado con WooCommerce (sin art_woo_id)`);
          skippedCount++;
          continue;
        }

        productUpdates.push({
          id: parseInt(item.art_woo_id),
          stock_quantity: newStock
        });
      }
    }

    if (productUpdates.length === 0 && variationUpdates.length === 0) {
      log(logLevels.WARN, `Ningún artículo tiene art_woo_id/art_woo_variation_id - no se sincronizará nada`);
      return {
        success: true,
        synced: false,
        reason: 'Ningún artículo tiene IDs de WooCommerce',
        successCount: 0,
        errorCount: 0,
        skippedCount: documentItems.length
      };
    }

    // 1. Procesar productos simples en lotes
    if (productUpdates.length > 0) {
      const batches = chunkArray(productUpdates, batchSize);

      log(logLevels.INFO, `Procesando ${batches.length} lotes de ${batchSize} productos simples`);

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
    }

    // 2. Procesar variaciones individuales (no se pueden hacer en batch)
    if (variationUpdates.length > 0) {
      log(logLevels.INFO, `Procesando ${variationUpdates.length} variaciones`);

      for (const variation of variationUpdates) {
        try {
          const apiPath = `products/${variation.parentId}/variations/${variation.variationId}`;

          await retryOperation(async () => {
            const result = await wcApi.put(apiPath, {
              stock_quantity: variation.stock_quantity
            });
            if (!result || !result.data) {
              throw new Error('Respuesta inválida de WooCommerce');
            }
            return result;
          }, 2, 1000);

          successCount++;
          log(logLevels.INFO, `Variación ${variation.art_cod} actualizada: stock = ${variation.stock_quantity}`);
          messages.push(`WooCommerce: Variación ${variation.art_cod} actualizada con stock ${variation.stock_quantity}`);

        } catch (variationError) {
          errorCount++;
          const errorMessage = variationError.message || 'Error desconocido';
          log(logLevels.ERROR, `Error actualizando variación ${variation.art_cod}:`, { error: errorMessage });
          messages.push(`WooCommerce: Error en variación ${variation.art_cod} - ${errorMessage}`);
        }
      }
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const totalToSync = productUpdates.length + variationUpdates.length;
    const syncResult = {
      success: successCount > 0 && errorCount < totalToSync, // Éxito si al menos 1 se actualizó y no todos fallaron
      synced: true,
      fac_nro,
      totalItems: documentItems.length,
      successCount,
      errorCount,
      skippedCount,
      duration: `${duration}s`,
      batchesProcessed: productUpdates.length > 0 ? Math.ceil(productUpdates.length / batchSize) : 0,
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

    // Obtener art_woo_id (y variación info si aplica) y stock actual
    const pool = await poolPromise;
    const articleResult = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .query(`
        SELECT
          a.art_woo_id,
          a.art_woo_type,
          a.art_woo_variation_id,
          a.art_cod,
          a.art_sec_padre,
          padre.art_woo_id AS art_parent_woo_id,
          ISNULL(e.existencia, 0) AS existencia
        FROM dbo.articulos a
        LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
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
    const newStock = parseFloat(article.existencia) || 0;

    // Manejo de variaciones
    if (article.art_woo_type === 'variation') {
      if (!article.art_woo_variation_id || !article.art_parent_woo_id) {
        log(logLevels.WARN, `Variación ${article.art_cod} no tiene IDs de WooCommerce`);
        if (silent) {
          return { success: false, synced: false, reason: 'Sin IDs de variación en WooCommerce' };
        }
        throw new Error(`Variación ${article.art_cod} no tiene art_woo_variation_id o art_parent_woo_id`);
      }

      const apiPath = `products/${article.art_parent_woo_id}/variations/${article.art_woo_variation_id}`;
      await wcApi.put(apiPath, {
        stock_quantity: newStock
      });

      log(logLevels.INFO, `Variación ${article.art_cod} sincronizada: stock = ${newStock}`);

      return {
        success: true,
        synced: true,
        art_sec,
        art_cod: article.art_cod,
        art_woo_type: 'variation',
        art_woo_variation_id: article.art_woo_variation_id,
        art_parent_woo_id: article.art_parent_woo_id,
        stock: newStock
      };
    }

    // Manejo de productos simples
    if (!article.art_woo_id) {
      log(logLevels.WARN, `Artículo ${article.art_cod} no tiene art_woo_id`);
      if (silent) {
        return { success: false, synced: false, reason: 'Sin art_woo_id' };
      }
      throw new Error(`Artículo ${article.art_cod} no tiene art_woo_id`);
    }

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
