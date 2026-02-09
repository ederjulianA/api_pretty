-- =====================================================
-- Script: Agregar soporte para productos variables
-- Fecha: 2026-02-04
-- Descripción: Agrega campos necesarios para manejar
--              productos variables y variaciones
-- =====================================================

USE [NombreDeBaseDeDatos]; -- CAMBIAR POR EL NOMBRE REAL DE LA BD
GO

-- Verificar que la tabla existe
IF OBJECT_ID('dbo.articulos', 'U') IS NOT NULL
BEGIN
    PRINT 'Agregando campos para productos variables...';

    -- Tipo de producto en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_woo_type')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_woo_type VARCHAR(20) NULL
        CONSTRAINT DF_articulos_art_woo_type DEFAULT 'simple';

        PRINT '✓ Campo art_woo_type agregado';
    END
    ELSE
        PRINT '⚠ Campo art_woo_type ya existe';

    -- ID del producto padre (art_sec)
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_parent_sec')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_parent_sec DECIMAL(18,0) NULL;

        PRINT '✓ Campo art_parent_sec agregado';
    END
    ELSE
        PRINT '⚠ Campo art_parent_sec ya existe';

    -- ID del producto padre en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_parent_woo_id')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_parent_woo_id INT NULL;

        PRINT '✓ Campo art_parent_woo_id agregado';
    END
    ELSE
        PRINT '⚠ Campo art_parent_woo_id ya existe';

    -- Atributos de variación (JSON)
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_variation_attributes')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_variation_attributes NVARCHAR(MAX) NULL;

        PRINT '✓ Campo art_variation_attributes agregado';
    END
    ELSE
        PRINT '⚠ Campo art_variation_attributes ya existe';

    -- ID de la variación en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_woo_variation_id')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_woo_variation_id INT NULL;

        PRINT '✓ Campo art_woo_variation_id agregado';
    END
    ELSE
        PRINT '⚠ Campo art_woo_variation_id ya existe';

    PRINT '================================================';
    PRINT 'Migración completada exitosamente';
    PRINT '================================================';
END
ELSE
BEGIN
    PRINT 'ERROR: La tabla dbo.articulos no existe';
END
GO

-- Actualizar productos existentes para asegurar que son 'simple'
UPDATE dbo.articulos
SET art_woo_type = 'simple'
WHERE art_woo_type IS NULL;

PRINT 'Productos existentes marcados como "simple"';
GO

-- Crear índices para mejorar rendimiento
IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_articulos_parent_sec'
               AND object_id = OBJECT_ID('dbo.articulos'))
BEGIN
    CREATE INDEX IX_articulos_parent_sec
    ON dbo.articulos(art_parent_sec)
    WHERE art_parent_sec IS NOT NULL;

    PRINT '✓ Índice IX_articulos_parent_sec creado';
END

IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_articulos_woo_type'
               AND object_id = OBJECT_ID('dbo.articulos'))
BEGIN
    CREATE INDEX IX_articulos_woo_type
    ON dbo.articulos(art_woo_type);

    PRINT '✓ Índice IX_articulos_woo_type creado';
END
GO

PRINT '================================================';
PRINT 'Script completado - Base de datos lista';
PRINT '================================================';
