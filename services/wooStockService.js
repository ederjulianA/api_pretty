/**
 * services/wooStockService.js — SPEC-013, Tarea 2
 * Punto ÚNICO de escritura de stock hacia WooCommerce.
 *
 * Reglas (ver specs/013 §4.1 en negocio_prettymakeup):
 *  1. Se llama SOLO después de transaction.commit() de un documento que cambió kardex.
 *     Nunca dentro de una transacción: si se revierte, ya se empujó un número falso.
 *  2. Lee vwExistencias EN EL MOMENTO de la llamada. Nunca recibe un stock calculado antes.
 *  3. Serializa los pushes (cola FIFO en memoria): dos llamadas concurrentes no se
 *     intercalan y cada una relee la existencia al ejecutarse.
 *  4. Reintenta con backoff; si Woo sigue caído, deja el artículo en woo_sync_pendientes
 *     y RETORNA SIN LANZAR — nunca rompe la operación del ERP que lo invocó.
 *  5. Siempre deja fila en woo_sync_logs (origen, usuario, fac_nro = referencia).
 *  6. WOO_PUSH_ENABLED=false → no llama a Woo, solo registra el log con status SIMULADO.
 *
 * Reemplaza a: utils/wooStockSync.js, la parte de stock de jobs/updateWooOrderStatusAndStock.js,
 * controllers/updateWooStockController.js y controllers/documentoInventarioController.js.
 *
 * Módulo CommonJS a propósito: lo consumen archivos ESM (models/*.js) con named imports
 * y archivos CJS (controllers/compraController.js, cierreMesController.js) con require().
 */
require('dotenv').config();
const { poolPromise, sql } = require('../db');
const { getWcApi: getWcApiCompartido } = require('./wooClient');

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const ORIGENES = [
  'REM_CREADA', 'REM_ANULADA', 'REM_FACTURADA', 'REM_REAFIRMADA',
  'REM_EDITADA', // SPEC-014: líneas de una REM editadas desde el POS (unión de artículos anteriores y nuevos)
  'VTA', 'ANULACION', 'COM', 'AJT', 'CIERRE_MES', 'BUNDLE',
  'RECONCILIACION', 'MANUAL', 'PENDIENTES'
];

const config = () => ({
  pushEnabled: String(process.env.WOO_PUSH_ENABLED ?? 'true').toLowerCase() !== 'false',
  batchSize: Math.max(1, parseInt(process.env.WOO_PUSH_BATCH_SIZE || '10', 10)),
  reintentos: 3,
  timeoutMs: 30000
});

const log = (nivel, mensaje, datos) => {
  const linea = `[${new Date().toISOString()}] [${nivel}] [WOO-STOCK] ${mensaje}`;
  if (datos !== undefined) console.log(linea, JSON.stringify(datos));
  else console.log(linea);
};

// Cliente REST compartido con el importador de pedidos (services/wooClient.js).
const getWcApi = () => getWcApiCompartido({ timeoutMs: config().timeoutMs });

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const conReintentos = async (fn, intentos, baseMs = 1000) => {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (i < intentos - 1) await dormir(baseMs * Math.pow(2, i));
    }
  }
  throw ultimo;
};

const normalizarArtSecs = (art_secs) => {
  const set = new Set();
  for (const a of art_secs || []) {
    if (a === null || a === undefined) continue;
    const s = String(a).trim();
    if (s) set.add(s);
  }
  return [...set];
};

// ---------------------------------------------------------------------------
// Cola FIFO: todos los pushes se ejecutan uno detrás de otro.
// (El spec pide serializar por artículo; una cola global es más simple, igual de
//  correcta y sin riesgo de interbloqueo con lotes de varios artículos. El volumen
//  —decenas de pushes al día— no la justifica más fina.)
// ---------------------------------------------------------------------------
let cola = Promise.resolve();
const encolar = (fn) => {
  const tarea = cola.then(fn, fn);
  cola = tarea.catch(() => {});
  return tarea;
};

// ---------------------------------------------------------------------------
// Lectura (solo SELECT): existencia actual + identificadores de Woo
// ---------------------------------------------------------------------------
/**
 * Lee vwExistencias y los IDs de Woo para un conjunto de artículos.
 * Exportada para pruebas en seco (no escribe nada).
 */
