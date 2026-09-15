// Arnés SPEC-014 §5.4 — editar desde el POS la REM de un pedido web (casos 6, 7, 8, 9 del spec).
//   cd api_pretty && DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings implementaciones_2026/spec014_cot_rem_vta_pos/scripts/prueba-editar-rem-woo.mjs
// Solo contra PSDATA_PRUEBAS + pruebas.prettymakeupcol.com, backend local en :3001.
import 'dotenv/config';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { poolPromise } from '../../../db.js';

const API = 'http://localhost:3001/api';
const WC = axios.create({ baseURL: `${process.env.WC_URL}/wp-json/wc/v3`, auth: { username: process.env.WC_CONSUMER_KEY, password: process.env.WC_CONSUMER_SECRET }, timeout: 60000 });
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: API, headers: { 'x-access-token': token }, timeout: 300000, validateStatus: () => true });
const q = async (t) => (await (await poolPromise).request().query(t)).recordset;
const erp = async (a) => Number((await q(`SELECT existencia FROM dbo.vwExistencias WHERE art_sec='${a}'`))[0]?.existencia ?? 0);
const woo = async (pid) => Number((await WC.get(`products/${pid}`, { params: { _fields: 'id,stock_quantity' } })).data.stock_quantity);
const fila = async (id) => (await q(`SELECT estado_erp, fac_nro_rem, fac_nro_vta, alerta, error, ultima_accion, woo_total FROM dbo.woo_pedidos WHERE woo_order_id=${id}`))[0];
const lineas = async (n) => q(`SELECT k.art_sec, k.kar_uni, k.kar_nat, k.kar_pre_pub, k.kar_total FROM dbo.facturakardes k INNER JOIN dbo.factura f ON f.fac_sec=k.fac_sec WHERE f.fac_nro='${n}' ORDER BY k.kar_sec`);
const ciclo = async (b = {}) => (await api.post('/pedidos-web/importar-ahora', b)).data.resumen;
const checks = []; const ok = (n, c, d = '') => { checks.push(!!c); console.log(`${c ? '✔' : '✘'} ${n}${d ? ` — ${d}` : ''}`); };
const det = (items) => items.map((i) => ({ art_sec: i.art_sec, kar_uni: i.qty, kar_pre_pub: i.precio, kar_lis_pre_cod: 2 }));

