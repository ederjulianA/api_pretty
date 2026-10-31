/**
 * jobs/activarPromociones.js — activación de promociones programadas (V-4, Black Friday 2026)
 *
 * Problema: guardar una promoción sincroniza con WooCommerce en ese momento, y la sincronización solo envía
 * `sale_price` si la promoción ya está vigente (precioUtils.obtenerPreciosConOferta compara contra "ahora").
 * Una promoción cargada antes de su fecha de inicio quedaba en el ERP pero en Woo se enviaba sale_price='' y
 * nada la activaba después: el ERP no tiene scheduler. Hasta el 30-10-2026 ninguna promoción se había cargado
 * por adelantado (todas se crearon el día de su inicio o después), por eso no se había visto.
 *
 * Por qué no se programa la oferta en Woo desde el día de carga (date_on_sale_from futura): con un `_sale_price`
 * guardado, el plugin precios-mayoristas deja de aplicar el precio mayorista aunque la oferta no haya empezado
 * (usa get_sale_price(), no is_on_sale()): la mayorista pagaría el detal esos días.
 *
 * Qué hace: cada PROMO_ACTIVACION_INTERVALO_MIN minutos busca promociones activas cuyo inicio ya llegó (en las
 * últimas VENTANA_HORAS), que se crearon ANTES de su inicio (programadas) y que siguen vigentes, y las sincroniza
 * con Woo igual que el botón Guardar de /promociones. Cada promoción se sincroniza una vez por proceso; si la API
 * se reinicia dentro de la ventana vuelve a sincronizarla, lo que es idempotente (el ERP es la fuente).
 *
 * Fuera de alcance: el fin. Woo termina la oferta solo con date_on_sale_to (cron woocommerce_scheduled_sales).
 * Si un artículo estuviera además en otra promoción vigente, al terminar esta Woo queda sin oferta hasta que se
 * guarde la otra: no se superponen promociones en el mismo artículo.
 *
 * Bandera: PROMO_ACTIVACION_ENABLED=true (ausente o false = comportamiento anterior, nada se activa solo).
 */
import { poolPromise, sql } from '../db.js';
import promocionModel from '../models/promocionModel.js';

const VENTANA_HORAS = 48;

export const config = () => ({
  enabled: String(process.env.PROMO_ACTIVACION_ENABLED || 'false').toLowerCase() === 'true',
  intervaloMin: Math.max(1, parseInt(process.env.PROMO_ACTIVACION_INTERVALO_MIN || '5', 10))
});

const log = (nivel, msg, datos) => {
  const linea = `[${new Date().toISOString()}] [${nivel}] [ACTIVACION_PROMOS] ${msg}`;
  if (datos !== undefined) console.log(linea, typeof datos === 'string' ? datos : JSON.stringify(datos));
  else console.log(linea);
};

const sincronizadas = new Set();
let enCurso = false;
let timer = null;

/** Promociones programadas cuyo inicio llegó en las últimas VENTANA_HORAS y siguen vigentes (hora de la BD). */
export const listarPorActivar = async () => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('ventana', sql.Int, VENTANA_HORAS)
    .query(`
      SELECT p.pro_sec, p.pro_codigo, p.pro_fecha_inicio, p.pro_fecha_fin, p.pro_permanente
      FROM dbo.promociones p
      WHERE p.pro_activa = 'S'
        AND p.pro_fecha_inicio <= GETDATE()
        AND p.pro_fecha_inicio > DATEADD(HOUR, -@ventana, GETDATE())
        AND p.pro_fecha_inicio > p.pro_fecha_creacion
        AND (p.pro_permanente = 'S' OR p.pro_fecha_fin >= GETDATE())
      ORDER BY p.pro_fecha_inicio
    `);
  return rs.recordset;
};

const clave = (p) => `${p.pro_sec}|${new Date(p.pro_fecha_inicio).toISOString()}`;

/** Un ciclo. Nunca lanza. Devuelve { revisadas, sincronizadas, errores:[...] }. */
export const ejecutarActivacion = async ({ origen = 'CRON' } = {}) => {
  if (enCurso) return { omitido: true, motivo: 'activación en curso' };
  enCurso = true;
  const resumen = { origen, revisadas: 0, sincronizadas: 0, errores: [] };
  try {
    const pendientes = (await listarPorActivar()).filter((p) => !sincronizadas.has(clave(p)));
    resumen.revisadas = pendientes.length;
    for (const p of pendientes) {
      try {
        const r = await promocionModel.sincronizarPreciosPromocion(p.pro_sec, { solo_activos: false });
        const d = r?.data || {};
        if (r?.success) {
          sincronizadas.add(clave(p));
          resumen.sincronizadas++;
          log('INFO', `promoción ${p.pro_sec} (${p.pro_codigo}) activada en Woo: ${d.articulos_exitosos}/${d.articulos_procesados} artículos, log ${d.log_id}`);
        } else {
          // No se marca: se reintenta en el siguiente ciclo
          resumen.errores.push({ pro_sec: p.pro_sec, error: `${d.articulos_con_error} artículos con error (log ${d.log_id})` });
          log('ERROR', `promoción ${p.pro_sec} (${p.pro_codigo}): ${d.articulos_con_error} artículos con error, se reintenta (log ${d.log_id})`);
        }
      } catch (e) {
        resumen.errores.push({ pro_sec: p.pro_sec, error: e.message });
        log('ERROR', `promoción ${p.pro_sec} (${p.pro_codigo}): ${e.message}; se reintenta en el siguiente ciclo`);
      }
    }
    return resumen;
  } catch (e) {
    log('ERROR', `ciclo de activación falló: ${e.message}`);
    return { ...resumen, error: e.message };
  } finally {
    enCurso = false;
  }
};

export const iniciarActivacionPromociones = () => {
  const cfg = config();
  if (!cfg.enabled) { log('INFO', 'PROMO_ACTIVACION_ENABLED no es true: activador de promociones programadas apagado'); return null; }
  if (timer) return timer;
  log('INFO', `activador de promociones programadas ACTIVO · cada ${cfg.intervaloMin} min · ventana ${VENTANA_HORAS} h`);
  setTimeout(() => { ejecutarActivacion({ origen: 'ARRANQUE' }).catch(() => {}); }, 60 * 1000);
  timer = setInterval(() => { ejecutarActivacion({ origen: 'CRON' }).catch(() => {}); }, cfg.intervaloMin * 60 * 1000);
  return timer;
};

export const detenerActivacionPromociones = () => { if (timer) { clearInterval(timer); timer = null; } };
