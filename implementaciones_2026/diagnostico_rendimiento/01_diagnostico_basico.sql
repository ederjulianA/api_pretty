-- =====================================================
-- DIAGNÓSTICO DE RENDIMIENTO SQL SERVER
-- Script 1: Verificaciones Básicas
-- =====================================================

-- 1. VERIFICAR BLOQUEOS ACTIVOS
-- Identifica procesos que están bloqueando a otros
SELECT
    blocking_session_id AS 'Bloqueador',
    session_id AS 'Bloqueado',
    wait_type AS 'Tipo de Espera',
    wait_time AS 'Tiempo Espera (ms)',
    wait_resource AS 'Recurso',
    text AS 'Consulta'
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle)
WHERE blocking_session_id <> 0
ORDER BY wait_time DESC;

-- 2. PROCESOS ACTIVOS CON MÁS TIEMPO DE EJECUCIÓN
-- Ver qué consultas están corriendo y cuánto tiempo llevan
SELECT
    session_id AS 'Session ID',
    start_time AS 'Inicio',
    DATEDIFF(SECOND, start_time, GETDATE()) AS 'Segundos Ejecutando',
    status AS 'Estado',
    command AS 'Comando',
    cpu_time AS 'CPU Time',
    total_elapsed_time AS 'Tiempo Total (ms)',
    reads AS 'Lecturas',
    writes AS 'Escrituras',
    text AS 'Consulta SQL'
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle)
WHERE session_id > 50  -- Excluir procesos del sistema
ORDER BY total_elapsed_time DESC;

-- 3. ESTADÍSTICAS DE ESPERAS
-- Identifica los cuellos de botella principales
SELECT TOP 10
    wait_type AS 'Tipo de Espera',
    wait_time_ms / 1000.0 AS 'Tiempo Espera (seg)',
    (wait_time_ms * 100.0 / SUM(wait_time_ms) OVER()) AS 'Porcentaje',
    waiting_tasks_count AS 'Tareas Esperando'
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN (
    'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE',
    'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH',
    'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
    'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
    'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 'BROKER_EVENTHANDLER',
    'TRACEWRITE', 'FT_IFTSHC_MUTEX', 'SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
    'BROKER_RECEIVE_WAITFOR', 'ONDEMAND_TASK_QUEUE', 'DBMIRROR_EVENTS_QUEUE',
    'DBMIRRORING_CMD', 'BROKER_TRANSMITTER', 'SQLTRACE_WAIT_ENTRIES',
    'SLEEP_BPOOL_FLUSH', 'SQLTRACE_LOCK', 'DIRTY_PAGE_POLL'
)
AND wait_time_ms > 0
ORDER BY wait_time_ms DESC;

-- 4. VERIFICAR USO DE MEMORIA
SELECT
    (physical_memory_in_use_kb / 1024) AS 'Memoria Física Usada (MB)',
    (locked_page_allocations_kb / 1024) AS 'Páginas Bloqueadas (MB)',
    (total_virtual_address_space_kb / 1024) AS 'Espacio Virtual Total (MB)',
    (virtual_address_space_kb / 1024) AS 'Espacio Virtual Usado (MB)',
    process_physical_memory_low,
    process_virtual_memory_low
FROM sys.dm_os_process_memory;

-- 5. ESTADÍSTICAS DE CPU
SELECT
    SQLProcessUtilization AS 'SQL Server CPU %',
    SystemIdle AS 'Sistema Inactivo %',
    100 - SystemIdle - SQLProcessUtilization AS 'Otros Procesos CPU %'
FROM (
    SELECT TOP 1
        record.value('(./Record/@id)[1]', 'int') AS record_id,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS SystemIdle,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') AS SQLProcessUtilization
    FROM (
        SELECT CAST(record AS XML) AS record
        FROM sys.dm_os_ring_buffers
        WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
        AND record LIKE '%<SystemHealth>%'
    ) AS x
    ORDER BY record_id DESC
) AS y;

-- 6. TRANSACCIONES ABIERTAS (POSIBLES LOCKS)
SELECT
    s.session_id AS 'Session ID',
    t.transaction_id AS 'Transaction ID',
    CASE t.transaction_state
        WHEN 0 THEN 'No inicializada'
        WHEN 1 THEN 'Inicializada, no iniciada'
        WHEN 2 THEN 'Activa'
        WHEN 3 THEN 'Terminada (solo lectura)'
        WHEN 4 THEN 'Preparando commit'
        WHEN 5 THEN 'Preparada, esperando resolución'
        WHEN 6 THEN 'Commited'
        WHEN 7 THEN 'Rollback'
        WHEN 8 THEN 'Revirtiendo'
    END AS 'Estado',
    t.transaction_begin_time AS 'Inicio Transacción',
    DATEDIFF(SECOND, t.transaction_begin_time, GETDATE()) AS 'Segundos Abierta',
    s.host_name AS 'Host',
    s.program_name AS 'Programa',
    s.login_name AS 'Usuario',
    st.text AS 'Última Consulta'
FROM sys.dm_tran_active_transactions t
INNER JOIN sys.dm_tran_session_transactions s_t ON t.transaction_id = s_t.transaction_id
INNER JOIN sys.dm_exec_sessions s ON s.session_id = s_t.session_id
OUTER APPLY sys.dm_exec_sql_text(s.most_recent_sql_handle) st
WHERE s.session_id > 50
ORDER BY t.transaction_begin_time;

-- 7. VERIFICAR FRAGMENTACIÓN DE ÍNDICES
SELECT
    OBJECT_NAME(i.object_id) AS 'Tabla',
    i.name AS 'Índice',
    s.index_type_desc AS 'Tipo',
    s.avg_fragmentation_in_percent AS 'Fragmentación %',
    s.page_count AS 'Páginas'
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') s
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE s.avg_fragmentation_in_percent > 10  -- Mayor a 10% de fragmentación
AND s.page_count > 100  -- Solo índices con más de 100 páginas
AND OBJECT_NAME(i.object_id) LIKE '%factura%'
ORDER BY s.avg_fragmentation_in_percent DESC;

-- 8. TAMAÑO DE TABLAS PRINCIPALES
SELECT
    t.NAME AS 'Tabla',
    p.rows AS 'Filas',
    SUM(a.total_pages) * 8 / 1024 AS 'Espacio Total (MB)',
    SUM(a.used_pages) * 8 / 1024 AS 'Espacio Usado (MB)',
    (SUM(a.total_pages) - SUM(a.used_pages)) * 8 / 1024 AS 'Espacio No Usado (MB)'
FROM sys.tables t
INNER JOIN sys.indexes i ON t.OBJECT_ID = i.object_id
INNER JOIN sys.partitions p ON i.object_id = p.OBJECT_ID AND i.index_id = p.index_id
INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE t.NAME IN ('facturakardes', 'factura', 'articulos', 'articulosdetalle')
AND t.is_ms_shipped = 0
AND i.OBJECT_ID > 255
GROUP BY t.Name, p.Rows
ORDER BY SUM(a.total_pages) DESC;
