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

// Función auxiliar para obtener precios base de un artículo
const getArticuloPreciosBase = async (art_sec) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("art_sec", sql.VarChar(30), art_sec)
    .query(`
      SELECT 
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
      WHERE a.art_sec = @art_sec
    `);
  
  if (result.recordset.length === 0) {
    return { precio_detal_original: 0, precio_mayor_original: 0 };
  }
  
  return result.recordset[0];
}

// Función para obtener información de promociones de un artículo en una fecha específica
// Si el artículo es una variación, busca promociones del producto padre
const getArticuloPromocionInfo = async (art_sec, fecha) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("art_sec", sql.VarChar(30), art_sec)
    .input("fecha", sql.DateTime, fecha)
    .query(`
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        -- Precios base (de la variación o producto simple)
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        -- Información de promoción (busca en el padre si es variación)
        pd.pro_det_precio_oferta,
        pd.pro_det_descuento_porcentaje,
        p.pro_fecha_inicio,
        p.pro_fecha_fin,
        p.pro_codigo AS codigo_promocion,
        p.pro_descripcion AS descripcion_promocion,
        -- Determinar si tiene oferta activa
        CASE
            WHEN p.pro_sec IS NOT NULL
                 AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0)
                      OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
            THEN 'S'
            ELSE 'N'
        END AS tiene_oferta
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
      -- Buscar promociones: si es variación (art_sec_padre != NULL), buscar en el padre
      LEFT JOIN dbo.promociones_detalle pd
        ON COALESCE(a.art_sec_padre, a.art_sec) = pd.art_sec AND pd.pro_det_estado = 'A'
      LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
        AND p.pro_activa = 'S'
        AND @fecha BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
      WHERE a.art_sec = @art_sec
    `);
  
  if (result.recordset.length === 0) {
    // Si no se encuentra el artículo, devolver null
    return null;
  }
  
  const data = result.recordset[0];
  
  // Calcular precios finales
  let precioFinalDetal = data.precio_detal_original;
  let precioFinalMayor = data.precio_mayor_original;
  
  if (data.tiene_oferta === 'S') {
    if (data.pro_det_precio_oferta && data.pro_det_precio_oferta > 0) {
      precioFinalDetal = data.pro_det_precio_oferta;
      precioFinalMayor = data.pro_det_precio_oferta;
    } else if (data.pro_det_descuento_porcentaje && data.pro_det_descuento_porcentaje > 0) {
      const factorDescuento = 1 - (data.pro_det_descuento_porcentaje / 100);
      precioFinalDetal = data.precio_detal_original * factorDescuento;
      precioFinalMayor = data.precio_mayor_original * factorDescuento;
    }
  }
  
  // Siempre devolver un objeto con los precios base, incluso cuando no hay promoción
  return {
    art_sec: data.art_sec,
    art_cod: data.art_cod,
    art_nom: data.art_nom,
    precio_detal_original: data.precio_detal_original,
    precio_mayor_original: data.precio_mayor_original,
    precio_detal: precioFinalDetal,
    precio_mayor: precioFinalMayor,
    precio_oferta: data.pro_det_precio_oferta,
    descuento_porcentaje: data.pro_det_descuento_porcentaje,
    pro_fecha_inicio: data.pro_fecha_inicio,
    pro_fecha_fin: data.pro_fecha_fin,
    codigo_promocion: data.codigo_promocion,
    descripcion_promocion: data.descripcion_promocion,
    tiene_oferta: data.tiene_oferta
  };
};

