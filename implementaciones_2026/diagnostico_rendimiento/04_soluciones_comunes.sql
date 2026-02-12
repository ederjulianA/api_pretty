-- =====================================================
-- SOLUCIONES COMUNES A PROBLEMAS DE RENDIMIENTO
-- Script 4: Optimizaciones y mantenimiento
-- =====================================================

-- ============================================
-- 1. ACTUALIZAR ESTADÍSTICAS
-- ============================================
-- Las estadísticas desactualizadas causan planes de ejecución ineficientes

-- Actualizar estadísticas de facturakardes
UPDATE STATISTICS facturakardes WITH FULLSCAN;

-- Actualizar estadísticas de todas las tablas principales
UPDATE STATISTICS factura WITH FULLSCAN;
UPDATE STATISTICS articulos WITH FULLSCAN;
UPDATE STATISTICS articulosdetalle WITH FULLSCAN;
UPDATE STATISTICS nit WITH FULLSCAN;

-- Ver cuándo se actualizaron las estadísticas
SELECT
    OBJECT_NAME(s.object_id) AS TableName,
    s.name AS StatisticName,
    STATS_DATE(s.object_id, s.stats_id) AS LastUpdated,
    DATEDIFF(DAY, STATS_DATE(s.object_id, s.stats_id), GETDATE()) AS DaysSinceUpdate
FROM sys.stats s
WHERE OBJECT_NAME(s.object_id) IN ('facturakardes', 'factura', 'articulos', 'articulosdetalle')
ORDER BY LastUpdated DESC;

-- ============================================
-- 2. RECONSTRUIR/REORGANIZAR ÍNDICES
-- ============================================
-- La fragmentación > 30% requiere REBUILD
-- La fragmentación entre 10-30% requiere REORGANIZE

-- Verificar fragmentación
SELECT
    OBJECT_NAME(ps.object_id) AS TableName,
    i.name AS IndexName,
    ps.avg_fragmentation_in_percent,
    ps.page_count,
    CASE
        WHEN ps.avg_fragmentation_in_percent > 30 THEN 'REBUILD'
        WHEN ps.avg_fragmentation_in_percent > 10 THEN 'REORGANIZE'
        ELSE 'OK'
    END AS Recommendation
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'DETAILED') ps
INNER JOIN sys.indexes i ON ps.object_id = i.object_id AND ps.index_id = i.index_id
WHERE ps.page_count > 100
AND OBJECT_NAME(ps.object_id) IN ('facturakardes', 'factura', 'articulos', 'articulosdetalle')
ORDER BY ps.avg_fragmentation_in_percent DESC;

-- Reorganizar índices (online, menos bloqueos)
ALTER INDEX ALL ON facturakardes REORGANIZE;

-- Reconstruir índices (más completo pero causa bloqueos)
-- CUIDADO: Ejecutar en horario de bajo uso
-- ALTER INDEX ALL ON facturakardes REBUILD WITH (ONLINE = ON);  -- Enterprise Edition
ALTER INDEX ALL ON facturakardes REBUILD;  -- Standard Edition

-- ============================================
-- 3. MATAR PROCESOS BLOQUEADORES
-- ============================================
-- CUIDADO: Solo usar cuando se identifica un proceso bloqueador problemático

-- Primero identificar el bloqueador
SELECT
    blocking_session_id AS Bloqueador,
    session_id AS Bloqueado,
    wait_type,
    wait_time,
    wait_resource
FROM sys.dm_exec_requests
WHERE blocking_session_id <> 0;

-- Ver qué está haciendo el bloqueador
-- Reemplazar @SessionID con el ID del bloqueador
DECLARE @SessionID INT = 0;  -- CAMBIAR ESTO

SELECT
    s.session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    s.status,
    r.start_time,
    r.command,
    t.text AS SQLText
FROM sys.dm_exec_sessions s
LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE s.session_id = @SessionID;

-- Matar el proceso bloqueador (SOLO SI ES SEGURO)
-- KILL @SessionID;

-- ============================================
-- 4. LIMPIAR CACHE DE PLANES DE EJECUCIÓN
-- ============================================
-- CUIDADO: Causa picos temporales de CPU mientras se regeneran planes
-- Solo ejecutar si se sospecha de planes obsoletos

-- Limpiar cache de planes específico de la base de datos
DECLARE @DatabaseID INT = DB_ID();
DBCC FREEPROCCACHE (@DatabaseID);

