// controllers/inventoryAdjustmentController.js
import { createInventoryAdjustment } from "../models/orderModel.js";

const createInventoryAdjustmentEndpoint = async (req, res) => {
  try {
    const { nit_sec, fac_usu_cod_cre, detalles, descuento, lis_pre_cod, actualiza_fecha } = req.body;
    if (!nit_sec || !fac_usu_cod_cre || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ success: false, error: "Faltan parámetros requeridos." });
    }
    // Aquí se fuerza fac_tip_cod a 'AJT' para ajustes de inventario.
    const data = { 
      nit_sec, 
      fac_usu_cod_cre, 
      detalles, 
      descuento, 
      lis_pre_cod, 
      actualiza_fecha,
      fac_fec: new Date().toISOString().split('T')[0] // Agregamos la fecha actual si no se proporciona
    };
    const result = await createInventoryAdjustment(data);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error creando ajuste de inventario:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { createInventoryAdjustmentEndpoint };
