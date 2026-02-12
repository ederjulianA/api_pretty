// models/aiOptimizationModel.js
// Modelo de datos para contenido generado por IA

const { sql, poolPromise } = require('../db');

/**
 * Guarda contenido generado por IA
 * @param {Object} contentData - Datos del contenido
 * @returns {Promise<Object>} Contenido guardado con ai_sec
 */
const saveContent = async (contentData) => {
  const pool = await poolPromise;
  
  try {
    const ai_tipo = contentData.ai_tipo || 'completo';
    const ai_idioma = contentData.ai_idioma || 'es';
    
    // Si no se especifica versión, obtener la siguiente versión disponible
    let ai_version = contentData.ai_version;
    if (!ai_version) {
      const versionResult = await pool.request()
        .input('art_sec', sql.VarChar(30), contentData.art_sec)
        .input('ai_tipo', sql.VarChar(20), ai_tipo)
        .input('ai_idioma', sql.VarChar(5), ai_idioma)
        .query(`
          SELECT ISNULL(MAX(ai_version), 0) + 1 AS next_version
          FROM dbo.articulos_ai_content
          WHERE art_sec = @art_sec
            AND ai_tipo = @ai_tipo
            AND ai_idioma = @ai_idioma
        `);
      
      ai_version = versionResult.recordset[0].next_version;
    }
    
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), contentData.art_sec)
      .input('ai_tipo', sql.VarChar(20), ai_tipo)
      .input('ai_contenido', sql.Text, contentData.ai_contenido)
      .input('ai_version', sql.Int, ai_version)
      .input('ai_estado', sql.Char(1), contentData.ai_estado || 'P')
      .input('ai_idioma', sql.VarChar(5), ai_idioma)
      .input('ai_modelo', sql.VarChar(50), contentData.ai_modelo)
      .input('ai_prompt_hash', sql.VarChar(64), contentData.ai_prompt_hash || null)
      .input('ai_tokens_usados', sql.Int, contentData.ai_tokens_usados || 0)
      .input('ai_costo_usd', sql.Decimal(10, 6), contentData.ai_costo_usd || 0)
      .query(`
        INSERT INTO dbo.articulos_ai_content 
        (art_sec, ai_tipo, ai_contenido, ai_version, ai_estado, ai_idioma, 
         ai_modelo, ai_prompt_hash, ai_tokens_usados, ai_costo_usd)
        OUTPUT INSERTED.ai_sec, INSERTED.ai_fecha_generacion
        VALUES (@art_sec, @ai_tipo, @ai_contenido, @ai_version, @ai_estado, @ai_idioma,
                @ai_modelo, @ai_prompt_hash, @ai_tokens_usados, @ai_costo_usd)
      `);

    const saved = result.recordset[0];
    
    // Actualizar flag en tabla articulos
    await pool.request()
      .input('art_sec', sql.VarChar(30), contentData.art_sec)
      .query(`
        UPDATE dbo.articulos 
        SET art_tiene_contenido_ia = 'S',
            art_fecha_ultima_optimizacion = GETDATE()
        WHERE art_sec = @art_sec
      `);

    return {
      ai_sec: saved.ai_sec,
      ai_fecha_generacion: saved.ai_fecha_generacion,
      ...contentData
    };
  } catch (error) {
    console.error('[AI Model] Error guardando contenido:', error);
    throw error;
  }
};

/**
 * Obtiene contenido activo (aprobado) para un producto
 * @param {string} art_sec - ID del artículo
 * @param {string} ai_tipo - Tipo de contenido (opcional)
 * @param {string} idioma - Idioma (default: 'es')
 * @returns {Promise<Object|null>} Contenido activo o null
 */
const getActiveContent = async (art_sec, ai_tipo = null, idioma = 'es') => {
  const pool = await poolPromise;
  
  try {
    let query = `
      SELECT TOP 1 ai_sec, ai_tipo, ai_contenido, ai_version, ai_modelo, 
             ai_fecha_generacion, ai_usuario_aprobador
      FROM dbo.articulos_ai_content
      WHERE art_sec = @art_sec
        AND ai_estado = 'A'
        AND ai_idioma = @idioma
    `;
    
    const request = pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .input('idioma', sql.VarChar(5), idioma);
    
    if (ai_tipo) {
      query += ' AND ai_tipo = @ai_tipo';
      request.input('ai_tipo', sql.VarChar(20), ai_tipo);
    }
    
    query += ' ORDER BY ai_version DESC';
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return null;
    }
    
    const content = result.recordset[0];
    return {
      ...content,
      ai_contenido: JSON.parse(content.ai_contenido)
    };
  } catch (error) {
    console.error('[AI Model] Error obteniendo contenido activo:', error);
    throw error;
  }
};

