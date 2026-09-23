/**
 * Guarda para los arneses: abortar si la conexión directa a BD no es la de pruebas.
 *
 * Por qué: los arneses hablan con el backend por HTTP (:3001, que sí carga .env.pruebas) pero
 * consultan y a veces ESCRIBEN la BD directo vía db.js, que hace `require('dotenv').config()` y
 * por lo tanto lee `.env` — PRODUCCIÓN — cuando falta el preload del entorno de pruebas.
 * Arrancarlos siempre así:
 *
 *   DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config <arnés>
 */
import { poolPromise } from '../../../db.js';

export const exigirPruebas = async (bdEsperada = 'PSDATA_PRUEBAS') => {
  const bd = (await (await poolPromise).request().query('SELECT DB_NAME() AS bd')).recordset[0].bd;
  if (bd !== bdEsperada) {
    console.error(`\n✘ ABORTADO: conectado a "${bd}", no a ${bdEsperada}.`);
    console.error('  Falta el preload del entorno de pruebas:');
    console.error('  DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config <arnés>\n');
    process.exit(1);
  }
  console.log(`BD verificada: ${bd}`);
};
