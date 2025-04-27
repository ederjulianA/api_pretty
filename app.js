import express from 'express';
import wooRoutes from './routes/woo.js';

const app = express();

// Middleware para parsear JSON
app.use(express.json());

// Rutas
app.use('/api/woo', wooRoutes);

// ... resto del código ... 