/**
 * models/pedidosWebModel.js — SPEC-013, Fase 2 (Tareas 3, 4 y 5) · SPEC-014 (respaldo)
 *
 * Documentos del flujo de pedidos web:
 *   REM (remisión, fac_est_fac 'A', líneas '-') reserva stock desde que existe;
 *   al confirmar el pago nace la VTA por RESPALDO (SPEC-014 §5.3): la REM sigue 'A' — es el
 *   movimiento de kardex — y la VTA lleva líneas 'R', que vwExistencias ignora. Mientras
 *   REM_FACTURA_SIN_KARDEX no sea true se conserva el RELEVO anterior (REM → 'F', VTA con '-').
 *   Si se cancela o vence sin VTA, REM → 'I'.
 *
 * Convención de vínculo (la misma que COT→VTA en el ERP):
 *   la VTA nace con fac_sec propio y VTA.fac_nro_origen = REM.fac_nro; la REM guarda
 *   REM.fac_nro_origen = VTA.fac_nro; las líneas de la VTA apuntan a la REM
 *   (kar_fac_sec_ori / kar_kar_sec_ori). Mientras la VTA esté activa la REM queda bloqueada.
 *
 * Todo push a WooCommerce sale por services/wooStockService.js DESPUÉS del commit.
 */
import { sql, poolPromise } from '../db.js';
import { sincronizarDocumentoWoo, actualizarEstadoPedidoWoo } from '../services/wooStockService.js';
import { obtenerSiguienteFacSec, obtenerSiguienteFacNro, ejecutarConAutoRecuperacion } from '../utils/secuenciaUtils.js';
import { NATURALEZA, diasVencimientoRem, calcularVencimientoRem, destinoActivo, errorNegocio } from '../utils/documentosUtils.js';
import { getWcApi } from '../services/wooClient.js';
import { mapearPedidoWoo, clasificarEstadoWoo, CLASIFICACION } from '../services/wooPedidoMapper.js';

/** SPEC-014 §8: modelo de respaldo (VTA 'R', REM sigue 'A'). false = relevo de SPEC-013 (rollback). */
export const facturaSinKardex = () => String(process.env.REM_FACTURA_SIN_KARDEX || 'false').toLowerCase() === 'true';

/**
 * orderModel se carga DINÁMICAMENTE (en el momento de uso), no con `import` estático.
 * Motivo (incidente del despliegue del 14/sep/2026): con un import estático, orderModel.js entra
 * al grafo ESM de index.js (pedidosWebRoutes → pedidosWebController → pedidosWebModel → orderModel)
 * y queda "enlazado pero sin evaluar" cuando routes/orderRoutes.js (CommonJS) hace
 * require('../controllers/orderController') → require('../models/orderModel'). Node 25 lo evalúa
 * al vuelo; Node ≤23 devuelve el namespace vacío y el arranque muere con
 * "ReferenceError: Cannot access 'getOrdenes' before initialization" (pm2 en bucle → rollback).
 * Con import() diferido, orderModel sigue fuera del grafo estático, exactamente como antes de la Fase 2.
 */
const orderModel = () => import('./orderModel.js');

export const ESTADO_ERP = Object.freeze({
  SIN_DOC: 'SIN_DOC',
  REM_ACTIVA: 'REM_ACTIVA',
  FACTURADO: 'FACTURADO',
  ANULADO: 'ANULADO',
  REVISION: 'REVISION',
  ERROR: 'ERROR',
  SIMULADO: 'SIMULADO'
});

export const NOMBRE_CURSOR_IMPORTADOR = 'importar_pedidos';

export const diasVencimiento = diasVencimientoRem;

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
/**
 * Documentos del ERP para un pedido Woo, clasificados. Incluye las REM anuladas ('I') para que
 * el seguimiento conserve la referencia (una REM anulada sigue siendo "el documento" del pedido
 * cancelado) y para que la pantalla muestre el historial completo; VTA/COT solo vigentes.
 * @returns {Promise<{rem_activa, rem_facturada, rem_anulada, vta_activa, cot_activa, todos:Array}>}
 */
export const obtenerDocumentosPedidoWoo = async (fac_nro_woo) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('fac_nro_woo', sql.VarChar(15), String(fac_nro_woo))
    .query(`
      SELECT fac_sec, fac_nro, fac_tip_cod, fac_est_fac, fac_est_woo, fac_nro_origen, fac_fec, fac_fch_cre, nit_sec,
             fac_total_woo, fac_descuento_general, fac_usu_cod_cre, fac_obs
      FROM dbo.factura
      WHERE fac_nro_woo = @fac_nro_woo
        AND fac_tip_cod IN ('REM', 'VTA', 'COT')
        AND (fac_est_fac IN ('A', 'F') OR (fac_tip_cod = 'REM' AND fac_est_fac = 'I'))
      ORDER BY fac_sec DESC
    `);
  const todos = rs.recordset.map((r) => ({ ...r, fac_sec: Number(r.fac_sec) }));
  const primero = (pred) => todos.find(pred) || null;
  const vta_activa = primero((d) => d.fac_tip_cod === 'VTA' && d.fac_est_fac === 'A');
  // SPEC-014: "facturada" = REM 'A' cruzada con la VTA activa (respaldo) o REM 'F' (relevo legado).
  // "activa" = REM 'A' sin VTA: la única que el importador puede reemplazar, anular o facturar.
  const remCruzada = vta_activa
    ? primero((d) => d.fac_tip_cod === 'REM' && d.fac_est_fac === 'A' && (d.fac_nro_origen === vta_activa.fac_nro || vta_activa.fac_nro_origen === d.fac_nro))
    : null;
  return {
    rem_activa: primero((d) => d.fac_tip_cod === 'REM' && d.fac_est_fac === 'A' && d !== remCruzada),
    rem_facturada: remCruzada || primero((d) => d.fac_tip_cod === 'REM' && d.fac_est_fac === 'F'),
    rem_anulada: primero((d) => d.fac_tip_cod === 'REM' && d.fac_est_fac === 'I'), // la más reciente
    vta_activa,
    // COT activa SIN facturar (fac_nro_origen NULL): camino legado del Dashboard todavía en curso.
    cot_activa: primero((d) => d.fac_tip_cod === 'COT' && d.fac_est_fac === 'A' && !d.fac_nro_origen),
    todos
  };
};

/** Líneas de un documento (todas, con marca de componente de bundle) con código y nombre del artículo. */
export const obtenerLineasDocumento = async (fac_sec) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('fac_sec', sql.Decimal(18, 0), fac_sec)
    .query(`
      SELECT k.kar_sec, k.art_sec, a.art_cod, a.art_nom, k.kar_uni, k.kar_nat, k.kar_pre_pub, k.kar_total, k.kar_bundle_padre,
             k.kar_tiene_oferta, k.kar_codigo_promocion
      FROM dbo.facturakardes k
      LEFT JOIN dbo.articulos a ON a.art_sec = k.art_sec
      WHERE k.fac_sec = @fac_sec
      ORDER BY k.kar_sec
    `);
  return rs.recordset.map((r) => ({ ...r, art_sec: String(r.art_sec) }));
};

