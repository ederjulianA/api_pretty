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

// Función para actualizar el estado del pedido y el stock de cada artículo en WooCommerce
const updateWooOrderStatusAndStock = async (fac_nro_woo, orderDetails) => {
  let messages = [];
  try {
    // Actualizar el estado del pedido a "processing" en WooCommerce
    // Se asume que fac_nro_woo es el identificador del pedido en WooCommerce (o puedes mapearlo según tu sistema)
    const orderUpdateData = { status: "processing" };
    const orderResponse = await wcApi.put(`orders/${fac_nro_woo}`, orderUpdateData);
    messages.push(`Pedido ${fac_nro_woo} actualizado a 'processing' en WooCommerce.`);
    console.log("Order update response:", orderResponse.data);

    // Actualizar el stock de cada artículo del pedido
    for (const item of orderDetails) {

      // Se asume que cada item tiene art_sec y art_woo_id (el id del producto en WooCommerce)
      const art_sec = item.art_sec;
      const artWooId = await getArticleWooId(art_sec);
      if (!artWooId) {
        messages.push(`No se encontró art_woo_id para art_sec: ${art_sec}.`);
        continue;
      }
      const newStock = await getArticleStock(art_sec);
      const productUpdateData = { stock_quantity: newStock };
      try {
        const productResponse = await wcApi.put(`products/${artWooId}`, productUpdateData);
        messages.push(`Producto ${artWooId} actualizado con nuevo stock: ${newStock}.`);
        console.log(`Product ${artWooId} update response:`, productResponse.data);
      } catch (error) {
        messages.push(`Error actualizando producto ${artWooId}: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        console.error(`Error updating product ${artWooId}:`, error.response ? error.response.data : error.message);
      }
    }

    return messages;
  } catch (error) {
    messages.push(`Error actualizando pedido en WooCommerce: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    console.error("Error updating WooCommerce order and stock:", error.response ? error.response.data : error.message);
    throw error;
  }
};

export { updateWooOrderStatusAndStock };