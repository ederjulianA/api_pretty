const InventarioConteo = require('../models/inventarioConteo');

class InventarioConteoController {
    static async crearConteo(req, res) {
        try {
            const { fecha, usuario, bodega } = req.body;
            const conteo = await InventarioConteo.crearConteo({
                fecha: fecha || new Date(),
                usuario,
                bodega
            });
            res.status(201).json({
                success: true,
                data: conteo
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    static async agregarDetalleConteo(req, res) {
        try {
            const { conteo_id, articulo_codigo, cantidad_fisica } = req.body;

            // Obtener cantidad del sistema
            const cantidad_sistema = await InventarioConteo.obtenerCantidadSistema(articulo_codigo);

            // Calcular diferencia
            const diferencia = cantidad_fisica - cantidad_sistema;

            const detalle = await InventarioConteo.agregarDetalleConteo({
                conteo_id,
                articulo_codigo,
                cantidad_sistema,
                cantidad_fisica,
                diferencia
            });

            res.status(201).json({
                success: true,
                data: detalle
            });
        } catch (error) {
            res.status(200).json({
                success: false,
                error: error.message
            });
        }
    }

    static async obtenerConteo(req, res) {
        try {
            const { id } = req.params;
            const conteo = await InventarioConteo.obtenerConteo(id);

            if (!conteo) {
                return res.status(404).json({
                    success: false,
                    error: 'Conteo no encontrado'
                });
            }

            res.status(200).json({
                success: true,
                data: conteo
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    static async actualizarEstadoConteo(req, res) {
        try {
            const { id } = req.params;
            const { estado, fecha } = req.body;

            if (!estado) {
                return res.status(400).json({
                    success: false,
                    error: 'El estado es requerido'
                });
            }

            const rowsAffected = await InventarioConteo.actualizarEstadoConteo(id, estado, fecha);

            res.status(200).json({
                success: true,
                data: {
                    message: 'Estado actualizado exitosamente',
                    rowsAffected: rowsAffected
                }
            });
        } catch (error) {
            if (error.message === 'Conteo no encontrado') {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    static async listarConteos(req, res) {
        try {
            const { bodega, estado } = req.query;
            const conteos = await InventarioConteo.listarConteos({ bodega, estado });

            res.status(200).json({
                success: true,
                data: conteos
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    static async eliminarDetalleConteo(req, res) {
        try {
            const { conteo_id, articulo_codigo } = req.params;

            const resultado = await InventarioConteo.eliminarDetalleConteo(conteo_id, articulo_codigo);

            res.status(200).json({
                success: true,
                data: {
                    message: 'Detalle eliminado exitosamente',
                    rowsAffected: resultado
                }
            });
        } catch (error) {
            res.status(200).json({
                success: false,
                error: error.message
            });
        }
    }

    static async actualizarCantidadDetalle(req, res) {
        try {
            const { conteo_id, articulo_codigo } = req.params;
            const { cantidad_fisica } = req.body;

            if (!cantidad_fisica && cantidad_fisica !== 0) {
                return res.status(400).json({
                    success: false,
                    error: 'La cantidad física es requerida'
                });
            }

            const rowsAffected = await InventarioConteo.actualizarCantidadDetalle(
                conteo_id,
                articulo_codigo,
                cantidad_fisica
            );

            res.status(200).json({
                success: true,
                data: {
                    message: 'Cantidad actualizada exitosamente',
                    rowsAffected: rowsAffected
                }
            });
        } catch (error) {
            res.status(200).json({
                success: false,
                error: error.message
            });
        }
    }

    static async buscarDetalleConteo(req, res) {
        try {
            const { conteo_id } = req.params;
            const { nombre, codigo, pageNumber, pageSize } = req.query;

            const resultado = await InventarioConteo.buscarDetalleConteo(conteo_id, {
                nombre,
                codigo,
                pageNumber,
                pageSize
            });

            res.status(200).json({
                success: true,
                ...resultado
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = InventarioConteoController; 