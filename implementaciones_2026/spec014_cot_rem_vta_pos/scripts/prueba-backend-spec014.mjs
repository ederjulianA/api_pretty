/**
 * Arnés de pruebas del backend SPEC-014 (tareas 1–5, 7 y 8) contra PSDATA_PRUEBAS + staging.
 * Casos §7: 1 (COT → REMISIONAR), 2 (REM → FACTURAR por respaldo), 4 (anular REM con VTA), 3 (anular VTA),
 * 5 (COT → FACTURAR directo), edición de REM manual (push REM_EDITADA), guardas (tipo, origen REM),
 * 11 (REM manual vencida), 12 (REM 'F' legada). Solo escribe documentos de prueba en PSDATA_PRUEBAS.
 *
 *   cd api_pretty && DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config \
 *     implementaciones_2026/spec014_cot_rem_vta_pos/scripts/prueba-backend-spec014.mjs
 * Requiere el backend local en :3001 con el mismo .env.pruebas.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { poolPromise, sql } from '../../../db.js';
import { exigirPruebas } from './_solo-pruebas.mjs';

const BASE = process.env.API_BASE || 'http://localhost:3001/api';
const secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'Admin' }, secretKey, { algorithm: 'HS256', expiresIn: '1h' });
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'x-access-token': token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { status: r.status, ...j };
};
const q = async (sqlText) => (await (await poolPromise).request().query(sqlText)).recordset;
const checks = []; const ok = (nombre, cond, detalle = '') => { checks.push({ nombre, ok: !!cond }); console.log(`${cond ? '✔' : '✘'} ${nombre}${detalle ? ` — ${detalle}` : ''}`); };

const NIT = '822';                 // Prueba Pending T7 (example.com)
const A = { art_sec: '1757', cod: '4523', precio: 13500 }; // Rubor Vergüenza — existencia 34
const B = { art_sec: '1835', cod: '4599', precio: 8000 };  // Cherry Boom — existencia 11
const exist = async (art) => Number((await q(`SELECT ISNULL(existencia,0) AS e FROM dbo.vwExistencias WHERE art_sec = '${art}'`))[0]?.e ?? 0);
const cab = async (nro) => (await q(`SELECT fac_sec, fac_tip_cod, fac_est_fac, fac_nro_origen, fac_vence_el, fac_nro_woo FROM dbo.factura WHERE fac_nro = '${nro}'`))[0];
const lineas = async (nro) => q(`SELECT k.art_sec, k.kar_uni, k.kar_nat, k.kar_fac_sec_ori, k.kar_kar_sec_ori FROM dbo.facturakardes k INNER JOIN dbo.factura f ON f.fac_sec = k.fac_sec WHERE f.fac_nro = '${nro}' ORDER BY k.kar_sec`);
const ultimoPush = async (ref) => (await q(`SELECT TOP 1 origen, status, fac_nro, total_items, usuario FROM dbo.woo_sync_logs WHERE fac_nro = '${ref}' ORDER BY id DESC`))[0];
const det = (items) => items.map((i) => ({ art_sec: i.art_sec, kar_uni: i.kar_uni, kar_pre_pub: i.precio, kar_lis_pre_cod: 2, kar_kar_sec_ori: i.kar_kar_sec_ori ?? null, kar_fac_sec_ori: i.kar_fac_sec_ori ?? null }));

(async () => {
  await exigirPruebas();
  console.log('REM_FACTURA_SIN_KARDEX =', process.env.REM_FACTURA_SIN_KARDEX);
  const eA0 = await exist(A.art_sec), eB0 = await exist(B.art_sec);
  console.log(`existencias iniciales: ${A.cod}=${eA0} ${B.cod}=${eB0}`);

  // ---------- Caso 1: cero → COT → REMISIONAR ----------
  const cot = await api('POST', '/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'COT', descuento: 0, lis_pre_cod: 2, detalles: det([{ ...A, kar_uni: 3 }, { ...B, kar_uni: 2 }]) });
  ok('1a COT creada', cot.status === 201 && cot.fac_nro, cot.fac_nro || cot.error);
  const cotNro = cot.fac_nro;
  const cotDoc = await api('GET', `/order/${cotNro}`);
  ok('1b GET COT sin bloqueo', cotDoc.order?.header?.bloqueado === false && (await lineas(cotNro)).every((l) => l.kar_nat === 'C'));
  const linkA = cotDoc.order.details.find((d) => String(d.art_sec) === A.art_sec), linkB = cotDoc.order.details.find((d) => String(d.art_sec) === B.art_sec);
  const rem = await api('POST', '/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'REM', descuento: 0, lis_pre_cod: 2,
    detalles: det([{ ...A, kar_uni: 3, kar_kar_sec_ori: linkA.kar_sec, kar_fac_sec_ori: linkA.fac_sec }, { ...B, kar_uni: 2, kar_kar_sec_ori: linkB.kar_sec, kar_fac_sec_ori: linkB.fac_sec }]) });
  ok('1c REM creada desde COT', rem.status === 201 && /^REM/.test(rem.fac_nro || ''), rem.fac_nro || rem.error);
  const remNro = rem.fac_nro;
  const remCab = await cab(remNro), cotCab = await cab(cotNro), remLin = await lineas(remNro);
  ok('1d REM líneas "-" con vínculo a la COT', remLin.length === 2 && remLin.every((l) => l.kar_nat === '-' && Number(l.kar_fac_sec_ori) === Number(cotCab.fac_sec)));
  ok('1e vínculo en ambas cabeceras', cotCab.fac_nro_origen === remNro && remCab.fac_nro_origen === cotNro, `COT→${cotCab.fac_nro_origen} REM→${remCab.fac_nro_origen}`);
  const dias = remCab.fac_vence_el ? (new Date(remCab.fac_vence_el).getTime() - Date.now()) / 86400000 : null;
  ok('1f fac_vence_el ≈ +5 días', dias !== null && dias > 4.9 && dias < 5.1, `${dias?.toFixed(2)} días`);
  ok('1g existencia bajó', (await exist(A.art_sec)) === eA0 - 3 && (await exist(B.art_sec)) === eB0 - 2);
  const p1 = await ultimoPush(remNro);
  ok('1h push REM_CREADA', p1?.origen === 'REM_CREADA' && p1?.status === 'SUCCESS', JSON.stringify(p1));
  const cotBloq = await api('GET', `/order/${cotNro}`);
  ok('1i COT bloqueada por la REM', cotBloq.order?.header?.bloqueado === true && cotBloq.order.header.bloqueado_por === remNro);
  const putCot = await api('PUT', `/order/${cotNro}`, { fac_tip_cod: 'COT', nit_sec: NIT, fac_est_fac: 'A', detalles: det([{ ...A, kar_uni: 1 }]) });
  ok('1j PUT COT bloqueada → 409', putCot.status === 409, putCot.error);
  const remDoc = await api('GET', `/order/${remNro}`);
  const dispA = remDoc.order?.details?.find((d) => String(d.art_sec) === A.art_sec)?.existencia_disponible;
  ok('1k existencia_disponible = existencia + propia', Number(dispA) === eA0, `${dispA}`);

  // ---------- Guardas ----------
  const putTipo = await api('PUT', `/order/${remNro}`, { fac_tip_cod: 'COT', nit_sec: NIT, fac_est_fac: 'A', detalles: det([{ ...A, kar_uni: 3 }]) });
  ok('G1 PUT REM como COT → 400', putTipo.status === 400, putTipo.error);
  const vtaDesdeRem = await api('POST', '/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'VTA', lis_pre_cod: 2, detalles: det([{ ...A, kar_uni: 3, kar_kar_sec_ori: 1, kar_fac_sec_ori: remCab.fac_sec }]) });
  ok('G2 POST /order VTA con origen REM → 400', vtaDesdeRem.status === 400, vtaDesdeRem.error);

  // ---------- Edición de REM manual ----------
  const putRem = await api('PUT', `/order/${remNro}`, { fac_tip_cod: 'REM', nit_sec: NIT, fac_est_fac: 'A', descuento: 0, detalles: det([{ ...A, kar_uni: 4, kar_kar_sec_ori: linkA.kar_sec, kar_fac_sec_ori: linkA.fac_sec }]) });
  ok('E1 PUT REM (4523×4, sin 4599) → 200', putRem.status === 200, putRem.error);
  const remLin2 = await lineas(remNro);
  ok('E2 líneas reescritas con "-"', remLin2.length === 1 && remLin2[0].kar_nat === '-' && Number(remLin2[0].kar_uni) === 4);
  ok('E3 existencias: A −4, B restaurada', (await exist(A.art_sec)) === eA0 - 4 && (await exist(B.art_sec)) === eB0);
  const p2 = await ultimoPush(remNro);
  ok('E4 push REM_EDITADA con la unión (2 artículos)', p2?.origen === 'REM_EDITADA' && Number(p2?.total_items) === 2, JSON.stringify(p2));

  // ---------- Caso 2: REM → FACTURAR (respaldo) ----------
  const fac = await api('POST', `/pedidos-web/${remNro}/facturar`);
  ok('2a facturar REM → VTA', fac.status === 200 && fac.fac_nro_vta, fac.fac_nro_vta || fac.error);
  const vtaNro = fac.fac_nro_vta;
  const vtaLin = await lineas(vtaNro), vtaCab = await cab(vtaNro), remCab2 = await cab(remNro);
  ok('2b VTA líneas "R" con vínculo a la REM', vtaLin.length === 1 && vtaLin[0].kar_nat === 'R' && Number(vtaLin[0].kar_fac_sec_ori) === Number(remCab.fac_sec));
  ok('2c REM sigue A, cruzada con la VTA, sin vencimiento', remCab2.fac_est_fac === 'A' && remCab2.fac_nro_origen === vtaNro && remCab2.fac_vence_el === null);
  ok('2d VTA.fac_nro_origen = REM', vtaCab.fac_nro_origen === remNro);
  ok('2e existencia NO cambia al facturar', (await exist(A.art_sec)) === eA0 - 4);
  const p3 = await ultimoPush(remNro);
  ok('2f push REM_FACTURADA (por la REM)', p3?.origen === 'REM_FACTURADA', JSON.stringify(p3));
  const enVista = await q(`SELECT COUNT(*) AS n, SUM(cantidad_vendida) AS uni FROM dbo.vw_ventas_dashboard WHERE fac_nro = '${vtaNro}'`);
  ok('2g vw_ventas_dashboard cuenta la VTA R', Number(enVista[0].n) === 1 && Number(enVista[0].uni) === 4);
  const remBloq = await api('GET', `/order/${remNro}`);
  ok('2h REM bloqueada por la VTA', remBloq.order?.header?.bloqueado === true && remBloq.order.header.bloqueado_por === vtaNro);
  const putVta = await api('PUT', `/order/${vtaNro}`, { fac_tip_cod: 'VTA', nit_sec: NIT, fac_est_fac: 'A', detalles: det([{ ...A, kar_uni: 1 }]) });
  ok('2i PUT VTA respaldada → 409', putVta.status === 409, putVta.error);
  const fac2 = await api('POST', `/pedidos-web/${remNro}/facturar`);
  ok('2j facturar de nuevo = idempotente', fac2.status === 200 && fac2.ya_facturada === true && fac2.fac_nro_vta === vtaNro);

  // ---------- Caso 4: anular REM con VTA activa ----------
  const anRem = await api('POST', '/order/anular', { fac_nro: remNro, fac_tip_cod: 'REM', fac_obs: 'prueba' });
  ok('4a anular REM con VTA activa → 409', anRem.status === 409, anRem.error);

  // ---------- Caso 3: anular la VTA respaldada ----------
  const anVta = await api('POST', '/order/anular', { fac_nro: vtaNro, fac_tip_cod: 'VTA', fac_obs: 'prueba anulación VTA respaldada' });
  ok('3a anular VTA → 200 y libera la REM', anVta.status === 200 && anVta.rem_liberada === remNro, anVta.error || JSON.stringify({ rem: anVta.rem_liberada, push: anVta.push }));
  ok('3b sin push por la VTA (no movió kardex)', anVta.push === null);
  ok('3c existencia sin cambio', (await exist(A.art_sec)) === eA0 - 4);
  const remLibre = await api('GET', `/order/${remNro}`);
  ok('3d REM editable de nuevo (bloqueado=false)', remLibre.order?.header?.bloqueado === false && (await cab(remNro)).fac_est_fac === 'A');

  // ---------- Caso 5: COT → FACTURAR directo ----------
  const cot5 = await api('POST', '/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'COT', lis_pre_cod: 2, detalles: det([{ ...B, kar_uni: 1 }]) });
  const cot5Doc = await api('GET', `/order/${cot5.fac_nro}`); const l5 = cot5Doc.order.details[0];
  const vta5 = await api('POST', '/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'VTA', lis_pre_cod: 2, detalles: det([{ ...B, kar_uni: 1, kar_kar_sec_ori: l5.kar_sec, kar_fac_sec_ori: l5.fac_sec }]) });
  const c5 = await cab(cot5.fac_nro), v5 = await cab(vta5.fac_nro), lv5 = await lineas(vta5.fac_nro);
  ok('5a VTA directa desde COT: líneas "-"', vta5.status === 201 && lv5.every((l) => l.kar_nat === '-'), vta5.error);
  ok('5b vínculo COT↔VTA en ambas cabeceras', c5.fac_nro_origen === vta5.fac_nro && v5.fac_nro_origen === cot5.fac_nro, `COT→${c5.fac_nro_origen} VTA→${v5.fac_nro_origen}`);
  ok('5c existencia B bajó 1', (await exist(B.art_sec)) === eB0 - 1);
  const dobleFac = await api('POST', '/order', { nit_sec: NIT, fac_usu_cod_cre: 'EDER', fac_tip_cod: 'VTA', lis_pre_cod: 2, detalles: det([{ ...B, kar_uni: 1, kar_kar_sec_ori: l5.kar_sec, kar_fac_sec_ori: l5.fac_sec }]) });
  ok('5d facturar la misma COT dos veces → 409', dobleFac.status === 409, dobleFac.error);

  // ---------- Caso 11: REM manual vencida ----------
  await q(`UPDATE dbo.factura SET fac_vence_el = DATEADD(HOUR, -3, SYSUTCDATETIME()) WHERE fac_nro = '${remNro}'`);
  const venc = await api('POST', '/pedidos-web/vencer-ahora');
  const remV = await cab(remNro), pV = await ultimoPush(remNro);
  ok('11a vencer-ahora anuló la REM manual', venc.status === 200 && remV.fac_est_fac === 'I', JSON.stringify(venc.resumen || venc));
  ok('11b push REM_ANULADA y existencia restaurada', pV?.origen === 'REM_ANULADA' && (await exist(A.art_sec)) === eA0);
  const cotLibre = await api('GET', `/order/${cotNro}`);
  ok('11c la COT de origen queda libre', cotLibre.order?.header?.bloqueado === false);

  // ---------- Caso 12: REM 'F' legada sigue leyéndose como facturada ----------
  const legado = await q(`SELECT TOP 1 r.fac_nro AS rem, r.fac_nro_woo, v.fac_nro AS vta FROM dbo.factura r INNER JOIN dbo.factura v ON v.fac_nro = r.fac_nro_origen AND v.fac_tip_cod='VTA' AND v.fac_est_fac='A' WHERE r.fac_tip_cod='REM' AND r.fac_est_fac='F' ORDER BY r.fac_sec DESC`);
  if (legado.length) {
    const docs = await api('GET', `/pedidos-web/${legado[0].fac_nro_woo}/documentos`);
    const facLeg = await api('POST', `/pedidos-web/${legado[0].rem}/facturar`);
    ok('12a REM F legada: facturar = idempotente con su VTA', facLeg.status === 200 && facLeg.ya_facturada === true && facLeg.fac_nro_vta === legado[0].vta, JSON.stringify({ rem: legado[0].rem, docs: docs.documentos?.length }));
  } else ok('12a (sin REM F legadas en PRUEBAS)', true);

  // ---------- Limpieza: anular VTA5 y COT5 para dejar existencias como estaban ----------
  await api('POST', '/order/anular', { fac_nro: vta5.fac_nro, fac_tip_cod: 'VTA', fac_obs: 'limpieza prueba' });
  await api('POST', '/order/anular', { fac_nro: cot5.fac_nro, fac_tip_cod: 'COT', fac_obs: 'limpieza prueba' });
  await api('POST', '/order/anular', { fac_nro: cotNro, fac_tip_cod: 'COT', fac_obs: 'limpieza prueba' });
  ok('L existencias finales = iniciales', (await exist(A.art_sec)) === eA0 && (await exist(B.art_sec)) === eB0, `${A.cod}=${await exist(A.art_sec)} ${B.cod}=${await exist(B.art_sec)}`);

  const fallos = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - fallos}/${checks.length} checks OK · documentos: ${cotNro} ${remNro} ${vtaNro} ${cot5.fac_nro} ${vta5.fac_nro}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
