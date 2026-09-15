// Prueba de UI (Playwright) del POS con SPEC-014 contra front :5174 → backend :3001 → PSDATA_PRUEBAS + staging.
// Cómo correrla (usa el Playwright de negocio_prettymakeup/e2e y los paquetes de api_pretty):
//   cd negocio_prettymakeup/e2e && ln -sf ../../api_pretty/node_modules/{jsonwebtoken,axios,dotenv} node_modules/ \
//     && cp ../../api_pretty/implementaciones_2026/spec014_cot_rem_vta_pos/scripts/prueba-ui-pos.mjs ./_ui.mjs && node _ui.mjs; rm _ui.mjs
// Requiere: backend local :3001 (DOTENV_CONFIG_PATH=.env.pruebas) y front :5174 (API_TARGET=http://localhost:3001 npm run dev).
// Deja capturas ui-*.png en el scratchpad de la sesión. Si se interrumpe, anular a mano los documentos que creó.
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'node:fs';

import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('/Users/eder/Developer/GitHub/api_pretty/.env.pruebas'));
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: 'http://localhost:3001/api', headers: { 'x-access-token': token }, timeout: 120000, validateStatus: () => true });
const WC = axios.create({ baseURL: `${env.WC_URL}/wp-json/wc/v3`, auth: { username: env.WC_CONSUMER_KEY, password: env.WC_CONSUMER_SECRET }, timeout: 60000 });
const checks = []; const ok = (n, c, d = '') => { checks.push(!!c); console.log(`${c ? '✔' : '✘'} ${n}${d ? ` — ${d}` : ''}`); };
const NIT = '822'; const A = { art_sec: '1757', pid: 8053, precio: 13500 }; const B = { art_sec: '1835', precio: 8000 };
const shot = (page, n) => page.screenshot({ path: `/private/tmp/claude-501/-Users-eder-Developer-GitHub-negocio-prettymakeup/549e443b-4856-4d8b-8136-453602bfa5ab/scratchpad/ui-${n}.png`, fullPage: false });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(({ t }) => { localStorage.setItem('pedidos_pretty_token', t); localStorage.setItem('user_pretty', 'EDER'); localStorage.setItem('user_role', 'Admin'); localStorage.setItem('cambia_pass', 'false'); localStorage.setItem('user_permissions', JSON.stringify({ pos: { access: true, actions: ['view', 'create', 'edit'] }, orders: { access: true, actions: ['view'] } })); }, { t: token });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
const abrir = async (url) => { await page.goto(`http://localhost:5174${url}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };
const botones = async () => (await page.locator('aside button').allTextContents()).map((t) => t.trim()).filter(Boolean);
const swalTitulo = async () => { await page.waitForSelector('.swal2-title', { timeout: 30000 }); return (await page.locator('.swal2-title').textContent()).trim(); };
const swalHtml = async () => (await page.locator('.swal2-html-container').innerText()).trim();
const swalOk = async () => { await page.locator('.swal2-confirm').click(); await page.waitForTimeout(600); };

try {
  // 1. POS vacío
  await abrir('/pos');
  let b = await botones();
  ok('1 POS nuevo: Cotizar · Remisionar · Facturar', b.includes('Cotizar') && b.includes('Remisionar') && b.includes('Facturar'), b.join(' | '));
  await shot(page, '1-nuevo');

  // 2. COT creada por API → cargar → Remisionar
  const cot = (await api.post('/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'COT', lis_pre_cod: 2, detalles: [{ art_sec: A.art_sec, kar_uni: 2, kar_pre_pub: A.precio, kar_lis_pre_cod: 2 }, { art_sec: B.art_sec, kar_uni: 1, kar_pre_pub: B.precio, kar_lis_pre_cod: 2 }] })).data;
  await abrir(`/pos?fac_nro=${cot.fac_nro}`);
  b = await botones();
  ok('2a COT cargada: Guardar cotización · Remisionar · Facturar', b.includes('Guardar cotización') && b.includes('Remisionar') && b.includes('Facturar'), b.join(' | '));
  ok('2b badge "Editando Cotización"', (await page.locator('aside').innerText()).includes(`Editando Cotización ${cot.fac_nro}`));
  await page.getByRole('button', { name: 'Remisionar' }).click();
  ok('2c Swal "Remisión creada"', (await swalTitulo()) === 'Remisión creada');
  const remNro = (await swalHtml()).match(/REM\d+/)?.[0];
  ok('2d número REM en el modal', !!remNro, remNro);
  await shot(page, '2-remisionada');
  await swalOk();

  // 3. REM cargada: badge, botones, +1 y Guardar remisión
  await abrir(`/pos?fac_nro=${remNro}`);
  b = await botones();
  ok('3a REM cargada: Guardar remisión · Facturar (sin Cotizar)', b.includes('Guardar remisión') && b.includes('Facturar') && !b.includes('Cotizar') && !b.includes('Guardar cotización'), b.join(' | '));
  const badge = await page.locator('aside p.rounded-full').first().innerText();
  ok('3b badge con vencimiento y origen', /Editando Remisión REM\d+ · vence .+ · desde COT\d+/.test(badge), badge);
  await shot(page, '3-rem');
  // +1 al primer artículo (botón con FaPlus dentro del resumen)
  const plus = page.locator('aside button:has(svg)').filter({ has: page.locator('svg') });
  const items = page.locator('aside li, aside [class*="divide-y"] > div');
  await page.locator('aside').getByRole('button').filter({ hasText: '' }).nth(0); // noop para asegurar carga
  const plusBtn = page.locator('aside button').filter({ has: page.locator('svg.w-3.h-3') }).nth(1); // [minus, plus] del primer item
  await plusBtn.click();
  await page.getByRole('button', { name: 'Guardar remisión' }).click();
  ok('3c Swal "Remisión guardada"', (await swalTitulo()) === 'Remisión guardada');
  await swalOk();
  const lineas = (await api.get(`/order/${remNro}`)).data.order.details;
  ok('3d la REM quedó con la cantidad nueva (3 del primero)', lineas.some((l) => String(l.art_sec) === A.art_sec && Number(l.kar_uni) === 3), lineas.map((l) => `${l.art_cod}×${l.kar_uni}`).join(', '));

  // 4. COT bloqueada
  await abrir(`/pos?fac_nro=${cot.fac_nro}`);
  const asideTxt = await page.locator('aside').innerText();
  ok('4a COT cruzada: solo lectura con el aviso', asideTxt.includes('Solo lectura') && asideTxt.includes(`Cruzada con ${remNro}`), asideTxt.split('\n').find((l) => l.includes('Cruzada')));
  b = await botones();
  ok('4b sin botones de documento', !b.some((t) => /Facturar|Remisionar|Guardar/.test(t)), b.join(' | '));
  await shot(page, '4-cot-bloqueada');

  // 5. Facturar desde la REM
  await abrir(`/pos?fac_nro=${remNro}`);
  await page.getByRole('button', { name: 'Facturar' }).click();
  ok('5a Swal "Factura creada exitosamente"', (await swalTitulo()) === 'Factura creada exitosamente');
  const vtaNro = (await swalHtml()).match(/VTA\d+/)?.[0];
  ok('5b número VTA en el modal', !!vtaNro, vtaNro);
  await shot(page, '5-facturada');
  await swalOk();
  const vta = (await api.get(`/order/${vtaNro}`)).data.order;
  ok('5c VTA con líneas R y origen REM', vta.details.every((d) => d.kar_nat === 'R') && vta.header.origen === remNro);

  // 6. REM bloqueada por la VTA; VTA respaldada solo lectura
  await abrir(`/pos?fac_nro=${remNro}`);
  ok('6a REM cruzada con la VTA: solo lectura', (await page.locator('aside').innerText()).includes(`Cruzada con ${vtaNro}`));
  await abrir(`/pos?fac_nro=${vtaNro}`);
  const vtaTxt = await page.locator('aside').innerText();
  ok('6b VTA respaldada: aviso "anula la factura, edita la remisión"', vtaTxt.includes('no se edita por líneas'), vtaTxt.split('\n').find((l) => l.includes('remisión')));
  await shot(page, '6-vta-respaldada');

  // 7. Órdenes → REMISIONES
  await abrir('/orders');
  await page.locator('select').filter({ hasText: 'COTIZACIONES' }).first().selectOption('6');
  await page.waitForTimeout(2500);
  const tabla = await page.locator('table').innerText().catch(() => '');
  ok('7a Órdenes lista la REM con "Cruzada con VTA"', tabla.includes(remNro) && tabla.includes(vtaNro), tabla.includes(remNro) ? 'ok' : tabla.slice(0, 200));
  await shot(page, '7-ordenes-rem');

  // 8. REM de pedido web: editar desde el POS
  const { data: o } = await WC.post('orders', { status: 'on-hold', payment_method: 'bacs', payment_method_title: 'Transferencia', set_paid: false, billing: { first_name: 'Prueba', last_name: 'UI S14', email: 'prueba.ui.s14@example.com', phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' }, line_items: [{ product_id: A.pid, quantity: 1 }], customer_note: 'SPEC-014 prueba UI — no despachar' });
  await api.post('/pedidos-web/importar-ahora', {});
  const fila = (await api.get(`/pedidos-web?pedido=${o.id}`)).data.pedidos?.[0];
  const remWeb = fila?.fac_nro_rem;
  ok('8a REM web creada', !!remWeb, remWeb);
  await abrir(`/pos?fac_nro=${remWeb}`);
  const badgeWeb = await page.locator('aside p.rounded-full').first().innerText();
  ok('8b badge con "pedido web #"', badgeWeb.includes(`pedido web #${o.id}`), badgeWeb);
  await page.locator('aside button').filter({ has: page.locator('svg.w-3.h-3') }).nth(1).click(); // +1
  await page.getByRole('button', { name: 'Guardar remisión' }).click();
  ok('8c Swal "Remisión guardada" con cambios y Woo actualizado', (await swalTitulo()) === 'Remisión guardada' && (await swalHtml()).includes('WooCommerce'), (await swalHtml()).slice(0, 160));
  await shot(page, '8-rem-web-guardada');
  await swalOk();
  // El POS conserva el precio con el que se creó la REM (kar_pre_pub = precio del pedido Woo), así que
  // la línea en Woo queda ×2 al mismo precio unitario que ya tenía; solo cambia si el POS cambia el precio.
  const ow = (await WC.get(`orders/${o.id}`)).data;
  const precioLinea = Number((await api.get(`/order/${remWeb}`)).data.order.details[0].kar_pre_pub);
  ok('8d Woo: la línea quedó ×2 al precio de la remisión', ow.line_items[0]?.quantity === 2 && Number(ow.line_items[0]?.subtotal) === 2 * precioLinea, ow.line_items.map((l) => `${l.product_id}×${l.quantity}@${l.subtotal}`).join(', ') + ` (precio REM ${precioLinea})`);

  // Limpieza
  await WC.put(`orders/${o.id}`, { status: 'cancelled' });
  await api.post('/order/anular', { fac_nro: remWeb, fac_tip_cod: 'REM', fac_obs: 'limpieza UI' });
  await api.post('/order/anular', { fac_nro: vtaNro, fac_tip_cod: 'VTA', fac_obs: 'limpieza UI' });
  await api.post('/order/anular', { fac_nro: remNro, fac_tip_cod: 'REM', fac_obs: 'limpieza UI' });
  await api.post('/order/anular', { fac_nro: cot.fac_nro, fac_tip_cod: 'COT', fac_obs: 'limpieza UI' });
  const ex = (await api.get(`/order/${remNro}`)).data.order.details.find((d) => String(d.art_sec) === A.art_sec)?.existencia;
  ok('L existencia de 4523 de vuelta a 34', Number(ex) === 34, `${ex}`);
} catch (e) { console.error('ERROR', e.message); checks.push(false); }
await browser.close();
const fallos = checks.filter((c) => !c).length;
console.log(`\n${checks.length - fallos}/${checks.length} checks OK`);
process.exit(fallos ? 1 : 0);
