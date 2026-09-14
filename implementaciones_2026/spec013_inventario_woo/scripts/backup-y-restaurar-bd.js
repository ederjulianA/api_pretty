/**
 * SPEC-013 — Backup COPY_ONLY de una BD del ERP y (opcional) restore como otra BD en el mismo SQL Server.
 * Usado el 14/sep/2026 para crear PSDATA_PRUEBAS. Sirve también para el backup previo a migrar producción.
 * No modifica la BD origen (un BACKUP es solo lectura sobre ella).
 *
 *   cd api_pretty
 *   node implementaciones_2026/spec013_inventario_woo/scripts/backup-y-restaurar-bd.js pre     # solo verificaciones
 *   node implementaciones_2026/spec013_inventario_woo/scripts/backup-y-restaurar-bd.js backup  # backup + VERIFYONLY
 *   node implementaciones_2026/spec013_inventario_woo/scripts/backup-y-restaurar-bd.js restore # restore como DESTINO + SIMPLE + conteos
 *   node implementaciones_2026/spec013_inventario_woo/scripts/backup-y-restaurar-bd.js todo
 *
 * Variables (opcionales): BD_ORIGEN (default PSDATAFEB2024), BD_DESTINO (default PSDATA_PRUEBAS),
 * BAK_PATH (default C:\Ed\<origen>_<AAAAMMDD>.bak). Credenciales: el .env del repo (login sa).
 */
require('dotenv').config();
const sql = require('mssql');

const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const ORIGEN = process.env.BD_ORIGEN || 'PSDATAFEB2024';
const DESTINO = process.env.BD_DESTINO || 'PSDATA_PRUEBAS';
const BAK = process.env.BAK_PATH || `C:\\Ed\\${ORIGEN}_${hoy}.bak`;
const DATA_DIR = 'C:\\Program Files\\Microsoft SQL Server\\MSSQL15.MSSQLSERVER\\MSSQL\\DATA\\';
const paso = process.argv[2] || 'pre';
console.log(`origen=${ORIGEN} destino=${DESTINO} bak=${BAK} paso=${paso}`);

const cfg = {
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER,
  database: 'master', port: parseInt(process.env.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: false, requestTimeout: 1800000, connectionTimeout: 60000 },
  pool: { max: 2, min: 0 }
};

const run = async (pool, q, label) => {
  const req = pool.request();
  const infos = [];
  req.on('info', (m) => infos.push(m.message));
  const rs = await req.query(q);
  if (label) console.log(`\n[${label}]`);
  for (const m of infos) console.log('   ', m);
  return rs;
};

