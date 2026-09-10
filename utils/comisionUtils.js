/**
 * utils/comisionUtils.js
 *
 * Fuente unica de verdad para los porcentajes de comision por canal.
 * Reemplaza los literales que estaban embebidos en models/ventasKpiModel.js
 * (* 0.05 / * 0.025 y 5.0 / 2.5).
 *
 * Los valores viven en dbo.parametros:
 *   comision_woo   -> % aplicado al canal 'WooCommerce'
 *   comision_local -> % aplicado al canal 'Local'
 *
 * Si el parametro no existe, no es numerico o cae fuera de [0, 100], se usa el
 * default historico y se registra una advertencia.
 */

const { poolPromise, sql } = require('../db');

/** Defaults historicos: los valores que estaban hardcodeados antes de parametrizar. */
const DEFAULTS = Object.freeze({
  WooCommerce: 5.0,
  Local: 2.5
});

const PARAM_POR_CANAL = Object.freeze({
  WooCommerce: 'comision_woo',
  Local: 'comision_local'
});

/**
 * Convierte el valor crudo del parametro a un porcentaje valido.
 * @param {string|null} raw - valor tal como esta en dbo.parametros
 * @param {string} par_cod - codigo del parametro (para el log)
 * @param {number} fallback - default historico del canal
 * @returns {number} porcentaje entre 0 y 100
 */
const normalizarPorcentaje = (raw, par_cod, fallback) => {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    console.warn(`[COMISION] Parametro '${par_cod}' no existe. Usando default historico ${fallback}.`);
    return fallback;
  }

  const valor = Number(String(raw).trim().replace(',', '.'));

  if (!Number.isFinite(valor)) {
    console.warn(`[COMISION] Parametro '${par_cod}' no es numerico ("${raw}"). Usando default historico ${fallback}.`);
    return fallback;
  }

  if (valor < 0 || valor > 100) {
    console.warn(`[COMISION] Parametro '${par_cod}' fuera de rango [0,100] (${valor}). Usando default historico ${fallback}.`);
    return fallback;
  }

  return valor;
};

/**
 * Lee los porcentajes de comision vigentes desde dbo.parametros.
 *
 * Se lee en una sola consulta para que ambos canales reflejen el mismo instante:
 * al congelar los porcentajes en un cierre no puede pasar que WooCommerce venga
 * de antes de un cambio y Local de despues.
 *
 * @returns {Promise<{WooCommerce: number, Local: number}>} porcentajes (0-100)
 */
const obtenerPorcentajesComision = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('par_woo', sql.VarChar(50), PARAM_POR_CANAL.WooCommerce)
      .input('par_local', sql.VarChar(50), PARAM_POR_CANAL.Local)
      .query(`
        SELECT par_cod, par_value
        FROM dbo.parametros
        WHERE par_cod IN (@par_woo, @par_local)
      `);

    const porCodigo = new Map(result.recordset.map(r => [r.par_cod, r.par_value]));

    return {
      WooCommerce: normalizarPorcentaje(
        porCodigo.get(PARAM_POR_CANAL.WooCommerce) ?? null,
        PARAM_POR_CANAL.WooCommerce,
        DEFAULTS.WooCommerce
      ),
      Local: normalizarPorcentaje(
        porCodigo.get(PARAM_POR_CANAL.Local) ?? null,
        PARAM_POR_CANAL.Local,
        DEFAULTS.Local
      )
    };
  } catch (error) {
    // Un fallo leyendo parametros no debe tumbar el dashboard ni el cierre:
    // se degrada a los defaults historicos y se deja rastro en el log.
    console.error('[COMISION] Error leyendo parametros de comision, usando defaults historicos:', error.message);
    return { ...DEFAULTS };
  }
};

/**
 * Porcentaje aplicable a un canal. Canales desconocidos no generan comision.
 * @param {{WooCommerce: number, Local: number}} porcentajes
 * @param {string} canal
 * @returns {number}
 */
const porcentajeDeCanal = (porcentajes, canal) => {
  if (canal === 'WooCommerce') return porcentajes.WooCommerce;
  if (canal === 'Local') return porcentajes.Local;
  return 0;
};

/** Redondeo monetario a 2 decimales, estable frente a errores de coma flotante. */
const redondear2 = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

module.exports = {
  DEFAULTS,
  PARAM_POR_CANAL,
  obtenerPorcentajesComision,
  porcentajeDeCanal,
  redondear2
};
