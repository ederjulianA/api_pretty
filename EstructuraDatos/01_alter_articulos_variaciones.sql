-- =====================================================
-- Script: Agregar soporte para productos variables
-- Fecha: 2026-02-04 (Corregido: 2026-02-06)
-- IMPORTANTE: art_sec es VARCHAR(30), NO DECIMAL
-- =====================================================

IF OBJECT_ID('dbo.articulos', 'U') IS NOT NULL
BEGIN
    PRINT 'Agregando campos para productos variables...';

    -- Tipo de producto en WooCommerce (simple, variable, variation)
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_woo_type')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_woo_type VARCHAR(20) NULL
        CONSTRAINT DF_articulos_art_woo_type DEFAULT 'simple';

        PRINT 'Campo art_woo_type agregado';
    END
    ELSE
        PRINT 'Campo art_woo_type ya existe';

    -- NOTA: art_sec_padre VARCHAR(30) YA EXISTE en la tabla
    -- No es necesario crearlo. Verificamos que exista:
    IF EXISTS (SELECT * FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.articulos')
               AND name = 'art_sec_padre')
        PRINT 'Campo art_sec_padre ya existe (OK - reutilizando)';
    ELSE
    BEGIN
        PRINT 'ADVERTENCIA: art_sec_padre no existe, creando...';
        ALTER TABLE dbo.articulos
        ADD art_sec_padre VARCHAR(30) NULL;
    END

    -- NOTA: art_variable VARCHAR(1) YA EXISTE en la tabla
    IF EXISTS (SELECT * FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.articulos')
               AND name = 'art_variable')
        PRINT 'Campo art_variable ya existe (OK - reutilizando)';

    -- ID del producto padre en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_parent_woo_id')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_parent_woo_id INT NULL;

        PRINT 'Campo art_parent_woo_id agregado';
    END
    ELSE
        PRINT 'Campo art_parent_woo_id ya existe';

    -- Atributos de variacion (JSON)
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_variation_attributes')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_variation_attributes NVARCHAR(MAX) NULL;

        PRINT 'Campo art_variation_attributes agregado';
    END
    ELSE
        PRINT 'Campo art_variation_attributes ya existe';

    -- ID de la variacion en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_woo_variation_id')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_woo_variation_id INT NULL;

        PRINT 'Campo art_woo_variation_id agregado';
    END
    ELSE
        PRINT 'Campo art_woo_variation_id ya existe';

    PRINT '================================================';
    PRINT 'Migracion de campos completada exitosamente';
    PRINT '================================================';
END
ELSE
BEGIN
    PRINT 'ERROR: La tabla dbo.articulos no existe';
END

-- Actualizar productos existentes para asegurar que son 'simple'
-- Usar EXEC para evitar error de compilacion cuando la columna acaba de crearse
EXEC('UPDATE dbo.articulos SET art_woo_type = ''simple'' WHERE art_woo_type IS NULL');

PRINT 'Productos existentes marcados como simple';

-- Crear indices para mejorar rendimiento
-- NOTA: art_sec_padre es VARCHAR(30), no DECIMAL
IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_articulos_sec_padre'
               AND object_id = OBJECT_ID('dbo.articulos'))
BEGIN
    CREATE INDEX IX_articulos_sec_padre
    ON dbo.articulos(art_sec_padre)
    WHERE art_sec_padre IS NOT NULL;

    PRINT 'Indice IX_articulos_sec_padre creado';
END

IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_articulos_woo_type'
               AND object_id = OBJECT_ID('dbo.articulos'))
BEGIN
    EXEC('CREATE INDEX IX_articulos_woo_type ON dbo.articulos(art_woo_type)');

    PRINT 'Indice IX_articulos_woo_type creado';
END

PRINT '================================================';
PRINT 'Script completado - Base de datos lista';
PRINT '================================================';
