-- =====================================================
-- DIAGNÓSTICO ESPECÍFICO TABLA FACTURAKARDES
-- Script 2: Análisis detallado de la tabla problemática
-- =====================================================

-- 1. INFORMACIÓN DE ÍNDICES EN FACTURAKARDES
SELECT
    i.name AS 'Nombre Índice',
    i.type_desc AS 'Tipo',
    i.is_unique AS 'Es Único',
    i.is_primary_key AS 'Es PK',
    COL_NAME(ic.object_id, ic.column_id) AS 'Columna',
    ic.key_ordinal AS 'Posición en Índice',
    ic.is_included_column AS 'Es Incluido'
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE i.object_id = OBJECT_ID('facturakardes')
ORDER BY i.name, ic.key_ordinal;

-- 2. ESTADÍSTICAS DE USO DE ÍNDICES
SELECT
    OBJECT_NAME(s.object_id) AS 'Tabla',
    i.name AS 'Índice',
    s.user_seeks AS 'Búsquedas',
    s.user_scans AS 'Escaneos',
    s.user_lookups AS 'Lookups',
    s.user_updates AS 'Actualizaciones',
    s.last_user_seek AS 'Última Búsqueda',
    s.last_user_scan AS 'Último Escaneo'
FROM sys.dm_db_index_usage_stats s
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE OBJECT_NAME(s.object_id) = 'facturakardes'
AND s.database_id = DB_ID()
ORDER BY s.user_seeks + s.user_scans + s.user_lookups DESC;

-- 3. ÍNDICES FALTANTES SUGERIDOS POR SQL SERVER
SELECT
    d.statement AS 'Tabla',
    d.equality_columns AS 'Columnas Igualdad',
    d.inequality_columns AS 'Columnas Desigualdad',
    d.included_columns AS 'Columnas Incluidas',
    s.avg_total_user_cost AS 'Costo Promedio',
    s.avg_user_impact AS 'Mejora Estimada %',
    s.user_seeks + s.user_scans AS 'Veces Usado',
    'CREATE NONCLUSTERED INDEX IX_facturakardes_' +
    REPLACE(REPLACE(REPLACE(ISNULL(d.equality_columns, ''), ', ', '_'), '[', ''), ']', '') +
    ' ON ' + d.statement +
    ' (' + ISNULL(d.equality_columns, '') +
    CASE WHEN d.inequality_columns IS NOT NULL THEN ', ' + d.inequality_columns ELSE '' END + ')' +
    CASE WHEN d.included_columns IS NOT NULL THEN ' INCLUDE (' + d.included_columns + ')' ELSE '' END AS 'SQL Sugerido'
FROM sys.dm_db_missing_index_details d
INNER JOIN sys.dm_db_missing_index_groups g ON d.index_handle = g.index_handle
INNER JOIN sys.dm_db_missing_index_group_stats s ON g.index_group_handle = s.group_handle
WHERE d.database_id = DB_ID()
AND d.statement LIKE '%facturakardes%'
ORDER BY s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans) DESC;

-- 4. CONSULTAS MÁS COSTOSAS EN FACTURAKARDES
SELECT TOP 20
    qs.execution_count AS 'Ejecuciones',
    qs.total_worker_time / qs.execution_count AS 'CPU Promedio',
    qs.total_elapsed_time / qs.execution_count AS 'Tiempo Promedio (microseg)',
    qs.total_logical_reads / qs.execution_count AS 'Lecturas Promedio',
    qs.total_physical_reads / qs.execution_count AS 'Lecturas Físicas Promedio',
    qs.last_execution_time AS 'Última Ejecución',
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
        ((CASE qs.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset)/2) + 1) AS 'Consulta'
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
WHERE st.text LIKE '%facturakardes%'
AND st.text NOT LIKE '%sys.dm_exec_query_stats%'  -- Excluir esta misma consulta
ORDER BY qs.total_elapsed_time / qs.execution_count DESC;

