// jobs/syncWooOrders.js
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const { createCompleteOrder, updateOrder } = require("../models/orderModel");
const { createNit } = require('../models/nitModel');
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

const getNitSec = async (nit_ide) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("nit_ide", sql.VarChar(100), nit_ide)
    .query("SELECT nit_sec FROM dbo.nit WHERE nit_ide = @nit_ide");
  return result.recordset.length > 0 ? result.recordset[0].nit_sec : null;
};

const getCiuCod = async (ciu_nom) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("ciu_nom", sql.VarChar(100), ciu_nom)
    .query("SELECT ciu_cod FROM dbo.ciudad WHERE LTRIM(RTRIM(LOWER(ciu_nom))) = LTRIM(RTRIM(LOWER(@ciu_nom)))");
  return result.recordset.length > 0 ? result.recordset[0].ciu_cod : '68001';
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
  return result.recordset.length > 0 ? result.recordset[0] : null;
};

const getArticuloInfo = async (art_cod) => {
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

const syncWooOrders = async (status, after, before) => {
  const messages = [];
  try {
    const orderStatus = status && status.trim() !== "" ? status.trim() : "on-hold";
    
    const params = { per_page: 100, status: orderStatus };
    if (after && after.trim() !== "") {
      params.after = after.trim();
    }
    if (before && before.trim() !== "") {
      params.before = before.trim();
    }
    
    const response = await wcApi.get("orders", params);
    const orders = response.data;
    messages.push(`Se encontraron ${orders.length} pedidos en WooCommerce`);
    
    for (const wooOrder of orders) {
      const fac_nro_woo = wooOrder.number.trim().toLowerCase();
      messages.push(`Procesando pedido ${fac_nro_woo}`);
      let nit_sec = await extractNitSec(wooOrder);

      let nitIde = "";
      if (wooOrder.meta_data && Array.isArray(wooOrder.meta_data)) {
        const metaNit = wooOrder.meta_data.find(meta => meta.key === "cc_o_nit");
        if (metaNit && metaNit.value) {
          nitIde = metaNit.value;
        }
      }
      nit_sec = await getNitSec(nitIde);
      let ciu_nom = wooOrder.billing.city;
      const ciu_cod = await getCiuCod(ciu_nom);

      if (!nit_sec) {
        const newCustomer = {
          nit_ide: nitIde,
          nit_nom: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim(),
          nit_tel: wooOrder.billing.phone || '',
          nit_dir: wooOrder.billing.address_1,
          nit_email: wooOrder.billing.email,
          ciu_cod: ciu_cod || ''
        };

        try {
          const ObjetoNit_sec = await createNit(newCustomer);
          nit_sec = ObjetoNit_sec.nit_sec;
        } catch (error) {
          messages.push(`Error creando cliente para ${wooOrder.billing.email}. Se omite el pedido ${fac_nro_woo}`);
          continue;
        }

        if (!nit_sec) {
          messages.push(`No se pudo crear el cliente para ${wooOrder.billing.email}. Se omite el pedido ${fac_nro_woo}`);
          continue;
        }
      }
      
      const fac_tip_cod = "COT";
      const fac_obs = (wooOrder.coupon_lines && wooOrder.coupon_lines.length > 0)
        ? "Cupón de descuento (" + wooOrder.coupon_lines.map(c => c.code.trim()).join(", ") + ")"
        : "";
      const fac_fec = wooOrder.date_created;
      
      let discountPercentage = 0;
      if (wooOrder.coupon_lines && wooOrder.coupon_lines.length > 0) {
        const couponMeta = wooOrder.coupon_lines[0].meta_data.find(meta => meta.key === "coupon_data");
        if (couponMeta && couponMeta.value && couponMeta.value.amount) {
          discountPercentage = Number(couponMeta.value.amount);
        }
      }
      
      const detalles = await Promise.all(
        wooOrder.line_items.map(async (item) => ({
          art_sec: await getArticuloInfo(item.sku),
          kar_uni: item.quantity,
          kar_pre_pub: (item.subtotal / item.quantity),
          kar_lis_pre_cod: null, 
          kar_kar_sec_ori: null,
          kar_fac_sec_ori: null
        }))
      );
      
      const existingOrder = await checkOrderExists(fac_nro_woo);
      const totalMayor = existingOrder ? await getWholesaleTotalByOrder(existingOrder.fac_nro) : 0;
      
      if (existingOrder) {
        const isFactured = await checkIfOrderFactured(existingOrder.fac_sec);
        if (!isFactured) {
          const updateData = {
            fac_nro: existingOrder.fac_nro,
            fac_tip_cod: existingOrder.fac_tip_cod,
            fac_nro_woo,
            nit_sec: existingOrder.nit_sec,
            fac_obs,
            fac_fec: fac_fec,
            fac_est_fac: 'A',
            detalles,
            descuento: discountPercentage
          };
          await updateOrder(updateData);
          messages.push(`Pedido ${fac_nro_woo} actualizado exitosamente`);
        } else {
          messages.push(`El pedido ${fac_nro_woo} ya está facturado`);
        }
      } else {
        const createData = {
          nit_sec,
          fac_usu_cod_cre: wooOrder.customer_id ? String(wooOrder.customer_id) : '',
          fac_tip_cod,
          fac_nro_woo,
          fac_obs,
          detalles,
          descuento: discountPercentage,
          fac_fec: fac_fec,
          lis_pre_cod: totalMayor > 100000 ? 2 : 1
        };
        const { createCompleteOrder } = await import("../models/orderModel.js");
        await createCompleteOrder(createData);
        messages.push(`Pedido ${fac_nro_woo} creado exitosamente`);
      }
    }

    messages.push("Sincronización de pedidos completada");
    return messages;
  } catch (error) {
    messages.push(`Error en sincronización: ${error.message}`);
    return messages;
  }
};

module.exports = { syncWooOrders };