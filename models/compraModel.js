/**
 * Modelo: Compras con Costo Promedio Ponderado
 * Fecha: 2026-02-16
 * Descripción: Lógica de negocio para registro de compras
 *              SIN Stored Procedures (lógica en JavaScript)
 *              Database-agnostic para facilitar migración futura
 *
 * CORRECCIÓN: Alineado con estructura real de BD
 * - factura usa: fac_sec (PK), nit_sec (no nit_cod), fac_total_woo
 * - facturakardes usa: kar_uni (no kar_can), kar_bod_sec (no bod_sec)
 */

const { poolPromise, sql } = require('../db');

/**
 * Calcula el nuevo costo promedio ponderado después de una compra
 *
 * Fórmula NIC 2 Colombia:
 * Nuevo Costo Promedio = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)
 *
 * @param {string} art_sec - Secuencia del artículo
 * @param {number} cantidad_compra - Cantidad comprada
 * @param {number} costo_unitario_compra - Costo unitario de la compra
 * @param {object} transaction - Transacción SQL activa
 * @returns {Promise<object>} { costo_anterior, costo_nuevo, existencia_anterior, existencia_nueva }
 */
const calcularCostoPromedio = async (art_sec, cantidad_compra, costo_unitario_compra, transaction) => {
  try {
    // 1. Obtener costo actual y existencia del artículo
    const resultActual = await transaction.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .query(`
        SELECT
          ISNULL(ad.art_bod_cos_cat, 0) AS costo_actual,
          ISNULL(ve.existencia, 0) AS existencia_actual
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad
          ON ad.art_sec = a.art_sec
          AND ad.bod_sec = '1'
          AND ad.lis_pre_cod = 1
        LEFT JOIN dbo.vwExistencias ve
          ON ve.art_sec = a.art_sec
        WHERE a.art_sec = @art_sec
      `);

    if (resultActual.recordset.length === 0) {
      throw new Error(`Artículo ${art_sec} no encontrado`);
    }

    const { costo_actual, existencia_actual } = resultActual.recordset[0];

    // 2. Calcular nuevo costo promedio ponderado
    const valor_actual = parseFloat(costo_actual) * parseFloat(existencia_actual);
    const valor_compra = parseFloat(costo_unitario_compra) * parseFloat(cantidad_compra);
    const cantidad_total = parseFloat(existencia_actual) + parseFloat(cantidad_compra);

    let nuevo_costo_promedio;

    if (cantidad_total === 0) {
      // Caso especial: sin inventario ni compra
      nuevo_costo_promedio = 0;
    } else {
      // Fórmula estándar
      nuevo_costo_promedio = (valor_actual + valor_compra) / cantidad_total;
    }

    // Redondear a 2 decimales
    nuevo_costo_promedio = Math.round(nuevo_costo_promedio * 100) / 100;

    return {
      costo_anterior: parseFloat(costo_actual),
      costo_nuevo: nuevo_costo_promedio,
      existencia_anterior: parseFloat(existencia_actual),
      existencia_nueva: cantidad_total,
      valor_actual,
      valor_compra,
      diferencia_costo: nuevo_costo_promedio - parseFloat(costo_actual)
    };

  } catch (error) {
    throw new Error(`Error calculando costo promedio: ${error.message}`);
  }
};

/**
 * Genera el siguiente fac_sec (secuencial único)
 *
 * @param {object} transaction - Transacción SQL activa
 * @returns {Promise<number>} Nuevo fac_sec
 */
const generarFacSec = async (transaction) => {
  try {
    const result = await transaction.request()
      .query(`
        SELECT ISNULL(MAX(fac_sec), 0) + 1 AS nuevo_fac_sec
        FROM dbo.factura WITH (UPDLOCK, HOLDLOCK)
      `);

    return result.recordset[0].nuevo_fac_sec;
  } catch (error) {
    throw new Error(`Error generando fac_sec: ${error.message}`);
  }
};

/**
 * Genera el siguiente número consecutivo de compra
 * Formato: COM000001, COM000002, etc.
 *
 * @param {object} transaction - Transacción SQL activa
 * @returns {Promise<string>} Número de compra generado
 */
const generarNumeroCompra = async (transaction) => {
  try {
    // Obtener configuración del tipo de comprobante
    const resultTipo = await transaction.request()
      .input('tip_cod', sql.VarChar(3), 'COM')
      .query(`
        SELECT tip_con_sec, tip_lon
        FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
        WHERE tip_cod = @tip_cod
      `);

    if (resultTipo.recordset.length === 0) {
      throw new Error('Tipo de comprobante COM no existe. Ejecutar script Fase1 primero.');
    }

    const { tip_con_sec, tip_lon } = resultTipo.recordset[0];
    const siguiente_consecutivo = parseInt(tip_con_sec) + 1;

    // Actualizar consecutivo
    await transaction.request()
      .input('tip_cod', sql.VarChar(3), 'COM')
      .input('nuevo_consecutivo', sql.Int, siguiente_consecutivo)
      .query(`
        UPDATE dbo.tipo_comprobantes
        SET tip_con_sec = @nuevo_consecutivo
        WHERE tip_cod = @tip_cod
      `);

    // Formatear número con longitud especificada
    const numero_formateado = String(siguiente_consecutivo).padStart(tip_lon, '0');
    return `COM${numero_formateado}`;

  } catch (error) {
    throw new Error(`Error generando número de compra: ${error.message}`);
  }
};

/**
 * Registra una compra completa con cálculo automático de costo promedio
 *
 * Proceso:
 * 1. Genera fac_sec y fac_nro
 * 2. Inserta encabezado en factura
 * 3. Por cada detalle:
 *    - Calcula nuevo costo promedio
 *    - Inserta en facturakardes
 *    - Actualiza costo en articulosdetalle
 *    - Registra en historial_costos
 * 4. Commit transacción
 *
 * @param {object} datosCompra - Datos de la compra
 * @param {string} datosCompra.nit_sec - Código del proveedor (nit_sec en tabla nit)
 * @param {string} datosCompra.fac_fec - Fecha de compra (YYYY-MM-DD)
 * @param {string} datosCompra.fac_obs - Observaciones
 * @param {string} datosCompra.usu_cod - Usuario que registra
 * @param {Array} datosCompra.detalles - Array de items comprados
 * @param {string} datosCompra.detalles[].art_sec - Código del artículo
 * @param {number} datosCompra.detalles[].cantidad - Cantidad comprada
 * @param {number} datosCompra.detalles[].costo_unitario - Costo unitario
 * @returns {Promise<object>} { fac_sec, fac_nro, total_items, total_valor, detalles_actualizacion }
 */
