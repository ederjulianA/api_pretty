import express from 'express';
import wooRoutes from './routes/woo.js';
import logger from './config/logger.js';

const app = express();

// Middleware para parsear JSON
app.use(express.json());

// Middleware de logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  next();
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url
  });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Rutas
app.use('/api/woo', wooRoutes);

export default app; 