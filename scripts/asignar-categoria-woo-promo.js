/**
 * Script one-shot: asigna una categoría WooCommerce a todos los artículos de una promoción.
 *
 * Uso:
 *   node scripts/asignar-categoria-woo-promo.js <pro_sec> <woo_category_id>
 *
 * Ejemplo:
 *   node scripts/asignar-categoria-woo-promo.js 9 769
 */

import dotenv from 'dotenv';
import { poolPromise, sql } from '../db.js';
import wcPkg from '@woocommerce/woocommerce-rest-api';

dotenv.config();

const WooCommerceRestApi = wcPkg.default || wcPkg;

const wooCommerce = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3',
  timeout: 10000,
});

const BATCH_SIZE = 10;
const DELAY_MS = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Argumentos ──────────────────────────────────────────────────────────────

const [, , pro_sec_arg, cat_id_arg] = process.argv;

if (!pro_sec_arg || !cat_id_arg) {
  console.error('Uso: node scripts/asignar-categoria-woo-promo.js <pro_sec> <woo_category_id>');
  process.exit(1);
}

const pro_sec = Number(pro_sec_arg);
const categoriaId = Number(cat_id_arg);

if (!Number.isInteger(pro_sec) || pro_sec <= 0) {
  console.error(`pro_sec inválido: "${pro_sec_arg}"`);
  process.exit(1);
}
if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
  console.error(`woo_category_id inválido: "${cat_id_arg}"`);
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function validarCategoria(catId) {
  console.log(`\n[1/3] Validando categoría ${catId} en WooCommerce...`);
  const res = await wooCommerce.get(`products/categories/${catId}`);
  const cat = res.data;
  console.log(`      ✓ Categoría encontrada: "${cat.name}" (slug: ${cat.slug}, productos: ${cat.count})`);
  return cat;
}

async function obtenerArticulosPromo(proSec) {
  console.log(`\n[2/3] Obteniendo artículos de la promoción ${proSec}...`);
  const pool = await poolPromise;
  const result = await pool.request()
    .input('pro_sec', sql.Decimal(18, 0), proSec)
    .query(`
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        a.art_woo_id,
        pd.pro_det_estado
      FROM dbo.promociones_detalle pd
      INNER JOIN dbo.articulos a ON pd.art_sec = a.art_sec
      WHERE pd.pro_sec = @pro_sec
        AND pd.pro_det_estado = 'A'
      ORDER BY a.art_cod
    `);

  const todos = result.recordset;

  if (todos.length === 0) {
    console.error(`      ✗ No se encontraron artículos activos para pro_sec=${proSec}`);
    console.error('        Verifica que el pro_sec sea correcto y la promo tenga artículos activos.');
    process.exit(1);
  }

  const conWooId = todos.filter((a) => a.art_woo_id && a.art_woo_id > 0);
  const sinWooId = todos.filter((a) => !a.art_woo_id || a.art_woo_id === 0);

  console.log(`      ✓ Total artículos activos: ${todos.length}`);
  console.log(`        → Con art_woo_id (procesables): ${conWooId.length}`);
  if (sinWooId.length > 0) {
    console.log(`        → Sin art_woo_id (se omitirán): ${sinWooId.length}`);
    sinWooId.forEach((a) => console.log(`          - ${a.art_cod} | ${a.art_nom}`));
  }

  return { conWooId, sinWooId };
}

async function asignarCategorias(articulos, catId) {
  console.log(`\n[3/3] Asignando categoría ${catId} en WooCommerce...`);

  const resultados = { exitosos: 0, ya_tenia: 0, errores: 0, detalle_errores: [] };

  for (let i = 0; i < articulos.length; i += BATCH_SIZE) {
    const batch = articulos.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (art) => {
      try {
        const wooRes = await wooCommerce.get(`products/${art.art_woo_id}`);
        const actuales = wooRes.data.categories || [];

        if (actuales.some((c) => c.id === catId)) {
          console.log(`      ↷ ${art.art_cod} | ${art.art_nom} — ya tenía la categoría`);
          resultados.ya_tenia++;
          resultados.exitosos++;
          return;
        }

        const nuevas = [...actuales, { id: catId }];
        await wooCommerce.put(`products/${art.art_woo_id}`, { categories: nuevas });
        console.log(`      ✓ ${art.art_cod} | ${art.art_nom}`);
        resultados.exitosos++;
      } catch (err) {
        console.error(`      ✗ ${art.art_cod} | ${art.art_nom} — ${err.message}`);
        resultados.errores++;
        resultados.detalle_errores.push({ art_cod: art.art_cod, art_nom: art.art_nom, error: err.message });
      }
    }));

    if (i + BATCH_SIZE < articulos.length) await sleep(DELAY_MS);
  }

  return resultados;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('='.repeat(60));
  console.log(`  Asignar categoría WooCommerce a artículos de promoción`);
  console.log(`  pro_sec: ${pro_sec}  |  woo_category_id: ${categoriaId}`);
  console.log('='.repeat(60));

  try {
    const categoria = await validarCategoria(categoriaId);
    const { conWooId, sinWooId } = await obtenerArticulosPromo(pro_sec);
    const resultados = await asignarCategorias(conWooId, categoriaId);

    console.log('\n' + '='.repeat(60));
    console.log('  RESUMEN');
    console.log('='.repeat(60));
    console.log(`  Categoría asignada : "${categoria.name}" (ID: ${categoriaId})`);
    console.log(`  Total procesados   : ${conWooId.length}`);
    console.log(`  Exitosos           : ${resultados.exitosos} (${resultados.ya_tenia} ya la tenían)`);
    console.log(`  Omitidos (sin Woo) : ${sinWooId.length}`);
    console.log(`  Errores            : ${resultados.errores}`);

    if (resultados.detalle_errores.length > 0) {
      console.log('\n  Artículos con error:');
      resultados.detalle_errores.forEach((e) =>
        console.log(`    - ${e.art_cod} | ${e.art_nom}: ${e.error}`)
      );
    }

    console.log('='.repeat(60));
    process.exit(resultados.errores > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n✗ Error fatal: ${err.message}`);
    process.exit(1);
  }
})();
