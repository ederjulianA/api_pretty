/**
 * SPEC-013 — Aplica un script SQL idempotente a UNA base de datos, nombrada explícitamente, y verifica.
 * Aborta si el contexto de conexión no es la BD pedida. Corre el script dos veces para comprobar idempotencia.
 *
 *   cd api_pretty
 *   node implementaciones_2026/spec013_inventario_woo/scripts/aplicar-migracion.js PSDATA_PRUEBAS
 *   node implementaciones_2026/spec013_inventario_woo/scripts/aplicar-migracion.js PSDATAFEB2024   # producción: SOLO con backup previo
 *
 * Segundo argumento opcional: ruta del .sql (default: la migración de Tarea 1).
 */
require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const DESTINO = process.argv[2];
if (!DESTINO) { console.error('Uso: aplicar-migracion.js <NOMBRE_BD> [ruta.sql]'); process.exit(1); }
const archivo = process.argv[3] || path.join(__dirname, '..', 'sql', '2026-09-14_spec013_tarea1_esquema.sql');
if (DESTINO === 'PSDATAFEB2024' && process.env.CONFIRMO_PRODUCCION !== 'si') {
  console.error('Producción: exportar CONFIRMO_PRODUCCION=si tras tomar backup (backup-y-restaurar-bd.js backup).'); process.exit(1);
}
const cfg = {
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER,
  database: DESTINO, port: parseInt(process.env.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: false, requestTimeout: 600000, connectionTimeout: 60000 }, pool: { max: 2, min: 0 }
};
(async () => {
  const pool = await sql.connect(cfg);
  try {
    const ctx = (await pool.request().query('SELECT DB_NAME() AS bd')).recordset[0].bd;
    console.log('Contexto de BD:', ctx);
    if (ctx !== DESTINO) throw new Error(`Contexto inesperado (${ctx}); abortando`);
    const script = fs.readFileSync(archivo, 'utf8');
    const req = pool.request();
    req.on('info', (m) => console.log('   info:', m.message));
    const rs = await req.query(script);
    console.log('\n[VERIFICACIÓN]');
    for (const r of rs.recordset) console.log('   ', String(r.objeto).padEnd(24), r.ok);
    const idx = await pool.request().query(`SELECT i.name, i.is_unique, i.filter_definition FROM sys.indexes i WHERE i.name='UX_factura_woo_vigente'`);
    console.log('   índice:', JSON.stringify(idx.recordset[0]));
    const cols = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='woo_sync_logs' AND COLUMN_NAME IN ('origen','usuario')`);
    console.log('   woo_sync_logs columnas nuevas:', cols.recordset.map((c) => c.COLUMN_NAME).join(', '));
    const tipos = await pool.request().query(`SELECT tip_cod, tip_nom, fue_cod, tip_con_sec FROM dbo.tipo_comprobantes ORDER BY tip_cod`);
    console.log('   tipos:', tipos.recordset.map((t) => `${t.tip_cod}(fue ${t.fue_cod}, consec ${t.tip_con_sec})`).join(' · '));
    // idempotencia: segunda ejecución no debe fallar
    await pool.request().query(script);
    console.log('   segunda ejecución (idempotencia): OK');
  } finally { await pool.close(); }
})().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });
