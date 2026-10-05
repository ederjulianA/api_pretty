// Prueba de UI (Playwright) SPEC-015: el POS no altera un pedido web con cupón (E1, E2, E3, E4).
// Front :5174 → backend :3001 → PSDATA_PRUEBAS + staging (cupón mayoroctubre5 creado allí).
// Cómo correrla (usa el Playwright de negocio_prettymakeup/e2e y los paquetes de api_pretty):
//   cd negocio_prettymakeup/e2e && ln -sf ../../api_pretty/node_modules/{jsonwebtoken,axios,dotenv} node_modules/ \
//     && cp ../../api_pretty/implementaciones_2026/spec015_descuento_por_monto/scripts/prueba-ui-pos-cupon.mjs ./_ui.mjs \
//     && SHOTS=<carpeta> node _ui.mjs; rm _ui.mjs
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'node:fs';
import dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync('/Users/eder/Developer/GitHub/api_pretty/.env.pruebas'));
if (!/pruebas\./.test(env.WC_URL) || env.DB_DATABASE !== 'PSDATA_PRUEBAS') { console.error('ABORTADO: .env.pruebas no apunta a pruebas'); process.exit(1); }
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: 'http://localhost:3001/api', headers: { 'x-access-token': token }, timeout: 300000, validateStatus: () => true });
const WC = axios.create({ baseURL: `${env.WC_URL}/wp-json/wc/v3`, auth: { username: env.WC_CONSUMER_KEY, password: env.WC_CONSUMER_SECRET }, timeout: 60000 });
const checks = []; const ok = (n, c, d = '') => { checks.push(!!c); console.log(`${c ? '✔' : '✘'} ${n}${d ? ` — ${d}` : ''}`); };
const SHOTS = process.env.SHOTS || '.';
const pesos = (n) => Math.round(Number(n)).toLocaleString('es-CO');

const { data: o } = await WC.post('orders', {
  status: 'on-hold', payment_method: 'bacs', payment_method_title: 'Transferencia', set_paid: false,
  billing: { first_name: 'Prueba', last_name: 'SPEC015 UI', email: 'prueba.spec015.ui@example.com', phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' },
  line_items: [{ product_id: 8053, quantity: 20 }, { product_id: 7886, quantity: 2 }],
  coupon_lines: [{ code: 'mayoroctubre5' }], customer_note: 'SPEC-015 prueba UI — no despachar'
});
console.log(`pedido staging #${o.id} total ${o.total} descuento ${o.discount_total}`);
await api.post('/pedidos-web/importar-ahora', {});
const rem = (await api.get('/pedidos-web', { params: { pedido: o.id } })).data?.data?.[0]?.fac_nro_rem
  || (await api.get('/pedidos-web', { params: { pedido: o.id } })).data?.pedidos?.[0]?.fac_nro_rem;
ok('0 REM creada por el importador', !!rem, rem);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(({ t }) => { localStorage.setItem('pedidos_pretty_token', t); localStorage.setItem('user_pretty', 'EDER'); localStorage.setItem('user_role', 'Admin'); localStorage.setItem('cambia_pass', 'false'); localStorage.setItem('user_permissions', JSON.stringify({ pos: { access: true, actions: ['view', 'create', 'edit'] }, orders: { access: true, actions: ['view'] } })); }, { t: token });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
const puts = [];
page.on('request', (r) => { if (r.method() === 'PUT' && /\/order\//.test(r.url())) puts.push(r.url()); });

let vta = null;
try {
  await page.goto(`http://localhost:5174/pos?fac_nro=${rem}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const aside = await page.locator('aside').innerText();
  ok('1 aviso "Pedido web con cupón" visible', /Pedido web con cup[oó]n/i.test(aside));
  ok('2 total en pantalla = total Woo', aside.includes(pesos(o.total)), `Woo ${pesos(o.total)}`);
  ok('3 descuento en pantalla = descuento Woo', aside.includes(pesos(o.discount_total)), `Woo ${pesos(o.discount_total)}`);
  ok('4 % de descuento manual deshabilitado', await page.locator('aside input[type="number"]').first().isDisabled());
  ok('5 tipo de precio fijo (no se recalcula)', await page.locator('aside select').first().isDisabled());
  await page.screenshot({ path: `${SHOTS}/ui-spec015-rem.png` });

  await page.getByRole('button', { name: 'Facturar', exact: true }).click();
  const confirmar = page.locator('.swal2-confirm');
  await page.waitForSelector('.swal2-title', { timeout: 60000 });
  let titulo = (await page.locator('.swal2-title').textContent()).trim();
  if (!/Factura creada|ya estaba facturada/i.test(titulo)) { await confirmar.click(); await page.waitForSelector('.swal2-title:has-text("Factura")', { timeout: 60000 }); titulo = (await page.locator('.swal2-title').textContent()).trim(); }
  const html = await page.locator('.swal2-html-container').innerText();
  vta = html.match(/VTA\d+/)?.[0];
  ok('6 factura creada desde el POS', /Factura creada/i.test(titulo) && !!vta, `${titulo} ${vta || ''}`);
  ok('7 sin PUT de líneas al facturar (E1)', puts.length === 0, puts.join(', '));
  await page.screenshot({ path: `${SHOTS}/ui-spec015-facturada.png` });

  const lin = async (n) => (await api.get(`/order/${n}`)).data.order.details.filter((d) => !d.kar_bundle_padre)
    .map((d) => `${d.art_sec}|${d.kar_uni}|${Number(d.kar_pre_pub)}|${Number(d.kar_total)}`).sort().join(';');
  const lRem = await lin(rem); const lVta = await lin(vta);
  ok('8 VTA idéntica a la REM', lRem === lVta, lVta);
  const ow = (await WC.get(`orders/${o.id}`)).data;
  ok('9 pedido Woo con las mismas líneas y total', ow.total === o.total && ow.line_items.length === o.line_items.length, `${ow.status} ${ow.total}`);
} finally {
  await browser.close();
  if (vta) await api.post('/order/anular', { fac_nro: vta, fac_tip_cod: 'VTA', fac_obs: 'Limpieza prueba UI SPEC-015', usuario: 'EDER' });
  if (rem) await api.post(`/pedidos-web/${rem}/anular`, { motivo: 'Limpieza prueba UI SPEC-015' });
  console.log(`limpieza: ${vta || '-'} · ${rem || '-'} anulados`);
}
console.log(`\n${checks.filter(Boolean).length}/${checks.length} checks OK · pedido staging #${o.id}`);
process.exit(checks.every(Boolean) ? 0 : 1);
