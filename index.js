// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fileUpload from "express-fileupload";
import wooRoutes from './routes/woo.js';
import updateWooStockRoutes from './routes/updateWooStockRoutes.js';
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
// Nota: Verifica si 'crearArticuloRoutes' y 'editarArticuloRoutes' deben provenir de rutas distintas.
// En este ejemplo se usan desde "articulosRoutes.js" pero podrías ajustarlo según tu estructura.
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

app.use(express.json());
app.use(cors());
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file(s) size
  },
}));

app.use("/api/categorias", inventarioGrupoRoutes);
app.use("/api/articulos", articulosRoutes);
app.use("/api/nits", nitsRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/auth", authRoutes);
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
app.use('/api/woo', wooRoutes);
app.use('/api/updateWooStock', updateWooStockRoutes);
app.get("/", (req, res) => {
  res.send("API Working");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
