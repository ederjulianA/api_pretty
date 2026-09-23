// Arnés SPEC-014 — camino web con respaldo (casos 9/10 del spec + REVISION por cancelación con VTA).
//   cd api_pretty && DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings implementaciones_2026/spec014_cot_rem_vta_pos/scripts/prueba-web-respaldo.mjs
// Solo contra el entorno de pruebas (PSDATA_PRUEBAS + pruebas.prettymakeupcol.com), backend local en :3001.
import 'dotenv/config';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { poolPromise } from '../../../db.js';
import { exigirPruebas } from './_solo-pruebas.mjs';

const API = 'http://localhost:3001/api';
const WC = axios.create({ baseURL: `${process.env.WC_URL}/wp-json/wc/v3`, auth: { username: process.env.WC_CONSUMER_KEY, password: process.env.WC_CONSUMER_SECRET }, timeout: 60000 });
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: API, headers: { 'x-access-token': token }, timeout: 300000, validateStatus: () => true });
const q = async (text, params = {}) => { const pool = await poolPromise; const r = pool.request(); for (const [k, v] of Object.entries(params)) r.input(k, v); return (await r.query(text)).recordset; };
const erpStock = async (a) => Number((await q('SELECT existencia FROM dbo.vwExistencias WHERE art_sec=@a', { a }))[0]?.existencia ?? 0);
const wooStock = async (pid) => Number((await WC.get(`products/${pid}`, { params: { _fields: 'id,stock_quantity' } })).data.stock_quantity);
const fila = async (id) => (await q('SELECT woo_status, estado_erp, fac_nro_rem, fac_nro_vta, vence_el, error, ultima_accion FROM dbo.woo_pedidos WHERE woo_order_id=@id', { id }))[0];
const cab = async (n) => (await q(`SELECT fac_est_fac, fac_nro_origen, fac_vence_el FROM dbo.factura WHERE fac_nro='${n}'`))[0];
const nat = async (n) => (await q(`SELECT DISTINCT k.kar_nat FROM dbo.facturakardes k INNER JOIN dbo.factura f ON f.fac_sec=k.fac_sec WHERE f.fac_nro='${n}'`)).map((r) => r.kar_nat).join('');
const ciclo = async (body = {}) => (await api.post('/pedidos-web/importar-ahora', body)).data.resumen;
const checks = []; const ok = (n, c, d = '') => { checks.push(!!c); console.log(`${c ? '✔' : '✘'} ${n}${d ? ` — ${d}` : ''}`); };