const leerExistenciasParaWoo = async (art_secs) => {
  const lista = normalizarArtSecs(art_secs);
  const vacio = { simples: [], variaciones: [], omitidos: [] };
  if (lista.length === 0) return vacio;

  const pool = await poolPromise;
  const req = pool.request();
  const params = lista.map((a, i) => {
    req.input(`a${i}`, sql.VarChar(30), a);
    return `@a${i}`;
  });
  const rs = await req.query(`
    SELECT
      a.art_sec, a.art_cod,
      a.art_woo_id, ISNULL(a.art_woo_type, 'simple') AS art_woo_type, a.art_woo_variation_id,
      padre.art_woo_id AS art_parent_woo_id,
      ISNULL(e.existencia, 0) AS existencia
    FROM dbo.articulos a
    LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
    LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
    WHERE a.art_sec IN (${params.join(',')})
  `);

  const encontrados = new Set();
  const out = { simples: [], variaciones: [], omitidos: [] };
  for (const r of rs.recordset) {
    encontrados.add(String(r.art_sec));
    const stock = Number(r.existencia) || 0;
    if (r.art_woo_type === 'variation') {
      if (!r.art_woo_variation_id || !r.art_parent_woo_id) {
        out.omitidos.push({ art_sec: r.art_sec, art_cod: r.art_cod, motivo: 'variación sin art_woo_variation_id/art_parent_woo_id' });
        continue;
      }
      out.variaciones.push({
        art_sec: r.art_sec, art_cod: r.art_cod,
        parentId: parseInt(r.art_parent_woo_id, 10),
        variationId: parseInt(r.art_woo_variation_id, 10),
        stock_quantity: stock
      });
    } else if (r.art_woo_type === 'variable') {
      out.omitidos.push({ art_sec: r.art_sec, art_cod: r.art_cod, motivo: 'producto variable: el stock lo gestionan sus variaciones' });
    } else {
      if (!r.art_woo_id) {
        out.omitidos.push({ art_sec: r.art_sec, art_cod: r.art_cod, motivo: 'sin art_woo_id' });
        continue;
      }
      out.simples.push({ art_sec: r.art_sec, art_cod: r.art_cod, id: parseInt(r.art_woo_id, 10), stock_quantity: stock });
    }
  }
  for (const a of lista) {
    if (!encontrados.has(a)) out.omitidos.push({ art_sec: a, art_cod: null, motivo: 'artículo no existe' });
  }
  return out;
};

/** Artículos distintos de un documento (por fac_nro). Incluye componentes de bundles ya expandidos en kardex. */
const artSecsDeDocumento = async (fac_nro) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('fac_nro', sql.VarChar(15), fac_nro)
    .query(`
      SELECT DISTINCT fk.art_sec
      FROM dbo.facturakardes fk
      INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
      WHERE f.fac_nro = @fac_nro
    `);
  return rs.recordset.map((r) => String(r.art_sec));
};

// ---------------------------------------------------------------------------
// Log en woo_sync_logs (tolera que la migración de Tarea 1 no esté aplicada)
// ---------------------------------------------------------------------------
let columnasLogExtra = null; // null = sin verificar; true/false = si existen origen/usuario
const verificarColumnasLog = async () => {
  if (columnasLogExtra !== null) return columnasLogExtra;
  try {
    const pool = await poolPromise;
    const rs = await pool.request().query(`
      SELECT CASE WHEN COL_LENGTH('dbo.woo_sync_logs', 'origen') IS NULL THEN 0 ELSE 1 END AS tiene
    `);
    columnasLogExtra = rs.recordset[0].tiene === 1;
  } catch (e) {
    columnasLogExtra = false;
  }
  if (!columnasLogExtra) log('WARN', 'woo_sync_logs sin columnas origen/usuario: aplicar migración de la Tarea 1');
  return columnasLogExtra;
};

