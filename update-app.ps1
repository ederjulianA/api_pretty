# Script de actualización automática para API Pretty
# Verifica cambios en GitHub, actualiza la aplicación y COMPRUEBA que quedó
# viva. Si no responde tras el reinicio, revierte sola a la versión anterior.

# ---------------------------------------------------------------- Configuración
$repoPath = "C:\api_pretty"
$branch   = "main"
$logFile  = "C:\api_pretty\update.log"
$repoUrl  = "https://github.com/ederjulianA/api_pretty.git"

# Verificación post-despliegue
$healthPath      = "/"          # responde "API Working"
$healthIntentos  = 12           # 12 intentos x 5s = hasta 60s para arrancar
$healthEsperaSeg = 5            # (el 2026-09-10 un arranque lento disparo un rollback falso con 30s)
$puertoPorDefecto = 3000

function Write-Log {
    param($Message)
    $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$date] $Message" | Out-File -Append $logFile
    Write-Host "[$date] $Message"
}

# El puerto sale del .env; si no está, se usa el valor por defecto.
function Get-AppPort {
    try {
        $envFile = Join-Path $repoPath ".env"
        if (Test-Path $envFile) {
            $linea = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
            if ($linea) { return [int]$linea.Matches[0].Groups[1].Value }
        }
    } catch { }
    return $puertoPorDefecto
}

# PM2 expone el listado como JSON con 'pm2 jlist'. La variante
# 'pm2 list --format json' no existe en todas las versiones.
# pm2 jlist puede anteponer avisos al JSON ("Use --update-env..."), lo que
# rompe ConvertFrom-Json. Se recorta todo lo anterior al primer '['.
function Get-PM2Json {
    $raw = (pm2 jlist 2>$null | Out-String)
    $i = $raw.IndexOf('[')
    if ($i -lt 0) { throw "pm2 jlist no devolvio JSON" }
    return ($raw.Substring($i) | ConvertFrom-Json)
}

function Get-PM2AppName {
    try {
        $pm2List = Get-PM2Json
        if ($pm2List -and $pm2List.Count -gt 0) {
            $app = $pm2List | Where-Object { $_.name -like "*index*" -or $_.name -like "*api_pretty*" } | Select-Object -First 1
            if ($app) { return $app.name }
            return $pm2List[0].name
        }
    } catch {
        Write-Log "Advertencia: no se pudo leer el listado de PM2 ($($_.Exception.Message)), se usa 'index' por defecto"
    }
    return "index"
}

# Devuelve $true solo si la app responde HTTP 200. Reintenta para dar margen
# a que Node levante y abra el puerto.
function Test-AppHealth {
    param($Puerto)
    $url = "http://localhost:$Puerto$healthPath"
    for ($i = 1; $i -le $healthIntentos; $i++) {
        Start-Sleep -Seconds $healthEsperaSeg
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
            if ($r.StatusCode -eq 200) {
                Write-Log "Health check OK ($url respondio 200 en el intento $i)"
                return $true
            }
            Write-Log "Health check: intento $i devolvio HTTP $($r.StatusCode)"
        } catch {
            Write-Log "Health check: intento $i sin respuesta ($($_.Exception.Message))"
        }
    }
    return $false
}

# Comprueba que PM2 no dejo el proceso en errored/stopped.
function Test-PM2Online {
    param($AppName)
    try {
        $pm2List = Get-PM2Json
        $app = $pm2List | Where-Object { $_.name -eq $AppName } | Select-Object -First 1
        if ($app) {
            $estado = $app.pm2_env.status
            Write-Log "Estado en PM2 de '$AppName': $estado"
            return ($estado -eq "online")
        }
        Write-Log "Advertencia: '$AppName' no aparece en el listado de PM2"
    } catch {
        Write-Log "Advertencia: no se pudo consultar el estado en PM2 ($($_.Exception.Message))"
    }
    return $true  # ante la duda no se dispara un rollback por esto solo
}