const registrarCompra = async (datosCompra) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Generar fac_sec y fac_nro
    const fac_sec = await generarFacSec(transaction);
    const fac_nro = await generarNumeroCompra(transaction);

    // 2. Calcular total
    let total_valor = 0;
    for (const detalle of datosCompra.detalles) {
      total_valor += parseFloat(detalle.cantidad) * parseFloat(detalle.costo_unitario);
    }

    // 3. Insertar encabezado en factura
    // NOTA: fac_total_woo NO se usa para compras (es solo para pedidos WooCommerce)
    // El total se calcula sumando kar_total de facturakardes
    await transaction.request()
      .input('fac_sec', sql.Decimal(12, 0), fac_sec)
      .input('fac_fec', sql.DateTime, datosCompra.fac_fec)
      .input('fac_tip_cod', sql.VarChar(5), 'COM')
      .input('f_tip_cod', sql.VarChar(5), 'COM')
      .input('nit_sec', sql.VarChar(16), datosCompra.nit_sec)
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .input('fac_est_fac', sql.Char(1), 'A') // Activa
      .input('fac_obs', sql.VarChar(1024), datosCompra.fac_obs || '')
      .input('fac_usu_cod_cre', sql.VarChar(100), datosCompra.usu_cod)
      .query(`
        INSERT INTO dbo.factura (
          fac_sec,
          fac_fec,
          fac_tip_cod,
          f_tip_cod,
          nit_sec,
          fac_nro,
          fac_est_fac,
          fac_obs,
          fac_fch_cre,
          fac_usu_cod_cre
        ) VALUES (
          @fac_sec,
          @fac_fec,
          @fac_tip_cod,
          @f_tip_cod,
          @nit_sec,
          @fac_nro,
          @fac_est_fac,
          @fac_obs,
          GETDATE(),
          @fac_usu_cod_cre
        )
      `);

    // 4. Procesar cada detalle
    const detalles_actualizacion = [];

    for (let i = 0; i < datosCompra.detalles.length; i++) {
      const detalle = datosCompra.detalles[i];
      const { art_sec, cantidad, costo_unitario } = detalle;

      // 4.1 Calcular nuevo costo promedio
      const calculoCosto = await calcularCostoPromedio(
        art_sec,
        cantidad,
        costo_unitario,
        transaction
      );

      // 4.2 Insertar en facturakardes (kárdex)
      // CORRECCIÓN: Usar campos reales de facturakardes
      const kar_sec = i + 1;

      await transaction.request()
        .input('fac_sec', sql.Decimal(12, 0), fac_sec)
        .input('kar_sec', sql.Int, kar_sec)
        .input('art_sec', sql.VarChar(30), art_sec)
        .input('kar_uni', sql.Decimal(17, 2), cantidad)
        .input('kar_pre', sql.Decimal(17, 2), costo_unitario)
        .input('kar_pre_pub', sql.Decimal(17, 2), costo_unitario)
        .input('kar_total', sql.Decimal(17, 2), cantidad * costo_unitario)
        .input('kar_nat', sql.Char(1), '+') // Entrada
        .input('kar_bod_sec', sql.VarChar(16), '1')
        .query(`
          INSERT INTO dbo.facturakardes (
            fac_sec,
            kar_sec,
            art_sec,
            kar_uni,
            kar_pre,
            kar_pre_pub,
            kar_total,
            kar_nat,
            kar_bod_sec
          ) VALUES (
            @fac_sec,
            @kar_sec,
            @art_sec,
            @kar_uni,
            @kar_pre,
            @kar_pre_pub,
            @kar_total,
            @kar_nat,
            @kar_bod_sec
          )
        `);

      // 4.3 Actualizar costo promedio en articulosdetalle
      await transaction.request()
        .input('art_sec', sql.VarChar(30), art_sec)
        .input('nuevo_costo', sql.Decimal(17, 2), calculoCosto.costo_nuevo)
        .query(`
          UPDATE dbo.articulosdetalle
          SET art_bod_cos_cat = @nuevo_costo
          WHERE art_sec = @art_sec
            AND bod_sec = '1'
            AND lis_pre_cod = 1
        `);

      // 4.4 Registrar en historial de costos
      // CORRECCIÓN: Usar nombres de campos reales de la tabla historial_costos
      await transaction.request()
        .input('art_sec', sql.VarChar(30), art_sec)
        .input('fac_sec', sql.Decimal(12, 0), fac_sec)
        .input('cantidad_antes', sql.Decimal(17, 2), calculoCosto.existencia_anterior)
        .input('costo_antes', sql.Decimal(17, 2), calculoCosto.costo_anterior)
        .input('valor_antes', sql.Decimal(17, 2), calculoCosto.valor_actual)
        .input('cantidad_mov', sql.Decimal(17, 2), cantidad)
        .input('costo_mov', sql.Decimal(17, 2), costo_unitario)
        .input('valor_mov', sql.Decimal(17, 2), cantidad * costo_unitario)
        .input('cantidad_despues', sql.Decimal(17, 2), calculoCosto.existencia_nueva)
        .input('costo_despues', sql.Decimal(17, 2), calculoCosto.costo_nuevo)
        .input('valor_despues', sql.Decimal(17, 2), calculoCosto.costo_nuevo * calculoCosto.existencia_nueva)
        .input('usu_cod', sql.VarChar(100), datosCompra.usu_cod)
        .input('observaciones', sql.VarChar(500),
          `Compra ${fac_nro}: ${cantidad} unids a $${costo_unitario}`
        )
        .query(`
          INSERT INTO dbo.historial_costos (
            hc_art_sec,
            hc_fac_sec,
            hc_fecha,
            hc_tipo_mov,
            hc_cantidad_antes,
            hc_costo_antes,
            hc_valor_antes,
            hc_cantidad_mov,
            hc_costo_mov,
            hc_valor_mov,
            hc_cantidad_despues,
            hc_costo_despues,
            hc_valor_despues,
            hc_usu_cod,
            hc_observaciones
          ) VALUES (
            @art_sec,
            @fac_sec,
            GETDATE(),
            'COMPRA',
            @cantidad_antes,
            @costo_antes,
            @valor_antes,
            @cantidad_mov,
            @costo_mov,
            @valor_mov,
            @cantidad_despues,
            @costo_despues,
            @valor_despues,
            @usu_cod,
            @observaciones
          )
        `);

      detalles_actualizacion.push({
        art_sec,
        cantidad,
        costo_unitario,
        costo_anterior: calculoCosto.costo_anterior,
        costo_nuevo: calculoCosto.costo_nuevo,
        diferencia: calculoCosto.diferencia_costo,
        existencia_anterior: calculoCosto.existencia_anterior,
        existencia_nueva: calculoCosto.existencia_nueva
      });
    }

    // 5. Commit transacción
    await transaction.commit();

    return {
      success: true,
      fac_sec,
      fac_nro,
      total_items: datosCompra.detalles.length,
      total_valor,
      detalles_actualizacion
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Obtiene el historial de compras con filtros opcionales
 *
 * @param {object} filtros - Filtros de búsqueda
 * @param {string} filtros.fecha_desde - Fecha inicio (YYYY-MM-DD)
 * @param {string} filtros.fecha_hasta - Fecha fin (YYYY-MM-DD)
 * @param {string} filtros.nit_sec - Código del proveedor
 * @param {number} filtros.limit - Límite de registros
 * @returns {Promise<Array>} Lista de compras
 */
const obtenerHistorialCompras = async (filtros = {}) => {
  try {
    const pool = await poolPromise;

    let query = `
      SELECT
        f.fac_nro,
        f.fac_fec,
        f.nit_sec,
        n.nit_nom AS proveedor,
        ISNULL(SUM(fk.kar_total), 0) AS total,
        f.fac_obs,
        f.fac_usu_cod_cre AS usu_cod,
        COUNT(fk.kar_sec) AS total_items
      FROM dbo.factura f
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      LEFT JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
      WHERE f.fac_tip_cod = 'COM'
        AND f.fac_est_fac = 'A'
    `;

    const request = pool.request();

    if (filtros.fecha_desde) {
      query += ` AND f.fac_fec >= @fecha_desde`;
      request.input('fecha_desde', sql.Date, filtros.fecha_desde);
    }

    if (filtros.fecha_hasta) {
      query += ` AND f.fac_fec <= @fecha_hasta`;
      request.input('fecha_hasta', sql.Date, filtros.fecha_hasta);
    }

    if (filtros.nit_sec) {
      query += ` AND f.nit_sec = @nit_sec`;
      request.input('nit_sec', sql.VarChar(16), filtros.nit_sec);
    }

    query += `
      GROUP BY f.fac_nro, f.fac_fec, f.nit_sec, n.nit_nom, f.fac_obs, f.fac_usu_cod_cre
    `;

    if (filtros.limit) {
      query = `SELECT TOP (@limit) * FROM (${query}) AS compras ORDER BY fac_fec DESC`;
      request.input('limit', sql.Int, filtros.limit);
    } else {
      query += ` ORDER BY f.fac_fec DESC`;
    }

    const result = await request.query(query);
    return result.recordset;

  } catch (error) {
    throw new Error(`Error obteniendo historial de compras: ${error.message}`);
  }
};

/**
 * Obtiene el detalle de una compra específica
 *
 * @param {string} fac_nro - Número de compra
 * @returns {Promise<object>} { encabezado, detalles }
 */
const obtenerDetalleCompra = async (fac_nro) => {
  try {
    const pool = await poolPromise;

    // Encabezado con total calculado desde kárdex
    const resultEncabezado = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT
          f.fac_nro,
          f.fac_fec,
          f.nit_sec,
          n.nit_nom AS proveedor,
          ISNULL((
            SELECT SUM(kar_total)
            FROM dbo.facturakardes
            WHERE fac_sec = f.fac_sec
          ), 0) AS total,
          f.fac_obs,
          f.fac_usu_cod_cre AS usu_cod
        FROM dbo.factura f
        LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
        WHERE f.fac_nro = @fac_nro
          AND f.fac_tip_cod = 'COM'
      `);

    if (resultEncabezado.recordset.length === 0) {
      throw new Error(`Compra ${fac_nro} no encontrada`);
    }

    // Detalles
    const resultDetalles = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT
          fk.kar_sec,
          fk.art_sec,
          a.art_cod,
          a.art_nom,
          fk.kar_uni AS cantidad,
          fk.kar_pre AS costo_unitario,
          fk.kar_total AS valor_total,
          -- Buscar el costo actual
          ISNULL(ad.art_bod_cos_cat, 0) AS costo_actual
        FROM dbo.facturakardes fk
        INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
        INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
        LEFT JOIN dbo.articulosdetalle ad
          ON ad.art_sec = fk.art_sec
          AND ad.bod_sec = '1'
          AND ad.lis_pre_cod = 1
        WHERE f.fac_nro = @fac_nro
        ORDER BY fk.kar_sec
      `);

    return {
      encabezado: resultEncabezado.recordset[0],
      detalles: resultDetalles.recordset
    };

  } catch (error) {
    throw new Error(`Error obteniendo detalle de compra: ${error.message}`);
  }
};

/**
 * Obtiene el valorizado de inventario con análisis de rotación
 * @param {Object} filtros - Filtros opcionales
 * @returns {Promise<Object>} Datos del valorizado
 */
const obtenerValorizadoInventario = async (filtros = {}) => {
  try {
    const { poolPromise, sql } = require('../db');
    const pool = await poolPromise;

    // Query principal con CTE (incluye clasificación ABC para filtrado)
    let query = `
      WITH InventarioBase AS (
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          a.inv_sub_gru_cod,
          isg.inv_sub_gru_nom AS subcategoria_nombre,

          -- Existencia actual
          ISNULL(ve.existencia, 0) AS existencia,

          -- Costo unitario (bod_sec='1', lis_pre_cod=1)
          ISNULL(ad.art_bod_cos_cat, 0) AS costo_unitario,

          -- Valor total
          (ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)) AS valor_total,

          -- Última compra (fac_tip_cod='COM', kar_nat='+')
          (SELECT MAX(f.fac_fec)
           FROM dbo.factura f
           INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
           WHERE fk.art_sec = a.art_sec
             AND f.fac_tip_cod = 'COM'
             AND fk.kar_nat = '+'
             AND f.fac_est_fac = 'A') AS ultima_compra,

          -- Última venta (fac_tip_cod='VTA', kar_nat='-')
          (SELECT MAX(f.fac_fec)
           FROM dbo.factura f
           INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
           WHERE fk.art_sec = a.art_sec
             AND f.fac_tip_cod = 'VTA'
             AND fk.kar_nat = '-'
             AND f.fac_est_fac = 'A') AS ultima_venta

        FROM dbo.articulos a
        LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
        LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
          AND ad.bod_sec = '1'
          AND ad.lis_pre_cod = 1
        LEFT JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod

        WHERE 1=1
    `;

    const request = pool.request();

    // Filtro: Solo artículos con costo asignado
    // Nota: No existe campo art_est en tabla articulos
    query += ` AND ISNULL(ad.art_bod_cos_cat, 0) > 0`;

    // Filtro: Subcategoría
    if (filtros.inv_sub_gru_cod) {
      query += ` AND a.inv_sub_gru_cod = @inv_sub_gru_cod`;
      request.input('inv_sub_gru_cod', sql.SmallInt, filtros.inv_sub_gru_cod);
    }

    // Cerrar primer CTE y agregar clasificación ABC
    query += `
      ),
      InventarioConABC AS (
        SELECT
          *,
          CASE
            WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) /
                  (SELECT SUM(valor_total) FROM InventarioBase WHERE valor_total > 0) * 100) <= 80 THEN 'A'
            WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) /
                  (SELECT SUM(valor_total) FROM InventarioBase WHERE valor_total > 0) * 100) <= 95 THEN 'B'
            ELSE 'C'
          END AS clasificacion_abc_calculada
        FROM InventarioBase
      )
      SELECT * FROM InventarioConABC
      WHERE 1=1
    `;

    // Filtro: Fecha de última compra (desde)
    if (filtros.fecha_compra_desde) {
      query += ` AND ultima_compra >= @fecha_compra_desde`;
      request.input('fecha_compra_desde', sql.Date, filtros.fecha_compra_desde);
    }

    // Filtro: Fecha de última compra (hasta)
    if (filtros.fecha_compra_hasta) {
      query += ` AND ultima_compra <= @fecha_compra_hasta`;
      request.input('fecha_compra_hasta', sql.Date, filtros.fecha_compra_hasta);
    }

    // Filtro: Clasificación ABC
    if (filtros.clasificacion_abc) {
      query += ` AND clasificacion_abc_calculada = @clasificacion_abc`;
      request.input('clasificacion_abc', sql.VarChar(1), filtros.clasificacion_abc);
    }

    // Ordenar por valor total descendente
    query += ` ORDER BY valor_total DESC`;

    // Paginación
    const offset = filtros.offset || 0;
    const limit = Math.min(filtros.limit || 100, 1000); // Max 1000

    query += `
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    const result = await request.query(query);

    // Query para obtener resumen GLOBAL (sin paginación)
    // Necesario para calcular correctamente el valor total y clasificación ABC
    let queryGlobal = `
      WITH InventarioValorado AS (
        SELECT
          a.art_sec,
          ISNULL(ve.existencia, 0) AS existencia,
          ISNULL(ad.art_bod_cos_cat, 0) AS costo_unitario,
          (ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)) AS valor_total

        FROM dbo.articulos a
        LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
        LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
          AND ad.bod_sec = '1'
          AND ad.lis_pre_cod = 1

        WHERE 1=1
          AND ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const requestGlobal = pool.request();

    // Aplicar los mismos filtros que en la query paginada
    if (filtros.inv_sub_gru_cod) {
      queryGlobal += ` AND a.inv_sub_gru_cod = @inv_sub_gru_cod`;
      requestGlobal.input('inv_sub_gru_cod', sql.SmallInt, filtros.inv_sub_gru_cod);
    }

    queryGlobal += `
      )
      SELECT
        COUNT(*) AS total_articulos,
        SUM(valor_total) AS valor_total_inventario
      FROM InventarioValorado
    `;

    const resultGlobal = await requestGlobal.query(queryGlobal);
    const datosGlobales = resultGlobal.recordset[0];

    // Calcular clasificación ABC global
    let queryABC = `
      WITH InventarioValorado AS (
        SELECT
          a.art_sec,
          (ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)) AS valor_total
        FROM dbo.articulos a
        LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
        LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
          AND ad.bod_sec = '1'
          AND ad.lis_pre_cod = 1
        WHERE ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const requestABC = pool.request();
    if (filtros.inv_sub_gru_cod) {
      queryABC += ` AND a.inv_sub_gru_cod = @inv_sub_gru_cod`;
      requestABC.input('inv_sub_gru_cod', sql.SmallInt, filtros.inv_sub_gru_cod);
    }

    queryABC += `
      ),
      Ordenado AS (
        SELECT
          art_sec,
          valor_total,
          SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) AS acumulado,
          (SELECT SUM(valor_total) FROM InventarioValorado) AS total
        FROM InventarioValorado
      ),
      Clasificado AS (
        SELECT
          CASE
            WHEN (acumulado / total * 100) <= 80 THEN 'A'
            WHEN (acumulado / total * 100) <= 95 THEN 'B'
            ELSE 'C'
          END AS clasificacion,
          valor_total
        FROM Ordenado
      )
      SELECT
        clasificacion,
        COUNT(*) AS cantidad,
        SUM(valor_total) AS valor
      FROM Clasificado
      GROUP BY clasificacion
    `;

    const resultABC = await requestABC.query(queryABC);

    // Procesar resultados ABC
    const abc = { A: { cantidad: 0, valor: 0 }, B: { cantidad: 0, valor: 0 }, C: { cantidad: 0, valor: 0 } };
    resultABC.recordset.forEach(row => {
      abc[row.clasificacion] = {
        cantidad: row.cantidad,
        valor: parseFloat(row.valor)
      };
    });

    // Contar artículos sin costo
    const countSinCostoQuery = `
      SELECT COUNT(*) AS total_sin_costo
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
        AND ad.bod_sec = '1'
        AND ad.lis_pre_cod = 1
      WHERE (ad.art_bod_cos_cat IS NULL OR ad.art_bod_cos_cat = 0)
    `;

    const countSinCostoResult = await pool.request().query(countSinCostoQuery);
    const articulos_sin_costo = countSinCostoResult.recordset[0].total_sin_costo;

    return {
      articulos: result.recordset,
      articulos_sin_costo,
      total_articulos_global: datosGlobales.total_articulos,
      valor_total_global: parseFloat(datosGlobales.valor_total_inventario) || 0,
      clasificacion_abc_global: abc
    };

  } catch (error) {
    throw new Error(`Error obteniendo valorizado de inventario: ${error.message}`);
  }
};

/**
 * Obtiene artículos sin costo asignado
 * @param {Object} filtros - Filtros opcionales
 * @returns {Promise<Array>} Lista de artículos sin costo
 */
const obtenerArticulosSinCosto = async (filtros = {}) => {
  try {
    const { poolPromise, sql } = require('../db');
    const pool = await poolPromise;

    let query = `
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        a.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS subcategoria_nombre,
        ISNULL(ve.existencia, 0) AS existencia,
        ad_mayor.art_bod_pre AS precio_mayor,
        ad_detal.art_bod_pre AS precio_detal
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad_costo ON ad_costo.art_sec = a.art_sec
        AND ad_costo.bod_sec = '1'
        AND ad_costo.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
        AND ad_mayor.bod_sec = '1'
        AND ad_mayor.lis_pre_cod = 2
      LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
        AND ad_detal.bod_sec = '1'
        AND ad_detal.lis_pre_cod = 1
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
      WHERE (ad_costo.art_bod_cos_cat IS NULL OR ad_costo.art_bod_cos_cat = 0)
    `;

    const request = pool.request();

    // Filtro: Subcategoría
    if (filtros.inv_sub_gru_cod) {
      query += ` AND a.inv_sub_gru_cod = @inv_sub_gru_cod`;
      request.input('inv_sub_gru_cod', sql.SmallInt, filtros.inv_sub_gru_cod);
    }

    // Filtro: Con existencia
    if (filtros.solo_con_existencia) {
      query += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    // Ordenar
    query += ` ORDER BY a.art_cod`;

    // Paginación
    const offset = filtros.offset || 0;
    const limit = Math.min(filtros.limit || 100, 1000);

    query += `
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    const result = await request.query(query);

    return result.recordset;

  } catch (error) {
    throw new Error(`Error obteniendo artículos sin costo: ${error.message}`);
  }
};