// Función auxiliar: determina si un pedido ya está facturado
const checkIfOrderFactured = async (fac_sec) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("fac_sec", sql.Decimal(18, 0), fac_sec)
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
  const startTime = Date.now();
  const BATCH_SIZE = 20; // Procesar solo 20 pedidos a la vez
  
  try {
    console.log(`[${new Date().toISOString()}] Iniciando sincronización de pedidos`);
    console.log(`[${new Date().toISOString()}] Parámetros de búsqueda:`, { status, after, before, BATCH_SIZE });
    
    const orderStatus = status && status.trim() !== "" ? status.trim() : "on-hold";

    const params = { per_page: BATCH_SIZE, status: orderStatus };
    if (after && after.trim() !== "") params.after = after.trim();
    if (before && before.trim() !== "") params.before = before.trim();
    
    console.log(`[${new Date().toISOString()}] Parámetros enviados a WooCommerce API:`, params);

    // Medición tiempo respuesta WooCommerce
    const wooStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] 🔄 Enviando petición a WooCommerce API...`);
    
    try {
      const response = await wcApi.get("orders", params);
      const wooResponseTime = Date.now() - wooStartTime;
      
      console.log(`[${new Date().toISOString()}] ✅ WooCommerce API response recibida en ${wooResponseTime}ms`);
      console.log(`[${new Date().toISOString()}] 📊 Headers de respuesta:`, {
        'x-wp-total': response.headers['x-wp-total'],
        'x-wp-totalpages': response.headers['x-wp-totalpages'],
        'content-type': response.headers['content-type'],
        'status': response.status
      });
      
      const orders = response.data;
      console.log(`[${new Date().toISOString()}] 📦 Pedidos recibidos: ${orders.length}`);
      
      // Log detallado del primer pedido para verificar estructura
      if (orders.length > 0) {
        console.log(`[${new Date().toISOString()}] 🔍 Estructura del primer pedido:`, {
          number: orders[0].number,
          status: orders[0].status,
          date_created: orders[0].date_created,
          total: orders[0].total,
          line_items_count: orders[0].line_items?.length || 0,
          billing: {
            email: orders[0].billing?.email,
            first_name: orders[0].billing?.first_name,
            last_name: orders[0].billing?.last_name,
            city: orders[0].billing?.city
          },
          meta_data_count: orders[0].meta_data?.length || 0,
          coupon_lines_count: orders[0].coupon_lines?.length || 0
        });
        
        // Log de meta_data para debugging
        if (orders[0].meta_data && orders[0].meta_data.length > 0) {
          console.log(`[${new Date().toISOString()}] 🏷️ Meta data del primer pedido:`, 
            orders[0].meta_data.map(meta => ({ key: meta.key, value: meta.value }))
          );
        }
      }
      
      messages.push(`Se encontraron ${orders.length} pedidos en WooCommerce`);
      messages.push(`Tiempo de respuesta WooCommerce: ${wooResponseTime}ms`);

    } catch (wooError) {
      const wooErrorTime = Date.now() - wooStartTime;
      console.error(`[${new Date().toISOString()}] ❌ Error en WooCommerce API después de ${wooErrorTime}ms:`, {
        message: wooError.message,
        code: wooError.code,
        status: wooError.response?.status,
        statusText: wooError.response?.statusText,
        data: wooError.response?.data,
        headers: wooError.response?.headers
      });
      
      messages.push(`Error en WooCommerce API: ${wooError.message}`);
      throw wooError;
    }

    // Procesar cada orden con timeout individual
    for (let i = 0; i < orders.length; i++) {
      const wooOrder = orders[i];
      const orderStartTime = Date.now();
      const fac_nro_woo = wooOrder.number.trim().toLowerCase();
      
      console.log(`\n[${new Date().toISOString()}] 🔄 Procesando pedido ${i + 1}/${orders.length}: ${fac_nro_woo}`);
      console.log(`[${new Date().toISOString()}] 📋 Información del pedido:`, {
        status: wooOrder.status,
        total: wooOrder.total,
        currency: wooOrder.currency,
        payment_method: wooOrder.payment_method,
        payment_method_title: wooOrder.payment_method_title,
        line_items: wooOrder.line_items?.map(item => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          total: item.total,
          subtotal: item.subtotal
        }))
      });

      try {
        // Timeout individual para cada pedido (2 minutos máximo)
        const orderPromise = processOrder(wooOrder, messages);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout procesando pedido ${fac_nro_woo}`)), 120000);
        });

        await Promise.race([orderPromise, timeoutPromise]);
        
        const orderTotalTime = Date.now() - orderStartTime;
        console.log(`[${new Date().toISOString()}] ✅ Pedido ${fac_nro_woo} procesado exitosamente en ${orderTotalTime}ms\n`);
        
      } catch (orderError) {
        const orderErrorTime = Date.now() - orderStartTime;
        console.error(`[${new Date().toISOString()}] ❌ Error procesando pedido ${fac_nro_woo} después de ${orderErrorTime}ms:`, {
          error: orderError.message,
          stack: orderError.stack
        });
        messages.push(`Error procesando pedido ${fac_nro_woo}: ${orderError.message}`);
        continue; // Continuar con el siguiente pedido
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] 🎉 Sincronización completada. Tiempo total: ${totalTime}ms`);
    console.log(`[${new Date().toISOString()}] 📈 Resumen:`, {
      total_orders: orders.length,
      total_time: totalTime,
      average_time_per_order: Math.round(totalTime / orders.length),
      messages_count: messages.length
    });
    
    messages.push(`Sincronización completada en ${totalTime}ms`);
    return messages;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] 💥 Error fatal en sincronización después de ${totalTime}ms:`, {
      error: error.message,
      stack: error.stack,
      total_time: totalTime
    });
    messages.push(`Error en sincronización: ${error.message}`);
    return messages;
  }
};

