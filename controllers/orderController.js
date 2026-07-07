// controllers/orderController.js
const orderModel = require('../models/orderModel');
const { getOrdenes, updateOrder, anularDocumento } = require('../models/orderModel');
const bundleModel = require('../models/bundleModel.js');
const { poolPromise, sql } = require('../db.js');

/**
 * Valida stock de bundles antes de crear la orden (pre-transacción).
 * Referencia: implementaciones_2026/articulos_bundle/
 */
const validarBundles = async (detalles) => {
  if (!detalles?.length) return;
  const pool = await poolPromise;
  const artSecs = [...new Set(detalles.map(d => d.art_sec).filter(Boolean))];
  if (!artSecs.length) return;

  const request = pool.request();
  artSecs.forEach((sec, i) => request.input(`p${i}`, sql.VarChar(30), sec));
  const bundles = await request.query(`
    SELECT art_sec, art_bundle, art_nom
    FROM dbo.articulos
    WHERE art_sec IN (${artSecs.map((_, i) => `@p${i}`).join(',')})
  `);

  const esBundle = {};
  (bundles.recordset || []).forEach(row => {
    esBundle[String(row.art_sec)] = row.art_bundle === 'S' ? row.art_nom : false;
  });

  for (const detalle of detalles) {
    const nom = esBundle[String(detalle.art_sec)];
    if (!nom) continue;
    const cantidad = parseInt(detalle.kar_uni, 10) || 1;
    const validacion = await bundleModel.validateBundleStock(detalle.art_sec, cantidad);
    if (!validacion.puede_vender) {
      const detalleMsg = validacion.detalles?.filter(d => !d.cumple).map(d =>
        `${d.art_nom}: necesita ${d.cantidad_necesaria}, tiene ${d.stock_disponible}`
      ).join('; ');
      throw new Error(`Stock insuficiente para el bundle "${nom}": ${detalleMsg || validacion.mensaje}`);
    }
  }
};


const validarExistenciasVTA = async (detalles) => {
  if (!detalles?.length) return;
  const pool = await poolPromise;

  const artSecs = [...new Set(detalles.map(d => d.art_sec).filter(Boolean))];
  if (!artSecs.length) return;

  const request = pool.request();
  artSecs.forEach((sec, i) => request.input(`p${i}`, sql.VarChar(30), sec));

  // Excluir bundles padre — su stock se valida por componentes en validarBundles()
  const result = await request.query(`
    SELECT a.art_sec, a.art_cod, a.art_nom, ISNULL(e.existencia, 0) AS existencia
    FROM dbo.articulos a
    LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
    WHERE a.art_sec IN (${artSecs.map((_, i) => `@p${i}`).join(',')})
      AND ISNULL(a.art_bundle, 'N') != 'S'
      AND ISNULL(e.existencia, 0) <= 0
  `);

  if (result.recordset.length > 0) {
    const lista = result.recordset.map(r => `${r.art_nom} (${r.art_cod})`).join(', ');
    const err = new Error(`No se puede generar la factura. Los siguientes artículos no tienen existencia: ${lista}`);
    err.statusCode = 400;
    throw err;
  }
};


const updateOrderEndpoint = async (req, res) => {
  try {
    const { fac_nro } = req.params;
    const { fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento, fac_nro_woo, fac_obs, fac_descuento_general, fac_est_woo } = req.body;

    if (!fac_nro || !fac_tip_cod || !nit_sec || !fac_est_fac || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Se deben proporcionar fac_nro (por URL), fac_tip_cod, nit_sec, fac_est_fac y un arreglo no vacío de detalles en el cuerpo."
      });
    }

    if (fac_tip_cod === 'VTA') {
      await validarExistenciasVTA(detalles);
    }

    // Se espera que cada ítem de details tenga: art_sec, kar_uni, precio_de_venta y kar_lis_pre_cod
    const result = await updateOrder({ fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento, fac_nro_woo, fac_obs, fac_descuento_general, fac_est_woo });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error al actualizar el pedido:", error);
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