const guardarLog = async (d) => {
  try {
    const extra = await verificarColumnasLog();
    const pool = await poolPromise;
    const req = pool.request()
      .input('fac_nro_woo', sql.VarChar(50), d.fac_nro_woo || null)
      .input('fac_nro', sql.VarChar(50), d.referencia || null)
      .input('total_items', sql.Int, d.totalItems)
      .input('success_count', sql.Int, d.successCount)
      .input('error_count', sql.Int, d.errorCount)
      .input('skipped_count', sql.Int, d.skippedCount)
      .input('duration', sql.Float, d.duration)
      .input('batches_processed', sql.Int, d.batches)
      .input('messages', sql.NVarChar(sql.MAX), JSON.stringify(d.messages))
      .input('status', sql.VarChar(20), d.status)
      .input('error_details', sql.NVarChar(sql.MAX), d.errorDetails ? JSON.stringify(d.errorDetails) : null)
      .input('product_updates', sql.NVarChar(sql.MAX), JSON.stringify(d.productUpdates))
      .input('debug_logs', sql.NVarChar(sql.MAX), null)
      .input('order_details', sql.NVarChar(sql.MAX), null)
      .input('config', sql.NVarChar(sql.MAX), JSON.stringify({ origen: d.origen, usuario: d.usuario, pushEnabled: d.pushEnabled }));
    let cols = 'fac_nro_woo, fac_nro, total_items, success_count, error_count, skipped_count, duration, batches_processed, messages, status, error_details, product_updates, debug_logs, order_details, config';
    let vals = '@fac_nro_woo, @fac_nro, @total_items, @success_count, @error_count, @skipped_count, @duration, @batches_processed, @messages, @status, @error_details, @product_updates, @debug_logs, @order_details, @config';
    if (extra) {
      req.input('origen', sql.VarChar(30), d.origen).input('usuario', sql.VarChar(100), d.usuario || null);
      cols += ', origen, usuario';
      vals += ', @origen, @usuario';
    }
    const rs = await req.query(`INSERT INTO dbo.woo_sync_logs (${cols}) VALUES (${vals}); SELECT SCOPE_IDENTITY() AS id;`);
    return rs.recordset[0].id;
  } catch (e) {
    log('ERROR', 'No se pudo guardar woo_sync_logs', { error: e.message });
    return null;
  }
};

const marcarPendientes = async (items, origen, error) => {
  if (!items.length) return;
  try {
    const pool = await poolPromise;
    for (const it of items) {
      await pool.request()
        .input('art_sec', sql.VarChar(30), String(it.art_sec))
        .input('origen', sql.VarChar(30), origen)
        .input('err', sql.NVarChar(1000), String(error || '').slice(0, 1000))
        .query(`
          MERGE dbo.woo_sync_pendientes AS t
          USING (SELECT @art_sec AS art_sec) AS s ON t.art_sec = s.art_sec
          WHEN MATCHED THEN UPDATE SET intentos = t.intentos + 1, ultimo_error = @err, origen = @origen, actualizado_en = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (art_sec, origen, intentos, ultimo_error) VALUES (@art_sec, @origen, 1, @err);
        `);
    }
  } catch (e) {
    log('ERROR', 'No se pudo registrar en woo_sync_pendientes (¿migración Tarea 1 aplicada?)', { error: e.message, art_secs: items.map((i) => i.art_sec) });
  }
};

