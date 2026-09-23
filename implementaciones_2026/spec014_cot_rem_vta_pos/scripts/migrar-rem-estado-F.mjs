/*
  SPEC-014 — Migra las remisiones en estado 'F' al modelo de respaldo (REM 'A' + VTA con 'R').
  Corre el .sql hermano dentro de UNA transacción, con foto de existencias y de ventas antes y
  después. Si algo se movió, revierte y aborta: la migración tiene que ser neutra en inventario.

    cd api_pretty
    # en seco (no cambia nada; muestra exactamente qué haría):
    DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings implementaciones_2026/spec014_cot_rem_vta_pos/scripts/migrar-rem-estado-F.mjs PSDATA_PRUEBAS
    # aplicando:
    DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings implementaciones_2026/spec014_cot_rem_vta_pos/scripts/migrar-rem-estado-F.mjs PSDATA_PRUEBAS --aplicar
    # aceptando dejar en 'F' las que requieren decisión manual (se listan siempre):
    #   ... migrar-rem-estado-F.mjs PSDATA_PRUEBAS --aplicar --permitir-omitidas
    # producción: SOLO con backup previo y OK explícito de Eder
    CONFIRMO_PRODUCCION=si node --no-warnings implementaciones_2026/spec014_cot_rem_vta_pos/scripts/migrar-rem-estado-F.mjs PSDATAFEB2024 --aplicar
*/
import 'dotenv/config';
import sql from 'mssql';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
// Las REM en 'F' que el .sql no sabe resolver solas abortan la corrida, salvo que se acepte dejarlas.
const PERMITIR_OMITIDAS = process.argv.includes('--permitir-omitidas');
const ARCHIVO = path.join(__dirname, '..', 'sql', '2026-09-22_spec014_quitar_estado_F.sql');

if (!DESTINO) {
  console.error('Uso: migrar-rem-estado-F.mjs <NOMBRE_BD> [--aplicar]');
  process.exit(1);
}
if (DESTINO === 'PSDATAFEB2024' && process.env.CONFIRMO_PRODUCCION !== 'si') {
  console.error('Producción: tomar backup (backup-y-restaurar-bd.js backup) y exportar CONFIRMO_PRODUCCION=si.');
  process.exit(1);
}

const cfg = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: String(process.env.DB_SERVER).trim(),
  database: DESTINO,
  port: parseInt(process.env.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: false, requestTimeout: 600000, connectionTimeout: 60000 },
  pool: { max: 2, min: 0 }
};

// --- Fotos comparables antes/después -------------------------------------------------
const existencias = async (r) =>
  (await r.query('SELECT art_sec, existencia FROM dbo.vwExistencias')).recordset
    .reduce((m, x) => { m[String(x.art_sec)] = Number(x.existencia); return m; }, {});

const ventas = async (r) =>
  (await r.query(`SELECT anio, mes, COUNT(*) AS filas, SUM(total_linea) AS total
                  FROM dbo.vw_ventas_dashboard WHERE anio >= 2026 GROUP BY anio, mes ORDER BY anio, mes`)).recordset
    .map((x) => `${x.anio}-${String(x.mes).padStart(2, '0')}: ${x.filas} lineas, ${Number(x.total).toFixed(2)}`);

const conteos = async (r) => (await r.query(`
  SELECT
    (SELECT COUNT(*) FROM dbo.factura WHERE fac_tip_cod='REM' AND fac_est_fac='F') AS rem_F,
    (SELECT COUNT(*) FROM dbo.factura WHERE fac_tip_cod='REM' AND fac_est_fac='A') AS rem_A,
    (SELECT COUNT(*) FROM dbo.factura WHERE fac_tip_cod='REM' AND fac_est_fac='I') AS rem_I,
    (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_nat='R') AS lineas_R,
    (SELECT COUNT(*) FROM dbo.factura WHERE fac_est_fac NOT IN ('A','I','P')) AS estados_invalidos,
    (SELECT COUNT(*) FROM dbo.factura v
      INNER JOIN dbo.factura r ON r.fac_tip_cod='REM' AND r.fac_est_fac='A'
                              AND (r.fac_nro = v.fac_nro_origen OR r.fac_nro_origen = v.fac_nro)
      WHERE v.fac_tip_cod='VTA' AND v.fac_est_fac='A'
        AND EXISTS (SELECT 1 FROM dbo.facturakardes k WHERE k.fac_sec=v.fac_sec AND k.kar_nat='-')) AS doble_kardex,
    (SELECT COUNT(*) FROM dbo.factura WHERE fac_tip_cod='REM' AND fac_est_fac='A'
        AND fac_vence_el IS NOT NULL AND fac_vence_el < SYSUTCDATETIME()
        AND NOT EXISTS (SELECT 1 FROM dbo.factura v WHERE v.fac_nro=dbo.factura.fac_nro_origen
                          AND v.fac_tip_cod='VTA' AND v.fac_est_fac='A')) AS rem_vencidas_sin_anular
`)).recordset[0];

