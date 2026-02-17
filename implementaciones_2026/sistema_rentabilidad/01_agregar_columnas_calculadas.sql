/**
 * Script SQL: Agregar Columnas Calculadas de Rentabilidad
 * Fecha: 2026-02-17
 * Base de datos: SQL Server
 * Tabla afectada: dbo.articulosdetalle
 *
 * IMPORTANTE:
 * - Este script agrega columnas PERSISTED COMPUTED que se calculan y almacenan automáticamente
 * - Las columnas se calculan para cada lista de precios (lis_pre_cod)
 * - Ejecutar en ambiente de desarrollo primero
 * - Hacer backup de la base de datos antes de ejecutar en producción
 */

USE [nombre_de_tu_base_de_datos];
GO

-- =============================================
-- PASO 1: Verificar estructura actual
-- =============================================
PRINT '========================================';
PRINT 'Verificando estructura de articulosdetalle';
PRINT '========================================';
GO

SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'articulosdetalle'
  AND COLUMN_NAME IN ('art_bod_pre', 'art_bod_cos_cat')
ORDER BY ORDINAL_POSITION;
GO

-- =============================================
-- PASO 2: Agregar columnas calculadas
-- =============================================

-- 2.1 Columna: rentabilidad (% de ganancia sobre el precio de venta)
PRINT '';
PRINT 'Agregando columna: rentabilidad';
PRINT '--------------------------------';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
      AND name = 'rentabilidad'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle
    ADD rentabilidad AS (
        CASE
            WHEN art_bod_pre > 0 AND art_bod_cos_cat IS NOT NULL
            THEN CAST(((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100 AS DECIMAL(5,2))
            ELSE 0
        END
    ) PERSISTED;

    PRINT '✓ Columna rentabilidad agregada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Columna rentabilidad ya existe - omitiendo';
END
GO

-- 2.2 Columna: margen_ganancia (% de ganancia sobre el costo)
PRINT '';
PRINT 'Agregando columna: margen_ganancia';
PRINT '-----------------------------------';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
      AND name = 'margen_ganancia'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle
    ADD margen_ganancia AS (
        CASE
            WHEN art_bod_cos_cat > 0 AND art_bod_pre IS NOT NULL
            THEN CAST(((art_bod_pre - art_bod_cos_cat) / art_bod_cos_cat) * 100 AS DECIMAL(5,2))
            ELSE 0
        END
    ) PERSISTED;

    PRINT '✓ Columna margen_ganancia agregada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Columna margen_ganancia ya existe - omitiendo';
END
GO

-- 2.3 Columna: utilidad_bruta (diferencia absoluta entre precio y costo)
PRINT '';
PRINT 'Agregando columna: utilidad_bruta';
PRINT '----------------------------------';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
      AND name = 'utilidad_bruta'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle
    ADD utilidad_bruta AS (
        CASE
            WHEN art_bod_pre IS NOT NULL AND art_bod_cos_cat IS NOT NULL
            THEN CAST(art_bod_pre - art_bod_cos_cat AS DECIMAL(17,2))
            ELSE 0
        END
    ) PERSISTED;

    PRINT '✓ Columna utilidad_bruta agregada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Columna utilidad_bruta ya existe - omitiendo';
END
GO

-- 2.4 Columna: clasificacion_rentabilidad (categorización de rentabilidad)
PRINT '';
PRINT 'Agregando columna: clasificacion_rentabilidad';
PRINT '----------------------------------------------';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
      AND name = 'clasificacion_rentabilidad'
)
BEGIN
    ALTER TABLE dbo.articulosdetalle
    ADD clasificacion_rentabilidad AS (
        CASE
            WHEN art_bod_pre > 0 AND art_bod_cos_cat IS NOT NULL THEN
                CASE
                    WHEN ((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100 >= 40 THEN 'ALTA'
                    WHEN ((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100 >= 20 THEN 'MEDIA'
                    WHEN ((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100 >= 10 THEN 'BAJA'
                    WHEN ((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100 >= 0 THEN 'MINIMA'
                    ELSE 'PERDIDA'
                END
            ELSE 'N/A'
        END
    ) PERSISTED;

    PRINT '✓ Columna clasificacion_rentabilidad agregada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Columna clasificacion_rentabilidad ya existe - omitiendo';
END
GO

-- =============================================
-- PASO 3: Crear índices para mejorar performance
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Creando índices de performance';
PRINT '========================================';

-- Índice para consultas por clasificación
-- Nota: No se puede usar WHERE con columnas calculadas, así que creamos índice sin filtro
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
      AND name = 'IX_articulosdetalle_clasificacion_rentabilidad'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulosdetalle_clasificacion_rentabilidad
    ON dbo.articulosdetalle (clasificacion_rentabilidad)
    INCLUDE (art_sec, rentabilidad, margen_ganancia, utilidad_bruta);

    PRINT '✓ Índice IX_articulosdetalle_clasificacion_rentabilidad creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_articulosdetalle_clasificacion_rentabilidad ya existe';
END
GO

-- Índice para consultas por rentabilidad
-- Nota: No se puede usar WHERE con columnas calculadas, así que creamos índice sin filtro
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
      AND name = 'IX_articulosdetalle_rentabilidad'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulosdetalle_rentabilidad
    ON dbo.articulosdetalle (rentabilidad DESC)
    INCLUDE (art_sec, art_bod_pre, art_bod_cos_cat, utilidad_bruta);

    PRINT '✓ Índice IX_articulosdetalle_rentabilidad creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_articulosdetalle_rentabilidad ya existe';
END
GO

-- =============================================
-- PASO 4: Verificar resultados
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Verificando columnas agregadas';
PRINT '========================================';
GO

SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'articulosdetalle'
  AND COLUMN_NAME IN ('rentabilidad', 'margen_ganancia', 'utilidad_bruta', 'clasificacion_rentabilidad')
ORDER BY ORDINAL_POSITION;
GO

-- =============================================
-- PASO 5: Consulta de prueba
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Consulta de prueba (Top 10 productos)';
PRINT '========================================';
GO

SELECT TOP 10
    a.art_cod,
    a.art_nom,
    ad.art_bod_pre AS precio_venta,
    ad.art_bod_cos_cat AS costo_promedio,
    ad.rentabilidad,
    ad.margen_ganancia,
    ad.utilidad_bruta,
    ad.clasificacion_rentabilidad
FROM dbo.articulosdetalle ad
INNER JOIN dbo.articulos a ON a.art_sec = ad.art_sec
WHERE ad.lis_pre_cod = 1  -- Precio al detal
  AND ad.bod_sec = '1'
  AND ad.art_bod_cos_cat > 0
ORDER BY ad.rentabilidad DESC;
GO

-- =============================================
-- PASO 6: Estadísticas por clasificación
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Estadísticas por clasificación';
PRINT '========================================';
GO

SELECT
    ad.clasificacion_rentabilidad,
    COUNT(*) AS cantidad_productos,
    AVG(ad.rentabilidad) AS rentabilidad_promedio,
    MIN(ad.rentabilidad) AS rentabilidad_minima,
    MAX(ad.rentabilidad) AS rentabilidad_maxima,
    SUM(ad.utilidad_bruta) AS utilidad_total
FROM dbo.articulosdetalle ad
WHERE ad.lis_pre_cod = 1
  AND ad.bod_sec = '1'
  AND ad.art_bod_cos_cat > 0
GROUP BY ad.clasificacion_rentabilidad
ORDER BY
    CASE ad.clasificacion_rentabilidad
        WHEN 'ALTA' THEN 1
        WHEN 'MEDIA' THEN 2
        WHEN 'BAJA' THEN 3
        WHEN 'MINIMA' THEN 4
        WHEN 'PERDIDA' THEN 5
        ELSE 6
    END;
GO

PRINT '';
PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'Resumen de cambios:';
PRINT '- Columnas calculadas agregadas: 4';
PRINT '  1. rentabilidad (DECIMAL(5,2))';
PRINT '  2. margen_ganancia (DECIMAL(5,2))';
PRINT '  3. utilidad_bruta (DECIMAL(17,2))';
PRINT '  4. clasificacion_rentabilidad (VARCHAR)';
PRINT '';
PRINT '- Índices creados: 2';
PRINT '  1. IX_articulosdetalle_clasificacion_rentabilidad';
PRINT '  2. IX_articulosdetalle_rentabilidad';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Verificar que las consultas funcionen correctamente';
PRINT '2. Probar los endpoints del API:';
PRINT '   - GET /api/reportes/rentabilidad';
PRINT '   - GET /api/reportes/rentabilidad/resumen';
PRINT '3. Monitorear el performance de las consultas';
PRINT '';
GO