(async () => {
  const pool = await sql.connect(cfg);
  try {
    // ---------- preflight ----------
    if (paso === 'todo' || paso === 'pre') {
      const ex = await run(pool, `SELECT name FROM sys.databases WHERE name = '${DESTINO}'`);
      if (ex.recordset.length) throw new Error(`${DESTINO} ya existe; abortando`);
      const drv = await run(pool, `EXEC master.dbo.xp_fixeddrives`);
      const c = drv.recordset.find((r) => r.drive === 'C');
      console.log('Espacio libre C:', c ? c['MB libres'] || c['MB free'] || JSON.stringify(c) : JSON.stringify(drv.recordset));
      const libre = c ? Number(c['MB libres'] ?? c['MB free'] ?? Object.values(c)[1]) : 0;
      if (libre < 2000) throw new Error(`Menos de 2 GB libres en C: (${libre} MB); abortando`);
      const dir = await run(pool, `EXEC master.dbo.xp_fileexist 'C:\\Ed'`);
      const d = dir.recordset[0];
      console.log('C:\\Ed existe como directorio:', d['File is a Directory'] === 1 ? 'sí' : 'NO');
      if (d['File is a Directory'] !== 1) throw new Error('C:\\Ed no existe; abortando');
      const bak = await run(pool, `EXEC master.dbo.xp_fileexist '${BAK}'`);
      if (bak.recordset[0]['File Exists'] === 1) console.log('AVISO: el archivo .bak ya existe y será sobrescrito (INIT)');
      if (paso === 'pre') return;
    }

    // ---------- 1. backup COPY_ONLY (no altera la cadena de backups de producción) ----------
    if (paso === 'todo' || paso === 'backup') {
      const t0 = Date.now();
      await run(pool, `BACKUP DATABASE [${ORIGEN}] TO DISK = N'${BAK}'
        WITH COPY_ONLY, COMPRESSION, INIT, NAME = N'${ORIGEN} copia previa SPEC-013 (14/sep/2026)', STATS = 25`, 'BACKUP');
      console.log(`   backup terminado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      await run(pool, `RESTORE VERIFYONLY FROM DISK = N'${BAK}'`, 'VERIFYONLY');
      const bs = await run(pool, `SELECT TOP 1 CONVERT(varchar(19), backup_finish_date, 120) AS fin, is_copy_only, CAST(compressed_backup_size/1024/1024 AS DECIMAL(10,1)) AS mb_comprimido, CAST(backup_size/1024/1024 AS DECIMAL(10,1)) AS mb
        FROM msdb.dbo.backupset WHERE database_name = '${ORIGEN}' ORDER BY backup_finish_date DESC`);
      console.log('   msdb:', JSON.stringify(bs.recordset[0]));
      if (paso === 'backup') return;
    }

    // ---------- 2. restore como PSDATA_PRUEBAS ----------
    if (paso === 'todo' || paso === 'restore') {
      const fl = await run(pool, `RESTORE FILELISTONLY FROM DISK = N'${BAK}'`);
      const data = fl.recordset.find((f) => f.Type === 'D');
      const logf = fl.recordset.find((f) => f.Type === 'L');
      console.log('\n[FILELIST] datos:', data.LogicalName, '| log:', logf.LogicalName);
      const t1 = Date.now();
      await run(pool, `RESTORE DATABASE [${DESTINO}] FROM DISK = N'${BAK}'
        WITH MOVE N'${data.LogicalName}' TO N'${DATA_DIR}${DESTINO}.mdf',
             MOVE N'${logf.LogicalName}' TO N'${DATA_DIR}${DESTINO}_0.ldf',
             RECOVERY, STATS = 25`, 'RESTORE');
      console.log(`   restore terminado en ${((Date.now() - t1) / 1000).toFixed(1)} s`);
      await run(pool, `ALTER DATABASE [${DESTINO}] SET RECOVERY SIMPLE`, 'RECOVERY SIMPLE');
    }

    // ---------- 3. verificación ----------
    const st = await run(pool, `SELECT name, state_desc, recovery_model_desc FROM sys.databases WHERE name IN ('${ORIGEN}','${DESTINO}')`);
    console.log('\n[ESTADO]', st.recordset.map((r) => `${r.name}: ${r.state_desc} / ${r.recovery_model_desc}`).join(' | '));
    const cmp = await run(pool, `
      SELECT 'factura' AS t, (SELECT COUNT(*) FROM [${ORIGEN}].dbo.factura) AS prod, (SELECT COUNT(*) FROM [${DESTINO}].dbo.factura) AS pruebas
      UNION ALL SELECT 'facturakardes', (SELECT COUNT(*) FROM [${ORIGEN}].dbo.facturakardes), (SELECT COUNT(*) FROM [${DESTINO}].dbo.facturakardes)
      UNION ALL SELECT 'articulos', (SELECT COUNT(*) FROM [${ORIGEN}].dbo.articulos), (SELECT COUNT(*) FROM [${DESTINO}].dbo.articulos)
      UNION ALL SELECT 'nit', (SELECT COUNT(*) FROM [${ORIGEN}].dbo.nit), (SELECT COUNT(*) FROM [${DESTINO}].dbo.nit)
      UNION ALL SELECT 'woo_sync_logs', (SELECT COUNT(*) FROM [${ORIGEN}].dbo.woo_sync_logs), (SELECT COUNT(*) FROM [${DESTINO}].dbo.woo_sync_logs)`);
    console.log('[CONTEOS]');
    for (const r of cmp.recordset) console.log('   ', r.t.padEnd(16), String(r.prod).padStart(8), String(r.pruebas).padStart(8), r.prod === r.pruebas ? 'ok' : 'DIFERENTE');
    const ult = await run(pool, `SELECT (SELECT MAX(fac_fch_cre) FROM [${DESTINO}].dbo.factura) AS ultimo_doc_pruebas, (SELECT existencia FROM [${DESTINO}].dbo.vwExistencias WHERE art_sec='2218') AS termo_9292_pruebas`);
    console.log('   último documento en pruebas:', ult.recordset[0].ultimo_doc_pruebas, '| Termo 9292 existencia en pruebas:', ult.recordset[0].termo_9292_pruebas);
  } finally {
    await pool.close();
  }
})().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });
