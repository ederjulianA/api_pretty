/**
 * Script SQL: Agregar campo kar_cos a facturakardes
 * Fecha: 2026-02-17
 * Versión: 1.0
 * Descripción: Agrega columna kar_cos para almacenar el costo histórico
 *              en el momento de cada venta
 *
 * IMPORTANTE:
 * - Este script es SEGURO: solo agrega una columna NULL
 * - No afecta datos existentes
 * - Ejecutar ANTES de poblar datos históricos
 * - Hacer backup de la base de datos antes de ejecutar en producción
 */

USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

PRINT '========================================';
PRINT 'Agregar campo kar_cos a facturakardes';
PRINT '========================================';
PRINT '';

-- =============================================
-- PASO 1: Verificar si la columna ya existe
-- =============================================
IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_cos'
)
BEGIN
    PRINT '⚠️  ADVERTENCIA: La columna kar_cos ya existe en facturakardes';
    PRINT '   No se realizarán cambios.';
    PRINT '';
    RETURN;
END

PRINT 'Paso 1: Verificando prerequisitos...';
PRINT '--------------------------------------';

-- Verificar que existe la tabla facturakardes
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'facturakardes'
)
BEGIN
    PRINT '❌ ERROR: No existe la tabla facturakardes';
    RETURN;
END
ELSE
BEGIN
    PRINT '✓ Tabla facturakardes existe';
END

PRINT '';

-- =============================================
-- PASO 2: Agregar columna kar_cos
-- =============================================
PRINT 'Paso 2: Agregando columna kar_cos...';
PRINT '--------------------------------------';

BEGIN TRY
    ALTER TABLE dbo.facturakardes
    ADD kar_cos DECIMAL(18, 4) NULL;

    PRINT '✓ Columna kar_cos agregada exitosamente';
    PRINT '  Tipo: DECIMAL(18, 4) NULL';
END TRY
BEGIN CATCH
    PRINT '❌ ERROR al agregar columna kar_cos:';
    PRINT '   ' + ERROR_MESSAGE();
    RETURN;
END CATCH

PRINT '';

-- =============================================
-- PASO 3: Verificar la creación
-- =============================================
PRINT 'Paso 3: Verificando creación...';
PRINT '--------------------------------';

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_cos'
)
BEGIN
    PRINT '✓ Verificación exitosa: kar_cos existe en facturakardes';

    -- Mostrar detalles de la columna
    SELECT
        COLUMN_NAME AS columna,
        DATA_TYPE AS tipo_dato,
        NUMERIC_PRECISION AS precision,
        NUMERIC_SCALE AS escala,
        IS_NULLABLE AS permite_null
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_cos';
END
ELSE
BEGIN
    PRINT '❌ ERROR: No se pudo verificar la creación de kar_cos';
    RETURN;
END

PRINT '';

-- =============================================
-- PASO 4: Estadísticas
-- =============================================
PRINT 'Paso 4: Estadísticas actuales...';
PRINT '---------------------------------';

SELECT
    COUNT(*) AS total_registros_facturakardes,
    SUM(CASE WHEN kar_cos IS NULL THEN 1 ELSE 0 END) AS registros_sin_kar_cos,
    SUM(CASE WHEN kar_cos IS NOT NULL THEN 1 ELSE 0 END) AS registros_con_kar_cos
FROM dbo.facturakardes;

PRINT '';
PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Ejecutar: 07_poblar_kar_cos_historico.sql';
PRINT '2. Ejecutar: 08_modificar_vista_usar_kar_cos.sql';
PRINT '3. Modificar backend para incluir kar_cos en nuevas ventas';
PRINT '';
GO