// ---------------------------------------------------------------------------
// woo_pedidos (seguimiento del importador)
// ---------------------------------------------------------------------------
/**
 * MERGE de la fila de seguimiento. Los campos que llegan `undefined` no se tocan
 * (así facturarRemision/anularRemision actualizan solo lo suyo).
 */
export const upsertWooPedido = async (p) => {
  const pool = await poolPromise;
  const req = pool.request()
    .input('woo_order_id', sql.Int, Number(p.woo_order_id));

  // Columnas actualizables: [nombre, tipo, valor]
  const cols = [
    ['woo_status', sql.VarChar(40), p.woo_status],
    ['woo_modified_gmt', sql.DateTime2(0), p.woo_modified_gmt ? new Date(p.woo_modified_gmt + (String(p.woo_modified_gmt).endsWith('Z') ? '' : 'Z')) : undefined],
    ['woo_created_gmt', sql.DateTime2(0), p.woo_created_gmt ? new Date(p.woo_created_gmt + (String(p.woo_created_gmt).endsWith('Z') ? '' : 'Z')) : undefined],
    ['woo_total', sql.Decimal(17, 2), p.woo_total],
    ['woo_payment_method', sql.VarChar(40), p.woo_payment_method],
    ['woo_cliente', sql.NVarChar(150), p.woo_cliente != null ? String(p.woo_cliente).slice(0, 150) : p.woo_cliente],
    ['woo_email', sql.NVarChar(150), p.woo_email != null ? String(p.woo_email).slice(0, 150) : p.woo_email],
    ['fac_nro_rem', sql.VarChar(15), p.fac_nro_rem],
    ['fac_nro_vta', sql.VarChar(15), p.fac_nro_vta],
    ['estado_erp', sql.VarChar(20), p.estado_erp],
    ['vence_el', sql.DateTime2(0), p.vence_el],
    ['error', sql.NVarChar(1000), p.error != null ? String(p.error).slice(0, 1000) : p.error],
    ['ultima_accion', sql.NVarChar(1000), p.ultima_accion != null ? String(p.ultima_accion).slice(0, 1000) : p.ultima_accion],
    ['alerta', sql.NVarChar(500), p.alerta != null ? String(p.alerta).slice(0, 500) : p.alerta],
    ['intentos', sql.Int, p.intentos]
  ].filter(([, , v]) => v !== undefined);

  for (const [n, t, v] of cols) req.input(n, t, v);
  const setList = cols.map(([n]) => `${n} = @${n}`).concat(['actualizado_en = SYSUTCDATETIME()']).join(', ');
  const insCols = cols.map(([n]) => n);
  // En un INSERT nuevo, estado_erp / woo_status / woo_modified_gmt son NOT NULL: garantizar valores.
  const insertCols = ['woo_order_id', ...insCols];
  const insertVals = ['@woo_order_id', ...insCols.map((n) => `@${n}`)];
  if (!insCols.includes('estado_erp')) { insertCols.push('estado_erp'); insertVals.push(`'${ESTADO_ERP.SIN_DOC}'`); }
  if (!insCols.includes('woo_status')) { insertCols.push('woo_status'); insertVals.push(`'desconocido'`); }
  if (!insCols.includes('woo_modified_gmt')) { insertCols.push('woo_modified_gmt'); insertVals.push('SYSUTCDATETIME()'); }

  await req.query(`
    MERGE dbo.woo_pedidos AS t
    USING (SELECT @woo_order_id AS woo_order_id) AS s ON t.woo_order_id = s.woo_order_id
    WHEN MATCHED THEN UPDATE SET ${setList}
    WHEN NOT MATCHED THEN INSERT (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')});
  `);
};

/** Fila de seguimiento por número de pedido Woo (o null). */
export const obtenerWooPedido = async (woo_order_id) => {
  const pool = await poolPromise;
  const rs = await pool.request().input('id', sql.Int, Number(woo_order_id)).query('SELECT * FROM dbo.woo_pedidos WHERE woo_order_id = @id');
  return rs.recordset[0] || null;
};

// ---------------------------------------------------------------------------
// Cursor y lock del job
// ---------------------------------------------------------------------------
/**
 * Toma el lock del cursor si está libre o vencido. Devuelve el cursor actual o null si otro
 * ciclo lo tiene. El lock vence solo a los 5 min (proceso caído a mitad de ciclo).
 */
export const tomarLockCursor = async (nombre = NOMBRE_CURSOR_IMPORTADOR) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('nombre', sql.VarChar(40), nombre)
    .query(`
      UPDATE dbo.woo_sync_cursor
      SET locked_until = DATEADD(MINUTE, 5, SYSUTCDATETIME())
      OUTPUT INSERTED.cursor_gmt
      WHERE nombre = @nombre
        AND (locked_until IS NULL OR locked_until < SYSUTCDATETIME());
    `);
  if (rs.recordset.length === 0) return null;
  return rs.recordset[0].cursor_gmt; // Date (DATETIME2 sin zona; el driver la devuelve como UTC local)
};

/** Extiende el lock 5 min más. Se llama tras cada pedido: un ciclo largo (timeouts de red) no debe perder el lock a mitad. */
export const renovarLockCursor = async (nombre = NOMBRE_CURSOR_IMPORTADOR) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('nombre', sql.VarChar(40), nombre)
      .query(`UPDATE dbo.woo_sync_cursor SET locked_until = DATEADD(MINUTE, 5, SYSUTCDATETIME()) WHERE nombre = @nombre AND locked_until IS NOT NULL`);
  } catch (e) { /* no crítico */ }
};

export const liberarLockCursor = async ({ nombre = NOMBRE_CURSOR_IMPORTADOR, ok, error = null }) => {
  const pool = await poolPromise;
  await pool.request()
    .input('nombre', sql.VarChar(40), nombre)
    .input('error', sql.NVarChar(1000), error ? String(error).slice(0, 1000) : null)
    .query(`
      UPDATE dbo.woo_sync_cursor
      SET locked_until = NULL,
          ultimo_ok = CASE WHEN ${ok ? 1 : 0} = 1 THEN SYSUTCDATETIME() ELSE ultimo_ok END,
          ultimo_error = @error
      WHERE nombre = @nombre
    `);
};

/** Avanza el cursor (solo hacia adelante). `fechaGmt` = date_modified_gmt del último pedido procesado sin error. */
export const avanzarCursor = async (fechaGmt, nombre = NOMBRE_CURSOR_IMPORTADOR) => {
  if (!fechaGmt) return;
  const d = new Date(String(fechaGmt).endsWith('Z') ? fechaGmt : `${fechaGmt}Z`);
  if (isNaN(d.getTime())) return;
  const pool = await poolPromise;
  await pool.request()
    .input('nombre', sql.VarChar(40), nombre)
    .input('cursor', sql.DateTime2(0), d)
    .query(`UPDATE dbo.woo_sync_cursor SET cursor_gmt = @cursor WHERE nombre = @nombre AND cursor_gmt < @cursor`);
};

