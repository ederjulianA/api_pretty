/**
 * jobs/reconciliarInventarioWoo.js — SPEC-013, Tarea 7
 * Reconciliación nocturna ERP ↔ WooCommerce (y bajo demanda desde POST /api/woo/reconciliar).
 *
 * Qué hace (spec §5 Tarea 7, §4.1 P6):
 *  1. Reintenta woo_sync_pendientes (pushes que fallaron).
 *  2. Compara vwExistencias con el stock de Woo para TODOS los artículos con id de Woo
 *     (simples por products, variaciones por products/{padre}/variations).
 *  3. Si WOO_RECONCILIACION_AUTOCORREGIR=true, empuja las diferencias por el punto único
 *     (origen RECONCILIACION). Siempre guarda el reporte en woo_reconciliaciones.
 *  4. Invariantes: pedidos Woo comprometidos sin REM/VTA; REM activas vencidas sin anular;
 *     VTA activas con pedido cancelado/reembolsado; artículos con diferencia dos noches seguidas;
 *     y existencias negativas, separando las que tienen pedido web (REM/VTA con alerta) de las
 *     que NO tienen ninguno — el hueco que la alerta de la Fase 2 no cubre.
 *
 * La reconciliación CORRIGE Woo (si se le permite) y REPORTA; una diferencia repetida se
 * investiga: algo escribe stock por fuera del ERP.
 *
 * Scheduler propio (setTimeout hasta la próxima WOO_RECONCILIACION_HORA, default 02:00 hora
 * local del servidor), sin dependencias nuevas, igual que el importador.
 */
import { poolPromise, sql } from '../db.js';
import { getWcApi } from '../services/wooClient.js';
import { sincronizarExistenciasWoo, reintentarPendientes } from '../services/wooStockService.js';

export const config = () => ({
  enabled: String(process.env.WOO_RECONCILIACION_ENABLED || 'false').toLowerCase() === 'true',
  autocorregir: String(process.env.WOO_RECONCILIACION_AUTOCORREGIR || 'false').toLowerCase() === 'true',
  hora: /^\d{2}:\d{2}$/.test(process.env.WOO_RECONCILIACION_HORA || '') ? process.env.WOO_RECONCILIACION_HORA : '02:00',
  timeoutMs: 60000
});

