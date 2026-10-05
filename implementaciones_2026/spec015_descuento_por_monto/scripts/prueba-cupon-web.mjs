// Arnés SPEC-015 — un pedido web con cupón de descuento por monto queda idéntico en el ERP.
//   cd api_pretty && DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings -r dotenv/config implementaciones_2026/spec015_descuento_por_monto/scripts/prueba-cupon-web.mjs
// Solo contra PSDATA_PRUEBAS + pruebas.prettymakeupcol.com (cupones mayoroctubre5/10 creados allí), backend local en :3001.
// Crea 2 pedidos de prueba en staging (on-hold, transferencia) y los factura en PSDATA_PRUEBAS.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { poolPromise } from '../../../db.js';
import { exigirPruebas } from '../../spec014_cot_rem_vta_pos/scripts/_solo-pruebas.mjs';

const API = 'http://localhost:3001/api';
const WC = axios.create({ baseURL: `${process.env.WC_URL}/wp-json/wc/v3`, auth: { username: process.env.WC_CONSUMER_KEY, password: process.env.WC_CONSUMER_SECRET }, timeout: 60000 });
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: API, headers: { 'x-access-token': token }, timeout: 300000, validateStatus: () => true });
const q = async (t) => (await (await poolPromise).request().query(t)).recordset;
const fila = async (id) => (await q(`SELECT estado_erp, fac_nro_rem, fac_nro_vta, error, ultima_accion FROM dbo.woo_pedidos WHERE woo_order_id=${id}`))[0];
const lineas = async (n) => q(`SELECT k.art_sec, k.kar_uni, k.kar_nat, k.kar_pre_pub, k.kar_total, k.kar_des_uno, k.kar_lis_pre_cod FROM dbo.facturakardes k INNER JOIN dbo.factura f ON f.fac_sec=k.fac_sec WHERE f.fac_nro='${n}' AND k.kar_bundle_padre IS NULL ORDER BY k.art_sec`);
const ciclo = async (b = {}) => (await api.post('/pedidos-web/importar-ahora', b)).data.resumen;
const checks = []; const ok = (n, c, d = '') => { checks.push(!!c); console.log(`${c ? '✔' : '✘'} ${n}${d ? ` — ${d}` : ''}`); };
const suma = (ls) => ls.reduce((s, l) => s + Number(l.kar_total), 0);

