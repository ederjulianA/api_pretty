// models/eventoPromocionalModel.js
import { sql, poolPromise } from '../db.js';

/**
 * Crea un nuevo evento promocional
 * @param {Object} eventoData - Datos del evento
 * @returns {Promise<Object>} - Evento creado
 */
const crearEventoPromocional = async (eventoData) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        await transaction.begin();
        const request = new sql.Request(transaction);
        
        // Validar fechas
        const fechaInicio = new Date(eventoData.fecha_inicio);
        const fechaFin = new Date(eventoData.fecha_fin);
        
        if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
            throw new Error('Las fechas proporcionadas no son válidas');
        }
        
        if (fechaInicio >= fechaFin) {
            throw new Error('La fecha de inicio debe ser menor a la fecha de fin');
        }
        
        // Validar porcentajes de descuento
        if (eventoData.descuento_detal < 0 || eventoData.descuento_detal > 100) {
            throw new Error('El descuento al detal debe estar entre 0 y 100');
        }
        
        if (eventoData.descuento_mayor < 0 || eventoData.descuento_mayor > 100) {
            throw new Error('El descuento al mayor debe estar entre 0 y 100');
        }
        
        // Verificar si hay eventos activos que se solapen con las fechas
        const requestVerificacion = new sql.Request(transaction);
        const eventosSolapados = await requestVerificacion
            .input('fecha_inicio', sql.DateTime, fechaInicio)
            .input('fecha_fin', sql.DateTime, fechaFin)
            .query(`
                SELECT eve_sec, eve_nombre, eve_fecha_inicio, eve_fecha_fin
                FROM dbo.eventos_promocionales
                WHERE eve_activo = 'S'
                AND (
                    (@fecha_inicio BETWEEN eve_fecha_inicio AND eve_fecha_fin)
                    OR (@fecha_fin BETWEEN eve_fecha_inicio AND eve_fecha_fin)
                    OR (eve_fecha_inicio BETWEEN @fecha_inicio AND @fecha_fin)
                    OR (eve_fecha_fin BETWEEN @fecha_inicio AND @fecha_fin)
                )
            `);
        
        if (eventosSolapados.recordset.length > 0) {
            const eventos = eventosSolapados.recordset.map(e => e.eve_nombre).join(', ');
            throw new Error(`Ya existe un evento activo que se solapa con las fechas proporcionadas: ${eventos}`);
        }
        
        // Crear evento promocional
        const requestCreacion = new sql.Request(transaction);
        const result = await requestCreacion
            .input('nombre', sql.VarChar(100), eventoData.nombre)
            .input('fecha_inicio', sql.DateTime, fechaInicio)
            .input('fecha_fin', sql.DateTime, fechaFin)
            .input('descuento_detal', sql.Decimal(5, 2), eventoData.descuento_detal)
            .input('descuento_mayor', sql.Decimal(5, 2), eventoData.descuento_mayor)
            .input('monto_mayorista_minimo', sql.Decimal(17, 2), eventoData.monto_mayorista_minimo || null)
            .input('activo', sql.Char(1), eventoData.activo !== undefined ? eventoData.activo : 'S')
            .input('observaciones', sql.VarChar(500), eventoData.observaciones || null)
            .input('usuario', sql.VarChar(50), eventoData.usuario || 'SISTEMA')
            .query(`
                INSERT INTO dbo.eventos_promocionales 
                (eve_nombre, eve_fecha_inicio, eve_fecha_fin, eve_descuento_detal, 
                 eve_descuento_mayor, eve_monto_mayorista_minimo, eve_activo, eve_observaciones, eve_usuario_creacion)
                OUTPUT INSERTED.eve_sec, INSERTED.eve_nombre, INSERTED.eve_fecha_inicio, 
                       INSERTED.eve_fecha_fin, INSERTED.eve_descuento_detal, 
                       INSERTED.eve_descuento_mayor, INSERTED.eve_monto_mayorista_minimo, 
                       INSERTED.eve_activo, INSERTED.eve_observaciones, INSERTED.eve_fecha_creacion, 
                       INSERTED.eve_usuario_creacion
                VALUES (@nombre, @fecha_inicio, @fecha_fin, @descuento_detal, 
                        @descuento_mayor, @monto_mayorista_minimo, @activo, @observaciones, @usuario)
            `);
        
        await transaction.commit();
        
        return {
            success: true,
            message: 'Evento promocional creado exitosamente',
            evento: result.recordset[0]
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Actualiza un evento promocional existente
 * @param {number} eve_sec - ID del evento
 * @param {Object} eventoData - Datos actualizados del evento
 * @returns {Promise<Object>} - Evento actualizado
 */
const actualizarEventoPromocional = async (eve_sec, eventoData) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        await transaction.begin();
        
        // Verificar que el evento existe
        const requestExistente = new sql.Request(transaction);
        const eventoExistente = await requestExistente
            .input('eve_sec', sql.Decimal(18, 0), eve_sec)
            .query('SELECT eve_sec FROM dbo.eventos_promocionales WHERE eve_sec = @eve_sec');
        
        if (eventoExistente.recordset.length === 0) {
            throw new Error('Evento promocional no encontrado');
        }
        
        // Validar fechas si se proporcionan
        let fechaInicio = null;
        let fechaFin = null;
        
        if (eventoData.fecha_inicio) {
            fechaInicio = new Date(eventoData.fecha_inicio);
            if (isNaN(fechaInicio.getTime())) {
                throw new Error('La fecha de inicio no es válida');
            }
        }
        
        if (eventoData.fecha_fin) {
            fechaFin = new Date(eventoData.fecha_fin);
            if (isNaN(fechaFin.getTime())) {
                throw new Error('La fecha de fin no es válida');
            }
        }
        
        // Si ambas fechas están presentes, validar que inicio < fin
        if (fechaInicio && fechaFin && fechaInicio >= fechaFin) {
            throw new Error('La fecha de inicio debe ser menor a la fecha de fin');
        }
        
        // Validar porcentajes de descuento si se proporcionan
        if (eventoData.descuento_detal !== undefined) {
            if (eventoData.descuento_detal < 0 || eventoData.descuento_detal > 100) {
                throw new Error('El descuento al detal debe estar entre 0 y 100');
            }
        }
        
        if (eventoData.descuento_mayor !== undefined) {
            if (eventoData.descuento_mayor < 0 || eventoData.descuento_mayor > 100) {
                throw new Error('El descuento al mayor debe estar entre 0 y 100');
            }
        }
        
        // Validar monto mayorista mínimo si se proporciona
        if (eventoData.monto_mayorista_minimo !== undefined) {
            if (eventoData.monto_mayorista_minimo < 0) {
                throw new Error('El monto mayorista mínimo debe ser mayor o igual a 0');
            }
        }
        
        // Verificar solapamiento de fechas (excluyendo el evento actual)
        if (fechaInicio || fechaFin) {
            // Obtener fechas actuales del evento si no se proporcionan
            const requestFechas = new sql.Request(transaction);
            const eventoActual = await requestFechas
                .input('eve_sec', sql.Decimal(18, 0), eve_sec)
                .query('SELECT eve_fecha_inicio, eve_fecha_fin FROM dbo.eventos_promocionales WHERE eve_sec = @eve_sec');
            
            const fechaInicioFinal = fechaInicio || new Date(eventoActual.recordset[0].eve_fecha_inicio);
            const fechaFinFinal = fechaFin || new Date(eventoActual.recordset[0].eve_fecha_fin);
            
            const requestSolapados = new sql.Request(transaction);
            const eventosSolapados = await requestSolapados
                .input('eve_sec', sql.Decimal(18, 0), eve_sec)
                .input('fecha_inicio', sql.DateTime, fechaInicioFinal)
                .input('fecha_fin', sql.DateTime, fechaFinFinal)
                .query(`
                    SELECT eve_sec, eve_nombre, eve_fecha_inicio, eve_fecha_fin
                    FROM dbo.eventos_promocionales
                    WHERE eve_sec != @eve_sec
                    AND eve_activo = 'S'
                    AND (
                        (@fecha_inicio BETWEEN eve_fecha_inicio AND eve_fecha_fin)
                        OR (@fecha_fin BETWEEN eve_fecha_inicio AND eve_fecha_fin)
                        OR (eve_fecha_inicio BETWEEN @fecha_inicio AND @fecha_fin)
                        OR (eve_fecha_fin BETWEEN @fecha_inicio AND @fecha_fin)
                    )
                `);
            
            if (eventosSolapados.recordset.length > 0) {
                const eventos = eventosSolapados.recordset.map(e => e.eve_nombre).join(', ');
                throw new Error(`Ya existe un evento activo que se solapa con las fechas proporcionadas: ${eventos}`);
            }
        }
        
        // Construir query de actualización dinámicamente
        const camposActualizar = [];
        const updateRequest = new sql.Request(transaction);
        updateRequest.input('eve_sec', sql.Decimal(18, 0), eve_sec);
        
        if (eventoData.nombre !== undefined) {
            camposActualizar.push('eve_nombre = @nombre');
            updateRequest.input('nombre', sql.VarChar(100), eventoData.nombre);
        }
        
        if (fechaInicio) {
            camposActualizar.push('eve_fecha_inicio = @fecha_inicio');
            updateRequest.input('fecha_inicio', sql.DateTime, fechaInicio);
        }
        
        if (fechaFin) {
            camposActualizar.push('eve_fecha_fin = @fecha_fin');
            updateRequest.input('fecha_fin', sql.DateTime, fechaFin);
        }
        
        if (eventoData.descuento_detal !== undefined) {
            camposActualizar.push('eve_descuento_detal = @descuento_detal');
            updateRequest.input('descuento_detal', sql.Decimal(5, 2), eventoData.descuento_detal);
        }
        
        if (eventoData.descuento_mayor !== undefined) {
            camposActualizar.push('eve_descuento_mayor = @descuento_mayor');
            updateRequest.input('descuento_mayor', sql.Decimal(5, 2), eventoData.descuento_mayor);
        }
        
        if (eventoData.monto_mayorista_minimo !== undefined) {
            camposActualizar.push('eve_monto_mayorista_minimo = @monto_mayorista_minimo');
            updateRequest.input('monto_mayorista_minimo', sql.Decimal(17, 2), eventoData.monto_mayorista_minimo || null);
        }
        
        if (eventoData.activo !== undefined) {
            camposActualizar.push('eve_activo = @activo');
            updateRequest.input('activo', sql.Char(1), eventoData.activo);
        }
        
        if (eventoData.observaciones !== undefined) {
            camposActualizar.push('eve_observaciones = @observaciones');
            updateRequest.input('observaciones', sql.VarChar(500), eventoData.observaciones || null);
        }
        
        // Siempre actualizar fecha de modificación y usuario
        camposActualizar.push('eve_fecha_modificacion = GETDATE()');
        camposActualizar.push('eve_usuario_modificacion = @usuario');
        updateRequest.input('usuario', sql.VarChar(50), eventoData.usuario || 'SISTEMA');
        
        if (camposActualizar.length === 0) {
            throw new Error('No se proporcionaron campos para actualizar');
        }
        
        const updateQuery = `
            UPDATE dbo.eventos_promocionales
            SET ${camposActualizar.join(', ')}
            OUTPUT INSERTED.eve_sec, INSERTED.eve_nombre, INSERTED.eve_fecha_inicio, 
                   INSERTED.eve_fecha_fin, INSERTED.eve_descuento_detal, 
                   INSERTED.eve_descuento_mayor, INSERTED.eve_monto_mayorista_minimo, 
                   INSERTED.eve_activo, INSERTED.eve_observaciones, INSERTED.eve_fecha_creacion, 
                   INSERTED.eve_usuario_creacion, INSERTED.eve_fecha_modificacion, 
                   INSERTED.eve_usuario_modificacion
            WHERE eve_sec = @eve_sec
        `;
        
        const result = await updateRequest.query(updateQuery);
        
        await transaction.commit();
        
        return {
            success: true,
            message: 'Evento promocional actualizado exitosamente',
            evento: result.recordset[0]
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Obtiene todos los eventos promocionales
 * @param {Object} filtros - Filtros opcionales (activo, fecha, fecha_inicio, fecha_fin)
 * @returns {Promise<Array>} - Lista de eventos
 */
const obtenerEventosPromocionales = async (filtros = {}) => {
    const pool = await poolPromise;
    const request = pool.request();
    
    let query = `
        SELECT 
            eve_sec,
            eve_nombre,
            eve_fecha_inicio,
            eve_fecha_fin,
            eve_descuento_detal,
            eve_descuento_mayor,
            eve_monto_mayorista_minimo,
            eve_activo,
            eve_observaciones,
            eve_fecha_creacion,
            eve_usuario_creacion,
            eve_fecha_modificacion,
            eve_usuario_modificacion,
            CASE 
                WHEN GETDATE() BETWEEN eve_fecha_inicio AND eve_fecha_fin AND eve_activo = 'S' 
                THEN 'S' 
                ELSE 'N' 
            END AS eve_en_curso
        FROM dbo.eventos_promocionales
        WHERE 1=1
    `;
    
    if (filtros.activo !== undefined) {
        query += ' AND eve_activo = @activo';
        request.input('activo', sql.Char(1), filtros.activo);
    }
    
    // Filtro por fecha específica (eventos que contengan esta fecha)
    if (filtros.fecha) {
        query += ' AND @fecha BETWEEN eve_fecha_inicio AND eve_fecha_fin';
        request.input('fecha', sql.DateTime, new Date(filtros.fecha));
    }
    
    // Filtro por rango de fechas (eventos que se solapen con el rango)
    if (filtros.fecha_inicio || filtros.fecha_fin) {
        if (filtros.fecha_inicio && filtros.fecha_fin) {
            // Si se proporcionan ambas fechas, buscar eventos que se solapen con el rango
            const fechaInicio = new Date(filtros.fecha_inicio);
            const fechaFin = new Date(filtros.fecha_fin);
            
            if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
                throw new Error('Las fechas proporcionadas no son válidas');
            }
            
            if (fechaInicio > fechaFin) {
                throw new Error('La fecha de inicio debe ser menor o igual a la fecha de fin');
            }
            
            query += ` AND (
                (@fecha_inicio BETWEEN eve_fecha_inicio AND eve_fecha_fin)
                OR (@fecha_fin BETWEEN eve_fecha_inicio AND eve_fecha_fin)
                OR (eve_fecha_inicio BETWEEN @fecha_inicio AND @fecha_fin)
                OR (eve_fecha_fin BETWEEN @fecha_inicio AND @fecha_fin)
            )`;
            request.input('fecha_inicio', sql.DateTime, fechaInicio);
            request.input('fecha_fin', sql.DateTime, fechaFin);
        } else if (filtros.fecha_inicio) {
            // Solo fecha de inicio: eventos que terminen después de esta fecha
            const fechaInicio = new Date(filtros.fecha_inicio);
            if (isNaN(fechaInicio.getTime())) {
                throw new Error('La fecha de inicio no es válida');
            }
            query += ' AND eve_fecha_fin >= @fecha_inicio';
            request.input('fecha_inicio', sql.DateTime, fechaInicio);
        } else if (filtros.fecha_fin) {
            // Solo fecha de fin: eventos que comiencen antes de esta fecha
            const fechaFin = new Date(filtros.fecha_fin);
            if (isNaN(fechaFin.getTime())) {
                throw new Error('La fecha de fin no es válida');
            }
            query += ' AND eve_fecha_inicio <= @fecha_fin';
            request.input('fecha_fin', sql.DateTime, fechaFin);
        }
    }
    
    query += ' ORDER BY eve_fecha_inicio DESC, eve_fecha_creacion DESC';
    
    const result = await request.query(query);
    
    return {
        success: true,
        eventos: result.recordset,
        total: result.recordset.length
    };
};

/**
 * Obtiene un evento promocional por ID
 * @param {number} eve_sec - ID del evento
 * @returns {Promise<Object>} - Evento encontrado
 */
const obtenerEventoPromocionalPorId = async (eve_sec) => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('eve_sec', sql.Decimal(18, 0), eve_sec)
        .query(`
            SELECT 
                eve_sec,
                eve_nombre,
                eve_fecha_inicio,
                eve_fecha_fin,
                eve_descuento_detal,
                eve_descuento_mayor,
                eve_monto_mayorista_minimo,
                eve_activo,
                eve_observaciones,
                eve_fecha_creacion,
                eve_usuario_creacion,
                eve_fecha_modificacion,
                eve_usuario_modificacion,
                CASE 
                    WHEN GETDATE() BETWEEN eve_fecha_inicio AND eve_fecha_fin AND eve_activo = 'S' 
                    THEN 'S' 
                    ELSE 'N' 
                END AS eve_en_curso
            FROM dbo.eventos_promocionales
            WHERE eve_sec = @eve_sec
        `);
    
    if (result.recordset.length === 0) {
        throw new Error('Evento promocional no encontrado');
    }
    
    return {
        success: true,
        evento: result.recordset[0]
    };
};

/**
 * Obtiene el evento promocional activo en una fecha específica
 * @param {Date} fecha - Fecha a verificar (opcional, por defecto fecha actual)
 * @returns {Promise<Object|null>} - Evento activo o null
 */
const obtenerEventoActivo = async (fecha = null) => {
    const pool = await poolPromise;
    const fechaConsulta = fecha || new Date();
    
    const result = await pool.request()
        .input('fecha', sql.DateTime, fechaConsulta)
        .query(`
            SELECT TOP 1
                eve_sec,
                eve_nombre,
                eve_fecha_inicio,
                eve_fecha_fin,
                eve_descuento_detal,
                eve_descuento_mayor,
                eve_monto_mayorista_minimo,
                eve_activo,
                eve_observaciones
            FROM dbo.eventos_promocionales
            WHERE eve_activo = 'S'
            AND @fecha BETWEEN eve_fecha_inicio AND eve_fecha_fin
            ORDER BY eve_fecha_creacion DESC
        `);
    
    if (result.recordset.length === 0) {
        return null;
    }
    
    return result.recordset[0];
};

export {
    crearEventoPromocional,
    actualizarEventoPromocional,
    obtenerEventosPromocionales,
    obtenerEventoPromocionalPorId,
    obtenerEventoActivo
};

