import { poolPromise, sql } from '../db.js';

/**
 * Obtiene la existencia de un artículo por su código
 * @param {string} art_cod - Código del artículo
 * @returns {Promise<number>} - Valor de la existencia del artículo
 * @throws {Error} Si no se encuentra el artículo o hay error en la consulta
 */
export const obtenerExistenciaArticulo = async (art_cod) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query(`
                SELECT ISNULL(e.existencia, 0) AS existencia
                FROM dbo.articulos a
                LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
                WHERE a.art_cod = @art_cod
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`No se encontró el artículo con código: ${art_cod}`);
        }

        const existencia = parseFloat(result.recordset[0].existencia);
        if (isNaN(existencia)) {
            throw new Error(`El valor de existencia para el artículo ${art_cod} no es un número válido`);
        }

        return existencia;
        
    } catch (error) {
        throw new Error(`Error al obtener existencia del artículo ${art_cod}: ${error.message}`);
    }
};

/**
 * Obtiene información completa de un artículo por su código
 * @param {string} art_cod - Código del artículo
 * @returns {Promise<Object>} - Información completa del artículo
 * @throws {Error} Si no se encuentra el artículo o hay error en la consulta
 */
export const obtenerInformacionArticulo = async (art_cod) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query(`
                SELECT 
                    a.art_sec,
                    a.art_cod,
                    a.art_nom,
                    a.art_url_img_servi,
                    a.art_woo_id,
                    ISNULL(e.existencia, 0) AS existencia,
                    -- Precios base del artículo
                    ISNULL(ad1.art_bod_pre, 0) AS precio_detal_base,
                    ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_base,
                    -- Categorías del artículo
                    ig.inv_gru_cod,
                    ig.inv_gru_nom AS categoria,
                    isg.inv_sub_gru_cod,
                    isg.inv_sub_gru_nom AS sub_categoria
                FROM dbo.articulos a
                LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
                LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
                LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
                LEFT JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
                LEFT JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
                WHERE a.art_cod = @art_cod
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`No se encontró el artículo con código: ${art_cod}`);
        }

        const articulo = result.recordset[0];
        
        // Convertir valores numéricos
        articulo.existencia = parseFloat(articulo.existencia) || 0;
        articulo.precio_detal_base = parseFloat(articulo.precio_detal_base) || 0;
        articulo.precio_mayor_base = parseFloat(articulo.precio_mayor_base) || 0;

        return articulo;
        
    } catch (error) {
        throw new Error(`Error al obtener información del artículo ${art_cod}: ${error.message}`);
    }
};

/**
 * Verifica si un artículo existe en el sistema
 * @param {string} art_cod - Código del artículo
 * @returns {Promise<boolean>} - true si el artículo existe, false en caso contrario
 */
export const verificarExistenciaArticulo = async (art_cod) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query(`
                SELECT COUNT(*) AS count
                FROM dbo.articulos
                WHERE art_cod = @art_cod
            `);

        return result.recordset[0].count > 0;
        
    } catch (error) {
        throw new Error(`Error al verificar existencia del artículo ${art_cod}: ${error.message}`);
    }
};

/**
 * Obtiene el art_sec de un artículo por su código
 * @param {string} art_cod - Código del artículo
 * @returns {Promise<string>} - art_sec del artículo
 * @throws {Error} Si no se encuentra el artículo
 */
export const obtenerArtSec = async (art_cod) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query(`
                SELECT art_sec
                FROM dbo.articulos
                WHERE art_cod = @art_cod
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`No se encontró el artículo con código: ${art_cod}`);
        }

        return result.recordset[0].art_sec;
        
    } catch (error) {
        throw new Error(`Error al obtener art_sec del artículo ${art_cod}: ${error.message}`);
    }
};

/**
 * Obtiene el art_woo_id de un artículo por su código
 * @param {string} art_cod - Código del artículo
 * @returns {Promise<string|null>} - art_woo_id del artículo o null si no tiene
 * @throws {Error} Si no se encuentra el artículo
 */
export const obtenerArtWooId = async (art_cod) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query(`
                SELECT art_woo_id
                FROM dbo.articulos
                WHERE art_cod = @art_cod
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`No se encontró el artículo con código: ${art_cod}`);
        }

        return result.recordset[0].art_woo_id;
        
    } catch (error) {
        throw new Error(`Error al obtener art_woo_id del artículo ${art_cod}: ${error.message}`);
    }
};

/**
 * Obtiene la existencia de un artículo por su art_sec
 * @param {string} art_sec - Secuencia del artículo
 * @returns {Promise<number>} - Valor de la existencia del artículo
 * @throws {Error} Si no se encuentra el artículo o hay error en la consulta
 */
export const obtenerExistenciaArticuloPorSec = async (art_sec) => {
    const pool = await poolPromise;
    
    try {
        const result = await pool.request()
            .input('art_sec', sql.VarChar(30), art_sec)
            .query(`
                SELECT ISNULL(e.existencia, 0) AS existencia
                FROM dbo.articulos a
                LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
                WHERE a.art_sec = @art_sec
            `);

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error(`No se encontró el artículo con secuencia: ${art_sec}`);
        }

        const existencia = parseFloat(result.recordset[0].existencia);
        if (isNaN(existencia)) {
            throw new Error(`El valor de existencia para el artículo ${art_sec} no es un número válido`);
        }

        return existencia;
        
    } catch (error) {
        throw new Error(`Error al obtener existencia del artículo ${art_sec}: ${error.message}`);
    }
};
