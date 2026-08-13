-- =====================================================
-- Script: Agregar peso y dimensiones de producto (envia.com)
-- Fecha: 2026-08-12
-- IMPORTANTE: art_sec es VARCHAR(30), NO DECIMAL
-- =====================================================

IF OBJECT_ID('dbo.articulos', 'U') IS NOT NULL
BEGIN
    PRINT 'Agregando campos de peso/dimensiones...';

    -- Peso en kg
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_peso')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_peso DECIMAL(10,3) NULL;

        PRINT 'Campo art_peso agregado';
    END
    ELSE
        PRINT 'Campo art_peso ya existe';

    -- Largo en cm
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_largo')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_largo DECIMAL(10,2) NULL;

        PRINT 'Campo art_largo agregado';
    END
    ELSE
        PRINT 'Campo art_largo ya existe';

    -- Ancho en cm
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_ancho')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_ancho DECIMAL(10,2) NULL;

        PRINT 'Campo art_ancho agregado';
    END
    ELSE
        PRINT 'Campo art_ancho ya existe';

    -- Alto en cm
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_alto')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_alto DECIMAL(10,2) NULL;

        PRINT 'Campo art_alto agregado';
    END
    ELSE
        PRINT 'Campo art_alto ya existe';

    -- Trazabilidad del origen del dato: 'estimado_ia' | 'medido' | 'sin_dato'
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_peso_fuente')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_peso_fuente VARCHAR(15) NULL;

        PRINT 'Campo art_peso_fuente agregado';
    END
    ELSE
        PRINT 'Campo art_peso_fuente ya existe';

    PRINT '================================================';
    PRINT 'Migracion de peso/dimensiones completada exitosamente';
    PRINT '================================================';
END
ELSE
BEGIN
    PRINT 'ERROR: La tabla dbo.articulos no existe';
END
