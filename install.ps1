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

# Escribe texto en UTF-8 SIN BOM. Windows PowerShell 5.1 'Set-Content -Encoding UTF8'
# añade un BOM (EF BB BF) que rompe el YAML de mongod.cfg y corrompe la primera
# clave de los .env (la leen dotenv y el launcher). Usar esto en su lugar.
function Write-Utf8NoBom {
    param([Parameter(Mandatory)][string]$Path, [string]$Content)
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

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
        $output = npm.cmd install --no-audit --no-fund 2>&1
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

function Assert-Winget {
    # winget viene preinstalado en Windows 10 1809+ vía "App Installer".
    # En Windows 7/8 o builds viejas no existe — el instalador debe avisar y abortar
    # antes de fallar silenciosamente al intentar instalar Node/Python.
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget no encontrado. Esta versión de Windows no permite instalación automática."
        Write-Err "Instala manualmente y reintenta:"
        Write-Err "  • Node.js LTS: https://nodejs.org"
        Write-Err "  • Python 3 (con tcl/tk): https://python.org"
        Write-Err "  • Visual C++ Redistributable x64: https://aka.ms/vs/17/release/vc_redist.x64.exe"
        Write-Err "O actualiza 'App Installer' desde Microsoft Store."
        throw "winget_not_found"
    }
}

function Ensure-VCRedist {
    # MongoDB y módulos nativos de Node (canvas, sharp) requieren Visual C++ Redistributable.
    # Sin él, mongod.exe falla con "el programa no puede iniciarse" o error 0xc000007b.
    $RegPath = 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64'
    $Installed = $false
    try {
        $val = Get-ItemProperty -Path $RegPath -ErrorAction SilentlyContinue
        if ($val -and $val.Installed -eq 1) { $Installed = $true }
    } catch { $Installed = $false }

    if ($Installed) {
        Write-Ok "Visual C++ Redistributable ya instalado."
        return
    }

    Write-Step "Instalando Visual C++ Redistributable (requerido por MongoDB y módulos nativos)..."
    winget install -e --id Microsoft.VCRedist.2015+.x64 --accept-source-agreements --accept-package-agreements --silent 2>$null | Out-Null
    Start-Sleep -Seconds 2
    Write-Ok "Visual C++ Redistributable instalado."
}

