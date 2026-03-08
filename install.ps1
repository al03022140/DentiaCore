<#
.SYNOPSIS
    Instalador Maestro para Sistema Dent - Infraestructura Hibrida
.DESCRIPTION
    Instala todas las dependencias y configura el entorno para ejecutar
    el proyecto Dent en modo Local (desarrollo) o LAN (produccion).
    Alineado con launcher.py para que ambos modos funcionen correctamente.
#>

[CmdletBinding()]
param(
    [ValidateSet('Local','LAN')]
    [string]$Mode = 'Local',
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
    Write-Header "INSTALACION DE INFRAESTRUCTURA DENT (MODO: $Mode)"
    Assert-Admin

    $RepoRoot = $PSScriptRoot
    $ServerDir = Join-Path $RepoRoot "Server"
    $ClientDir = Join-Path $RepoRoot "Client"
    $ToolsDir = Join-Path $RepoRoot "tools"
    $IsLAN = $Mode -eq 'LAN'

    # ================================================================
    # PASO 1: CONFIGURACION DE RED (solo LAN necesita firewall)
    # ================================================================
    Write-Header "1. CONFIGURACION DE RED"
    $DetectedIP = Get-LocalIP
    Write-Ok "IP detectada: $DetectedIP"
    Write-Ok "Modo seleccionado: $Mode"

    if ($IsLAN) {
        Write-Step "Abriendo puertos en Firewall (5002, 27017)..."
        $rules = @(@{ Name="Dent API"; Port=5002 }, @{ Name="Dent MongoDB"; Port=27017 })
        foreach ($r in $rules) {
            Remove-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
            New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -LocalPort $r.Port -Protocol TCP -Action Allow -Profile Any | Out-Null
        }
        Write-Ok "Firewall configurado."
    } else {
        Write-Ok "Modo Local: configuracion de firewall omitida."
    }

    # ================================================================
    # PASO 2: MONGODB
    # ================================================================
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
                
                $BindIP = if ($IsLAN) { "0.0.0.0" } else { "127.0.0.1" }
                $LogFile = "$LogDir\mongod.log"
                $ConfigContent = "systemLog:`n  destination: file`n  path: $LogFile`n  logAppend: true`nstorage:`n  dbPath: $DataDir`nnet:`n  bindIp: $BindIP`n  port: 27017"
                
                Set-Content -Path $ConfigPath -Value $ConfigContent -Encoding UTF8
                $BinPathCmd = '"' + $LocalMongoBin + '" --config "' + $ConfigPath + '" --service'
                New-Service -Name "MongoDB" -BinaryPathName $BinPathCmd -DisplayName "MongoDB Server (Dent)" -StartupType Automatic -ErrorAction SilentlyContinue
                Start-Service "MongoDB" -ErrorAction SilentlyContinue
                Write-Ok "Servicio instalado e iniciado (bindIp: $BindIP)."
            } else {
                Write-Warn "No se encontro mongod.exe. Omitiendo servicio."
                Write-Warn "El launcher intentara iniciar MongoDB automaticamente al ejecutar."
            }
        } else {
            Write-Ok "Servicio MongoDB ya existe."
            if ($IsLAN) {
                $WmiService = Get-WmiObject win32_service -Filter "Name='MongoDB'" -ErrorAction SilentlyContinue
                if ($WmiService) {
                    $PathName = $WmiService.PathName
                    if ($PathName -match 'config\s+(.+?)\s+--service') {
                        $ExistingCfg = $matches[1].Trim('"')
                        if (Test-Path $ExistingCfg) {
                            $Content = Get-Content $ExistingCfg -Raw
                            if ($Content -notmatch "0.0.0.0") {
                                Write-Step "Actualizando bindIp a 0.0.0.0 para acceso LAN..."
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
    }

    # ================================================================
    # PASO 3: VARIABLES DE ENTORNO (.env) segun modo
    # ================================================================
    Write-Header "3. ACTUALIZANDO VARIABLES DE ENTORNO (.env)"
    $EnvFile = Join-Path $ServerDir ".env"
    
    # Configuracion segun modo (alineada con launcher.py _apply_mode_environment)
    if ($IsLAN) {
        $NetworkConfig = @{
            "PORT"        = "5002"
            "HOST"        = "0.0.0.0"
            "MONGODB_URI" = "mongodb://127.0.0.1:27017/Dent"
            "CLIENT_URL"  = "http://$DetectedIP`:5002"
            "PUBLIC_URL"  = "http://$DetectedIP`:5002"
            "NODE_ENV"    = "production"
        }
    } else {
        $NetworkConfig = @{
            "PORT"        = "5002"
            "HOST"        = "127.0.0.1"
            "MONGODB_URI" = "mongodb://127.0.0.1:27017/Dent"
            "CLIENT_URL"  = "http://localhost:5173"
            "PUBLIC_URL"  = "http://localhost:5002"
            "NODE_ENV"    = "development"
        }
    }

    $FinalEnv = [System.Collections.Generic.Dictionary[string,string]]::new()
    
    if (Test-Path $EnvFile) {
        Write-Step "Leyendo .env existente para preservar secretos..."
        Get-Content $EnvFile -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match "^\s*([^#=]+)=(.*)$") {
                $Key = $matches[1].Trim()
                $Value = $matches[2].Trim()
                # Preservar solo claves no-red con valor no vacio.
                # Las claves vacias (ej. GOOGLE_CLIENT_ID=) se omiten para
                # que root .env pueda proveerlas via cascada de dotenv.
                if (-not $NetworkConfig.ContainsKey($Key) -and $Value -ne '') {
                    $FinalEnv[$Key] = $Value
                }
            }
        }
    }

    foreach ($Key in $NetworkConfig.Keys) {
        $FinalEnv[$Key] = $NetworkConfig[$Key]
    }

    $NewContent = @()
    foreach ($Key in $FinalEnv.Keys) {
        $NewContent += "$Key=$($FinalEnv[$Key])"
    }
    $NewContent | Set-Content -Path $EnvFile -Encoding UTF8
    Write-Ok ".env de Server actualizado (Modo: $Mode)."

    # Crear/actualizar Client/.env solo si es LAN (en local Vite usa proxy)
    $ClientEnvFile = Join-Path $ClientDir ".env"
    if ($IsLAN) {
        "VITE_API_URL=http://$DetectedIP`:5002" | Set-Content -Path $ClientEnvFile -Encoding UTF8
        Write-Ok "Client/.env actualizado con VITE_API_URL para LAN."
    } else {
        # En modo local, Vite usa proxy asi que VITE_API_URL apunta a localhost
        "VITE_API_URL=http://localhost:5002" | Set-Content -Path $ClientEnvFile -Encoding UTF8
        Write-Ok "Client/.env actualizado con VITE_API_URL para local."
    }

    # ================================================================
    # PASO 4: VERIFICAR REQUISITOS (Node.js y Python)
    # ================================================================
    Write-Header "4. VERIFICANDO REQUISITOS DEL SISTEMA"
    
    # --- Node.js ---
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Step "Instalando Node.js LTS..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>$null
        # Refrescar PATH para la sesion actual
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        if (Get-Command node -ErrorAction SilentlyContinue) {
            Write-Ok "Node.js instalado: $(node --version)"
        } else {
            Write-Err "No se pudo instalar Node.js automaticamente. Instala Node.js LTS manualmente desde https://nodejs.org"
            throw "Node.js no disponible"
        }
    } else {
        Write-Ok "Node.js encontrado: $(node --version)"
    }

    # --- Python (requerido por launcher.py) ---
    $PythonCmd = $null
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $PythonCmd = "python"
    } elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
        $PythonCmd = "python3"
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $PythonCmd = "py"
    }

    if (-not $PythonCmd) {
        Write-Step "Python no encontrado. Instalando Python 3..."
        winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent 2>$null
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        if (Get-Command python -ErrorAction SilentlyContinue) {
            $PythonCmd = "python"
            Write-Ok "Python instalado: $(python --version)"
        } else {
            Write-Warn "No se pudo instalar Python automaticamente."
            Write-Warn "El launcher (launcher.py) requiere Python 3 con tkinter."
            Write-Warn "Instala Python 3 desde https://python.org (marca 'Add to PATH' y 'tcl/tk')."
        }
    } else {
        Write-Ok "Python encontrado: $($PythonCmd) $(& $PythonCmd --version 2>&1)"
    }

    # ================================================================
    # PASO 5: INSTALAR DEPENDENCIAS NPM (raiz + Server + Client)
    # ================================================================
    Write-Header "5. INSTALANDO DEPENDENCIAS NPM"

    # --- Dependencias RAIZ (concurrently, nodemon, cross-env, etc.) ---
    # El launcher usa 'npm run server' y 'npm run client' desde el root,
    # que necesitan nodemon, concurrently y cross-env instalados aqui.
    Write-Step "Instalando dependencias del proyecto raiz..."
    Push-Location $RepoRoot
    npm install --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "Fallo npm install en raiz (exit code: $LASTEXITCODE)"; throw "npm install raiz fallo" }
    Pop-Location
    Write-Ok "Dependencias raiz instaladas (nodemon, concurrently, etc.)."

    # --- Dependencias SERVER ---
    Write-Step "Instalando dependencias del Servidor..."
    Push-Location $ServerDir
    npm install --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "Fallo npm install en Server (exit code: $LASTEXITCODE)"; throw "npm install Server fallo" }
    Pop-Location
    Write-Ok "Dependencias Server instaladas."

    # --- Dependencias CLIENT ---
    Write-Step "Instalando dependencias del Cliente..."
    Push-Location $ClientDir
    npm install --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "Fallo npm install en Client (exit code: $LASTEXITCODE)"; throw "npm install Client fallo" }
    Pop-Location
    Write-Ok "Dependencias Client instaladas."

    # ================================================================
    # PASO 6: BUILD DEL FRONTEND (solo en modo LAN)
    # ================================================================
    if ($IsLAN -and -not $SkipFrontendBuild) {
        Write-Header "6. COMPILANDO FRONTEND PARA LAN"
        Write-Step "Compilando Frontend (VITE_API_URL=http://$DetectedIP`:5002)..."
        $env:VITE_API_URL = "http://$DetectedIP`:5002"
        Push-Location $ClientDir
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Build del frontend fallo (exit code: $LASTEXITCODE). Puedes ejecutar 'npm run build' manualmente en Client/"
        } else {
            Write-Ok "Build completado en Client/dist/."
        }
        Pop-Location
    } elseif (-not $IsLAN) {
        Write-Header "6. BUILD FRONTEND"
        Write-Ok "Modo Local: el frontend se sirve con Vite dev server (no requiere build)."
    }

    # ================================================================
    # PASO 7: CREAR ACCESO DIRECTO AL LAUNCHER (opcional)
    # ================================================================
    if ($CreateShortcut -and $PythonCmd) {
        Write-Header "7. CREANDO ACCESO DIRECTO"
        try {
            $DesktopPath = [System.Environment]::GetFolderPath('Desktop')
            $ShortcutPath = Join-Path $DesktopPath "Dent Launcher.lnk"
            $LauncherScript = Join-Path $RepoRoot "launcher.py"

            if (Test-Path $LauncherScript) {
                $WshShell = New-Object -ComObject WScript.Shell
                $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
                # Usar pythonw para evitar ventana de consola
                $PythonWCmd = (Get-Command $PythonCmd -ErrorAction SilentlyContinue).Source
                if ($PythonWCmd) {
                    $PythonWCmd = $PythonWCmd -replace 'python\.exe$', 'pythonw.exe'
                    if (-not (Test-Path $PythonWCmd)) { $PythonWCmd = (Get-Command $PythonCmd).Source }
                }
                $Shortcut.TargetPath = $PythonWCmd
                $Shortcut.Arguments = "`"$LauncherScript`""
                $Shortcut.WorkingDirectory = $RepoRoot
                $Shortcut.Description = "Dent Application Launcher"
                $Shortcut.Save()
                Write-Ok "Acceso directo creado en el Escritorio: 'Dent Launcher'."
            } else {
                Write-Warn "No se encontro launcher.py. Acceso directo no creado."
            }
        } catch {
            Write-Warn "No se pudo crear el acceso directo: $_"
        }
    }

    # ================================================================
    # RESUMEN FINAL
    # ================================================================
    Write-Header "INSTALACION EXITOSA"
    Write-Host ""
    Write-Host "  Modo instalado : $Mode" -ForegroundColor Green
    if ($IsLAN) {
        Write-Host "  IP del Servidor: $DetectedIP" -ForegroundColor Cyan
        Write-Host "  URL de acceso  : http://$DetectedIP`:5002" -ForegroundColor Cyan
    } else {
        Write-Host "  Backend        : http://localhost:5002" -ForegroundColor Cyan
        Write-Host "  Frontend (Vite): http://localhost:5173" -ForegroundColor Cyan
    }
    Write-Host ""
    Write-Host "  Para iniciar la aplicacion:" -ForegroundColor Yellow
    if ($PythonCmd) {
        Write-Host "    $PythonCmd launcher.py" -ForegroundColor White
    } else {
        Write-Host "    python launcher.py  (requiere Python 3)" -ForegroundColor White
    }
    Write-Host "    O desde la raiz: npm run dev  (modo desarrollo)" -ForegroundColor White
    Write-Host ""
    if ($IsLAN) {
        Write-Host "  NOTA: Si usas Google Auth, agrega http://$DetectedIP`:5002 en Google Cloud Console." -ForegroundColor Yellow
    }

} catch {
    Write-Header "ERROR"
    Write-Err $_.Exception.Message
    Write-Err $_.ScriptStackTrace
    exit 1
}
