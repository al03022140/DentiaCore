# C-1 (docs/PLAN_CIERRE_V1.md): unico camino soportado para actualizar una
# instalacion existente de DentiaCore. Orden fijo y no salteable:
#   1) backup (BD + uploads)
#   2) migrate:dry - aborta el update si falla, sin tocar nada
#   3) migrate
#   4) build del Client
#   5) reinicio del servicio (PM2 si esta disponible)
#
# Uso (PowerShell, como administrador si el servicio corre via PM2/servicio):
#   .\update.ps1
#
# Requiere: Node.js, `mongodump` en PATH (o ubicacion estandar - ver
# scripts/backup-db.js), y opcionalmente PM2 para el reinicio automatico.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Write-Step { param([string]$Msg) Write-Host "`n[>] $Msg" -ForegroundColor Yellow }
function Write-Ok   { param([string]$Msg) Write-Host " [V] $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host " [!] $Msg" -ForegroundColor DarkYellow }
function Write-Err  { param([string]$Msg) Write-Host " [X] $Msg" -ForegroundColor Red }

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host " DentiaCore - Actualizacion de instalacion existente" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

Write-Step "[1/5] Respaldo de base de datos..."
node scripts/backup-db.js --keep=10
if ($LASTEXITCODE -ne 0) {
    Write-Err "El respaldo de base de datos fallo. Update ABORTADO antes de tocar datos."
    exit 1
}

Write-Step "[1/5] Respaldo de uploads (best-effort)..."
$UploadsDir = Join-Path $Root 'Server\uploads'
$EnvFile = Join-Path $Root 'Server\.env'
if (Test-Path $EnvFile) {
    $EnvLine = Get-Content $EnvFile | Where-Object { $_ -match '^UPLOADS_DIR=' } | Select-Object -First 1
    if ($EnvLine) {
        $Custom = ($EnvLine -split '=', 2)[1].Trim('"', " ")
        if ($Custom) { $UploadsDir = Join-Path $Root "Server\$Custom" }
    }
}
if (Test-Path $UploadsDir) {
    $BackupsDir = Join-Path $Root 'backups'
    New-Item -ItemType Directory -Force -Path $BackupsDir | Out-Null
    $Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $UploadsBackup = Join-Path $BackupsDir "uploads_$Stamp.zip"
    try {
        Compress-Archive -Path $UploadsDir -DestinationPath $UploadsBackup -Force
        Write-Ok "Uploads respaldados en $UploadsBackup"
    } catch {
        Write-Warn "No se pudo respaldar uploads ($($_.Exception.Message)) - continua el update (la BD ya esta respaldada)."
    }
} else {
    Write-Warn "No se encontro la carpeta de uploads ($UploadsDir) - se omite este respaldo."
}

Write-Step "[2/5] Verificando migraciones pendientes (dry-run, no toca datos)..."
npm run migrate:dry
if ($LASTEXITCODE -ne 0) {
    Write-Err "migrate:dry fallo. Update ABORTADO antes de tocar datos o codigo."
    Write-Host "    Revisa el error arriba y vuelve a correr .\update.ps1 cuando este resuelto." -ForegroundColor Red
    exit 1
}

Write-Step "[3/5] Aplicando migraciones..."
npm run migrate
if ($LASTEXITCODE -ne 0) {
    Write-Err "migrate fallo a mitad de camino. Revisa el error arriba antes de reintentar."
    exit 1
}

Write-Step "[4/5] Compilando frontend..."
npm --prefix Client run build
if ($LASTEXITCODE -ne 0) {
    Write-Err "El build del Client fallo. Los datos ya fueron migrados; corrige el build y vuelve a correr el update."
    exit 1
}

Write-Step "[5/5] Reiniciando servidor..."
$Pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($Pm2) {
    $Exists = (& pm2 describe dentiacore-api 2>$null | Out-String) -match 'status'
    if ($Exists) {
        pm2 restart dentiacore-api --update-env
    } else {
        pm2 start Server/ecosystem.config.cjs --only dentiacore-api --update-env
    }
    Write-Ok "dentiacore-api reiniciado via PM2."
} else {
    Write-Warn "PM2 no encontrado en PATH. Reinicia el servidor manualmente, por ejemplo:"
    Write-Host "    npm --prefix Server run start"
}

Write-Host ""
Write-Ok "Actualizacion completa."
Write-Host "   Verifica: Invoke-WebRequest -Uri 'http://127.0.0.1:5002/api/health' -UseBasicParsing"