const limpiarPendientes = async (art_secs) => {
  if (!art_secs.length) return;
  try {
    const pool = await poolPromise;
    const req = pool.request();
    const params = art_secs.map((a, i) => { req.input(`p${i}`, sql.VarChar(30), String(a)); return `@p${i}`; });
    await req.query(`DELETE FROM dbo.woo_sync_pendientes WHERE art_sec IN (${params.join(',')})`);
  } catch (e) {
    // Tabla ausente o error transitorio: no es crítico.
  }
};

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------
const ejecutarPush = async ({ art_secs, origen, referencia, usuario }) => {
  const inicio = Date.now();
  const cfg = config();
  const messages = [];
  const productUpdates = [];
  const enviadosOk = [];
  const fallidos = [];
  let batches = 0;

  const { simples, variaciones, omitidos } = await leerExistenciasParaWoo(art_secs);
  for (const o of omitidos) messages.push(`Omitido ${o.art_cod || o.art_sec}: ${o.motivo}`);

  const total = simples.length + variaciones.length;
  if (total === 0) {
    const dur = (Date.now() - inicio) / 1000;
    const logId = await guardarLog({
      referencia, origen, usuario, pushEnabled: cfg.pushEnabled,
      totalItems: omitidos.length, successCount: 0, errorCount: 0, skippedCount: omitidos.length,
      duration: dur, batches: 0, messages, status: 'SIN_ITEMS', productUpdates
    });
    return { ok: true, enviados: 0, errores: 0, omitidos: omitidos.length, pendientes: 0, logId, messages };
  }

  if (!cfg.pushEnabled) {
    for (const s of simples) productUpdates.push({ id: s.id, stock_quantity: s.stock_quantity, art_sec: s.art_sec });
    for (const v of variaciones) productUpdates.push({ id: v.variationId, parent: v.parentId, stock_quantity: v.stock_quantity, art_sec: v.art_sec });
    messages.push(`WOO_PUSH_ENABLED=false: ${total} artículos NO enviados (simulado)`);
    const logId = await guardarLog({
      referencia, origen, usuario, pushEnabled: false,
      totalItems: total + omitidos.length, successCount: 0, errorCount: 0, skippedCount: total + omitidos.length,
      duration: (Date.now() - inicio) / 1000, batches: 0, messages, status: 'SIMULADO', productUpdates
    });
    log('INFO', `SIMULADO ${origen} ${referencia || ''}`, productUpdates);
    return { ok: true, enviados: 0, errores: 0, omitidos: omitidos.length, pendientes: 0, logId, messages, simulado: true, productUpdates };
  }

  let api;
  try {
    api = getWcApi();
  } catch (e) {
    messages.push(e.message);
    await marcarPendientes([...simples, ...variaciones], origen, e.message);
    const logId = await guardarLog({
      referencia, origen, usuario, pushEnabled: true,
      totalItems: total + omitidos.length, successCount: 0, errorCount: total, skippedCount: omitidos.length,
      duration: (Date.now() - inicio) / 1000, batches: 0, messages, status: 'ERROR', productUpdates, errorDetails: { message: e.message }
    });
    return { ok: false, enviados: 0, errores: total, omitidos: omitidos.length, pendientes: total, logId, messages };
  }

  // 1. Productos simples en lotes (products/batch)
  for (const lote of chunk(simples, cfg.batchSize)) {
    batches++;
    const payload = { update: lote.map((s) => ({ id: s.id, stock_quantity: s.stock_quantity })) };
    try {
      const resp = await conReintentos(async () => {
        const r = await api.post('products/batch', payload);
        if (!r || !r.data || !Array.isArray(r.data.update)) throw new Error('Respuesta inválida de WooCommerce (products/batch)');
        return r;
      }, cfg.reintentos);
      const porId = new Map(lote.map((s) => [s.id, s]));
      for (const it of resp.data.update) {
        const src = porId.get(it.id);
        if (it.error) {
          fallidos.push({ art_sec: src?.art_sec, id: it.id, error: it.error.message || 'error' });
          messages.push(`Error producto ${it.id}${src ? ` (${src.art_cod})` : ''}: ${it.error.message || 'error'}`);
        } else {
          enviadosOk.push(src?.art_sec);
          productUpdates.push({ id: it.id, stock_quantity: it.stock_quantity, art_sec: src?.art_sec });
          messages.push(`Producto ${it.id}${src ? ` (${src.art_cod})` : ''} → stock ${it.stock_quantity}`);
        }
      }
    } catch (e) {
      for (const s of lote) fallidos.push({ art_sec: s.art_sec, id: s.id, error: e.message });
      messages.push(`Lote ${batches} falló: ${e.message}`);
    }
  }

  // 2. Variaciones una a una (WooCommerce no tiene batch por variación entre padres distintos)
  for (const v of variaciones) {
    try {
      await conReintentos(async () => {
        const r = await api.put(`products/${v.parentId}/variations/${v.variationId}`, { stock_quantity: v.stock_quantity });
        if (!r || !r.data) throw new Error('Respuesta inválida de WooCommerce (variación)');
        return r;
      }, cfg.reintentos);
      enviadosOk.push(v.art_sec);
      productUpdates.push({ id: v.variationId, parent: v.parentId, stock_quantity: v.stock_quantity, art_sec: v.art_sec });
      messages.push(`Variación ${v.variationId} (${v.art_cod}) → stock ${v.stock_quantity}`);
    } catch (e) {
      fallidos.push({ art_sec: v.art_sec, id: v.variationId, error: e.message });
      messages.push(`Error variación ${v.variationId} (${v.art_cod}): ${e.message}`);
    }
  }

  await limpiarPendientes(enviadosOk.filter(Boolean));
  if (fallidos.length) await marcarPendientes(fallidos, origen, fallidos[0].error);

  const dur = (Date.now() - inicio) / 1000;
  const status = fallidos.length === 0 ? 'SUCCESS' : (enviadosOk.length > 0 ? 'PARTIAL_SUCCESS' : 'ERROR');
  const logId = await guardarLog({
    referencia, origen, usuario, pushEnabled: true,
    totalItems: total + omitidos.length, successCount: enviadosOk.length, errorCount: fallidos.length, skippedCount: omitidos.length,
    duration: dur, batches, messages, status, productUpdates,
    errorDetails: fallidos.length ? fallidos : null
  });
  log(status === 'SUCCESS' ? 'INFO' : 'WARN', `${origen} ${referencia || ''}: ${enviadosOk.length} ok, ${fallidos.length} error, ${omitidos.length} omitidos (${dur.toFixed(2)}s)`);

  return { ok: fallidos.length === 0, enviados: enviadosOk.length, errores: fallidos.length, omitidos: omitidos.length, pendientes: fallidos.length, logId, messages, productUpdates };
};

