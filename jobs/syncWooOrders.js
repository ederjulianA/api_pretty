// jobs/syncWooOrders.js
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const { createCompleteOrder, updateOrder } = require("../models/orderModel");
const { poolPromise, sql } = require("../db");


// Configuración de la API de WooCommerce usando variables de entorno
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL, // Ejemplo: 'https://noviembre.prettymakeupcol.com'
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3"
});

// Función auxiliar: obtiene el precio de venta al mayor para un producto (art_sec)
const getWholesalePrice = async (art_sec) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("art_sec", sql.VarChar(50), art_sec)
    .query(`
      SELECT art_bod_pre 
      FROM dbo.articulosdetalle 
      WHERE art_sec = @art_sec AND lis_pre_cod = 2
    `);
  return result.recordset.length > 0 ? Number(result.recordset[0].art_bod_pre) : 0;
};

// Función que dado un fac_nro, obtiene el total de la compra al mayor
const getWholesaleTotalByOrder = async (fac_nro) => {
  const pool = await poolPromise;

  // 1. Obtener el fac_sec a partir de fac_nro
  const headerResult = await pool.request()
    .input("fac_nro", sql.VarChar(15), fac_nro)
    .query("SELECT fac_sec FROM dbo.factura WHERE fac_nro = @fac_nro");
  if (!headerResult.recordset || headerResult.recordset.length === 0) {
    throw new Error("Pedido no encontrado.");
  }
  const fac_sec = headerResult.recordset[0].fac_sec;

  // 2. Obtener los detalles del pedido
  const detailResult = await pool.request()
    .input("fac_sec", sql.Decimal(18, 0), fac_sec)
    .query("SELECT art_sec, kar_uni FROM dbo.facturakardes WHERE fac_sec = @fac_sec");

  // 3. Para cada detalle, obtener el precio mayor y calcular el subtotal
  let totalWholesale = 0;
  for (const detail of detailResult.recordset) {
    const wholesalePrice = await getWholesalePrice(detail.art_sec);
    totalWholesale += Number(detail.kar_uni) * wholesalePrice;
  }
  return totalWholesale;
};

// Función auxiliar: verifica si un pedido ya existe en el sistema local
const checkOrderExists = async (fac_nro_woo) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("fac_nro_woo", sql.VarChar(50), fac_nro_woo)
    .query(`
      SELECT fac_sec, nit_sec, fac_nro_woo, fac_nro, fac_tip_cod 
      FROM dbo.factura 
      WHERE LTRIM(RTRIM(LOWER(fac_nro_woo))) = LTRIM(RTRIM(LOWER(@fac_nro_woo)))`
    );
    console.log("Resultado de la validación " + JSON.stringify(result.recordset[0], null, 2));

  return result.recordset.length > 0 ? result.recordset[0] : null;
};

const getArticuloInfo = async (art_cod) => {
    console.log(`CONSULTANDO ARTICULO ${art_cod}`);
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_cod", sql.VarChar(16), art_cod)
      .query(
        `SELECT art_sec
        FROM dbo.articulos 
        WHERE LTRIM(RTRIM(LOWER(art_cod))) = LTRIM(RTRIM(LOWER(@art_cod)))`
      );
      return result.recordset.length > 0 ? result.recordset[0].art_sec : null;
}

// Función auxiliar: determina si un pedido ya está facturado
const checkIfOrderFactured = async (fac_sec) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("fac_sec", sql.Decimal(18,0), fac_sec)
    .query(
      `SELECT COUNT(*) AS count 
      FROM dbo.facturakardes k
      left join dbo.factura f on f.fac_sec = k.fac_sec
      WHERE k.kar_fac_sec_ori = @fac_sec
        AND f.fac_est_fac = 'A'
        AND kar_fac_sec_ori IS NOT NULL 
        AND kar_uni > 0`
    );
  return result.recordset[0].count > 0;
};

// Función auxiliar: extraer (o crear) el nit_sec a partir del email del cliente
const extractNitSec = async (wooOrder) => {
  const pool = await poolPromise;
  const email = wooOrder.billing.email;
  const result = await pool.request()
    .input("email", sql.VarChar(100), email)
    .query("SELECT nit_sec FROM dbo.nit WHERE nit_email = @email");
  if (result.recordset.length > 0) {
    return result.recordset[0].nit_sec;
  }
  // Aquí podrías invocar la lógica para crear un cliente nuevo
  return null;
};

