/**
 * jobs/vencerRemisiones.js — SPEC-013, Tarea 6
 * Vencimiento automático de remisiones web: una REM activa cuyo `vence_el` ya pasó se anula
 * (stock vuelve a la vitrina) y el pedido en Woo se cancela con nota "Sin pago en N días".
 *
 * Por qué: hoy un pedido sin pagar bloquea stock indefinidamente (13 pedidos de más de 5 días
 * al 14/sep/2026). El 95 % de las transferencias pagan antes de 5 días (spec §2), así que
 * REM_DIAS_VENCIMIENTO=5 (decisión §8). Una persona puede extender el plazo desde la pantalla
 * (POST /api/pedidos-web/:rem/extender) — `vence_el = NULL` significa "sin vencimiento".
 *
 * Corre cada hora (setInterval) si WOO_VENCIMIENTO_ENABLED=true; también bajo demanda.
 * Reutiliza anularRemision (Tarea 5): primero cancela en Woo, después anula la REM y empuja.
 */
import { poolPromise, sql } from '../db.js';
import { anularRemision, upsertWooPedido, ESTADO_ERP } from '../models/pedidosWebModel.js';

export const config = () => ({
  enabled: String(process.env.WOO_VENCIMIENTO_ENABLED || 'false').toLowerCase() === 'true',
  intervaloMin: Math.max(5, parseInt(process.env.WOO_VENCIMIENTO_INTERVALO_MIN || '60', 10)),
  dias: Math.max(1, parseInt(process.env.REM_DIAS_VENCIMIENTO || '5', 10)),
  usuario: process.env.WOO_IMPORT_USUARIO || 'SISTEMA'
});

const log = (nivel, msg, datos) => {
  const linea = `[${new Date().toISOString()}] [${nivel}] [VENCIMIENTO] ${msg}`;
  if (datos !== undefined) console.log(linea, typeof datos === 'string' ? datos : JSON.stringify(datos));
  else console.log(linea);
};

let enCurso = false;
let timer = null;

/** REM activas con vencimiento cumplido. */
export const listarVencidas = async () => {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT p.woo_order_id, p.fac_nro_rem, p.vence_el, p.woo_cliente, p.woo_total, p.woo_payment_method,
           DATEDIFF(HOUR, p.vence_el, SYSUTCDATETIME()) AS horas_vencida
    FROM dbo.woo_pedidos p
    WHERE p.estado_erp = '${ESTADO_ERP.REM_ACTIVA}' AND p.vence_el IS NOT NULL AND p.vence_el <= SYSUTCDATETIME()
    ORDER BY p.vence_el
  `);
  return rs.recordset;
};

/**
 * Anula todas las REM vencidas. Nunca lanza. Devuelve { revisadas, anuladas, errores:[...] }.
 * Un fallo en una REM (p. ej. Woo no acepta la cancelación) no frena a las demás; queda en
 * ultima_accion y se reintenta en la siguiente hora.
 */
export const ejecutarVencimiento = async ({ origen = 'CRON', usuario = null } = {}) => {
  const cfg = config();
  if (enCurso) return { omitido: true, motivo: 'vencimiento en curso' };
  enCurso = true;
  const resumen = { origen, revisadas: 0, anuladas: 0, errores: [] };
  try {
    const vencidas = await listarVencidas();
    resumen.revisadas = vencidas.length;
    for (const v of vencidas) {
      const motivo = `Sin pago en ${cfg.dias} días (vencida el ${new Date(v.vence_el).toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
      try {
        const r = await anularRemision({ fac_nro_rem: v.fac_nro_rem, motivo, usuario: usuario || cfg.usuario, notificarWoo: true });
        if (!r.ya_anulada) {
          resumen.anuladas++;
          log('INFO', `#${v.woo_order_id} ${v.fac_nro_rem} vencida (${v.horas_vencida} h): anulada y pedido Woo cancelado`);
          await upsertWooPedido({ woo_order_id: v.woo_order_id, ultima_accion: `REM ${v.fac_nro_rem} vencida y anulada automáticamente: ${motivo}; pedido Woo → cancelled` });
        }
      } catch (e) {
        resumen.errores.push({ woo_order_id: v.woo_order_id, fac_nro_rem: v.fac_nro_rem, error: e.message });
        log('ERROR', `#${v.woo_order_id} ${v.fac_nro_rem}: no se pudo vencer: ${e.message}`);
        try { await upsertWooPedido({ woo_order_id: v.woo_order_id, ultima_accion: `Vencimiento pendiente (reintenta en 1 h): ${e.message}`.slice(0, 1000) }); } catch (_) { /* nada */ }
      }
    }
    if (resumen.revisadas) log('INFO', `${origen}: ${resumen.revisadas} vencidas, ${resumen.anuladas} anuladas, ${resumen.errores.length} con error`);
    return resumen;
  } catch (e) {
    log('ERROR', `ciclo de vencimiento falló: ${e.message}`);
    return { ...resumen, error: e.message };
  } finally {
    enCurso = false;
  }
};

