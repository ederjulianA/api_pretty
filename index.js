// index.js //COMMENT FOR UPDATE REPO
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fileUpload from "express-fileupload";
import wooRoutes from './routes/woo.js';
import updateWooStockRoutes from './routes/updateWooStockRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import wooSyncRoutes from './routes/wooSyncRoutes.js';
import syncWooOrdersRoutes from './routes/syncWooOrdersRoutes.js';
import documentoInventarioRoutes from './routes/documentoInventarioRoutes.js';
dotenv.config();

const app = express();

import inventarioGrupoRoutes from "./routes/inventarioGrupoRoutes.js";
import articulosRoutes from "./routes/articulosRoutes.js";
import nitsRoutes from "./routes/nitsRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import parametrosRoutes from "./routes/parametrosRoutes.js";
import ciudadesRoutes from "./routes/ciudadesRoutes.js";
import inventarioSubgrupoRoutes from "./routes/inventarioSubgrupoRoutes.js";
import crearArticuloRoutes from "./routes/articulosRoutes.js";
import editarArticuloRoutes from "./routes/articulosRoutes.js";
import consultarArticuloByArtCodRoutes from "./routes/articulosRoutes.js";
import ordenesRoutes from "./routes/orderRoutes.js";
import syncOrdersRoutes from "./routes/syncOrdersRoutes.js";
import confirmOrderRoutes from "./routes/confirmOrderRoutes.js";
import inventoryRoutes from './routes/inventoryRoutes.js';
import salesRoutes from "./routes/salesRoutes.js";
import proveedorRoutes from './routes/proveedorRoutes.js';
import testSyncRoutes from './routes/testSyncRoutes.js';
import kardexRoutes from './routes/kardexRoutes.js';
import inventoryComparisonRoutes from './routes/inventoryComparisonRoutes.js';
import inventarioConteoRoutes from './routes/inventarioConteo.js';
import userRoutes from './routes/userRoutes.js';
import inventoryDifferenceRoutes from './routes/inventoryDifferenceRoutes.js';
import productPhotoRoutes from './routes/productPhotoRoutes.js';
import promocionRoutes from './routes/promocionRoutes.js';

// Middleware
app.use(express.json());
app.use(cors());
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file(s) size
  },
}));

// Rutas
app.use("/api/woo", wooRoutes);
app.use("/api/woo", wooSyncRoutes);
app.use("/api/woo", syncWooOrdersRoutes);
app.use("/api/inventory-differences", inventoryDifferenceRoutes);
app.get("/api/woo/test", (req, res) => {
  res.json({ message: "WooCommerce router is working" });
});

app.use("/api/categorias", inventarioGrupoRoutes);
app.use("/api/articulos", articulosRoutes);
app.use("/api/nits", nitsRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/parametros", parametrosRoutes);
app.use("/api/ciudades", ciudadesRoutes);
app.use("/api/subcategorias", inventarioSubgrupoRoutes);
app.use("/api/crearArticulo", crearArticuloRoutes);
app.use("/api/editarArticulo", editarArticuloRoutes);
app.use("/api/ordenes", ordenesRoutes);
app.use("/api/syncOrders", syncOrdersRoutes);
app.use("/api/confirmOrder", confirmOrderRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/consultarArticuloByArtCod", consultarArticuloByArtCodRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api', proveedorRoutes);
app.use('/api/test', testSyncRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/inventory-comparison', inventoryComparisonRoutes);
app.use('/api/inventario-conteo', inventarioConteoRoutes);
app.use('/api/updateWooStock', updateWooStockRoutes);
app.use("/api/users", userRoutes);
app.use('/api', documentoInventarioRoutes);
app.use("/api/productos", productPhotoRoutes);
app.use("/api/promociones", promocionRoutes);
app.get("/", (req, res) => {
  res.send("API Working");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
