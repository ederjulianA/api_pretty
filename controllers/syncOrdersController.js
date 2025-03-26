import { syncWooOrders } from "../jobs/syncWooOrders.js";

const syncOrdersEndpoint = async (req, res) => {
  try {
    // Extraer parámetros: status, after y before
    const { status, after, before } = req.query;
    const messages = await syncWooOrders(status, after, before);
    return res.json({ success: true, messages });
  } catch (error) {
    console.error("Error en la sincronización de pedidos:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { syncOrdersEndpoint };