/**
 * Obtiene valorizado de inventario agrupado por categorías (Nivel 1 del árbol)
 * @param {Object} filtros - Filtros opcionales
 * @returns {Object} Categorías con valorizado y resumen global
 */
const obtenerValorizadoPorCategorias = async (filtros = {}) => {
  try {
    const pool = await poolPromise;

    // Query para obtener resumen global (sin filtros de agrupación)
    let queryGlobal = `
      SELECT
        COUNT(DISTINCT a.art_sec) AS total_articulos_global,
        ISNULL(SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)), 0) AS valor_total_global
      FROM dbo.articulos a
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
        AND ad.bod_sec = '1'
        AND ad.lis_pre_cod = 1
      WHERE ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const requestGlobal = pool.request();

    // Aplicar filtros opcionales al resumen global
    if (filtros.solo_con_stock) {
      queryGlobal += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
      queryGlobal += `
        AND EXISTS (
          SELECT 1 FROM dbo.factura f
          INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
          WHERE fk.kar_art_sec = a.art_sec
            AND f.fac_tip_cod = 'COM'
      `;

      if (filtros.fecha_compra_desde) {
        queryGlobal += ` AND f.fac_fec >= @fecha_compra_desde`;
        requestGlobal.input('fecha_compra_desde', sql.Date, filtros.fecha_compra_desde);
      }

      if (filtros.fecha_compra_hasta) {
        queryGlobal += ` AND f.fac_fec <= @fecha_compra_hasta`;
        requestGlobal.input('fecha_compra_hasta', sql.Date, filtros.fecha_compra_hasta);
      }

      queryGlobal += `)`;
    }

    const resultGlobal = await requestGlobal.query(queryGlobal);
    const { total_articulos_global, valor_total_global } = resultGlobal.recordset[0];

    // Query para obtener categorías con valorizado
    let query = `
      SELECT
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria_nombre,
        COUNT(DISTINCT a.art_sec) AS total_articulos,
        ISNULL(SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)), 0) AS valor_total
      FROM dbo.articulos a
      INNER JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
      INNER JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
        AND ad.bod_sec = '1'
        AND ad.lis_pre_cod = 1
      WHERE ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const request = pool.request();

    // Aplicar filtros
    if (filtros.solo_con_stock) {
      query += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
      query += `
        AND EXISTS (
          SELECT 1 FROM dbo.factura f
          INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
          WHERE fk.kar_art_sec = a.art_sec
            AND f.fac_tip_cod = 'COM'
      `;

      if (filtros.fecha_compra_desde) {
        query += ` AND f.fac_fec >= @fecha_compra_desde`;
        request.input('fecha_compra_desde', sql.Date, filtros.fecha_compra_desde);
      }

      if (filtros.fecha_compra_hasta) {
        query += ` AND f.fac_fec <= @fecha_compra_hasta`;
        request.input('fecha_compra_hasta', sql.Date, filtros.fecha_compra_hasta);
      }

      query += `)`;
    }

    if (filtros.clasificacion_abc) {
      // Para filtro ABC necesitamos calcular la clasificación primero
      query = `
        WITH InventarioBase AS (
          SELECT
            a.art_sec,
            ig.inv_gru_cod,
            ig.inv_gru_nom,
            (ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)) AS valor_total
          FROM dbo.articulos a
          INNER JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
          INNER JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
          LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
          LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
            AND ad.bod_sec = '1'
            AND ad.lis_pre_cod = 1
          WHERE ISNULL(ad.art_bod_cos_cat, 0) > 0
      `;

      if (filtros.solo_con_stock) {
        query += ` AND ISNULL(ve.existencia, 0) > 0`;
      }

      if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
        query += `
          AND EXISTS (
            SELECT 1 FROM dbo.factura f
            INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
            WHERE fk.kar_art_sec = a.art_sec
              AND f.fac_tip_cod = 'COM'
        `;

        if (filtros.fecha_compra_desde) {
          query += ` AND f.fac_fec >= @fecha_compra_desde`;
        }

        if (filtros.fecha_compra_hasta) {
          query += ` AND f.fac_fec <= @fecha_compra_hasta`;
        }

        query += `)`;
      }

      query += `
        ),
        InventarioConABC AS (
          SELECT
            *,
            CASE
              WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) /
                    (SELECT SUM(valor_total) FROM InventarioBase WHERE valor_total > 0) * 100) <= 80 THEN 'A'
              WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) /
                    (SELECT SUM(valor_total) FROM InventarioBase WHERE valor_total > 0) * 100) <= 95 THEN 'B'
              ELSE 'C'
            END AS clasificacion_abc
          FROM InventarioBase
        )
        SELECT
          inv_gru_cod,
          inv_gru_nom AS categoria_nombre,
          COUNT(DISTINCT art_sec) AS total_articulos,
          ISNULL(SUM(valor_total), 0) AS valor_total
        FROM InventarioConABC
        WHERE clasificacion_abc = @clasificacion_abc
      `;

      request.input('clasificacion_abc', sql.VarChar(1), filtros.clasificacion_abc);
    }

    query += `
      GROUP BY ig.inv_gru_cod, ig.inv_gru_nom
      ORDER BY valor_total DESC
    `;

    const result = await request.query(query);

    return {
      categorias: result.recordset.map(cat => ({
        inv_gru_cod: cat.inv_gru_cod,
        categoria_nombre: cat.categoria_nombre,
        total_articulos: parseInt(cat.total_articulos),
        valor_total: parseFloat(cat.valor_total),
        porcentaje_sobre_total: valor_total_global > 0
          ? parseFloat(((cat.valor_total / valor_total_global) * 100).toFixed(2))
          : 0
      })),
      resumen_global: {
        valor_total_inventario: parseFloat(valor_total_global),
        total_articulos: parseInt(total_articulos_global)
      }
    };

  } catch (error) {
    console.error('Error en obtenerValorizadoPorCategorias:', error);
    throw error;
  }
};