/**
 * Obtiene todas las versiones de contenido para un producto
 * @param {string} art_sec - ID del artículo
 * @param {string} ai_tipo - Tipo de contenido (opcional)
 * @returns {Promise<Array>} Array de versiones
 */
const getContentVersions = async (art_sec, ai_tipo = null) => {
  const pool = await poolPromise;
  
  try {
    let query = `
      SELECT ai_sec, ai_tipo, ai_contenido, ai_version, ai_estado, ai_idioma,
             ai_modelo, ai_tokens_usados, ai_costo_usd, ai_fecha_generacion,
             ai_usuario_aprobador, ai_fecha_aprobacion, ai_comentarios
      FROM dbo.articulos_ai_content
      WHERE art_sec = @art_sec
    `;
    
    const request = pool.request()
      .input('art_sec', sql.VarChar(30), art_sec);
    
    if (ai_tipo) {
      query += ' AND ai_tipo = @ai_tipo';
      request.input('ai_tipo', sql.VarChar(20), ai_tipo);
    }
    
    query += ' ORDER BY ai_version DESC, ai_fecha_generacion DESC';
    
    const result = await request.query(query);
    
    return result.recordset.map(row => ({
      ...row,
      ai_contenido: JSON.parse(row.ai_contenido)
    }));
  } catch (error) {
    console.error('[AI Model] Error obteniendo versiones:', error);
    throw error;
  }
};

/**
 * Aprueba una versión de contenido
 * @param {number} ai_sec - ID del contenido
 * @param {string} usuario - Usuario que aprueba
 * @param {string} comentarios - Comentarios opcionales
 * @returns {Promise<Object>} Contenido aprobado
 */
const approveContent = async (ai_sec, usuario, comentarios = null) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    // Obtener art_sec del contenido
    const request1 = new sql.Request(transaction);
    const contentResult = await request1
      .input('ai_sec', sql.Int, ai_sec)
      .query('SELECT art_sec, ai_tipo, ai_idioma FROM dbo.articulos_ai_content WHERE ai_sec = @ai_sec');
    
    if (contentResult.recordset.length === 0) {
      throw new Error('Contenido no encontrado');
    }
    
    const { art_sec, ai_tipo, ai_idioma } = contentResult.recordset[0];
    
    // Desactivar otras versiones del mismo tipo e idioma
    const request2 = new sql.Request(transaction);
    await request2
      .input('art_sec', sql.VarChar(30), art_sec)
      .input('ai_tipo', sql.VarChar(20), ai_tipo)
      .input('ai_idioma', sql.VarChar(5), ai_idioma)
      .input('ai_sec_current', sql.Int, ai_sec)
      .query(`
        UPDATE dbo.articulos_ai_content
        SET ai_estado = 'R'
        WHERE art_sec = @art_sec
          AND ai_tipo = @ai_tipo
          AND ai_idioma = @ai_idioma
          AND ai_sec != @ai_sec_current
          AND ai_estado = 'A'
      `);
    
    // Aprobar la versión actual
    const request3 = new sql.Request(transaction);
    await request3
      .input('ai_sec', sql.Int, ai_sec)
      .input('usuario', sql.VarChar(20), usuario)
      .input('comentarios', sql.Text, comentarios)
      .query(`
        UPDATE dbo.articulos_ai_content
        SET ai_estado = 'A',
            ai_usuario_aprobador = @usuario,
            ai_fecha_aprobacion = GETDATE(),
            ai_comentarios = @comentarios
        WHERE ai_sec = @ai_sec
      `);
    
    await transaction.commit();
    
    // Obtener contenido aprobado
    return await getContentById(ai_sec);
  } catch (error) {
    await transaction.rollback();
    console.error('[AI Model] Error aprobando contenido:', error);
    throw error;
  }
};

/**
 * Rechaza una versión de contenido
 * @param {number} ai_sec - ID del contenido
 * @param {string} usuario - Usuario que rechaza
 * @param {string} comentarios - Razón del rechazo
 * @returns {Promise<Object>} Contenido rechazado
 */