const createCompleteOrder = async (req, res) => {
  try {
    const { nit_sec, fac_usu_cod_cre, fac_tip_cod, detalles, descuento, lis_pre_cod, fac_nro_woo, fac_obs, fac_descuento_general, fac_fec } = req.body;
    console.log(req.body);
    // Validar que se envíe el nit del cliente y al menos un detalle
    if (!nit_sec || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ error: "Debe enviar 'nit_sec' y un arreglo no vacío de 'detalles'." });
    }

    if (fac_tip_cod !== 'COT') {
      await validarBundles(detalles);
    }

    if (fac_tip_cod === 'VTA') {
      await validarExistenciasVTA(detalles);
    }

    const result = await orderModel.createCompleteOrder({ nit_sec, fac_usu_cod_cre, fac_tip_cod, detalles, descuento, lis_pre_cod, fac_nro_woo, fac_obs, fac_descuento_general, fac_fec });
    res.status(201).json({
      success: true,
      fac_sec: result.fac_sec,
      fac_nro: result.fac_nro,
      message: "Orden creada exitosamente."
    });
  } catch (error) {
    console.error("Error al crear la orden completa:", error);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

const getOrder = async (req, res) => {
  try {
    const { fac_nro } = req.params;

    if (!fac_nro) {
      return res.status(400).json({ success: false, error: "El parámetro 'fac_nro' es requerido." });
    }

    const order = await orderModel.getOrder(fac_nro);
    return res.json({ success: true, order });
  } catch (error) {
    console.error("Error al obtener pedido:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getOrdenesEndpoint = async (req, res) => {
  try {
    const {
      FechaDesde,
      FechaHasta,
      nit_ide,
      nit_nom,
      fac_nro,
      fac_nro_woo,
      fac_est_fac,
      PageNumber,
      PageSize,
      fue_cod,
      fac_usu_cod_cre
    } = req.query;

    // Validar que se provean FechaDesde y FechaHasta
    if (!FechaDesde || !FechaHasta) {
      return res.status(400).json({ success: false, error: "Se deben proporcionar FechaDesde y FechaHasta." });
    }

    // Convertir los parámetros de paginación a números, con valores por defecto
    const pageNumber = PageNumber ? parseInt(PageNumber, 10) : 1;
    const pageSize = PageSize ? parseInt(PageSize, 10) : 50;

    const ordenes = await getOrdenes({
      FechaDesde,
      FechaHasta,
      nit_ide: nit_ide || null,
      nit_nom: nit_nom || null,
      fac_nro: fac_nro || null,
      fac_nro_woo: fac_nro_woo || null,
      fac_est_fac: fac_est_fac || null,
      fue_cod: fue_cod || null,
      PageNumber: pageNumber,
      PageSize: pageSize,
      fac_usu_cod_cre: fac_usu_cod_cre || null
    });

    return res.json({ success: true, ordenes });
  } catch (error) {
    console.error("Error al obtener órdenes:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const anularDocumentoEndpoint = async (req, res) => {
  try {
    const { fac_nro, fac_tip_cod, fac_obs } = req.body;

    // Validar campos requeridos
    if (!fac_nro || !fac_tip_cod || !fac_obs) {
      return res.status(400).json({
        success: false,
        error: "Todos los campos son requeridos: fac_nro, fac_tip_cod, fac_obs"
      });
    }

    // Validar que fac_tip_cod sea válido
    const tiposValidos = ['VTA', 'AJT', 'PED', 'COT']; // Agregar otros tipos válidos si existen
    if (!tiposValidos.includes(fac_tip_cod)) {
      return res.status(400).json({
        success: false,
        error: "Tipo de documento no válido"
      });
    }

    const result = await anularDocumento({
      fac_nro,
      fac_tip_cod,
      fac_obs
    });

    return res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error(`Error en anularDocumentoEndpoint: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = { createCompleteOrder, getOrder, getOrdenesEndpoint, updateOrderEndpoint, anularDocumentoEndpoint };