/**
 * Obtiene valorizado de inventario agrupado por subcategorías de una categoría (Nivel 2 del árbol)
 * @param {string} inv_gru_cod - Código de categoría padre
 * @param {Object} filtros - Filtros opcionales
 * @returns {Object} Subcategorías con valorizado
 */
const obtenerValorizadoPorSubcategorias = async (inv_gru_cod, filtros = {}) => {
  try {
    const pool = await poolPromise;

    // Query para obtener total de la categoría padre
    let queryCategoriaTotal = `
      SELECT
        ISNULL(SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)), 0) AS valor_total_categoria
      FROM dbo.articulos a
      INNER JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
      INNER JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
        AND ad.bod_sec = '1'
        AND ad.lis_pre_cod = 1
      WHERE ig.inv_gru_cod = @inv_gru_cod
        AND ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const requestCategoria = pool.request();
    requestCategoria.input('inv_gru_cod', sql.VarChar(16), inv_gru_cod);

    if (filtros.solo_con_stock) {
      queryCategoriaTotal += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
      queryCategoriaTotal += `
        AND EXISTS (
          SELECT 1 FROM dbo.factura f
          INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
          WHERE fk.kar_art_sec = a.art_sec
            AND f.fac_tip_cod = 'COM'
      `;

      if (filtros.fecha_compra_desde) {
        queryCategoriaTotal += ` AND f.fac_fec >= @fecha_compra_desde`;
        requestCategoria.input('fecha_compra_desde', sql.Date, filtros.fecha_compra_desde);
      }

      if (filtros.fecha_compra_hasta) {
        queryCategoriaTotal += ` AND f.fac_fec <= @fecha_compra_hasta`;
        requestCategoria.input('fecha_compra_hasta', sql.Date, filtros.fecha_compra_hasta);
      }

      queryCategoriaTotal += `)`;
    }

    const resultCategoria = await requestCategoria.query(queryCategoriaTotal);
    const valor_total_categoria = parseFloat(resultCategoria.recordset[0].valor_total_categoria);

    // Query para resumen global
    let queryGlobal = `
      SELECT
        ISNULL(SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)), 0) AS valor_total_global
      FROM dbo.articulos a
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
        AND ad.bod_sec = '1'
        AND ad.lis_pre_cod = 1
      WHERE ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const requestGlobal = pool.request();

    if (filtros.solo_con_stock) {
      queryGlobal += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
      queryGlobal += `
        AND EXISTS (
          SELECT 1 FROM dbo.factura f
          INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
          WHERE fk.kar_art_sec = a.art_sec
            AND f.fac_tip_cod = 'COM'
      `;

      if (filtros.fecha_compra_desde) {
        queryGlobal += ` AND f.fac_fec >= @fecha_compra_desde`;
        requestGlobal.input('fecha_compra_desde', sql.Date, filtros.fecha_compra_desde);
      }

      if (filtros.fecha_compra_hasta) {
        queryGlobal += ` AND f.fac_fec <= @fecha_compra_hasta`;
        requestGlobal.input('fecha_compra_hasta', sql.Date, filtros.fecha_compra_hasta);
      }

      queryGlobal += `)`;
    }

    const resultGlobal = await requestGlobal.query(queryGlobal);
    const valor_total_global = parseFloat(resultGlobal.recordset[0].valor_total_global);

    // Query para subcategorías
    let query = `
      SELECT
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS subcategoria_nombre,
        COUNT(DISTINCT a.art_sec) AS total_articulos,
        ISNULL(SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)), 0) AS valor_total
      FROM dbo.articulos a
      INNER JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
        AND ad.bod_sec = '1'
        AND ad.lis_pre_cod = 1
      WHERE isg.inv_gru_cod = @inv_gru_cod
        AND ISNULL(ad.art_bod_cos_cat, 0) > 0
    `;

    const request = pool.request();
    request.input('inv_gru_cod', sql.VarChar(16), inv_gru_cod);

    if (filtros.solo_con_stock) {
      query += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
      query += `
        AND EXISTS (
          SELECT 1 FROM dbo.factura f
          INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
          WHERE fk.kar_art_sec = a.art_sec
            AND f.fac_tip_cod = 'COM'
      `;

      if (filtros.fecha_compra_desde) {
        query += ` AND f.fac_fec >= @fecha_compra_desde`;
        request.input('fecha_compra_desde', sql.Date, filtros.fecha_compra_desde);
      }

      if (filtros.fecha_compra_hasta) {
        query += ` AND f.fac_fec <= @fecha_compra_hasta`;
        request.input('fecha_compra_hasta', sql.Date, filtros.fecha_compra_hasta);
      }

      query += `)`;
    }

    if (filtros.clasificacion_abc) {
      // Con filtro ABC, necesitamos calcular clasificación
      query = `
        WITH InventarioBase AS (
          SELECT
            a.art_sec,
            isg.inv_sub_gru_cod,
            isg.inv_sub_gru_nom,
            (ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)) AS valor_total
          FROM dbo.articulos a
          INNER JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
          LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
          LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
            AND ad.bod_sec = '1'
            AND ad.lis_pre_cod = 1
          WHERE isg.inv_gru_cod = @inv_gru_cod
            AND ISNULL(ad.art_bod_cos_cat, 0) > 0
      `;

      if (filtros.solo_con_stock) {
        query += ` AND ISNULL(ve.existencia, 0) > 0`;
      }

      if (filtros.fecha_compra_desde || filtros.fecha_compra_hasta) {
        query += `
          AND EXISTS (
            SELECT 1 FROM dbo.factura f
            INNER JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
            WHERE fk.kar_art_sec = a.art_sec
              AND f.fac_tip_cod = 'COM'
        `;

        if (filtros.fecha_compra_desde) {
          query += ` AND f.fac_fec >= @fecha_compra_desde`;
        }

        if (filtros.fecha_compra_hasta) {
          query += ` AND f.fac_fec <= @fecha_compra_hasta`;
        }

        query += `)`;
      }

      query += `
        ),
        InventarioConABC AS (
          SELECT
            *,
            CASE
              WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) /
                    (SELECT SUM(valor_total) FROM InventarioBase WHERE valor_total > 0) * 100) <= 80 THEN 'A'
              WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC ROWS UNBOUNDED PRECEDING) /
                    (SELECT SUM(valor_total) FROM InventarioBase WHERE valor_total > 0) * 100) <= 95 THEN 'B'
              ELSE 'C'
            END AS clasificacion_abc
          FROM InventarioBase
        )
        SELECT
          inv_sub_gru_cod,
          inv_sub_gru_nom AS subcategoria_nombre,
          COUNT(DISTINCT art_sec) AS total_articulos,
          ISNULL(SUM(valor_total), 0) AS valor_total
        FROM InventarioConABC
        WHERE clasificacion_abc = @clasificacion_abc
      `;

      request.input('clasificacion_abc', sql.VarChar(1), filtros.clasificacion_abc);
    }

    query += `
      GROUP BY isg.inv_sub_gru_cod, isg.inv_sub_gru_nom
      ORDER BY valor_total DESC
    `;

    const result = await request.query(query);

    return {
      subcategorias: result.recordset.map(sub => ({
        inv_sub_gru_cod: parseInt(sub.inv_sub_gru_cod),
        subcategoria_nombre: sub.subcategoria_nombre,
        total_articulos: parseInt(sub.total_articulos),
        valor_total: parseFloat(sub.valor_total),
        porcentaje_sobre_categoria: valor_total_categoria > 0
          ? parseFloat(((sub.valor_total / valor_total_categoria) * 100).toFixed(2))
          : 0,
        porcentaje_sobre_total: valor_total_global > 0
          ? parseFloat(((sub.valor_total / valor_total_global) * 100).toFixed(2))
          : 0
      }))
    };

  } catch (error) {
    console.error('Error en obtenerValorizadoPorSubcategorias:', error);
    throw error;
  }
};