# Vuelve al commit anterior, reinstala dependencias si hacia falta y reinicia.
function Invoke-Rollback {
    param($CommitAnterior, $AppName, $Puerto, $HuboCambioDeps)
    Write-Log "=== ROLLBACK: volviendo a $CommitAnterior ==="
    git reset --hard $CommitAnterior
    if ($HuboCambioDeps) {
        Write-Log "Reinstalando dependencias de la version anterior..."
        npm install
    }
    pm2 restart $AppName
    if (Test-AppHealth -Puerto $Puerto) {
        Write-Log "ROLLBACK OK: la version anterior esta respondiendo"
    } else {
        Write-Log "ERROR CRITICO: el rollback tampoco responde. Revisar 'pm2 logs $AppName' de inmediato"
    }
}

# ---------------------------------------------------------------------- Proceso
$localCommit = $null
$appName = "index"
$huboCambioDeps = $false

try {
    if (-not (Test-Path $repoPath)) { throw "El directorio $repoPath no existe" }
    Set-Location $repoPath
    Write-Log "=== Iniciando verificacion de actualizaciones ==="

    $appName = Get-PM2AppName
    $puerto  = Get-AppPort
    Write-Log "Aplicacion PM2: $appName   Puerto: $puerto"

    if (-not (Test-Path "$repoPath\.git")) {
        Write-Log "Inicializando repositorio Git..."
        git init
        git remote add origin $repoUrl
    }

    $remoteUrl = git config --get remote.origin.url
    if (-not $remoteUrl) {
        git remote add origin $repoUrl
    } elseif ($remoteUrl -ne $repoUrl) {
        Write-Log "Actualizando URL del repositorio remoto..."
        git remote set-url origin $repoUrl
    }

    Write-Log "Obteniendo cambios del repositorio remoto..."
    git fetch origin
    $localCommit  = git rev-parse HEAD
    $remoteCommit = git rev-parse origin/$branch

    if ($localCommit -eq $remoteCommit) {
        Write-Log "No hay cambios nuevos"
        exit 0
    }

    # Trazabilidad: deja constancia de que entro exactamente en este despliegue.
    Write-Log "Cambios detectados. Commits a aplicar:"
    git log --oneline "$localCommit..$remoteCommit" | ForEach-Object { Write-Log "   $_" }

    # Cambios en dependencias antes de mover el codigo.
    $archivosCambiados = git diff --name-only $localCommit $remoteCommit
    $huboCambioDeps = [bool]($archivosCambiados | Select-String -Pattern "package(-lock)?\.json")

    git reset --hard origin/$branch
    Write-Log "Codigo actualizado a $remoteCommit"

    if ($huboCambioDeps) {
        Write-Log "Cambiaron las dependencias. Ejecutando npm install..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install fallo con codigo $LASTEXITCODE. No se reinicia la aplicacion."
        }
        Write-Log "Dependencias actualizadas"
    } else {
        Write-Log "Sin cambios en dependencias, se omite npm install"
    }

    Write-Log "Reiniciando aplicacion $appName..."
    pm2 restart $appName
    pm2 save

    # A partir de aqui ya no se asume exito: hay que comprobarlo.
    if (-not (Test-AppHealth -Puerto $puerto)) {
        Write-Log "ERROR: la aplicacion no respondio tras el reinicio"
        Invoke-Rollback -CommitAnterior $localCommit -AppName $appName -Puerto $puerto -HuboCambioDeps $huboCambioDeps
        exit 1
    }

    if (-not (Test-PM2Online -AppName $appName)) {
        Write-Log "ERROR: PM2 no reporta la aplicacion como online"
        Invoke-Rollback -CommitAnterior $localCommit -AppName $appName -Puerto $puerto -HuboCambioDeps $huboCambioDeps
        exit 1
    }

    Write-Log "=== Actualizacion completada y verificada ($remoteCommit) ==="
    exit 0

} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    Write-Log "Stack Trace: $($_.ScriptStackTrace)"

    if ($localCommit) {
        $puertoRb = Get-AppPort
        Invoke-Rollback -CommitAnterior $localCommit -AppName $appName -Puerto $puertoRb -HuboCambioDeps $huboCambioDeps
    } else {
        Write-Log "No se llego a determinar el commit anterior: no hay nada que revertir"
    }
    exit 1
}
