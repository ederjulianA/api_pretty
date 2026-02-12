# Diagnóstico de Rendimiento - Servidor Windows

## 1. Verificar Uso de Recursos del Sistema

### PowerShell - Monitoreo en Tiempo Real

```powershell
# Ver uso de CPU y Memoria de SQL Server
Get-Process -Name sqlservr | Select-Object Name, CPU, WorkingSet, Handles

# Monitoreo continuo (actualiza cada 5 segundos)
while($true) {
    Clear-Host
    Get-Process -Name sqlservr | Select-Object Name,
        @{N='CPU(s)';E={$_.CPU}},
        @{N='Memoria(MB)';E={[math]::Round($_.WorkingSet/1MB,2)}},
        @{N='Handles';E={$_.Handles}}
    Start-Sleep -Seconds 5
}

# Ver procesos que más consumen CPU
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, WorkingSet

# Ver procesos que más consumen Memoria
Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name,
    @{N='Memoria(GB)';E={[math]::Round($_.WorkingSet/1GB,2)}}
```

### Performance Monitor (perfmon)

```cmd
# Abrir Performance Monitor
perfmon

# Contadores importantes a monitorear para SQL Server:
# - Processor(_Total)\% Processor Time
# - Memory\Available MBytes
# - PhysicalDisk(_Total)\Avg. Disk Queue Length
# - PhysicalDisk(_Total)\Avg. Disk sec/Read
# - PhysicalDisk(_Total)\Avg. Disk sec/Write
# - SQLServer:Buffer Manager\Page life expectancy
# - SQLServer:SQL Statistics\Batch Requests/sec
# - SQLServer:General Statistics\User Connections
# - SQLServer:Locks(_Total)\Lock Wait Time (ms)
```

## 2. Verificar Configuración de SQL Server

### Desde SQL Server Management Studio (SSMS)

```sql
-- Ver configuración de memoria máxima
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'max server memory (MB)';

-- Ver configuración de grado de paralelismo
EXEC sp_configure 'max degree of parallelism';

-- Ver configuración de costo para paralelismo
EXEC sp_configure 'cost threshold for parallelism';

-- Información de versión y edición
SELECT
    SERVERPROPERTY('ProductVersion') AS Version,
    SERVERPROPERTY('ProductLevel') AS ServicePack,
    SERVERPROPERTY('Edition') AS Edition;
```

## 3. Revisar Logs de SQL Server

### Ubicación de logs (típicamente):
- `C:\Program Files\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQL\Log\ERRORLOG`
- `C:\Program Files\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQL\Log\ERRORLOG.1` (log anterior)

### Desde SSMS:
```sql
-- Ver últimos 50 errores
EXEC sp_readerrorlog 0, 1, NULL, NULL, NULL, NULL, 'DESC';

-- Buscar errores específicos
EXEC sp_readerrorlog 0, 1, N'error';
EXEC sp_readerrorlog 0, 1, N'timeout';
EXEC sp_readerrorlog 0, 1, N'deadlock';
```

## 4. Verificar Estado del Disco

### PowerShell - Espacio en Disco

```powershell
# Ver espacio disponible en todos los discos
Get-PSDrive -PSProvider FileSystem | Select-Object Name,
    @{N='Usado(GB)';E={[math]::Round($_.Used/1GB,2)}},
    @{N='Libre(GB)';E={[math]::Round($_.Free/1GB,2)}},
    @{N='Total(GB)';E={[math]::Round(($_.Used+$_.Free)/1GB,2)}}

# Verificar fragmentación del disco (requiere admin)
Optimize-Volume -DriveLetter C -Analyze -Verbose
```

### Verificar Cola de Disco

```powershell
# Ver contadores de disco
Get-Counter '\PhysicalDisk(*)\Avg. Disk Queue Length'
Get-Counter '\PhysicalDisk(*)\% Disk Time'
Get-Counter '\PhysicalDisk(*)\Avg. Disk sec/Read'
Get-Counter '\PhysicalDisk(*)\Avg. Disk sec/Write'
```

## 5. Verificar Conexiones de Red

### PowerShell - Conexiones TCP Activas

```powershell
# Ver conexiones a SQL Server (puerto 1433 por defecto)
Get-NetTCPConnection -LocalPort 1433 | Select-Object State,
    LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess

# Contar conexiones activas
(Get-NetTCPConnection -LocalPort 1433 -State Established).Count

# Ver todas las conexiones del proceso SQL Server
$sqlPID = (Get-Process -Name sqlservr).Id
Get-NetTCPConnection -OwningProcess $sqlPID | Group-Object State |
    Select-Object Name, Count
```

## 6. Event Viewer - Revisar Eventos del Sistema

```cmd
# Abrir Event Viewer
eventvwr.msc

# Revisar:
# - Windows Logs > Application (errores de SQL Server)
# - Windows Logs > System (errores del sistema)
# - Applications and Services Logs > Microsoft > Windows > Kernel-Power (problemas de energía)
```

