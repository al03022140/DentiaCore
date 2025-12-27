@echo off
:: Ejecutar instalador de DENT con permisos de administrador

:: Cambiar al directorio donde esta este archivo .bat
cd /d "%~dp0"

:: Verifica si tiene privilegios de administrador
net session >nul 2>&1
if %errorlevel% == 0 (
    echo ========================================
    echo  Instalador DENT - Sistema Dental
    echo ========================================
    echo.
    echo Directorio actual: %CD%
    echo.
    echo Ejecutando instalador...
    echo.
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0install.ps1" -CreateShortcut -InstallMongoFromProject -RunSmokeTest -AddFirewallRule
    echo.
    pause
) else (
    echo.
    echo ========================================
    echo  Se requieren permisos de Administrador
    echo ========================================
    echo.
    echo Haz clic derecho en este archivo y selecciona:
    echo "Ejecutar como administrador"
    echo.
    pause
)
