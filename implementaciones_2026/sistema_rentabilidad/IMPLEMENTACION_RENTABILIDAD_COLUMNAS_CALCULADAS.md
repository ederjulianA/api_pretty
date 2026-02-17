# Implementación: Sistema de Rentabilidad con Columnas Calculadas

**Fecha:** 2026-02-17
**Versión:** 1.0
**Método:** Columnas Calculadas Persistidas (SQL Server Computed Columns)
**Estado:** 📋 Pendiente de Implementación

---

## 📋 Resumen Ejecutivo

Implementación de cálculos automáticos de rentabilidad y margen de ganancia utilizando **columnas calculadas persistidas** de SQL Server, que mantienen los valores sincronizados automáticamente sin requerir lógica adicional en el backend.

---

## 🎯 Objetivos

1. ✅ Mostrar rentabilidad en listado de artículos
2. ✅ Generar reportes de análisis de rentabilidad
3. ✅ Identificar productos bajo costo o con pérdida
4. ✅ Calcular rentabilidad al detal y al mayor
5. ✅ Mantener valores siempre sincronizados
6. ✅ Optimizar performance de queries

---

## 📊 Fórmulas de Negocio

### Rentabilidad (% sobre precio de venta)
```
Rentabilidad = ((Precio Venta - Costo Promedio) / Precio Venta) × 100
```

**Interpretación:**
- 40% = De cada $100 vendidos, $40 son ganancia
- Usado para estrategia comercial y análisis de precios

### Margen de Ganancia (% sobre costo)
```
Margen = ((Precio Venta - Costo Promedio) / Costo Promedio) × 100
```

**Interpretación:**
- 66.67% = El precio de venta es 66.67% mayor que el costo
- Usado para análisis financiero y fijación de precios

### Ejemplo Práctico
```
Costo Promedio: $30,000
Precio Detal: $50,000
Precio Mayor: $45,000

Rentabilidad Detal = ((50,000 - 30,000) / 50,000) × 100 = 40%
Rentabilidad Mayor = ((45,000 - 30,000) / 45,000) × 100 = 33.33%

Margen Detal = ((50,000 - 30,000) / 30,000) × 100 = 66.67%
Margen Mayor = ((45,000 - 30,000) / 30,000) × 100 = 50%
```

---

## 🔧 Implementación SQL

### FASE 1: Crear Columnas Calculadas en `articulosdetalle`