/**
 * Obtiene artículos valorizados de una subcategoría (Nivel 3 del árbol - reutiliza lógica existente)
 * @param {number} inv_sub_gru_cod - Código de subcategoría
 * @param {Object} filtros - Filtros opcionales (incluye limit, offset, etc.)
 * @returns {Object} Artículos con valorizado y paginación
 */
const obtenerArticulosPorSubcategoria = async (inv_sub_gru_cod, filtros = {}) => {
  // Reutilizar la función existente obtenerValorizadoInventario
  // Solo necesitamos agregar el filtro de subcategoría
  const filtrosConSubcategoria = {
    ...filtros,
    inv_sub_gru_cod: parseInt(inv_sub_gru_cod)
  };

  return await obtenerValorizadoInventario(filtrosConSubcategoria);
};

/**
 * Actualiza una compra existente
 * Permite actualizar tanto encabezado como detalles con recálculo automático de costos
 *
 * PROCESO DE ACTUALIZACIÓN DE DETALLES:
 * 1. Reversa el efecto de la compra original en el costo promedio
 * 2. Aplica el efecto de la compra corregida
 * 3. Recalcula el costo promedio correcto
 * 4. Registra en historial_costos como tipo AJUSTE
 *
 * @param {string} fac_nro - Número de compra a actualizar
 * @param {object} datosActualizacion - Datos a actualizar
 * @param {string} datosActualizacion.fac_fec - Nueva fecha (opcional)
 * @param {string} datosActualizacion.nit_sec - Nuevo proveedor (opcional)
 * @param {string} datosActualizacion.fac_obs - Nuevas observaciones (opcional)
 * @param {string} datosActualizacion.fac_est_fac - Nuevo estado: A/I/C (opcional)
 * @param {Array} datosActualizacion.detalles - Detalles a actualizar (opcional)
 * @param {number} datosActualizacion.detalles[].kar_sec - Secuencia del detalle
 * @param {number} datosActualizacion.detalles[].cantidad - Nueva cantidad
 * @param {number} datosActualizacion.detalles[].costo_unitario - Nuevo costo unitario
 * @param {string} datosActualizacion.usu_cod - Usuario que actualiza
 * @returns {Promise<object>} Resultado de la actualización
 */
