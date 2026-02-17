/**
 * ========================================
 * DIAGNÓSTICO DE BLOQUEOS EN SQL SERVER
 * ========================================
 * Fecha: 2026-02-17
 *
 * INSTRUCCIONES:
 * Ejecutar cada sección por separado para diagnosticar
 * qué está causando los bloqueos en facturakardes.
 *
 * NO requiere reiniciar el servidor.
 * ========================================
 */

-- =============================================
-- 1. VER SESIONES BLOQUEADAS AHORA MISMO
-- =============================================
-- Muestra qué sesiones están bloqueadas y QUIÉN las bloquea
SELECT
    r.session_id AS sesion_bloqueada,
    r.blocking_session_id AS sesion_que_bloquea,
    r.wait_type,
    r.wait_time / 1000 AS espera_segundos,
    r.status,
    r.command,
    DB_NAME(r.database_id) AS base_datos,
    t.text AS query_bloqueada,
    r.cpu_time,
    r.total_elapsed_time / 1000 AS tiempo_total_segundos
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.blocking_session_id > 0
ORDER BY r.wait_time DESC;

-- =============================================
-- 2. VER LA CADENA COMPLETA DE BLOQUEOS
-- =============================================
-- Identifica el "cabeza" del bloqueo (la sesión raíz que bloquea a todas)
SELECT
    s.session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    s.status,
    s.last_request_start_time,
    s.last_request_end_time,
    CASE
        WHEN r.blocking_session_id > 0 THEN 'BLOQUEADA por ' + CAST(r.blocking_session_id AS VARCHAR)
        WHEN EXISTS (SELECT 1 FROM sys.dm_exec_requests r2 WHERE r2.blocking_session_id = s.session_id)
            THEN '⚠️ ESTA SESIÓN ESTÁ BLOQUEANDO A OTRAS'
        ELSE 'Normal'
    END AS estado_bloqueo,
    ISNULL(t.text, '(sin query activa)') AS query_actual,
    r.wait_type,
    r.wait_time / 1000 AS espera_seg
FROM sys.dm_exec_sessions s
LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE s.database_id = DB_ID()
  AND s.session_id != @@SPID  -- Excluir esta sesión
  AND s.is_user_process = 1
ORDER BY
    CASE
        WHEN EXISTS (SELECT 1 FROM sys.dm_exec_requests r2 WHERE r2.blocking_session_id = s.session_id) THEN 0
        WHEN r.blocking_session_id > 0 THEN 1
        ELSE 2
    END,
    s.last_request_start_time;

-- =============================================
-- 3. VER LOCKS EN FACTURAKARDES ESPECÍFICAMENTE
-- =============================================
-- Muestra todos los locks activos sobre la tabla facturakardes
SELECT
    l.request_session_id AS session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    l.resource_type,
    l.request_mode,
    l.request_status,
    l.resource_description,
    t.text AS query
FROM sys.dm_tran_locks l
INNER JOIN sys.dm_exec_sessions s ON l.request_session_id = s.session_id
LEFT JOIN sys.dm_exec_requests r ON l.request_session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE l.resource_database_id = DB_ID()
  AND l.resource_associated_entity_id = OBJECT_ID('dbo.facturakardes')
ORDER BY l.request_session_id;

-- =============================================
-- 4. VER TRANSACCIONES ABIERTAS (NO CERRADAS)
-- =============================================
-- ⚠️ CAUSA MÁS COMÚN: Una transacción que se abrió (BEGIN TRAN)
-- pero nunca se cerró (COMMIT/ROLLBACK)
SELECT
    t.transaction_id,
    t.name AS tipo_transaccion,
    t.transaction_begin_time,
    DATEDIFF(MINUTE, t.transaction_begin_time, GETDATE()) AS minutos_abierta,
    CASE t.transaction_state
        WHEN 0 THEN 'No inicializada'
        WHEN 1 THEN 'Inicializada (no comenzada)'
        WHEN 2 THEN '⚠️ ACTIVA'
        WHEN 3 THEN 'Terminada (solo lectura)'
        WHEN 4 THEN 'Commit iniciado'
        WHEN 5 THEN 'Preparada (distribuida)'
        WHEN 6 THEN 'Committed'
        WHEN 7 THEN 'Rolling back'
        WHEN 8 THEN 'Rolled back'
    END AS estado,
    s.session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    s.last_request_start_time,
    s.last_request_end_time,
    txt.text AS ultimo_query