```sql
-- ============================================================================
-- Script: Agregar Columnas Calculadas de Rentabilidad
-- Fecha: 2026-02-17
-- Descripción: Agrega columnas calculadas persistidas para rentabilidad y margen
-- ============================================================================

USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

-- Verificar que la tabla existe
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'articulosdetalle')
BEGIN
    PRINT '❌ Error: Tabla articulosdetalle no existe'
    RETURN
END
GO

PRINT '📋 Iniciando creación de columnas calculadas de rentabilidad...'
GO

-- ============================================================================
-- 1. RENTABILIDAD AL DETAL (% sobre precio de venta)
-- ============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'rentabilidad_detal'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle ADD
        rentabilidad_detal AS (
            CASE
                WHEN art_bod_pre > 0 AND art_bod_cos_cat IS NOT NULL
                THEN CAST(
                    ((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100
                    AS DECIMAL(5,2)
                )
                ELSE 0
            END
        ) PERSISTED;

    PRINT '✅ Columna rentabilidad_detal creada exitosamente'
END
ELSE
BEGIN
    PRINT '⚠️  Columna rentabilidad_detal ya existe'
END
GO

-- ============================================================================
-- 2. MARGEN DE GANANCIA AL DETAL (% sobre costo)
-- ============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'margen_ganancia_detal'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle ADD
        margen_ganancia_detal AS (
            CASE
                WHEN art_bod_cos_cat > 0 AND art_bod_pre IS NOT NULL
                THEN CAST(
                    ((art_bod_pre - art_bod_cos_cat) / art_bod_cos_cat) * 100
                    AS DECIMAL(5,2)
                )
                ELSE 0
            END
        ) PERSISTED;

    PRINT '✅ Columna margen_ganancia_detal creada exitosamente'
END
ELSE
BEGIN
    PRINT '⚠️  Columna margen_ganancia_detal ya existe'
END
GO

-- ============================================================================
-- 3. UTILIDAD BRUTA (Ganancia en pesos)
-- ============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'utilidad_bruta_detal'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle ADD
        utilidad_bruta_detal AS (
            CASE
                WHEN art_bod_pre IS NOT NULL AND art_bod_cos_cat IS NOT NULL
                THEN CAST(
                    art_bod_pre - art_bod_cos_cat
                    AS DECIMAL(17,2)
                )
                ELSE 0
            END
        ) PERSISTED;

    PRINT '✅ Columna utilidad_bruta_detal creada exitosamente'
END
ELSE
BEGIN
    PRINT '⚠️  Columna utilidad_bruta_detal ya existe'
END
GO

-- ============================================================================
-- 4. CREAR ÍNDICES PARA OPTIMIZAR REPORTES
-- ============================================================================

-- Índice para ordenar por rentabilidad (productos más rentables)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'IX_articulosdetalle_rentabilidad_detal'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulosdetalle_rentabilidad_detal
    ON dbo.articulosdetalle (rentabilidad_detal DESC)
    INCLUDE (art_sec, art_bod_pre, art_bod_cos_cat, bod_sec, lis_pre_cod)
    WHERE lis_pre_cod = 1 AND bod_sec = '1';

    PRINT '✅ Índice IX_articulosdetalle_rentabilidad_detal creado exitosamente'
END
ELSE
BEGIN
    PRINT '⚠️  Índice IX_articulosdetalle_rentabilidad_detal ya existe'
END
GO

-- Índice para detectar productos con pérdida o baja rentabilidad
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'IX_articulosdetalle_rentabilidad_baja'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulosdetalle_rentabilidad_baja
    ON dbo.articulosdetalle (rentabilidad_detal ASC)
    INCLUDE (art_sec, art_bod_pre, art_bod_cos_cat)
    WHERE lis_pre_cod = 1 AND bod_sec = '1' AND rentabilidad_detal < 20;

    PRINT '✅ Índice IX_articulosdetalle_rentabilidad_baja creado exitosamente'
END
ELSE
BEGIN
    PRINT '⚠️  Índice IX_articulosdetalle_rentabilidad_baja ya existe'
END
GO

PRINT ''
PRINT '========================================='
PRINT '✅ SCRIPT COMPLETADO EXITOSAMENTE'
PRINT '========================================='
PRINT ''
PRINT 'Columnas creadas:'
PRINT '  • rentabilidad_detal (DECIMAL(5,2))'
PRINT '  • margen_ganancia_detal (DECIMAL(5,2))'
PRINT '  • utilidad_bruta_detal (DECIMAL(17,2))'
PRINT ''
PRINT 'Índices creados:'
PRINT '  • IX_articulosdetalle_rentabilidad_detal'
PRINT '  • IX_articulosdetalle_rentabilidad_baja'
PRINT ''
GO

-- ============================================================================
-- 5. VERIFICACIÓN DE COLUMNAS CREADAS
-- ============================================================================

SELECT
    name AS Columna,
    TYPE_NAME(user_type_id) AS Tipo,
    is_computed AS EsCalculada,
    is_persisted AS EsPersistida
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
AND name IN ('rentabilidad_detal', 'margen_ganancia_detal', 'utilidad_bruta_detal')
ORDER BY column_id;
GO

-- ============================================================================
-- 6. QUERY DE PRUEBA
-- ============================================================================

PRINT 'Ejecutando query de prueba...'
GO

SELECT TOP 10
    a.art_cod,
    a.art_nom,
    ad.art_bod_pre AS precio_detal,
    ad.art_bod_cos_cat AS costo_promedio,
    ad.rentabilidad_detal,
    ad.margen_ganancia_detal,
    ad.utilidad_bruta_detal,
    CASE
        WHEN ad.rentabilidad_detal >= 40 THEN 'ALTA'
        WHEN ad.rentabilidad_detal >= 20 THEN 'MEDIA'
        WHEN ad.rentabilidad_detal >= 10 THEN 'BAJA'
        WHEN ad.rentabilidad_detal >= 0 THEN 'MINIMA'
        ELSE 'PERDIDA'
    END AS clasificacion
FROM dbo.articulosdetalle ad
INNER JOIN dbo.articulos a ON a.art_sec = ad.art_sec
WHERE ad.lis_pre_cod = 1
  AND ad.bod_sec = '1'
  AND ad.art_bod_cos_cat > 0
ORDER BY ad.rentabilidad_detal DESC;
GO
```

