// controllers/salesController.js
import { getSalesSummary } from "../models/salesModel.js";

const getSalesEndpoint = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, error: "start_date y end_date son requeridos en formato YYYY-MM-DD" });
    }
    // Validar que las fechas sean válidas
    if (isNaN(Date.parse(start_date)) || isNaN(Date.parse(end_date))) {
      return res.status(400).json({ success: false, error: "start_date o end_date no son fechas válidas." });
    }
    const salesSummary = await getSalesSummary(start_date, end_date);
    return res.json({ success: true, ...salesSummary });
  } catch (error) {
    console.error("Error obteniendo resumen de ventas:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { getSalesEndpoint };
