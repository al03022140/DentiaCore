<#
.SYNOPSIS
    Instalador Maestro para Sistema Dent - Infraestructura Hibrida
#>

[CmdletBinding()]
param(
    [ValidateSet('Local','LAN')]
    [string]$Mode = 'LAN',
    [switch]$SkipMongo,
    [switch]$SkipFrontendBuild,
    [switch]$NoAdmin,
    [switch]$CreateShortcut,
    # Legacy / compatibility switches (ignored by new installer but accepted)
    [switch]$RegisterService,
    [switch]$InstallBuildTools,
    [switch]$UpdateNpm,
    [switch]$InstallMongoFromProject,
    [switch]$RunSmokeTest,
    [switch]$AddFirewallRule
)

$ErrorActionPreference = 'Stop'

function Write-Header { param([string]$Msg) Write-Host "`n=== $Msg ===" -ForegroundColor Cyan }
function Write-Step { param([string]$Msg) Write-Host " [>] $Msg" -ForegroundColor Yellow }
function Write-Ok { param([string]$Msg) Write-Host " [V] $Msg" -ForegroundColor Green }
function Write-Err { param([string]$Msg) Write-Host " [X] $Msg" -ForegroundColor Red }
function Write-Warn { param([string]$Msg) Write-Host " [!] $Msg" -ForegroundColor DarkYellow }

function Assert-Admin {
    if ($NoAdmin) { return }
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
        Write-Err "Se requieren permisos de Administrador para configurar Servicios y Firewall."
        throw "Permisos insuficientes"
    }
}

function Get-LocalIP {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
          Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*vEthernet*" } |
          Sort-Object -Property InterfaceIndex | 
          Select-Object -First 1 -ExpandProperty IPAddress
    if (-not $ip) { $ip = "127.0.0.1" }
    return $ip
}