-- O limpiar todo (más drástico)
-- DBCC FREEPROCCACHE;

-- Limpiar buffer pool (MUCHO CUIDADO - causa lentitud temporal)
-- SOLO en desarrollo/pruebas, NUNCA en producción durante horas de uso
-- DBCC DROPCLEANBUFFERS;

-- ============================================
-- 5. OPTIMIZAR AUTO_UPDATE_STATISTICS
-- ============================================
-- Asegurar que las estadísticas se actualicen automáticamente

-- Ver configuración actual
SELECT
    name,
    is_auto_create_stats_on,
    is_auto_update_stats_on,
    is_auto_update_stats_async_on
FROM sys.databases
WHERE name = DB_NAME();

-- Habilitar actualización automática de estadísticas
ALTER DATABASE [TU_BASE_DATOS] SET AUTO_CREATE_STATISTICS ON;
ALTER DATABASE [TU_BASE_DATOS] SET AUTO_UPDATE_STATISTICS ON;
-- Considerar async para no bloquear consultas
ALTER DATABASE [TU_BASE_DATOS] SET AUTO_UPDATE_STATISTICS_ASYNC ON;

-- ============================================
-- 6. CREAR ÍNDICES RECOMENDADOS
-- ============================================
-- Basado en patrones comunes de consulta en facturakardes

-- Índice para búsquedas por fecha (si no existe)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_facturakardes_kar_fec' AND object_id = OBJECT_ID('facturakardes'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_facturakardes_kar_fec
    ON facturakardes(kar_fec DESC)
    INCLUDE (kar_sec, fac_nro, art_sec, kar_can, kar_pre);
END

-- Índice para búsquedas por factura (si no existe)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_facturakardes_fac_nro' AND object_id = OBJECT_ID('facturakardes'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_facturakardes_fac_nro
    ON facturakardes(fac_nro)
    INCLUDE (kar_sec, art_sec, kar_fec, kar_can, kar_pre);
END

-- Índice para búsquedas por artículo (si no existe)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_facturakardes_art_sec' AND object_id = OBJECT_ID('facturakardes'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_facturakardes_art_sec
    ON facturakardes(art_sec)
    INCLUDE (kar_sec, fac_nro, kar_fec, kar_can, kar_pre);
END

-- ============================================
-- 7. CONFIGURAR MEMORIA MÁXIMA DE SQL SERVER
-- ============================================
-- Dejar memoria para el SO (mínimo 2-4 GB según RAM total)

-- Ver configuración actual
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'max server memory (MB)';

-- Ejemplo: Servidor con 16 GB RAM
-- Dejar 4 GB para Windows = 12 GB (12288 MB) para SQL Server
-- EXEC sp_configure 'max server memory (MB)', 12288;
-- RECONFIGURE;

-- ============================================
-- 8. OPTIMIZAR CONFIGURACIÓN DE PARALELISMO
-- ============================================

-- Ver configuración actual
EXEC sp_configure 'max degree of parallelism';
EXEC sp_configure 'cost threshold for parallelism';

-- Recomendaciones generales:
-- - max degree of parallelism: Número de cores físicos (no lógicos) o 8 (lo que sea menor)
-- - cost threshold for parallelism: 50 (default es 5, muy bajo)

-- Ejemplo para servidor con 8 cores
-- EXEC sp_configure 'show advanced options', 1;
-- RECONFIGURE;
-- EXEC sp_configure 'max degree of parallelism', 4;
-- EXEC sp_configure 'cost threshold for parallelism', 50;
-- RECONFIGURE;

-- ============================================
-- 9. SHRINK DE LOG (SOLO SI ESTÁ MUY GRANDE)
-- ============================================
-- CUIDADO: No ejecutar frecuentemente, causa fragmentación

-- Ver tamaño del log
DBCC SQLPERF(LOGSPACE);

-- Si el log está > 70% usado, hacer backup primero
BACKUP LOG [TU_BASE_DATOS] TO DISK = 'C:\Backup\TuBaseDatos_log.trn';

-- Luego shrink (ajustar tamaño según necesidad)
-- DBCC SHRINKFILE (nombre_archivo_log, tamaño_objetivo_MB);

-- Mejor práctica: Configurar backup automático de logs
-- en lugar de hacer shrink manual

-- ============================================
-- 10. ARCHIVAR DATOS HISTÓRICOS
-- ============================================
-- Si facturakardes tiene millones de registros viejos