const rejectContent = async (ai_sec, usuario, comentarios = null) => {
  const pool = await poolPromise;
  
  try {
    await pool.request()
      .input('ai_sec', sql.Int, ai_sec)
      .input('usuario', sql.VarChar(20), usuario)
      .input('comentarios', sql.Text, comentarios)
      .query(`
        UPDATE dbo.articulos_ai_content
        SET ai_estado = 'R',
            ai_usuario_aprobador = @usuario,
            ai_fecha_aprobacion = GETDATE(),
            ai_comentarios = @comentarios
        WHERE ai_sec = @ai_sec
      `);
    
    return await getContentById(ai_sec);
  } catch (error) {
    console.error('[AI Model] Error rechazando contenido:', error);
    throw error;
  }
};

/**
 * Obtiene contenido por ID
 * @param {number} ai_sec - ID del contenido
 * @returns {Promise<Object|null>} Contenido o null
 */
const getContentById = async (ai_sec) => {
  const pool = await poolPromise;
  
  try {
    const result = await pool.request()
      .input('ai_sec', sql.Int, ai_sec)
      .query(`
        SELECT ai_sec, art_sec, ai_tipo, ai_contenido, ai_version, ai_estado,
               ai_idioma, ai_modelo, ai_tokens_usados, ai_costo_usd,
               ai_fecha_generacion, ai_usuario_aprobador, ai_fecha_aprobacion,
               ai_comentarios
        FROM dbo.articulos_ai_content
        WHERE ai_sec = @ai_sec
      `);
    
    if (result.recordset.length === 0) {
      return null;
    }
    
    const content = result.recordset[0];
    return {
      ...content,
      ai_contenido: JSON.parse(content.ai_contenido)
    };
  } catch (error) {
    console.error('[AI Model] Error obteniendo contenido por ID:', error);
    throw error;
  }
};

/**
 * Obtiene contenido pendiente de aprobación
 * @param {Object} filters - Filtros opcionales
 * @returns {Promise<Array>} Array de contenido pendiente
 */
const getPendingApprovals = async (filters = {}) => {
  const pool = await poolPromise;
  
  try {
    const limit = filters.limit ? parseInt(filters.limit) : null;
    
    let query = `
      SELECT ${limit ? `TOP ${limit}` : ''}
             aic.ai_sec, aic.art_sec, a.art_cod, a.art_nom, aic.ai_tipo,
             aic.ai_version, aic.ai_modelo, aic.ai_fecha_generacion,
             aic.ai_tokens_usados, aic.ai_costo_usd
      FROM dbo.articulos_ai_content aic
      INNER JOIN dbo.articulos a ON a.art_sec = aic.art_sec
      WHERE aic.ai_estado = 'P'
    `;
    
    const request = pool.request();
    
    if (filters.art_sec) {
      query += ' AND aic.art_sec = @art_sec';
      request.input('art_sec', sql.VarChar(30), filters.art_sec);
    }
    
    if (filters.ai_tipo) {
      query += ' AND aic.ai_tipo = @ai_tipo';
      request.input('ai_tipo', sql.VarChar(20), filters.ai_tipo);
    }
    
    query += ' ORDER BY aic.ai_fecha_generacion DESC';
    
    const result = await request.query(query);
    
    return result.recordset;
  } catch (error) {
    console.error('[AI Model] Error obteniendo pendientes:', error);
    throw error;
  }
};

/**
 * Obtiene contenido cacheado por hash de prompt
 * @param {string} promptHash - Hash del prompt
 * @param {number} maxAgeDays - Días máximos de antigüedad
 * @returns {Promise<Object|null>} Contenido cacheado o null
 */
const getCachedContent = async (promptHash, maxAgeDays = 30) => {
  const pool = await poolPromise;
  
  try {
    const result = await pool.request()
      .input('prompt_hash', sql.VarChar(64), promptHash)
      .input('max_age', sql.Int, maxAgeDays)
      .query(`
        SELECT TOP 1 ai_contenido, ai_modelo, ai_estado
        FROM dbo.articulos_ai_content
        WHERE ai_prompt_hash = @prompt_hash
          AND ai_estado = 'A'
          AND ai_fecha_generacion > DATEADD(day, -@max_age, GETDATE())
        ORDER BY ai_fecha_generacion DESC
      `);
    
    if (result.recordset.length === 0) {
      return null;
    }
    
    return result.recordset[0];
  } catch (error) {
    console.error('[AI Model] Error obteniendo cache:', error);
    return null;
  }
};

