/**
 * Modelo: Reportes de Rentabilidad
 * Fecha: 2026-02-17
 * Descripción: Consultas y análisis de rentabilidad de productos
 */

const { poolPromise, sql } = require('../db');

/**
 * Obtiene reporte de rentabilidad de productos
 *
 * @param {object} filtros - Filtros de búsqueda
 * @param {string} filtros.clasificacion - ALTA, MEDIA, BAJA, MINIMA, PERDIDA
 * @param {number} filtros.rentabilidad_min - Rentabilidad mínima (%)
 * @param {number} filtros.rentabilidad_max - Rentabilidad máxima (%)
 * @param {string} filtros.inv_gru_cod - Código de grupo
 * @param {string} filtros.inv_sub_gru_cod - Código de subgrupo
 * @param {boolean} filtros.solo_con_stock - Solo productos con existencia
 * @param {string} filtros.ordenar_por - rentabilidad_desc, rentabilidad_asc, utilidad_desc
 * @param {number} filtros.limit - Límite de registros
 * @param {number} filtros.offset - Offset para paginación
 * @returns {Promise<object>} Reporte de rentabilidad
 */
const obtenerReporteRentabilidad = async (filtros = {}) => {
  try {
    const pool = await poolPromise;

    let query = `
      WITH RentabilidadArticulos AS (
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          ig.inv_gru_nom AS categoria,
          isg.inv_sub_gru_nom AS subcategoria,

          -- Precios y costos
          ad.art_bod_pre AS precio_detal,
          ad.art_bod_cos_cat AS costo_promedio,

          -- Rentabilidad (usar columnas calculadas si existen, sino calcular)
          CASE
            WHEN ad.art_bod_pre > 0 AND ad.art_bod_cos_cat IS NOT NULL
            THEN CAST(((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 AS DECIMAL(5,2))
            ELSE 0
          END AS rentabilidad_detal,

          CASE
            WHEN ad.art_bod_cos_cat > 0 AND ad.art_bod_pre IS NOT NULL
            THEN CAST(((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_cos_cat) * 100 AS DECIMAL(5,2))
            ELSE 0
          END AS margen_ganancia_detal,

          CASE
            WHEN ad.art_bod_pre IS NOT NULL AND ad.art_bod_cos_cat IS NOT NULL
            THEN CAST(ad.art_bod_pre - ad.art_bod_cos_cat AS DECIMAL(17,2))
            ELSE 0
          END AS utilidad_bruta_detal,

          -- Stock y valorización
          ISNULL(ve.existencia, 0) AS existencia,
          ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0) AS valor_inventario_costo,
          ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_pre, 0) AS valor_inventario_venta,
          ISNULL(ve.existencia, 0) * (ISNULL(ad.art_bod_pre, 0) - ISNULL(ad.art_bod_cos_cat, 0)) AS utilidad_potencial,

          -- Clasificación
          CASE
            WHEN ad.art_bod_pre > 0 AND ad.art_bod_cos_cat IS NOT NULL THEN
              CASE
                WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 40 THEN 'ALTA'
                WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 20 THEN 'MEDIA'
                WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 10 THEN 'BAJA'
                WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 0 THEN 'MINIMA'
                ELSE 'PERDIDA'
              END
            ELSE 'N/A'
          END AS clasificacion_rentabilidad

        FROM dbo.articulos a
        INNER JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
          AND ad.lis_pre_cod = 1 AND ad.bod_sec = '1'
        INNER JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        INNER JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
        LEFT JOIN dbo.vwExistencias ve ON a.art_sec = ve.art_sec
        WHERE 1 = 1
          AND ad.art_bod_cos_cat > 0  -- Solo productos con costo definido
    `;

    const request = pool.request();

    // Filtro por clasificación
    if (filtros.clasificacion) {
      const clasificaciones = {
        'ALTA': `((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 40`,
        'MEDIA': `((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 20 AND ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 < 40`,
        'BAJA': `((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 10 AND ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 < 20`,
        'MINIMA': `((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 0 AND ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 < 10`,
        'PERDIDA': `((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 < 0`
      };

      if (clasificaciones[filtros.clasificacion]) {
        query += ` AND ${clasificaciones[filtros.clasificacion]}`;
      }
    }

    // Filtro por rango de rentabilidad
    if (filtros.rentabilidad_min !== undefined) {
      query += ` AND ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= @rentabilidad_min`;
      request.input('rentabilidad_min', sql.Decimal(5, 2), filtros.rentabilidad_min);
    }

    if (filtros.rentabilidad_max !== undefined) {
      query += ` AND ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 <= @rentabilidad_max`;
      request.input('rentabilidad_max', sql.Decimal(5, 2), filtros.rentabilidad_max);
    }

    // Filtro por categoría
    if (filtros.inv_gru_cod) {
      query += ` AND ig.inv_gru_cod = @inv_gru_cod`;
      request.input('inv_gru_cod', sql.VarChar(16), filtros.inv_gru_cod);
    }

    // Filtro por subcategoría
    if (filtros.inv_sub_gru_cod) {
      query += ` AND isg.inv_sub_gru_cod = @inv_sub_gru_cod`;
      request.input('inv_sub_gru_cod', sql.VarChar(16), filtros.inv_sub_gru_cod);
    }

    // Filtro por stock
    if (filtros.solo_con_stock) {
      query += ` AND ISNULL(ve.existencia, 0) > 0`;
    }

    query += `
      )
      SELECT
        *,
        -- Totales globales
        (SELECT COUNT(*) FROM RentabilidadArticulos) AS total_registros,
        (SELECT SUM(valor_inventario_costo) FROM RentabilidadArticulos) AS total_valor_costo,
        (SELECT SUM(valor_inventario_venta) FROM RentabilidadArticulos) AS total_valor_venta,
        (SELECT SUM(utilidad_potencial) FROM RentabilidadArticulos) AS total_utilidad_potencial
      FROM RentabilidadArticulos
    `;

    // Ordenamiento
    const ordenamientos = {
      'rentabilidad_desc': 'rentabilidad_detal DESC',
      'rentabilidad_asc': 'rentabilidad_detal ASC',
      'utilidad_desc': 'utilidad_bruta_detal DESC',
      'utilidad_potencial_desc': 'utilidad_potencial DESC',
      'valor_inventario_desc': 'valor_inventario_venta DESC'
    };

    const ordenar = ordenamientos[filtros.ordenar_por] || 'rentabilidad_detal DESC';
    query += ` ORDER BY ${ordenar}`;

    // Paginación
    const limit = Math.min(parseInt(filtros.limit) || 100, 1000);
    const offset = parseInt(filtros.offset) || 0;

    query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    const result = await request.query(query);

    // Calcular resumen
    const articulos = result.recordset;
    const resumen = articulos.length > 0 ? {
      total_registros: articulos[0].total_registros,
      total_valor_costo: parseFloat(articulos[0].total_valor_costo || 0),
      total_valor_venta: parseFloat(articulos[0].total_valor_venta || 0),
      total_utilidad_potencial: parseFloat(articulos[0].total_utilidad_potencial || 0),
      rentabilidad_promedio: articulos.length > 0
        ? parseFloat((articulos.reduce((sum, a) => sum + parseFloat(a.rentabilidad_detal), 0) / articulos.length).toFixed(2))
        : 0
    } : {
      total_registros: 0,
      total_valor_costo: 0,
      total_valor_venta: 0,
      total_utilidad_potencial: 0,
      rentabilidad_promedio: 0
    };

    return {
      articulos: articulos.map(a => ({
        art_sec: a.art_sec,
        art_cod: a.art_cod,
        art_nom: a.art_nom,
        categoria: a.categoria,
        subcategoria: a.subcategoria,
        precio_detal: parseFloat(a.precio_detal || 0),
        costo_promedio: parseFloat(a.costo_promedio || 0),
        rentabilidad_detal: parseFloat(a.rentabilidad_detal || 0),
        margen_ganancia_detal: parseFloat(a.margen_ganancia_detal || 0),
        utilidad_bruta_detal: parseFloat(a.utilidad_bruta_detal || 0),
        existencia: parseFloat(a.existencia || 0),
        valor_inventario_costo: parseFloat(a.valor_inventario_costo || 0),
        valor_inventario_venta: parseFloat(a.valor_inventario_venta || 0),
        utilidad_potencial: parseFloat(a.utilidad_potencial || 0),
        clasificacion_rentabilidad: a.clasificacion_rentabilidad
      })),
      resumen,
      paginacion: {
        limit,
        offset,
        total: resumen.total_registros
      }
    };

  } catch (error) {
    console.error('Error en obtenerReporteRentabilidad:', error);
    throw error;
  }
};

