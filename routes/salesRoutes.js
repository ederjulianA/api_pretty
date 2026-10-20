// routes/salesRoutes.js
import express from "express";
import { getSalesEndpoint } from "../controllers/salesController.js";
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get("/", verifyToken, getSalesEndpoint);

export default router;
