// index.js //COMMENT FOR UPDATE REPO
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fileUpload from "express-fileupload";
import { createRequire } from 'module';
import wooRoutes from './routes/woo.js';
import updateWooStockRoutes from './routes/updateWooStockRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import wooSyncRoutes from './routes/wooSyncRoutes.js';
import syncWooOrdersRoutes from './routes/syncWooOrdersRoutes.js';
import wooCategoriaRoutes from './routes/wooCategoriaRoutes.js';
import documentoInventarioRoutes from './routes/documentoInventarioRoutes.js';
dotenv.config();

// Import CommonJS modules
const require = createRequire(import.meta.url);
const cargaCostosRoutes = require('./routes/cargaCostosRoutes.js');
const compraRoutes = require('./routes/compraRoutes.js');
const bundleRoutes = require('./routes/bundleRoutes.js');
const rentabilidadRoutes = require('./routes/rentabilidadRoutes.js');
const ventasKpiRoutes = require('./routes/ventasKpiRoutes.js');
const auditiaFacturasRoutes = require('./routes/auditiaFacturasRoutes.js');
const cierreMesRoutes = require('./routes/cierreMesRoutes.js');
const authAudit = require('./middlewares/authAudit.js');
const helmet = require('helmet');
// const aiRoutes = require('./routes/aiRoutes.js'); // Comentado temporalmente - archivos no en repo

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
import diagnosticRoutes from './routes/diagnosticRoutes.js';
import eventoPromocionalRoutes from './routes/eventoPromocionalRoutes.js';
import variableProductRoutes from './routes/variableProductRoutes.js';

// Middleware

// Cabeceras de seguridad (SEC-04). Va lo primero para que cubra tambien las
// respuestas de error de los middlewares que vienen despues.
app.use(helmet({
  // La API solo devuelve JSON y un texto plano en '/': no sirve HTML ni
  // estaticos, asi que una CSP no protege de nada aqui y solo puede estorbar.
  contentSecurityPolicy: false,
  // HSTS sobre HTTP es ruido: los navegadores lo ignoran si no hay TLS, y
  // anunciarlo da una falsa sensacion de seguridad en una auditoria. Activar
  // cuando SEC-27 ponga el reverse proxy con certificado delante.
  strictTransportSecurity: false,
}));
// helmet ya elimina X-Powered-By, pero se deja explicito por si algun dia se
// cambia su configuracion: la cabecera revela el stack sin ninguna necesidad.
app.disable('x-powered-by');

app.use(express.json());

// CORS restringido (SEC-02). Antes era app.use(cors()), que emite
// Access-Control-Allow-Origin: * y deja que cualquier web haga peticiones a
// esta API desde el navegador de un empleado.
//
// El frontend NO depende de esto: tanto en produccion (rewrite de Vercel)
// como en desarrollo (proxy de Vite) las peticiones a /api las reenvia el
// servidor, no el navegador, asi que nunca son cross-origin.
//
// Las peticiones SIN cabecera Origin (server-to-server, curl, Postman, jobs,
// health checks) se dejan pasar: CORS es una proteccion del navegador y no
// aplica ahi. Bloquearlas romperia integraciones sin aportar seguridad, ya
// que un atacante no puede omitir el Origin desde un navegador.
// Incluye el dominio real del frontend para que la API siga sirviendo al
// front aunque falte CORS_ORIGINS en el .env del servidor. La variable
// sigue mandando cuando esta definida.
const CORS_ORIGINS_DEFAULT = 'https://pretty-front.vercel.app,http://localhost:5173,http://localhost:5174';
const origenesPermitidos = (process.env.CORS_ORIGINS || CORS_ORIGINS_DEFAULT)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origenesPermitidos.includes(origin)) return callback(null, true);
    // Se rechaza sin lanzar error: no se emiten las cabeceras CORS y el
    // navegador bloquea. Devolver un error aqui convertiria cada sonda en
    // un 500. Se registra para que un bloqueo inesperado sea diagnosticable.
    console.warn(`[CORS] Origen no permitido: ${origin}`);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-access-token', 'Authorization', 'Accept'],
}));
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file(s) size
  },
}));

// Auditoria de autenticacion (SEC-00) — solo registra, no bloquea nada.
// Instrumentacion temporal para decidir con evidencia que endpoints se pueden
// proteger sin romper produccion. Ver revision_seguridad/plan/.
app.use(authAudit);

// Rutas
app.use("/api/woo", wooRoutes);
app.use("/api/woo", wooSyncRoutes);
app.use("/api/woo", syncWooOrdersRoutes);
app.use("/api/woo", wooCategoriaRoutes);
app.use("/api/inventory-differences", inventoryDifferenceRoutes);
app.get("/api/woo/test", (req, res) => {
  res.json({ message: "WooCommerce router is working" });
});

app.use("/api/categorias", inventarioGrupoRoutes);
app.use("/api/articulos/variable", variableProductRoutes);
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
app.use("/api/diagnostic", diagnosticRoutes);
app.use("/api/eventos-promocionales", eventoPromocionalRoutes);
app.use("/api/carga-costos", cargaCostosRoutes);
app.use("/api/compras", compraRoutes);
app.use("/api/bundles", bundleRoutes);
app.use("/api/reportes", rentabilidadRoutes);
app.use("/api/dashboard/ventas", ventasKpiRoutes);
app.use("/api/auditoria/facturas", auditiaFacturasRoutes);
app.use("/api/cierre-mes", cierreMesRoutes);
// app.use("/api", aiRoutes); // Comentado temporalmente - archivos no en repo
app.get("/", (req, res) => {
  res.send("API Working");
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Escuchar en todas las interfaces de red

app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en ${HOST}:${PORT}`);
  console.log(`Accesible desde: http://localhost:${PORT}`);
});