const ART = '1757', PID = 8053, QTY = 2; // 4523 Rubor Vergüenza (existencia 34)
(async () => {
  await exigirPruebas();
  const e0 = await erpStock(ART), w0 = await wooStock(PID);
  console.log(`inicio: ERP=${e0} Woo=${w0}`);
  const { data: o } = await WC.post('orders', {
    status: 'on-hold', payment_method: 'bacs', payment_method_title: 'Transferencia', set_paid: false,
    billing: { first_name: 'Prueba', last_name: 'Respaldo S14', email: 'prueba.respaldo.s14@example.com', phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' },
    line_items: [{ product_id: PID, quantity: QTY }], customer_note: 'SPEC-014 prueba respaldo — no despachar'
  });
  console.log('pedido staging #' + o.id, o.status);
  let r = await ciclo(); let f = await fila(o.id);
  ok('A importador creó la REM (on-hold)', f?.estado_erp === 'REM_ACTIVA' && f.fac_nro_rem, `${f?.fac_nro_rem} · ${f?.ultima_accion}`);
  const rem = f.fac_nro_rem; const cr = await cab(rem);
  ok('B factura.fac_vence_el fijado y espejo igual', cr.fac_vence_el && f.vence_el && Math.abs(new Date(cr.fac_vence_el) - new Date(f.vence_el)) < 2000);
  ok('C ERP = Woo tras la REM', (await erpStock(ART)) === e0 - QTY && (await wooStock(PID)) === e0 - QTY, `ERP=${await erpStock(ART)} Woo=${await wooStock(PID)}`);

  // Confirmar pago desde el ERP (pantalla / POS): VTA R + Woo → processing
  const fac = await api.post(`/pedidos-web/${rem}/facturar`);
  ok('D facturar desde el ERP → 200', fac.status === 200 && fac.data.fac_nro_vta, fac.data.fac_nro_vta || fac.data.error);
  const vta = fac.data.fac_nro_vta; const cr2 = await cab(rem);
  ok('E VTA con líneas R; REM sigue A cruzada, sin vencimiento', (await nat(vta)) === 'R' && cr2.fac_est_fac === 'A' && cr2.fac_nro_origen === vta && cr2.fac_vence_el === null);
  const ow = (await WC.get(`orders/${o.id}`, { params: { _fields: 'id,status' } })).data;
  ok('F pedido Woo → processing', ow.status === 'processing', ow.status);
  ok('G ERP = Woo tras facturar (sin doble descuento)', (await erpStock(ART)) === e0 - QTY && (await wooStock(PID)) === e0 - QTY, `ERP=${await erpStock(ART)} Woo=${await wooStock(PID)}`);
  f = await fila(o.id);
  ok('H seguimiento FACTURADO con REM y VTA', f.estado_erp === 'FACTURADO' && f.fac_nro_rem === rem && f.fac_nro_vta === vta && f.vence_el === null, f.ultima_accion);

  // Siguiente ciclo (Woo modificado por el cambio de estado): nada que hacer, sin REVISION
  r = await ciclo(); f = await fila(o.id);
  ok('I siguiente ciclo: sin acción, sin REVISION', f.estado_erp === 'FACTURADO' && !f.error && /ya facturado/i.test(f.ultima_accion || ''), f.ultima_accion);
  const docs = (await api.get(`/pedidos-web/${o.id}/documentos`)).data;
  ok('J documentos del pedido: REM A + VTA A', Array.isArray(docs.documentos) && docs.documentos.some((d) => d.fac_nro === rem && d.fac_est_fac === 'A') && docs.documentos.some((d) => d.fac_nro === vta));

  // Vencimiento no toca una REM facturada
  const v = (await api.post('/pedidos-web/vencer-ahora')).data;
  ok('K vencer-ahora no toca la REM facturada', (await cab(rem)).fac_est_fac === 'A', JSON.stringify(v.resumen || v));

  // Cancelación en Woo con VTA activa → REVISION (decisión humana), sin tocar kardex
  await WC.put(`orders/${o.id}`, { status: 'cancelled' });
  r = await ciclo(); f = await fila(o.id);
  ok('L cancelado en Woo con VTA activa → REVISION', f.estado_erp === 'REVISION', f.error || f.ultima_accion);
  ok('M REM y VTA siguen activas (nadie tocó kardex)', (await cab(rem)).fac_est_fac === 'A' && (await cab(vta)).fac_est_fac === 'A');

  // Resolución humana: anular la VTA (REM queda libre) y luego la REM → stock vuelve y Woo = ERP
  const anV = await api.post('/order/anular', { fac_nro: vta, fac_tip_cod: 'VTA', fac_obs: 'prueba: devolución' });
  ok('N anular VTA respaldada → REM libre', anV.status === 200 && anV.data.rem_liberada === rem, anV.data.error);
  const anR = await api.post('/order/anular', { fac_nro: rem, fac_tip_cod: 'REM', fac_obs: 'prueba: pedido cancelado' });
  ok('O anular REM (Woo ya cancelado) → 200', anR.status === 200, anR.data.error);
  const e1 = await erpStock(ART), w1 = await wooStock(PID);
  ok('P existencias de vuelta: ERP = Woo = inicial', e1 === e0 && w1 === e0, `ERP=${e1} Woo=${w1}`);
  f = await fila(o.id);
  ok('Q seguimiento final ANULADO', f.estado_erp === 'ANULADO', f.ultima_accion);

  const fallos = checks.filter((c) => !c).length;
  console.log(`\n${checks.length - fallos}/${checks.length} checks OK · pedido staging #${o.id} · ${rem} · ${vta}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.response?.data || e.message); process.exit(2); });
