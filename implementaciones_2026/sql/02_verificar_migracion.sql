-- =====================================================
-- Script: Verificar migración de productos variables
-- Fecha: 2026-02-04
-- =====================================================

USE [NombreDeBaseDeDatos]; -- CAMBIAR POR EL NOMBRE REAL DE LA BD
GO

PRINT '================================================';
PRINT 'VERIFICACIÓN DE MIGRACIÓN';
PRINT '================================================';
PRINT '';

-- Verificar campos agregados
SELECT
    'art_woo_type' AS campo,
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_woo_type'
    ) THEN '✓ EXISTE' ELSE '✗ FALTA' END AS estado
UNION ALL
SELECT
    'art_parent_sec',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_parent_sec'
    ) THEN '✓ EXISTE' ELSE '✗ FALTA' END
UNION ALL
SELECT
    'art_parent_woo_id',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_parent_woo_id'
    ) THEN '✓ EXISTE' ELSE '✗ FALTA' END
UNION ALL
SELECT
    'art_variation_attributes',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_variation_attributes'
    ) THEN '✓ EXISTE' ELSE '✗ FALTA' END
UNION ALL
SELECT
    'art_woo_variation_id',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_woo_variation_id'
    ) THEN '✓ EXISTE' ELSE '✗ FALTA' END;

PRINT '';
PRINT 'Conteo de productos por tipo:';
SELECT
    ISNULL(art_woo_type, 'NULL') AS tipo_producto,
    COUNT(*) AS cantidad
FROM dbo.articulos
GROUP BY art_woo_type;

PRINT '';
PRINT '================================================';
