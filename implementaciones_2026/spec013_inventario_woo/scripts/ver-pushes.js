/**
 * Muestra los últimos pushes de stock (woo_sync_logs) y, opcionalmente, el stock actual en Woo
 * de uno o más SKUs. Solo lectura. Usa el entorno que le pases por DOTENV_CONFIG_PATH.
 *
 *   cd api_pretty
 *   DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config implementaciones_2026/spec013_inventario_woo/scripts/ver-pushes.js 9292 4681
 */
const { poolPromise, sql } = require('../../../db');

const skus = process.argv.slice(2);

(async () => {
  const pool = await poolPromise;
  console.log(`Entorno: BD=${process.env.DB_DATABASE} · Woo=${process.env.WC_URL}\n`);

  const logs = await pool.request().query(`
    SELECT TOP 10 id, CONVERT(varchar(19), created_at, 120) AS creado, origen, usuario, fac_nro, status,
           success_count AS ok, error_count AS err, skipped_count AS omit, LEFT(product_updates, 140) AS updates
    FROM dbo.woo_sync_logs ORDER BY id DESC`);
  console.log('Últimos 10 pushes (woo_sync_logs):');
  for (const r of logs.recordset) {
    console.log(`  #${r.id} ${r.creado} ${String(r.origen || '-').padEnd(14)} ${String(r.usuario || '-').padEnd(8)} ${String(r.fac_nro || '-').padEnd(24)} ${r.status.padEnd(15)} ok=${r.ok} err=${r.err} omit=${r.omit}  ${r.updates || ''}`);
  }

  const pend = await pool.request().query(`SELECT art_sec, origen, intentos, LEFT(ultimo_error, 60) AS err FROM dbo.woo_sync_pendientes`);
  console.log(`\nPendientes de reintento: ${pend.recordset.length}`);
  for (const r of pend.recordset) console.log(`  ${r.art_sec} ${r.origen} intentos=${r.intentos} ${r.err}`);

  if (skus.length) {
    const req = pool.request();
    const params = skus.map((s, i) => { req.input(`s${i}`, sql.VarChar(50), s); return `@s${i}`; });
    const arts = await req.query(`
      SELECT a.art_cod, a.art_sec, a.art_nom, a.art_woo_id, ISNULL(e.existencia, 0) AS existencia_erp
      FROM dbo.articulos a LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
      WHERE a.art_cod IN (${params.join(',')})`);
    const auth = 'Basic ' + Buffer.from(`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`).toString('base64');
    console.log('\nERP vs Woo:');
    for (const a of arts.recordset) {
      let woo = '(sin art_woo_id)';
      if (a.art_woo_id) {
        try {
          const r = await fetch(`${process.env.WC_URL}/wp-json/wc/v3/products/${a.art_woo_id}?_fields=stock_quantity,stock_status`, { headers: { Authorization: auth } });
          const j = await r.json();
          woo = r.ok ? `${j.stock_quantity} (${j.stock_status})` : `HTTP ${r.status}`;
        } catch (e) { woo = `error: ${e.message}`; }
      }
      console.log(`  ${a.art_cod.padEnd(8)} ${String(a.art_nom || '').trim().slice(0, 34).padEnd(36)} ERP=${String(a.existencia_erp).padStart(4)}   Woo=${woo}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
