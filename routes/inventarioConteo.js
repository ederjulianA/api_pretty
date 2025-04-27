const express = require('express');
const router = express.Router();
const InventarioConteoController = require('../controllers/inventarioConteoController');

// Crear un nuevo conteo
router.post('/', InventarioConteoController.crearConteo);

// Agregar detalle a un conteo
router.post('/detalle', InventarioConteoController.agregarDetalleConteo);

// Eliminar detalle de un conteo
router.delete('/:conteo_id/detalle/:articulo_codigo', InventarioConteoController.eliminarDetalleConteo);

// Obtener un conteo específico
router.get('/:id', InventarioConteoController.obtenerConteo);

// Actualizar estado de un conteo
router.patch('/:id/estado', InventarioConteoController.actualizarEstadoConteo);

// Listar conteos con filtros
router.get('/', InventarioConteoController.listarConteos);

// Actualizar cantidad de un detalle
router.patch('/:conteo_id/detalle/:articulo_codigo/cantidad', InventarioConteoController.actualizarCantidadDetalle);

// Buscar en el detalle del conteo
router.get('/:conteo_id/detalle/buscar', InventarioConteoController.buscarDetalleConteo);

// Verificar si un artículo está en el detalle del conteo
router.get('/:conteoId/detalle/verificar/:codigoArticulo', InventarioConteoController.verificarArticuloEnDetalle);

module.exports = router; 