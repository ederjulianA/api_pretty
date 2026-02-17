/**
 * Script SQL: Poblar kar_cos con datos históricos
 * Fecha: 2026-02-17
 * Versión: 1.0
 * Descripción: Actualiza kar_cos en facturakardes históricos usando
 *              el costo promedio ACTUAL de articulosdetalle
 *
 * IMPORTANTE:
 * - Este script usa el costo ACTUAL, no el histórico real
 * - Los datos son una ESTIMACIÓN para ventas antiguas
 * - Ejecutar DESPUÉS de 06_agregar_kar_cos.sql
 * - Hacer backup de la base de datos antes de ejecutar en producción
 * - El script es idempotente: se puede ejecutar múltiples veces
 */

USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

PRINT '========================================';
PRINT 'Poblar kar_cos con datos históricos';
PRINT '========================================';
PRINT '';

-- =============================================
-- PASO 1: Verificar prerequisitos
-- =============================================
PRINT 'Paso 1: Verificando prerequisitos...';
PRINT '--------------------------------------';

-- Verificar que existe la columna kar_cos
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_cos'
)
BEGIN
    PRINT '❌ ERROR: No existe la columna kar_cos en facturakardes';
    PRINT '   Debe ejecutar primero: 06_agregar_kar_cos.sql';
    RETURN;
END
ELSE
BEGIN
    PRINT '✓ Columna kar_cos existe';
END

PRINT '';

-- =============================================
-- PASO 2: Estadísticas ANTES de la actualización
-- =============================================
PRINT 'Paso 2: Estadísticas ANTES de actualizar...';
PRINT '--------------------------------------------';

DECLARE @total_registros INT;
DECLARE @registros_sin_costo INT;
DECLARE @registros_con_costo INT;

SELECT
    @total_registros = COUNT(*),
    @registros_sin_costo = SUM(CASE WHEN kar_cos IS NULL THEN 1 ELSE 0 END),
    @registros_con_costo = SUM(CASE WHEN kar_cos IS NOT NULL THEN 1 ELSE 0 END)
FROM dbo.facturakardes
WHERE kar_nat = '-';  -- Solo ventas (salidas)

PRINT 'Total registros de ventas: ' + CAST(@total_registros AS VARCHAR);
PRINT 'Sin kar_cos: ' + CAST(@registros_sin_costo AS VARCHAR);
PRINT 'Con kar_cos: ' + CAST(@registros_con_costo AS VARCHAR);

IF @registros_sin_costo = 0
BEGIN
    PRINT '';
    PRINT '⚠️  ADVERTENCIA: Todos los registros ya tienen kar_cos';
    PRINT '   No se realizarán cambios.';
    PRINT '';
    RETURN;
END

PRINT '';

-- =============================================
-- PASO 3: Actualizar kar_cos con costo actual
-- =============================================
PRINT 'Paso 3: Actualizando kar_cos...';
PRINT '--------------------------------';
PRINT 'Esto puede tomar varios minutos dependiendo del volumen de datos...';
PRINT '';

DECLARE @registros_actualizados INT;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Actualizar kar_cos con el costo promedio actual de articulosdetalle
    UPDATE fk
    SET fk.kar_cos = ISNULL(ad.art_bod_cos_cat, 0)
    FROM dbo.facturakardes fk
    INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
    LEFT JOIN dbo.articulosdetalle ad
        ON a.art_sec = ad.art_sec
        AND ad.lis_pre_cod = 1  -- Precio al detal
        AND ad.bod_sec = '1'    -- Bodega principal
    WHERE fk.kar_cos IS NULL    -- Solo actualizar registros sin costo
      AND fk.kar_nat = '-';     -- Solo ventas (salidas)

    SET @registros_actualizados = @@ROWCOUNT;

    COMMIT TRANSACTION;

    PRINT '✓ Actualización completada exitosamente';
    PRINT '  Registros actualizados: ' + CAST(@registros_actualizados AS VARCHAR);

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;

    PRINT '❌ ERROR durante la actualización:';
    PRINT '   ' + ERROR_MESSAGE();
    RETURN;
END CATCH

PRINT '';

-- =============================================
-- PASO 4: Estadísticas DESPUÉS de la actualización
-- =============================================
PRINT 'Paso 4: Estadísticas DESPUÉS de actualizar...';
PRINT '----------------------------------------------';

SELECT
    COUNT(*) AS total_ventas,
    SUM(CASE WHEN kar_cos IS NULL THEN 1 ELSE 0 END) AS sin_kar_cos,
    SUM(CASE WHEN kar_cos IS NOT NULL AND kar_cos > 0 THEN 1 ELSE 0 END) AS con_kar_cos_positivo,
    SUM(CASE WHEN kar_cos = 0 THEN 1 ELSE 0 END) AS con_kar_cos_cero,
    AVG(kar_cos) AS kar_cos_promedio,
    MIN(kar_cos) AS kar_cos_minimo,
    MAX(kar_cos) AS kar_cos_maximo
FROM dbo.facturakardes
WHERE kar_nat = '-';

PRINT '';

-- =============================================
-- PASO 5: Reporte de productos sin costo
-- =============================================
PRINT 'Paso 5: Productos vendidos SIN COSTO asignado...';
PRINT '---------------------------------------------------';

SELECT TOP 20
    a.art_cod,
    a.art_nom,
    COUNT(*) AS lineas_vendidas,
    SUM(fk.kar_uni) AS unidades_vendidas,
    SUM(fk.kar_total) AS ventas_totales
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE fk.kar_nat = '-'
  AND fk.kar_cos = 0
GROUP BY a.art_cod, a.art_nom
ORDER BY SUM(fk.kar_total) DESC;

PRINT '';
PRINT '⚠️  NOTA: Los productos anteriores tienen kar_cos = 0';
PRINT '   Esto puede ser porque:';
PRINT '   - No tienen art_bod_cos_cat asignado en articulosdetalle';
PRINT '   - El costo aún no ha sido calculado';
PRINT '   - Son productos de servicio sin costo';
PRINT '';

-- =============================================
-- PASO 6: Validación de consistencia
-- =============================================
PRINT 'Paso 6: Validación de consistencia...';
PRINT '---------------------------------------';

-- Comparar kar_cos vs art_bod_cos_cat actual
SELECT TOP 10
    fk.fac_sec,
    a.art_cod,
    a.art_nom,
    fk.kar_cos AS costo_guardado_en_kardex,
    ad.art_bod_cos_cat AS costo_actual_articulosdetalle,
    fk.kar_pre AS precio_venta,
    fk.kar_total AS total_venta,
    (fk.kar_total - (fk.kar_uni * fk.kar_cos)) AS utilidad_calculada
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
LEFT JOIN dbo.articulosdetalle ad
    ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1
    AND ad.bod_sec = '1'
WHERE fk.kar_nat = '-'
  AND fk.kar_cos > 0
ORDER BY fk.fac_sec DESC;

PRINT '';
PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'IMPORTANTE:';
PRINT '- Los datos poblados usan el costo ACTUAL (estimación)';
PRINT '- No es el costo histórico real del momento de la venta';
PRINT '- A partir de ahora, nuevas ventas deben grabar kar_cos en tiempo real';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Ejecutar: 08_modificar_vista_usar_kar_cos.sql';
PRINT '2. Modificar backend para incluir kar_cos en nuevas ventas';
PRINT '3. Validar dashboard de ventas con rentabilidad real';
PRINT '';
GO