try {
    Clear-Host
    Write-Header "INSTALACION DE INFRAESTRUCTURA DENT (MODO SEGURO)"
    Assert-Admin

    $RepoRoot = $PSScriptRoot
    $ServerDir = Join-Path $RepoRoot "Server"
    $ClientDir = Join-Path $RepoRoot "Client"
    $ToolsDir = Join-Path $RepoRoot "tools" 

    Write-Header "1. CONFIGURACION DE RED"
    $DetectedIP = Get-LocalIP
    Write-Ok "IP detectada: $DetectedIP"
    
    Write-Step "Abriendo puertos en Firewall (5002, 27017)..."
    $rules = @(@{ Name="Dent API"; Port=5002 }, @{ Name="Dent MongoDB"; Port=27017 })
    foreach ($r in $rules) {
        Remove-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -LocalPort $r.Port -Protocol TCP -Action Allow -Profile Any | Out-Null
    }
    Write-Ok "Firewall configurado."

    if (-not $SkipMongo) {
        Write-Header "2. CONFIGURACION DE MONGODB"
        $Service = Get-Service "MongoDB" -ErrorAction SilentlyContinue

        if (-not $Service) {
            Write-Step "Instalando servicio MongoDB..."
            $LocalMongoBin = Join-Path $ToolsDir "mongo\bin\mongod.exe"
            if (-not (Test-Path $LocalMongoBin)) {
                $LocalMongoBin = Get-ChildItem -Path $RepoRoot -Filter "mongod.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
            }

            if ($LocalMongoBin -and (Test-Path $LocalMongoBin)) {
                $DataDir = Join-Path $RepoRoot "DB"
                $LogDir = Join-Path $RepoRoot "DB\logs"
                $ConfigPath = Join-Path $RepoRoot "mongod.cfg"
                if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
                if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
                
                $LogFile = "$LogDir\mongod.log"
                $ConfigContent = "systemLog:`n  destination: file`n  path: $LogFile`n  logAppend: true`nstorage:`n  dbPath: $DataDir`nnet:`n  bindIp: 0.0.0.0`n  port: 27017"
                
                Set-Content -Path $ConfigPath -Value $ConfigContent -Encoding UTF8
                $BinPathCmd = $LocalMongoBin + ' --config ' + $ConfigPath + ' --service'
                New-Service -Name "MongoDB" -BinaryPathName $BinPathCmd -DisplayName "MongoDB Server (Dent)" -StartupType Automatic -ErrorAction SilentlyContinue
                Start-Service "MongoDB" -ErrorAction SilentlyContinue
                Write-Ok "Servicio instalado e iniciado."
            } else {
                Write-Warn "No se encontro mongod.exe. Omitiendo servicio."
            }
        } else {
            Write-Ok "Servicio MongoDB ya existe."
            $WmiService = Get-WmiObject win32_service -Filter "Name='MongoDB'" -ErrorAction SilentlyContinue
            if ($WmiService) {
                $PathName = $WmiService.PathName
                if ($PathName -match 'config\s+(.+?)\s+--service') {
                    $ExistingCfg = $matches[1].Trim('"')
                    if (Test-Path $ExistingCfg) {
                        $Content = Get-Content $ExistingCfg -Raw
                        if ($Content -notmatch "0.0.0.0") {
                            Write-Step "Actualizando bindIp a 0.0.0.0..."
                            $Content = $Content -replace "bindIp:.*", "bindIp: 0.0.0.0"
                            Set-Content -Path $ExistingCfg -Value $Content -Encoding UTF8
                            Restart-Service "MongoDB" -Force -ErrorAction SilentlyContinue
                            Write-Ok "Servicio reiniciado."
                        }
                    }
                }
            }
        }
    }

    Write-Header "3. ACTUALIZANDO VARIABLES DE ENTORNO (.env)"
    $EnvFile = Join-Path $ServerDir ".env"
    
    $NetworkConfig = @{
        "PORT" = "5002"
        "HOST" = "0.0.0.0"
        "MONGODB_URI" = "mongodb://127.0.0.1:27017/Dent"
        "CLIENT_URL" = "http://$DetectedIP`:5002"
        "PUBLIC_URL" = "http://$DetectedIP`:5002"
    }

    $FinalEnv = [System.Collections.Generic.Dictionary[string,string]]::new()
    
    if (Test-Path $EnvFile) {
        Write-Step "Leyendo .env existente para preservar secretos..."
        Get-Content $EnvFile -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match "^\s*([^#=]+)=(.*)$") {
                $Key = $matches[1].Trim()
                $Value = $matches[2].Trim()
                if (-not $NetworkConfig.ContainsKey($Key)) {
                    $FinalEnv[$Key] = $Value
                }
            }
        }
    } else {
        $FinalEnv["NODE_ENV"] = "production"
    }

    foreach ($Key in $NetworkConfig.Keys) {
        $FinalEnv[$Key] = $NetworkConfig[$Key]
    }

    $NewContent = @()
    foreach ($Key in $FinalEnv.Keys) {
        $NewContent += "$Key=$($FinalEnv[$Key])"
    }
    $NewContent | Set-Content -Path $EnvFile -Encoding UTF8
    Write-Ok ".env actualizado (IP: $DetectedIP). Secretos conservados."

    Write-Header "4. INSTALANDO Y COMPILANDO"
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Warn "Instalando Node.js..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>$null
    }

    Write-Step "Instalando dependencias del Servidor..."
    Push-Location $ServerDir
    npm install --no-audit --no-fund 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Dependencias Server instaladas."

    Write-Step "Instalando dependencias del Cliente..."
    Push-Location $ClientDir
    npm install --no-audit --no-fund 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Dependencias Client instaladas."
    
    if (-not $SkipFrontendBuild) {
        Write-Step "Compilando Frontend para LAN..."
        $env:VITE_API_URL = "http://$DetectedIP`:5002"
        Push-Location $ClientDir
        try {
            npm run build 2>&1 | Out-Null
            Write-Ok "Build completado."
        } catch {
            Write-Warn "Build del frontend omitido (opcional). Puedes ejecutar 'npm run build' manualmente en Client/"
        }
        Pop-Location
    }

    Write-Header "INSTALACION EXITOSA"
    Write-Host "Sistema listo para LAN." -ForegroundColor Green
    Write-Host "IP del Servidor: $DetectedIP" -ForegroundColor Cyan
    Write-Host "NOTA: Si usas Google Auth, agrega http://$DetectedIP`:5002 en Google Cloud Console." -ForegroundColor Yellow
    
} catch {
    Write-Header "ERROR"
    Write-Err $_.Exception.Message
    Write-Err $_.ScriptStackTrace
    exit 1
}
