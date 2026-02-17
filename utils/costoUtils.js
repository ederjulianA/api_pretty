/**
 * Utilidades para manejo de costos históricos
 * Fecha: 2026-02-17
 * Descripción: Funciones helper para obtener y manejar costos promedio
 *              en el momento de las ventas
 */

import { sql } from '../db.js';

/**
 * Obtiene el costo promedio actual de un artículo
 * @param {Object} transaction - Transacción SQL activa
 * @param {string} art_sec - Código del artículo
 * @param {number} lis_pre_cod - Código de lista de precios (default: 1 = detal)
 * @param {string} bod_sec - Código de bodega (default: '1')
 * @returns {Promise<number>} Costo promedio actual o 0 si no existe
 */
export const obtenerCostoPromedioActual = async (transaction, art_sec, lis_pre_cod = 1, bod_sec = '1') => {
  try {
    const result = await transaction.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .input('lis_pre_cod', sql.Int, lis_pre_cod)
      .input('bod_sec', sql.VarChar(10), bod_sec)
      .query(`
        SELECT art_bod_cos_cat
        FROM dbo.articulosdetalle
        WHERE art_sec = @art_sec
          AND lis_pre_cod = @lis_pre_cod
          AND bod_sec = @bod_sec
      `);

    if (result.recordset.length > 0 && result.recordset[0].art_bod_cos_cat !== null) {
      return parseFloat(result.recordset[0].art_bod_cos_cat);
    }

    return 0; // Si no existe costo, retornar 0
  } catch (error) {
    console.error('Error obteniendo costo promedio:', error);
    return 0; // En caso de error, retornar 0 para no bloquear la venta
  }
};

/**
 * Obtiene el costo promedio para múltiples artículos en una sola query
 * @param {Object} transaction - Transacción SQL activa
 * @param {Array<string>} art_secs - Array de códigos de artículos
 * @param {number} lis_pre_cod - Código de lista de precios (default: 1 = detal)
 * @param {string} bod_sec - Código de bodega (default: '1')
 * @returns {Promise<Map<string, number>>} Map con art_sec como key y costo como value
 */
export const obtenerCostosPromedioMultiples = async (transaction, art_secs, lis_pre_cod = 1, bod_sec = '1') => {
  if (!art_secs || art_secs.length === 0) {
    return new Map();
  }

  // Inicializar Map con todos los artículos en costo 0
  const costosMap = new Map();
  art_secs.forEach(art_sec => {
    costosMap.set(art_sec, 0);
  });

  // Consultar en lotes de 50 usando parámetros individuales (evitar SQL injection)
  const BATCH_SIZE = 50;
  for (let i = 0; i < art_secs.length; i += BATCH_SIZE) {
    const batch = art_secs.slice(i, i + BATCH_SIZE);
    const request = transaction.request()
      .input('lis_pre_cod', sql.Int, lis_pre_cod)
      .input('bod_sec', sql.VarChar(10), bod_sec);

    // Agregar cada art_sec como parámetro individual
    const placeholders = batch.map((sec, idx) => {
      const paramName = `art_sec_${idx}`;
      request.input(paramName, sql.VarChar(30), sec);
      return `@${paramName}`;
    });

    const result = await request.query(`
      SELECT art_sec, art_bod_cos_cat
      FROM dbo.articulosdetalle
      WHERE art_sec IN (${placeholders.join(',')})
        AND lis_pre_cod = @lis_pre_cod
        AND bod_sec = @bod_sec
    `);

    // Actualizar con los costos encontrados
    result.recordset.forEach(row => {
      if (row.art_bod_cos_cat !== null) {
        costosMap.set(row.art_sec, parseFloat(row.art_bod_cos_cat));
      }
    });
  }

  return costosMap;
};

/**
 * Valida que el costo sea un número válido
 * @param {any} costo - Valor a validar
 * @returns {number} Costo validado (0 si es inválido)
 */
export const validarCosto = (costo) => {
  if (costo === null || costo === undefined || isNaN(costo)) {
    return 0;
  }
  const costoNum = parseFloat(costo);
  return costoNum >= 0 ? costoNum : 0;
};