/**
 * Sincroniza la existencia actual del ERP hacia WooCommerce para los artículos dados.
 * Nunca lanza: devuelve { ok, enviados, errores, omitidos, pendientes, logId, messages }.
 *
 * @param {object} p
 * @param {string[]} p.art_secs   Artículos a sincronizar (se deduplican).
 * @param {string}   p.origen     Uno de ORIGENES (REM_CREADA, VTA, COM, AJT, MANUAL, ...).
 * @param {string}  [p.referencia] fac_nro del documento que disparó el push (para el log).
 * @param {string}  [p.usuario]    usu_cod del usuario, cuando lo disparó una persona.
 */
const sincronizarExistenciasWoo = async ({ art_secs, origen, referencia = null, usuario = null }) => {
  const lista = normalizarArtSecs(art_secs);
  const org = ORIGENES.includes(origen) ? origen : 'DESCONOCIDO';
  if (org === 'DESCONOCIDO') log('WARN', `origen no reconocido: ${origen}`, { referencia });
  if (lista.length === 0) return { ok: true, enviados: 0, errores: 0, omitidos: 0, pendientes: 0, logId: null, messages: ['Sin artículos'] };
  try {
    return await encolar(() => ejecutarPush({ art_secs: lista, origen: org, referencia, usuario }));
  } catch (e) {
    // ejecutarPush ya captura lo suyo; esto cubre fallos inesperados (p. ej. BD caída al leer existencias).
    log('ERROR', `Push ${org} ${referencia || ''} falló de forma inesperada`, { error: e.message });
    await marcarPendientes(lista.map((a) => ({ art_sec: a })), org, e.message);
    return { ok: false, enviados: 0, errores: lista.length, omitidos: 0, pendientes: lista.length, logId: null, messages: [e.message] };
  }
};

/** Igual que sincronizarExistenciasWoo, pero resolviendo los artículos desde un documento (fac_nro). */
const sincronizarDocumentoWoo = async ({ fac_nro, origen, usuario = null }) => {
  let art_secs = [];
  try {
    art_secs = await artSecsDeDocumento(fac_nro);
  } catch (e) {
    log('ERROR', `No se pudieron leer los artículos del documento ${fac_nro}`, { error: e.message });
    return { ok: false, enviados: 0, errores: 0, omitidos: 0, pendientes: 0, logId: null, messages: [e.message] };
  }
  if (art_secs.length === 0) {
    log('WARN', `Documento ${fac_nro} sin artículos: nada que sincronizar`);
    return { ok: true, enviados: 0, errores: 0, omitidos: 0, pendientes: 0, logId: null, messages: ['Documento sin artículos'] };
  }
  return sincronizarExistenciasWoo({ art_secs, origen, referencia: fac_nro, usuario });
};

/** Reintenta los artículos que quedaron en woo_sync_pendientes. Lo usa la reconciliación (Tarea 7). */
const reintentarPendientes = async () => {
  let pendientes = [];
  try {
    const pool = await poolPromise;
    const rs = await pool.request().query(`SELECT art_sec FROM dbo.woo_sync_pendientes ORDER BY creado_en`);
    pendientes = rs.recordset.map((r) => String(r.art_sec));
  } catch (e) {
    return { ok: false, messages: [`No se pudo leer woo_sync_pendientes: ${e.message}`] };
  }
  if (pendientes.length === 0) return { ok: true, enviados: 0, errores: 0, messages: ['Sin pendientes'] };
  return sincronizarExistenciasWoo({ art_secs: pendientes, origen: 'PENDIENTES', referencia: 'woo_sync_pendientes' });
};

