// index.js
import express from "express";
import cors from "cors";
import path from 'path';
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/uploadRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

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
// Servir archivos estáticos desde el directorio uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Rutas
// Example Postman request:
// POST http://localhost:3000/api/images
// Headers:
//   - No special headers needed
// Body:
//   - Form-data
//   - Key: images (type: file)
//   - Select up to 5 image files (jpg, png, gif)
// Response:
// {
//   "message": "Imágenes subidas exitosamente",
//   "images": [
//     {
//       "filename": "1234567890-123456789.jpg",
//       "path": "/uploads/1234567890-123456789.jpg",
//       "fullUrl": "http://localhost:3000/uploads/1234567890-123456789.jpg"
//     }
//   ]
// }
app.use('/api', uploadRoutes);

// Manejo de errores para multer
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'El archivo es demasiado grande. Máximo 5MB permitido'
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'Demasiados archivos. Máximo 5 archivos permitidos'
    });
  }
  next(err);
});

app.get("/", (req, res) => {
  res.send("API Working");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
