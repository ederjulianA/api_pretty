// routes/salesRoutes.js
import express from "express";
import { getSalesEndpoint } from "../controllers/salesController.js";

const router = express.Router();

router.get("/", getSalesEndpoint);

export default router;
