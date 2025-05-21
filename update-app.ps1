# Script de actualización automática para API Pretty
# Este script verifica cambios en GitHub y actualiza la aplicación

# Configuración
$repoPath = "C:\api_pretty"
$branch = "main"
$logFile = "C:\api_pretty\update.log"
$repoUrl = "https://github.com/ederjulianA/api_pretty.git"  # Reemplaza con tu URL de GitHub

# Función para escribir logs
function Write-Log {
    param($Message)
    $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$date] $Message" | Out-File -Append $logFile
    Write-Host "[$date] $Message"
}

# Función para verificar y configurar Git
function Initialize-GitRepo {
    if (-not (Test-Path "$repoPath\.git")) {
        Write-Log "Inicializando repositorio Git..."
        Set-Location $repoPath
        git init
        git remote add origin $repoUrl
        Write-Log "Repositorio Git inicializado"
    }
}

try {
    # Verificar si estamos en el directorio correcto
    if (-not (Test-Path $repoPath)) {
        throw "El directorio $repoPath no existe"
    }

    Set-Location $repoPath
    Write-Log "Iniciando verificación de actualizaciones..."

    # Verificar y configurar Git si es necesario
    Initialize-GitRepo

    # Verificar la conexión con el repositorio remoto
    $remoteUrl = git config --get remote.origin.url
    if (-not $remoteUrl) {
        Write-Log "Configurando repositorio remoto..."
        git remote add origin $repoUrl
    } elseif ($remoteUrl -ne $repoUrl) {
        Write-Log "Actualizando URL del repositorio remoto..."
        git remote set-url origin $repoUrl
    }

    # Verificar si hay cambios
    Write-Log "Obteniendo cambios del repositorio remoto..."
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