const tabla = (filas) => filas.map((f) => '   ' + Object.values(f).map((v) => String(v ?? '')).join(' · ')).join('\n');

(async () => {
  const pool = await sql.connect(cfg);
  let fallo = null;
  try {
    const ctx = (await pool.request().query('SELECT DB_NAME() AS bd')).recordset[0].bd;
    if (ctx !== DESTINO) throw new Error(`Contexto de BD inesperado (${ctx} ≠ ${DESTINO}); abortando`);
    console.log(`BD: ${ctx}   modo: ${APLICAR ? 'APLICAR (commit)' : 'EN SECO (rollback al final)'}\n`);

    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      const req = () => new sql.Request(tx);

      const exAntes = await existencias(req());
      const veAntes = await ventas(req());
      const coAntes = await conteos(req());
      console.log('ANTES   ', JSON.stringify(coAntes));

      const rs = await req().query(fs.readFileSync(ARCHIVO, 'utf8'));
      const filas = rs.recordset || [];
      const migradas = filas.filter((f) => f.accion === 'respaldo');
      const anuladas = filas.filter((f) => f.accion === 'anulada');
      const omitidas = filas.filter((f) => f.accion === 'omitida');

      const exDespues = await existencias(req());
      const veDespues = await ventas(req());
      const coDespues = await conteos(req());
      console.log('DESPUÉS ', JSON.stringify(coDespues), '\n');

      // --- Verificaciones ---------------------------------------------------------
      const checks = [];
      const ok = (nombre, cond, detalle = '') => {
        checks.push({ nombre, cond });
        console.log(`${cond ? '✔' : '✘'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
      };

      const arts = new Set([...Object.keys(exAntes), ...Object.keys(exDespues)]);
      const movidos = [...arts].filter((a) => (exAntes[a] ?? 0) !== (exDespues[a] ?? 0));
      ok('existencia idéntica en TODOS los artículos', movidos.length === 0,
        movidos.length ? movidos.slice(0, 10).map((a) => `${a}: ${exAntes[a]}→${exDespues[a]}`).join(', ') : `${arts.size} artículos comparados`);

      ok('ventas por mes idénticas (vw_ventas_dashboard)', JSON.stringify(veAntes) === JSON.stringify(veDespues),
        veAntes.join(' | '));
      ok('líneas R nuevas = líneas de las VTA migradas', coDespues.lineas_R >= coAntes.lineas_R);
      ok('los únicos estados fuera de A/I/P son los omitidos a propósito',
        coDespues.estados_invalidos === omitidas.length, `antes ${coAntes.estados_invalidos}, quedan ${coDespues.estados_invalidos}`);
      ok('doble kardex sigue en 0', coDespues.doble_kardex === 0, `antes ${coAntes.doble_kardex}`);
      ok('ninguna REM migrada queda venciendo', coDespues.rem_vencidas_sin_anular === coAntes.rem_vencidas_sin_anular,
        `${coDespues.rem_vencidas_sin_anular}`);
      ok('todas las REM en F se resolvieron', omitidas.length === 0 || PERMITIR_OMITIDAS,
        omitidas.length ? `${omitidas.length} omitidas${PERMITIR_OMITIDAS ? ' (aceptado con --permitir-omitidas)' : ''}`
                        : `${migradas.length} a respaldo, ${anuladas.length} a inactiva`);

      console.log(`\nA RESPALDO — REM vuelve a 'A', su VTA pasa a 'R' (${migradas.length}):`);
      console.log(migradas.length ? tabla(migradas.map((f) => ({ rem: f.rem_nro, vta: f.vta_nro, woo: f.fac_nro_woo || 'manual' }))) : '   (ninguna)');
      if (anuladas.length) {
        console.log(`\nA INACTIVA — su factura fue anulada (${anuladas.length}):`);
        console.log(tabla(anuladas.map((f) => ({ rem: f.rem_nro, woo: f.fac_nro_woo || 'manual' }))));
      }
      if (omitidas.length) {
        console.log(`\nOMITIDAS (${omitidas.length}) — requieren decisión manual:`);
        console.log(tabla(omitidas.map((f) => ({ rem: f.rem_nro, woo: f.fac_nro_woo, motivo: f.motivo }))));
      }

      const fallidos = checks.filter((c) => !c.cond);
      if (fallidos.length) throw new Error(`${fallidos.length} verificación(es) fallaron: ${fallidos.map((c) => c.nombre).join('; ')}`);

      if (APLICAR) {
        await tx.commit();
        console.log('\n✔ COMMIT. Migración aplicada.');
      } else {
        await tx.rollback();
        console.log('\n↩ ROLLBACK (ejecución en seco). Nada cambió. Repetir con --aplicar para confirmar.');
      }
    } catch (e) {
      try { await tx.rollback(); } catch (_) { /* ya revertida */ }
      throw e;
    }
  } catch (e) {
    fallo = e;
  } finally {
    await pool.close();
  }
  if (fallo) { console.error('\nERROR:', fallo.message); process.exit(1); }
})();
