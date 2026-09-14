// jobs/updateWooOrderStatusAndStock.js
//
// SPEC-013 Tarea 2 — CAPA DE COMPATIBILIDAD.
// Antes este archivo empujaba stock a WooCommerce por su cuenta (products/batch) y cambiaba el
// estado del pedido en la misma función. Ahora el stock lo escribe ÚNICAMENTE
// services/wooStockService.js; aquí solo quedan:
//   - los helpers de lectura que siguen usando productPhotoController.js y wooSyncController.js
//     (getArticleStock, getArticleWooId, getArticleWooInfo) y logEder;
//   - updateWooOrderStatusAndStock() como wrapper que delega en el servicio, para las rutas
//     huérfanas que aún lo importan (routes/testSyncRoutes.js, routes/wooRoutes.js — en la cola
//     de SEC-10). No usar en código nuevo: llamar al servicio directamente.
import { poolPromise, sql } from "../db.js";
import { sincronizarExistenciasWoo, actualizarEstadoPedidoWoo, determinarEstadoWooAlFacturar } from "../services/wooStockService.js";

const log = (level, message, data = null) => {
  const line = `[${new Date().toISOString()}] [${level}] [WOO] ${message}`;
  if (data) console.log(line, JSON.stringify(data));
  else console.log(line);
  return { timestamp: new Date().toISOString(), level, message, data };
};

/** Normaliza el estado de WooCommerce (guiones → guiones bajos). Sin cambios. */
export const normalizeWooCommerceStatus = (status) => {
  if (!status || typeof status !== 'string') return status;
  return status.replace(/-/g, '_');
};

/** Mapeo al estado que se manda a Woo al facturar. Vive ahora en el servicio; se reexporta. */
export const determineWooCommerceStatus = determinarEstadoWooAlFacturar;

export const logEder = async (logDesc) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('LogDesc', sql.NVarChar(sql.MAX), logDesc)
      .query(`INSERT INTO dbo.LogEd (LogDesc) VALUES (@LogDesc)`);
  } catch (error) {
    console.error('Error al guardar en LogEd:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Helpers de lectura (sin cambios de comportamiento)
// ---------------------------------------------------------------------------
export const getArticleStock = async (art_sec, { silent = false } = {}) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT existencia FROM dbo.vwExistencias WHERE art_sec = @art_sec");
    const stock = result.recordset.length > 0 ? Number(result.recordset[0].existencia) : 0;
    if (!silent) log('INFO', `Stock encontrado para art_sec ${art_sec}: ${stock}`);
    return stock;
  } catch (error) {
    if (!silent) log('ERROR', `Error obteniendo stock para art_sec ${art_sec}`, { error: error.message });
    throw error;
  }
};

export const getArticleWooId = async (art_sec, { silent = false } = {}) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query("SELECT art_woo_id, art_woo_type, art_woo_variation_id, art_sec_padre FROM dbo.articulos WHERE art_sec = @art_sec");
    if (result.recordset.length === 0) {
      if (!silent) log('INFO', `art_woo_id no encontrado para art_sec ${art_sec}`);
      return '';
    }
    return result.recordset[0].art_woo_id;
  } catch (error) {
    if (!silent) log('ERROR', `Error buscando art_woo_id para art_sec ${art_sec}`, { error: error.message });
    throw error;
  }
};

export const getArticleWooInfo = async (art_sec, { silent = false } = {}) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("art_sec", sql.VarChar(50), art_sec)
      .query(`
        SELECT a.art_woo_id, a.art_woo_type, a.art_woo_variation_id, a.art_sec_padre,
               p.art_woo_id AS parent_woo_id
        FROM dbo.articulos a
        LEFT JOIN dbo.articulos p ON a.art_sec_padre = p.art_sec
        WHERE a.art_sec = @art_sec
      `);
    if (result.recordset.length === 0) return null;
    const row = result.recordset[0];
    return {
      art_woo_id: row.art_woo_id,
      art_woo_type: row.art_woo_type || 'simple',
      art_woo_variation_id: row.art_woo_variation_id,
      art_sec_padre: row.art_sec_padre,
      parent_woo_id: row.parent_woo_id
    };
  } catch (error) {
    if (!silent) log('ERROR', `Error buscando info WooCommerce para art_sec ${art_sec}`, { error: error.message });
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Wrapper de compatibilidad — delega en el punto único
// ---------------------------------------------------------------------------
/**
 * @deprecated Usar services/wooStockService.js. Se conserva la firma y la forma del resultado
 * ({ messages, summary, debugLogs }) para las rutas huérfanas que todavía lo importan.
 * Los parámetros fac_fec y actualiza_fecha ya no se usan: el servicio no manda date_created
 * al producto (eso cambiaba la fecha de publicación en Woo sin motivo).
 */
const updateWooOrderStatusAndStock = async (fac_nro_woo, orderDetails, fac_fec = null, fac_nro = null, actualiza_fecha = 'N') => {
  const startTime = Date.now();
  const debugLogs = [log('WARN', 'updateWooOrderStatusAndStock es un wrapper de compatibilidad; usar wooStockService', { fac_nro, fac_nro_woo })];
  const messages = [];

  if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
    throw new Error('orderDetails debe ser un array no vacío de artículos');
  }

  const push = await sincronizarExistenciasWoo({
    art_secs: orderDetails.map((d) => d.art_sec),
    origen: 'MANUAL',
    referencia: fac_nro || (fac_nro_woo ? `woo:${fac_nro_woo}` : 'legacy')
  });
  messages.push(...push.messages);

  if (fac_nro_woo) {
    try {
      const pool = await poolPromise;
      const rs = await pool.request()
        .input('fac_nro_woo', sql.VarChar(50), String(fac_nro_woo))
        .query('SELECT TOP 1 fac_est_woo FROM dbo.factura WHERE fac_nro_woo = @fac_nro_woo ORDER BY fac_fch_cre DESC');
      const actual = rs.recordset.length ? rs.recordset[0].fac_est_woo : null;
      const wooStatus = determinarEstadoWooAlFacturar(actual);
      const r = await actualizarEstadoPedidoWoo(fac_nro_woo, wooStatus);
      messages.push(r.ok
        ? `Pedido ${fac_nro_woo} actualizado a '${wooStatus}' en WooCommerce (estado original: ${actual || 'N/A'}).`
        : `Error actualizando pedido ${fac_nro_woo}: ${r.error}`);
    } catch (e) {
      messages.push(`Error actualizando pedido ${fac_nro_woo}: ${e.message}`);
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  return {
    messages,
    summary: {
      totalItems: orderDetails.length,
      successCount: push.enviados,
      errorCount: push.errores,
      skippedCount: push.omitidos,
      duration: `${duration} segundos`,
      batchesProcessed: Math.ceil(push.enviados / 10),
      logId: push.logId,
      fac_nro
    },
    debugLogs
  };
};

export { updateWooOrderStatusAndStock };
export default updateWooOrderStatusAndStock;
