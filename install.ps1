<#
.SYNOPSIS
    Instalador Maestro para Sistema DentiaCore - Infraestructura Hibrida
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

# Ejecuta 'npm install' en un directorio y valida el resultado
function Run-NpmInstall {
    param([string]$TargetDir)
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Warn "npm no encontrado en PATH. Intentando instalar Node.js (incluye npm)..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>$null
        Start-Sleep -Seconds 3
    }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Err "npm sigue sin estar disponible. Instala Node.js y npm manualmente y vuelve a ejecutar el instalador."
        throw "npm_not_found"
    }

    Write-Step "Ejecutando 'npm install' en $TargetDir..."
    Push-Location $TargetDir
    try {
        $output = npm install --no-audit --no-fund 2>&1
    } catch {
        $output = $_ | Out-String
    }
    $exit = $LASTEXITCODE
    Pop-Location

    if ($exit -ne 0) {
        Write-Err "'npm install' falló en: $TargetDir"
        Write-Err $output
        throw "npm_install_failed"
    }

    Write-Ok "Dependencias instaladas en $TargetDir."
}

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
    Write-Header "INSTALACION DE INFRAESTRUCTURA DENTIACORE (MODO SEGURO)"
    Assert-Admin

    $RepoRoot = $PSScriptRoot
    $ServerDir = Join-Path $RepoRoot "Server"
    $ClientDir = Join-Path $RepoRoot "Client"
    $ToolsDir = Join-Path $RepoRoot "tools" 

    Write-Header "1. CONFIGURACION DE RED"
    $DetectedIP = Get-LocalIP
    Write-Ok "IP detectada: $DetectedIP"
    
    Write-Step "Abriendo puertos en Firewall (5002, 27017)..."
    $rules = @(@{ Name="DentiaCore API"; Port=5002 }, @{ Name="DentiaCore MongoDB"; Port=27017 })
    foreach ($r in $rules) {
        Remove-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -LocalPort $r.Port -Protocol TCP -Action Allow -Profile Any | Out-Null
    }
    Write-Ok "Firewall configurado."

    if (-not $SkipMongo) {
        Write-Header "2. CONFIGURACION DE MONGODB"
        
        # Asegurar directorios siempre
        $DataDir = Join-Path $RepoRoot "DB"
        $LogDir = Join-Path $RepoRoot "DB\logs"
        if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

        $Service = Get-Service "MongoDB" -ErrorAction SilentlyContinue

        if (-not $Service) {
            Write-Step "Instalando servicio MongoDB..."
            $LocalMongoBin = Join-Path $ToolsDir "mongo\bin\mongod.exe"
            if (-not (Test-Path $LocalMongoBin)) {
                $LocalMongoBin = Get-ChildItem -Path $RepoRoot -Filter "mongod.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
            }

            if ($LocalMongoBin -and (Test-Path $LocalMongoBin)) {
                $ConfigPath = Join-Path $RepoRoot "mongod.cfg"
                
                $LogFile = "$LogDir\mongod.log"
                $ConfigContent = "systemLog:`n  destination: file`n  path: $LogFile`n  logAppend: true`nstorage:`n  dbPath: $DataDir`nnet:`n  bindIp: 0.0.0.0`n  port: 27017"
                
                Set-Content -Path $ConfigPath -Value $ConfigContent -Encoding UTF8
                $BinPathCmd = $LocalMongoBin + ' --config ' + $ConfigPath + ' --service'
                New-Service -Name "MongoDB" -BinaryPathName $BinPathCmd -DisplayName "MongoDB Server (DentiaCore)" -StartupType Automatic -ErrorAction SilentlyContinue
                Start-Service "MongoDB" -ErrorAction SilentlyContinue
                Write-Ok "Servicio instalado e iniciado."
            } else {
                Write-Err "No se encontro mongod.exe en tools\mongo\bin ni en el repositorio."
                Write-Err "Coloca el binario en tools\mongo\bin\mongod.exe o instala MongoDB Community: https://www.mongodb.com/try/download/community"
                throw "mongod_not_found"
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

        # Validar que MongoDB esta corriendo y escuchando en 27017
        $Service = Get-Service "MongoDB" -ErrorAction SilentlyContinue
        if ($Service -and $Service.Status -ne 'Running') {
            Write-Step "Iniciando servicio MongoDB..."
            Start-Service "MongoDB" -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            $Service.Refresh()
        }
        if (-not $Service -or $Service.Status -ne 'Running') {
            Write-Err "El servicio MongoDB no esta corriendo. Revisa $LogDir\mongod.log e intenta: Start-Service MongoDB"
            throw "mongo_service_not_running"
        }
        $TcpOk = $false
        try {
            $TcpOk = (Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue)
        } catch { $TcpOk = $false }
        if (-not $TcpOk) {
            Write-Warn "MongoDB esta como servicio pero el puerto 27017 no responde aun. Esto puede deberse a un arranque lento; verifica con 'Test-NetConnection 127.0.0.1 -Port 27017'."
        } else {
            Write-Ok "MongoDB corriendo y escuchando en 127.0.0.1:27017"
        }
    }

    Write-Header "3. ACTUALIZANDO VARIABLES DE ENTORNO (.env)"
    $EnvFile = Join-Path $ServerDir ".env"
    
    $NetworkConfig = @{
        "PORT" = "5002"
        "HOST" = "0.0.0.0"
        "MONGODB_URI" = "mongodb://127.0.0.1:27017/DentiaCore"
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

    # Generar JWT_SECRET aleatorio si no existe — evita warning del server
    # "WARNING: JWT_SECRET not set or insecure. Using ephemeral secret..."
    if (-not $FinalEnv.ContainsKey("JWT_SECRET") -or [string]::IsNullOrWhiteSpace($FinalEnv["JWT_SECRET"]) -or $FinalEnv["JWT_SECRET"].Length -lt 32) {
        $Bytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
        $FinalEnv["JWT_SECRET"] = ([BitConverter]::ToString($Bytes) -replace '-','').ToLower()
        Write-Step "JWT_SECRET aleatorio generado (64 chars hex)"
    }

    # Asegurar NODE_ENV (production para LAN install, development si nada definido)
    if (-not $FinalEnv.ContainsKey("NODE_ENV") -or [string]::IsNullOrWhiteSpace($FinalEnv["NODE_ENV"])) {
        $FinalEnv["NODE_ENV"] = "production"
    }
    # COOKIE_SECURE off por default (no usamos HTTPS en LAN local)
    if (-not $FinalEnv.ContainsKey("COOKIE_SECURE")) {
        $FinalEnv["COOKIE_SECURE"] = "false"
    }

    $NewContent = @()
    foreach ($Key in $FinalEnv.Keys) {
        $NewContent += "$Key=$($FinalEnv[$Key])"
    }
    $NewContent | Set-Content -Path $EnvFile -Encoding UTF8
    Write-Ok ".env actualizado (IP: $DetectedIP). Secretos conservados y JWT_SECRET garantizado."

    Write-Header "4. INSTALANDO Y COMPILANDO"

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Warn "Instalando Node.js..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>$null
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
    }

    # Validar version minima de Node (>= 18 para Vite 6)
    $NodeVersionRaw = (& node -v 2>$null)
    if (-not $NodeVersionRaw) {
        Write-Err "Node.js no quedo disponible en PATH tras la instalacion. Reinicia la terminal o instala manualmente desde https://nodejs.org"
        throw "node_not_found"
    }
    $NodeMajor = 0
    try { $NodeMajor = [int]((($NodeVersionRaw -replace '^v','') -split '\.')[0]) } catch { $NodeMajor = 0 }
    if ($NodeMajor -lt 18) {
        Write-Err "Node.js v18 o superior es requerido (detectado: $NodeVersionRaw). Actualiza con: winget upgrade OpenJS.NodeJS.LTS"
        throw "node_version_too_old"
    }
    Write-Ok "Node.js validado: $NodeVersionRaw"

    Run-NpmInstall $RepoRoot

    Run-NpmInstall $ServerDir

    Run-NpmInstall $ClientDir
    
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

    if ($CreateShortcut) {
        Write-Header "5. CREANDO ACCESOS DIRECTOS"
        $pythonPath = (Get-Command pythonw.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
        if (-not $pythonPath) {
            $pythonPath = (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
        }
        if (-not $pythonPath) {
            Write-Warn "No se encontró Python en el PATH. Instala Python para que el Launcher pueda ejecutarse desde el acceso directo."
        } else {
            $launcherScript = Join-Path $RepoRoot 'launcher.py'
            if (-not (Test-Path $launcherScript)) {
                Write-Warn "No se encontró launcher.py en el repositorio. No se crearon accesos directos."
            } else {
                $desktopFolder = [Environment]::GetFolderPath('Desktop')
                $startMenuRoot = [Environment]::GetFolderPath('Programs')
                $programFolder = Join-Path $startMenuRoot 'Dentia Core'
                if (-not (Test-Path $programFolder)) {
                    New-Item -ItemType Directory -Path $programFolder -Force | Out-Null
                }
                $shell = New-Object -ComObject WScript.Shell
                $iconPath = Join-Path $ClientDir 'public\favicon.ico'
                if (-not (Test-Path $iconPath)) {
                    $iconPath = $pythonPath
                }
                $shortcuts = @(
                    @{ Path = Join-Path $desktopFolder 'Dentia Core.lnk'; Description = 'Dentia Core'; },
                    @{ Path = Join-Path $programFolder 'Dentia Core.lnk'; Description = 'Dentia Core'; }
                )
                foreach ($entry in $shortcuts) {
                    $link = $shell.CreateShortcut($entry.Path)
                    $link.TargetPath = $pythonPath
                    $link.Arguments = "`"$launcherScript`""
                    $link.WorkingDirectory = $RepoRoot
                    $link.IconLocation = $iconPath
                    $link.Description = $entry.Description
                    $link.Save()
                }
                Write-Ok "Accesos directos Dentia Core creados en Escritorio y Menú Inicio."
            }
        }
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
