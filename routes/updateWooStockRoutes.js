import express from "express";
import { updateWooStockEndpoint } from "../controllers/updateWooStockController.js";

const router = express.Router();

// Endpoint para actualizar el stock de un artículo en WooCommerce
// Ejemplo: PUT /api/updateWooStock/ART-001
router.put("/:art_cod", updateWooStockEndpoint);

export default router; 