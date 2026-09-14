/**
 * services/wooPedidoMapper.js — SPEC-013, Tarea 3
 * Traduce un pedido de WooCommerce (JSON de /wc/v3/orders) a lo que el ERP necesita para
 * crear un documento: cliente (nit_sec), líneas (art_sec + cantidades + precios pagados),
 * observaciones y clasificación del estado.
 *
 * Extraído de controllers/syncWooOrdersController.js (createOrder/updateOrder) para que lo
 * use el importador automático (jobs/importarPedidosWeb.js) sin depender de req/res, y para
 * que el mapeo SKU→art_sec, cliente→nit y estado→clasificación viva en un solo sitio.
 *
 * Reglas (specs/013 §4.6):
 *  - Llave del pedido: fac_nro_woo = order.number (así lo guarda el ERP desde siempre).
 *  - SKU no mapeable → NO se crea documento parcial: el pedido queda con error y se reintenta.
 *  - Variaciones: primero por SKU (art_cod); fallback por variation_id / product_id.
 *  - Bundles: se mandan como una sola línea del bundle; orderModel.expandirBundles los abre.
 *  - Precios: la línea registra lo que pagó la clienta en Woo (kar_pre_pub = precio de lista
 *    de la línea, kar_total = total con cupón prorrateado). Las columnas de promoción del
 *    catálogo las calcula orderModel a la fecha del pedido.
 *
 * Este módulo NO escribe en factura. Lo único que puede escribir es un cliente nuevo en
 * dbo.nit, y solo si se le pide explícitamente (resolverNitSec({ crear: true })).
 */
import { poolPromise, sql } from '../db.js';
import { generateConsecutivo, valorMayorista } from '../utils/facturaUtils.js';

// ---------------------------------------------------------------------------
// Estados de WooCommerce → clasificación del ERP (specs/013 §4.3)
// ---------------------------------------------------------------------------
export const CLASIFICACION = Object.freeze({
  PENDIENTE_PAGO: 'PENDIENTE_PAGO',   // compromete stock, sin pago confirmado → REM
  PAGADO: 'PAGADO',                   // compromete stock y está pagado → REM + VTA
  CANCELADO: 'CANCELADO',             // libera stock → anular REM
  REEMBOLSADO: 'REEMBOLSADO',         // libera stock → anular REM; VTA a revisión
  SIN_COMPROMISO: 'SIN_COMPROMISO',   // Woo no descontó nada (pending, borradores)
  DESCONOCIDO: 'DESCONOCIDO'
});

const ESTADOS = {
  'on-hold': CLASIFICACION.PENDIENTE_PAGO,
  'processing': CLASIFICACION.PAGADO,
  'completed': CLASIFICACION.PAGADO,
  'epayco-processing': CLASIFICACION.PAGADO,
  'epayco-completed': CLASIFICACION.PAGADO,
  'cancelled': CLASIFICACION.CANCELADO,
  'failed': CLASIFICACION.CANCELADO,
  'epayco-cancelled': CLASIFICACION.CANCELADO,
  'epayco-failed': CLASIFICACION.CANCELADO,
  'refunded': CLASIFICACION.REEMBOLSADO,
  'epayco-refunded': CLASIFICACION.REEMBOLSADO,
  'pending': CLASIFICACION.SIN_COMPROMISO,
  'epayco-pending': CLASIFICACION.SIN_COMPROMISO,
  'checkout-draft': CLASIFICACION.SIN_COMPROMISO,
  'auto-draft': CLASIFICACION.SIN_COMPROMISO,
  'trash': CLASIFICACION.SIN_COMPROMISO
};

/** Estado tal como viene de Woo ('epayco-processing' o 'epayco_processing') → clasificación. */
export const clasificarEstadoWoo = (status) => {
  if (!status || typeof status !== 'string') return CLASIFICACION.DESCONOCIDO;
  const s = status.trim().toLowerCase().replace(/_/g, '-').replace(/^wc-/, '');
  return ESTADOS[s] || CLASIFICACION.DESCONOCIDO;
};

