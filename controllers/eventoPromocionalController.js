// controllers/eventoPromocionalController.js
import {
    crearEventoPromocional,
    actualizarEventoPromocional,
    obtenerEventosPromocionales,
    obtenerEventoPromocionalPorId,
    obtenerEventoActivo
} from '../models/eventoPromocionalModel.js';

/**
 * Crea un nuevo evento promocional
 * POST /api/eventos-promocionales
 */
const crearEvento = async (req, res) => {
    try {
        const { nombre, fecha_inicio, fecha_fin, descuento_detal, descuento_mayor, monto_mayorista_minimo, activo, observaciones } = req.body;
        
        // Validar campos requeridos
        if (!nombre || !fecha_inicio || !fecha_fin || descuento_detal === undefined || descuento_mayor === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: nombre, fecha_inicio, fecha_fin, descuento_detal, descuento_mayor'
            });
        }
        
        // Validar monto mayorista mínimo si se proporciona
        if (monto_mayorista_minimo !== undefined && parseFloat(monto_mayorista_minimo) < 0) {
            return res.status(400).json({
                success: false,
                message: 'El monto mayorista mínimo debe ser mayor o igual a 0'
            });
        }
        
        // Obtener usuario de la sesión si está disponible
        const usuario = req.user ? req.user.usu_cod : 'SISTEMA';
        
        const resultado = await crearEventoPromocional({
            nombre,
            fecha_inicio,
            fecha_fin,
            descuento_detal: parseFloat(descuento_detal),
            descuento_mayor: parseFloat(descuento_mayor),
            monto_mayorista_minimo: monto_mayorista_minimo !== undefined ? parseFloat(monto_mayorista_minimo) : null,
            activo: activo || 'S',
            observaciones,
            usuario
        });
        
        res.status(201).json(resultado);
    } catch (error) {
        console.error('Error al crear evento promocional:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Actualiza un evento promocional existente
 * PUT /api/eventos-promocionales/:eve_sec
 */
const actualizarEvento = async (req, res) => {
    try {
        const { eve_sec } = req.params;
        const { nombre, fecha_inicio, fecha_fin, descuento_detal, descuento_mayor, monto_mayorista_minimo, activo, observaciones } = req.body;
        
        if (!eve_sec) {
            return res.status(400).json({
                success: false,
                message: 'El ID del evento (eve_sec) es requerido'
            });
        }
        
        // Validar monto mayorista mínimo si se proporciona
        if (monto_mayorista_minimo !== undefined && parseFloat(monto_mayorista_minimo) < 0) {
            return res.status(400).json({
                success: false,
                message: 'El monto mayorista mínimo debe ser mayor o igual a 0'
            });
        }
        
        // Obtener usuario de la sesión si está disponible
        const usuario = req.user ? req.user.usu_cod : 'SISTEMA';
        
        // Construir objeto con solo los campos proporcionados
        const datosActualizacion = {};
        if (nombre !== undefined) datosActualizacion.nombre = nombre;
        if (fecha_inicio !== undefined) datosActualizacion.fecha_inicio = fecha_inicio;
        if (fecha_fin !== undefined) datosActualizacion.fecha_fin = fecha_fin;
        if (descuento_detal !== undefined) datosActualizacion.descuento_detal = parseFloat(descuento_detal);
        if (descuento_mayor !== undefined) datosActualizacion.descuento_mayor = parseFloat(descuento_mayor);
        if (monto_mayorista_minimo !== undefined) {
            datosActualizacion.monto_mayorista_minimo = monto_mayorista_minimo !== null ? parseFloat(monto_mayorista_minimo) : null;
        }
        if (activo !== undefined) datosActualizacion.activo = activo;
        if (observaciones !== undefined) datosActualizacion.observaciones = observaciones;
        datosActualizacion.usuario = usuario;
        
        const resultado = await actualizarEventoPromocional(parseInt(eve_sec), datosActualizacion);
        
        res.status(200).json(resultado);
    } catch (error) {
        console.error('Error al actualizar evento promocional:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Obtiene el listado de eventos promocionales
 * GET /api/eventos-promocionales
 */
const obtenerEventos = async (req, res) => {
    try {
        const { activo, fecha, fecha_inicio, fecha_fin } = req.query;
        
        const filtros = {};
        if (activo !== undefined) filtros.activo = activo;
        if (fecha !== undefined) filtros.fecha = fecha;
        if (fecha_inicio !== undefined) filtros.fecha_inicio = fecha_inicio;
        if (fecha_fin !== undefined) filtros.fecha_fin = fecha_fin;
        
        const resultado = await obtenerEventosPromocionales(filtros);
        
        res.status(200).json(resultado);
    } catch (error) {
        console.error('Error al obtener eventos promocionales:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Obtiene un evento promocional por ID
 * GET /api/eventos-promocionales/:eve_sec
 */
const obtenerEventoPorId = async (req, res) => {
    try {
        const { eve_sec } = req.params;
        
        if (!eve_sec) {
            return res.status(400).json({
                success: false,
                message: 'El ID del evento (eve_sec) es requerido'
            });
        }
        
        const resultado = await obtenerEventoPromocionalPorId(parseInt(eve_sec));
        
        res.status(200).json(resultado);
    } catch (error) {
        console.error('Error al obtener evento promocional:', error);
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Obtiene el evento promocional activo en la fecha actual
 * GET /api/eventos-promocionales/activo
 */
const obtenerEventoActivoEndpoint = async (req, res) => {
    try {
        const { fecha } = req.query;
        const fechaConsulta = fecha ? new Date(fecha) : null;
        
        const evento = await obtenerEventoActivo(fechaConsulta);
        
        if (!evento) {
            return res.status(200).json({
                success: true,
                evento: null,
                message: 'No hay eventos promocionales activos en la fecha especificada'
            });
        }
        
        res.status(200).json({
            success: true,
            evento
        });
    } catch (error) {
        console.error('Error al obtener evento activo:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export {
    crearEvento,
    actualizarEvento,
    obtenerEventos,
    obtenerEventoPorId,
    obtenerEventoActivoEndpoint
};

