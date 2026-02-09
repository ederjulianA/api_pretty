-- =====================================================
-- Script: Verificar migracion de productos variables
-- Ejecutar DESPUES de 01_alter_articulos_variaciones.sql
-- =====================================================

PRINT '================================================';
PRINT 'VERIFICACION DE MIGRACION';
PRINT '================================================';
PRINT '';

-- Verificar campos (existentes + nuevos)
SELECT
    'art_sec_padre (existente)' AS campo,
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_sec_padre'
    ) THEN 'EXISTE' ELSE 'FALTA' END AS estado
UNION ALL
SELECT
    'art_variable (existente)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_variable'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_woo_type (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_woo_type'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_parent_woo_id (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_parent_woo_id'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_variation_attributes (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_variation_attributes'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_woo_variation_id (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_woo_variation_id'
    ) THEN 'EXISTE' ELSE 'FALTA' END;

PRINT '';
PRINT 'Conteo de productos por tipo:';
EXEC('SELECT ISNULL(art_woo_type, ''NULL'') AS tipo_producto, COUNT(*) AS cantidad FROM dbo.articulos GROUP BY art_woo_type');

PRINT '';

-- Verificar indices
SELECT
    'IX_articulos_sec_padre' AS indice,
    CASE WHEN EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_articulos_sec_padre'
        AND object_id = OBJECT_ID('dbo.articulos')
    ) THEN 'EXISTE' ELSE 'FALTA' END AS estado
UNION ALL
SELECT
    'IX_articulos_woo_type',
    CASE WHEN EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_articulos_woo_type'
        AND object_id = OBJECT_ID('dbo.articulos')
    ) THEN 'EXISTE' ELSE 'FALTA' END;

PRINT '================================================';
PRINT 'Verificacion completada';
PRINT '================================================';