/** El ERP guarda fac_est_woo con guion bajo ('on_hold'). Misma regla que el importador histórico. */
export const normalizarEstadoWoo = (status) => {
  if (!status || typeof status !== 'string') return status;
  return status.replace(/-/g, '_');
};

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------
const buscarCiudad = async (pool, nombre) => {
  if (!nombre || !String(nombre).trim()) return '68001';
  const rs = await pool.request()
    .input('cityName', sql.NVarChar(100), String(nombre).trim().toLowerCase())
    .query('SELECT ciu_cod FROM dbo.Ciudad WHERE LOWER(TRIM(ciu_nom)) = LOWER(TRIM(@cityName))');
  return rs.recordset.length > 0 ? rs.recordset[0].ciu_cod : '68001'; // Bucaramanga por defecto, como el importador histórico
};

const buscarNitPorEmail = async (pool, email) => {
  if (!email) return null;
  const rs = await pool.request()
    .input('email', sql.NVarChar(100), String(email).trim())
    .query('SELECT TOP 1 nit_sec FROM dbo.nit WHERE nit_email = @email');
  return rs.recordset.length > 0 ? rs.recordset[0].nit_sec : null;
};

/** Datos del cliente tal como vienen del pedido (billing + cc_o_nit del checkout). */
const extraerCliente = (order) => {
  const b = order.billing || {};
  const nitMeta = (order.meta_data || []).find((m) => m.key === 'cc_o_nit');
  return {
    email: (b.email || '').trim(),
    nombre: `${b.first_name || ''} ${b.last_name || ''}`.trim(),
    telefono: (b.phone || '').trim(),
    direccion: (b.address_1 || '').trim(),
    ciudad: (b.city || '').trim(),
    nit_ide: nitMeta && nitMeta.value ? String(nitMeta.value).trim() : ''
  };
};

/**
 * Devuelve el nit_sec del cliente del pedido. Si no existe y `crear` es true, lo crea
 * (misma lógica que el importador histórico: búsqueda por email, ciudad por nombre).
 * Con `crear=false` (modo simulación) devuelve nit_sec=null y nuevo=true.
 */
export const resolverNitSec = async (cliente, { crear = false } = {}) => {
  const pool = await poolPromise;
  const existente = await buscarNitPorEmail(pool, cliente.email);
  if (existente) return { nit_sec: existente, nuevo: false };
  if (!crear) return { nit_sec: null, nuevo: true };
  if (!cliente.email && !cliente.nombre) throw new Error('El pedido no trae email ni nombre de cliente');

  const nitSec = await generateConsecutivo('CLIENTES');
  const ciuCod = await buscarCiudad(pool, cliente.ciudad);
  const rs = await pool.request()
    .input('nit_sec', sql.NVarChar(16), nitSec)
    .input('nit_ide', sql.NVarChar(20), cliente.nit_ide || '')
    .input('nit_nom', sql.NVarChar(100), cliente.nombre || cliente.email)
    .input('nit_tel', sql.NVarChar(20), cliente.telefono)
    .input('nit_email', sql.NVarChar(100), cliente.email)
    .input('nit_dir', sql.NVarChar(200), cliente.direccion)
    .input('nit_ciudad', sql.NVarChar(100), cliente.ciudad)
    .input('ciu_cod', sql.NVarChar(10), ciuCod)
    .query(`
      INSERT INTO dbo.nit (nit_sec, nit_ide, nit_nom, nit_tel, nit_email, nit_dir, nit_ciudad, nit_ind_cli, nit_ind_pro, nit_fec_cre, nit_con_pag, ciu_cod)
      OUTPUT INSERTED.nit_sec
      VALUES (@nit_sec, @nit_ide, @nit_nom, @nit_tel, @nit_email, @nit_dir, @nit_ciudad, 1, 0, GETDATE(), 0, @ciu_cod)
    `);
  return { nit_sec: rs.recordset[0].nit_sec, nuevo: true };
};

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------
/**
 * Resuelve art_sec para cada line_item. Una sola consulta por pedido.
 * Orden de resolución: SKU = art_cod → variation_id = art_woo_variation_id → product_id = art_woo_id.
 */