-- Ejemplo: Mover registros > 2 años a tabla histórica
-- PRIMERO crear tabla histórica (si no existe)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'facturakardes_historico')
BEGIN
    SELECT TOP 0 * INTO facturakardes_historico FROM facturakardes;

    -- Agregar mismo clustered index
    CREATE CLUSTERED INDEX CIX_facturakardes_historico_kar_sec
    ON facturakardes_historico(kar_sec);
END

-- Mover datos viejos (hacer en lotes pequeños para no bloquear)
-- Ajustar fecha según política de retención
DECLARE @FechaCorte DATE = DATEADD(YEAR, -2, GETDATE());
DECLARE @BatchSize INT = 10000;
DECLARE @RowCount INT = 1;

WHILE @RowCount > 0
BEGIN
    BEGIN TRANSACTION;

    -- Mover lote
    INSERT INTO facturakardes_historico
    SELECT TOP (@BatchSize) *
    FROM facturakardes
    WHERE kar_fec < @FechaCorte;

    SET @RowCount = @@ROWCOUNT;

    -- Eliminar movidos
    DELETE TOP (@BatchSize) FROM facturakardes
    WHERE kar_fec < @FechaCorte;

    COMMIT TRANSACTION;

    -- Pausa para no saturar
    WAITFOR DELAY '00:00:01';
END

-- ============================================
-- 11. MONITOREAR CRECIMIENTO DE ARCHIVOS
-- ============================================

-- Ver eventos de crecimiento automático recientes
-- Muchos crecimientos = configuración incorrecta
SELECT
    CONVERT(VARCHAR(20), DATEADD(ms, -1 * (inf.cpu_time - req.cpu_time), GETDATE()), 120) AS EventTime,
    req.session_id,
    req.command,
    req.percent_complete,
    req.estimated_completion_time,
    DB_NAME(req.database_id) AS DatabaseName
FROM sys.dm_exec_requests req
WHERE req.command LIKE 'DbccFilesCompact%'
   OR req.command LIKE 'ALTER DATABASE%';

-- ============================================
-- 12. CREAR PLAN DE MANTENIMIENTO
-- ============================================

-- Script para ejecutar semanalmente en horario de bajo uso
-- Guardar como Job de SQL Agent

-- Paso 1: Actualizar estadísticas
UPDATE STATISTICS facturakardes WITH FULLSCAN;
UPDATE STATISTICS factura WITH FULLSCAN;
UPDATE STATISTICS articulos WITH FULLSCAN;
UPDATE STATISTICS articulosdetalle WITH FULLSCAN;

-- Paso 2: Reorganizar índices fragmentados
DECLARE @TableName NVARCHAR(255);
DECLARE @IndexName NVARCHAR(255);
DECLARE @Fragmentation FLOAT;
DECLARE @SQL NVARCHAR(MAX);

DECLARE index_cursor CURSOR FOR
SELECT
    OBJECT_NAME(ps.object_id) AS TableName,
    i.name AS IndexName,
    ps.avg_fragmentation_in_percent
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ps
INNER JOIN sys.indexes i ON ps.object_id = i.object_id AND ps.index_id = i.index_id
WHERE ps.avg_fragmentation_in_percent > 10
AND ps.page_count > 100
AND OBJECT_NAME(ps.object_id) IN ('facturakardes', 'factura', 'articulos', 'articulosdetalle');

OPEN index_cursor;
FETCH NEXT FROM index_cursor INTO @TableName, @IndexName, @Fragmentation;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF @Fragmentation > 30
        SET @SQL = 'ALTER INDEX [' + @IndexName + '] ON [' + @TableName + '] REBUILD;';
    ELSE
        SET @SQL = 'ALTER INDEX [' + @IndexName + '] ON [' + @TableName + '] REORGANIZE;';

    EXEC sp_executesql @SQL;

    FETCH NEXT FROM index_cursor INTO @TableName, @IndexName, @Fragmentation;
END

CLOSE index_cursor;
DEALLOCATE index_cursor;

-- Paso 3: Limpiar datos viejos de tablas de log (si existen)
-- DELETE FROM dbo.LogEventos WHERE LogFecha < DATEADD(MONTH, -3, GETDATE());

PRINT 'Mantenimiento completado: ' + CONVERT(VARCHAR, GETDATE(), 120);