### PowerShell - Consultar Event Log

```powershell
# Errores de SQL Server en las últimas 24 horas
Get-EventLog -LogName Application -Source MSSQL* -EntryType Error -After (Get-Date).AddDays(-1) |
    Select-Object TimeGenerated, Source, Message

# Errores críticos del sistema
Get-EventLog -LogName System -EntryType Error -After (Get-Date).AddDays(-1) |
    Select-Object TimeGenerated, Source, Message
```

## 7. Verificar Servicios de SQL Server

### PowerShell

```powershell
# Ver estado de servicios SQL Server
Get-Service -DisplayName "*SQL*" | Select-Object DisplayName, Status, StartType

# Reiniciar servicio SQL Server (requiere admin)
Restart-Service -Name MSSQLSERVER -Force

# Ver servicios detenidos inesperadamente
Get-Service | Where-Object {$_.Status -eq "Stopped" -and $_.StartType -eq "Automatic"}
```

## 8. Tareas Programadas y Procesos en Background

### PowerShell

```powershell
# Ver tareas programadas relacionadas con SQL Server
Get-ScheduledTask | Where-Object {$_.TaskName -like "*SQL*"} |
    Select-Object TaskName, State, LastRunTime, NextRunTime

# Ver trabajos de SQL Agent (desde SSMS/T-SQL es mejor)
```

### Desde SSMS - SQL Agent Jobs

```sql
-- Ver trabajos programados
SELECT
    j.name AS JobName,
    CASE j.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS Status,
    s.step_name,
    h.run_date,
    h.run_time,
    h.run_duration,
    CASE h.run_status
        WHEN 0 THEN 'Failed'
        WHEN 1 THEN 'Succeeded'
        WHEN 2 THEN 'Retry'
        WHEN 3 THEN 'Canceled'
        WHEN 4 THEN 'In Progress'
    END AS RunStatus
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobsteps s ON j.job_id = s.job_id
LEFT JOIN msdb.dbo.sysjobhistory h ON j.job_id = h.job_id
WHERE h.run_date >= CONVERT(VARCHAR(8), GETDATE()-7, 112)
ORDER BY h.run_date DESC, h.run_time DESC;
```

## 9. Verificar Antivirus y Exclusiones

**IMPORTANTE**: Asegurarse de que el antivirus excluya:
- Archivos de datos: `*.mdf`, `*.ndf`, `*.ldf`
- Archivos de backup: `*.bak`, `*.trn`
- Directorios completos de SQL Server
- Proceso: `sqlservr.exe`

### PowerShell - Ver Windows Defender

```powershell
# Ver exclusiones de Windows Defender
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
Get-MpPreference | Select-Object -ExpandProperty ExclusionExtension
Get-MpPreference | Select-Object -ExpandProperty ExclusionProcess

# Agregar exclusiones (requiere admin)
Add-MpPreference -ExclusionPath "C:\Program Files\Microsoft SQL Server"
Add-MpPreference -ExclusionExtension "mdf"
Add-MpPreference -ExclusionExtension "ldf"
Add-MpPreference -ExclusionExtension "bak"
Add-MpPreference -ExclusionProcess "sqlservr.exe"
```

## 10. Verificar Actualizaciones Pendientes

```powershell
# Ver actualizaciones de Windows pendientes (requiere módulo PSWindowsUpdate)
Get-WindowsUpdate

# Ver últimas actualizaciones instaladas
Get-HotFix | Sort-Object -Property InstalledOn -Descending | Select-Object -First 10
```

## Valores Objetivo de Rendimiento

### SQL Server
- **Page Life Expectancy**: > 300 segundos (idealmente > 1000)
- **Batch Requests/sec**: depende del sistema, establecer baseline
- **Lock Wait Time**: < 500 ms
- **Buffer Cache Hit Ratio**: > 90%

### Sistema Operativo
- **CPU**: < 80% promedio
- **Memoria disponible**: > 20% del total
- **Avg. Disk Queue Length**: < 2 por disco físico
- **Avg. Disk sec/Read o Write**: < 20ms (HDD), < 10ms (SSD)

## Síntomas Comunes y Diagnóstico

| Síntoma | Causa Probable | Verificar |
|---------|----------------|-----------|
| Timeouts en SELECT | Bloqueos, índices faltantes | Scripts 01 y 02, locks activos |
| Lentitud general | CPU alta, memoria insuficiente | perfmon, memoria disponible |
| Picos de lentitud | SQL Agent jobs, backups | Tareas programadas |
| Disco al 100% | Archivos sin espacio, fragmentación | Espacio en disco, logs de crecimiento |
| Conexiones rechazadas | Pool de conexiones agotado | Conexiones TCP activas |
