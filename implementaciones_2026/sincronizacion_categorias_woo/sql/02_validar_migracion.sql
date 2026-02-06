-- =============================================
-- Script: 02_validar_migracion.sql
-- Descripción: Valida que la migración se ejecutó correctamente
-- =============================================

USE [artipla_system];
GO

PRINT '========================================';
PRINT 'Validación de migración ArticuloHook';
PRINT '========================================';
PRINT '';

-- Verificar que la tabla existe
IF OBJECT_ID('dbo.ArticuloHook', 'U') IS NULL
BEGIN
    PRINT '❌ ERROR: La tabla ArticuloHook no existe.';
    RETURN;
END
ELSE
BEGIN
    PRINT '✅ Tabla ArticuloHook existe.';
END
PRINT '';

-- Contar campos nuevos
DECLARE @camposExistentes INT = 0;

SELECT @camposExistentes = COUNT(*)
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.ArticuloHook')
AND name IN (
    'ArtHookCatSysCod',
    'ArtHookCatSysNombre',
    'ArtHookSubcatSysCod',
    'ArtHookSubcatSysNombre',
    'ArtHookCatWooId',
    'ArtHookCatWooNombre',
    'ArtHookSubcatWooId',
    'ArtHookSubcatWooNombre',
    'ArtHookCategoriaMatch',
    'ArtHookCatFechaVerificacion'
);

PRINT 'Campos de categorías encontrados: ' + CAST(@camposExistentes AS VARCHAR) + '/10';

IF @camposExistentes = 10
BEGIN
    PRINT '✅ Todos los campos existen.';
END
ELSE IF @camposExistentes = 0
BEGIN
    PRINT '❌ La migración NO se ha ejecutado aún.';
END
ELSE
BEGIN
    PRINT '⚠️  Migración incompleta. Faltan ' + CAST(10 - @camposExistentes AS VARCHAR) + ' campos.';
END
PRINT '';

-- Verificar índice
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ArticuloHook_CategoriaMatch'
    AND object_id = OBJECT_ID('dbo.ArticuloHook')
)
BEGIN
    PRINT '✅ Índice IX_ArticuloHook_CategoriaMatch existe.';
END
ELSE
BEGIN
    PRINT '⚠️  Índice IX_ArticuloHook_CategoriaMatch NO existe.';
END
PRINT '';

-- Mostrar registros actuales
DECLARE @totalRegistros INT;
SELECT @totalRegistros = COUNT(*) FROM dbo.ArticuloHook;
PRINT 'Total de registros en ArticuloHook: ' + CAST(@totalRegistros AS VARCHAR);
PRINT '';

-- Mostrar muestra de datos si existen campos nuevos
IF @camposExistentes = 10
BEGIN
    PRINT 'Muestra de datos (primeros 5 registros):';
    PRINT '========================================';

    SELECT TOP 5
        ArtHookCod AS SKU,
        ArtHooName AS Producto,
        ArtHookCatSysNombre AS [Cat Sistema],
        ArtHookSubcatSysNombre AS [Subcat Sistema],
        ArtHookCatWooNombre AS [Cat WooCommerce],
        ArtHookSubcatWooNombre AS [Subcat WooCommerce],
        CASE
            WHEN ArtHookCategoriaMatch = 1 THEN '✅ Coincide'
            WHEN ArtHookCategoriaMatch = 0 THEN '❌ Discrepancia'
            ELSE '⚠️  Sin verificar'
        END AS Estado,
        ArtHookCatFechaVerificacion AS [Fecha Verificación]
    FROM dbo.ArticuloHook
    ORDER BY ArtHookCod;
END

PRINT '';
PRINT '========================================';
PRINT 'Fin de la validación';
PRINT '========================================';
