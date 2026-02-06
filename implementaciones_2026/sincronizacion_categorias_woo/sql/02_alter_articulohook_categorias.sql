-- =============================================
-- Script: 02_alter_articulohook_categorias.sql
-- Fecha: 2026-02-05
-- Descripción: Agrega campos de categorías a ArticuloHook para auditoría
--              y sincronización con WooCommerce
-- Autor: API Pretty Team
-- =============================================

USE [artipla_system];
GO

PRINT '========================================';
PRINT 'Iniciando migración de ArticuloHook';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
GO

-- =============================================
-- Validar que la tabla ArticuloHook existe
-- =============================================
IF OBJECT_ID('dbo.ArticuloHook', 'U') IS NULL
BEGIN
    PRINT 'ERROR: La tabla ArticuloHook no existe.';
    PRINT 'Abortando migración.';
    RAISERROR('Tabla ArticuloHook no encontrada', 16, 1);
    RETURN;
END
GO

-- =============================================
-- Verificar si los campos ya existen
-- =============================================
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ArticuloHook')
    AND name = 'ArtHookCatSysCod'
)
BEGIN
    PRINT 'ADVERTENCIA: Los campos de categorías ya existen en ArticuloHook.';
    PRINT 'Saltando la creación de campos.';
    PRINT 'Si desea recrearlos, elimínelos manualmente primero.';
    RETURN;
END
GO

-- =============================================
-- Agregar campos de categorías
-- =============================================
PRINT 'Agregando campos de categorías a ArticuloHook...';
GO

ALTER TABLE dbo.ArticuloHook ADD
    -- Categorías del Sistema Local
    ArtHookCatSysCod NVARCHAR(20) NULL,              -- Código de grupo (inv_gru_cod)
    ArtHookCatSysNombre NVARCHAR(100) NULL,          -- Nombre de grupo
    ArtHookSubcatSysCod NVARCHAR(20) NULL,           -- Código de subgrupo (inv_sub_gru_cod)
    ArtHookSubcatSysNombre NVARCHAR(100) NULL,       -- Nombre de subgrupo

    -- Categorías de WooCommerce
    ArtHookCatWooId INT NULL,                        -- ID de categoría padre en WooCommerce
    ArtHookCatWooNombre NVARCHAR(100) NULL,          -- Nombre de categoría padre
    ArtHookSubcatWooId INT NULL,                     -- ID de subcategoría en WooCommerce
    ArtHookSubcatWooNombre NVARCHAR(100) NULL,       -- Nombre de subcategoría

    -- Metadata de sincronización
    ArtHookCategoriaMatch BIT NULL,                  -- 1 = Coinciden, 0 = Discrepancia, NULL = No verificado
    ArtHookCatFechaVerificacion DATETIME NULL;       -- Última verificación
GO

PRINT 'Campos agregados exitosamente.';
GO

-- =============================================
-- Crear índice para mejorar performance de consultas de auditoría
-- =============================================
PRINT 'Creando índice para optimizar consultas de auditoría...';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ArticuloHook_CategoriaMatch'
    AND object_id = OBJECT_ID('dbo.ArticuloHook')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_ArticuloHook_CategoriaMatch
    ON dbo.ArticuloHook (ArtHookCategoriaMatch)
    INCLUDE (ArtHookCod, ArtHooName, ArtHookCatSysNombre, ArtHookSubcatSysNombre,
             ArtHookCatWooNombre, ArtHookSubcatWooNombre);

    PRINT 'Índice IX_ArticuloHook_CategoriaMatch creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'El índice IX_ArticuloHook_CategoriaMatch ya existe.';
END
GO

-- =============================================
-- Validar que los campos se crearon correctamente
-- =============================================
PRINT 'Validando estructura de la tabla...';
GO

DECLARE @camposFaltantes INT = 0;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCatSysCod')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCatSysNombre')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookSubcatSysCod')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookSubcatSysNombre')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCatWooId')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCatWooNombre')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookSubcatWooId')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookSubcatWooNombre')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCategoriaMatch')
    SET @camposFaltantes = @camposFaltantes + 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCatFechaVerificacion')
    SET @camposFaltantes = @camposFaltantes + 1;

IF @camposFaltantes > 0
BEGIN
    PRINT 'ERROR: Faltan ' + CAST(@camposFaltantes AS VARCHAR) + ' campos. La migración no se completó correctamente.';
    RAISERROR('Migración incompleta', 16, 1);
END
ELSE
BEGIN
    PRINT 'Validación exitosa: Todos los campos se crearon correctamente.';
END
GO

-- =============================================
-- Query de prueba para verificar estructura
-- =============================================
PRINT '========================================';
PRINT 'Estructura final de ArticuloHook:';
PRINT '========================================';
GO

SELECT
    COLUMN_NAME AS Campo,
    DATA_TYPE AS Tipo,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS Nullable
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'ArticuloHook'
AND COLUMN_NAME LIKE 'ArtHook%'
ORDER BY ORDINAL_POSITION;
GO

-- =============================================
-- Resumen de la migración
-- =============================================
PRINT '========================================';
PRINT 'Migración completada exitosamente';
PRINT 'Campos agregados: 10';
PRINT 'Índices creados: 1';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Ejecutar sincronización de productos: POST /api/woo/sync-products';
PRINT '2. Verificar datos: SELECT TOP 10 * FROM ArticuloHook WHERE ArtHookCategoriaMatch IS NOT NULL';
PRINT '3. Auditar discrepancias: SELECT * FROM ArticuloHook WHERE ArtHookCategoriaMatch = 0';
GO

-- =============================================
-- Script de rollback (comentado por seguridad)
-- =============================================
/*
-- Para revertir esta migración, ejecutar:

-- Eliminar índice
DROP INDEX IF EXISTS IX_ArticuloHook_CategoriaMatch ON dbo.ArticuloHook;

-- Eliminar columnas
ALTER TABLE dbo.ArticuloHook DROP COLUMN IF EXISTS
    ArtHookCatSysCod,
    ArtHookCatSysNombre,
    ArtHookSubcatSysCod,
    ArtHookSubcatSysNombre,
    ArtHookCatWooId,
    ArtHookCatWooNombre,
    ArtHookSubcatWooId,
    ArtHookSubcatWooNombre,
    ArtHookCategoriaMatch,
    ArtHookCatFechaVerificacion;

PRINT 'Rollback completado.';
*/