-- 5. CONTAR REGISTROS Y VERIFICAR TAMAÑO
SELECT
    COUNT(*) AS 'Total Registros',
    COUNT(CASE WHEN kar_fec >= DATEADD(MONTH, -1, GETDATE()) THEN 1 END) AS 'Último Mes',
    COUNT(CASE WHEN kar_fec >= DATEADD(MONTH, -6, GETDATE()) THEN 1 END) AS 'Últimos 6 Meses',
    COUNT(CASE WHEN kar_fec >= DATEADD(YEAR, -1, GETDATE()) THEN 1 END) AS 'Último Año',
    MIN(kar_fec) AS 'Fecha Más Antigua',
    MAX(kar_fec) AS 'Fecha Más Reciente'
FROM facturakardes;

-- 6. VERIFICAR ESTADÍSTICAS DESACTUALIZADAS
SELECT
    OBJECT_NAME(s.object_id) AS 'Tabla',
    s.name AS 'Estadística',
    STATS_DATE(s.object_id, s.stats_id) AS 'Última Actualización',
    DATEDIFF(DAY, STATS_DATE(s.object_id, s.stats_id), GETDATE()) AS 'Días Desde Actualización',
    sp.modification_counter AS 'Modificaciones desde Actualización',
    sp.rows AS 'Filas Muestreadas',
    sp.rows_sampled AS 'Filas en Muestra'
FROM sys.stats s
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE s.object_id = OBJECT_ID('facturakardes')
ORDER BY sp.modification_counter DESC;

-- 7. PLAN DE CONSULTA PARA SELECT SIMPLE
-- Ejecutar con "Include Actual Execution Plan" activado
SET STATISTICS IO ON;
SET STATISTICS TIME ON;

SELECT TOP 100
    kar_sec,
    fac_nro,
    art_sec,
    kar_fec,
    kar_can,
    kar_pre
FROM facturakardes
ORDER BY kar_fec DESC;

SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;

-- 8. VERIFICAR LOCKS EN FACTURAKARDES
SELECT
    tl.request_session_id AS 'Session ID',
    tl.resource_type AS 'Tipo Recurso',
    tl.resource_database_id AS 'DB ID',
    OBJECT_NAME(tl.resource_associated_entity_id) AS 'Tabla',
    tl.request_mode AS 'Modo Lock',
    tl.request_status AS 'Estado',
    wt.wait_type AS 'Tipo Espera',
    wt.wait_duration_ms AS 'Tiempo Espera (ms)'
FROM sys.dm_tran_locks tl
LEFT JOIN sys.dm_os_waiting_tasks wt ON tl.lock_owner_address = wt.resource_address
WHERE tl.resource_database_id = DB_ID()
AND (OBJECT_NAME(tl.resource_associated_entity_id) = 'facturakardes' OR tl.resource_type = 'DATABASE')
ORDER BY wt.wait_duration_ms DESC;

-- 9. DEADLOCKS RECIENTES
SELECT
    XEvent.query('(event/data[@name="xml_report"]/value)[1]').value('(/deadlock)[1]', 'varchar(max)') AS DeadlockGraph,
    XEvent.query('.').value('(event/@timestamp)[1]', 'datetime') AS Timestamp
FROM (
    SELECT CAST(target_data AS XML) AS TargetData
    FROM sys.dm_xe_session_targets st
    JOIN sys.dm_xe_sessions s ON s.address = st.event_session_address
    WHERE s.name = 'system_health'
    AND st.target_name = 'ring_buffer'
) AS Data
CROSS APPLY TargetData.nodes('RingBufferTarget/event[@name="xml_deadlock_report"]') AS XEventData(XEvent)
WHERE XEvent.query('.').value('(event/@timestamp)[1]', 'datetime') >= DATEADD(HOUR, -24, GETDATE());

-- 10. INFORMACIÓN DE ARCHIVO DE BASE DE DATOS
SELECT
    name AS 'Nombre Archivo',
    type_desc AS 'Tipo',
    physical_name AS 'Ubicación Física',
    size * 8 / 1024 AS 'Tamaño (MB)',
    max_size * 8 / 1024 AS 'Tamaño Máximo (MB)',
    growth * 8 / 1024 AS 'Crecimiento (MB)',
    is_percent_growth AS 'Crecimiento en %'
FROM sys.database_files;
