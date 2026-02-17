/**
 * ========================================
 * SCRIPT: Mantenimiento y Optimización de Base de Datos
 * ========================================
 * Fecha: 2026-02-17
 * Base de datos: SyscomElRedentor (SQL Server)
 * Versión: 1.0
 *
 * DESCRIPCIÓN:
 * Script completo de mantenimiento preventivo que incluye:
 * - Reindexación de todas las tablas
 * - Actualización de estadísticas
 * - Limpieza de índices fragmentados
 * - Verificación de integridad
 * - Optimización de espacio
 * - Análisis de rendimiento
 *
 * IMPORTANTE:
 * - Ejecutar en ventana de mantenimiento (fuera de horario laboral)
 * - Hacer BACKUP antes de ejecutar
 * - Tiempo estimado: 30-60 minutos (depende del tamaño de BD)
 * - Requiere permisos de db_owner o sysadmin
 *
 * FRECUENCIA RECOMENDADA:
 * - Reindexación: Semanal (domingos en la noche)
 * - Estadísticas: Diario
 * - Integridad: Mensual
 */

USE [SyscomElRedentor]; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

PRINT '';
PRINT '========================================';
PRINT 'MANTENIMIENTO Y OPTIMIZACIÓN DE BD';
PRINT '========================================';
PRINT 'Base de datos: ' + DB_NAME();
PRINT 'Fecha inicio: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT '⚠️  IMPORTANTE: Este proceso puede tardar 30-60 minutos';
PRINT '   Asegúrate de ejecutar en ventana de mantenimiento';
PRINT '';