/**
 * Obtiene costo mensual de IA
 * @returns {Promise<number>} Costo total del mes actual en USD
 */
const getMonthlyCost = async () => {
  const pool = await poolPromise;
  
  try {
    const result = await pool.request()
      .query(`
        SELECT ISNULL(SUM(ai_costo_usd), 0) as total_cost
        FROM dbo.articulos_ai_content
        WHERE ai_fecha_generacion >= DATEADD(month, -1, GETDATE())
      `);
    
    return parseFloat(result.recordset[0].total_cost || 0);
  } catch (error) {
    console.error('[AI Model] Error obteniendo costo mensual:', error);
    return 0;
  }
};

/**
 * Guarda log de uso de IA
 * @param {Object} logData - Datos del log
 * @returns {Promise<Object>} Log guardado
 */
const logUsage = async (logData) => {
  const pool = await poolPromise;
  
  try {
    const result = await pool.request()
      .input('ai_sec', sql.Int, logData.ai_sec || null)
      .input('log_evento', sql.VarChar(50), logData.log_evento)
      .input('log_modelo', sql.VarChar(50), logData.log_modelo)
      .input('log_tokens_input', sql.Int, logData.log_tokens_input || 0)
      .input('log_tokens_output', sql.Int, logData.log_tokens_output || 0)
      .input('log_costo_usd', sql.Decimal(10, 6), logData.log_costo_usd || 0)
      .input('log_latencia_ms', sql.Int, logData.log_latencia_ms || 0)
      .input('log_error', sql.Text, logData.log_error || null)
      .input('log_usuario', sql.VarChar(20), logData.log_usuario || null)
      .query(`
        INSERT INTO dbo.ai_usage_log
        (ai_sec, log_evento, log_modelo, log_tokens_input, log_tokens_output,
         log_costo_usd, log_latencia_ms, log_error, log_usuario)
        OUTPUT INSERTED.log_sec, INSERTED.log_fecha
        VALUES (@ai_sec, @log_evento, @log_modelo, @log_tokens_input, @log_tokens_output,
                @log_costo_usd, @log_latencia_ms, @log_error, @log_usuario)
      `);
    
    return result.recordset[0];
  } catch (error) {
    console.error('[AI Model] Error guardando log:', error);
    throw error;
  }
};

/**
 * Obtiene estadísticas de uso de IA
 * @param {Object} filters - Filtros de fecha
 * @returns {Promise<Object>} Estadísticas
 */
const getUsageStats = async (filters = {}) => {
  const pool = await poolPromise;
  
  try {
    const fechaDesde = filters.fecha_desde || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fechaHasta = filters.fecha_hasta || new Date();
    
    const result = await pool.request()
      .input('fecha_desde', sql.DateTime, fechaDesde)
      .input('fecha_hasta', sql.DateTime, fechaHasta)
      .query(`
        SELECT
          ai_modelo,
          COUNT(*) as total_generaciones,
          SUM(ai_tokens_usados) as total_tokens,
          SUM(ai_costo_usd) as costo_total_usd,
          AVG(ai_tokens_usados) as promedio_tokens,
          AVG(ai_costo_usd) as promedio_costo_usd,
          SUM(CASE WHEN ai_estado = 'A' THEN 1 ELSE 0 END) as aprobados,
          SUM(CASE WHEN ai_estado = 'R' THEN 1 ELSE 0 END) as rechazados,
          SUM(CASE WHEN ai_estado = 'P' THEN 1 ELSE 0 END) as pendientes
        FROM dbo.articulos_ai_content
        WHERE ai_fecha_generacion BETWEEN @fecha_desde AND @fecha_hasta
        GROUP BY ai_modelo
        ORDER BY costo_total_usd DESC
      `);
    
    return result.recordset;
  } catch (error) {
    console.error('[AI Model] Error obteniendo estadísticas:', error);
    throw error;
  }
};

module.exports = {
  saveContent,
  getActiveContent,
  getContentVersions,
  approveContent,
  rejectContent,
  getContentById,
  getPendingApprovals,
  getCachedContent,
  getMonthlyCost,
  logUsage,
  getUsageStats
};
