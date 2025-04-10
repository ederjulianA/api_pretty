// jobs/updateWooOrderStatusAndStock.js
import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Configura la API de WooCommerce (asegúrate de tener estas variables en tu .env)
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL, // Ejemplo: 'https://tu-tienda.com'
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3"
});

// Función auxiliar para obtener el saldo (stock) actual de un artículo desde la vista vwExistencias
const getArticleStock = async (art_sec) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("art_sec", sql.VarChar(50), art_sec)
    .query("SELECT existencia FROM dbo.vwExistencias WHERE art_sec = @art_sec");
  return result.recordset.length > 0 ? Number(result.recordset[0].existencia) : 0;
};


// Función auxiliar para obtener el art_woo_id 
const getArticleWooId = async (art_sec) => {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT art_woo_id FROM dbo.articulos WHERE art_sec = @art_sec");
      console.log(`Buscando articulo ${art_sec}`);
    return result.recordset.length > 0 ? result.recordset[0].art_woo_id : '';
    

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
    // Formatear la fecha solo si existe y es válida
    const formattedDate = fac_fec ? formatDateToISO8601(fac_fec) : null;

    // Solo actualizar el estado del pedido si fac_nro_woo existe
    if (fac_nro_woo) {
      try {
        const orderUpdateData = { status: "processing" };
        const orderResponse = await wcApi.put(`orders/${fac_nro_woo}`, orderUpdateData);
        messages.push(`Pedido ${fac_nro_woo} actualizado a 'processing' en WooCommerce.`);
        console.log("Order update response:", orderResponse.data);
      } catch (orderError) {
        console.error(`Error actualizando pedido ${fac_nro_woo}:`, orderError.message);
        messages.push(`Error actualizando pedido ${fac_nro_woo}: ${orderError.message}`);
      }
    }

    // Actualizar el stock de cada artículo
    for (const item of orderDetails) {
      const art_sec = item.art_sec;
      const artWooId = await getArticleWooId(art_sec);
      
      if (!artWooId) {
        messages.push(`No se encontró art_woo_id para art_sec: ${art_sec}.`);
        continue;
      }

      try {
        const newStock = await getArticleStock(art_sec);
        const productUpdateData = {
          stock_quantity: newStock
        };

        // Solo agregar date_created si la fecha es válida
        if (formattedDate) {
          productUpdateData.date_created = formattedDate;
        }
        
        const productResponse = await wcApi.put(`products/${artWooId}`, productUpdateData);
        const dateMessage = formattedDate ? ` y fecha: ${formattedDate}` : '';
        messages.push(`Producto ${artWooId} actualizado con nuevo stock: ${newStock}${dateMessage}`);
        console.log(`Product ${artWooId} update response:`, productResponse.data);
      } catch (productError) {
        messages.push(`Error actualizando producto ${artWooId}: ${productError.message}`);
        console.error(`Error updating product ${artWooId}:`, productError.message);
      }
    }

    return messages;
  } catch (error) {
    console.error("Error general en updateWooOrderStatusAndStock:", error.message);
    messages.push(`Error general: ${error.message}`);
    return messages;
  }
};

export { updateWooOrderStatusAndStock };