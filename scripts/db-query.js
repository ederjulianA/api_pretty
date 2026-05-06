/**
 * Helper para db-explorer skill.
 * Uso: node scripts/db-query.js "SELECT TOP 5 * FROM dbo.articulos"
 * Solo acepta queries de lectura (SELECT, sp_help, INFORMATION_SCHEMA, sys.*).
 */
require('dotenv').config();
const { poolPromise } = require('../db.js');

const ALLOWED_PREFIXES = ['select', 'exec sp_help', 'exec sp_columns', 'with '];
const ALLOWED_PATTERNS = [/^select\b/i, /^exec sp_help/i, /^exec sp_columns/i, /^with\s/i];

async function run() {
  const query = process.argv[2];

  if (!query) {
    console.error('Error: Debes pasar una query como argumento.');
    console.error('Uso: node scripts/db-query.js "SELECT TOP 5 * FROM dbo.articulos"');
    process.exit(1);
  }

  const trimmed = query.trim();
  const isAllowed = ALLOWED_PATTERNS.some(p => p.test(trimmed));

  if (!isAllowed) {
    console.error('ERROR DE SEGURIDAD: Solo se permiten queries SELECT / sp_help / sp_columns.');
    console.error('El skill db-explorer es de solo lectura. No se ejecutó nada.');
    process.exit(1);
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(trimmed);

    const output = {
      rowCount: result.recordset ? result.recordset.length : 0,
      columns: result.recordset && result.recordset.length > 0
        ? Object.keys(result.recordset[0])
        : [],
      rows: result.recordset || [],
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error ejecutando query:', err.message);
    process.exit(1);
  }
}

run();
