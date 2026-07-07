import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';
import {
  listarCategoriasWoo,
  asignarCategoriaPromocion,
  quitarCategoriaPromocion,
} from '../controllers/wooCategoriaController.js';

const router = express.Router();

router.get('/categorias', verifyToken, listarCategoriasWoo);
router.post('/promo/:pro_sec/asignar-categoria', verifyToken, asignarCategoriaPromocion);
router.post('/promo/:pro_sec/quitar-categoria', verifyToken, quitarCategoriaPromocion);

export default router;