/** Reposiciona el cursor a mano (soporte / pruebas). */
export const fijarCursor = async (fechaGmt, nombre = NOMBRE_CURSOR_IMPORTADOR) => {
  const d = new Date(fechaGmt);
  if (isNaN(d.getTime())) throw new Error('Fecha de cursor inválida');
  const pool = await poolPromise;
  await pool.request()
    .input('nombre', sql.VarChar(40), nombre)
    .input('cursor', sql.DateTime2(0), d)
    .query(`UPDATE dbo.woo_sync_cursor SET cursor_gmt = @cursor, locked_until = NULL WHERE nombre = @nombre`);
  return d;
};

export const obtenerCursor = async (nombre = NOMBRE_CURSOR_IMPORTADOR) => {
  const pool = await poolPromise;
  const rs = await pool.request().input('nombre', sql.VarChar(40), nombre).query('SELECT * FROM dbo.woo_sync_cursor WHERE nombre = @nombre');
  return rs.recordset[0] || null;
};

// ---------------------------------------------------------------------------
// Alerta de inventario insuficiente (spec §4.6)
// ---------------------------------------------------------------------------
/**
 * Artículos de un documento cuya existencia quedó negativa después de crearlo. La REM se crea
 * igual (la venta ya ocurrió en la web); esto solo marca el pedido para revisión humana.
 * @returns {Promise<Array<{art_sec, art_cod, art_nom, kar_uni, existencia}>>}
 */
export const articulosSinSaldoDeDocumento = async (fac_nro) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('fac_nro', sql.VarChar(15), fac_nro)
    .query(`
      SELECT k.art_sec, a.art_cod, a.art_nom, SUM(k.kar_uni) AS kar_uni, ISNULL(e.existencia, 0) AS existencia
      FROM dbo.facturakardes k
      INNER JOIN dbo.factura f ON f.fac_sec = k.fac_sec
      INNER JOIN dbo.articulos a ON a.art_sec = k.art_sec
      LEFT JOIN dbo.vwExistencias e ON e.art_sec = k.art_sec
      WHERE f.fac_nro = @fac_nro
        AND k.kar_nat = '-'
        AND ISNULL(a.art_bundle, 'N') <> 'S'          -- el bundle padre no tiene stock propio; cuentan sus componentes
      GROUP BY k.art_sec, a.art_cod, a.art_nom, e.existencia
      HAVING ISNULL(e.existencia, 0) < 0
      ORDER BY e.existencia
    `);
  return rs.recordset.map((r) => ({ ...r, art_sec: String(r.art_sec), kar_uni: Number(r.kar_uni), existencia: Number(r.existencia) }));
};

/**
 * Versión "qué pasaría" para el modo simulación: existencia actual − cantidad pedida por línea
 * (sin expandir bundles). Devuelve las líneas que quedarían en negativo.
 */
export const evaluarSaldoParaLineas = async (detalles) => {
  const lista = (detalles || []).filter((d) => d.art_sec);
  if (lista.length === 0) return [];
  const pool = await poolPromise;
  const req = pool.request();
  const params = lista.map((d, i) => { req.input(`a${i}`, sql.VarChar(30), String(d.art_sec)); return `@a${i}`; });
  const rs = await req.query(`SELECT a.art_sec, a.art_cod, ISNULL(e.existencia, 0) AS existencia FROM dbo.articulos a LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec WHERE a.art_sec IN (${params.join(',')})`);
  const ex = new Map(rs.recordset.map((r) => [String(r.art_sec), { art_cod: r.art_cod, existencia: Number(r.existencia) }]));
  const out = [];
  for (const d of lista) {
    const e = ex.get(String(d.art_sec));
    if (!e) continue;
    const resultante = e.existencia - Number(d.kar_uni);
    if (resultante < 0) out.push({ art_sec: String(d.art_sec), art_cod: e.art_cod, kar_uni: Number(d.kar_uni), existencia: e.existencia, resultante });
  }
  return out;
};

/** Texto corto para woo_pedidos.alerta / la pantalla. */
export const textoAlertaSaldo = (faltantes) => {
  if (!faltantes || faltantes.length === 0) return null;
  const partes = faltantes.map((f) => `${f.art_cod} (pedidas ${f.kar_uni}, existencia ${f.resultante ?? f.existencia})`);
  return `Stock insuficiente en ${faltantes.length} artículo${faltantes.length === 1 ? '' : 's'}: ${partes.join('; ')}`.slice(0, 500);
};

// ---------------------------------------------------------------------------
// REM: crear
// ---------------------------------------------------------------------------
/**
 * Crea la remisión web a partir del pedido mapeado (services/wooPedidoMapper.js) y empuja
 * la existencia a Woo (origen REM_CREADA). Devuelve { fac_sec, fac_nro, push }.
 */
export const crearRemision = async ({ mapeo, nit_sec, usuario = 'SISTEMA', fac_vence_el = undefined }) => {
  if (!mapeo || !Array.isArray(mapeo.detalles) || mapeo.detalles.length === 0) throw new Error('El pedido no tiene líneas mapeadas');
  if (mapeo.errores && mapeo.errores.length) throw new Error(`Pedido con líneas sin mapear: ${mapeo.errores.join('; ')}`);
  if (!nit_sec) throw new Error('nit_sec requerido para crear la remisión');

  const { createCompleteOrder } = await orderModel();
  const creada = await createCompleteOrder({
    nit_sec: String(nit_sec),
    fac_usu_cod_cre: usuario,
    fac_tip_cod: 'REM',
    detalles: mapeo.detalles.map((d) => ({
      art_sec: d.art_sec,
      kar_uni: d.kar_uni,
      kar_pre_pub: d.kar_pre_pub,
      kar_total: d.kar_total,
      kar_lis_pre_cod: mapeo.lis_pre_cod,
      kar_nat: '-'
    })),
    descuento: 0,
    lis_pre_cod: mapeo.lis_pre_cod,
    fac_nro_woo: mapeo.fac_nro_woo,
    fac_obs: mapeo.fac_obs,
    fac_fec: mapeo.fac_fec,
    fac_descuento_general: mapeo.fac_descuento_general,
    fac_est_woo: mapeo.estado_woo_normalizado,
    fac_total_woo: mapeo.total_woo,
    fac_vence_el,  // undefined → hoy + REM_DIAS_VENCIMIENTO (factura.fac_vence_el, SPEC-014)
    pushWoo: false // el push se hace aquí abajo, después de resolver bundles por documento
  });

  // Post-commit. Se resuelve por documento para incluir componentes de bundles ya expandidos.
  const push = await sincronizarDocumentoWoo({ fac_nro: creada.fac_nro, origen: 'REM_CREADA', usuario });
  // Alerta de inventario: la REM ya está creada y el negativo ya se empujó a Woo (producto agotado en la
  // tienda, que es lo correcto); aquí solo se deja constancia para que una persona lo revise.
  let sinSaldo = [];
  try { sinSaldo = await articulosSinSaldoDeDocumento(creada.fac_nro); } catch (e) { console.error('[PEDIDOS_WEB] no se pudo evaluar el saldo de', creada.fac_nro, e.message); }
  return { ...creada, push, sinSaldo, alerta: textoAlertaSaldo(sinSaldo) };
};

