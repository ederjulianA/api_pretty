// Arnés de pruebas SPEC-013 «pending → REM» (14/sep/2026). SOLO contra el entorno de pruebas:
//   cd api_pretty && DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings implementaciones_2026/spec013_inventario_woo/scripts/prueba-pending-rem.mjs
// Requiere el backend local corriendo en :3001 con .env.pruebas (PSDATA_PRUEBAS + pruebas.prettymakeupcol.com).
// Crea pedidos pending en staging (clientas ficticias example.com), dispara ciclos del importador y verifica woo_pedidos y ERP = Woo.
import 'dotenv/config';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { poolPromise, sql } from '../../../db.js';

const API = 'http://localhost:3001/api';
const WC = axios.create({ baseURL: `${process.env.WC_URL}/wp-json/wc/v3`, auth: { username: process.env.WC_CONSUMER_KEY, password: process.env.WC_CONSUMER_SECRET }, timeout: 60000 });
const token = jwt.sign({ usu_cod: 'PRUEBA', usu_nom: 'Prueba pending', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: API, headers: { 'x-access-token': token }, timeout: 300000 });

const q = async (text, params = {}) => { const pool = await poolPromise; const r = pool.request(); for (const [k, v] of Object.entries(params)) r.input(k, v); return (await r.query(text)).recordset; };
const erpStock = async (art_sec) => (await q('SELECT existencia FROM dbo.vwExistencias WHERE art_sec=@a', { a: art_sec }))[0]?.existencia ?? null;
const wooStock = async (pid) => (await WC.get(`products/${pid}`, { params: { _fields: 'id,stock_quantity,stock_status' } })).data;
const fila = async (id) => (await q('SELECT woo_order_id, woo_status, estado_erp, fac_nro_rem, fac_nro_vta, vence_el, alerta, error, ultima_accion FROM dbo.woo_pedidos WHERE woo_order_id=@id', { id }))[0];
const ciclo = async (body = {}) => (await api.post('/pedidos-web/importar-ahora', body)).data.resumen;