// ---------------------------------------------------------------------------
// Estado del pedido en Woo — separado del stock
// ---------------------------------------------------------------------------
/**
 * Mapeo del estado guardado en factura.fac_est_woo al estado que se manda a Woo al facturar.
 * Copiado tal cual de jobs/updateWooOrderStatusAndStock.js (determineWooCommerceStatus) para no
 * cambiar comportamiento en la Fase 1. La Fase 3 lo reemplaza por la regla "solo hacia adelante,
 * on-hold/pending → processing" (specs/013 §8).
 */
const determinarEstadoWooAlFacturar = (estadoActual) => {
  if (!estadoActual) return 'completed';
  const conGuionBajo = {
    epayco_processing: 'epayco_completed', epayco_completed: 'epayco_completed', epayco_pending: 'epayco_pending',
    epayco_failed: 'epayco_failed', epayco_cancelled: 'epayco_cancelled', epayco_refunded: 'epayco_refunded',
    processing: 'completed', completed: 'completed', pending: 'pending', failed: 'failed', cancelled: 'cancelled', refunded: 'refunded'
  };
  const conGuion = {
    'epayco-processing': 'epayco-completed', 'epayco-completed': 'epayco-completed', 'epayco-pending': 'epayco-pending',
    'epayco-failed': 'epayco-failed', 'epayco-cancelled': 'epayco-cancelled', 'epayco-refunded': 'epayco-refunded',
    processing: 'completed', completed: 'completed', pending: 'pending', failed: 'failed', cancelled: 'cancelled', refunded: 'refunded'
  };
  const mapa = estadoActual.includes('_') ? conGuionBajo : conGuion;
  return mapa[estadoActual] || 'completed';
};

/**
 * Cambia el estado de un pedido en WooCommerce. Nunca lanza.
 * @returns {{ok:boolean, estado?:string, error?:string}}
 */
const actualizarEstadoPedidoWoo = async (fac_nro_woo, estado, nota = null) => {
  if (!fac_nro_woo || !estado) return { ok: false, error: 'fac_nro_woo y estado son obligatorios' };
  if (!config().pushEnabled) {
    log('INFO', `SIMULADO estado pedido ${fac_nro_woo} → ${estado}`);
    return { ok: true, estado, simulado: true };
  }
  try {
    const api = getWcApi();
    await conReintentos(() => api.put(`orders/${fac_nro_woo}`, { status: estado }), config().reintentos);
    // Las notas privadas van por orders/{id}/notes, no en el PUT del pedido.
    if (nota) {
      try { await api.post(`orders/${fac_nro_woo}/notes`, { note: nota, customer_note: false }); } catch (e) { /* la nota es informativa */ }
    }
    log('INFO', `Pedido Woo ${fac_nro_woo} → ${estado}`);
    return { ok: true, estado };
  } catch (e) {
    log('ERROR', `No se pudo cambiar el estado del pedido Woo ${fac_nro_woo} a ${estado}`, { error: e.message });
    return { ok: false, error: e.message };
  }
};

/**
 * Nota privada en un pedido Woo, sin tocar su estado (SPEC-014 §5.5: p. ej. VTA respaldada anulada).
 * Nunca lanza: la nota es informativa.
 */
const agregarNotaPedidoWoo = async (fac_nro_woo, nota) => {
  if (!fac_nro_woo || !nota) return { ok: false };
  if (!config().pushEnabled) { log('INFO', `SIMULADO nota en pedido ${fac_nro_woo}: ${nota}`); return { ok: true, simulado: true }; }
  try {
    await getWcApi().post(`orders/${fac_nro_woo}/notes`, { note: String(nota).slice(0, 1000), customer_note: false });
    return { ok: true };
  } catch (e) {
    log('ERROR', `No se pudo dejar la nota en el pedido Woo ${fac_nro_woo}`, { error: e.message });
    return { ok: false, error: e.message };
  }
};

module.exports = {
  ORIGENES,
  agregarNotaPedidoWoo,
  sincronizarExistenciasWoo,
  sincronizarDocumentoWoo,
  reintentarPendientes,
  actualizarEstadoPedidoWoo,
  determinarEstadoWooAlFacturar,
  // solo lectura, para pruebas en seco
  leerExistenciasParaWoo,
  artSecsDeDocumento
};
