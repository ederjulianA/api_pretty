/*
  D-4 — Corrige la fecha de los documentos web que quedaron fuera del mes del pedido.

    VTA2275 (pedido 11424) y VTA2278 (pedido 11421): 2026-11-03 → 2026-10-30
    REM77   (pedido 11425):                          2026-11-01 → 2026-10-31
    REM76   (pedido 11424), solo con --con-rem76:    2026-10-31 → 2026-10-30

  Una transacción, con foto de existencias y de ventas antes y después. Aborta sin cambiar nada si un documento no
  está como se espera, si la fecha nueva no es el día del pedido, si uno de los meses tiene cierre activo o si se
  movió algo más que estos documentos. Solo escribe fac_fec y el rastro (fac_obs, fac_usu_cod_mod, fac_fch_mod).

    cd api_pretty
    # en seco (no cambia nada; muestra exactamente qué haría):
    DOTENV_CONFIG_PATH=.env.pruebas node --no-warnings implementaciones_2026/d4_fecha_vta_web/scripts/corregir-fechas-d4.mjs PSDATA_PRUEBAS
    # aplicando, o volviendo atrás:
    ... corregir-fechas-d4.mjs PSDATA_PRUEBAS --aplicar
    ... corregir-fechas-d4.mjs PSDATA_PRUEBAS --revertir --aplicar
    # producción: SOLO por operacion/prod/erp.sh, con respaldo previo y OK de Eder (exige CONFIRMO_PRODUCCION=si)
*/
import 'dotenv/config';
import sql from 'mssql';

const DESTINO = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const CON_REM76 = process.argv.includes('--con-rem76');

if (!DESTINO || DESTINO.startsWith('--')) {
  console.error('Uso: corregir-fechas-d4.mjs <NOMBRE_BD> [--aplicar] [--revertir] [--con-rem76]');
  process.exit(1);
}
if (DESTINO === 'PSDATAFEB2024' && process.env.CONFIRMO_PRODUCCION !== 'si') {
  console.error('Producción: exporta CONFIRMO_PRODUCCION=si, con respaldo previo y OK de Eder.');
  process.exit(1);
}

// `correcta` es el día del pedido en Colombia; `corrida` es la que dejó el error.
const DOCUMENTOS = [
  { fac_nro: 'VTA2275', tipo: 'VTA', woo: '11424', corrida: '2026-11-03', correcta: '2026-10-30', estados: ['A'] },
  { fac_nro: 'VTA2278', tipo: 'VTA', woo: '11421', corrida: '2026-11-03', correcta: '2026-10-30', estados: ['A'] },
  // REM77 sigue en espera, pero vence sola el 06-11 si nadie paga ni extiende: anulada también se corrige.
  { fac_nro: 'REM77', tipo: 'REM', woo: '11425', corrida: '2026-11-01', correcta: '2026-10-31', estados: ['A', 'I'] },
  ...(CON_REM76 ? [{ fac_nro: 'REM76', tipo: 'REM', woo: '11424', corrida: '2026-10-31', correcta: '2026-10-30', estados: ['A'] }] : [])
];

const cfg = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: String(process.env.DB_SERVER).trim(),
  database: DESTINO,
  port: parseInt(process.env.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: false, requestTimeout: 120000, connectionTimeout: 60000 },
  pool: { max: 2, min: 0 }
};

const existencias = async (r) =>
  (await r.query('SELECT art_sec, existencia FROM dbo.vwExistencias')).recordset
    .reduce((m, x) => { m[String(x.art_sec)] = Number(x.existencia); return m; }, {});

const ventasPorMes = async (r) =>
  (await r.query(`SELECT anio, mes, SUM(total_linea) AS total FROM dbo.vw_ventas_dashboard WHERE estado_interno = 'A' GROUP BY anio, mes`)).recordset
    .reduce((m, x) => { m[`${x.anio}-${String(x.mes).padStart(2, '0')}`] = Number(x.total); return m; }, {});

const lineasKardex = async (r) => (await r.query('SELECT COUNT(*) AS n FROM dbo.facturakardes')).recordset[0].n;

