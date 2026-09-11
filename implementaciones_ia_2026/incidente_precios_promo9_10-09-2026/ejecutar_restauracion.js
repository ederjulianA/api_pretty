/**
 * Ejecuta RESTAURAR_PRECIOS_PROMO9.sql como un solo batch contra la BD del .env.
 * Imprime los recordsets de verificación (PASO 3 antes / PASO 5 después) y las
 * filas afectadas por cada sentencia. Si la guardia del SQL dispara RAISERROR,
 * el driver lanza y no se aplica ningún UPDATE.
 *
 * Uso: node implementaciones_ia_2026/incidente_precios_promo9_10-09-2026/ejecutar_restauracion.js
 */
const fs = require('fs');
const path = require('path');
const { poolPromise } = require('../../db.js');

(async () => {
  const sqlText = fs.readFileSync(path.join(__dirname, 'RESTAURAR_PRECIOS_PROMO9.sql'), 'utf8');
  const pool = await poolPromise;
  try {
    const result = await pool.request().query(sqlText);
    console.log('rowsAffected por sentencia:', JSON.stringify(result.rowsAffected));
    result.recordsets.forEach((rs, i) => {
      console.log(`\n--- recordset ${i + 1} (${rs.length} filas) ---`);
      console.table(rs);
    });
  } catch (err) {
    console.error('ERROR — no se aplicó la restauración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.close();
  }
})();