const log = (nivel, msg, datos) => {
  const linea = `[${new Date().toISOString()}] [${nivel}] [RECONCILIACION] ${msg}`;
  if (datos !== undefined) console.log(linea, typeof datos === 'string' ? datos : JSON.stringify(datos));
  else console.log(linea);
};

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------
/** Artículos del ERP con identidad en Woo + existencia actual. */
const leerArticulosErp = async () => {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT a.art_sec, a.art_cod, a.art_nom, a.art_woo_id, ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
           a.art_woo_variation_id, p.art_woo_id AS padre_woo_id, ISNULL(e.existencia, 0) AS existencia
    FROM dbo.articulos a
    LEFT JOIN dbo.articulos p ON p.art_sec = a.art_sec_padre
    LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
    WHERE (a.art_woo_id IS NOT NULL OR a.art_woo_variation_id IS NOT NULL)
      AND ISNULL(a.art_woo_type, 'simple') <> 'variable'      -- el padre variable no tiene stock propio
  `);
  return rs.recordset.map((r) => ({
    ...r,
    art_sec: String(r.art_sec),
    existencia: Number(r.existencia),
    wooId: r.art_woo_type === 'variation' ? Number(r.art_woo_variation_id) : Number(r.art_woo_id)
  }));
};

/** Todo el stock de Woo: productos (paginado) + variaciones de cada variable. Map<id, {...}>. */
const leerStockWoo = async (cfg) => {
  const api = getWcApi({ timeoutMs: cfg.timeoutMs });
  const mapa = new Map();
  const variables = [];
  let page = 1; let totalPages = 1;
  do {
    const r = await api.get('products', { status: 'any', per_page: 100, page, _fields: 'id,sku,type,status,manage_stock,stock_quantity,stock_status' });
    for (const p of r.data) {
      mapa.set(Number(p.id), { id: Number(p.id), sku: p.sku, type: p.type, status: p.status, manage_stock: p.manage_stock === true, stock: p.stock_quantity, stock_status: p.stock_status });
      if (p.type === 'variable') variables.push(p.id);
    }
    totalPages = parseInt(r.headers?.['x-wp-totalpages'] || '1', 10) || 1;
    page++;
  } while (page <= totalPages && page <= 100);

  for (const padre of variables) {
    let vp = 1; let vt = 1;
    do {
      const r = await api.get(`products/${padre}/variations`, { per_page: 100, page: vp, _fields: 'id,sku,manage_stock,stock_quantity,stock_status' });
      for (const v of r.data) {
        // manage_stock puede ser true, false o 'parent' (hereda del padre): solo true tiene stock propio comparable
        mapa.set(Number(v.id), { id: Number(v.id), sku: v.sku, type: 'variation', parent: padre, status: 'publish', manage_stock: v.manage_stock === true, manage_parent: v.manage_stock === 'parent', stock: v.stock_quantity, stock_status: v.stock_status });
      }
      vt = parseInt(r.headers?.['x-wp-totalpages'] || '1', 10) || 1;
      vp++;
    } while (vp <= vt && vp <= 10);
  }
  return mapa;
};

// ---------------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------------
const comparar = (articulos, stockWoo) => {
  const diferencias = [];      // ERP ≠ Woo con stock gestionado
  const sinControl = [];       // producto sin manage_stock en Woo (no se puede comparar ni corregir)
  const noExisten = [];        // art_woo_id apunta a un producto que ya no está en Woo
  let comparados = 0;
  for (const a of articulos) {
    const w = stockWoo.get(a.wooId);
    if (!w) { noExisten.push({ art_sec: a.art_sec, art_cod: a.art_cod, art_nom: a.art_nom, woo_id: a.wooId, tipo: a.art_woo_type, erp: a.existencia }); continue; }
    if (!w.manage_stock) { sinControl.push({ art_sec: a.art_sec, art_cod: a.art_cod, woo_id: a.wooId, tipo: a.art_woo_type, erp: a.existencia, hereda_padre: !!w.manage_parent, status: w.status }); continue; }
    comparados++;
    const woo = w.stock == null ? 0 : Number(w.stock);
    if (woo !== a.existencia) {
      diferencias.push({ art_sec: a.art_sec, art_cod: a.art_cod, art_nom: a.art_nom, woo_id: a.wooId, tipo: a.art_woo_type, erp: a.existencia, woo, diferencia: a.existencia - woo, status: w.status });
    }
  }
  diferencias.sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia));
  return { diferencias, sinControl, noExisten, comparados };
};

// ---------------------------------------------------------------------------
// Invariantes (spec Tarea 7 punto 4 + negativos)
// ---------------------------------------------------------------------------
const invariantes = async (diferenciasActuales) => {
  const pool = await poolPromise;
  const out = {};

  // a. Pedidos Woo en estado que compromete stock sin REM/VTA vigente en el ERP (según lo último que vio el importador)
  const a = await pool.request().query(`
    SELECT p.woo_order_id, p.woo_status, p.estado_erp, p.error, p.actualizado_en
    FROM dbo.woo_pedidos p
    WHERE p.woo_status IN ('on-hold','processing','completed','epayco-processing','epayco-completed')
      AND p.estado_erp NOT IN ('REM_ACTIVA','FACTURADO')
      AND NOT EXISTS (SELECT 1 FROM dbo.factura f WHERE f.fac_nro_woo = CAST(p.woo_order_id AS VARCHAR(15)) AND f.fac_tip_cod IN ('REM','VTA') AND f.fac_est_fac = 'A')
    ORDER BY p.woo_order_id
  `);
  out.pedidos_comprometidos_sin_documento = a.recordset;

  // b. REM activas vencidas sin anular (la Tarea 6 las anulará; mientras, se reportan)
  const b = await pool.request().query(`
    SELECT woo_order_id, fac_nro_rem, vence_el, DATEDIFF(HOUR, vence_el, SYSUTCDATETIME()) AS horas_vencida
    FROM dbo.woo_pedidos WHERE estado_erp = 'REM_ACTIVA' AND vence_el IS NOT NULL AND vence_el < SYSUTCDATETIME()
    ORDER BY vence_el
  `);
  out.rem_vencidas_sin_anular = b.recordset;

  // c. VTA activa cuyo pedido Woo está cancelado o reembolsado (decisión contable humana)
  const c = await pool.request().query(`
    SELECT p.woo_order_id, p.woo_status, p.estado_erp, f.fac_nro AS fac_nro_vta, f.fac_fec
    FROM dbo.woo_pedidos p
    INNER JOIN dbo.factura f ON f.fac_nro_woo = CAST(p.woo_order_id AS VARCHAR(15)) AND f.fac_tip_cod = 'VTA' AND f.fac_est_fac = 'A'
    WHERE p.woo_status IN ('cancelled','refunded','failed','epayco-cancelled','epayco-refunded','epayco-failed')
    ORDER BY p.woo_order_id
  `);
  out.vta_activa_con_pedido_cancelado = c.recordset;

  // d. Existencias negativas: con pedido web activo (esperable, ya alertado) vs SIN ninguno (algo más pasa)
  const d = await pool.request().query(`
    SELECT a.art_sec, a.art_cod, a.art_nom, e.existencia,
           (SELECT STRING_AGG(f.fac_nro, ', ') FROM dbo.factura f INNER JOIN dbo.facturakardes k ON k.fac_sec = f.fac_sec
             WHERE k.art_sec = a.art_sec AND f.fac_tip_cod = 'REM' AND f.fac_est_fac = 'A') AS rem_activas,
           (SELECT STRING_AGG(f.fac_nro, ', ') FROM dbo.factura f INNER JOIN dbo.facturakardes k ON k.fac_sec = f.fac_sec
             WHERE k.art_sec = a.art_sec AND f.fac_tip_cod = 'VTA' AND f.fac_est_fac = 'A' AND f.fac_nro_woo IS NOT NULL
               AND f.fac_fch_cre >= DATEADD(DAY, -7, GETDATE())) AS vta_web_recientes
    FROM dbo.vwExistencias e
    INNER JOIN dbo.articulos a ON a.art_sec = e.art_sec
    WHERE e.existencia < 0 AND ISNULL(a.art_bundle, 'N') <> 'S'
    ORDER BY e.existencia
  `);
  const negativos = d.recordset.map((r) => ({ ...r, art_sec: String(r.art_sec), existencia: Number(r.existencia) }));
  out.negativos_con_pedido_web = negativos.filter((n) => n.rem_activas || n.vta_web_recientes);
  out.negativos_sin_pedido_web = negativos.filter((n) => !n.rem_activas && !n.vta_web_recientes);

  // e. Diferencias repetidas respecto a la reconciliación anterior (algo escribe stock por fuera del ERP)
  const prev = await pool.request().query(`SELECT TOP 1 id, ejecutada_en, diferencias FROM dbo.woo_reconciliaciones ORDER BY id DESC`);
  out.diferencias_repetidas = [];
  if (prev.recordset.length && prev.recordset[0].diferencias) {
    try {
      const anteriores = new Map(JSON.parse(prev.recordset[0].diferencias).map((x) => [String(x.art_sec), x]));
      for (const dif of diferenciasActuales) {
        const ant = anteriores.get(String(dif.art_sec));
        if (ant) out.diferencias_repetidas.push({ ...dif, anterior: { erp: ant.erp, woo: ant.woo, fecha: prev.recordset[0].ejecutada_en } });
      }
    } catch (e) { /* JSON viejo ilegible: se omite */ }
  }

  out.resumen = {
    pedidos_comprometidos_sin_documento: out.pedidos_comprometidos_sin_documento.length,
    rem_vencidas_sin_anular: out.rem_vencidas_sin_anular.length,
    vta_activa_con_pedido_cancelado: out.vta_activa_con_pedido_cancelado.length,
    negativos_con_pedido_web: out.negativos_con_pedido_web.length,
    negativos_sin_pedido_web: out.negativos_sin_pedido_web.length,
    diferencias_repetidas: out.diferencias_repetidas.length
  };
  return out;
};

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
let enCurso = false;

/**
 * Corre una reconciliación completa. Nunca lanza: devuelve el reporte (con `error` si falló).
 * @param {object} p
 * @param {boolean} [p.autocorregir]  default: WOO_RECONCILIACION_AUTOCORREGIR
 * @param {string}  [p.origen]        'CRON' | 'MANUAL'
 * @param {string}  [p.usuario]
 */
export const ejecutarReconciliacion = async ({ autocorregir = null, origen = 'MANUAL', usuario = null } = {}) => {
  const cfg = config();
  const corregir = autocorregir === null ? cfg.autocorregir : !!autocorregir;
  if (enCurso) return { omitido: true, motivo: 'ya hay una reconciliación en curso' };
  enCurso = true;
  const inicio = Date.now();
  const reporte = { origen, usuario, autocorregir: corregir, inicio: new Date(inicio).toISOString() };
  try {
    // 1. Pendientes de pushes anteriores
    reporte.pendientes = await reintentarPendientes();

    // 2. Leer ambos lados
    const [articulos, stockWoo] = await Promise.all([leerArticulosErp(), leerStockWoo(cfg)]);
    reporte.articulos_erp = articulos.length;
    reporte.productos_woo = stockWoo.size;

    // 3. Comparar
    const { diferencias, sinControl, noExisten, comparados } = comparar(articulos, stockWoo);
    reporte.comparados = comparados;
    reporte.diferencias = diferencias;
    reporte.sin_control_stock = sinControl;
    reporte.no_existen_en_woo = noExisten;

    // 4. Corregir (solo lo comparable: producto existe en Woo y gestiona stock)
    reporte.corregidos = 0;
    if (corregir && diferencias.length) {
      const push = await sincronizarExistenciasWoo({ art_secs: diferencias.map((d) => d.art_sec), origen: 'RECONCILIACION', referencia: `reconciliacion-${origen.toLowerCase()}`, usuario });
      reporte.push = { ok: push.ok, enviados: push.enviados, errores: push.errores, omitidos: push.omitidos, logId: push.logId, simulado: !!push.simulado };
      reporte.corregidos = push.enviados || 0;
    }

    // 5. Invariantes
    reporte.invariantes = await invariantes(diferencias);
    reporte.duracion_ms = Date.now() - inicio;

    // 6. Guardar
    reporte.id = await guardarReporte(reporte);
    const r = reporte.invariantes.resumen;
    log(diferencias.length || r.negativos_sin_pedido_web || r.pedidos_comprometidos_sin_documento ? 'WARN' : 'INFO',
      `${origen}: ${comparados} comparados, ${diferencias.length} diferentes, ${reporte.corregidos} corregidos, ${noExisten.length} sin producto en Woo, ${sinControl.length} sin control de stock · invariantes ${JSON.stringify(r)} (${reporte.duracion_ms} ms)`);
    return reporte;
  } catch (e) {
    reporte.error = e.message;
    reporte.duracion_ms = Date.now() - inicio;
    log('ERROR', `falló: ${e.message}`);
    try { reporte.id = await guardarReporte(reporte); } catch (_) { /* nada */ }
    return reporte;
  } finally {
    enCurso = false;
  }
};

const guardarReporte = async (rep) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('total_comparados', sql.Int, rep.comparados || 0)
    .input('total_diferentes', sql.Int, (rep.diferencias || []).length)
    .input('corregidos', sql.Int, rep.corregidos || 0)
    .input('autocorregir', sql.Bit, rep.autocorregir ? 1 : 0)
    .input('diferencias', sql.NVarChar(sql.MAX), JSON.stringify(rep.diferencias || []))
    .input('invariantes', sql.NVarChar(sql.MAX), JSON.stringify({
      ...(rep.invariantes || {}),
      no_existen_en_woo: rep.no_existen_en_woo || [],
      sin_control_stock: rep.sin_control_stock || [],
      pendientes: rep.pendientes || null,
      push: rep.push || null,
      error: rep.error || null
    }))
    .input('origen', sql.VarChar(20), rep.origen || null)
    .input('usuario', sql.VarChar(100), rep.usuario || null)
    .input('duracion_ms', sql.Int, rep.duracion_ms || null)
    .query(`
      INSERT INTO dbo.woo_reconciliaciones (total_comparados, total_diferentes, corregidos, autocorregir, diferencias, invariantes, origen, usuario, duracion_ms)
      VALUES (@total_comparados, @total_diferentes, @corregidos, @autocorregir, @diferencias, @invariantes, @origen, @usuario, @duracion_ms);
      SELECT SCOPE_IDENTITY() AS id;
    `);
  return rs.recordset[0].id;
};

// ---------------------------------------------------------------------------
// Consulta de reportes (para la pantalla)
// ---------------------------------------------------------------------------
export const listarReconciliaciones = async ({ limite = 30 } = {}) => {
  const pool = await poolPromise;
  const rs = await pool.request().input('limite', sql.Int, Math.min(Math.max(1, Number(limite) || 30), 365)).query(`
    SELECT TOP (@limite) id, ejecutada_en, total_comparados, total_diferentes, corregidos, autocorregir, origen, usuario, duracion_ms,
           JSON_VALUE(invariantes, '$.resumen.pedidos_comprometidos_sin_documento') AS inv_sin_doc,
           JSON_VALUE(invariantes, '$.resumen.rem_vencidas_sin_anular') AS inv_rem_vencidas,
           JSON_VALUE(invariantes, '$.resumen.vta_activa_con_pedido_cancelado') AS inv_vta_cancelado,
           JSON_VALUE(invariantes, '$.resumen.negativos_con_pedido_web') AS inv_neg_con_pedido,
           JSON_VALUE(invariantes, '$.resumen.negativos_sin_pedido_web') AS inv_neg_sin_pedido,
           JSON_VALUE(invariantes, '$.resumen.diferencias_repetidas') AS inv_repetidas,
           JSON_VALUE(invariantes, '$.error') AS error
    FROM dbo.woo_reconciliaciones ORDER BY id DESC
  `);
  return rs.recordset;
};

export const obtenerReconciliacion = async (id) => {
  const pool = await poolPromise;
  const rs = await pool.request().input('id', sql.Int, Number(id)).query(`SELECT * FROM dbo.woo_reconciliaciones WHERE id = @id`);
  if (!rs.recordset.length) return null;
  const r = rs.recordset[0];
  const parse = (t) => { try { return JSON.parse(t || 'null'); } catch { return null; } };
  return { ...r, diferencias: parse(r.diferencias) || [], invariantes: parse(r.invariantes) || {} };
};

// ---------------------------------------------------------------------------
// Scheduler diario
// ---------------------------------------------------------------------------
let timer = null;

const msHastaProxima = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ahora = new Date();
  const prox = new Date(ahora);
  prox.setHours(h, m, 0, 0);
  if (prox <= ahora) prox.setDate(prox.getDate() + 1);
  return prox.getTime() - ahora.getTime();
};

export const iniciarReconciliacionNocturna = () => {
  const cfg = config();
  if (!cfg.enabled) { log('INFO', 'WOO_RECONCILIACION_ENABLED no es true: reconciliación nocturna apagada'); return null; }
  if (timer) return timer;
  const programar = () => {
    const ms = msHastaProxima(cfg.hora);
    log('INFO', `próxima reconciliación a las ${cfg.hora} (en ${Math.round(ms / 60000)} min) · autocorregir=${cfg.autocorregir}`);
    timer = setTimeout(async () => {
      await ejecutarReconciliacion({ origen: 'CRON' }).catch(() => {});
      programar();
    }, ms);
  };
  programar();
  return timer;
};

export const detenerReconciliacionNocturna = () => { if (timer) { clearTimeout(timer); timer = null; } };

export const estadoReconciliacion = async () => {
  const cfg = config();
  const ultimas = await listarReconciliaciones({ limite: 1 }).catch(() => []);
  return { ...cfg, programada: timer !== null, enCurso, ultima: ultimas[0] || null };
};
