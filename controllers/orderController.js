// controllers/orderController.js
const orderModel = require('../models/orderModel');
const { getOrdenes, updateOrder, anularDocumento } = require('../models/orderModel');


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

    // Se espera que cada ítem de details tenga: art_sec, kar_uni, precio_de_venta y kar_lis_pre_cod
    const result = await updateOrder({ fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento, fac_nro_woo, fac_obs, fac_descuento_general, fac_est_woo });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error al actualizar el pedido:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const createCompleteOrder = async (req, res) => {
  try {
    const { nit_sec, fac_usu_cod_cre, fac_tip_cod, detalles, descuento, lis_pre_cod, fac_nro_woo, fac_obs, fac_descuento_general } = req.body;
    console.log(req.body);
    // Validar que se envíe el nit del cliente y al menos un detalle
    if (!nit_sec || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ error: "Debe enviar 'nit_sec' y un arreglo no vacío de 'detalles'." });
    }

    const result = await orderModel.createCompleteOrder({ nit_sec, fac_usu_cod_cre, fac_tip_cod, detalles, descuento, lis_pre_cod, fac_nro_woo, fac_obs, fac_descuento_general });
    res.status(201).json({
      success: true,
      fac_sec: result.fac_sec,
      fac_nro: result.fac_nro,
      message: "Orden creada exitosamente."
    });
  } catch (error) {
    console.error("Error al crear la orden completa:", error);
    res.status(500).json({ success: false, error: error.message });
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