// ---------------------------------------------------------------------------
// REM → VTA (relevo) — Tarea 4
// ---------------------------------------------------------------------------
const _facturarRemisionInternal = async ({ fac_nro_rem, usuario, fac_fec }) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let resultado;
  try {
    // 1. REM con bloqueo: dos confirmaciones simultáneas (job + pantalla) se serializan aquí.
    const remRs = await new sql.Request(transaction)
      .input('fac_nro', sql.VarChar(15), fac_nro_rem)
      .query(`
        SELECT fac_sec, fac_nro, fac_est_fac, nit_sec, fac_nro_woo, fac_est_woo, fac_obs,
               fac_descuento_general, fac_total_woo, fac_nro_origen
        FROM dbo.factura WITH (UPDLOCK, HOLDLOCK)
        WHERE fac_nro = @fac_nro AND fac_tip_cod = 'REM'
      `);
    if (remRs.recordset.length === 0) throw errorNegocio(`Remisión ${fac_nro_rem} no existe`, 404);
    const rem = remRs.recordset[0];
    const respaldo = facturaSinKardex();

    // Idempotencia (relevo legado): REM 'F' → devolver la VTA existente sin hacer nada.
    if (rem.fac_est_fac === 'F') {
      const vta = await new sql.Request(transaction)
        .input('woo', sql.VarChar(15), rem.fac_nro_woo)
        .query(`SELECT TOP 1 fac_nro FROM dbo.factura WHERE fac_nro_woo = @woo AND fac_tip_cod = 'VTA' AND fac_est_fac = 'A' ORDER BY fac_sec DESC`);
      await transaction.commit();
      return { ya_facturada: true, fac_nro_rem, fac_nro_vta: vta.recordset[0]?.fac_nro || rem.fac_nro_origen || null, fac_nro_woo: rem.fac_nro_woo, art_secs: [] };
    }
    if (rem.fac_est_fac !== 'A') throw errorNegocio(`Remisión ${fac_nro_rem} está anulada (estado ${rem.fac_est_fac}); no se puede facturar`);

    // Idempotencia (respaldo, SPEC-014): REM 'A' ya cruzada con una VTA activa → esa VTA.
    const destino = await destinoActivo(transaction, { fac_sec: Number(rem.fac_sec) });
    if (destino) {
      await transaction.commit();
      return { ya_facturada: true, fac_nro_rem, fac_nro_vta: destino.fac_nro, fac_nro_woo: rem.fac_nro_woo, art_secs: [] };
    }

    // 2. Nunca dos VTA activas del mismo pedido web (el índice UX_factura_woo_vigente también lo impide).
    if (rem.fac_nro_woo) {
      const vtaPrev = await new sql.Request(transaction)
        .input('woo', sql.VarChar(15), rem.fac_nro_woo)
        .query(`SELECT TOP 1 fac_nro FROM dbo.factura WHERE fac_nro_woo = @woo AND fac_tip_cod = 'VTA' AND fac_est_fac = 'A'`);
      if (vtaPrev.recordset.length > 0) {
        throw errorNegocio(`Ya existe la factura ${vtaPrev.recordset[0].fac_nro} activa para el pedido Woo ${rem.fac_nro_woo}; la remisión ${fac_nro_rem} requiere revisión manual`);
      }
    }

    // 3. Consecutivos (mismas utilidades que el resto de documentos)
    const { fac_sec: NewFacSec } = await obtenerSiguienteFacSec(transaction);
    const { fac_nro: FinalFacNro } = await obtenerSiguienteFacNro(transaction, 'VTA');

    // 4. Encabezado de la VTA. fac_est_woo se copia de la REM (observación c); fac_nro_origen = REM.
    await new sql.Request(transaction)
      .input('NewFacSec', sql.Decimal(18, 0), NewFacSec)
      .input('fac_fec', sql.Date, fac_fec || new Date())
      .input('nit_sec', sql.VarChar(16), rem.nit_sec)
      .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
      .input('usuario', sql.VarChar(100), usuario)
      .input('fac_nro_woo', sql.VarChar(16), rem.fac_nro_woo)
      .input('fac_obs', sql.VarChar(1024), rem.fac_nro_woo ? `Factura de la remisión web ${rem.fac_nro} (pedido web #${rem.fac_nro_woo})` : `Factura de la remisión ${rem.fac_nro}`)
      .input('fac_est_woo', sql.VarChar(50), rem.fac_est_woo)
      .input('fac_descuento_general', sql.Decimal(17, 2), rem.fac_descuento_general || 0)
      .input('fac_total_woo', sql.Decimal(17, 2), rem.fac_total_woo)
      .input('fac_nro_origen', sql.NVarChar(15), rem.fac_nro)
      .query(`
        INSERT INTO dbo.factura
          (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac, fac_fch_cre, fac_usu_cod_cre,
           fac_nro_woo, fac_obs, fac_est_woo, fac_descuento_general, fac_total_woo, fac_nro_origen)
        VALUES
          (@NewFacSec, @fac_fec, 'VTA', 'VTA', @nit_sec, @FinalFacNro, 'A', GETDATE(), @usuario,
           @fac_nro_woo, @fac_obs, @fac_est_woo, @fac_descuento_general, @fac_total_woo, @fac_nro_origen)
      `);

    // 5. Líneas: copia fiel de la REM (bundles ya expandidos, precios y costos de la REM) con
    //    trazabilidad a la REM como hace COT→VTA. Naturaleza: 'R' en respaldo (la REM ya descontó,
    //    SPEC-014 §5.1) o '-' en el relevo legado.
    const lineas = await copiarLineasRemAVta(transaction, rem.fac_sec, NewFacSec, respaldo ? NATURALEZA.RESPALDADA : NATURALEZA.SALIDA);
    if (lineas.filas === 0) throw errorNegocio(`La remisión ${fac_nro_rem} no tiene líneas`, 400);

    // 6. Vínculo en la REM (convención COT→VTA del ERP). Respaldo: la REM sigue 'A' (es el movimiento
    //    de kardex), queda bloqueada por la VTA y deja de vencer. Relevo legado: REM → 'F'.
    const upd = await new sql.Request(transaction)
      .input('rem_sec', sql.Decimal(18, 0), rem.fac_sec)
      .input('vta', sql.NVarChar(15), FinalFacNro)
      .input('usuario', sql.VarChar(100), usuario)
      .query(`
        UPDATE dbo.factura
        SET ${respaldo ? "fac_vence_el = NULL," : "fac_est_fac = 'F',"}
            fac_nro_origen = @vta,
            fac_obs = LEFT(CONCAT(ISNULL(fac_obs, ''), ' | facturada en ', @vta), 1024),
            fac_usu_cod_mod = @usuario,
            fac_fch_mod = GETDATE()
        WHERE fac_sec = @rem_sec AND fac_est_fac = 'A'
      `);
    if (upd.rowsAffected[0] !== 1) throw errorNegocio(`La remisión ${fac_nro_rem} cambió de estado durante la facturación`);

    await transaction.commit();
    resultado = { ya_facturada: false, modelo: respaldo ? 'respaldo' : 'relevo', fac_nro_rem, fac_sec_vta: NewFacSec, fac_nro_vta: FinalFacNro, fac_nro_woo: rem.fac_nro_woo, art_secs: lineas.art_secs };
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* ya revertida */ }
    throw e;
  }
  return resultado;
};