-- =============================================
-- PASO 0: Hacer Backup Previo (RECOMENDADO)
-- =============================================
PRINT '========================================';
PRINT 'PASO 0: Backup de Base de Datos';
PRINT '========================================';
PRINT '';
PRINT 'Se RECOMIENDA hacer backup antes del mantenimiento.';
PRINT 'Comando sugerido:';
PRINT '';
PRINT 'BACKUP DATABASE [' + DB_NAME() + ']';
PRINT 'TO DISK = ''C:\Backups\' + DB_NAME() + '_PreMantenimiento_' + CONVERT(VARCHAR, GETDATE(), 112) + '.bak''';
PRINT 'WITH FORMAT, INIT, COMPRESSION;';
PRINT '';
PRINT 'Presiona CTRL+C si necesitas hacer backup primero.';
PRINT 'Esperando 10 segundos antes de continuar...';
PRINT '';

WAITFOR DELAY '00:00:10';

-- =============================================
-- PASO 1: Verificar Integridad de la BD
-- =============================================
PRINT '========================================';
PRINT 'PASO 1: Verificando Integridad';
PRINT '========================================';
PRINT '';
PRINT 'Ejecutando DBCC CHECKDB...';

DBCC CHECKDB ([SyscomElRedentor]) WITH NO_INFOMSGS, ALL_ERRORMSGS;

IF @@ERROR = 0
    PRINT '✓ Integridad de BD verificada correctamente';
ELSE
BEGIN
    PRINT '❌ ERROR: Se encontraron problemas de integridad';
    PRINT '   Revisar mensajes anteriores y ejecutar reparación si es necesario';
END

PRINT '';

-- =============================================
-- PASO 2: Análisis de Fragmentación de Índices
-- =============================================
PRINT '========================================';
PRINT 'PASO 2: Analizando Fragmentación';
PRINT '========================================';
PRINT '';

-- Tabla temporal para almacenar índices fragmentados
IF OBJECT_ID('tempdb..#FragmentedIndexes') IS NOT NULL
    DROP TABLE #FragmentedIndexes;

CREATE TABLE #FragmentedIndexes (
    SchemaName NVARCHAR(128),
    TableName NVARCHAR(128),
    IndexName NVARCHAR(128),
    FragmentationPercent FLOAT,
    PageCount BIGINT,
    Action NVARCHAR(20)
);

INSERT INTO #FragmentedIndexes
SELECT
    SCHEMA_NAME(t.schema_id) AS SchemaName,
    t.name AS TableName,
    i.name AS IndexName,
    ps.avg_fragmentation_in_percent AS FragmentationPercent,
    ps.page_count AS PageCount,
    CASE
        WHEN ps.avg_fragmentation_in_percent > 30 AND ps.page_count > 1000 THEN 'REBUILD'
        WHEN ps.avg_fragmentation_in_percent > 10 AND ps.page_count > 1000 THEN 'REORGANIZE'
        ELSE 'OK'
    END AS Action
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ps
INNER JOIN sys.tables t ON t.object_id = ps.object_id
INNER JOIN sys.indexes i ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE ps.avg_fragmentation_in_percent > 10
  AND ps.page_count > 1000
  AND i.name IS NOT NULL
ORDER BY ps.avg_fragmentation_in_percent DESC;

-- Mostrar resumen de fragmentación
PRINT 'Resumen de Fragmentación:';
PRINT '-------------------------';

SELECT
    Action,
    COUNT(*) AS TotalIndexes,
    AVG(FragmentationPercent) AS AvgFragmentation,
    SUM(PageCount) AS TotalPages
FROM #FragmentedIndexes
GROUP BY Action
ORDER BY
    CASE Action
        WHEN 'REBUILD' THEN 1
        WHEN 'REORGANIZE' THEN 2
        ELSE 3
    END;

PRINT '';
PRINT '✓ Análisis de fragmentación completado';
PRINT '';

-- =============================================
-- PASO 3: Reorganizar Índices (Fragmentación 10-30%)
-- =============================================
PRINT '========================================';
PRINT 'PASO 3: Reorganizando Índices';
PRINT '========================================';
PRINT '';

DECLARE @ReorganizeCount INT = 0;

DECLARE @Schema NVARCHAR(128);
DECLARE @Table NVARCHAR(128);
DECLARE @Index NVARCHAR(128);
DECLARE @SQL NVARCHAR(MAX);

DECLARE reorganize_cursor CURSOR FOR
SELECT SchemaName, TableName, IndexName
FROM #FragmentedIndexes
WHERE Action = 'REORGANIZE';

OPEN reorganize_cursor;
FETCH NEXT FROM reorganize_cursor INTO @Schema, @Table, @Index;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @SQL = N'ALTER INDEX [' + @Index + '] ON [' + @Schema + '].[' + @Table + '] REORGANIZE;';

    PRINT 'Reorganizando: ' + @Schema + '.' + @Table + '.' + @Index;

    BEGIN TRY
        EXEC sp_executesql @SQL;
        SET @ReorganizeCount = @ReorganizeCount + 1;
    END TRY
    BEGIN CATCH
        PRINT '  ⚠️  Error al reorganizar: ' + ERROR_MESSAGE();
    END CATCH

    FETCH NEXT FROM reorganize_cursor INTO @Schema, @Table, @Index;
END

CLOSE reorganize_cursor;
DEALLOCATE reorganize_cursor;

PRINT '';
PRINT '✓ Índices reorganizados: ' + CAST(@ReorganizeCount AS VARCHAR);
PRINT '';

-- =============================================
-- PASO 4: Reconstruir Índices (Fragmentación > 30%)
-- =============================================
PRINT '========================================';
PRINT 'PASO 4: Reconstruyendo Índices';
PRINT '========================================';
PRINT '';
PRINT '⏳ Este paso puede tardar varios minutos...';
PRINT '';

DECLARE @RebuildCount INT = 0;

DECLARE rebuild_cursor CURSOR FOR
SELECT SchemaName, TableName, IndexName
FROM #FragmentedIndexes
WHERE Action = 'REBUILD';

OPEN rebuild_cursor;
FETCH NEXT FROM rebuild_cursor INTO @Schema, @Table, @Index;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @SQL = N'ALTER INDEX [' + @Index + '] ON [' + @Schema + '].[' + @Table + '] REBUILD WITH (ONLINE = OFF, SORT_IN_TEMPDB = ON);';

    PRINT 'Reconstruyendo: ' + @Schema + '.' + @Table + '.' + @Index;

    BEGIN TRY
        EXEC sp_executesql @SQL;
        SET @RebuildCount = @RebuildCount + 1;
    END TRY
    BEGIN CATCH
        PRINT '  ⚠️  Error al reconstruir: ' + ERROR_MESSAGE();
    END CATCH

    FETCH NEXT FROM rebuild_cursor INTO @Schema, @Table, @Index;
END

CLOSE rebuild_cursor;
DEALLOCATE rebuild_cursor;

PRINT '';
PRINT '✓ Índices reconstruidos: ' + CAST(@RebuildCount AS VARCHAR);
PRINT '';

-- =============================================
-- PASO 5: Actualizar Estadísticas
-- =============================================
PRINT '========================================';
PRINT 'PASO 5: Actualizando Estadísticas';
PRINT '========================================';
PRINT '';
PRINT '⏳ Actualizando estadísticas de todas las tablas...';
PRINT '';

-- Actualizar estadísticas con FULLSCAN para mayor precisión
EXEC sp_MSforeachtable 'UPDATE STATISTICS ? WITH FULLSCAN';

PRINT '✓ Estadísticas actualizadas en todas las tablas';
PRINT '';

-- =============================================
-- PASO 6: Limpiar Caché de Planes de Ejecución
-- =============================================
PRINT '========================================';
PRINT 'PASO 6: Limpiando Caché de Planes';
PRINT '========================================';
PRINT '';

-- Limpiar planes de ejecución obsoletos
DBCC FREEPROCCACHE;

PRINT '✓ Caché de planes de ejecución limpiado';
PRINT '';

-- =============================================
-- PASO 7: Optimizar Espacio en Disco
-- =============================================
PRINT '========================================';
PRINT 'PASO 7: Optimizando Espacio';
PRINT '========================================';
PRINT '';

-- Reducir espacio no utilizado
DBCC SHRINKDATABASE ([SyscomElRedentor], 10);

PRINT '✓ Espacio optimizado';
PRINT '';

-- =============================================
-- PASO 8: Análisis de Rendimiento
-- =============================================
PRINT '========================================';
PRINT 'PASO 8: Análisis de Rendimiento';
PRINT '========================================';
PRINT '';

-- Top 10 Tablas más Grandes
PRINT 'Top 10 Tablas Más Grandes:';
PRINT '--------------------------';

SELECT TOP 10
    t.name AS TableName,
    SUM(p.rows) AS TotalRows,
    SUM(a.total_pages) * 8 AS TotalSpaceKB,
    SUM(a.used_pages) * 8 AS UsedSpaceKB,
    (SUM(a.total_pages) - SUM(a.used_pages)) * 8 AS UnusedSpaceKB
FROM sys.tables t
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE t.is_ms_shipped = 0
GROUP BY t.name
ORDER BY SUM(a.total_pages) DESC;

PRINT '';

-- Índices Faltantes Sugeridos
PRINT 'Índices Faltantes Sugeridos (Top 5):';
PRINT '------------------------------------';

SELECT TOP 5
    OBJECT_NAME(mid.object_id) AS TableName,
    'CREATE INDEX IX_' + OBJECT_NAME(mid.object_id) + '_' +
    REPLACE(REPLACE(REPLACE(ISNULL(mid.equality_columns, ''), ', ', '_'), '[', ''), ']', '') AS SuggestedIndexName,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns,
    migs.avg_user_impact AS AvgImpactPercent,
    migs.user_seeks + migs.user_scans AS TotalSeeksScans
FROM sys.dm_db_missing_index_details mid
INNER JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
WHERE mid.database_id = DB_ID()
  AND migs.avg_user_impact > 50
ORDER BY migs.avg_user_impact DESC;

PRINT '';

-- =============================================
-- PASO 9: Verificación Post-Mantenimiento
-- =============================================
PRINT '========================================';
PRINT 'PASO 9: Verificación Final';
PRINT '========================================';
PRINT '';

-- Verificar fragmentación después del mantenimiento
IF OBJECT_ID('tempdb..#FragmentedIndexesAfter') IS NOT NULL
    DROP TABLE #FragmentedIndexesAfter;

CREATE TABLE #FragmentedIndexesAfter (
    SchemaName NVARCHAR(128),
    TableName NVARCHAR(128),
    IndexName NVARCHAR(128),
    FragmentationPercent FLOAT,
    PageCount BIGINT
);

INSERT INTO #FragmentedIndexesAfter
SELECT
    SCHEMA_NAME(t.schema_id) AS SchemaName,
    t.name AS TableName,
    i.name AS IndexName,
    ps.avg_fragmentation_in_percent AS FragmentationPercent,
    ps.page_count AS PageCount
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ps
INNER JOIN sys.tables t ON t.object_id = ps.object_id
INNER JOIN sys.indexes i ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE i.name IS NOT NULL
  AND ps.page_count > 1000;

PRINT 'Resumen de Fragmentación Después del Mantenimiento:';
PRINT '---------------------------------------------------';

SELECT
    CASE
        WHEN FragmentationPercent > 30 THEN 'Alta (>30%)'
        WHEN FragmentationPercent > 10 THEN 'Media (10-30%)'
        ELSE 'Baja (<10%)'
    END AS NivelFragmentacion,
    COUNT(*) AS TotalIndexes,
    AVG(FragmentationPercent) AS FragmentacionPromedio
FROM #FragmentedIndexesAfter
GROUP BY
    CASE
        WHEN FragmentationPercent > 30 THEN 'Alta (>30%)'
        WHEN FragmentationPercent > 10 THEN 'Media (10-30%)'
        ELSE 'Baja (<10%)'
    END
ORDER BY AVG(FragmentationPercent) DESC;

PRINT '';

-- =============================================
-- PASO 10: Reporte Final
-- =============================================
PRINT '========================================';
PRINT 'REPORTE FINAL DE MANTENIMIENTO';
PRINT '========================================';
PRINT '';
PRINT 'Base de datos: ' + DB_NAME();
PRINT 'Fecha fin: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT 'Resumen de Operaciones:';
PRINT '-----------------------';
PRINT '✓ Integridad verificada';
PRINT '✓ Índices reorganizados: ' + CAST(@ReorganizeCount AS VARCHAR);
PRINT '✓ Índices reconstruidos: ' + CAST(@RebuildCount AS VARCHAR);
PRINT '✓ Estadísticas actualizadas';
PRINT '✓ Caché de planes limpiado';
PRINT '✓ Espacio optimizado';
PRINT '';

-- Tamaño de la BD
PRINT 'Tamaño de Base de Datos:';
PRINT '------------------------';

SELECT
    name AS FileName,
    size / 128 AS SizeMB,
    CASE
        WHEN max_size = -1 THEN 'Ilimitado'
        ELSE CAST(max_size / 128 AS VARCHAR) + ' MB'
    END AS MaxSize,
    CASE
        WHEN growth = 0 THEN 'Sin crecimiento'
        WHEN is_percent_growth = 1 THEN CAST(growth AS VARCHAR) + '%'
        ELSE CAST(growth / 128 AS VARCHAR) + ' MB'
    END AS GrowthSetting
FROM sys.database_files;

PRINT '';
PRINT '========================================';
PRINT '✓ MANTENIMIENTO COMPLETADO EXITOSAMENTE';
PRINT '========================================';
PRINT '';
PRINT 'Recomendaciones:';
PRINT '----------------';
PRINT '1. Ejecutar este script semanalmente (domingos en la noche)';
PRINT '2. Actualizar estadísticas diariamente con: EXEC sp_updatestats';
PRINT '3. Monitorear índices faltantes y crearlos si es necesario';
PRINT '4. Revisar y optimizar queries lentas';
PRINT '5. Mantener backups regulares antes de cada mantenimiento';
PRINT '';
PRINT 'Próxima ejecución recomendada: ' + CONVERT(VARCHAR, DATEADD(DAY, 7, GETDATE()), 120);
PRINT '';

-- Limpiar tablas temporales
DROP TABLE #FragmentedIndexes;
DROP TABLE #FragmentedIndexesAfter;

GO

-- =============================================
-- Script Adicional: Actualización Rápida Diaria
-- =============================================

PRINT '';
PRINT '========================================';
PRINT 'SCRIPT DE MANTENIMIENTO DIARIO';
PRINT '========================================';
PRINT '';
PRINT 'Para mantenimiento diario (ejecutar en 5 minutos):';
PRINT '';
PRINT '-- Actualizar estadísticas solamente';
PRINT 'EXEC sp_updatestats;';
PRINT '';
PRINT '-- Limpiar caché de planes';
PRINT 'DBCC FREEPROCCACHE;';
PRINT '';
PRINT 'Guardar como: mantenimiento_diario.sql';
PRINT '';
GO
