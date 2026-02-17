/*
 * Script: Actualizar kar_cos faltantes
 * Fecha: 2026-02-17
 * Descripción: Actualiza kar_cos de registros que NO tienen costo asignado (NULL o 0)
 *              usando el costo actual de articulosdetalle
 *
 * Uso: Ejecutar este script cada vez que se asignen costos a artículos nuevos
 *      para ir corrigiendo los registros históricos gradualmente
 *
 * Solo actualiza:
 * - Registros con kar_cos = 0 o kar_cos IS NULL
 * - Salidas de inventario (kar_nat = '-')
 * - Artículos que SÍ tienen costo en articulosdetalle
 */

USE SyscomElRedentor; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

SET NOCOUNT ON;

-- 1. Ver estado actual
PRINT '====================================';
PRINT 'Estado ANTES de la actualización:';
PRINT '====================================';
PRINT '';

SELECT
    'Registros SIN costo' AS categoria,
    COUNT(*) AS total_registros
FROM dbo.facturakardes
WHERE kar_nat = '-'
  AND (kar_cos IS NULL OR kar_cos = 0);

SELECT
    'Registros CON costo' AS categoria,
    COUNT(*) AS total_registros
FROM dbo.facturakardes
WHERE kar_nat = '-'
  AND kar_cos > 0;

PRINT '';
PRINT 'Top 10 artículos sin costo que SÍ tienen costo en articulosdetalle:';
SELECT TOP 10
    fk.art_sec,
    a.art_cod,
    a.art_nom,
    COUNT(*) AS registros_sin_costo,
    ad.art_bod_cos_cat AS costo_actual_disponible
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
LEFT JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1
    AND ad.bod_sec = '1'
WHERE fk.kar_nat = '-'
  AND (fk.kar_cos IS NULL OR fk.kar_cos = 0)
  AND ad.art_bod_cos_cat > 0
GROUP BY fk.art_sec, a.art_cod, a.art_nom, ad.art_bod_cos_cat
ORDER BY COUNT(*) DESC;

-- 2. Ejecutar actualización
PRINT '';
PRINT '====================================';
PRINT 'Actualizando kar_cos faltantes...';
PRINT '====================================';
PRINT '';

DECLARE @registros_actualizados INT = 0;

UPDATE fk
SET fk.kar_cos = ad.art_bod_cos_cat
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
INNER JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1  -- Lista de precio DETAL
    AND ad.bod_sec = '1'     -- Bodega principal
WHERE fk.kar_nat = '-'                           -- Solo salidas (ventas)
  AND (fk.kar_cos IS NULL OR fk.kar_cos = 0)    -- Sin costo asignado
  AND ad.art_bod_cos_cat IS NOT NULL            -- Que tenga costo en articulosdetalle
  AND ad.art_bod_cos_cat > 0;                   -- Costo mayor a 0

SET @registros_actualizados = @@ROWCOUNT;

PRINT 'Registros actualizados: ' + CAST(@registros_actualizados AS VARCHAR);

-- 3. Ver estado después
PRINT '';
PRINT '====================================';
PRINT 'Estado DESPUÉS de la actualización:';
PRINT '====================================';
PRINT '';

SELECT
    'Registros SIN costo' AS categoria,
    COUNT(*) AS total_registros
FROM dbo.facturakardes
WHERE kar_nat = '-'
  AND (kar_cos IS NULL OR kar_cos = 0);

SELECT
    'Registros CON costo' AS categoria,
    COUNT(*) AS total_registros
FROM dbo.facturakardes
WHERE kar_nat = '-'
  AND kar_cos > 0;

-- 4. Mostrar artículos que AÚN no tienen costo
PRINT '';
PRINT '====================================';
PRINT 'Artículos que AÚN no tienen costo:';
PRINT '====================================';
PRINT '';
PRINT 'Estos artículos necesitan que se les asigne costo en articulosdetalle:';
PRINT '';

SELECT TOP 20
    fk.art_sec,
    a.art_cod,
    a.art_nom,
    COUNT(*) AS registros_sin_costo,
    ISNULL(ad.art_bod_cos_cat, 0) AS costo_actual
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
LEFT JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1
    AND ad.bod_sec = '1'
WHERE fk.kar_nat = '-'
  AND (fk.kar_cos IS NULL OR fk.kar_cos = 0)
GROUP BY fk.art_sec, a.art_cod, a.art_nom, ad.art_bod_cos_cat
ORDER BY COUNT(*) DESC;

-- 5. Resumen final
PRINT '';
PRINT '====================================';
PRINT 'Resumen de la actualización:';
PRINT '====================================';

DECLARE @total_sin_costo INT;
DECLARE @total_con_costo INT;
DECLARE @porcentaje_con_costo DECIMAL(5,2);

SELECT @total_sin_costo = COUNT(*)
FROM dbo.facturakardes
WHERE kar_nat = '-'
  AND (kar_cos IS NULL OR kar_cos = 0);

SELECT @total_con_costo = COUNT(*)
FROM dbo.facturakardes
WHERE kar_nat = '-'
  AND kar_cos > 0;

SET @porcentaje_con_costo =
    CASE
        WHEN (@total_sin_costo + @total_con_costo) > 0
        THEN (@total_con_costo * 100.0) / (@total_sin_costo + @total_con_costo)
        ELSE 0
    END;

PRINT '';
PRINT 'Registros actualizados en esta ejecución: ' + CAST(@registros_actualizados AS VARCHAR);
PRINT 'Total registros CON costo: ' + CAST(@total_con_costo AS VARCHAR);
PRINT 'Total registros SIN costo: ' + CAST(@total_sin_costo AS VARCHAR);
PRINT 'Porcentaje con costo: ' + CAST(@porcentaje_con_costo AS VARCHAR) + '%';
PRINT '';

IF @total_sin_costo = 0
BEGIN
    PRINT '✅ ¡Perfecto! Todos los registros tienen costo asignado';
END
ELSE
BEGIN
    PRINT '⚠️  Aún hay ' + CAST(@total_sin_costo AS VARCHAR) + ' registros sin costo';
    PRINT '   Asigna costos a los artículos listados arriba y vuelve a ejecutar este script';
END

PRINT '';
PRINT '====================================';
PRINT 'Proceso completado';
PRINT '====================================';

GO