// Función auxiliar para procesar un pedido individual
const processOrder = async (wooOrder, messages) => {
  const orderStartTime = Date.now();
  const fac_nro_woo = wooOrder.number.trim().toLowerCase();
  
  console.log(`[${new Date().toISOString()}] 🚀 Iniciando procesamiento detallado del pedido ${fac_nro_woo}`);
  
  // Medición tiempo búsqueda/creación cliente
  const clientStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] 👤 Buscando cliente por email: ${wooOrder.billing.email}`);
  
  let nit_sec = await extractNitSec(wooOrder);
  let nitIde = "";
  if (wooOrder.meta_data && Array.isArray(wooOrder.meta_data)) {
    const metaNit = wooOrder.meta_data.find(meta => meta.key === "cc_o_nit");
    if (metaNit && metaNit.value) nitIde = metaNit.value;
    console.log(`[${new Date().toISOString()}] 🆔 NIT encontrado en meta_data: ${nitIde}`);
  }
  
  nit_sec = await getNitSec(nitIde);
  const ciu_cod = await getCiuCod(wooOrder.billing.city);
  
  const clientTime = Date.now() - clientStartTime;
  console.log(`[${new Date().toISOString()}] ✅ Cliente procesado en ${clientTime}ms:`, {
    nit_sec: nit_sec,
    nit_ide: nitIde,
    ciu_cod: ciu_cod,
    email: wooOrder.billing.email
  });

  // Medición tiempo creación cliente si es necesario
  if (!nit_sec) {
    const createClientStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] 🆕 Cliente no encontrado, creando nuevo cliente...`);
    
    const newCustomer = {
      nit_ide: nitIde,
      nit_nom: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim(),
      nit_tel: wooOrder.billing.phone || '',
      nit_dir: wooOrder.billing.address_1,
      nit_email: wooOrder.billing.email,
      ciu_cod: ciu_cod || ''
    };
    
    console.log(`[${new Date().toISOString()}] 📝 Datos del nuevo cliente:`, newCustomer);

    try {
      const ObjetoNit_sec = await createNit(newCustomer);
      nit_sec = ObjetoNit_sec.nit_sec;
      const createClientTime = Date.now() - createClientStartTime;
      console.log(`[${new Date().toISOString()}] ✅ Nuevo cliente creado en ${createClientTime}ms con nit_sec: ${nit_sec}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error creación cliente: ${error.message}`);
      messages.push(`Error creando cliente para ${wooOrder.billing.email}. Se omite el pedido ${fac_nro_woo}`);
      throw error;
    }
  }

  // Medición tiempo procesamiento detalles
  const detailsStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] 📦 Procesando ${wooOrder.line_items?.length || 0} artículos del pedido...`);
  
  const detalles = await Promise.all(
    wooOrder.line_items.map(async (item, index) => {
      const artStartTime = Date.now();
      console.log(`[${new Date().toISOString()}] 🔍 Procesando artículo ${index + 1}/${wooOrder.line_items.length}: ${item.sku}`);
      
      const art_sec = await getArticuloInfo(item.sku);
      const artTime = Date.now() - artStartTime;
      console.log(`[${new Date().toISOString()}] ✅ Artículo ${item.sku} procesado en ${artTime}ms:`, {
        art_sec: art_sec,
        name: item.name,
        quantity: item.quantity,
        subtotal: item.subtotal
      });
      
      // Obtener información de promociones del artículo en la fecha del pedido
      let promocionInfo = null;
      if (art_sec) {
        const promocionStartTime = Date.now();
        promocionInfo = await getArticuloPromocionInfo(art_sec, wooOrder.date_created);
        const promocionTime = Date.now() - promocionStartTime;
        console.log(`[${new Date().toISOString()}] 🎯 Información de promociones obtenida en ${promocionTime}ms:`, {
          tiene_oferta: promocionInfo?.tiene_oferta,
          codigo_promocion: promocionInfo?.codigo_promocion,
          precio_oferta: promocionInfo?.precio_oferta,
          descuento_porcentaje: promocionInfo?.descuento_porcentaje
        });
      }
      
      // Obtener precios base del artículo (para casos donde no hay promoción o artículo no encontrado)
      let preciosBase = { precio_detal_original: 0, precio_mayor_original: 0 };
      if (art_sec) {
        const preciosStartTime = Date.now();
        preciosBase = await getArticuloPreciosBase(art_sec);
        const preciosTime = Date.now() - preciosStartTime;
        console.log(`[${new Date().toISOString()}] 💰 Precios base obtenidos en ${preciosTime}ms:`, preciosBase);
      }
      
      // Calcular precios finales
      let precioDetalFinal = 0;
      let precioMayorFinal = 0;
      
      if (art_sec && promocionInfo && promocionInfo.tiene_oferta === 'S') {
        // Usar precio de promoción
        precioDetalFinal = promocionInfo.precio_oferta;
        precioMayorFinal = promocionInfo.precio_oferta;
        console.log(`[${new Date().toISOString()}] 🎉 Aplicando precio de promoción: ${precioDetalFinal}`);
      } else if (art_sec) {
        // Usar precios base
        precioDetalFinal = preciosBase.precio_detal_original;
        precioMayorFinal = preciosBase.precio_mayor_original;
        console.log(`[${new Date().toISOString()}] 💵 Usando precios base: detal=${precioDetalFinal}, mayor=${precioMayorFinal}`);
      } else {
        console.log(`[${new Date().toISOString()}] ⚠️ Artículo no encontrado, precios en 0`);
      }
      
      return {
        art_sec,
        kar_uni: item.quantity,
        kar_pre_pub: (item.subtotal / item.quantity),
        kar_nat: 'C', // Cotizaciones NO afectan kardex (kar_nat = 'C')
        kar_lis_pre_cod: null,
        kar_kar_sec_ori: null,
        kar_fac_sec_ori: null,
        // Información de promociones para facturakardes
        kar_pre_pub_detal: precioDetalFinal,
        kar_pre_pub_mayor: precioMayorFinal,
        kar_tiene_oferta: promocionInfo ? promocionInfo.tiene_oferta : 'N',
        kar_precio_oferta: promocionInfo ? promocionInfo.precio_oferta : null,
        kar_descuento_porcentaje: promocionInfo ? promocionInfo.descuento_porcentaje : null,
        kar_codigo_promocion: promocionInfo ? promocionInfo.codigo_promocion : null,
        kar_descripcion_promocion: promocionInfo ? promocionInfo.descripcion_promocion : null
      };
    })
  );
  
  const detailsTime = Date.now() - detailsStartTime;
  console.log(`[${new Date().toISOString()}] ✅ Todos los artículos procesados en ${detailsTime}ms`);
  
  // Log para verificar que los detalles incluyen información de promociones
  const detallesConPromociones = detalles.filter(d => d.kar_tiene_oferta === 'S');
  console.log(`[${new Date().toISOString()}] 📊 Resumen de detalles:`, {
    total_detalles: detalles.length,
    con_promociones: detallesConPromociones.length,
    sin_promociones: detalles.length - detallesConPromociones.length
  });
  
  if (detallesConPromociones.length > 0) {
    console.log(`[${new Date().toISOString()}] 🎯 Artículos con promociones:`, detallesConPromociones.map(d => ({
      art_sec: d.art_sec,
      codigo_promocion: d.kar_codigo_promocion,
      precio_oferta: d.kar_precio_oferta,
      descuento_porcentaje: d.kar_descuento_porcentaje
    })));
  }

  // Medición tiempo verificación orden existente
  const checkOrderStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] 🔍 Verificando si el pedido ya existe...`);
  
  const existingOrder = await checkOrderExists(fac_nro_woo);
  let totalMayor = 0;
  
  if (existingOrder) {
    console.log(`[${new Date().toISOString()}] ✅ Pedido existente encontrado:`, {
      fac_nro: existingOrder.fac_nro,
      fac_tip_cod: existingOrder.fac_tip_cod,
      nit_sec: existingOrder.nit_sec
    });
    totalMayor = await getWholesaleTotalByOrder(existingOrder.fac_nro);
    console.log(`[${new Date().toISOString()}] 💰 Total al mayor calculado: ${totalMayor}`);
  } else {
    console.log(`[${new Date().toISOString()}] 🆕 Pedido no existe, será creado`);
  }
  
  const checkOrderTime = Date.now() - checkOrderStartTime;
  console.log(`[${new Date().toISOString()}] ✅ Verificación de pedido completada en ${checkOrderTime}ms`);

  // Medición tiempo actualización/creación orden
  const saveOrderStartTime = Date.now();
  
  if (existingOrder) {
    const isFactured = await checkIfOrderFactured(existingOrder.fac_sec);
    console.log(`[${new Date().toISOString()}] 📋 Estado de facturación: ${isFactured ? 'Facturado' : 'No facturado'}`);
    
    if (!isFactured) {
      console.log(`[${new Date().toISOString()}] 🔄 Actualizando pedido existente...`);
      await updateOrder({
        fac_nro: existingOrder.fac_nro,
        fac_tip_cod: existingOrder.fac_tip_cod,
        fac_nro_woo,
        nit_sec: existingOrder.nit_sec,
        fac_obs: wooOrder.coupon_lines?.length ? `Cupón: ${wooOrder.coupon_lines.map(c => c.code).join(", ")}` : "",
        fac_fec: wooOrder.date_created,
        fac_est_fac: 'A',
        detalles,
        descuento: wooOrder.coupon_lines?.[0]?.meta_data?.find(m => m.key === "coupon_data")?.value?.amount || 0
      });
      const updateTime = Date.now() - saveOrderStartTime;
      console.log(`[${new Date().toISOString()}] ✅ Pedido actualizado en ${updateTime}ms`);
    } else {
      console.log(`[${new Date().toISOString()}] ⚠️ Pedido ya facturado, no se puede actualizar`);
    }
  } else {
    console.log(`[${new Date().toISOString()}] 🆕 Creando nuevo pedido...`);
    await createCompleteOrder({
      nit_sec,
      fac_usu_cod_cre: wooOrder.customer_id?.toString() || '',
      fac_tip_cod: "COT",
      fac_nro_woo,
      fac_obs: wooOrder.coupon_lines?.length ? `Cupón: ${wooOrder.coupon_lines.map(c => c.code).join(", ")}` : "",
      detalles,
      descuento: wooOrder.coupon_lines?.[0]?.meta_data?.find(m => m.key === "coupon_data")?.value?.amount || 0,
      fac_fec: wooOrder.date_created,
      lis_pre_cod: totalMayor > 100000 ? 2 : 1
    });
    const createTime = Date.now() - saveOrderStartTime;
    console.log(`[${new Date().toISOString()}] ✅ Nuevo pedido creado en ${createTime}ms`);
  }
  
  const totalOrderTime = Date.now() - orderStartTime;
  console.log(`[${new Date().toISOString()}] 🎉 Pedido ${fac_nro_woo} procesado completamente en ${totalOrderTime}ms`);
};

module.exports = { syncWooOrders };