(async () => {
  const pool = await sql.connect(cfg);
  let fallo = null;
  try {
    const ctx = (await pool.request().query('SELECT DB_NAME() AS bd')).recordset[0].bd;
    if (ctx !== DESTINO) throw new Error(`Contexto de BD inesperado (${ctx} ≠ ${DESTINO}); abortando`);
    console.log(`BD: ${ctx}   modo: ${APLICAR ? 'APLICAR (commit)' : 'EN SECO (rollback al final)'}${REVERTIR ? '   REVERSA' : ''}\n`);

    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      const req = () => new sql.Request(tx);

      // 1. Cada documento, bloqueado y comparado con lo esperado
      const cambios = [];
      for (const d of DOCUMENTOS) {
        const [desde, hasta] = REVERTIR ? [d.correcta, d.corrida] : [d.corrida, d.correcta];
        const rs = await req().input('nro', sql.VarChar(15), d.fac_nro).query(`
          SELECT f.fac_sec, f.fac_tip_cod, f.fac_est_fac, f.fac_nro_woo,
                 CONVERT(CHAR(10), f.fac_fec, 23) AS fec,
                 CONVERT(CHAR(10), DATEADD(HOUR, -5, p.woo_created_gmt), 23) AS dia_pedido
          FROM dbo.factura f WITH (UPDLOCK, HOLDLOCK)
          LEFT JOIN dbo.woo_pedidos p ON p.woo_order_id = TRY_CAST(f.fac_nro_woo AS INT)
          WHERE f.fac_nro = @nro
        `);
        if (rs.recordset.length !== 1) throw new Error(`${d.fac_nro}: se esperaba un documento y hay ${rs.recordset.length}`);
        const f = rs.recordset[0];
        if (f.fac_tip_cod !== d.tipo || f.fac_nro_woo !== d.woo) throw new Error(`${d.fac_nro}: es ${f.fac_tip_cod} del pedido ${f.fac_nro_woo}, se esperaba ${d.tipo} del ${d.woo}`);
        if (!d.estados.includes(f.fac_est_fac)) throw new Error(`${d.fac_nro}: estado ${f.fac_est_fac}, se esperaba ${d.estados.join(' o ')}`);
        if (f.dia_pedido !== d.correcta) throw new Error(`${d.fac_nro}: el pedido ${d.woo} es del ${f.dia_pedido}, no del ${d.correcta}`);
        if (f.fec === hasta) { console.log(`=  ${d.fac_nro}: ya tiene ${hasta}`); continue; }
        if (f.fec !== desde) throw new Error(`${d.fac_nro}: tiene ${f.fec}, se esperaba ${desde}`);
        cambios.push({ ...d, fac_sec: f.fac_sec, desde, hasta });
      }
      if (cambios.length === 0) {
        await tx.rollback();
        console.log('\nNada que hacer.');
        return;
      }

      // 2. Ningún mes tocado puede estar cerrado: cambiaría lo que el cierre congeló
      const meses = [...new Set(cambios.flatMap((c) => [c.desde, c.hasta]).map((f) => f.slice(0, 7)))];
      for (const m of meses) {
        const [anio, mes] = m.split('-').map(Number);
        const rs = await req().input('a', sql.Int, anio).input('m', sql.Int, mes)
          .query(`SELECT cie_sec FROM dbo.cierre_mes WHERE cie_anio = @a AND cie_mes = @m AND cie_estado = 'A'`);
        if (rs.recordset.length) throw new Error(`${m} tiene el cierre activo ${rs.recordset[0].cie_sec}: hay que anularlo antes de mover fechas`);
      }

      const exAntes = await existencias(req());
      const veAntes = await ventasPorMes(req());
      const kaAntes = await lineasKardex(req());

      // 3. Cambio
      for (const c of cambios) {
        const nota = `D-4: fecha ${c.desde} a ${c.hasta}${REVERTIR ? ' (reversa)' : ''}`; // fac_obs es varchar: sin flechas
        const rs = await req()
          .input('sec', sql.Decimal(18, 0), c.fac_sec)
          .input('desde', sql.VarChar(10), c.desde)
          .input('hasta', sql.Date, c.hasta) // texto: un Date se correría de día (ver diaColombia)
          .input('nota', sql.VarChar(100), nota)
          .query(`
            UPDATE dbo.factura
            SET fac_fec = @hasta,
                fac_obs = LEFT(CONCAT(ISNULL(fac_obs, ''), ' | ', @nota), 1024),
                fac_usu_cod_mod = 'D-4',
                fac_fch_mod = GETDATE()
            WHERE fac_sec = @sec AND CONVERT(CHAR(10), fac_fec, 23) = @desde
          `);
        if (rs.rowsAffected[0] !== 1) throw new Error(`${c.fac_nro}: se actualizaron ${rs.rowsAffected[0]} filas`);
        console.log(`→  ${c.fac_nro}: ${c.desde} → ${c.hasta}`);
      }

      // 4. Verificaciones
      const exDespues = await existencias(req());
      const veDespues = await ventasPorMes(req());
      const kaDespues = await lineasKardex(req());
      const checks = [];
      const ok = (nombre, cond, detalle = '') => {
        checks.push(cond);
        console.log(`${cond ? '✔' : '✘'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
      };

      const arts = new Set([...Object.keys(exAntes), ...Object.keys(exDespues)]);
      const movidos = [...arts].filter((a) => (exAntes[a] ?? 0) !== (exDespues[a] ?? 0));
      ok('existencia idéntica en todos los artículos', movidos.length === 0, `${arts.size} artículos comparados`);
      ok('kardex sin cambios', kaAntes === kaDespues, `${kaDespues} líneas`);

      const suma = (v) => Object.values(v).reduce((s, x) => s + x, 0);
      ok('venta total idéntica', Math.abs(suma(veAntes) - suma(veDespues)) < 0.01, suma(veDespues).toFixed(2));
      const dif = [...new Set([...Object.keys(veAntes), ...Object.keys(veDespues)])]
        .map((m) => [m, (veDespues[m] ?? 0) - (veAntes[m] ?? 0)])
        .filter(([, d]) => Math.abs(d) >= 0.01);
      ok('solo cambian los meses tocados', dif.every(([m]) => meses.includes(m)), dif.map(([m, d]) => `${m}: ${d > 0 ? '+' : ''}${d.toFixed(2)}`).join(' · ') || 'sin diferencia en ventas');

      if (checks.includes(false)) throw new Error('falló una verificación');

      if (APLICAR) {
        await tx.commit();
        console.log('\n✔ COMMIT. Fechas corregidas.');
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
