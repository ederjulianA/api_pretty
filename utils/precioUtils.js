import { poolPromise, sql } from '../db.js';

/**
 * Obtiene los precios detal y mayor de un artículo específico
 * @param {string} art_sec - Código del artículo
 * @returns {Promise<Object>} - Objeto con precios detal y mayor
 * @throws {Error} Si el artículo no existe o no tiene precios configurados
 */
export const obtenerPreciosArticulo = async (art_sec) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_sec', sql.VarChar(30), art_sec)
            .query(`
                SELECT 
                    a.art_sec,
                    a.art_cod,
                    a.art_nom,
                    ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
                    ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
                FROM dbo.articulos a
                LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
                LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
                WHERE a.art_sec = @art_sec
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`Artículo ${art_sec} no encontrado`);
        }

        const articulo = result.recordset[0];
        
        return {
            art_sec: articulo.art_sec,
            art_cod: articulo.art_cod,
            art_nom: articulo.art_nom,
            precio_detal: articulo.precio_detal,
            precio_mayor: articulo.precio_mayor
        };
        
    } catch (error) {
        throw new Error(`Error al obtener precios del artículo ${art_sec}: ${error.message}`);
    }
};

/**
 * Valida que un precio de oferta sea válido para un artículo
 * @param {string} art_sec - Código del artículo
 * @param {number} precio_oferta - Precio de oferta a validar
 * @returns {Promise<Object>} - Objeto con resultado de validación
 */
export const validarPrecioOferta = async (art_sec, precio_oferta) => {
    try {
        const precios = await obtenerPreciosArticulo(art_sec);
        
        if (precio_oferta <= 0) {
            return {
                valido: false,
                mensaje: `El precio de oferta ${precio_oferta} debe ser mayor a 0 para el artículo ${art_sec}`,
                precios: precios
            };
        }
        
        if (precio_oferta >= precios.precio_detal) {
            return {
                valido: false,
                mensaje: `El precio de oferta ${precio_oferta} debe ser menor al precio detal ${precios.precio_detal} del artículo ${art_sec}`,
                precios: precios
            };
        }
        
        if (precio_oferta >= precios.precio_mayor) {
            return {
                valido: false,
                mensaje: `El precio de oferta ${precio_oferta} debe ser menor al precio mayor ${precios.precio_mayor} del artículo ${art_sec}`,
                precios: precios
            };
        }
        
        return {
            valido: true,
            mensaje: 'Precio de oferta válido',
            precios: precios
        };
        
    } catch (error) {
        return {
            valido: false,
            mensaje: error.message,
            precios: null
        };
    }
};

/**
 * Valida que un descuento porcentual sea válido para un artículo
 * @param {string} art_sec - Código del artículo
 * @param {number} descuento_porcentaje - Descuento porcentual a validar
 * @returns {Promise<Object>} - Objeto con resultado de validación
 */
export const validarDescuentoPorcentual = async (art_sec, descuento_porcentaje) => {
    try {
        const precios = await obtenerPreciosArticulo(art_sec);
        
        if (descuento_porcentaje <= 0) {
            return {
                valido: false,
                mensaje: `El descuento porcentual ${descuento_porcentaje}% debe ser mayor a 0 para el artículo ${art_sec}`,
                precios: precios
            };
        }
        
        if (descuento_porcentaje >= 100) {
            return {
                valido: false,
                mensaje: `El descuento porcentual ${descuento_porcentaje}% debe ser menor al 100% para el artículo ${art_sec}`,
                precios: precios
            };
        }
        
        // Calcular precios con descuento
        const precioConDescuentoDetal = precios.precio_detal * (1 - (descuento_porcentaje / 100));
        const precioConDescuentoMayor = precios.precio_mayor * (1 - (descuento_porcentaje / 100));
        
        if (precioConDescuentoDetal <= 0) {
            return {
                valido: false,
                mensaje: `El descuento ${descuento_porcentaje}% resultaría en un precio detal de ${precioConDescuentoDetal.toFixed(2)} para el artículo ${art_sec}`,
                precios: precios
            };
        }
        
        if (precioConDescuentoMayor <= 0) {
            return {
                valido: false,
                mensaje: `El descuento ${descuento_porcentaje}% resultaría en un precio mayor de ${precioConDescuentoMayor.toFixed(2)} para el artículo ${art_sec}`,
                precios: precios
            };
        }
        
        return {
            valido: true,
            mensaje: 'Descuento porcentual válido',
            precios: precios,
            precios_con_descuento: {
                precio_detal: precioConDescuentoDetal,
                precio_mayor: precioConDescuentoMayor
            }
        };
        
    } catch (error) {
        return {
            valido: false,
            mensaje: error.message,
            precios: null
        };
    }
};

/**
 * Obtiene precios de múltiples artículos de forma optimizada
 * @param {Array<string>} art_sec_list - Lista de códigos de artículos
 * @returns {Promise<Object>} - Objeto con precios indexados por art_sec
 */
export const obtenerPreciosMultiples = async (art_sec_list) => {
    if (!art_sec_list || art_sec_list.length === 0) {
        return {};
    }
    
    const pool = await poolPromise;
    
    try {
        // Crear lista de parámetros para la consulta
        const params = art_sec_list.map((art_sec, index) => `@art_sec_${index}`).join(',');
        const artSecList = art_sec_list.map((art_sec, index) => `'${art_sec}'`).join(',');
        
        const result = await pool.request().query(`
            SELECT 
                a.art_sec,
                a.art_cod,
                a.art_nom,
                ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
                ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
            FROM dbo.articulos a
            LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
            LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
            WHERE a.art_sec IN (${artSecList})
        `);

        // Convertir resultado a objeto indexado por art_sec
        const precios = {};
        result.recordset.forEach(row => {
            precios[row.art_sec] = {
                art_sec: row.art_sec,
                art_cod: row.art_cod,
                art_nom: row.art_nom,
                precio_detal: row.precio_detal,
                precio_mayor: row.precio_mayor
            };
        });
        
        return precios;
        
    } catch (error) {
        throw new Error(`Error al obtener precios múltiples: ${error.message}`);
    }
}; 

/**
 * Obtiene los precios de un artículo incluyendo ofertas activas
 * @param {string} art_sec - Código del artículo
 * @param {Date} fecha_consulta - Fecha de consulta (opcional, por defecto fecha actual)
 * @returns {Promise<Object>} - Objeto con precios detal, mayor y oferta
 */
export const obtenerPreciosConOferta = async (art_sec, fecha_consulta = null) => {
    const pool = await poolPromise;
    
    try {
        const fecha = fecha_consulta || new Date();
        
        const result = await pool.request()
            .input('art_sec', sql.VarChar(30), art_sec)
            .input('fecha_consulta', sql.DateTime, fecha)
            .query(`
                WITH PromocionActiva AS (
                    SELECT TOP 1
                        pd.pro_sec,
                        pd.pro_det_precio_oferta,
                        pd.pro_det_descuento_porcentaje,
                        p.pro_fecha_inicio,
                        p.pro_fecha_fin,
                        p.pro_codigo,
                        p.pro_descripcion,
                        p.pro_activa,
                        ROW_NUMBER() OVER (ORDER BY p.pro_fecha_inicio DESC, p.pro_sec DESC) as rn
                    FROM dbo.promociones_detalle pd
                    INNER JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
                    WHERE pd.art_sec = @art_sec
                        AND pd.pro_det_estado = 'A'
                        AND p.pro_activa = 'S'
                        AND @fecha_consulta BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
                )
                SELECT 
                    a.art_sec,
                    a.art_cod,
                    a.art_nom,
                    -- Precios normales
                    ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
                    ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
                    -- Precios con oferta aplicada
                    CASE 
                        WHEN pa.pro_det_precio_oferta IS NOT NULL AND pa.pro_det_precio_oferta > 0 
                        THEN pa.pro_det_precio_oferta 
                        WHEN pa.pro_det_descuento_porcentaje IS NOT NULL AND pa.pro_det_descuento_porcentaje > 0 
                        THEN ISNULL(ad1.art_bod_pre, 0) * (1 - (pa.pro_det_descuento_porcentaje / 100))
                        ELSE ISNULL(ad1.art_bod_pre, 0) 
                    END AS precio_detal,
                    CASE 
                        WHEN pa.pro_det_precio_oferta IS NOT NULL AND pa.pro_det_precio_oferta > 0 
                        THEN pa.pro_det_precio_oferta 
                        WHEN pa.pro_det_descuento_porcentaje IS NOT NULL AND pa.pro_det_descuento_porcentaje > 0 
                        THEN ISNULL(ad2.art_bod_pre, 0) * (1 - (pa.pro_det_descuento_porcentaje / 100))
                        ELSE ISNULL(ad2.art_bod_pre, 0) 
                    END AS precio_mayor,
                    -- Información de oferta
                    pa.pro_det_precio_oferta AS precio_oferta,
                    pa.pro_det_descuento_porcentaje AS descuento_porcentaje,
                    pa.pro_fecha_inicio,
                    pa.pro_fecha_fin,
                    pa.pro_codigo AS codigo_promocion,
                    pa.pro_descripcion AS descripcion_promocion,
                    pa.pro_activa,
                    CASE 
                        WHEN (pa.pro_det_precio_oferta IS NOT NULL AND pa.pro_det_precio_oferta > 0) 
                             OR (pa.pro_det_descuento_porcentaje IS NOT NULL AND pa.pro_det_descuento_porcentaje > 0)
                        THEN 'S' 
                        ELSE 'N' 
                    END AS tiene_oferta
                FROM dbo.articulos a
                LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
                LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
                LEFT JOIN PromocionActiva pa ON pa.rn = 1
                WHERE a.art_sec = @art_sec
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`Artículo ${art_sec} no encontrado`);
        }

        const articulo = result.recordset[0];
        
        return {
            art_sec: articulo.art_sec,
            art_cod: articulo.art_cod,
            art_nom: articulo.art_nom,
            precio_detal: articulo.precio_detal,
            precio_mayor: articulo.precio_mayor,
            precio_detal_original: articulo.precio_detal_original,
            precio_mayor_original: articulo.precio_mayor_original,
            tiene_oferta: articulo.tiene_oferta === 'S',
            oferta_info: articulo.tiene_oferta === 'S' ? {
                precio_oferta: articulo.precio_oferta,
                descuento_porcentaje: articulo.descuento_porcentaje,
                fecha_inicio: articulo.pro_fecha_inicio,
                fecha_fin: articulo.pro_fecha_fin,
                codigo_promocion: articulo.codigo_promocion,
                descripcion_promocion: articulo.descripcion_promocion
            } : null
        };
        
    } catch (error) {
        throw new Error(`Error al obtener precios con oferta del artículo ${art_sec}: ${error.message}`);
    }
};

