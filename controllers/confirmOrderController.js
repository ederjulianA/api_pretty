// controllers/confirmOrderController.js
import { updateWooOrderStatusAndStock } from "../jobs/updateWooOrderStatusAndStock.js";

const confirmOrderEndpoint = async (req, res) => {
  try {
    const { fac_nro_woo } = req.params;
    const { orderDetails } = req.body; // Se espera que sea un arreglo de objetos con art_sec y art_woo_id
    if (!fac_nro_woo || !orderDetails || !Array.isArray(orderDetails)) {
      return res.status(400).json({ success: false, error: "Debe proporcionar fac_nro_woo en la URL y un arreglo orderDetails en el cuerpo." });
    }
    const messages = await updateWooOrderStatusAndStock(fac_nro_woo, orderDetails);
    return res.json({ success: true, messages });
  } catch (error) {
    console.error("Error en confirmOrderEndpoint:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { confirmOrderEndpoint };
