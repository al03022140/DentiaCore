<#
  Utilidades compartidas para MongoDB (DENT)
  - Evita rutas absolutas: usa $PSScriptRoot y variables de entorno
  - Proporciona una sola fuente de verdad para ubicar mongod.exe
#>

Set-StrictMode -Version Latest

function Get-ProjectMongoBin {
    param(
        [Parameter(Mandatory=$true)][string]$RepoRoot
    )
    try {
        $localBin = Join-Path $RepoRoot 'tools\mongo\bin'
        if (Test-Path (Join-Path $localBin 'mongod.exe')) { return $localBin }
        # Alternativas habituales por si cambia el nombre de la carpeta
        $candidates = @(
            'tools\mongodb\bin',
            'mongo\bin',
            'bin'
        )
        foreach ($rel in $candidates) {
            $bin = Join-Path $RepoRoot $rel
            if (Test-Path (Join-Path $bin 'mongod.exe')) { return $bin }
        }
        return $null
    } catch { return $null }
}

function Find-MongodExe {
    param(
        [Parameter(Mandatory=$true)][string]$RepoRoot
    )
    try {
        # 1) PATH
        $cmd = Get-Command mongod -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) { return $cmd.Source }

        # 2) Servicio instalado (si existe)
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

        # 3) Instalaciones comunes (usando variables de entorno, sin rutas fijas)
        $candidateBases = @()
        if ($env:ProgramFiles) { $candidateBases += (Join-Path $env:ProgramFiles 'MongoDB\Server') }
        if ($env:ProgramFiles_x86) { $candidateBases += (Join-Path $env:ProgramFiles_x86 'MongoDB\Server') }
        if ($env:SystemDrive) { $candidateBases += (Join-Path $env:SystemDrive 'MongoDB\Server') }
        # 3b) Ubicaciones no estándar: carpetas raíz como C:\MongoDB o D:\MongoDB (instalaciones por MSI/zip manual)
        if ($env:SystemDrive) { $candidateBases += (Join-Path $env:SystemDrive 'MongoDB') }
        foreach ($base in $candidateBases) {
            if (-not (Test-Path $base)) { continue }
            # Escanear subcarpetas y detectar bin\mongod.exe
            $exe = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName 'bin' } |
                ForEach-Object { Join-Path $_ 'mongod.exe' } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
            if ($exe) { return $exe }
        }

        # 4) Proyecto local
        $projBin = Get-ProjectMongoBin -RepoRoot $RepoRoot
        if ($projBin) {
            $localExe = Join-Path $projBin 'mongod.exe'
            if (Test-Path $localExe) { return $localExe }
        }

        return $null
    } catch { return $null }
}

function Get-MongoVersionFromExe {
    param(
        [Parameter(Mandatory=$true)][string]$ExePath
    )
    try {
        if (-not (Test-Path $ExePath)) { return $null }
        $output = & $ExePath --version 2>$null
        if (-not $output) { return $null }
        foreach ($line in $output) {
            if ($line -match 'db version v(?<ver>[0-9]+\.[0-9]+\.[0-9]+)') { return $Matches['ver'] }
        }
        return $null
    } catch { return $null }
}

function Get-LatestMongoBin {
    param(
        [Parameter(Mandatory=$true)][string]$RepoRoot
    )
    $exe = Find-MongodExe -RepoRoot $RepoRoot
    if ($exe) { return (Split-Path -Parent $exe) }

    $candidateBases = @()
    if ($env:ProgramFiles) { $candidateBases += (Join-Path $env:ProgramFiles 'MongoDB\Server') }
    if ($env:ProgramFiles_x86) { $candidateBases += (Join-Path $env:ProgramFiles_x86 'MongoDB\Server') }
    if ($env:SystemDrive) { 
        $candidateBases += (Join-Path $env:SystemDrive 'MongoDB\Server')
        $candidateBases += (Join-Path $env:SystemDrive 'MongoDB')
    }
    foreach ($base in $candidateBases) {
        if (-not (Test-Path $base)) { continue }
        $bin = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName 'bin' } |
            Where-Object { Test-Path (Join-Path $_ 'mongod.exe') } |
            Select-Object -First 1
        if ($bin) { return $bin }
    }
    return $null
}