const resolverArticulos = async (pool, lineItems) => {
  const skus = new Set();
  const varIds = new Set();
  const prodIds = new Set();
  for (const li of lineItems) {
    if (li.sku && String(li.sku).trim()) skus.add(String(li.sku).trim());
    if (li.variation_id && Number(li.variation_id) > 0) varIds.add(Number(li.variation_id));
    if (li.product_id && Number(li.product_id) > 0) prodIds.add(Number(li.product_id));
  }
  if (skus.size === 0 && varIds.size === 0 && prodIds.size === 0) return { porSku: new Map(), porVariacion: new Map(), porProducto: new Map() };

  const req = pool.request();
  const cond = [];
  const params = (set, prefijo, tipo) => {
    const names = [];
    let i = 0;
    for (const v of set) { const n = `${prefijo}${i++}`; req.input(n, tipo, v); names.push(`@${n}`); }
    return names;
  };
  const pSku = params(skus, 's', sql.VarChar(50));
  const pVar = params(varIds, 'v', sql.Int);
  const pPro = params(prodIds, 'p', sql.Int);
  if (pSku.length) cond.push(`a.art_cod IN (${pSku.join(',')})`);
  if (pVar.length) cond.push(`a.art_woo_variation_id IN (${pVar.join(',')})`);
  if (pPro.length) cond.push(`a.art_woo_id IN (${pPro.join(',')})`);

  const rs = await req.query(`
    SELECT a.art_sec, a.art_cod, a.art_nom, a.art_woo_id, a.art_woo_variation_id,
           ISNULL(a.art_woo_type, 'simple') AS art_woo_type, ISNULL(a.art_bundle, 'N') AS art_bundle
    FROM dbo.articulos a
    WHERE ${cond.join(' OR ')}
  `);
  const porSku = new Map();
  const porVariacion = new Map();
  const porProducto = new Map();
  for (const r of rs.recordset) {
    const fila = { ...r, art_sec: String(r.art_sec) };
    if (r.art_cod) porSku.set(String(r.art_cod).trim(), fila);
    if (r.art_woo_variation_id) porVariacion.set(Number(r.art_woo_variation_id), fila);
    // Solo productos "simples" o "variables" tienen art_woo_id propio; una variación
    // comparte product_id con sus hermanas y no debe resolverse por ahí.
    if (r.art_woo_id && r.art_woo_type !== 'variation') porProducto.set(Number(r.art_woo_id), fila);
  }
  return { porSku, porVariacion, porProducto };
};

const mapearLineas = async (pool, order) => {
  const lineItems = (order.line_items || []).filter((li) => Number(li.quantity) > 0);
  const { porSku, porVariacion, porProducto } = await resolverArticulos(pool, lineItems);
  const detalles = [];
  const errores = [];

  for (const li of lineItems) {
    const sku = li.sku ? String(li.sku).trim() : '';
    let art = sku ? porSku.get(sku) : null;
    let via = 'sku';
    if (!art && Number(li.variation_id) > 0) { art = porVariacion.get(Number(li.variation_id)); via = 'variation_id'; }
    if (!art && Number(li.product_id) > 0) {
      const cand = porProducto.get(Number(li.product_id));
      // Un producto variable no es vendible por sí mismo: si el SKU de la variación no
      // existe en el ERP, es un error de catálogo, no un fallback válido.
      if (cand && cand.art_woo_type !== 'variable') { art = cand; via = 'product_id'; }
    }
    if (!art) {
      errores.push(`Línea "${li.name || ''}" (sku=${sku || '∅'}, product_id=${li.product_id}, variation_id=${li.variation_id}) no existe en el ERP`);
      continue;
    }

    const quantity = Number(li.quantity);
    const subtotal = parseFloat(li.subtotal) || 0;   // sin cupón
    const total = parseFloat(li.total) || 0;         // con cupón prorrateado
    const precioLinea = parseFloat(li.price) || 0;   // Woo: total / quantity
    const karPrePub = subtotal > 0 ? subtotal / quantity : precioLinea;

    detalles.push({
      art_sec: art.art_sec,
      art_cod: art.art_cod,
      art_nom: art.art_nom,
      es_bundle: art.art_bundle === 'S',
      resuelto_por: via,
      kar_uni: quantity,
      kar_pre_pub: Number(karPrePub.toFixed(2)),
      kar_total: Number(total.toFixed(2)),
      kar_nat: '-',
      woo_line_id: li.id,
      woo_sku: sku,
      woo_nombre: li.name || ''
    });
  }
  return { detalles, errores };
};