/**
 * Copia las líneas de la REM a la VTA dentro de la transacción del relevo.
 * kar_nat '-' explícito; kar_kar_sec_ori / kar_fac_sec_ori apuntan a la línea y al documento
 * de la REM (misma trazabilidad que deja COT→VTA). Devuelve los art_sec distintos para el push.
 */
const copiarLineasRemAVta = async (transaction, remSec, vtaSec, karNat = NATURALEZA.SALIDA) => {
  const rs = await new sql.Request(transaction)
    .input('rem_sec', sql.Decimal(18, 0), remSec)
    .input('vta_sec', sql.Decimal(18, 0), vtaSec)
    .input('kar_nat', sql.VarChar(1), karNat)
    .query(`
      INSERT INTO dbo.facturakardes
        (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno,
         kar_kar_sec_ori, kar_fac_sec_ori,
         kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta, kar_precio_oferta, kar_descuento_porcentaje,
         kar_codigo_promocion, kar_descripcion_promocion, kar_bundle_padre, kar_cos)
      OUTPUT INSERTED.art_sec
      SELECT @vta_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, @kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno,
             kar_sec, @rem_sec,
             kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta, kar_precio_oferta, kar_descuento_porcentaje,
             kar_codigo_promocion, kar_descripcion_promocion, kar_bundle_padre, kar_cos
      FROM dbo.facturakardes
      WHERE fac_sec = @rem_sec
    `);
  return { filas: rs.rowsAffected[0], art_secs: [...new Set(rs.recordset.map((r) => String(r.art_sec)))] };
};

/**
 * REM → VTA (respaldo con SPEC-014; relevo si REM_FACTURA_SIN_KARDEX no es true). Idempotente.
 * Sirve para REM de pedidos web y para REM manuales del POS (sin fac_nro_woo: sin Woo ni seguimiento).
 * Después del commit: push REM_FACTURADA (neto 0, re-afirma el número sobre cualquier deriva de Woo)
 * y, si la confirmación vino del ERP, pedido Woo → processing.
 *
 * @param {object} p
 * @param {string}  p.fac_nro_rem
 * @param {string}  p.usuario           usu_cod (pantalla) o 'SISTEMA' (job)
 * @param {Date}   [p.fac_fec]          fecha de la VTA (default hoy)
 * @param {boolean}[p.notificarWoo]     true cuando el pago se confirmó en el ERP (Tarea 4 paso 5)
 */
export const facturarRemision = async ({ fac_nro_rem, usuario = 'SISTEMA', fac_fec = null, notificarWoo = false }) => {
  if (!fac_nro_rem) throw new Error('fac_nro_rem es obligatorio');
  const r = await ejecutarConAutoRecuperacion(() => _facturarRemisionInternal({ fac_nro_rem, usuario, fac_fec }), 'facturarRemision');

  const post = { push: null, estadoWoo: null };
  if (!r.ya_facturada) {
    if (notificarWoo && r.fac_nro_woo) {
      // ORDEN IMPORTANTE: primero Woo, después el push. Si la REM nació de un pedido `pending`, Woo no
      // había descontado stock y lo descuenta justo al pasar a processing; si el push fuera antes, Woo
      // quedaría en ERP − n hasta el siguiente movimiento del artículo. Para una REM de on-hold el
      // orden es indiferente (Woo ya descontó y no repite). Si Woo rechaza el cambio, la VTA ya existe
      // igual: se registra el error y el pedido sigue "en espera" en Woo.
      post.estadoWoo = await actualizarEstadoPedidoWoo(r.fac_nro_woo, 'processing', `Pago confirmado en el ERP por ${usuario} (${r.fac_nro_vta})`);
    }
    // El push se resuelve por la REM: en respaldo la VTA tiene líneas 'R' (sin efecto en kardex) y lo que
    // hay que re-afirmar en Woo es el número que ya descontó la remisión.
    post.push = await sincronizarDocumentoWoo({ fac_nro: r.fac_nro_rem, origen: 'REM_FACTURADA', usuario });
    const wooFallo = notificarWoo && post.estadoWoo && !post.estadoWoo.ok;
    if (r.fac_nro_woo) try {
      await upsertWooPedido({
        woo_order_id: Number(r.fac_nro_woo),
        estado_erp: ESTADO_ERP.FACTURADO,
        fac_nro_rem: r.fac_nro_rem,
        fac_nro_vta: r.fac_nro_vta,
        vence_el: null,
        woo_status: notificarWoo && post.estadoWoo?.ok ? 'processing' : undefined, // el job lo confirmará en el siguiente ciclo
        // Si Woo no aceptó el cambio de estado, queda visible en la pantalla; el pedido sigue "en espera" en Woo.
        error: wooFallo ? `Factura ${r.fac_nro_vta} creada, pero el pedido Woo no pasó a processing: ${post.estadoWoo.error}` : null,
        ultima_accion: `${r.modelo === 'respaldo' ? 'Facturada' : 'Relevo'} ${r.fac_nro_rem} → ${r.fac_nro_vta} por ${usuario}${notificarWoo ? (wooFallo ? ' (Woo NO actualizado)' : ' (pedido Woo → processing)') : ''}`
      });
    } catch (e) {
      console.error('[PEDIDOS_WEB] woo_pedidos no actualizado tras facturar:', e.message);
    }
  }
  return { ...r, ...post };
};

// ---------------------------------------------------------------------------
// Editar líneas de la REM de un pedido web desde el POS — SPEC-014 §5.4
// ---------------------------------------------------------------------------
const redondear2 = (n) => Number((Math.round(Number(n) * 100) / 100).toFixed(2));

/**
 * Guardar desde el POS las líneas de una REM que nació de un pedido web. Orden: Woo primero, ERP
 * después, push al final.
 *   1. REM activa, sin VTA activa (bloqueo por vínculo).
 *   2. GET del pedido en Woo: solo `pending` / `on-hold` (si ya pagó, es devolución, no edición → 409).
 *   3. Diff artículo / cantidad / precio contra las líneas actuales de Woo (mapeadas al ERP).
 *   4. PUT orders/{id} con line_items: quantity 0 quita, id+quantity cambia, product_id agrega; siempre con
 *      subtotal/total del ERP (Woo recalcula totales y cupones). Nota privada con el resumen.
 *      Si Woo rechaza → 502 y el ERP no cambia.
 *   5. La REM se reescribe con la RESPUESTA de Woo pasada por mapearPedidoWoo (mismo camino que la
 *      creación): cupones, bundles, lista y fac_total_woo quedan consistentes por construcción.
 *   6. updateOrder({ sinPropagarWoo }) → commit → push REM_EDITADA de la unión de artículos.
 *   7. Alerta de saldo y ultima_accion en woo_pedidos. fac_vence_el no cambia.
 * Editar líneas por REST no mueve date_modified del pedido, así que el importador no re-lee por esto;
 * si lo re-lee más tarde por un cambio de estado, las líneas ya coinciden y no dispara un reemplazo.
 */
