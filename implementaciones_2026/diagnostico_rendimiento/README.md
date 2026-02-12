# Guía de Diagnóstico de Rendimiento SQL Server

## 📋 Resumen

Esta guía te ayudará a identificar y resolver problemas de rendimiento en tu servidor SQL Server de producción, específicamente cuando experimentas timeouts en consultas a tablas grandes como `facturakardes`.

## 🔍 Proceso de Diagnóstico

### Paso 1: Identificar el Problema Inmediato

**Ejecutar primero:** `01_diagnostico_basico.sql`

Este script te mostrará:
1. **Bloqueos activos** - Procesos que están impidiendo que otros avancen
2. **Procesos lentos** - Consultas que llevan mucho tiempo ejecutándose
3. **Tipos de espera** - Qué está ralentizando el sistema (CPU, disco, locks, etc.)
4. **Uso de memoria y CPU** - Si hay escasez de recursos
5. **Transacciones abiertas** - Posibles locks olvidados

**Indicadores de alerta:**
- ✅ Si ves `blocking_session_id` > 0 → Hay un proceso bloqueando a otros
- ✅ Si ves `PAGEIOLATCH_*` en esperas → Problema de disco lento
- ✅ Si ves `LCK_*` en esperas → Demasiados locks/contención
- ✅ Si ves `CXPACKET` → Problemas de paralelismo
- ✅ Si `Page Life Expectancy` < 300 → Memoria insuficiente

### Paso 2: Análisis Específico de facturakardes

**Ejecutar segundo:** `02_analisis_facturakardes.sql`

Este script analiza:
1. **Índices existentes** - Qué índices tiene la tabla
2. **Uso de índices** - Si se están usando o están abandonados
3. **Índices faltantes** - SQL Server sugiere qué índices crear
4. **Consultas más costosas** - Qué queries son problemáticas
5. **Fragmentación** - Si los índices están fragmentados
6. **Estadísticas desactualizadas** - Si el optimizador tiene información incorrecta

**Indicadores de alerta:**
- ✅ Si hay índices con 0 seeks/scans → Índices innecesarios (eliminar)
- ✅ Si fragmentación > 30% → Reconstruir índices urgente
- ✅ Si estadísticas > 7 días sin actualizar → Actualizar
- ✅ Si aparecen índices faltantes con `avg_user_impact` > 50% → Crear

### Paso 3: Diagnóstico del Servidor Windows

**Revisar:** `03_comandos_windows_server.md`

Ejecutar en el servidor de producción:

```powershell
# 1. Ver uso de CPU/Memoria de SQL Server
Get-Process -Name sqlservr | Select-Object Name, CPU, WorkingSet, Handles

# 2. Ver espacio en disco
Get-PSDrive -PSProvider FileSystem | Select-Object Name,
    @{N='Libre(GB)';E={[math]::Round($_.Free/1GB,2)}}

# 3. Ver conexiones activas a SQL Server
(Get-NetTCPConnection -LocalPort 1433 -State Established).Count
```

**Indicadores de alerta:**
- ✅ Si CPU > 80% constante → Problema de carga o queries ineficientes
- ✅ Si Memoria disponible < 2GB → SQL Server necesita más RAM o configurar `max server memory`
- ✅ Si Disco al 100% → Problema de I/O, considerar SSD o más discos
- ✅ Si conexiones > 100 → Posible leak de conexiones en la aplicación

### Paso 4: Aplicar Soluciones

**Ejecutar según necesidad:** `04_soluciones_comunes.sql`

Scripts de mantenimiento y optimización:

1. **Actualizar estadísticas** (siempre seguro, ejecutar primero)
2. **Reorganizar/Reconstruir índices** (según fragmentación)
3. **Crear índices faltantes** (basado en sugerencias)
4. **Optimizar configuración** (memoria, paralelismo)
5. **Limpiar cache** (solo si es necesario)
6. **Archivar datos históricos** (si hay millones de registros viejos)

## 🚨 Soluciones Inmediatas para Timeout en facturakardes

### Solución Rápida (5 minutos)

```sql
-- 1. Actualizar estadísticas
UPDATE STATISTICS facturakardes WITH FULLSCAN;

-- 2. Ver si hay bloqueos
SELECT blocking_session_id, session_id, wait_type, wait_time
FROM sys.dm_exec_requests
WHERE blocking_session_id <> 0;

-- 3. Si hay un bloqueador identificado y es seguro matarlo:
-- KILL [session_id];
```

### Solución Medio Plazo (30 minutos - horario de bajo uso)

```sql
-- 1. Actualizar estadísticas de todas las tablas principales
UPDATE STATISTICS facturakardes WITH FULLSCAN;
UPDATE STATISTICS factura WITH FULLSCAN;
UPDATE STATISTICS articulos WITH FULLSCAN;
UPDATE STATISTICS articulosdetalle WITH FULLSCAN;

-- 2. Reorganizar índices fragmentados
ALTER INDEX ALL ON facturakardes REORGANIZE;
ALTER INDEX ALL ON factura REORGANIZE;

-- 3. Crear índices recomendados (ver script 04)
-- Ejecutar solo los CREATE INDEX sugeridos
```

### Solución Largo Plazo