function Ensure-Python {
    # El launcher.py necesita Python 3 + tkinter. Sin esto el usuario queda
    # bloqueado al terminar el instalador (no puede abrir el launcher).
    $py = (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
    if (-not $py) {
        $py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
    }

    if ($py) {
        $PyVer = (& $py -V 2>&1)
        Write-Ok "Python detectado: $PyVer"
        return
    }

    Write-Step "Instalando Python 3 (requerido por el Launcher)..."
    # Python.Python.3.12 instala con tk/tcl incluido por default
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent 2>$null | Out-Null
    Start-Sleep -Seconds 3
    # Refrescar PATH desde el registry (winget modifica el PATH del sistema pero no de la sesión actual)
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

    $py = (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
    if (-not $py) {
        Write-Warn "Python instalado pero no aparece en PATH de esta sesión. Cierra y vuelve a abrir la terminal antes de correr el launcher."
    } else {
        Write-Ok "Python instalado: $(& $py -V 2>&1)"
    }
}

try {
    Clear-Host
    Write-Header "INSTALACION DE INFRAESTRUCTURA DENTIACORE (MODO SEGURO)"
    Assert-Admin

    $RepoRoot = $PSScriptRoot
    $ServerDir = Join-Path $RepoRoot "Server"
    $ClientDir = Join-Path $RepoRoot "Client"
    $ToolsDir = Join-Path $RepoRoot "tools" 

    Write-Header "0. VALIDANDO DEPENDENCIAS DEL SISTEMA"
    Assert-Winget
    Ensure-VCRedist
    Ensure-Python

    Write-Header "1. CONFIGURACION DE RED"
    $DetectedIP = Get-LocalIP
    Write-Ok "IP detectada: $DetectedIP"
    
    Write-Step "Abriendo puertos en Firewall (5002, 27017)..."
    $rules = @(@{ Name="DentiaCore API"; Port=5002 }, @{ Name="DentiaCore MongoDB"; Port=27017 })
    foreach ($r in $rules) {
        Remove-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -LocalPort $r.Port -Protocol TCP -Action Allow -Profile Domain,Private -RemoteAddress LocalSubnet | Out-Null
    }
    Write-Ok "Firewall configurado."

    if (-not $SkipMongo) {
        Write-Header "2. CONFIGURACION DE MONGODB"
        
        # Asegurar directorios siempre
        $DataDir = Join-Path $RepoRoot "DB"
        $LogDir = Join-Path $RepoRoot "DB\logs"
        if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

        # Config con rutas ABSOLUTAS y sin BOM. Critico: como servicio de Windows,
        # mongod corre con working dir en C:\Windows\System32, asi que rutas
        # relativas (dbPath: DB) apuntarian a System32\DB y el servicio moriria al
        # arrancar. Se define aqui para usarlo tanto al crear como al normalizar.
        $ConfigPath = Join-Path $RepoRoot "mongod.cfg"
        $LogFile = "$LogDir\mongod.log"
        $ConfigContent = "systemLog:`n  destination: file`n  path: $LogFile`n  logAppend: true`nstorage:`n  dbPath: $DataDir`nnet:`n  bindIp: 127.0.0.1`n  port: 27017"

        $Service = Get-Service "MongoDB" -ErrorAction SilentlyContinue

        if (-not $Service) {
            Write-Step "Instalando servicio MongoDB..."
            $LocalMongoBin = Join-Path $ToolsDir "mongo\bin\mongod.exe"
            if (-not (Test-Path $LocalMongoBin)) {
                $LocalMongoBin = Get-ChildItem -Path $RepoRoot -Filter "mongod.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
            }

            if ($LocalMongoBin -and (Test-Path $LocalMongoBin)) {
                Write-Utf8NoBom -Path $ConfigPath -Content $ConfigContent
                # Quotear paths para soportar rutas con espacios (ej. C:\Program Files\...).
                # Sin esto, sc.exe/New-Service trunca el binPath en el primer espacio
                # y el servicio falla silenciosamente al iniciar.
                $BinPathCmd = '"' + $LocalMongoBin + '" --config "' + $ConfigPath + '" --service'
                New-Service -Name "MongoDB" -BinaryPathName $BinPathCmd -DisplayName "MongoDB Server (DentiaCore)" -StartupType Automatic -ErrorAction SilentlyContinue
                Start-Service "MongoDB" -ErrorAction SilentlyContinue
                Write-Ok "Servicio instalado e iniciado."
            } else {
                Write-Err "No se encontro mongod.exe en tools\mongo\bin ni en el repositorio."
                Write-Err "Coloca el binario en tools\mongo\bin\mongod.exe o instala MongoDB Community: https://www.mongodb.com/try/download/community"
                throw "mongod_not_found"
            }
        } else {
            Write-Ok "Servicio MongoDB ya existe. Normalizando configuracion..."
            $WmiService = Get-WmiObject win32_service -Filter "Name='MongoDB'" -ErrorAction SilentlyContinue
            if ($WmiService) {
                $PathName = $WmiService.PathName

                # Detectar el cfg que usa el servicio (entrecomillado o no).
                $ExistingCfg = $null
                if ($PathName -match '--config\s+"([^"]+)"') { $ExistingCfg = $matches[1] }
                elseif ($PathName -match '--config\s+([^\s"]+)') { $ExistingCfg = $matches[1] }

                # Reescribir SIEMPRE el cfg del servicio con rutas ABSOLUTAS y sin BOM.
                # Esto arregla servicios viejos que quedaron con rutas relativas
                # (dbPath: DB) y por eso no arrancaban (working dir del servicio = System32).
                $TargetCfg = if ($ExistingCfg) { $ExistingCfg } else { $ConfigPath }
                Write-Step "Reescribiendo cfg del servicio a rutas absolutas: $TargetCfg"
                Write-Utf8NoBom -Path $TargetCfg -Content $ConfigContent

                # Si el servicio no apuntaba a ningun --config, re-apuntarlo al cfg absoluto.
                if (-not $ExistingCfg) {
                    $ExistingBin = $null
                    if ($PathName -match '^"([^"]+)"') { $ExistingBin = $matches[1] }
                    elseif ($PathName -match '^(\S+)') { $ExistingBin = $matches[1] }
                    if ($ExistingBin) {
                        $NewBinPath = '"' + $ExistingBin + '" --config "' + $ConfigPath + '" --service'
                        & sc.exe config MongoDB binPath= "$NewBinPath" | Out-Null
                    }
                }

                Write-Step "Reiniciando servicio MongoDB..."
                Restart-Service "MongoDB" -Force -ErrorAction SilentlyContinue
                Write-Ok "Configuracion normalizada y servicio reiniciado."
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

    # CFG-01: AUDIT_HMAC_SECRET — sin él, en produccion el server hace fail-fast
    # (Server/utils/integrity.js) y NO arranca; en dev cae al fallback inseguro
    # que desactiva la deteccion de manipulacion del audit log (NOM-024).
    if (-not $FinalEnv.ContainsKey("AUDIT_HMAC_SECRET") -or [string]::IsNullOrWhiteSpace($FinalEnv["AUDIT_HMAC_SECRET"]) -or $FinalEnv["AUDIT_HMAC_SECRET"].Length -lt 32) {
        $HmacBytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($HmacBytes)
        $FinalEnv["AUDIT_HMAC_SECRET"] = ([BitConverter]::ToString($HmacBytes) -replace '-','').ToLower()
        Write-Step "AUDIT_HMAC_SECRET aleatorio generado (64 chars hex)"
    }

    # Asegurar NODE_ENV (production para LAN install, development si nada definido)
    if (-not $FinalEnv.ContainsKey("NODE_ENV") -or [string]::IsNullOrWhiteSpace($FinalEnv["NODE_ENV"])) {
        $FinalEnv["NODE_ENV"] = "production"
    }
    # COOKIE_SECURE off por default (no usamos HTTPS en LAN local)
    if (-not $FinalEnv.ContainsKey("COOKIE_SECURE")) {
        $FinalEnv["COOKIE_SECURE"] = "false"
    }

    # O-2: TZ fija — sin esto, los cortes de caja y timestamps de auditoria
    # dependen de la TZ del SO (silencioso si difiere de la de la clinica).
    if (-not $FinalEnv.ContainsKey("TZ")) {
        $FinalEnv["TZ"] = "America/Mexico_City"
    }

    $NewContent = @()
    foreach ($Key in $FinalEnv.Keys) {
        $NewContent += "$Key=$($FinalEnv[$Key])"
    }
    Write-Utf8NoBom -Path $EnvFile -Content (($NewContent -join "`n") + "`n")
    Write-Ok ".env actualizado (IP: $DetectedIP). Secretos conservados y JWT_SECRET garantizado."

    # O-1: ALERT_WEBHOOK_URL es opcional — sin ella, check-health.js solo
    # imprime en el log de la tarea programada sin notificar activamente.
    # Placeholder comentado para que sea facil de encontrar y activar.
    $EnvRaw = Get-Content $EnvFile -Raw
    if ($EnvRaw -notmatch '(?m)^#?\s*ALERT_WEBHOOK_URL=') {
        Add-Content -Path $EnvFile -Value "`n# O-1: URL de webhook (Slack/Discord/ntfy.sh/etc.) para alertas de backup/salud.`n# ALERT_WEBHOOK_URL=https://hooks.slack.com/services/..."
    }

    # Client/.env — necesario porque Vite hornea VITE_API_URL en el bundle de producción.
    # En .gitignore, así que NO viene en descargas frescas de GitHub.
    $ClientEnvFile = Join-Path $ClientDir ".env"
    Write-Step "Creando/actualizando Client/.env..."
    $ClientApiUrl = "http://$DetectedIP" + ":5002"
    Write-Utf8NoBom -Path $ClientEnvFile -Content ("VITE_API_URL=`"$ClientApiUrl`"" + "`n")
    Write-Ok "Client/.env actualizado (VITE_API_URL=$ClientApiUrl)"

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
    if ($NodeMajor -gt 22) {
        Write-Warn "Node.js $NodeVersionRaw supera el rango probado por el proyecto (engines: >=18 <=22). Si hay fallos de build/runtime, instala Node 20/22 LTS."
    }
    Write-Ok "Node.js validado: $NodeVersionRaw"

    Write-Header "3.5. RESPALDO Y MONITOREO AUTOMATICOS"

    # O-1: registrar backup diario (3am) y chequeo de salud (cada 4h) via el
    # Programador de Tareas de Windows. Idempotente: -Force sobreescribe la
    # tarea si ya existia (misma definicion, no se duplica).
    try {
        $NodeExe = (Get-Command node -ErrorAction Stop).Source
        New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'backups') | Out-Null

        $BackupAction = New-ScheduledTaskAction -Execute $NodeExe -Argument 'scripts\backup-db.js --keep=14' -WorkingDirectory $RepoRoot
        $BackupTrigger = New-ScheduledTaskTrigger -Daily -At 3am
        Register-ScheduledTask -TaskName 'DentiaCore-Backup' -Action $BackupAction -Trigger $BackupTrigger `
            -Description 'Respaldo automatico de la base de datos de DentiaCore' -Force | Out-Null

        $HealthAction = New-ScheduledTaskAction -Execute $NodeExe -Argument 'scripts\check-health.js' -WorkingDirectory $RepoRoot
        $HealthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 4) -RepetitionDuration ([TimeSpan]::MaxValue)
        Register-ScheduledTask -TaskName 'DentiaCore-HealthCheck' -Action $HealthAction -Trigger $HealthTrigger `
            -Description 'Chequeo de salud (backup/DB/disco) de DentiaCore' -Force | Out-Null

        # P0.5: prueba mensual de restauración — un backup solo cuenta si se
        # demostró restaurable (restaura en BD temporal, arranca el server,
        # verifica cadena NOM-024, documentos y uploads; PASS/FAIL).
        $RestoreAction = New-ScheduledTaskAction -Execute $NodeExe -Argument 'scripts\restore-test.js' -WorkingDirectory $RepoRoot
        $RestoreTrigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Sunday -At 4am
        Register-ScheduledTask -TaskName 'DentiaCore-RestoreTest' -Action $RestoreAction -Trigger $RestoreTrigger `
            -Description 'Prueba mensual de restauracion de backups de DentiaCore (P0.5)' -Force | Out-Null

        Write-Ok "Backup diario (3am), chequeo de salud (cada 4h) y prueba de restauracion (cada 4 semanas) registrados en el Programador de Tareas."
    } catch {
        Write-Warn "No se pudo registrar el Programador de Tareas ($($_.Exception.Message)). Agrega manualmente:"
        Write-Host "    schtasks /create /tn DentiaCore-Backup /tr `"node $RepoRoot\scripts\backup-db.js --keep=14`" /sc daily /st 03:00"
        Write-Host "    schtasks /create /tn DentiaCore-HealthCheck /tr `"node $RepoRoot\scripts\check-health.js`" /sc hourly /mo 4"
        Write-Host "    schtasks /create /tn DentiaCore-RestoreTest /tr `"node $RepoRoot\scripts\restore-test.js`" /sc monthly /d 1 /st 04:00"
    }

    Run-NpmInstall $RepoRoot

    Run-NpmInstall $ServerDir

    Run-NpmInstall $ClientDir
    
    if (-not $SkipFrontendBuild) {
        Write-Step "Compilando Frontend para LAN..."
        $env:VITE_API_URL = "http://$DetectedIP`:5002"
        Push-Location $ClientDir
        $BuildOut = $null
        try {
            $BuildOut = & npm.cmd run build 2>&1 | Out-String
        } catch {
            $BuildOut = $_ | Out-String
        }
        Pop-Location
        $DistIndex = Join-Path $ClientDir 'dist\index.html'
        if (Test-Path $DistIndex) {
            Write-Ok "Build completado (Client/dist/index.html generado)."
        } else {
            Write-Err "El build del frontend NO genero Client/dist/index.html."
            if ($BuildOut) { Write-Err $BuildOut }
            if ($Mode -eq 'LAN') {
                # En modo LAN el server sirve Client/dist; sin build no hay frontend.
                throw "frontend_build_failed"
            } else {
                Write-Warn "Continuando en modo $Mode (no sirve estaticos), pero revisa el build."
            }
        }
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

    if ($RunSmokeTest) {
        Write-Header "6. VERIFICACION FINAL (SMOKE TEST)"
        $errors = @()

        # Check MongoDB service y puerto
        $svc = Get-Service "MongoDB" -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') { Write-Ok "MongoDB service: Running" }
        else { $errors += "MongoDB service no esta Running"; Write-Err "MongoDB service: $($svc.Status)" }

        # Check Node
        try {
            $nv = & node -v 2>$null
            if ($nv) { Write-Ok "Node: $nv" } else { $errors += "node no responde" }
        } catch { $errors += "node falla al ejecutar" }

        # Check Python (necesario para el launcher)
        $py = (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
        if ($py) { Write-Ok "Python: $(& $py -V 2>&1)" }
        else { $errors += "python no encontrado en PATH (reinicia terminal y vuelve a verificar)" }

        # Check archivos críticos
        if (Test-Path (Join-Path $ServerDir '.env')) { Write-Ok "Server/.env existe" }
        else { $errors += "Server/.env faltante" }

        if (Test-Path (Join-Path $ClientDir '.env')) { Write-Ok "Client/.env existe" }
        else { $errors += "Client/.env faltante" }

        if (Test-Path (Join-Path $ServerDir 'node_modules')) { Write-Ok "Server/node_modules existe" }
        else { $errors += "Server/node_modules faltante (corre 'npm install' en Server/)" }

        if (Test-Path (Join-Path $ClientDir 'node_modules')) { Write-Ok "Client/node_modules existe" }
        else { $errors += "Client/node_modules faltante (corre 'npm install' en Client/)" }

        if (Test-Path (Join-Path $RepoRoot 'DB')) { Write-Ok "DB/ existe" }
        else { $errors += "DB/ faltante" }

        # Prueba HTTP real: arrancar el server unos segundos y consultar /api/health
        Write-Step "Probando el servidor (GET /api/health)..."
        $serverProc = $null
        try {
            $nodeExe = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
            $DentJs = Join-Path $ServerDir 'scripts\dent.js'
            if ($nodeExe -and (Test-Path $DentJs)) {
                $env:PORT = '5002'; $env:HOST = '127.0.0.1'
                $serverProc = Start-Process -FilePath $nodeExe -ArgumentList 'scripts\dent.js' -WorkingDirectory $ServerDir -PassThru -WindowStyle Hidden
                $healthOk = $false
                foreach ($i in 1..20) {
                    Start-Sleep -Seconds 1
                    try {
                        $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:5002/api/health' -UseBasicParsing -TimeoutSec 3
                        if ($resp.StatusCode -eq 200) { $healthOk = $true; break }
                    } catch { }
                }
                if ($healthOk) { Write-Ok "API responde: GET /api/health -> 200" }
                else { $errors += "El server no respondio 200 en http://127.0.0.1:5002/api/health (revisa DB\logs\mongod.log, Server/logs y MONGODB_URI)" }
            } else {
                Write-Warn "Prueba HTTP omitida (node o Server/scripts/dent.js no encontrado)."
            }
        } catch {
            $errors += "Fallo la prueba HTTP del server: $($_.Exception.Message)"
        } finally {
            if ($serverProc -and -not $serverProc.HasExited) { Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue }
        }

        if ($errors.Count -eq 0) {
            Write-Ok "Smoke test: TODO OK"
        } else {
            Write-Warn "Smoke test detecto $($errors.Count) problema(s):"
            foreach ($e in $errors) { Write-Err "  - $e" }
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