---

## 🔄 FASE 2: Actualizar Endpoint `/api/articulos`

### Modificar `models/articulosModel.js`

```javascript
// En la función getArticulos()
const query = `
WITH ArticulosBase AS (
    SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        a.art_url_img_servi,
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS sub_categoria,

        -- Precios y costos
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        ISNULL(ad1.art_bod_cos_cat, 0) AS costo_promedio,

        -- ✨ NUEVO: Rentabilidad y Margen (columnas calculadas)
        ISNULL(ad1.rentabilidad_detal, 0) AS rentabilidad_detal,
        ISNULL(ad1.margen_ganancia_detal, 0) AS margen_ganancia_detal,
        ISNULL(ad1.utilidad_bruta_detal, 0) AS utilidad_bruta_detal,

        -- Rentabilidad al mayor (calculada en query porque ad2 no tiene columna calculada)
        CASE
            WHEN ISNULL(ad2.art_bod_pre, 0) > 0 AND ISNULL(ad1.art_bod_cos_cat, 0) > 0
            THEN CAST(
                ((ad2.art_bod_pre - ad1.art_bod_cos_cat) / ad2.art_bod_pre) * 100
                AS DECIMAL(5,2)
            )
            ELSE 0
        END AS rentabilidad_mayor,

        -- Clasificación de rentabilidad
        CASE
            WHEN ISNULL(ad1.rentabilidad_detal, 0) >= 40 THEN 'ALTA'
            WHEN ISNULL(ad1.rentabilidad_detal, 0) >= 20 THEN 'MEDIA'
            WHEN ISNULL(ad1.rentabilidad_detal, 0) >= 10 THEN 'BAJA'
            WHEN ISNULL(ad1.rentabilidad_detal, 0) >= 0 THEN 'MINIMA'
            ELSE 'PERDIDA'
        END AS clasificacion_rentabilidad,

        -- Resto de campos existentes...
        ISNULL(e.existencia, 0) AS existencia,
        a.art_woo_sync_status,
        a.art_woo_sync_message,
        ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
        ISNULL(a.art_bundle, 'N') AS art_bundle
    FROM dbo.articulos a
        INNER JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        INNER JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
    WHERE 1 = 1
      AND (@codigo IS NULL OR a.art_cod LIKE @codigo+'%')
      AND (@nombre IS NULL OR a.art_nom LIKE '%' + @nombre + '%')
      AND (@inv_gru_cod IS NULL OR ig.inv_gru_cod = @inv_gru_cod)
      AND (@inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod = @inv_sub_gru_cod)
)
SELECT *
FROM ArticulosBase
ORDER BY CAST(art_sec AS INT) DESC
OFFSET (@PageNumber - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY
OPTION (RECOMPILE);
`;
```

---

## 📊 FASE 3: Crear Endpoint de Reportes de Rentabilidad

### Nuevo archivo: `models/rentabilidadModel.js`

```javascript
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

          -- Rentabilidad (columna calculada automática)
          ad.rentabilidad_detal,
          ad.margen_ganancia_detal,
          ad.utilidad_bruta_detal,

          -- Stock y valorización
          ISNULL(ve.existencia, 0) AS existencia,
          ISNULL(ve.existencia, 0) * ad.art_bod_cos_cat AS valor_inventario_costo,
          ISNULL(ve.existencia, 0) * ad.art_bod_pre AS valor_inventario_venta,
          ISNULL(ve.existencia, 0) * ad.utilidad_bruta_detal AS utilidad_potencial,

          -- Clasificación
          CASE
            WHEN ad.rentabilidad_detal >= 40 THEN 'ALTA'
            WHEN ad.rentabilidad_detal >= 20 THEN 'MEDIA'
            WHEN ad.rentabilidad_detal >= 10 THEN 'BAJA'
            WHEN ad.rentabilidad_detal >= 0 THEN 'MINIMA'
            ELSE 'PERDIDA'
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
        'ALTA': 'ad.rentabilidad_detal >= 40',
        'MEDIA': 'ad.rentabilidad_detal >= 20 AND ad.rentabilidad_detal < 40',
        'BAJA': 'ad.rentabilidad_detal >= 10 AND ad.rentabilidad_detal < 20',
        'MINIMA': 'ad.rentabilidad_detal >= 0 AND ad.rentabilidad_detal < 10',
        'PERDIDA': 'ad.rentabilidad_detal < 0'
      };

      if (clasificaciones[filtros.clasificacion]) {
        query += ` AND ${clasificaciones[filtros.clasificacion]}`;
      }
    }

    // Filtro por rango de rentabilidad
    if (filtros.rentabilidad_min !== undefined) {
      query += ` AND ad.rentabilidad_detal >= @rentabilidad_min`;
      request.input('rentabilidad_min', sql.Decimal(5, 2), filtros.rentabilidad_min);
    }

    if (filtros.rentabilidad_max !== undefined) {
      query += ` AND ad.rentabilidad_detal <= @rentabilidad_max`;
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
        ? articulos.reduce((sum, a) => sum + a.rentabilidad_detal, 0) / articulos.length
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
        precio_detal: parseFloat(a.precio_detal),
        costo_promedio: parseFloat(a.costo_promedio),
        rentabilidad_detal: parseFloat(a.rentabilidad_detal),
        margen_ganancia_detal: parseFloat(a.margen_ganancia_detal),
        utilidad_bruta_detal: parseFloat(a.utilidad_bruta_detal),
        existencia: parseFloat(a.existencia),
        valor_inventario_costo: parseFloat(a.valor_inventario_costo),
        valor_inventario_venta: parseFloat(a.valor_inventario_venta),
        utilidad_potencial: parseFloat(a.utilidad_potencial),
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
          WHEN ad.rentabilidad_detal >= 40 THEN 'ALTA'
          WHEN ad.rentabilidad_detal >= 20 THEN 'MEDIA'
          WHEN ad.rentabilidad_detal >= 10 THEN 'BAJA'
          WHEN ad.rentabilidad_detal >= 0 THEN 'MINIMA'
          ELSE 'PERDIDA'
        END AS clasificacion,
        COUNT(*) AS cantidad_productos,
        AVG(ad.rentabilidad_detal) AS rentabilidad_promedio,
        SUM(ISNULL(ve.existencia, 0) * ad.art_bod_cos_cat) AS valor_inventario_costo,
        SUM(ISNULL(ve.existencia, 0) * ad.art_bod_pre) AS valor_inventario_venta,
        SUM(ISNULL(ve.existencia, 0) * ad.utilidad_bruta_detal) AS utilidad_potencial
      FROM dbo.articulosdetalle ad
      INNER JOIN dbo.articulos a ON a.art_sec = ad.art_sec
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      WHERE ad.lis_pre_cod = 1
        AND ad.bod_sec = '1'
        AND ad.art_bod_cos_cat > 0
      GROUP BY
        CASE
          WHEN ad.rentabilidad_detal >= 40 THEN 'ALTA'
          WHEN ad.rentabilidad_detal >= 20 THEN 'MEDIA'
          WHEN ad.rentabilidad_detal >= 10 THEN 'BAJA'
          WHEN ad.rentabilidad_detal >= 0 THEN 'MINIMA'
          ELSE 'PERDIDA'
        END
      ORDER BY
        CASE clasificacion
          WHEN 'ALTA' THEN 1
          WHEN 'MEDIA' THEN 2
          WHEN 'BAJA' THEN 3
          WHEN 'MINIMA' THEN 4
          WHEN 'PERDIDA' THEN 5
        END
    `);

    return result.recordset.map(r => ({
      clasificacion: r.clasificacion,
      cantidad_productos: r.cantidad_productos,
      rentabilidad_promedio: parseFloat(r.rentabilidad_promedio).toFixed(2),
      valor_inventario_costo: parseFloat(r.valor_inventario_costo),
      valor_inventario_venta: parseFloat(r.valor_inventario_venta),
      utilidad_potencial: parseFloat(r.utilidad_potencial)
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
```

---

## 🎯 FASE 4: Crear Controlador y Rutas

### Nuevo archivo: `controllers/rentabilidadController.js`

```javascript
/**
 * Controlador: Reportes de Rentabilidad
 * Fecha: 2026-02-17
 */

const {
  obtenerReporteRentabilidad,
  obtenerResumenPorClasificacion
} = require('../models/rentabilidadModel');

/**
 * GET /api/reportes/rentabilidad
 * Obtiene reporte detallado de rentabilidad
 *
 * Query params:
 * - clasificacion: ALTA, MEDIA, BAJA, MINIMA, PERDIDA
 * - rentabilidad_min: número
 * - rentabilidad_max: número
 * - inv_gru_cod: código de grupo
 * - inv_sub_gru_cod: código de subgrupo
 * - solo_con_stock: true/false
 * - ordenar_por: rentabilidad_desc, rentabilidad_asc, utilidad_desc
 * - limit: número (default 100, max 1000)
 * - offset: número (default 0)
 */
const reporteRentabilidad = async (req, res) => {
  try {
    const filtros = {};

    // Validar clasificación
    if (req.query.clasificacion) {
      const clasificacionesValidas = ['ALTA', 'MEDIA', 'BAJA', 'MINIMA', 'PERDIDA'];
      const clasificacion = req.query.clasificacion.toUpperCase();

      if (!clasificacionesValidas.includes(clasificacion)) {
        return res.status(400).json({
          success: false,
          message: 'clasificacion debe ser: ALTA, MEDIA, BAJA, MINIMA o PERDIDA'
        });
      }

      filtros.clasificacion = clasificacion;
    }

    // Validar rangos de rentabilidad
    if (req.query.rentabilidad_min !== undefined) {
      const min = parseFloat(req.query.rentabilidad_min);
      if (isNaN(min)) {
        return res.status(400).json({
          success: false,
          message: 'rentabilidad_min debe ser un número'
        });
      }
      filtros.rentabilidad_min = min;
    }

    if (req.query.rentabilidad_max !== undefined) {
      const max = parseFloat(req.query.rentabilidad_max);
      if (isNaN(max)) {
        return res.status(400).json({
          success: false,
          message: 'rentabilidad_max debe ser un número'
        });
      }
      filtros.rentabilidad_max = max;
    }

    // Filtros adicionales
    if (req.query.inv_gru_cod) filtros.inv_gru_cod = req.query.inv_gru_cod;
    if (req.query.inv_sub_gru_cod) filtros.inv_sub_gru_cod = req.query.inv_sub_gru_cod;
    if (req.query.solo_con_stock) filtros.solo_con_stock = req.query.solo_con_stock === 'true';
    if (req.query.ordenar_por) filtros.ordenar_por = req.query.ordenar_por;

    filtros.limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    filtros.offset = parseInt(req.query.offset) || 0;

    const resultado = await obtenerReporteRentabilidad(filtros);

    res.status(200).json({
      success: true,
      data: resultado.articulos,
      resumen: resultado.resumen,
      paginacion: resultado.paginacion,
      filtros_aplicados: filtros
    });

  } catch (error) {
    console.error('Error en reporteRentabilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte de rentabilidad',
      error: error.message
    });
  }
};

/**
 * GET /api/reportes/rentabilidad/resumen
 * Obtiene resumen de rentabilidad por clasificación
 */
const resumenRentabilidad = async (req, res) => {
  try {
    const resultado = await obtenerResumenPorClasificacion();

    res.status(200).json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error('Error en resumenRentabilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando resumen de rentabilidad',
      error: error.message
    });
  }
};

module.exports = {
  reporteRentabilidad,
  resumenRentabilidad
};
```

### Nuevo archivo: `routes/rentabilidadRoutes.js`

```javascript
/**
 * Rutas: Reportes de Rentabilidad
 * Fecha: 2026-02-17
 */

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  reporteRentabilidad,
  resumenRentabilidad
} = require('../controllers/rentabilidadController');

