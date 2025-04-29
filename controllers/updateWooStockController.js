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

// Configura la API de WooCommerce
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
  timeout: 30000,
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json',
    }
  }
});

// Función auxiliar para obtener el art_sec a partir del art_cod
const getArtSecFromArtCod = async (art_cod) => {
  log(logLevels.INFO, `Buscando art_sec para art_cod: ${art_cod}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_cod", sql.VarChar(50), art_cod)
      .query("SELECT art_sec FROM dbo.articulos WHERE art_cod = @art_cod");

    const art_sec = result.recordset.length > 0 ? result.recordset[0].art_sec : '';
    log(logLevels.INFO, `art_sec encontrado para art_cod ${art_cod}: ${art_sec || 'No encontrado'}`, { art_cod, art_sec });
    return art_sec;
  } catch (error) {
    log(logLevels.ERROR, `Error buscando art_sec para art_cod ${art_cod}`, {
      error: error.message,
      stack: error.stack,
      art_cod
    });
    throw error;
  }
};

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

const updateWooStockEndpoint = async (req, res) => {
  const { art_cod } = req.params;
  let messages = [];
  let debugLogs = [];

  try {
    // Validar que art_cod esté presente
    if (!art_cod) {
      const error = 'El art_cod es obligatorio';
      debugLogs.push(log(logLevels.ERROR, error));
      return res.status(400).json({ success: false, error });
    }

    // Validar configuración de WooCommerce
    if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
      const error = 'Faltan variables de entorno de WooCommerce';
      debugLogs.push(log(logLevels.ERROR, error, {
        WC_URL: Boolean(process.env.WC_URL),
        WC_CONSUMER_KEY: Boolean(process.env.WC_CONSUMER_KEY),
        WC_CONSUMER_SECRET: Boolean(process.env.WC_CONSUMER_SECRET)
      }));
      return res.status(500).json({ success: false, error });
    }

    // Obtener el art_sec a partir del art_cod
    const art_sec = await getArtSecFromArtCod(art_cod);
    if (!art_sec) {
      const error = `No se encontró art_sec para art_cod: ${art_cod}`;
      debugLogs.push(log(logLevels.WARN, error));
      return res.status(404).json({ success: false, error });
    }

    // Obtener el art_woo_id
    const artWooId = await getArticleWooId(art_sec);
    if (!artWooId) {
      const error = `No se encontró art_woo_id para art_cod: ${art_cod}`;
      debugLogs.push(log(logLevels.WARN, error));
      return res.status(404).json({ success: false, error });
    }

    // Obtener el stock actual
    const newStock = await getArticleStock(art_sec);

    // Actualizar el stock en WooCommerce
    try {
      const updateData = {
        stock_quantity: newStock
      };

      // Agregar headers adicionales para Cloudflare
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WooCommerce API Client',
          'Accept': 'application/json'
        },
        timeout: 60000 // Aumentar el timeout a 60 segundos
      };

      log(logLevels.INFO, `Intentando actualizar producto en WooCommerce`, {
        art_cod,
        art_sec,
        art_woo_id: artWooId,
        newStock,
        updateData
      });

      const response = await wcApi.put(`products/${artWooId}`, updateData, config);
      
      messages.push(`Producto ${artWooId} actualizado con nuevo stock: ${newStock}`);
      log(logLevels.INFO, `Producto actualizado exitosamente`, {
        artWooId,
        newStock,
        response: response.data
      });

      return res.json({
        success: true,
        messages,
        data: {
          art_cod,
          art_sec,
          art_woo_id: artWooId,
          stock: newStock
        }
      });
    } catch (wooError) {
      const errorDetails = {
        error: wooError.message,
        status: wooError.response?.status,
        statusText: wooError.response?.statusText,
        data: wooError.response?.data,
        config: {
          url: wooError.config?.url,
          method: wooError.config?.method,
          headers: wooError.config?.headers
        }
      };

      log(logLevels.ERROR, `Error actualizando producto en WooCommerce`, errorDetails);

      // Si es un error de Cloudflare, intentar una segunda vez después de un breve retraso
      if (wooError.response?.status === 500 && wooError.message.includes('Cloudflare')) {
        log(logLevels.INFO, `Intentando segunda actualización después de error de Cloudflare`);
        try {
          // Esperar 5 segundos antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const response = await wcApi.put(`products/${artWooId}`, updateData, config);
          messages.push(`Producto ${artWooId} actualizado con nuevo stock: ${newStock} (segundo intento)`);
          
          return res.json({
            success: true,
            messages,
            data: {
              art_cod,
              art_sec,
              art_woo_id: artWooId,
              stock: newStock
            }
          });
        } catch (retryError) {
          return res.status(500).json({
            success: false,
            error: `Error persistente al actualizar producto en WooCommerce: ${retryError.message}`,
            details: errorDetails
          });
        }
      }

      return res.status(500).json({
        success: false,
        error: `Error actualizando producto en WooCommerce: ${wooError.message}`,
        details: errorDetails
      });
    }
  } catch (error) {
    log(logLevels.ERROR, "Error general en updateWooStockEndpoint", {
      error: error.message,
      stack: error.stack,
      details: error
    });
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export { updateWooStockEndpoint }; 