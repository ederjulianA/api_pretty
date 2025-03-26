// routes/confirmOrderRoutes.js
import express from "express";
import { confirmOrderEndpoint } from "../controllers/confirmOrderController.js";

const router = express.Router();

// Endpoint para confirmar el pedido y actualizar estado y stock en WooCommerce
// Ejemplo: PUT /api/confirmOrder/12345
router.put("/:fac_nro_woo", confirmOrderEndpoint);

export default router;