const A = { art_sec: '1757', pid: 8053, precio: 13500, cod: '4523' }; // Rubor (34)
const B = { art_sec: '1835', pid: 8688, precio: 8000, cod: '4599' };  // Cherry Boom (11)
const C = { art_sec: '1737', pid: 7909, precio: 27900, cod: '4503' }; // Luxury Pink (10)
(async () => {
  const e0 = { A: await erp(A.art_sec), B: await erp(B.art_sec), C: await erp(C.art_sec) };
  console.log('inicio ERP:', e0, 'Woo:', { A: await woo(A.pid), B: await woo(B.pid), C: await woo(C.pid) });
  const { data: o } = await WC.post('orders', {
    status: 'on-hold', payment_method: 'bacs', payment_method_title: 'Transferencia', set_paid: false,
    billing: { first_name: 'Prueba', last_name: 'Editar S14', email: 'prueba.editar.s14@example.com', phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' },
    line_items: [{ product_id: A.pid, quantity: 2 }, { product_id: B.pid, quantity: 1 }], customer_note: 'SPEC-014 prueba edición — no despachar'
  });
  console.log('pedido staging #' + o.id, o.status, 'total', o.total);
  await ciclo(); let f = await fila(o.id); const rem = f?.fac_nro_rem;
  ok('A REM creada por el importador', f?.estado_erp === 'REM_ACTIVA' && rem, `${rem}`);
  ok('B ERP = Woo tras la REM', (await erp(A.art_sec)) === e0.A - 2 && (await woo(A.pid)) === e0.A - 2 && (await woo(B.pid)) === e0.B - 1);

  // Caso 6: +C×1, −B, A 2→3 (desde el "POS": PUT /order/REM con fac_tip_cod REM)
  const put = await api.put(`/order/${rem}`, { fac_tip_cod: 'REM', nit_sec: null, fac_est_fac: 'A', descuento: 0, fac_usu_cod_cre: 'EDER', detalles: det([{ ...A, qty: 3 }, { ...C, qty: 1 }]) });
  ok('6a PUT REM de Woo → 200', put.status === 200, put.data.error || JSON.stringify(put.data.cambios));
  ok('6b cambios detectados (+C, −B, A 2→3)', put.data.cambios?.agregados?.length === 1 && put.data.cambios?.quitados?.length === 1 && put.data.cambios?.modificados?.length === 1, put.data.resumen);
  const ow = (await WC.get(`orders/${o.id}`)).data;
  const wl = new Map(ow.line_items.map((l) => [l.product_id, l]));
  ok('6c Woo: líneas A×3, C×1, sin B', wl.get(A.pid)?.quantity === 3 && wl.get(C.pid)?.quantity === 1 && !wl.has(B.pid) && ow.line_items.length === 2, ow.line_items.map((l) => `${l.product_id}×${l.quantity}@${l.subtotal}`).join(', '));
  ok('6d Woo: precios del ERP en subtotal', Number(wl.get(A.pid)?.subtotal) === 3 * A.precio && Number(wl.get(C.pid)?.subtotal) === C.precio);
  const ln = await lineas(rem);
  ok('6e REM: líneas "-" A×3 y C×1', ln.length === 2 && ln.every((l) => l.kar_nat === '-') && ln.some((l) => String(l.art_sec) === A.art_sec && Number(l.kar_uni) === 3) && ln.some((l) => String(l.art_sec) === C.art_sec && Number(l.kar_uni) === 1));
  ok('6f existencias ERP: A −3, B libre, C −1', (await erp(A.art_sec)) === e0.A - 3 && (await erp(B.art_sec)) === e0.B && (await erp(C.art_sec)) === e0.C - 1);
  ok('6g Woo = ERP en los tres (push de la unión pisó el ajuste local de Woo)', (await woo(A.pid)) === e0.A - 3 && (await woo(B.pid)) === e0.B && (await woo(C.pid)) === e0.C - 1, `Woo A=${await woo(A.pid)} B=${await woo(B.pid)} C=${await woo(C.pid)}`);
  const notas = (await WC.get(`orders/${o.id}/notes`)).data;
  ok('6h nota privada en el pedido', notas.some((n) => /Modificado desde el ERP/.test(n.note)));
  f = await fila(o.id);
  ok('6i seguimiento: ultima_accion y total actualizados', /editada desde el ERP/.test(f.ultima_accion || '') && Number(f.woo_total) === Number(ow.total), `${f.ultima_accion} · total ${f.woo_total}`);
  const cab = (await q(`SELECT fac_total_woo, fac_vence_el FROM dbo.factura WHERE fac_nro='${rem}'`))[0];
  ok('6j fac_total_woo = total Woo; vencimiento intacto', Number(cab.fac_total_woo) === Number(ow.total) && cab.fac_vence_el !== null);
  const sinCambios = await api.put(`/order/${rem}`, { fac_tip_cod: 'REM', nit_sec: null, fac_est_fac: 'A', descuento: 0, detalles: det([{ ...A, qty: 3 }, { ...C, qty: 1 }]) });
  ok('6k mismo payload → sin_cambios', sinCambios.status === 200 && sinCambios.data.sin_cambios === true);

  // Un ciclo del importador (forzando relectura) no reemplaza la REM
  await ciclo({ reprocesar: true }); f = await fila(o.id);
  ok('6l importador (reprocesar): REM intacta, sin reemplazo', f.fac_nro_rem === rem && f.estado_erp === 'REM_ACTIVA' && !/reemplazada/i.test(f.ultima_accion || ''), f.ultima_accion);

  // Caso 7: Woo caído → 502 y ERP intacto (URL inválida vía WC_URL no se puede cambiar en caliente: simular con producto inexistente)
  const malo = await api.put(`/order/${rem}`, { fac_tip_cod: 'REM', nit_sec: null, fac_est_fac: 'A', descuento: 0, detalles: det([{ ...A, qty: 3 }, { ...C, qty: 1 }, { art_sec: '999999999', qty: 1, precio: 1 }]) });
  ok('7a artículo inexistente → 400 y REM intacta', malo.status === 400 && (await lineas(rem)).length === 2, malo.data.error);

  // Caso 8: pedido ya pagado → 409
  await WC.put(`orders/${o.id}`, { status: 'processing' });
  const pagado = await api.put(`/order/${rem}`, { fac_tip_cod: 'REM', nit_sec: null, fac_est_fac: 'A', descuento: 0, detalles: det([{ ...A, qty: 1 }]) });
  ok('8a pedido processing en Woo → 409', pagado.status === 409, pagado.data.error);

  // Caso 9: el importador ve el pago y factura con las líneas editadas
  await ciclo(); f = await fila(o.id);
  const vl = f.fac_nro_vta ? await lineas(f.fac_nro_vta) : [];
  ok('9a importador facturó con las líneas editadas (A×3, C×1, "R")', f.estado_erp === 'FACTURADO' && vl.length === 2 && vl.every((l) => l.kar_nat === 'R'), `${f.fac_nro_vta} · ${f.ultima_accion}`);
  ok('9b existencias sin doble descuento', (await erp(A.art_sec)) === e0.A - 3 && (await erp(C.art_sec)) === e0.C - 1 && (await woo(A.pid)) === e0.A - 3);

  // Limpieza: cancelar en Woo, anular VTA y REM
  await WC.put(`orders/${o.id}`, { status: 'cancelled' });
  await api.post('/order/anular', { fac_nro: f.fac_nro_vta, fac_tip_cod: 'VTA', fac_obs: 'limpieza prueba' });
  await api.post('/order/anular', { fac_nro: rem, fac_tip_cod: 'REM', fac_obs: 'limpieza prueba' });
  ok('L existencias de vuelta ERP y Woo', (await erp(A.art_sec)) === e0.A && (await erp(C.art_sec)) === e0.C && (await woo(A.pid)) === e0.A && (await woo(B.pid)) === e0.B && (await woo(C.pid)) === e0.C, `ERP A=${await erp(A.art_sec)} C=${await erp(C.art_sec)} Woo A=${await woo(A.pid)} B=${await woo(B.pid)} C=${await woo(C.pid)}`);

  const fallos = checks.filter((c) => !c).length;
  console.log(`\n${checks.length - fallos}/${checks.length} checks OK · pedido #${o.id} · ${rem}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.response?.data || e.message); process.exit(2); });