const N = { pid: 8053, qty: 20 }; // Rubor, sin oferta
const O = { pid: 7886, qty: 2 };  // Lip Gloss Camaleón, en oferta (Mercadillo)
const CUPON = 'mayoroctubre5';
const billing = (tag) => ({ first_name: 'Prueba', last_name: `SPEC015 ${tag}`, email: `prueba.spec015.${tag}@example.com`, phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' });

(async () => {
  await exigirPruebas();
  const art = async (pid) => (await WC.get(`products/${pid}`, { params: { _fields: 'id,sku,regular_price,sale_price,on_sale' } })).data;
  const pn = await art(N.pid); const po = await art(O.pid);
  console.log('productos:', pn, po);
  ok('0 precondición: N sin oferta, O en oferta', !pn.on_sale && po.on_sale);

  // ---------------- 1. Pedido creado con cupón ----------------
  const { data: o1 } = await WC.post('orders', {
    status: 'on-hold', payment_method: 'bacs', payment_method_title: 'Transferencia', set_paid: false, billing: billing('a'),
    line_items: [{ product_id: N.pid, quantity: N.qty }, { product_id: O.pid, quantity: O.qty }],
    coupon_lines: [{ code: CUPON }], customer_note: 'SPEC-015 prueba cupón — no despachar'
  });
  const l1 = new Map(o1.line_items.map((l) => [l.product_id, l]));
  console.log(`pedido staging #${o1.id} ${o1.status} total ${o1.total} descuento ${o1.discount_total}`, o1.line_items.map((l) => `${l.product_id}×${l.quantity} ${l.subtotal}→${l.total}`).join(', '));
  ok('1a Woo aplicó el 5 % solo a la línea sin oferta', Number(l1.get(N.pid).total) === Number(l1.get(N.pid).subtotal) * 0.95 && Number(l1.get(O.pid).total) === Number(l1.get(O.pid).subtotal), `desc ${o1.discount_total}`);

  await ciclo(); let f = await fila(o1.id); const rem1 = f?.fac_nro_rem;
  ok('1b importador: REM activa', f?.estado_erp === 'REM_ACTIVA' && !!rem1, `${rem1} ${f?.error || ''}`);
  let ln = await lineas(rem1);
  const lnN = ln.find((l) => Number(l.kar_uni) === N.qty); const lnO = ln.find((l) => Number(l.kar_uni) === O.qty);
  ok('1c REM: línea normal con ~5 % y total de Woo', lnN && Math.abs(Number(lnN.kar_des_uno) - 5) < 0.01 && Number(lnN.kar_total) === Number(l1.get(N.pid).total), lnN && `${lnN.kar_pre_pub}×${lnN.kar_uni} → ${lnN.kar_total} (${lnN.kar_des_uno}%)`);
  ok('1d REM: línea en oferta sin descuento', lnO && Number(lnO.kar_des_uno) === 0 && Number(lnO.kar_total) === Number(l1.get(O.pid).total));
  ok('1e REM: suma de líneas = total Woo', Math.abs(suma(ln) - Number(o1.total)) < 1, `${suma(ln)} vs ${o1.total}`);
  const obs = (await q(`SELECT fac_obs FROM dbo.factura WHERE fac_nro='${rem1}'`))[0]?.fac_obs || '';
  ok('1f fac_obs registra el cupón', /cup[oó]n/i.test(obs) && obs.toLowerCase().includes(CUPON), obs.slice(0, 120));

  // ---------------- 2. E2: editar líneas desde el POS se rechaza ----------------
  const detPos = (ls, cambiarQty) => ls.map((l) => ({ art_sec: l.art_sec, kar_uni: cambiarQty && l === ls[0] ? Number(l.kar_uni) + 1 : Number(l.kar_uni), kar_pre_pub: Number(l.kar_pre_pub), kar_lis_pre_cod: l.kar_lis_pre_cod }));
  const put = await api.put(`/order/${rem1}`, { fac_tip_cod: 'REM', nit_sec: null, fac_est_fac: 'A', descuento: 0, fac_usu_cod_cre: 'EDER', detalles: detPos(ln, true) });
  ok('2a PUT con cambio de cantidad → 409', put.status === 409 && /cup[oó]n/i.test(put.data.error || put.data.message || ''), `${put.status} ${put.data.error || put.data.message || ''}`.slice(0, 160));
  const o1b = (await WC.get(`orders/${o1.id}`)).data;
  ok('2b Woo intacto (mismas líneas y total)', o1b.total === o1.total && o1b.line_items.every((l) => l.quantity === l1.get(l.product_id).quantity));
  ok('2c REM intacta', JSON.stringify(await lineas(rem1)) === JSON.stringify(ln));
  const igual = await api.put(`/order/${rem1}`, { fac_tip_cod: 'REM', nit_sec: null, fac_est_fac: 'A', descuento: 0, fac_usu_cod_cre: 'EDER', detalles: detPos(ln, false) });
  ok('2d PUT sin cambios → sin_cambios (no bloquea facturar)', igual.status === 200 && igual.data.sin_cambios === true, `${igual.status} ${igual.data.error || ''}`);

  // ---------------- 3. Facturar: la VTA copia la REM ----------------
  const fac = await api.post(`/pedidos-web/${rem1}/facturar`, {});
  ok('3a facturar REM → VTA', fac.status === 200 && fac.data.success && !!fac.data.fac_nro_vta, `${fac.status} ${fac.data.fac_nro_vta || fac.data.error}`);
  const vta = await lineas(fac.data.fac_nro_vta);
  const firma = (ls) => ls.map((l) => `${l.art_sec}|${l.kar_uni}|${Number(l.kar_pre_pub)}|${Number(l.kar_total)}|${Number(l.kar_des_uno).toFixed(4)}|${l.kar_lis_pre_cod}`).join(';');
  ok('3b VTA idéntica a la REM línea a línea', firma(vta) === firma(ln), firma(vta));
  ok('3c VTA con kar_nat R (no descuenta de nuevo)', vta.every((l) => l.kar_nat === 'R'));
  ok('3d VTA: suma = total Woo', Math.abs(suma(vta) - Number(o1.total)) < 1);

  // ---------------- 4. E5: cupón agregado en Woo a un pedido ya importado ----------------
  const { data: o2 } = await WC.post('orders', {
    status: 'on-hold', payment_method: 'bacs', payment_method_title: 'Transferencia', set_paid: false, billing: billing('b'),
    line_items: [{ product_id: N.pid, quantity: N.qty }], customer_note: 'SPEC-015 prueba E5 — no despachar'
  });
  await ciclo(); f = await fila(o2.id); const rem2 = f?.fac_nro_rem;
  let ln2 = await lineas(rem2);
  ok('4a REM sin cupón: total lleno', !!rem2 && Math.abs(suma(ln2) - Number(o2.total)) < 1 && ln2.every((l) => Number(l.kar_des_uno) === 0), `${rem2} ${suma(ln2)}`);
  // Agregar el cupón por REST y tocar la nota (editar solo líneas/cupones por REST no mueve date_modified)
  const o2c = (await WC.put(`orders/${o2.id}`, { coupon_lines: [{ code: CUPON }] })).data;
  await WC.put(`orders/${o2.id}`, { customer_note: 'SPEC-015 prueba E5 — cupón agregado — no despachar' });
  ok('4b Woo: cupón aplicado al pedido existente', Number(o2c.discount_total) > 0, `total ${o2.total} → ${o2c.total}`);
  await ciclo(); f = await fila(o2.id);
  ln2 = await lineas(f?.fac_nro_rem);
  ok('4c importador detectó el cambio de totales y actualizó la REM', Math.abs(suma(ln2) - Number(o2c.total)) < 1 && ln2.some((l) => Math.abs(Number(l.kar_des_uno) - 5) < 0.01), `${f?.fac_nro_rem} suma ${suma(ln2)} vs ${o2c.total} · ${f?.ultima_accion}`);
  // Un ciclo más sin cambios no debe volver a reemplazar
  const remAntes = f?.fac_nro_rem; const firmaAntes = JSON.stringify(ln2);
  const secAntes = (await q(`SELECT MAX(k.kar_sec) m FROM dbo.facturakardes k INNER JOIN dbo.factura x ON x.fac_sec=k.fac_sec WHERE x.fac_nro='${remAntes}'`))[0].m;
  await WC.put(`orders/${o2.id}`, { customer_note: 'SPEC-015 prueba E5 — sin cambios — no despachar' });
  await ciclo(); f = await fila(o2.id);
  const secDespues = (await q(`SELECT MAX(k.kar_sec) m FROM dbo.facturakardes k INNER JOIN dbo.factura x ON x.fac_sec=k.fac_sec WHERE x.fac_nro='${f?.fac_nro_rem}'`))[0].m;
  ok('4d sin cambios de líneas → no reemplaza otra vez', f?.fac_nro_rem === remAntes && JSON.stringify(await lineas(remAntes)) === firmaAntes && secDespues === secAntes, f?.ultima_accion);

  // Limpieza: devolver el stock de prueba (los arneses de SPEC-014 usan el mismo artículo 4523)
  const anulVta = await api.post('/order/anular', { fac_nro: fac.data.fac_nro_vta, fac_tip_cod: 'VTA', fac_obs: 'Limpieza prueba SPEC-015', usuario: 'EDER' });
  const anulR1 = await api.post(`/pedidos-web/${rem1}/anular`, { motivo: 'Limpieza prueba SPEC-015' });
  const anulR2 = await api.post(`/pedidos-web/${f?.fac_nro_rem}/anular`, { motivo: 'Limpieza prueba SPEC-015' });
  console.log(`limpieza: ${fac.data.fac_nro_vta} ${anulVta.status} · ${rem1} ${anulR1.status} · ${f?.fac_nro_rem} ${anulR2.status}`);

  console.log(`\n${checks.filter(Boolean).length}/${checks.length} checks OK · pedidos staging #${o1.id} #${o2.id}`);
  process.exit(checks.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e.response?.data || e); process.exit(1); });
