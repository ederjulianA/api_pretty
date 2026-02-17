-- =============================================
-- Verificar si existe kar_cos en facturakardes
-- =============================================
USE [pruebas_ps_02092026];
GO

PRINT '========================================';
PRINT 'Verificando campo kar_cos en kardex';
PRINT '========================================';
PRINT '';

-- Verificar columnas de facturakardes
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'facturakardes'
  AND COLUMN_NAME LIKE '%cos%'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT 'Muestra de datos del kardex:';
PRINT '-----------------------------';

SELECT TOP 10
    fac_sec,
    kar_sec,
    art_sec,
    kar_uni,
    kar_pre,
    kar_sub_tot,
    kar_total,
    kar_cos,
    kar_nat
FROM dbo.facturakardes
WHERE kar_nat = '-'  -- Solo salidas
ORDER BY fac_sec DESC;

PRINT '';
PRINT '========================================';
GO
