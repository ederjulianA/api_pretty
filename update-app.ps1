# Script de actualización automática para API Pretty
# Este script verifica cambios en GitHub y actualiza la aplicación

# Configuración
$repoPath = "C:\api_pretty"
$branch = "main"
$logFile = "C:\api_pretty\update.log"

# Función para escribir logs
function Write-Log {
    param($Message)
    $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$date] $Message" | Out-File -Append $logFile
    Write-Host "[$date] $Message"
}

try {
    # Verificar si estamos en el directorio correcto
    if (-not (Test-Path $repoPath)) {
        throw "El directorio $repoPath no existe"
    }

    Set-Location $repoPath
    Write-Log "Iniciando verificación de actualizaciones..."

    # Verificar si hay cambios
    git fetch origin
    $localCommit = git rev-parse HEAD
    $remoteCommit = git rev-parse origin/$branch
    
    if ($localCommit -eq $remoteCommit) {
        Write-Log "No hay cambios nuevos"
        exit
    }
    
    Write-Log "Cambios detectados. Iniciando actualización..."
    
    # Actualizar código
    git reset --hard origin/$branch
    Write-Log "Código actualizado desde GitHub"
    
    # Verificar si package.json ha cambiado
    $packageChanged = git diff --name-only $localCommit $remoteCommit | Select-String "package.json"
    if ($packageChanged) {
        Write-Log "package.json ha cambiado. Instalando dependencias..."
        npm install
        Write-Log "Dependencias actualizadas"
    }
    
    # Reiniciar aplicación
    Write-Log "Reiniciando aplicación..."
    pm2 restart api_pretty
    pm2 save
    Write-Log "Aplicación reiniciada correctamente"
    
    Write-Log "Actualización completada exitosamente"
} catch {
    $errorMessage = $_.Exception.Message
    Write-Log "ERROR: $errorMessage"
    Write-Log "Stack Trace: $($_.ScriptStackTrace)"
    
    # Intentar restaurar el estado anterior en caso de error
    try {
        Write-Log "Intentando restaurar el estado anterior..."
        git reset --hard $localCommit
        pm2 restart api_pretty
        Write-Log "Estado anterior restaurado"
    } catch {
        Write-Log "ERROR al restaurar estado anterior: $($_.Exception.Message)"
    }
} 