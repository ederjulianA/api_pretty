// controllers/orderController.js
const orderModel = require('../models/orderModel');

const createCompleteOrder = async (req, res) => {
  try {
    const { nit_sec, fac_tip_cod, detalles } = req.body;

    // Validar que se envíe el nit del cliente y al menos un detalle
    if (!nit_sec || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ error: "Debe enviar 'nit_sec' y un arreglo no vacío de 'detalles'." });
    }

    const result = await orderModel.createCompleteOrder({ nit_sec, fac_tip_cod, detalles });
    res.status(201).json({
      success: true,
      fac_sec: result.fac_sec,
      fac_nro: result.fac_nro,
      message: "Orden creada exitosamente."
    });
  } catch (error) {
    console.error("Error al crear la orden completa:", error);
    res.status(500).json({success:false, error: error.message });
  }
};

module.exports = { createCompleteOrder };