const syncWooOrders = async () => {
  const messages = [];
  try {
    // Configura la consulta de pedidos en WooCommerce: estado on-hold, 100 por página, etc.
    const response = await wcApi.get("orders", { per_page: 100, status: "on-hold" });
    const orders = response.data;
    console.log(`Se encontraron ${orders.length} pedidos en WooCommerce`);
    messages.push(`Se encontraron ${orders.length} pedidos en WooCommerce`);
    for (const wooOrder of orders) {
      // Normalizar el identificador de pedido (fac_nro_woo)
      const fac_nro_woo = wooOrder.number.trim().toLowerCase();
      messages.push(`Leyendo pedido ${fac_nro_woo}`);
      // Obtener el identificador del cliente (nit_sec)
      let nit_sec = await extractNitSec(wooOrder);
      if (!nit_sec) {
        const msg = `No se encontró cliente para ${wooOrder.billing.email}. Se omite el pedido ${fac_nro_woo}.`;
        messages.push(msg);
        continue;
      }
      
      // Definir el tipo de comprobante según el estado (ejemplo: 'COT' para on-hold, 'VTA' para otros)
      const fac_tip_cod =  "COT" ;
      // Armar observación si existen cupones
      const fac_obs = (wooOrder.coupon_lines && wooOrder.coupon_lines.length > 0)
                        ? "Cupón de descuento (" + wooOrder.coupon_lines.map(c => c.code.trim()).join(", ") + ")"
                        : "";
      const fac_fec = wooOrder.date_created;

      // Extraer el descuento de cupón (kar_des_uno) desde coupon_lines, si existe
    let discountPercentage = 0;
    if (wooOrder.coupon_lines && wooOrder.coupon_lines.length > 0) {
      // Se toma el primer cupón y se busca en su meta_data el objeto con key "coupon_data"
      const couponMeta = wooOrder.coupon_lines[0].meta_data.find(meta => meta.key === "coupon_data");
      if (couponMeta && couponMeta.value && couponMeta.value.amount) {
        discountPercentage = Number(couponMeta.value.amount);
      }
    }

      // Mapear las líneas de pedido al formato que espera tu función (detalle)
    // Luego, al mapear los detalles de un pedido de WooCommerce:
            // Verificar si el pedido ya existe (por fac_nro_woo)
        const existingOrder = await checkOrderExists(fac_nro_woo);
        const totalMayor = await getWholesaleTotalByOrder(existingOrder.fac_nro);
        const detalles = await Promise.all(
        wooOrder.line_items.map(async (item) => {
        const art_sec = await getArticuloInfo(item.sku);
        messages.push(`SKU ${item.sku}: art_sec obtenido ${art_sec}`);
        console.log(`art_sec ocnsultado : ${art_sec}`);
        console.log(` kar_des_uno ${discountPercentage}`);
        return {
          art_sec, // obtenido desde la base de datos
          kar_uni: item.quantity,
          kar_pre_pub: (item.subtotal/item.quantity) , // Precio de venta
          kar_lis_pre_cod: totalMayor > 100000 ? 2 : 1,  // Ajusta según la lógica de precios
          kar_kar_sec_ori: null,
          kar_fac_sec_ori: null
        };
    })
  );


      console.log(`total al mayor ${totalMayor}`);
      messages.push(`existingOrder ${JSON.stringify(existingOrder,null,2)}`)
      if (existingOrder) {
        messages.push(`El pedido ${fac_nro_woo} ya existe. Verificando si se puede actualizar...`);
        const isFactured = await checkIfOrderFactured(existingOrder.fac_sec);
        if (!isFactured) {
          messages.push(`Actualizando pedido ${fac_nro_woo}...`);
          
          const updateData = {
            fac_nro: existingOrder.fac_nro,
            fac_tip_cod: existingOrder.fac_tip_cod,
            fac_nro_woo,
            nit_sec: existingOrder.nit_sec,
            fac_obs,
            fac_est_fac: 'A', // Asumimos 'A' para activo
            detalles: detalles,
            descuento: discountPercentage,
            
          };
          messages.push(` updateData ${ updateData}`);
          console.log(`updateData ${ JSON.stringify(updateData,null,2)} `);
          await updateOrder(updateData);
        } else {
          messages.push(`Pedido ${fac_nro_woo} actualizado exitosamente.`);
        }
      } else {
        messages.push(`Creando nuevo pedido ${fac_nro_woo}...`);
        const createData = {
          nit_sec,
          fac_usu_cod_cre: wooOrder.customer_id ? String(wooOrder.customer_id) : '',
          fac_tip_cod,
          fac_nro_woo,
          fac_obs,
          detalles,
          descuento:discountPercentage,
          lis_pre_cod:  totalMayor > 100000 ? 2 : 1  // Ajusta según tu lógica
        };
        
        await createCompleteOrder(createData);
        messages.push(`Pedido ${fac_nro_woo} creado exitosamente.`);
      }
    }

    messages.push("Sincronización de pedidos completada.");
    return messages;
  } catch (error) {
    messages.push(`Error sincronizando pedidos de WooCommerce: ${error.message}`);
    return messages;
  }
};

module.exports = { syncWooOrders };