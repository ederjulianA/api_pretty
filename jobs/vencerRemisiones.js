/**
 * jobs/vencerRemisiones.js — SPEC-013, Tarea 6 · SPEC-014 §5.6
 * Vencimiento automático de remisiones: una REM activa sin VTA cuyo `factura.fac_vence_el` ya pasó
 * se anula (stock vuelve a la vitrina); si es de un pedido web, el pedido en Woo se cancela con
 * nota "Sin pago en N días". Las REM manuales del POS vencen igual (decisión 15/sep/2026).
 *
 * Por qué: un pedido sin pagar bloquea stock indefinidamente (13 pedidos de más de 5 días al
 * 14/sep/2026). El 95 % de las transferencias pagan antes de 5 días (spec §2), así que
 * REM_DIAS_VENCIMIENTO=5 (decisión §8). Una persona puede extender el plazo desde la pantalla
 * (POST /api/pedidos-web/:rem/extender) — `fac_vence_el = NULL` significa "sin vencimiento".
 * woo_pedidos.vence_el es solo un espejo para la pantalla de pedidos web.
 *
 * Corre cada hora (setInterval) si WOO_VENCIMIENTO_ENABLED=true; también bajo demanda.
 * Reutiliza anularRemision (Tarea 5): primero cancela en Woo, después anula la REM y empuja.
 */
import { poolPromise, sql } from '../db.js';
import { anularRemision, upsertWooPedido, ESTADO_ERP } from '../models/pedidosWebModel.js';
import { destinoActivo, errorNegocio } from '../utils/documentosUtils.js';

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

/** REM activas (sin VTA activa cruzada) con vencimiento cumplido, web o manuales. */
export const listarVencidas = async () => {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT f.fac_nro AS fac_nro_rem, f.fac_nro_woo, f.fac_vence_el AS vence_el,
           TRY_CAST(f.fac_nro_woo AS INT) AS woo_order_id,
           ISNULL(p.woo_cliente, n.nit_nom) AS woo_cliente, p.woo_total, p.woo_payment_method,
           DATEDIFF(HOUR, f.fac_vence_el, SYSUTCDATETIME()) AS horas_vencida
    FROM dbo.factura f
    LEFT JOIN dbo.woo_pedidos p ON p.fac_nro_rem = f.fac_nro
    LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
    WHERE f.fac_tip_cod = 'REM' AND f.fac_est_fac = 'A'
      AND f.fac_vence_el IS NOT NULL AND f.fac_vence_el <= SYSUTCDATETIME()
      AND NOT EXISTS (SELECT 1 FROM dbo.factura v WHERE v.fac_nro = f.fac_nro_origen AND v.fac_tip_cod = 'VTA' AND v.fac_est_fac = 'A')
    ORDER BY f.fac_vence_el
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
      const esWeb = !!v.fac_nro_woo;
      try {
        const r = await anularRemision({ fac_nro_rem: v.fac_nro_rem, motivo, usuario: usuario || cfg.usuario, notificarWoo: esWeb });
        if (!r.ya_anulada) {
          resumen.anuladas++;
          log('INFO', `${esWeb ? `#${v.woo_order_id} ` : ''}${v.fac_nro_rem} vencida (${v.horas_vencida} h): anulada${esWeb ? ' y pedido Woo cancelado' : ' (remisión manual)'}`);
          if (esWeb) await upsertWooPedido({ woo_order_id: v.woo_order_id, ultima_accion: `REM ${v.fac_nro_rem} vencida y anulada automáticamente: ${motivo}; pedido Woo → cancelled` });
        }
      } catch (e) {
        resumen.errores.push({ woo_order_id: v.woo_order_id, fac_nro_rem: v.fac_nro_rem, error: e.message });
        log('ERROR', `${esWeb ? `#${v.woo_order_id} ` : ''}${v.fac_nro_rem}: no se pudo vencer: ${e.message}`);
        if (esWeb) try { await upsertWooPedido({ woo_order_id: v.woo_order_id, ultima_accion: `Vencimiento pendiente (reintenta en 1 h): ${e.message}`.slice(0, 1000) }); } catch (_) { /* nada */ }
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
  if (!fac_nro_rem) throw errorNegocio('fac_nro_rem es obligatorio', 400);
  if (!motivo || !String(motivo).trim()) throw errorNegocio('El motivo es obligatorio', 400);
  const pool = await poolPromise;
  const rs = await pool.request().input('rem', sql.VarChar(15), fac_nro_rem)
    .query(`SELECT fac_sec, fac_est_fac, fac_nro_woo, fac_vence_el FROM dbo.factura WHERE fac_nro = @rem AND fac_tip_cod = 'REM'`);
  if (!rs.recordset.length) throw errorNegocio(`Remisión ${fac_nro_rem} no existe`, 404);
  const rem = rs.recordset[0];
  if (rem.fac_est_fac !== 'A') throw errorNegocio(`${fac_nro_rem} no está activa (${rem.fac_est_fac}); no aplica extender el vencimiento`);
  const destino = await destinoActivo(pool, { fac_sec: Number(rem.fac_sec) });
  if (destino) throw errorNegocio(`${fac_nro_rem} ya está facturada en ${destino.fac_nro}; no vence`);

  let nueva = null;
  if (hasta !== null && hasta !== undefined && hasta !== '') {
    nueva = new Date(hasta);
    if (isNaN(nueva.getTime())) throw errorNegocio('Fecha inválida', 400);
    if (nueva.getTime() <= Date.now()) throw errorNegocio('La nueva fecha de vencimiento debe ser futura', 400);
  }
  const texto = nueva ? `Vencimiento extendido a ${nueva.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Vencimiento retirado (sin fecha)';
  await pool.request().input('sec', sql.Decimal(18, 0), Number(rem.fac_sec)).input('v', sql.DateTime2(0), nueva).input('u', sql.VarChar(100), usuario)
    .query(`UPDATE dbo.factura SET fac_vence_el = @v, fac_usu_cod_mod = @u, fac_fch_mod = GETDATE() WHERE fac_sec = @sec`);
  if (rem.fac_nro_woo) {
    await upsertWooPedido({ woo_order_id: Number(rem.fac_nro_woo), vence_el: nueva, ultima_accion: `${texto} por ${usuario}: ${String(motivo).trim()}` });
  }
  return { fac_nro_rem, woo_order_id: rem.fac_nro_woo ? Number(rem.fac_nro_woo) : null, vence_el: nueva, anterior: rem.fac_vence_el };
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