/**
 * Obtiene resumen de rentabilidad por clasificación
 */
const obtenerResumenPorClasificacion = async () => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT
        CASE
          WHEN ad.art_bod_pre > 0 AND ad.art_bod_cos_cat IS NOT NULL THEN
            CASE
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 40 THEN 'ALTA'
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 20 THEN 'MEDIA'
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 10 THEN 'BAJA'
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 0 THEN 'MINIMA'
              ELSE 'PERDIDA'
            END
          ELSE 'N/A'
        END AS clasificacion,
        COUNT(*) AS cantidad_productos,
        AVG(CASE
          WHEN ad.art_bod_pre > 0 AND ad.art_bod_cos_cat IS NOT NULL
          THEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100
          ELSE 0
        END) AS rentabilidad_promedio,
        SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_cos_cat, 0)) AS valor_inventario_costo,
        SUM(ISNULL(ve.existencia, 0) * ISNULL(ad.art_bod_pre, 0)) AS valor_inventario_venta,
        SUM(ISNULL(ve.existencia, 0) * (ISNULL(ad.art_bod_pre, 0) - ISNULL(ad.art_bod_cos_cat, 0))) AS utilidad_potencial
      FROM dbo.articulosdetalle ad
      INNER JOIN dbo.articulos a ON a.art_sec = ad.art_sec
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      WHERE ad.lis_pre_cod = 1
        AND ad.bod_sec = '1'
        AND ad.art_bod_cos_cat > 0
      GROUP BY
        CASE
          WHEN ad.art_bod_pre > 0 AND ad.art_bod_cos_cat IS NOT NULL THEN
            CASE
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 40 THEN 'ALTA'
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 20 THEN 'MEDIA'
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 10 THEN 'BAJA'
              WHEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre) * 100 >= 0 THEN 'MINIMA'
              ELSE 'PERDIDA'
            END
          ELSE 'N/A'
        END
      HAVING COUNT(*) > 0
      ORDER BY
        CASE clasificacion
          WHEN 'ALTA' THEN 1
          WHEN 'MEDIA' THEN 2
          WHEN 'BAJA' THEN 3
          WHEN 'MINIMA' THEN 4
          WHEN 'PERDIDA' THEN 5
          WHEN 'N/A' THEN 6
        END
    `);

    return result.recordset.map(r => ({
      clasificacion: r.clasificacion,
      cantidad_productos: r.cantidad_productos,
      rentabilidad_promedio: parseFloat(r.rentabilidad_promedio || 0).toFixed(2),
      valor_inventario_costo: parseFloat(r.valor_inventario_costo || 0),
      valor_inventario_venta: parseFloat(r.valor_inventario_venta || 0),
      utilidad_potencial: parseFloat(r.utilidad_potencial || 0)
    }));

  } catch (error) {
    console.error('Error en obtenerResumenPorClasificacion:', error);
    throw error;
  }
};

module.exports = {
  obtenerReporteRentabilidad,
  obtenerResumenPorClasificacion
};
