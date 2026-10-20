const express = require('express');
const router = express.Router();
const InventarioConteoController = require('../controllers/inventarioConteoController');
const verifyToken = require('../middlewares/auth');

// Crear un nuevo conteo
router.post('/', verifyToken, InventarioConteoController.crearConteo);

// Agregar detalle a un conteo
router.post('/detalle', verifyToken, InventarioConteoController.agregarDetalleConteo);

// Eliminar detalle de un conteo
router.delete('/:conteo_id/detalle/:articulo_codigo', verifyToken, InventarioConteoController.eliminarDetalleConteo);

// Obtener un conteo específico
router.get('/:id', verifyToken, InventarioConteoController.obtenerConteo);

// Actualizar estado de un conteo
router.patch('/:id/estado', verifyToken, InventarioConteoController.actualizarEstadoConteo);

// Listar conteos con filtros
router.get('/', verifyToken, InventarioConteoController.listarConteos);

// Actualizar cantidad de un detalle
router.patch('/:conteo_id/detalle/:articulo_codigo/cantidad', verifyToken, InventarioConteoController.actualizarCantidadDetalle);

// Buscar en el detalle del conteo
router.get('/:conteo_id/detalle/buscar', verifyToken, InventarioConteoController.buscarDetalleConteo);

// Verificar si un artículo está en el detalle del conteo
router.get('/:conteoId/detalle/verificar/:codigoArticulo', verifyToken, InventarioConteoController.verificarArticuloEnDetalle);

module.exports = router; 