1. **Configurar job de mantenimiento semanal** (ver final de `04_soluciones_comunes.sql`)
2. **Monitorear regularmente** usando scripts de diagnóstico
3. **Archivar datos históricos** si la tabla crece sin control
4. **Optimizar queries** de la aplicación Node.js

## 🔧 Optimizaciones en Código Node.js

### Verificar Connection Pool

En tu `db.js`:

```javascript
const config = {
  // ... otras configuraciones
  pool: {
    max: 50,      // Máximo de conexiones (ajustar según carga)
    min: 5,       // Mínimo de conexiones mantenidas
    idleTimeoutMillis: 30000,  // Cerrar conexiones inactivas
    connectionTimeout: 30000,   // Timeout al obtener conexión
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
    requestTimeout: 60000,  // Timeout de query (aumentar si necesario)
  }
};
```

### Optimizar Queries Problemáticas

**Malo (causa table scan):**
```javascript
const result = await pool.request()
  .query('SELECT * FROM facturakardes ORDER BY kar_fec DESC');
```

**Bueno (usa índice y limita resultados):**
```javascript
const result = await pool.request()
  .input('limit', sql.Int, 100)
  .query(`
    SELECT TOP (@limit)
      kar_sec, fac_nro, art_sec, kar_fec, kar_can, kar_pre
    FROM facturakardes
    WHERE kar_fec >= DATEADD(MONTH, -6, GETDATE())
    ORDER BY kar_fec DESC
  `);
```

### Implementar Paginación

```javascript
const getKardexPaginated = async (page = 1, pageSize = 50) => {
  const offset = (page - 1) * pageSize;

  const pool = await poolPromise;
  const result = await pool.request()
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize)
    .query(`
      SELECT
        kar_sec, fac_nro, art_sec, kar_fec, kar_can, kar_pre
      FROM facturakardes
      ORDER BY kar_fec DESC
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `);

  return result.recordset;
};
```

### Usar WITH (NOLOCK) con Precaución

```javascript
// Solo para reportes donde dirty reads son aceptables
const result = await pool.request()
  .query(`
    SELECT kar_sec, fac_nro, art_sec, kar_fec
    FROM facturakardes WITH (NOLOCK)
    WHERE kar_fec >= DATEADD(MONTH, -1, GETDATE())
    ORDER BY kar_fec DESC
  `);
```

**⚠️ ADVERTENCIA:** `NOLOCK` puede leer datos inconsistentes, solo usar en reportes.

## 📊 Monitoreo Continuo

### Query para Dashboard de Monitoreo

```sql
-- Ejecutar cada 5 minutos y alertar si valores anormales
SELECT
    (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE blocking_session_id <> 0) AS BloqueosActivos,
    (SELECT TOP 1 wait_time FROM sys.dm_exec_requests WHERE blocking_session_id <> 0 ORDER BY wait_time DESC) AS TiempoMaximoBloqueado,
    (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS ConexionesActivas,
    (SELECT cntr_value FROM sys.dm_os_performance_counters WHERE counter_name = 'Page life expectancy') AS PageLifeExpectancy,
    (SELECT physical_memory_in_use_kb / 1024 FROM sys.dm_os_process_memory) AS MemoriaUsadaMB;
```

### Alertas Recomendadas

- 🚨 **BloqueosActivos** > 5 → Investigar inmediatamente
- 🚨 **TiempoMaximoBloqueado** > 30000 ms (30 seg) → Crisis, matar bloqueador
- ⚠️ **ConexionesActivas** > 100 → Revisar connection pool de app
- ⚠️ **PageLifeExpectancy** < 300 → Memoria insuficiente
- ⚠️ **MemoriaUsadaMB** cerca del límite → Ajustar `max server memory`

## 📝 Checklist de Mantenimiento Semanal

- [ ] Ejecutar `01_diagnostico_basico.sql` y revisar esperas principales
- [ ] Ejecutar `02_analisis_facturakardes.sql` y verificar fragmentación
- [ ] Actualizar estadísticas: `UPDATE STATISTICS ... WITH FULLSCAN`
- [ ] Reorganizar índices si fragmentación > 10%
- [ ] Revisar logs de SQL Server (`EXEC sp_readerrorlog`)
- [ ] Verificar espacio en disco
- [ ] Verificar backups completados exitosamente
- [ ] Revisar trabajos de SQL Agent

## 🆘 Contacto de Emergencia

Si el problema persiste después de ejecutar estas soluciones:

1. Recopilar outputs de scripts 01 y 02
2. Tomar screenshot de perfmon con contadores de CPU/Memoria/Disco
3. Exportar últimos 50 errores: `EXEC sp_readerrorlog 0, 1, N'error'`
4. Contactar a DBA o proveedor de hosting con esta información

## 📚 Referencias

- [SQL Server Wait Statistics](https://docs.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-os-wait-stats-transact-sql)
- [Index Fragmentation](https://docs.microsoft.com/en-us/sql/relational-databases/indexes/reorganize-and-rebuild-indexes)
- [Query Performance Tuning](https://docs.microsoft.com/en-us/sql/relational-databases/performance/query-processing-architecture-guide)
- [SQL Server Best Practices](https://docs.microsoft.com/en-us/sql/sql-server/install/sql-server-best-practices)