export const editarLineasRemisionWoo = async ({ fac_nro_rem, nit_sec = null, detalles, descuento = 0, fac_descuento_general, usuario = null }) => {
  if (!fac_nro_rem) throw errorNegocio('fac_nro_rem es obligatorio', 400);
  if (!Array.isArray(detalles) || detalles.length === 0) throw errorNegocio('La remisión debe conservar al menos una línea', 400);
  const pool = await poolPromise;
  const rs = await pool.request().input('n', sql.VarChar(15), fac_nro_rem)
    .query(`SELECT fac_sec, fac_est_fac, fac_nro_woo, nit_sec FROM dbo.factura WHERE fac_nro = @n AND fac_tip_cod = 'REM'`);
  if (!rs.recordset.length) throw errorNegocio(`Remisión ${fac_nro_rem} no existe`, 404);
  const rem = rs.recordset[0];
  if (rem.fac_est_fac !== 'A') throw errorNegocio(`${fac_nro_rem} no está activa (${rem.fac_est_fac}); no se puede editar`);
  if (!rem.fac_nro_woo) throw errorNegocio(`${fac_nro_rem} no es de un pedido web`, 400);
  const destino = await destinoActivo(pool, { fac_sec: Number(rem.fac_sec) });
  if (destino) throw errorNegocio(`${fac_nro_rem} ya está facturada en ${destino.fac_nro}; anule la factura antes de editar la remisión`);

  // 2. Pedido en Woo
  const api = getWcApi();
  let order;
  try { order = (await api.get(`orders/${rem.fac_nro_woo}`)).data; } catch (e) { throw errorNegocio(`No se pudo leer el pedido #${rem.fac_nro_woo} en WooCommerce: ${e.message}`, 502); }
  if (clasificarEstadoWoo(order.status) !== CLASIFICACION.PENDIENTE_PAGO) {
    throw errorNegocio(`El pedido #${rem.fac_nro_woo} está "${order.status}" en WooCommerce: solo se edita mientras está pendiente de pago o en espera. Si ya pagó, la diferencia se maneja como devolución.`);
  }
  const actual = await mapearPedidoWoo(order);
  if (actual.errores.length) throw errorNegocio(`El pedido #${rem.fac_nro_woo} tiene líneas sin mapear en el ERP: ${actual.errores.join('; ')}`, 400);

  // 3. Diff (a nivel de artículo vendible: el POS no manda componentes de bundle y Woo tampoco los tiene)
  const desc = Math.max(0, Number(descuento) || 0);
  const deseadas = new Map();
  for (const d of detalles) {
    if (!d.art_sec || Number(d.kar_uni) <= 0) continue;
    const k = String(d.art_sec);
    const prev = deseadas.get(k);
    const qty = Number(d.kar_uni) + (prev ? prev.qty : 0);
    deseadas.set(k, { art_sec: k, qty, precio: Number(d.kar_pre_pub) || 0 });
  }
  const enWoo = new Map(actual.detalles.map((d) => [String(d.art_sec), d]));
  const lineItems = []; const cambios = { agregados: [], quitados: [], modificados: [] };
  const totales = (l) => { const subtotal = redondear2(l.precio * l.qty); return { subtotal: String(subtotal), total: String(redondear2(subtotal * (1 - desc / 100))) }; };
  for (const [k, w] of enWoo) {
    const d = deseadas.get(k);
    if (!d) { lineItems.push({ id: w.woo_line_id, quantity: 0 }); cambios.quitados.push(`${w.art_cod}×${w.kar_uni}`); continue; }
    if (Number(w.kar_uni) !== d.qty || Math.abs(Number(w.kar_pre_pub) - d.precio) >= 0.01) {
      lineItems.push({ id: w.woo_line_id, quantity: d.qty, ...totales(d) });
      cambios.modificados.push(`${w.art_cod}: ${w.kar_uni}→${d.qty}${Math.abs(Number(w.kar_pre_pub) - d.precio) >= 0.01 ? ` ($${w.kar_pre_pub}→$${d.precio})` : ''}`);
    }
  }
  const nuevos = [...deseadas.values()].filter((d) => !enWoo.has(d.art_sec));
  if (nuevos.length) {
    const req = pool.request();
    const params = nuevos.map((d, i) => { req.input(`a${i}`, sql.VarChar(30), d.art_sec); return `@a${i}`; });
    const arts = await req.query(`SELECT art_sec, art_cod, art_nom, art_woo_id, art_woo_variation_id, art_woo_type FROM dbo.articulos WHERE art_sec IN (${params.join(',')})`);
    const porSec = new Map(arts.recordset.map((a) => [String(a.art_sec), a]));
    for (const d of nuevos) {
      const a = porSec.get(d.art_sec);
      if (!a) throw errorNegocio(`Artículo ${d.art_sec} no existe`, 400);
      const li = { quantity: d.qty, ...totales(d) };
      if (a.art_woo_variation_id) { li.variation_id = Number(a.art_woo_variation_id); li.product_id = Number(a.art_woo_id) || undefined; }
      else if (a.art_woo_id && a.art_woo_type !== 'variable') li.product_id = Number(a.art_woo_id);
      else throw errorNegocio(`${a.art_nom} (${a.art_cod}) no está publicado en WooCommerce; no se puede agregar al pedido web. Créelo en Woo primero.`, 400);
      lineItems.push(li); cambios.agregados.push(`${a.art_cod}×${d.qty}`);
    }
  }
  if (lineItems.length === 0) return { fac_nro_rem, fac_nro_woo: rem.fac_nro_woo, sin_cambios: true, cambios };

  // 4. Woo primero
  const resumen = [cambios.agregados.length ? `+${cambios.agregados.join(', ')}` : '', cambios.quitados.length ? `−${cambios.quitados.join(', ')}` : '', cambios.modificados.length ? `Δ ${cambios.modificados.join(', ')}` : ''].filter(Boolean).join(' · ');
  let respuesta;
  try {
    respuesta = (await api.put(`orders/${rem.fac_nro_woo}`, { line_items: lineItems })).data;
  } catch (e) {
    const det = e.response?.data?.message || e.message;
    throw errorNegocio(`WooCommerce no aceptó la edición del pedido #${rem.fac_nro_woo} (${det}); la remisión ${fac_nro_rem} no cambió.`, 502);
  }
  try { await api.post(`orders/${rem.fac_nro_woo}/notes`, { note: `Modificado desde el ERP${usuario ? ` por ${usuario}` : ''} (${fac_nro_rem}): ${resumen}`.slice(0, 1000), customer_note: false }); } catch (e) { /* informativa */ }

  // 5-6. La REM nace del pedido Woo, también cuando la edición vino del POS.
  const nuevo = await mapearPedidoWoo(respuesta);
  if (nuevo.errores.length) throw errorNegocio(`Woo aceptó la edición pero devolvió líneas sin mapear: ${nuevo.errores.join('; ')}. Revise el pedido #${rem.fac_nro_woo} en wp-admin.`, 500);
  const { updateOrder } = await orderModel();
  const upd = await updateOrder({
    fac_nro: fac_nro_rem, fac_tip_cod: 'REM', nit_sec: nit_sec || rem.nit_sec, fac_est_fac: 'A',
    detalles: nuevo.detalles.map((d) => ({ art_sec: d.art_sec, kar_uni: d.kar_uni, kar_pre_pub: d.kar_pre_pub, kar_total: d.kar_total, kar_lis_pre_cod: nuevo.lis_pre_cod })),
    descuento: 0, fac_descuento_general: nuevo.fac_descuento_general, usuario, sinPropagarWoo: true
  });
  await pool.request().input('sec', sql.Decimal(18, 0), Number(rem.fac_sec)).input('t', sql.Decimal(17, 2), nuevo.total_woo > 0 ? nuevo.total_woo : null)
    .query('UPDATE dbo.factura SET fac_total_woo = @t WHERE fac_sec = @sec');

  // 7. Seguimiento
  let sinSaldo = [];
  try { sinSaldo = await articulosSinSaldoDeDocumento(fac_nro_rem); } catch (e) { /* informativo */ }
  const alerta = textoAlertaSaldo(sinSaldo);
  try {
    await upsertWooPedido({ woo_order_id: Number(rem.fac_nro_woo), woo_total: nuevo.total_woo, alerta, ultima_accion: `REM ${fac_nro_rem} editada desde el ERP${usuario ? ` por ${usuario}` : ''}: ${resumen}; pedido Woo actualizado; push ${upd.push?.ok ? 'OK' : 'con pendientes'}${alerta ? ' — ⚠ stock insuficiente' : ''}` });
  } catch (e) { console.error('[PEDIDOS_WEB] woo_pedidos no actualizado tras editar:', e.message); }
  return { ...upd, fac_nro_rem, fac_nro_woo: rem.fac_nro_woo, cambios, resumen, woo_total: nuevo.total_woo, alerta };
};

