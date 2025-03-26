import { syncWooOrders } from "../jobs/syncWooOrders.js";

const syncOrdersEndpoint = async (req, res) => {
  try {
    const messages = await syncWooOrders();
    return res.json({ success: true, messages });
  } catch (error) {
    console.error("Error en la sincronización de pedidos:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { syncOrdersEndpoint };
