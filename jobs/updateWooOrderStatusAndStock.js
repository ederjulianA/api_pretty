// jobs/updateWooOrderStatusAndStock.js
import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Configura la API de WooCommerce (asegúrate de tener estas variables en tu .env)
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL, // Ejemplo: 'https://tu-tienda.com'
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
  timeout: 10000, // Aumentar el timeout a 10 segundos
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json',
    }
  }
});

// Función auxiliar para obtener el saldo (stock) actual de un artículo desde la vista vwExistencias
const getArticleStock = async (art_sec) => {
  console.log(`[WOO] Consultando stock para art_sec: ${art_sec}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT existencia FROM dbo.vwExistencias WHERE art_sec = @art_sec");

    const stock = result.recordset.length > 0 ? Number(result.recordset[0].existencia) : 0;
    console.log(`[WOO] Stock encontrado para art_sec ${art_sec}: ${stock}`);
    return stock;
  } catch (error) {
    console.error(`[WOO] Error obteniendo stock para art_sec ${art_sec}:`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};


// Función auxiliar para obtener el art_woo_id 
const getArticleWooId = async (art_sec) => {
  console.log(`[WOO] Buscando art_woo_id para art_sec: ${art_sec}`);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT art_woo_id FROM dbo.articulos WHERE art_sec = @art_sec");

    const artWooId = result.recordset.length > 0 ? result.recordset[0].art_woo_id : '';
    console.log(`[WOO] art_woo_id encontrado para art_sec ${art_sec}: ${artWooId || 'No encontrado'}`);
    return artWooId;
  } catch (error) {
    console.error(`[WOO] Error buscando art_woo_id para art_sec ${art_sec}:`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

const formatDateToISO8601 = (date) => {
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    return dateObj.toISOString().slice(0, 19).replace('Z', '');
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return null;
  }
};

// Función para actualizar el estado del pedido y el stock de cada artículo en WooCommerce
const updateWooOrderStatusAndStock = async (fac_nro_woo, orderDetails, fac_fec = null) => {
  let messages = [];
  try {
    console.log(`[WOO] Iniciando actualización en WooCommerce - Orden: ${fac_nro_woo || 'N/A'}`);

    // Formatear la fecha solo si existe y es válida
    const formattedDate = fac_fec ? formatDateToISO8601(fac_fec) : null;
    console.log(`[WOO] Fecha formateada: ${formattedDate || 'No proporcionada'}`);

    // Solo actualizar el estado del pedido si fac_nro_woo existe
    if (fac_nro_woo) {
      console.log(`[WOO] Actualizando estado del pedido ${fac_nro_woo} a 'processing'...`);
      try {
        const orderUpdateData = { status: "processing" };
        const orderResponse = await wcApi.put(`orders/${fac_nro_woo}`, orderUpdateData);
        messages.push(`Pedido ${fac_nro_woo} actualizado a 'processing' en WooCommerce.`);
        console.log(`[WOO] Pedido ${fac_nro_woo} actualizado exitosamente`);
        console.log(`[WOO] Respuesta de WooCommerce:`, JSON.stringify(orderResponse.data, null, 2));
      } catch (orderError) {
        console.error(`[WOO] Error actualizando pedido ${fac_nro_woo}:`, {
          error: orderError.message,
          stack: orderError.stack,
          details: orderError.response?.data || 'No response data'
        });
        messages.push(`Error actualizando pedido ${fac_nro_woo}: ${orderError.message}`);
      }
    }

    // Actualizar el stock de cada artículo
    console.log(`[WOO] Iniciando actualización de stock para ${orderDetails.length} artículos`);
    for (const item of orderDetails) {
      const art_sec = item.art_sec;
      console.log(`[WOO] Procesando artículo ${art_sec}...`);

      console.log(`[WOO] Obteniendo art_woo_id para art_sec: ${art_sec}`);
      const artWooId = await getArticleWooId(art_sec);

      if (!artWooId) {
        console.log(`[WOO] ADVERTENCIA: No se encontró art_woo_id para art_sec: ${art_sec}`);
        messages.push(`No se encontró art_woo_id para art_sec: ${art_sec}.`);
        continue;
      }

      try {
        console.log(`[WOO] Obteniendo stock actual para art_sec: ${art_sec}`);
        const newStock = await getArticleStock(art_sec);
        console.log(`[WOO] Stock actual para art_sec ${art_sec}: ${newStock}`);

        const productUpdateData = {
          stock_quantity: newStock
        };

        // Solo agregar date_created si la fecha es válida
        if (formattedDate) {
          productUpdateData.date_created = formattedDate;
          console.log(`[WOO] Incluyendo fecha en la actualización: ${formattedDate}`);
        }

        console.log(`[WOO] Enviando actualización a WooCommerce para producto ${artWooId}:`, productUpdateData);
        const productResponse = await wcApi.put(`products/${artWooId}`, productUpdateData);

        const dateMessage = formattedDate ? ` y fecha: ${formattedDate}` : '';
        messages.push(`Producto ${artWooId} actualizado con nuevo stock: ${newStock}${dateMessage}`);

        console.log(`[WOO] Producto ${artWooId} actualizado exitosamente`);
        console.log(`[WOO] Respuesta de WooCommerce:`, JSON.stringify(productResponse.data, null, 2));
      } catch (productError) {
        console.error(`[WOO] Error actualizando producto ${artWooId}:`, {
          error: productError.message,
          stack: productError.stack,
          details: productError.response?.data || 'No response data',
          requestData: {
            stock: newStock,
            date: formattedDate
          }
        });
        messages.push(`Error actualizando producto ${artWooId}: ${productError.message}`);
      }
    }

    console.log(`[WOO] Proceso de actualización completado`);
    console.log(`[WOO] Resumen de mensajes:`, messages);
    return messages;
  } catch (error) {
    console.error("[WOO] Error general en updateWooOrderStatusAndStock:", {
      error: error.message,
      stack: error.stack,
      details: error
    });
    messages.push(`Error general: ${error.message}`);
    return messages;
  }
};

export { updateWooOrderStatusAndStock };