/**
 * Obtiene precios con ofertas para múltiples artículos de forma optimizada
 * @param {Array<string>} art_sec_list - Lista de códigos de artículos
 * @param {Date} fecha_consulta - Fecha de consulta (opcional)
 * @returns {Promise<Object>} - Objeto con precios indexados por art_sec
 */
export const obtenerPreciosConOfertaMultiples = async (art_sec_list, fecha_consulta = null) => {
    if (!art_sec_list || art_sec_list.length === 0) {
        return {};
    }
    
    const pool = await poolPromise;
    const fecha = fecha_consulta || new Date();
    
    try {
        // Crear lista de artículos para la consulta
        const artSecList = art_sec_list.map((art_sec, index) => `'${art_sec}'`).join(',');
        
        const result = await pool.request()
            .input('fecha_consulta', sql.DateTime, fecha)
            .query(`
                WITH PromocionesActivas AS (
                    SELECT 
                        pd.art_sec,
                        pd.pro_sec,
                        pd.pro_det_precio_oferta,
                        pd.pro_det_descuento_porcentaje,
                        p.pro_fecha_inicio,
                        p.pro_fecha_fin,
                        p.pro_codigo,
                        p.pro_descripcion,
                        p.pro_activa,
                        ROW_NUMBER() OVER (PARTITION BY pd.art_sec ORDER BY p.pro_fecha_inicio DESC, p.pro_sec DESC) as rn
                    FROM dbo.promociones_detalle pd
                    INNER JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
                    WHERE pd.art_sec IN (${artSecList})
                        AND pd.pro_det_estado = 'A'
                        AND p.pro_activa = 'S'
                        AND @fecha_consulta BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
                )
                SELECT 
                    a.art_sec,
                    a.art_cod,
                    a.art_nom,
                    -- Precios normales
                    ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
                    ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
                    -- Precios con oferta aplicada
                    CASE 
                        WHEN pa.pro_det_precio_oferta IS NOT NULL AND pa.pro_det_precio_oferta > 0 
                        THEN pa.pro_det_precio_oferta 
                        WHEN pa.pro_det_descuento_porcentaje IS NOT NULL AND pa.pro_det_descuento_porcentaje > 0 
                        THEN ISNULL(ad1.art_bod_pre, 0) * (1 - (pa.pro_det_descuento_porcentaje / 100))
                        ELSE ISNULL(ad1.art_bod_pre, 0) 
                    END AS precio_detal,
                    CASE 
                        WHEN pa.pro_det_precio_oferta IS NOT NULL AND pa.pro_det_precio_oferta > 0 
                        THEN pa.pro_det_precio_oferta 
                        WHEN pa.pro_det_descuento_porcentaje IS NOT NULL AND pa.pro_det_descuento_porcentaje > 0 
                        THEN ISNULL(ad2.art_bod_pre, 0) * (1 - (pa.pro_det_descuento_porcentaje / 100))
                        ELSE ISNULL(ad2.art_bod_pre, 0) 
                    END AS precio_mayor,
                    -- Información de oferta
                    pa.pro_det_precio_oferta AS precio_oferta,
                    pa.pro_det_descuento_porcentaje AS descuento_porcentaje,
                    pa.pro_fecha_inicio,
                    pa.pro_fecha_fin,
                    pa.pro_codigo AS codigo_promocion,
                    pa.pro_descripcion AS descripcion_promocion,
                    pa.pro_activa,
                    CASE 
                        WHEN (pa.pro_det_precio_oferta IS NOT NULL AND pa.pro_det_precio_oferta > 0) 
                             OR (pa.pro_det_descuento_porcentaje IS NOT NULL AND pa.pro_det_descuento_porcentaje > 0)
                        THEN 'S' 
                        ELSE 'N' 
                    END AS tiene_oferta
                FROM dbo.articulos a
                LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
                LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
                LEFT JOIN PromocionesActivas pa ON a.art_sec = pa.art_sec AND pa.rn = 1
                WHERE a.art_sec IN (${artSecList})
            `);

        // Convertir resultado a objeto indexado por art_sec
        const precios = {};
        result.recordset.forEach(row => {
            precios[row.art_sec] = {
                art_sec: row.art_sec,
                art_cod: row.art_cod,
                art_nom: row.art_nom,
                precio_detal: row.precio_detal,
                precio_mayor: row.precio_mayor,
                precio_detal_original: row.precio_detal_original,
                precio_mayor_original: row.precio_mayor_original,
                tiene_oferta: row.tiene_oferta === 'S',
                oferta_info: row.tiene_oferta === 'S' ? {
                    precio_oferta: row.precio_oferta,
                    descuento_porcentaje: row.descuento_porcentaje,
                    fecha_inicio: row.pro_fecha_inicio,
                    fecha_fin: row.pro_fecha_fin,
                    codigo_promocion: row.codigo_promocion,
                    descripcion_promocion: row.descripcion_promocion
                } : null
            };
        });
        
        return precios;
        
    } catch (error) {
        throw new Error(`Error al obtener precios múltiples con oferta: ${error.message}`);
    }
}; 