const crearPending = async (pid, qty, tag) => {
  const { data } = await WC.post('orders', {
    status: 'pending', payment_method: 'epayco', payment_method_title: 'ePayco', set_paid: false,
    billing: { first_name: 'Prueba', last_name: `Pending ${tag}`, email: `prueba.pending.${tag.toLowerCase()}@example.com`, phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' },
    line_items: [{ product_id: pid, quantity: qty }],
    customer_note: `SPEC-013 prueba pending ${tag} — no despachar`
  });
  return data;
};
const setStatus = async (id, status) => (await WC.put(`orders/${id}`, { status })).data;

const paridad = async (art_sec, pid, etiqueta) => {
  const e = await erpStock(art_sec); const w = await wooStock(pid);
  const ok = Number(e) === Number(w.stock_quantity);
  console.log(`   ${ok ? '✔' : '✘'} ${etiqueta}: ERP=${e} Woo=${w.stock_quantity} (${w.stock_status})`);
  return ok;
};
const mostrar = async (id) => { const f = await fila(id); console.log(`   fila: ${f?.estado_erp} rem=${f?.fac_nro_rem} vta=${f?.fac_nro_vta} vence=${f?.vence_el ? new Date(f.vence_el).toISOString().slice(0, 16) : null} err=${f?.error || '-'}\n   → ${f?.ultima_accion}`); return f; };

const ARTS = { A: { art_sec: '998', pid: 3506 }, B: { art_sec: '977', pid: 3322 }, C: { art_sec: '975', pid: 3320 }, D: { art_sec: '966', pid: 3311 }, E: { art_sec: '965', pid: 3310 }, F: { art_sec: '963', pid: 3308 } };
const paso = process.argv[2] || 'todo';
const resultados = [];
const check = (nombre, ok) => { resultados.push([nombre, ok]); console.log(`${ok ? '✔' : '✘'} ${nombre}`); };

try {
  // Estado inicial
  console.log('== Estado inicial ==');
  for (const [k, a] of Object.entries(ARTS)) await paridad(a.art_sec, a.pid, `art ${k}`);

  // T1: pending → REM (5 días) ; T2: luego processing → FACTURAR
  console.log('\n== T1: pending crea REM ==');
  const o1 = await crearPending(ARTS.A.pid, 2, 'T1');
  const e0 = await erpStock(ARTS.A.art_sec);
  let r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones), r.conError ? `errores=${r.conError}` : '');
  let f1 = await mostrar(o1.id);
  check('T1 REM_ACTIVA con REM', f1?.estado_erp === 'REM_ACTIVA' && !!f1.fac_nro_rem);
  const dias = f1?.vence_el ? (new Date(f1.vence_el) - Date.now()) / 86400000 : 0;
  check(`T1 vence en ~5 días (${dias.toFixed(2)})`, dias > 4.9 && dias <= 5.01);
  check('T1 ERP bajó 2', Number(await erpStock(ARTS.A.art_sec)) === Number(e0) - 2);
  check('T1 paridad', await paridad(ARTS.A.art_sec, ARTS.A.pid, 'art A tras REM'));

  console.log('\n== T2: pending→processing en Woo (Woo descuenta por su cuenta) → FACTURAR ==');
  await setStatus(o1.id, 'processing');
  const wTras = await wooStock(ARTS.A.pid); console.log(`   Woo tras processing (antes del ciclo): ${wTras.stock_quantity} (esperado ERP−2 transitorio)`);
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  f1 = await mostrar(o1.id);
  check('T2 FACTURADO con VTA', f1?.estado_erp === 'FACTURADO' && !!f1.fac_nro_vta);
  check('T2 paridad tras relevo', await paridad(ARTS.A.art_sec, ARTS.A.pid, 'art A tras VTA'));

  // T3: pending → REM → confirmar pago desde el ERP (notificarWoo) → orden Woo-primero
  console.log('\n== T3: pending → REM → Confirmar pago desde el ERP ==');
  const o3 = await crearPending(ARTS.B.pid, 1, 'T3');
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  let f3 = await mostrar(o3.id);
  check('T3 REM_ACTIVA', f3?.estado_erp === 'REM_ACTIVA');
  const fac = (await api.post(`/pedidos-web/${f3.fac_nro_rem}/facturar`, {})).data; console.log('   facturar:', fac.success, fac.data?.fac_nro_vta || fac.fac_nro_vta || '', JSON.stringify(fac.data?.estadoWoo || fac.estadoWoo || {}));
  f3 = await mostrar(o3.id);
  const o3w = (await WC.get(`orders/${o3.id}`, { params: { _fields: 'id,status' } })).data;
  check('T3 Woo → processing', o3w.status === 'processing');
  check('T3 FACTURADO', f3?.estado_erp === 'FACTURADO' && !f3.error);
  check('T3 paridad (Woo primero, push después)', await paridad(ARTS.B.art_sec, ARTS.B.pid, 'art B'));

  // T4: pending → REM → on-hold en Woo (Woo descuenta) → NADA + re-afirmar ; → pending (Woo devuelve) → re-afirmar
  console.log('\n== T4: REM activa y Woo cambia pending → on-hold → pending ==');
  const o4 = await crearPending(ARTS.C.pid, 1, 'T4');
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  await setStatus(o4.id, 'on-hold');
  console.log(`   Woo tras on-hold (antes del ciclo): ${(await wooStock(ARTS.C.pid)).stock_quantity}`);
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  let f4 = await mostrar(o4.id);
  check('T4a sigue REM_ACTIVA y re-afirmó', f4?.estado_erp === 'REM_ACTIVA' && /re-afirmado/.test(f4.ultima_accion));
  check('T4a paridad tras on-hold', await paridad(ARTS.C.art_sec, ARTS.C.pid, 'art C'));
  await setStatus(o4.id, 'pending');
  console.log(`   Woo tras volver a pending (antes del ciclo): ${(await wooStock(ARTS.C.pid)).stock_quantity}`);
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  f4 = await mostrar(o4.id);
  check('T4b sigue REM_ACTIVA y re-afirmó', f4?.estado_erp === 'REM_ACTIVA' && /on-hold → pending/.test(f4.ultima_accion));
  check('T4b paridad tras volver a pending', await paridad(ARTS.C.art_sec, ARTS.C.pid, 'art C'));

  // T5: pending → REM → cancelado en Woo → ANULAR_REM
  console.log('\n== T5: pending → REM → cancelado en Woo ==');
  const o5 = await crearPending(ARTS.D.pid, 1, 'T5');
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  const e5 = await erpStock(ARTS.D.art_sec);
  await setStatus(o5.id, 'cancelled');
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  const f5 = await mostrar(o5.id);
  check('T5 ANULADO', f5?.estado_erp === 'ANULADO');
  check('T5 ERP devolvió 1', Number(await erpStock(ARTS.D.art_sec)) === Number(e5) + 1);
  check('T5 paridad', await paridad(ARTS.D.art_sec, ARTS.D.pid, 'art D'));

  // T6: pending → REM → vencimiento → anulada + Woo cancelled
  console.log('\n== T6: pending → REM → vence → anulada y Woo cancelled ==');
  const o6 = await crearPending(ARTS.E.pid, 1, 'T6');
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  await q("UPDATE dbo.woo_pedidos SET vence_el = DATEADD(HOUR,-1,SYSUTCDATETIME()) WHERE woo_order_id=@id", { id: o6.id });
  const v = (await api.post('/pedidos-web/vencer-ahora', {})).data; console.log('   vencer-ahora:', JSON.stringify(v.resumen || v));
  const f6 = await mostrar(o6.id);
  const o6w = (await WC.get(`orders/${o6.id}`, { params: { _fields: 'id,status' } })).data;
  check('T6 ANULADO', f6?.estado_erp === 'ANULADO');
  check('T6 Woo cancelled', o6w.status === 'cancelled');
  check('T6 paridad', await paridad(ARTS.E.art_sec, ARTS.E.pid, 'art E'));

  // T7: pending viejo (> 5 días) → NADA (abandonado)
  console.log('\n== T7: pending con más de 5 días no reserva ==');
  const o7 = await crearPending(ARTS.F.pid, 1, 'T7');
  await WC.put(`orders/${o7.id}`, { date_created_gmt: new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 19) });
  const o7w = (await WC.get(`orders/${o7.id}`, { params: { _fields: 'id,status,date_created_gmt' } })).data; console.log('   date_created_gmt en Woo:', o7w.date_created_gmt);
  r = await ciclo(); console.log('   ciclo:', JSON.stringify(r.acciones));
  const f7 = await mostrar(o7.id);
  check('T7 sin REM, motivo abandonado', f7?.estado_erp === 'SIN_DOC' && /abandonado/.test(f7.ultima_accion));
  check('T7 paridad intacta', await paridad(ARTS.F.art_sec, ARTS.F.pid, 'art F'));

  console.log('\n== Resumen ==');
  const okN = resultados.filter(([, ok]) => ok).length;
  console.log(`${okN}/${resultados.length} checks OK`);
  resultados.filter(([, ok]) => !ok).forEach(([n]) => console.log('  ✘', n));
  console.log('Pedidos de prueba:', [o1.id, o3.id, o4.id, o5.id, o6.id, o7.id].join(', '));
} catch (e) {
  console.error('FALLÓ:', e.response?.status, JSON.stringify(e.response?.data || e.message).slice(0, 800));
} finally {
  process.exit(0);
}
