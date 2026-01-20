@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM DentiaCore legacy DB backup/restore + migrations
REM Usage:
REM   scripts\legacy-db-ops.bat backup [MONGODB_URI]
REM   scripts\legacy-db-ops.bat restore <BACKUP_DIR> [MONGODB_URI]

set "MODE=%~1"
set "ARG2=%~2"
set "ARG3=%~3"

if /i "%MODE%"=="" goto :usage

set "MONGODB_URI=%ARG3%"
if /i "%MODE%"=="backup" (
  if not defined ARG2 (
    REM optional uri in position 2
    set "MONGODB_URI=%ARG2%"
  )
)

if not defined MONGODB_URI set "MONGODB_URI=mongodb://localhost:27017/dental_clinic"

where mongodump >nul 2>&1
if errorlevel 1 (
  echo [ERROR] mongodump no encontrado. Instala MongoDB Database Tools.
  exit /b 1
)

where mongorestore >nul 2>&1
if errorlevel 1 (
  echo [ERROR] mongorestore no encontrado. Instala MongoDB Database Tools.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] node no encontrado en PATH.
  exit /b 1
)

for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "TS=%%t"

if /i "%MODE%"=="backup" goto :backup
if /i "%MODE%"=="restore" goto :restore

goto :usage

:backup
set "BACKUP_DIR=%~dp0..\backups\legacy-%TS%"
if not exist "%~dp0..\backups" mkdir "%~dp0..\backups"

echo [INFO] Backup de %MONGODB_URI% a %BACKUP_DIR%

mongodump --uri "%MONGODB_URI%" --out "%BACKUP_DIR%"
if errorlevel 1 (
  echo [ERROR] Fallo el backup.
  exit /b 1
)

echo [OK] Backup completado: %BACKUP_DIR%
exit /b 0

:restore
if not defined ARG2 (
  echo [ERROR] Debes indicar la carpeta de backup.
  goto :usage
)
if not exist "%ARG2%" (
  echo [ERROR] No existe la carpeta: %ARG2%
  exit /b 1
)

echo [INFO] Restaurando %ARG2% a %MONGODB_URI%

mongorestore --drop --uri "%MONGODB_URI%" "%ARG2%"
if errorlevel 1 (
  echo [ERROR] Fallo la restauracion.
  exit /b 1
)

echo [INFO] Ejecutando migraciones legacy...
set "MONGODB_URI=%MONGODB_URI%"
node "%~dp0..\Server\scripts\migratePatientData.js"
if errorlevel 1 exit /b 1
node "%~dp0..\Server\scripts\migrate-anchura-encia.js"
if errorlevel 1 exit /b 1
node "%~dp0..\Server\scripts\fixPeriodontogramValidation.js"
if errorlevel 1 exit /b 1

echo [OK] Restauracion + migraciones completadas.
exit /b 0

:usage
echo.
echo Uso:
echo   scripts\legacy-db-ops.bat backup [MONGODB_URI]
echo   scripts\legacy-db-ops.bat restore ^<BACKUP_DIR^> [MONGODB_URI]
echo.
echo Ejemplos:
echo   scripts\legacy-db-ops.bat backup mongodb://localhost:27017/dental_clinic
echo   scripts\legacy-db-ops.bat restore C:\ruta\backup\legacy-20250120-101500 mongodb://localhost:27017/dental_clinic
echo.
exit /b 1
