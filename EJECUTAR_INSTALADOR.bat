@echo off
:: Ejecutar instalador de DentiaCore con permisos de administrador
:: Auto-eleva a admin si el usuario no abrio como administrador

cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Solicitando permisos de Administrador...
    powershell.exe -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================
echo  Instalador DentiaCore - Sistema Dental
echo ========================================
echo.
echo Directorio actual: %CD%
echo.
echo Ejecutando instalador (esto puede tardar 5-15 min en frio)...
echo Se instalaran: Python, Node.js, Visual C++ Redist, MongoDB y dependencias npm.
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0install.ps1" -CreateShortcut -InstallMongoFromProject -RunSmokeTest -AddFirewallRule
echo.
echo ========================================
echo  Instalacion finalizada
echo ========================================
echo.
echo Siguiente paso:
echo   1. Abre el acceso directo "Dentia Core" en el Escritorio
echo   2. Haz click en "Iniciar Aplicacion Completa"
echo   3. Click en "Crear administrador" para crear el primer usuario
echo.
pause