/**
 * SPEC-014 §5.5: una VTA respaldada se anuló (orderModel.anularDocumento). La REM sigue activa y
 * descontando; aquí solo se actualiza el seguimiento del pedido web para que la pantalla lo muestre.
 */
export const registrarVtaAnulada = async ({ fac_nro_vta, fac_nro_rem, fac_nro_woo, usuario = null }) => {
  if (!fac_nro_woo) return null;
  await upsertWooPedido({
    woo_order_id: Number(fac_nro_woo),
    estado_erp: ESTADO_ERP.REM_ACTIVA,
    fac_nro_rem: fac_nro_rem || undefined,
    fac_nro_vta: null,
    error: null,
    ultima_accion: `Factura ${fac_nro_vta} anulada${usuario ? ` por ${usuario}` : ''}; ${fac_nro_rem || 'la REM'} sigue activa y reservando (sin vencimiento automático)`
  });
  return { fac_nro_woo, fac_nro_rem };
};

/**
 * Re-afirma en Woo el stock de los artículos de una REM activa sin tocar el ERP. Lo usa el importador
 * cuando Woo cambia el estado de un pedido que ya tiene REM y en esa transición Woo movió `_stock` por
 * su cuenta (pending → on-hold descuenta, on-hold → pending devuelve): el número del ERP no cambió,
 * pero el de Woo sí, y el ERP es el dueño.
 */
export const reafirmarStockRemision = async ({ fac_nro_rem, usuario = 'SISTEMA' }) => {
  if (!fac_nro_rem) throw new Error('fac_nro_rem es obligatorio');
  return sincronizarDocumentoWoo({ fac_nro: fac_nro_rem, origen: 'REM_REAFIRMADA', usuario });
};

// ---------------------------------------------------------------------------
// Anular REM — Tarea 5
// ---------------------------------------------------------------------------
/**
 * Anula una remisión activa (→ 'I', push REM_ANULADA) y, si se pide, cancela el pedido en Woo.
 * Idempotente: una REM ya anulada devuelve { ya_anulada: true }. Una REM facturada NO se anula
 * (la VTA la reemplazó; una devolución es decisión contable manual).
 */
export const anularRemision = async ({ fac_nro_rem, motivo, usuario = 'SISTEMA', notificarWoo = false }) => {
  if (!fac_nro_rem) throw new Error('fac_nro_rem es obligatorio');
  const pool = await poolPromise;
  const rs = await pool.request()
    .input('fac_nro', sql.VarChar(15), fac_nro_rem)
    .query(`SELECT fac_sec, fac_nro, fac_est_fac, fac_nro_woo, fac_nro_origen FROM dbo.factura WHERE fac_nro = @fac_nro AND fac_tip_cod = 'REM'`);
  if (rs.recordset.length === 0) throw new Error(`Remisión ${fac_nro_rem} no existe`);
  const rem = rs.recordset[0];
  if (rem.fac_est_fac === 'I') return { ya_anulada: true, fac_nro_rem, fac_nro_woo: rem.fac_nro_woo };
  if (rem.fac_est_fac === 'F') throw errorNegocio(`La remisión ${fac_nro_rem} ya fue facturada en ${rem.fac_nro_origen}; anule la factura con criterio contable`);
  // SPEC-014 §2.6: con VTA activa cruzada (respaldo) la REM está bloqueada.
  const destino = await destinoActivo(pool, { fac_sec: Number(rem.fac_sec) });
  if (destino) throw errorNegocio(`La remisión ${fac_nro_rem} está facturada en ${destino.fac_nro} (activa); anule primero la factura`);

  // ORDEN IMPORTANTE: primero Woo, después el ERP. Al cancelar, Woo devuelve stock por su cuenta
  // (wc_maybe_increase_stock_levels); si el ERP empujara antes, ese incremento posterior dejaría
  // Woo = ERP + n (deriva observada en pruebas el 14/sep/2026). Cancelando primero, el push de la
  // anulación re-afirma el número del ERP encima del ajuste local de Woo.
  // Si Woo no acepta la cancelación, NO se anula en el ERP: dejar la REM anulada con el pedido
  // vivo en Woo permitiría que un pago posterior creara una segunda REM (doble venta).
  let estadoWoo = null;
  if (notificarWoo && rem.fac_nro_woo) {
    estadoWoo = await actualizarEstadoPedidoWoo(rem.fac_nro_woo, 'cancelled', `Anulado desde el ERP por ${usuario}: ${motivo || 'sin motivo'}`);
    if (!estadoWoo.ok) throw new Error(`No se pudo cancelar el pedido #${rem.fac_nro_woo} en WooCommerce (${estadoWoo.error}); la remisión ${fac_nro_rem} sigue activa. Intente de nuevo.`);
  }

  const obs = `Anulada: ${motivo || 'sin motivo'}${usuario ? ` (${usuario})` : ''}`;
  const { anularDocumento } = await orderModel();
  const anulada = await anularDocumento({ fac_nro: fac_nro_rem, fac_tip_cod: 'REM', fac_obs: obs.slice(0, 1024), usuario });
  if (rem.fac_nro_woo) try {
    await upsertWooPedido({
      woo_order_id: Number(rem.fac_nro_woo),
      estado_erp: ESTADO_ERP.ANULADO,
      fac_nro_rem,
      vence_el: null,
      error: null,
      alerta: null, // al anular, el stock volvió: la alerta de saldo ya no aplica
      woo_status: notificarWoo && estadoWoo?.ok ? 'cancelled' : undefined,
      ultima_accion: `REM anulada por ${usuario}: ${motivo || 'sin motivo'}${notificarWoo ? ' (pedido Woo → cancelled)' : ''}`
    });
  } catch (e) {
    console.error('[PEDIDOS_WEB] woo_pedidos no actualizado tras anular:', e.message);
  }
  return { ya_anulada: false, ...anulada, fac_nro_woo: rem.fac_nro_woo, estadoWoo };
};

