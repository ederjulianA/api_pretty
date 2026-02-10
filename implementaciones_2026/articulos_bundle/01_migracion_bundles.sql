/**
 * MIGRACIÓN: Artículos Armados (Bundles)
 * Fecha: 2026-02-10
 * Descripción: Agregar campos necesarios para funcionalidad de bundles
 */

USE [PS_ESTRUCTURA]
GO

PRINT '========================================';
PRINT 'Iniciando migración: Bundles';
PRINT '========================================';
PRINT '';

-- =============================================
-- PASO 1: Agregar campo art_bundle a tabla articulos
-- =============================================

PRINT 'Paso 1: Agregar campo art_bundle...';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulos')
    AND name = 'art_bundle'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD art_bundle CHAR(1) NULL DEFAULT 'N';

    PRINT '  ✓ Campo art_bundle agregado';
END
ELSE
BEGIN
    PRINT '  ⚠ Campo art_bundle ya existe';
END
GO

-- Actualizar registros existentes
UPDATE dbo.articulos
SET art_bundle = 'N'
WHERE art_bundle IS NULL;
GO

PRINT '  ✓ Registros existentes actualizados';

-- Agregar constraint
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_articulos_art_bundle'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD CONSTRAINT CK_articulos_art_bundle
        CHECK (art_bundle IN ('S', 'N'));

    PRINT '  ✓ Constraint CK_articulos_art_bundle agregado';
END
ELSE
BEGIN
    PRINT '  ⚠ Constraint CK_articulos_art_bundle ya existe';
END
GO

-- =============================================
-- PASO 2: Agregar campo kar_bundle_padre a facturakardes
-- =============================================

PRINT '';
PRINT 'Paso 2: Agregar campo kar_bundle_padre...';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.facturakardes')
    AND name = 'kar_bundle_padre'
)
BEGIN
    ALTER TABLE dbo.facturakardes
    ADD kar_bundle_padre VARCHAR(30) NULL;

    PRINT '  ✓ Campo kar_bundle_padre agregado';
END
ELSE
BEGIN
    PRINT '  ⚠ Campo kar_bundle_padre ya existe';
END
GO

-- Agregar foreign key (opcional pero recomendada)
IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_facturakardes_bundle_padre'
)
BEGIN
    ALTER TABLE dbo.facturakardes
    ADD CONSTRAINT FK_facturakardes_bundle_padre
        FOREIGN KEY (kar_bundle_padre)
        REFERENCES dbo.articulos(art_sec);

    PRINT '  ✓ Foreign key FK_facturakardes_bundle_padre agregada';
END
ELSE
BEGIN
    PRINT '  ⚠ Foreign key FK_facturakardes_bundle_padre ya existe';
END
GO

-- =============================================
-- PASO 3: Verificar tabla articulosArmado existe
-- =============================================

PRINT '';
PRINT 'Paso 3: Verificar tabla articulosArmado...';

IF EXISTS (
    SELECT 1
    FROM sys.tables
    WHERE name = 'articulosArmado'
)
BEGIN
    PRINT '  ✓ Tabla articulosArmado existe';

    -- Verificar estructura
    DECLARE @col_count INT;
    SELECT @col_count = COUNT(*)
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosArmado')
    AND name IN ('art_sec', 'ComArtSec', 'ConKarUni');

    IF @col_count = 3
    BEGIN
        PRINT '  ✓ Estructura de articulosArmado correcta';
    END
    ELSE
    BEGIN
        PRINT '  ✗ ERROR: Estructura de articulosArmado incorrecta';
    END
END
ELSE
BEGIN
    PRINT '  ✗ ERROR: Tabla articulosArmado no existe';
    PRINT '  → Ejecutar script de creación de estructura base';
END
GO

-- =============================================
-- PASO 4: Crear índices para optimizar consultas
-- =============================================

PRINT '';
PRINT 'Paso 4: Crear índices...';

-- Índice para búsqueda de bundles
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_articulos_art_bundle'
    AND object_id = OBJECT_ID('dbo.articulos')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulos_art_bundle
    ON dbo.articulos (art_bundle)
    INCLUDE (art_sec, art_cod, art_nom);

    PRINT '  ✓ Índice IX_articulos_art_bundle creado';
END
ELSE
BEGIN
    PRINT '  ⚠ Índice IX_articulos_art_bundle ya existe';
END
GO

-- Índice para búsqueda de componentes en kardex
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_facturakardes_bundle_padre'
    AND object_id = OBJECT_ID('dbo.facturakardes')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_facturakardes_bundle_padre
    ON dbo.facturakardes (kar_bundle_padre)
    WHERE kar_bundle_padre IS NOT NULL;

    PRINT '  ✓ Índice IX_facturakardes_bundle_padre creado';
END
ELSE
BEGIN
    PRINT '  ⚠ Índice IX_facturakardes_bundle_padre ya existe';
END
GO

-- =============================================
-- PASO 5: Resumen de migración
-- =============================================

PRINT '';
PRINT '========================================';
PRINT 'Migración completada';
PRINT '========================================';
PRINT '';
PRINT 'Campos agregados:';
PRINT '  - articulos.art_bundle';
PRINT '  - facturakardes.kar_bundle_padre';
PRINT '';
PRINT 'Constraints agregados:';
PRINT '  - CK_articulos_art_bundle';
PRINT '  - FK_facturakardes_bundle_padre';
PRINT '';
PRINT 'Índices creados:';
PRINT '  - IX_articulos_art_bundle';
PRINT '  - IX_facturakardes_bundle_padre';
PRINT '';
PRINT 'SIGUIENTE PASO: Implementar código en API';
PRINT '';

-- =============================================
-- QUERIES DE VERIFICACIÓN
-- =============================================

PRINT 'Verificación de estructura:';
PRINT '';

-- Contar bundles existentes (debería ser 0 inicialmente)
DECLARE @bundle_count INT;
SELECT @bundle_count = COUNT(*) FROM dbo.articulos WHERE art_bundle = 'S';
PRINT CONCAT('  Bundles existentes: ', @bundle_count);

-- Contar artículos armados en tabla articulosArmado
DECLARE @armado_count INT;
SELECT @armado_count = COUNT(DISTINCT art_sec) FROM dbo.articulosArmado;
PRINT CONCAT('  Artículos en articulosArmado: ', @armado_count);

PRINT '';
PRINT '¡Migración exitosa!';
GO