// Reportes de rentabilidad
router.get('/rentabilidad', auth, reporteRentabilidad);
router.get('/rentabilidad/resumen', auth, resumenRentabilidad);

module.exports = router;
```

### Registrar rutas en `index.js`

```javascript
// Agregar después de las rutas de compras
const rentabilidadRoutes = require('./routes/rentabilidadRoutes');
app.use('/api/reportes', rentabilidadRoutes);
```

---

## 📖 Ejemplos de Uso

### 1. Obtener productos con alta rentabilidad

```bash
GET /api/reportes/rentabilidad?clasificacion=ALTA&limit=50&ordenar_por=rentabilidad_desc
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "art_cod": "LAB-001",
      "art_nom": "Labial Ruby Face Rojo",
      "categoria": "Maquillaje",
      "subcategoria": "Labiales",
      "precio_detal": 50000,
      "costo_promedio": 28000,
      "rentabilidad_detal": 44.00,
      "margen_ganancia_detal": 78.57,
      "utilidad_bruta_detal": 22000,
      "existencia": 15,
      "valor_inventario_costo": 420000,
      "valor_inventario_venta": 750000,
      "utilidad_potencial": 330000,
      "clasificacion_rentabilidad": "ALTA"
    }
  ],
  "resumen": {
    "total_registros": 234,
    "total_valor_costo": 12450000,
    "total_valor_venta": 21340000,
    "total_utilidad_potencial": 8890000,
    "rentabilidad_promedio": 42.35
  }
}
```

### 2. Detectar productos con pérdida

```bash
GET /api/reportes/rentabilidad?clasificacion=PERDIDA
```

### 3. Resumen general por clasificación

```bash
GET /api/reportes/rentabilidad/resumen
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "clasificacion": "ALTA",
      "cantidad_productos": 234,
      "rentabilidad_promedio": "42.35",
      "valor_inventario_costo": 12450000,
      "valor_inventario_venta": 21340000,
      "utilidad_potencial": 8890000
    },
    {
      "clasificacion": "MEDIA",
      "cantidad_productos": 567,
      "rentabilidad_promedio": "28.50",
      "valor_inventario_costo": 34200000,
      "valor_inventario_venta": 47800000,
      "utilidad_potencial": 13600000
    }
  ]
}
```

---

## ✅ Ventajas de Esta Implementación

| Aspecto | Beneficio |
|---------|-----------|
| **Automatización** | SQL Server actualiza valores automáticamente |
| **Performance** | Valores precalculados, queries más rápidas |
| **Consistencia** | Siempre sincronizado con precios y costos |
| **Indexación** | Soporta índices para reportes rápidos |
| **Mantenimiento** | Cero código de mantenimiento en backend |
| **Escalabilidad** | Funciona con millones de registros |
| **Portabilidad** | Fácil migrar a vistas si se cambia de BD |

---

## 📋 Checklist de Implementación

- [ ] Ejecutar script SQL de creación de columnas calculadas
- [ ] Verificar columnas creadas con query de verificación
- [ ] Actualizar `models/articulosModel.js` para incluir campos de rentabilidad
- [ ] Crear `models/rentabilidadModel.js`
- [ ] Crear `controllers/rentabilidadController.js`
- [ ] Crear `routes/rentabilidadRoutes.js`
- [ ] Registrar rutas en `index.js`
- [ ] Probar endpoint `/api/articulos` con campos nuevos
- [ ] Probar endpoint `/api/reportes/rentabilidad`
- [ ] Probar endpoint `/api/reportes/rentabilidad/resumen`
- [ ] Documentar endpoints en Postman
- [ ] Notificar al equipo frontend

---

## 🔒 Consideraciones de Seguridad

1. ✅ Endpoints protegidos con middleware `auth`
2. ✅ Validación de parámetros de entrada
3. ✅ Límite máximo de registros (1000)
4. ✅ Manejo de errores con try/catch

---

## 📊 Métricas de Negocio

### Rangos Sugeridos (Retail Maquillaje)

| Clasificación | Rentabilidad | Acción Recomendada |
|---------------|--------------|-------------------|
| **ALTA** | ≥ 40% | Mantener, promover |
| **MEDIA** | 20% - 40% | Revisar periódicamente |
| **BAJA** | 10% - 20% | Evaluar ajuste de precios |
| **MÍNIMA** | 0% - 10% | Considerar descontinuar |
| **PÉRDIDA** | < 0% | **Alerta:** Vendiendo bajo costo |

---

## 🚀 Próximos Pasos

1. **Dashboard de Rentabilidad:** Gráficos y KPIs en frontend
2. **Alertas Automáticas:** Notificar productos con pérdida
3. **Análisis Histórico:** Tracking de rentabilidad en el tiempo
4. **Predicción:** ML para optimizar precios

---

**Fecha de Creación:** 2026-02-17
**Autor:** Claude Code
**Versión:** 1.0
**Estado:** 📋 Documentación Lista - Pendiente de Implementación
