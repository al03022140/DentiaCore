# Script de prueba rapida del servidor
Write-Host "=== Probando servidor DENT ===" -ForegroundColor Cyan

# Cambiar al directorio del proyecto
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Resolver ruta de mongod.exe en caso de que no esté en PATH
function Find-MongodExe {
    try {
        $cmd = Get-Command mongod -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) { return $cmd.Source }

        # Servicio de Windows
        try {
            $svcReg = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\MongoDB' -ErrorAction Stop
            $imagePath = $svcReg.ImagePath
            if ($imagePath) {
                $m = [regex]::Match($imagePath, '"(?<p>[^"]*mongod\.exe)"|(?<p>[^\s]*mongod\.exe)')
                if ($m.Success) {
                    $exe = $m.Groups['p'].Value
                    if (Test-Path $exe) { return $exe }
                }
            }
        } catch {}

        # Ubicaciones comunes usando variables de entorno (evitar rutas absolutas fijas)
        $candidateBases = @()
        if ($env:ProgramFiles) { $candidateBases += (Join-Path $env:ProgramFiles 'MongoDB\Server') }
        if ($env:ProgramFiles_x86) { $candidateBases += (Join-Path $env:ProgramFiles_x86 'MongoDB\Server') }
        if ($env:SystemDrive) { $candidateBases += (Join-Path $env:SystemDrive 'MongoDB\Server') }
        foreach ($base in $candidateBases) {
            if (-not (Test-Path $base)) { continue }
            $exe = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName 'bin' } |
                ForEach-Object { Join-Path $_ 'mongod.exe' } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
            if ($exe) { return $exe }
        }

        # Proyecto local
        $localExe = Join-Path $scriptDir 'tools\mongo\bin\mongod.exe'
        if (Test-Path $localExe) { return $localExe }
        return $null
    }
    catch { return $null }
}

Write-Host "`n[1/5] Verificando Node.js..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  V Node.js $nodeVersion instalado" -ForegroundColor Green
} else {
    Write-Host "  X Node.js no encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/5] Verificando MongoDB..." -ForegroundColor Yellow
$mongoRunning = $false
if (Get-Command mongod -ErrorAction SilentlyContinue) {
    Write-Host "  V MongoDB instalado" -ForegroundColor Green
    $mongoRunning = $true
} else {
    Write-Host "  X MongoDB no encontrado en PATH" -ForegroundColor Red
    $resolvedExe = Find-MongodExe
    if ($resolvedExe) {
        $resolvedBin = Split-Path -Parent $resolvedExe
        Write-Host "    ↪ Detectado en: $resolvedBin" -ForegroundColor Yellow
        # Agregar a PATH de la sesion
        $env:Path = $env:Path + ";$resolvedBin"
        Write-Host "    ↪ Agregado temporalmente a PATH para esta sesion" -ForegroundColor Yellow
    }
}

# Verificar si mongod está corriendo
$mongodProcess = Get-Process mongod -ErrorAction SilentlyContinue
if ($mongodProcess) {
    Write-Host "  V MongoDB ejecutandose (PID: $($mongodProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ! MongoDB no esta ejecutandose" -ForegroundColor DarkYellow
    # Sugerir iniciar servicio si existe
    $mongoSvc = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
    if ($mongoSvc) {
        Write-Host "    Servicio detectado: MongoDB ($($mongoSvc.Status))" -ForegroundColor Gray
        Write-Host "    Puedes iniciar el servicio con: net start MongoDB" -ForegroundColor Gray
    } else {
        Write-Host "    Ejecuta: mongod --dbpath ./DB" -ForegroundColor Gray
    }
}

Write-Host "`n[3/5] Verificando dependencias del servidor..." -ForegroundColor Yellow
if (Test-Path "Server/node_modules") {
    Write-Host "  V Dependencias instaladas en Server/" -ForegroundColor Green
} else {
    Write-Host "  X Faltan dependencias en Server/" -ForegroundColor Red
    Write-Host "    Ejecuta: cd Server && npm install" -ForegroundColor Gray
}

Write-Host "`n[4/5] Verificando archivo .env..." -ForegroundColor Yellow
if (Test-Path "Server/.env") {
    Write-Host "  V Archivo Server/.env existe" -ForegroundColor Green
    $envContent = Get-Content "Server/.env" -Raw
    if ($envContent -match "MONGODB_URI") {
        Write-Host "  V MONGODB_URI configurado" -ForegroundColor Green
    } else {
        Write-Host "  ! MONGODB_URI no encontrado en .env" -ForegroundColor DarkYellow
    }
    if ($envContent -match "PORT") {
        Write-Host "  V PORT configurado" -ForegroundColor Green
    } else {
        Write-Host "  ! PORT no encontrado en .env" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  X Archivo Server/.env no existe" -ForegroundColor Red
    Write-Host "    El instalador deberia crearlo automaticamente" -ForegroundColor Gray
}

Write-Host "`n[5/5] Verificando puertos..." -ForegroundColor Yellow
$port5002 = Get-NetTCPConnection -LocalPort 5002 -ErrorAction SilentlyContinue
if ($port5002) {
    Write-Host "  ! Puerto 5002 ya esta en uso" -ForegroundColor DarkYellow
    Write-Host "    PID: $($port5002.OwningProcess)" -ForegroundColor Gray
} else {
    Write-Host "  V Puerto 5002 disponible" -ForegroundColor Green
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "Para iniciar el servidor manualmente:" -ForegroundColor White
Write-Host "  1. cd Server" -ForegroundColor Gray
Write-Host "  2. npm run dev" -ForegroundColor Gray
Write-Host "`nPara iniciar todo el proyecto:" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor Gray
Write-Host "`nO usa el launcher:" -ForegroundColor White
Write-Host "  python launcher.py" -ForegroundColor Gray
