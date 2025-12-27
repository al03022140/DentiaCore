#requires -Version 5.1
param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\.." ).Path
)

Write-Host "Comprobando estado de MongoDB (servicio del sistema)..." -ForegroundColor Cyan

# 1) ¿Ya está corriendo el proceso mongod?
try {
  $proc = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host "mongod ya está en ejecución (PID(s): $($proc.Id -join ', '))." -ForegroundColor Green
    exit 0
  }
} catch {}

# 2) Intentar iniciar exclusivamente el servicio del sistema 'MongoDB'
try {
  $svc = Get-Service -Name "MongoDB" -ErrorAction Stop
} catch {
  Write-Host "Servicio 'MongoDB' no encontrado. Instala MongoDB como servicio del sistema y vuelve a intentar." -ForegroundColor Red
  Write-Host "Sugerencia: usa el instalador oficial de MongoDB o configura el servicio manualmente con 'mongod --install'." -ForegroundColor DarkYellow
  exit 1
}

if ($svc.Status -ne 'Running') {
  Write-Host "Iniciando servicio MongoDB..." -ForegroundColor Yellow
  try {
    Start-Service -Name "MongoDB" -ErrorAction Stop
  } catch {
    Write-Host "No se pudo iniciar el servicio 'MongoDB'. ¿Tienes permisos de administrador?" -ForegroundColor Red
    exit 1
  }
}

# 3) Verificar que el puerto 27017 esté listo
$ready = $false
for ($i=1; $i -le 10; $i++) {
  try {
    $ok = Test-NetConnection -ComputerName '127.0.0.1' -Port 27017 -InformationLevel Quiet
  } catch {
    $ok = $false
  }
  if ($ok) {
    Write-Host "MongoDB listo en 127.0.0.1:27017." -ForegroundColor Green
    $ready = $true
    break
  } else {
    Write-Host "Esperando puerto 27017 (intento $i)..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds ([Math]::Min([Math]::Pow(2,$i),5))
  }
}

if (-not $ready) {
  Write-Host "El servicio 'MongoDB' está iniciado pero el puerto 27017 no respondió a tiempo." -ForegroundColor Yellow
  Write-Host "Revisa la configuración del servicio (dbPath, logs) y vuelve a intentar." -ForegroundColor Yellow
  exit 1
}

exit 0