FROM sys.dm_tran_active_transactions t
INNER JOIN sys.dm_tran_session_transactions st ON t.transaction_id = st.transaction_id
INNER JOIN sys.dm_exec_sessions s ON st.session_id = s.session_id
LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(ISNULL(r.sql_handle, s.most_recent_sql_handle)) txt
WHERE s.is_user_process = 1
ORDER BY t.transaction_begin_time;

-- =============================================
-- 5. QUERIES MÁS LENTAS EJECUTÁNDOSE AHORA
-- =============================================
SELECT
    r.session_id,
    r.status,
    r.command,
    r.wait_type,
    r.wait_time / 1000 AS espera_seg,
    r.total_elapsed_time / 1000 AS tiempo_total_seg,
    r.cpu_time / 1000 AS cpu_seg,
    r.reads,
    r.writes,
    r.logical_reads,
    r.blocking_session_id,
    t.text AS query,
    qp.query_plan
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
CROSS APPLY sys.dm_exec_query_plan(r.plan_handle) qp
WHERE r.session_id != @@SPID
  AND r.status != 'background'
ORDER BY r.total_elapsed_time DESC;

-- =============================================
-- 6. DEADLOCKS RECIENTES (si hay trace activo)
-- =============================================
-- Busca deadlocks en el event log del sistema
SELECT
    xdr.value('@timestamp', 'datetime2') AS fecha_deadlock,
    xdr.query('.') AS detalle_deadlock
FROM (
    SELECT CAST(target_data AS XML) AS TargetData
    FROM sys.dm_xe_session_targets st
    INNER JOIN sys.dm_xe_sessions s ON s.address = st.event_session_address
    WHERE s.name = 'system_health'
      AND st.target_name = 'ring_buffer'
) AS Data
CROSS APPLY TargetData.nodes('RingBufferTarget/event[@name="xml_deadlock_report"]') AS XEventData(xdr)
ORDER BY xdr.value('@timestamp', 'datetime2') DESC;

GO

-- =============================================
-- =============================================
-- 🔧 SOLUCIONES (EJECUTAR SOLO SI CONFIRMAS EL PROBLEMA)
-- =============================================
-- =============================================

-- =============================================
-- SOLUCIÓN A: MATAR UNA SESIÓN QUE BLOQUEA
-- =============================================
-- ⚠️ Reemplaza [ID] con el session_id que está bloqueando
-- KILL [ID];

-- Ejemplo:
-- KILL 55;


-- =============================================
-- SOLUCIÓN B: MATAR TODAS LAS SESIONES QUE BLOQUEAN
-- =============================================
-- ⚠️ USAR CON CUIDADO - mata todas las sesiones bloqueadoras

/*
DECLARE @sql NVARCHAR(MAX) = '';

SELECT @sql = @sql + 'KILL ' + CAST(session_id AS VARCHAR) + '; '
FROM sys.dm_exec_sessions
WHERE session_id IN (
    SELECT DISTINCT blocking_session_id
    FROM sys.dm_exec_requests
    WHERE blocking_session_id > 0
)
AND session_id != @@SPID;

PRINT 'Ejecutando: ' + @sql;
EXEC sp_executesql @sql;
*/


-- =============================================
-- SOLUCIÓN C: CONFIGURAR TIMEOUT PARA EVITAR
-- BLOQUEOS INDEFINIDOS EN EL FUTURO
-- =============================================

/*
-- Timeout de lock a 30 segundos (en vez de infinito)
-- Ejecutar esto a nivel de la base de datos:
ALTER DATABASE [SyscomElRedentor] SET LOCK_TIMEOUT 30000;

-- O a nivel de sesión (poner en tu API al iniciar conexión):
-- SET LOCK_TIMEOUT 30000;  -- 30 segundos
*/


-- =============================================
-- SOLUCIÓN D: HABILITAR READ COMMITTED SNAPSHOT
-- =============================================
-- Esta es la MEJOR solución a largo plazo.
-- Los SELECTs ya no se bloquean con los UPDATEs/INSERTs.
-- ⚠️ REQUIERE que nadie esté conectado a la BD.

/*
-- Paso 1: Poner BD en single user (fuera de horario)
ALTER DATABASE [SyscomElRedentor] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;

-- Paso 2: Habilitar RCSI
ALTER DATABASE [SyscomElRedentor] SET READ_COMMITTED_SNAPSHOT ON;

-- Paso 3: Volver a multi user
ALTER DATABASE [SyscomElRedentor] SET MULTI_USER;

-- Verificar:
SELECT name, is_read_committed_snapshot_on
FROM sys.databases
WHERE name = DB_NAME();
*/
