#!/usr/bin/env node
/**
 * Comprueba que ninguna ruta de la API responda sin token.
 *
 * Levanta la API en un puerto libre, recorre TODAS las rutas registradas en
 * Express (no una lista escrita a mano, para que una ruta nueva no se escape)
 * y las llama sin token. Toda ruta debe responder 401, salvo la lista blanca.
 *
 * Uso (desde la raiz de api_pretty, con la BD apuntando a una copia local):
 *   DB_SERVER=127.0.0.1 DB_PORT=14333 DB_USER=sa DB_PASSWORD=... \
 *     node revision_seguridad/plan/verificar-auth.mjs
 *
 * Seguridad de la prueba:
 * - Se niega a correr si DB_SERVER no es local: una ruta que siga abierta
 *   ejecutaria su controlador de verdad.
 * - WooCommerce, Cloudinary, OpenAI, Azure y Cloudflare apuntan a direcciones
 *   inalcanzables, y las tareas de Woo arrancan apagadas.
 */
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(RAIZ);
const require = createRequire(path.join(RAIZ, 'index.js'));

// Las rutas que pueden responder sin token. Tiene que coincidir con
// RUTAS_PUBLICAS de index.js.
const LISTA_BLANCA = new Set(['GET /', 'POST /api/auth/login']);

// --- Entorno neutralizado (dotenv no pisa lo que ya esta definido) ---------
const INALCANZABLE = 'http://127.0.0.1:9';
Object.assign(process.env, {
  WC_URL: INALCANZABLE, WC_CONSUMER_KEY: 'ck_verificador', WC_CONSUMER_SECRET: 'cs_verificador',
  CLOUDINARY_CLOUD_NAME: 'verificador', CLOUDINARY_API_KEY: 'verificador', CLOUDINARY_API_SECRET: 'verificador',
  OPENAI_API_KEY: 'sk-verificador',
  AZURE_STORAGE_CONNECTION_STRING: `DefaultEndpointsProtocol=http;AccountName=verificador;AccountKey=dmVyaWZpY2Fkb3I=;BlobEndpoint=${INALCANZABLE}/verificador;`,
  CLOUDFLARE_API_TOKEN: 'verificador', CLOUDFLARE_ZONE_ID: 'verificador',
  WOO_PUSH_ENABLED: 'false', WOO_IMPORT_ENABLED: 'false',
  WOO_RECONCILIACION_ENABLED: 'false', WOO_VENCIMIENTO_ENABLED: 'false',
});
require('dotenv').config();

const LOCALES = new Set(['127.0.0.1', 'localhost', 'pretty-mssql', 'host.docker.internal']);
const dbServer = (process.env.DB_SERVER || '').trim();
if (!LOCALES.has(dbServer)) {
  console.error(`ABORTADO: DB_SERVER='${dbServer}' no es local. Apunta la prueba a una copia de la base.`);
  process.exit(2);
}

// --- Capturar la app y levantarla en un puerto libre -----------------------
const express = require('express');
const arranque = new Promise((resolve) => {
  express.application.listen = function (...args) {
    const cb = args.find((a) => typeof a === 'function');
    const srv = http.createServer(this).listen(0, '127.0.0.1', () => {
      if (cb) cb();
      resolve({ app: this, srv });
    });
    return srv;
  };
});
await import(path.join(RAIZ, 'index.js'));
const { app, srv } = await arranque;
const base = `http://127.0.0.1:${srv.address().port}`;

// --- Inventario de rutas ---------------------------------------------------
const montaje = (layer) => {
  // Express 4: '/api/woo' queda como /^\/api\/woo\/?(?=\/|$)/i
  const src = layer.regexp.source;
  if (layer.regexp.fast_slash) return '';
  return src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
};
const rutas = [];
const raros = [];
for (const layer of app._router.stack) {
  if (layer.route) {
    for (const m of Object.keys(layer.route.methods)) rutas.push([m.toUpperCase(), layer.route.path]);
  } else if (layer.name === 'router') {
    const pre = montaje(layer);
    for (const sub of layer.handle.stack) {
      if (!sub.route) continue;
      if (typeof sub.route.path !== 'string') { raros.push(`${pre} ${sub.route.path}`); continue; }
      const p = sub.route.path === '/' ? (pre || '/') : pre + sub.route.path;
      for (const m of Object.keys(sub.route.methods)) if (m !== '_all') rutas.push([m.toUpperCase(), p]);
    }
  }
}
const unicas = [...new Map(rutas.map(([m, p]) => [`${m} ${p}`, [m, p]])).values()];

// Variantes que no son rutas declaradas pero tampoco deben abrir nada
const variantes = [['GET', '/api/no-existe'], ['GET', '/API/ORDER'], ['GET', '/api/order/'], ['POST', '/api/auth/login/x']];

// --- Llamadas sin token ----------------------------------------------------
const llamar = async (metodo, ruta, token) => {
  const url = base + ruta.replace(/:(\w+)/g, 'X1');
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-access-token'] = token;
  const r = await fetch(url, { method: metodo, headers, body: ['GET', 'HEAD'].includes(metodo) ? undefined : '{}' });
  return r.status;
};

const fallos = [];
let revisadas = 0;
for (const [m, p] of [...unicas, ...variantes]) {
  const clave = `${m} ${p}`;
  if (LISTA_BLANCA.has(clave)) continue;
  const st = await llamar(m, p);
  revisadas++;
  if (st !== 401) fallos.push(`${st}  ${clave}`);
}

// La lista blanca sigue respondiendo y un token valido pasa la barrera
const salud = await llamar('GET', '/');
const secret = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
const token = require('jsonwebtoken').sign({ usu_cod: 'verificador' }, secret, { expiresIn: '5m' });
const conToken = await llamar('GET', '/api/ciudades', token);

console.log(`\nRutas declaradas: ${unicas.length} · revisadas sin token: ${revisadas} · lista blanca: ${[...LISTA_BLANCA].join(', ')}`);
if (raros.length) console.log(`Rutas con path no textual (no revisadas): ${raros.join(' | ')}`);
console.log(`GET / (health check): ${salud}   GET /api/ciudades con token valido: ${conToken}`);
if (fallos.length) {
  console.log(`\nFALLA: ${fallos.length} rutas responden sin token:\n  ${fallos.join('\n  ')}`);
} else {
  console.log('\nOK: todas las rutas fuera de la lista blanca responden 401 sin token.');
}
const ok = !fallos.length && !raros.length && salud === 200 && conToken === 200;
srv.close();
process.exit(ok ? 0 : 1);