/**
 * Extiende (o quita) el vencimiento de una REM activa desde la pantalla.
 * @param {object} p
 * @param {string} p.fac_nro_rem
 * @param {string|Date|null} p.hasta   nueva fecha (ISO) o null = sin vencimiento
 * @param {string} p.motivo
 * @param {string} p.usuario
 */
export const extenderVencimiento = async ({ fac_nro_rem, hasta, motivo, usuario = 'SISTEMA' }) => {
  if (!fac_nro_rem) throw new Error('fac_nro_rem es obligatorio');
  if (!motivo || !String(motivo).trim()) throw new Error('El motivo es obligatorio');
  const pool = await poolPromise;
  const rs = await pool.request().input('rem', sql.VarChar(15), fac_nro_rem)
    .query(`SELECT woo_order_id, estado_erp, vence_el FROM dbo.woo_pedidos WHERE fac_nro_rem = @rem`);
  if (!rs.recordset.length) throw new Error(`No hay seguimiento para ${fac_nro_rem}`);
  const fila = rs.recordset[0];
  if (fila.estado_erp !== ESTADO_ERP.REM_ACTIVA) throw new Error(`${fac_nro_rem} no está activa (${fila.estado_erp}); no aplica extender el vencimiento`);

  let nueva = null;
  if (hasta !== null && hasta !== undefined && hasta !== '') {
    nueva = new Date(hasta);
    if (isNaN(nueva.getTime())) throw new Error('Fecha inválida');
    if (nueva.getTime() <= Date.now()) throw new Error('La nueva fecha de vencimiento debe ser futura');
  }
  const texto = nueva ? `Vencimiento extendido a ${nueva.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Vencimiento retirado (sin fecha)';
  await upsertWooPedido({ woo_order_id: fila.woo_order_id, vence_el: nueva, ultima_accion: `${texto} por ${usuario}: ${String(motivo).trim()}` });
  return { fac_nro_rem, woo_order_id: fila.woo_order_id, vence_el: nueva, anterior: fila.vence_el };
};

export const iniciarVencimientoRemisiones = () => {
  const cfg = config();
  if (!cfg.enabled) { log('INFO', 'WOO_VENCIMIENTO_ENABLED no es true: vencimiento automático apagado'); return null; }
  if (timer) return timer;
  log('INFO', `vencimiento automático ACTIVO · cada ${cfg.intervaloMin} min · REM_DIAS_VENCIMIENTO=${cfg.dias}`);
  setTimeout(() => { ejecutarVencimiento({ origen: 'CRON' }).catch(() => {}); }, 2 * 60 * 1000);
  timer = setInterval(() => { ejecutarVencimiento({ origen: 'CRON' }).catch(() => {}); }, cfg.intervaloMin * 60 * 1000);
  return timer;
};

export const detenerVencimientoRemisiones = () => { if (timer) { clearInterval(timer); timer = null; } };

export const estadoVencimiento = () => ({ ...config(), programado: timer !== null, enCurso });
