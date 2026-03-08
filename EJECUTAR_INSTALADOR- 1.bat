@echo off
setlocal enabledelayedexpansion
:: Ejecutar instalador de DENT con permisos de administrador

:: Cambiar al directorio donde esta este archivo .bat
cd /d "%~dp0"

:: Verifica si tiene privilegios de administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo  Se requieren permisos de Administrador
    echo ========================================
    echo.
    echo Haz clic derecho en este archivo y selecciona:
    echo "Ejecutar como administrador"
    echo.
    pause
    goto :eof
)

echo ========================================
echo  Instalador DENT - Sistema Dental
echo ========================================
echo.
echo Directorio actual: %CD%
echo.
echo Selecciona el modo de instalacion:
echo   1. Local  (desarrollo - recomendado)
echo   2. LAN    (produccion en red local)
echo.
set /p MODO="Escribe 1 o 2 (default: 1): "

set "INSTALL_MODE=Local"
if "!MODO!"=="2" set "INSTALL_MODE=LAN"

echo.
echo Modo seleccionado: !INSTALL_MODE!
echo Ejecutando instalador...
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Mode !INSTALL_MODE! -CreateShortcut -InstallMongoFromProject -AddFirewallRule
echo.
pause
endlocal