// ---------------------------------------------------------------------------
// Encabezado
// ---------------------------------------------------------------------------
const construirObservaciones = (order, descuentoGeneral, prefijo) => {
  const obs = [prefijo];
  const descuentoCupones = parseFloat(order.discount_total) || 0;
  if (order.coupon_lines && order.coupon_lines.length > 0) {
    const codigo = order.coupon_lines[0].code?.trim() || '(sin código)';
    obs.push(descuentoCupones > 0 ? `Cupón (${codigo}): -$${descuentoCupones.toFixed(2)}` : `Cupón de descuento (${codigo})`);
  }
  if (descuentoGeneral > 0) {
    const nombres = (order.fee_lines || []).filter((f) => parseFloat(f.total) < 0).map((f) => f.name || 'Descuento general').join(', ');
    obs.push(`Descuento general: ${nombres} (${descuentoGeneral.toFixed(2)})`);
  }
  if (order.payment_method_title) obs.push(`Pago: ${order.payment_method_title}`);
  if (order.customer_note) obs.push(`Nota clienta: ${String(order.customer_note).slice(0, 200)}`);
  return obs.join(' | ').slice(0, 1024);
};

/**
 * Mapea el pedido completo. No escribe nada.
 * @returns {Promise<{
 *   woo_order_id:number, fac_nro_woo:string, estado_woo:string, estado_woo_normalizado:string,
 *   clasificacion:string, fac_fec:Date, woo_modified_gmt:string, total_woo:number, payment_method:string,
 *   fac_descuento_general:number, fac_obs:string, lis_pre_cod:number,
 *   cliente:{email,nombre,telefono,direccion,ciudad,nit_ide,nit_sec,nuevo},
 *   detalles:Array, errores:string[] }>}
 */
export const mapearPedidoWoo = async (order, { prefijoObs = null } = {}) => {
  const pool = await poolPromise;
  const numero = String(order.number ?? order.id);
  const estado = String(order.status || '');
  const clasificacion = clasificarEstadoWoo(estado);

  const cliente = extraerCliente(order);
  const nitExistente = await buscarNitPorEmail(pool, cliente.email);
  cliente.nit_sec = nitExistente;
  cliente.nuevo = !nitExistente;

  const { detalles, errores } = await mapearLineas(pool, order);
  if (detalles.length === 0 && errores.length === 0) errores.push('El pedido no tiene líneas con cantidad > 0');

  const feeLines = order.fee_lines || [];
  const descuentoGeneral = feeLines.filter((f) => parseFloat(f.total) < 0).reduce((s, f) => s + Math.abs(parseFloat(f.total)), 0);
  const totalLineas = detalles.reduce((s, d) => s + d.kar_total, 0);
  const montoMayorista = await valorMayorista();

  // fecha del pedido en hora del sitio (date_created viene sin zona, en la zona de WordPress = Colombia)
  const fac_fec = order.date_created ? new Date(order.date_created) : new Date();

  return {
    woo_order_id: Number(order.id),
    fac_nro_woo: numero,
    estado_woo: estado,
    estado_woo_normalizado: normalizarEstadoWoo(estado),
    clasificacion,
    fac_fec: isNaN(fac_fec.getTime()) ? new Date() : fac_fec,
    woo_modified_gmt: order.date_modified_gmt || order.date_modified || null,
    total_woo: parseFloat(order.total) || 0,
    payment_method: order.payment_method || null,
    fac_descuento_general: Number(descuentoGeneral.toFixed(2)),
    fac_obs: construirObservaciones(order, descuentoGeneral, prefijoObs || `Pedido web #${numero} importado automáticamente`),
    lis_pre_cod: totalLineas >= montoMayorista ? 2 : 1,
    cliente,
    detalles,
    errores
  };
};

/**
 * Compara las líneas vendibles de un documento del ERP con las del pedido mapeado.
 * Se usa para detectar un pedido editado en Woo mientras la REM está activa (§4.6).
 * Solo compara líneas "de cara al cliente" (sin componentes de bundle): art_sec + cantidad.
 */
export const lineasDifieren = (lineasErp, detallesMapeados) => {
  const clave = (a, u) => `${String(a)}|${Number(u)}`;
  const erp = new Map();
  for (const l of lineasErp) {
    if (l.kar_bundle_padre) continue;
    const k = clave(l.art_sec, l.kar_uni);
    erp.set(k, (erp.get(k) || 0) + 1);
  }
  const woo = new Map();
  for (const d of detallesMapeados) {
    const k = clave(d.art_sec, d.kar_uni);
    woo.set(k, (woo.get(k) || 0) + 1);
  }
  if (erp.size !== woo.size) return true;
  for (const [k, n] of erp) if (woo.get(k) !== n) return true;
  return false;
};
