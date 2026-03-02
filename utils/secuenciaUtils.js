/**
 * Utilidades para manejo de secuencias con auto-recuperación
 *
 * Resuelve el problema de PRIMARY KEY violation cuando sec_num en dbo.secuencia
 * queda desincronizado respecto al MAX(fac_sec) real en dbo.factura.
 *
 * Cuando detecta el error, corrige automáticamente la secuencia y reintenta.
 */

import { sql, poolPromise } from '../db.js';

/**
 * Corrige la secuencia 'FACTURA' sincronizándola con el MAX(fac_sec) real en dbo.factura.
 * Puede ejecutarse dentro o fuera de una transacción.
 *
 * @param {sql.Transaction|null} transaction - Transacción activa (null = usa pool directo)
 * @returns {Promise<{oldValue: number, newValue: number}>}
 */
const corregirSecuenciaFactura = async (transaction = null) => {
  const requestSource = transaction ? transaction : await poolPromise;
  const request = new sql.Request(requestSource);

  const result = await request.query(`
    DECLARE @max_fac_sec DECIMAL(18,0);
    DECLARE @old_sec_num DECIMAL(18,0);

    SELECT @old_sec_num = sec_num
    FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
    WHERE sec_cod = 'FACTURA';

    SELECT @max_fac_sec = ISNULL(MAX(CAST(fac_sec AS DECIMAL(18,0))), 0)
    FROM dbo.factura;

    IF @max_fac_sec > @old_sec_num
    BEGIN
      UPDATE dbo.secuencia
      SET sec_num = @max_fac_sec
      WHERE sec_cod = 'FACTURA';
    END

    SELECT @old_sec_num AS old_value,
           CASE WHEN @max_fac_sec > @old_sec_num THEN @max_fac_sec ELSE @old_sec_num END AS new_value;
  `);

  const row = result.recordset[0];
  console.log(`[SECUENCIA_AUTO_FIX] Secuencia FACTURA corregida: ${row.old_value} -> ${row.new_value}`);
  return { oldValue: row.old_value, newValue: row.new_value };
};

/**
 * Obtiene el siguiente fac_sec dentro de una transacción, con auto-recuperación.
 *
 * Uso:
 *   const { fac_sec, request } = await obtenerSiguienteFacSec(transaction);
 *   // request ya tiene @NewFacSec como input, listo para usar en queries posteriores
 *
 * @param {sql.Transaction} transaction - Transacción activa (requerida)
 * @returns {Promise<{fac_sec: number, request: sql.Request}>}
 */
const obtenerSiguienteFacSec = async (transaction) => {
  const request = new sql.Request(transaction);

  const seqQuery = `
    SELECT sec_num + 1 AS NewFacSec
    FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
    WHERE sec_cod = 'FACTURA'
  `;
  const seqResult = await request.query(seqQuery);
  if (!seqResult.recordset || seqResult.recordset.length === 0) {
    throw new Error("No se encontró la secuencia para 'FACTURA'");
  }
  const NewFacSec = seqResult.recordset[0].NewFacSec;

  await request.input('sec_cod', sql.VarChar(50), 'FACTURA')
    .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");

  return { fac_sec: NewFacSec, request };
};

/**
 * Obtiene el siguiente consecutivo de tipo_comprobantes para un tipo de documento.
 *
 * @param {sql.Transaction} transaction - Transacción activa
 * @param {string} fac_tip_cod - Código del tipo de comprobante (ej: 'AJT', 'VTA', 'FAC')
 * @returns {Promise<{fac_nro: string, consecutivo: number}>}
 */
const obtenerSiguienteFacNro = async (transaction, fac_tip_cod) => {
  const tipRequest = new sql.Request(transaction);
  tipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);

  const tipQuery = `
    SELECT tip_con_sec + 1 AS NewConsecFacNro
    FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
    WHERE tip_cod = @fac_tip_cod
  `;
  const tipResult = await tipRequest.query(tipQuery);
  if (!tipResult.recordset || tipResult.recordset.length === 0) {
    throw new Error(`No se encontró el consecutivo para el tipo de comprobante '${fac_tip_cod}'`);
  }
  const NewConsecFacNro = tipResult.recordset[0].NewConsecFacNro;

  const updateTipRequest = new sql.Request(transaction);
  updateTipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
  await updateTipRequest.query("UPDATE dbo.tipo_comprobantes SET tip_con_sec = tip_con_sec + 1 WHERE tip_cod = @fac_tip_cod");

  return {
    fac_nro: fac_tip_cod + String(NewConsecFacNro),
    consecutivo: NewConsecFacNro
  };
};

/**
 * Detecta si un error es una violación de PRIMARY KEY en dbo.factura
 *
 * @param {Error} error - Error capturado
 * @returns {boolean}
 */
const esPrimaryKeyViolationFactura = (error) => {
  return error && error.message && (
    error.message.includes('Violation of PRIMARY KEY constraint') &&
    error.message.includes('dbo.factura')
  );
};

/**
 * Wrapper que ejecuta una función de creación de documento (factura, ajuste, etc.)
 * con auto-recuperación de secuencia.
 *
 * Si el primer intento falla por PK violation en dbo.factura:
 * 1. Corrige la secuencia automáticamente
 * 2. Reintenta la operación UNA vez
 *
 * @param {Function} operacionFn - Función async que ejecuta la operación completa
 * @param {string} contexto - Nombre de la operación para logging (ej: 'createAdjustment')
 * @returns {Promise<any>} - Resultado de la operación
 */
const ejecutarConAutoRecuperacion = async (operacionFn, contexto = 'operacion') => {
  try {
    return await operacionFn();
  } catch (error) {
    if (esPrimaryKeyViolationFactura(error)) {
      console.warn(`[SECUENCIA_AUTO_FIX][${contexto}] PK violation detectada en dbo.factura. Corrigiendo secuencia y reintentando...`);

      try {
        const fix = await corregirSecuenciaFactura(null);
        console.log(`[SECUENCIA_AUTO_FIX][${contexto}] Secuencia corregida: ${fix.oldValue} -> ${fix.newValue}. Reintentando operación...`);

        return await operacionFn();
      } catch (retryError) {
        console.error(`[SECUENCIA_AUTO_FIX][${contexto}] Error en reintento después de corrección:`, retryError.message);
        throw retryError;
      }
    }
    throw error;
  }
};

export {
  corregirSecuenciaFactura,
  obtenerSiguienteFacSec,
  obtenerSiguienteFacNro,
  esPrimaryKeyViolationFactura,
  ejecutarConAutoRecuperacion
};