// ---------------------------------------------------------------------------
// Listado para la pantalla (Tarea 8, versión mínima)
// ---------------------------------------------------------------------------
/**
 * Fechas de los filtros: llegan como 'YYYY-MM-DD' (input date) y se interpretan en hora de
 * Colombia (UTC-5) porque las columnas comparadas están en GMT. `hasta` es inclusivo (día completo).
 */
const inicioDiaColombia = (ymd) => {
  if (!ymd) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd}T00:00:00-05:00` : ymd);
  return isNaN(d.getTime()) ? null : d;
};
const finDiaColombia = (ymd) => {
  const d = inicioDiaColombia(ymd);
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  return d;
};

/**
 * @param {object} f
 * @param {string} [f.estado]  estado_erp exacto. Se ignora cuando se busca por número de pedido/documento.
 * @param {string} [f.desde]   'YYYY-MM-DD' (fecha del pedido en Woo, inclusivo)
 * @param {string} [f.hasta]   'YYYY-MM-DD' (inclusivo)
 * @param {string} [f.pedido]  número de pedido Woo, o fac_nro de la REM/VTA (p. ej. 'REM15', 'VTA2224')
 * @param {string} [f.cliente] texto: nombre o email de la clienta (LIKE)
 */
export const listarPedidosWeb = async ({ estado = null, desde = null, hasta = null, pedido = null, cliente = null, alerta = false, limite = 300 } = {}) => {
  const pool = await poolPromise;
  const pedidoTxt = pedido != null && String(pedido).trim() ? String(pedido).trim().toUpperCase().replace(/^#/, '') : null;
  const pedidoNum = pedidoTxt && /^\d+$/.test(pedidoTxt) ? Number(pedidoTxt) : null;
  const clienteTxt = cliente != null && String(cliente).trim() ? `%${String(cliente).trim()}%` : null;
  const req = pool.request()
    .input('estado', sql.VarChar(20), estado || null)
    .input('desde', sql.DateTime2(0), inicioDiaColombia(desde))
    .input('hasta', sql.DateTime2(0), finDiaColombia(hasta))
    .input('pedido_num', sql.Int, pedidoNum)
    .input('pedido_txt', sql.VarChar(15), pedidoTxt)
    .input('cliente', sql.NVarChar(160), clienteTxt)
    .input('solo_alerta', sql.Bit, alerta ? 1 : 0)
    .input('limite', sql.Int, Math.min(Math.max(1, Number(limite) || 300), 2000));
  const rs = await req.query(`
    SELECT TOP (@limite)
      p.woo_order_id, p.woo_status, p.woo_created_gmt, p.woo_modified_gmt, p.woo_total, p.woo_payment_method,
      p.woo_cliente, p.woo_email, p.fac_nro_rem, p.fac_nro_vta, p.estado_erp, p.vence_el, p.error, p.ultima_accion, p.alerta,
      p.intentos, p.actualizado_en,
      r.fac_fec AS rem_fec, r.fac_est_fac AS rem_est, r.fac_usu_cod_cre AS rem_usuario,
      ISNULL(n.nit_nom, p.woo_cliente) AS cliente, n.nit_ide,
      v.fac_est_fac AS vta_est, v.fac_fec AS vta_fec,
      ISNULL(t.total_rem, 0) AS total_rem
    FROM dbo.woo_pedidos p
    LEFT JOIN dbo.factura r ON r.fac_nro = p.fac_nro_rem AND r.fac_tip_cod = 'REM'
    LEFT JOIN dbo.nit n ON n.nit_sec = r.nit_sec
    LEFT JOIN dbo.factura v ON v.fac_nro = p.fac_nro_vta AND v.fac_tip_cod = 'VTA'
    LEFT JOIN (SELECT fac_sec, SUM(kar_total) AS total_rem FROM dbo.facturakardes GROUP BY fac_sec) t ON t.fac_sec = r.fac_sec
    WHERE (@pedido_txt IS NOT NULL OR @estado IS NULL OR p.estado_erp = @estado)
      AND (@pedido_txt IS NULL OR p.woo_order_id = @pedido_num OR p.fac_nro_rem = @pedido_txt OR p.fac_nro_vta = @pedido_txt)
      AND (@cliente IS NULL OR n.nit_nom LIKE @cliente OR p.woo_cliente LIKE @cliente OR p.woo_email LIKE @cliente)
      AND (@solo_alerta = 0 OR p.alerta IS NOT NULL)
      AND (@desde IS NULL OR ISNULL(p.woo_created_gmt, p.woo_modified_gmt) >= @desde)
      AND (@hasta IS NULL OR ISNULL(p.woo_created_gmt, p.woo_modified_gmt) <  @hasta)
    ORDER BY ISNULL(p.woo_created_gmt, p.woo_modified_gmt) DESC, p.woo_order_id DESC
  `);
  return rs.recordset;
};

/** Conteo por estado_erp para los filtros rápidos de la pantalla. */
export const contarPedidosWebPorEstado = async () => {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT estado_erp, COUNT(*) AS n,
           SUM(CASE WHEN estado_erp = 'REM_ACTIVA' AND vence_el IS NOT NULL AND vence_el <= DATEADD(HOUR, 24, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS por_vencer,
           SUM(CASE WHEN alerta IS NOT NULL THEN 1 ELSE 0 END) AS con_alerta
    FROM dbo.woo_pedidos GROUP BY estado_erp
  `);
  const out = { _alerta: { n: 0 } };
  for (const r of rs.recordset) {
    out[r.estado_erp] = { n: r.n, por_vencer: r.por_vencer, con_alerta: r.con_alerta };
    out._alerta.n += r.con_alerta;
  }
  return out;
};

export const calcularVencimiento = calcularVencimientoRem;