const actualizarCompra = async (fac_nro, datosActualizacion) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Verificar que la compra existe
    const resultCompra = await transaction.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT fac_sec, fac_tip_cod, fac_est_fac
        FROM dbo.factura
        WHERE fac_nro = @fac_nro
      `);

    if (resultCompra.recordset.length === 0) {
      throw new Error(`Compra ${fac_nro} no encontrada`);
    }

    const compraActual = resultCompra.recordset[0];
    const fac_sec = compraActual.fac_sec;

    // 2. Validar que es una compra (no otro tipo de factura)
    if (compraActual.fac_tip_cod !== 'COM') {
      throw new Error(`La factura ${fac_nro} no es una compra (tipo: ${compraActual.fac_tip_cod})`);
    }

    const detallesActualizados = [];

    // 3. ACTUALIZAR DETALLES (si se proporcionaron)
    if (datosActualizacion.detalles && datosActualizacion.detalles.length > 0) {
      for (const detalleNuevo of datosActualizacion.detalles) {
        const { kar_sec, cantidad, costo_unitario } = detalleNuevo;

        // 3.1 Obtener detalle original
        const resultDetalleOriginal = await transaction.request()
          .input('fac_sec', sql.Decimal(12, 0), fac_sec)
          .input('kar_sec', sql.Int, kar_sec)
          .query(`
            SELECT art_sec, kar_uni, kar_pre, kar_total
            FROM dbo.facturakardes
            WHERE fac_sec = @fac_sec AND kar_sec = @kar_sec
          `);

        if (resultDetalleOriginal.recordset.length === 0) {
          throw new Error(`Detalle kar_sec ${kar_sec} no encontrado en compra ${fac_nro}`);
        }

        const detalleOriginal = resultDetalleOriginal.recordset[0];
        const art_sec = detalleOriginal.art_sec;
        const cantidad_original = parseFloat(detalleOriginal.kar_uni);
        const costo_original = parseFloat(detalleOriginal.kar_pre);

        // Determinar nuevos valores (usar original si no se proporciona)
        const cantidad_nueva = cantidad !== undefined ? parseFloat(cantidad) : cantidad_original;
        const costo_nuevo = costo_unitario !== undefined ? parseFloat(costo_unitario) : costo_original;

        // Si no hay cambios, saltar
        if (cantidad_nueva === cantidad_original && costo_nuevo === costo_original) {
          continue;
        }

        // 3.2 Obtener estado actual del artículo
        const resultArticulo = await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .query(`
            SELECT
              ISNULL(ad.art_bod_cos_cat, 0) AS costo_actual,
              ISNULL(ve.existencia, 0) AS existencia_actual
            FROM dbo.articulos a
            LEFT JOIN dbo.articulosdetalle ad
              ON ad.art_sec = a.art_sec AND ad.bod_sec = '1' AND ad.lis_pre_cod = 1
            LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
            WHERE a.art_sec = @art_sec
          `);

        if (resultArticulo.recordset.length === 0) {
          throw new Error(`Artículo ${art_sec} no encontrado`);
        }

        const { costo_actual, existencia_actual } = resultArticulo.recordset[0];
        const costo_actual_float = parseFloat(costo_actual);
        const existencia_actual_float = parseFloat(existencia_actual);

        // 3.3 REVERSAR el efecto de la compra original
        // Fórmula inversa del costo promedio:
        // Si: Costo_Actual = (Valor_Anterior + Valor_Compra_Original) / (Existencia_Actual)
        // Entonces: Valor_Anterior = (Costo_Actual * Existencia_Actual) - Valor_Compra_Original
        // Y: Costo_Anterior = Valor_Anterior / (Existencia_Actual - Cantidad_Original)

        const valor_actual_total = costo_actual_float * existencia_actual_float;
        const valor_compra_original = costo_original * cantidad_original;
        const valor_sin_compra_original = valor_actual_total - valor_compra_original;
        const existencia_sin_compra_original = existencia_actual_float - cantidad_original;

        // 3.4 APLICAR el efecto de la compra corregida
        const valor_compra_nueva = costo_nuevo * cantidad_nueva;
        const valor_con_compra_nueva = valor_sin_compra_original + valor_compra_nueva;
        const existencia_con_compra_nueva = existencia_sin_compra_original + cantidad_nueva;

        let costo_promedio_nuevo;
        if (existencia_con_compra_nueva <= 0) {
          costo_promedio_nuevo = 0;
        } else {
          costo_promedio_nuevo = valor_con_compra_nueva / existencia_con_compra_nueva;
        }

        // Redondear a 2 decimales
        costo_promedio_nuevo = Math.round(costo_promedio_nuevo * 100) / 100;

        // 3.5 Actualizar facturakardes
        await transaction.request()
          .input('fac_sec', sql.Decimal(12, 0), fac_sec)
          .input('kar_sec', sql.Int, kar_sec)
          .input('kar_uni', sql.Decimal(17, 2), cantidad_nueva)
          .input('kar_pre', sql.Decimal(17, 2), costo_nuevo)
          .input('kar_pre_pub', sql.Decimal(17, 2), costo_nuevo)
          .input('kar_total', sql.Decimal(17, 2), cantidad_nueva * costo_nuevo)
          .query(`
            UPDATE dbo.facturakardes
            SET kar_uni = @kar_uni,
                kar_pre = @kar_pre,
                kar_pre_pub = @kar_pre_pub,
                kar_total = @kar_total
            WHERE fac_sec = @fac_sec AND kar_sec = @kar_sec
          `);

        // 3.6 Actualizar costo promedio en articulosdetalle
        await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .input('nuevo_costo', sql.Decimal(17, 2), costo_promedio_nuevo)
          .query(`
            UPDATE dbo.articulosdetalle
            SET art_bod_cos_cat = @nuevo_costo
            WHERE art_sec = @art_sec AND bod_sec = '1' AND lis_pre_cod = 1
          `);

        // 3.7 Registrar en historial de costos
        await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .input('fac_sec', sql.Decimal(12, 0), fac_sec)
          .input('cantidad_antes', sql.Decimal(17, 2), existencia_actual_float)
          .input('costo_antes', sql.Decimal(17, 2), costo_actual_float)
          .input('valor_antes', sql.Decimal(17, 2), valor_actual_total)
          .input('cantidad_mov', sql.Decimal(17, 2), cantidad_nueva - cantidad_original)
          .input('costo_mov', sql.Decimal(17, 2), costo_nuevo)
          .input('valor_mov', sql.Decimal(17, 2), valor_compra_nueva - valor_compra_original)
          .input('cantidad_despues', sql.Decimal(17, 2), existencia_con_compra_nueva)
          .input('costo_despues', sql.Decimal(17, 2), costo_promedio_nuevo)
          .input('valor_despues', sql.Decimal(17, 2), valor_con_compra_nueva)
          .input('usu_cod', sql.VarChar(100), datosActualizacion.usu_cod)
          .input('observaciones', sql.VarChar(500),
            `AJUSTE ${fac_nro} kar_sec ${kar_sec}: ` +
            `${cantidad_original}→${cantidad_nueva} unids, ` +
            `$${costo_original}→$${costo_nuevo} c/u`
          )
          .query(`
            INSERT INTO dbo.historial_costos (
              hc_art_sec, hc_fac_sec, hc_fecha, hc_tipo_mov,
              hc_cantidad_antes, hc_costo_antes, hc_valor_antes,
              hc_cantidad_mov, hc_costo_mov, hc_valor_mov,
              hc_cantidad_despues, hc_costo_despues, hc_valor_despues,
              hc_usu_cod, hc_observaciones
            ) VALUES (
              @art_sec, @fac_sec, GETDATE(), 'AJUSTE_MANUAL',
              @cantidad_antes, @costo_antes, @valor_antes,
              @cantidad_mov, @costo_mov, @valor_mov,
              @cantidad_despues, @costo_despues, @valor_despues,
              @usu_cod, @observaciones
            )
          `);

        detallesActualizados.push({
          kar_sec,
          art_sec,
          cantidad_original,
          cantidad_nueva,
          costo_original,
          costo_nuevo,
          costo_promedio_anterior: costo_actual_float,
          costo_promedio_nuevo
        });
      }
    }

    // 3B. INSERTAR DETALLES NUEVOS (si se proporcionaron)
    const detallesNuevosInsertados = [];

    if (datosActualizacion.detalles_nuevos && datosActualizacion.detalles_nuevos.length > 0) {
      // Obtener el max kar_sec actual para esta compra
      const resultMaxKarSec = await transaction.request()
        .input('fac_sec', sql.Decimal(12, 0), fac_sec)
        .query(`
          SELECT ISNULL(MAX(kar_sec), 0) AS max_kar_sec
          FROM dbo.facturakardes
          WHERE fac_sec = @fac_sec
        `);

      let siguienteKarSec = resultMaxKarSec.recordset[0].max_kar_sec + 1;

      for (const detalleNuevo of datosActualizacion.detalles_nuevos) {
        const { art_sec, cantidad, costo_unitario } = detalleNuevo;
        const cantidadFloat = parseFloat(cantidad);
        const costoFloat = parseFloat(costo_unitario);
        const kar_sec = siguienteKarSec;

        // Validar que el artículo no esté ya en esta compra
        const resultExiste = await transaction.request()
          .input('fac_sec_check', sql.Decimal(12, 0), fac_sec)
          .input('art_sec_check', sql.VarChar(30), art_sec)
          .query(`
            SELECT kar_sec FROM dbo.facturakardes
            WHERE fac_sec = @fac_sec_check AND art_sec = @art_sec_check
          `);

        if (resultExiste.recordset.length > 0) {
          throw new Error(`Artículo ${art_sec} ya existe en compra ${fac_nro} (kar_sec ${resultExiste.recordset[0].kar_sec}). Use detalles para actualizarlo.`);
        }

        // Calcular nuevo costo promedio
        const calculoCosto = await calcularCostoPromedio(
          art_sec,
          cantidadFloat,
          costoFloat,
          transaction
        );

        // Insertar en facturakardes
        await transaction.request()
          .input('fac_sec', sql.Decimal(12, 0), fac_sec)
          .input('kar_sec', sql.Int, kar_sec)
          .input('art_sec', sql.VarChar(30), art_sec)
          .input('kar_uni', sql.Decimal(17, 2), cantidadFloat)
          .input('kar_pre', sql.Decimal(17, 2), costoFloat)
          .input('kar_pre_pub', sql.Decimal(17, 2), costoFloat)
          .input('kar_total', sql.Decimal(17, 2), cantidadFloat * costoFloat)
          .input('kar_nat', sql.Char(1), '+')
          .input('kar_bod_sec', sql.VarChar(16), '1')
          .query(`
            INSERT INTO dbo.facturakardes (
              fac_sec, kar_sec, art_sec,
              kar_uni, kar_pre, kar_pre_pub, kar_total,
              kar_nat, kar_bod_sec
            ) VALUES (
              @fac_sec, @kar_sec, @art_sec,
              @kar_uni, @kar_pre, @kar_pre_pub, @kar_total,
              @kar_nat, @kar_bod_sec
            )
          `);

        // Actualizar costo promedio en articulosdetalle
        await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .input('nuevo_costo', sql.Decimal(17, 2), calculoCosto.costo_nuevo)
          .query(`
            UPDATE dbo.articulosdetalle
            SET art_bod_cos_cat = @nuevo_costo
            WHERE art_sec = @art_sec AND bod_sec = '1' AND lis_pre_cod = 1
          `);

        // Registrar en historial de costos
        await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .input('fac_sec', sql.Decimal(12, 0), fac_sec)
          .input('cantidad_antes', sql.Decimal(17, 2), calculoCosto.existencia_anterior)
          .input('costo_antes', sql.Decimal(17, 2), calculoCosto.costo_anterior)
          .input('valor_antes', sql.Decimal(17, 2), calculoCosto.valor_actual)
          .input('cantidad_mov', sql.Decimal(17, 2), cantidadFloat)
          .input('costo_mov', sql.Decimal(17, 2), costoFloat)
          .input('valor_mov', sql.Decimal(17, 2), cantidadFloat * costoFloat)
          .input('cantidad_despues', sql.Decimal(17, 2), calculoCosto.existencia_nueva)
          .input('costo_despues', sql.Decimal(17, 2), calculoCosto.costo_nuevo)
          .input('valor_despues', sql.Decimal(17, 2), calculoCosto.costo_nuevo * calculoCosto.existencia_nueva)
          .input('usu_cod', sql.VarChar(100), datosActualizacion.usu_cod)
          .input('observaciones', sql.VarChar(500),
            `Compra ${fac_nro} (edición): ${cantidadFloat} unids a $${costoFloat}`
          )
          .query(`
            INSERT INTO dbo.historial_costos (
              hc_art_sec, hc_fac_sec, hc_fecha, hc_tipo_mov,
              hc_cantidad_antes, hc_costo_antes, hc_valor_antes,
              hc_cantidad_mov, hc_costo_mov, hc_valor_mov,
              hc_cantidad_despues, hc_costo_despues, hc_valor_despues,
              hc_usu_cod, hc_observaciones
            ) VALUES (
              @art_sec, @fac_sec, GETDATE(), 'COMPRA',
              @cantidad_antes, @costo_antes, @valor_antes,
              @cantidad_mov, @costo_mov, @valor_mov,
              @cantidad_despues, @costo_despues, @valor_despues,
              @usu_cod, @observaciones
            )
          `);

        detallesNuevosInsertados.push({
          kar_sec,
          art_sec,
          cantidad: cantidadFloat,
          costo_unitario: costoFloat,
          total: cantidadFloat * costoFloat,
          costo_promedio_anterior: calculoCosto.costo_anterior,
          costo_promedio_nuevo: calculoCosto.costo_nuevo
        });

        siguienteKarSec++;
      }

      // Actualizar total de la factura
      await transaction.request()
        .input('fac_sec', sql.Decimal(12, 0), fac_sec)
        .query(`
          UPDATE dbo.factura
          SET fac_total_woo = (
            SELECT ISNULL(SUM(kar_total), 0)
            FROM dbo.facturakardes
            WHERE fac_sec = @fac_sec
          )
          WHERE fac_sec = @fac_sec
        `);
    }

    // 4. ACTUALIZAR ENCABEZADO (si se proporcionaron campos)
    const camposActualizables = [];
    const request = transaction.request();

    if (datosActualizacion.fac_fec !== undefined) {
      camposActualizables.push('fac_fec = @fac_fec');
      request.input('fac_fec', sql.DateTime, datosActualizacion.fac_fec);
    }

    if (datosActualizacion.nit_sec !== undefined) {
      // Validar que el proveedor existe
      const resultProveedor = await transaction.request()
        .input('nit_sec', sql.VarChar(16), datosActualizacion.nit_sec)
        .query(`SELECT nit_sec FROM dbo.nit WHERE nit_sec = @nit_sec`);

      if (resultProveedor.recordset.length === 0) {
        throw new Error(`Proveedor ${datosActualizacion.nit_sec} no encontrado`);
      }

      camposActualizables.push('nit_sec = @nit_sec');
      request.input('nit_sec', sql.VarChar(16), datosActualizacion.nit_sec);
    }

    if (datosActualizacion.fac_obs !== undefined) {
      camposActualizables.push('fac_obs = @fac_obs');
      request.input('fac_obs', sql.VarChar(1024), datosActualizacion.fac_obs);
    }

    if (datosActualizacion.fac_est_fac !== undefined) {
      // Validar estado válido
      if (!['A', 'I', 'C'].includes(datosActualizacion.fac_est_fac)) {
        throw new Error('Estado inválido. Usar A (Activa), I (Inactiva) o C (Cancelada)');
      }

      camposActualizables.push('fac_est_fac = @fac_est_fac');
      request.input('fac_est_fac', sql.Char(1), datosActualizacion.fac_est_fac);
    }

    // Si hay campos del encabezado para actualizar
    if (camposActualizables.length > 0) {
      // Agregar campos de auditoría
      camposActualizables.push('fac_fch_mod = GETDATE()');
      camposActualizables.push('fac_usu_cod_mod = @fac_usu_cod_mod');
      request.input('fac_usu_cod_mod', sql.VarChar(100), datosActualizacion.usu_cod);

      // Ejecutar UPDATE
      request.input('fac_nro', sql.VarChar(15), fac_nro);
      const updateQuery = `
        UPDATE dbo.factura
        SET ${camposActualizables.join(', ')}
        WHERE fac_nro = @fac_nro
      `;

      await request.query(updateQuery);
    }

    // Validar que se actualizó algo
    if (camposActualizables.length === 0 && detallesActualizados.length === 0 && detallesNuevosInsertados.length === 0) {
      throw new Error('No se proporcionaron campos o detalles para actualizar');
    }

    // 5. Commit
    await transaction.commit();

    return {
      success: true,
      fac_nro,
      message: 'Compra actualizada exitosamente',
      encabezado_actualizado: camposActualizables.length > 0,
      campos_actualizados: camposActualizables.filter(c =>
        !c.includes('fac_fch_mod') && !c.includes('fac_usu_cod_mod')
      ),
      detalles_actualizados: detallesActualizados,
      detalles_nuevos_insertados: detallesNuevosInsertados
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  calcularCostoPromedio,
  generarNumeroCompra,
  generarFacSec,
  registrarCompra,
  actualizarCompra,
  obtenerHistorialCompras,
  obtenerDetalleCompra,
  obtenerValorizadoInventario,
  obtenerArticulosSinCosto,
  obtenerValorizadoPorCategorias,
  obtenerValorizadoPorSubcategorias,
  obtenerArticulosPorSubcategoria
};
