# Auditoría a fondo — Instalador y Launcher (DentiaCore)

Fecha: 2026-06-01. Revisión profunda de `install.ps1`, `install.sh`, `EJECUTAR_INSTALADOR.bat` y `launcher.py`, cruzada con `package.json`, `create-admin.js`, `Server/utils/crypto.js`, `Server/scripts/dent.js`, `scripts/start-mongo.js` y `mongod.cfg`. Cada hallazgo fue verificado leyendo el código real.

> Contexto: el `npm install` (canvas/sharp) y la resolución de `node`/`npm` en el PATH del launcher ya se arreglaron en pasos previos. Esto cubre **lo demás**.

---

## 0. Lo más importante (cadena cross-cutting): el BOM vuelve en cada instalación

`install.ps1` escribe sus archivos de config con `Set-Content -Encoding UTF8`, y como `EJECUTAR_INSTALADOR.bat` usa `powershell.exe` (Windows PowerShell **5.1**), eso añade un **BOM UTF-8** (`EF BB BF`) al inicio de cada archivo:

- `mongod.cfg` (líneas 199 y 224) — el parser YAML de MongoDB puede rechazar un archivo con BOM → **mongod no arranca** con error de config.
- `Server/.env` (línea 310) — el BOM corrompe la **primera clave** (`NODE_ENV`).
- `Client/.env` (línea 318) — corrompe `VITE_API_URL`.

Y del lado del launcher, `_parse_simple_env` / `_parse_env_file` **no** quitan el BOM, así que al leer `Server/.env` la primera clave queda como `﻿NODE_ENV` y, peor, los lookups de `JWT_SECRET` / `MONGODB_URI` pueden fallar → el launcher reescribe el `.env` en cada arranque o inyecta una `MONGODB_URI` por defecto.

**Este es el origen del BOM que quité antes de `Server/.env`: volverá en cuanto se reinstale.** 
**Fix (ambos lados):** en PowerShell escribir sin BOM (`[System.IO.File]::WriteAllText($p,$c,(New-Object System.Text.UTF8Encoding($false)))`); y abrir los `.env` con `encoding='utf-8-sig'` en los parsers del launcher. **Severidad: ALTA.**

---

## 1. install.ps1 (Windows — objetivo principal)

| # | Sev | Ubicación | Problema | Fix |
|---|-----|-----------|----------|-----|
| P1 | ALTA | 199, 224, 310, 318 | BOM (ver sección 0): rompe `mongod.cfg` y la 1ª clave de los `.env`. | Escribir UTF-8 sin BOM. |
| P2 | MEDIA | 404–446 | **Smoke test falso-positivo**: solo verifica servicio Mongo, `node -v`, python y existencia de archivos/`node_modules`. **Nunca arranca el server ni consulta `/api/health`.** Dice "TODO OK" aunque el server no pueda servir (build roto, `MONGODB_URI` mala, crash al boot). | Arrancar node unos segundos y hacer `Invoke-WebRequest http://127.0.0.1:5002/api/health`. |
| P3 | MEDIA | 329–341 | Solo valida Node `>= 18`, sin techo. `winget ... OpenJS.NodeJS.LTS` instala la LTS vigente, que puede ser **mayor que el `<=22`** que declara `package.json`. Pasa la validación y luego rompe build/runtime. | Fijar versión (p. ej. `--version 22.x`) y avisar si `> 22`. |
| P4 | MEDIA | 349–360 | Si falla el **build del frontend** solo imprime un *warning* ("opcional"), pero en modo LAN el server sirve `Client/dist`. Sin `dist` → página en blanco, y el smoke test (P2) no lo detecta. | Tras el build, `Test-Path Client\dist\index.html`; si falta en LAN, error. |
| P5 | MEDIA | 167–173, 197 | Firewall abre **27017 en todos los perfiles** y Mongo queda en `bindIp 0.0.0.0` **sin auth** → la BD con datos de pacientes queda accesible en toda la red. | Restringir a `-Profile Domain,Private -RemoteAddress LocalSubnet`; idealmente activar auth. |
| P6 | BAJA/MEDIA | 38–52 (+ `$ErrorActionPreference='Stop'` línea 23) | Manejo frágil de `npm install`: con PS 5.1 + `Stop`, el ruido de stderr de npm puede caer en el `catch`. Hoy es menos probable (el `npm install` ya quedó limpio), pero el patrón try/catch está mal planteado. | Envolver el npm con `$ErrorActionPreference='Continue'` y leer `$LASTEXITCODE` directo. |
| P7 | BAJA | 98–116 | `Ensure-VCRedist` imprime "instalado" aunque winget falle (`2>$null`, sin re-verificar). El comentario aún cita "canvas, sharp" (ya removidos), aunque VC++ sigue siendo necesario para MongoDB. | Re-verificar registro tras instalar; actualizar comentario. |
| P8 | BAJA | 18–20 | Los switches `-AddFirewallRule` e `-InstallMongoFromProject` se declaran pero **no se usan**: firewall y Mongo corren siempre (solo `-SkipMongo` los frena). El `.bat` los pasa creyendo que controlan algo. | Honrar los flags o quitarlos y documentar. |

---

## 2. launcher.py (más allá del arranque del server)

| # | Sev | Ubicación | Problema | Fix |
|---|-----|-----------|----------|-----|
| L1 | ALTA | 1835–1842 | **Contraseña de admin como argumento de CLI con `shell=True` en Windows.** `create-admin.js` la lee de `process.argv[3]`. Contraseñas con `& \| < > ^ % "` o espacios se parten/reinterpretan por `cmd.exe` → el admin queda con otra contraseña (no puede entrar). Además queda visible en la lista de procesos. | Pasar la contraseña por **stdin** o env var; `shell=False` resolviendo `node` con `shutil.which`. |
| L2 | ALTA | 2439–2443 | **mongod se lanza con `--bind_ip 0.0.0.0` siempre** en macOS/Linux, incluso en modo *local*. Mongo sin auth expuesto a toda la LAN (PII de pacientes). La rama de Windows sí usa `127.0.0.1`. | `127.0.0.1` en local; `0.0.0.0` solo si `DENT_MODE == 'lan'`. |
| L3 | MEDIA | 2378–2384 | `_wait_for_mongo_ready` lanza un **modal de error bloqueante** en cada timeout, aunque se use como *sondeo* previo y Mongo arranque bien justo después → diálogos "MongoDB no disponible" espurios (y apilados en Windows) durante un arranque exitoso. | Que el probe sea booleano silencioso; el error final lo muestran los callers. |
| L4 | MEDIA | 698–707, 1361–1371 | Los parsers de `.env` no quitan BOM ni manejan comentarios inline → `JWT_SECRET`/`MONGODB_URI` mal leídos si reaparece el BOM (ver sección 0). | Abrir con `encoding='utf-8-sig'` (también en `_update_env_file`). |
| L5 | MEDIA | ~2973–2987 | **Cierre con fuga de procesos**: `on_closing` llama al stop asíncrono y hace `root.destroy()` tras 2 s fijos; el hilo daemon muere a mitad de limpieza → node/vite/mongod huérfanos reteniendo puertos. | Hacer el stop **síncrono** (o `join(timeout)`) antes de destruir la ventana. |
| L6 | MEDIA | 975–978, 1591–1594 | El server bajo **pm2** no se puede detener desde la GUI tras reabrir el launcher (`using_pm2` es estado en memoria; el stop depende de él). LAN usa pm2 por defecto. | Intentar siempre `pm2 delete dentiacore-api` en el stop, sin depender del flag. |
| L7 | MEDIA | 1098–1105 | `_kill_port` (Unix) hace `lsof -ti :PUERTO \| kill -9` a **todos** los PIDs del puerto, incluidos procesos ajenos (otro dev server, una pestaña con keep-alive). | `lsof -ti tcp:PUERTO -sTCP:LISTEN` y verificar que sea node/vite/mongod. |
| L8 | BAJA | 1109–1111 | Fallback `netstat -tulpn` (flags de Linux) no funciona en macOS; solo se alcanza si falta `lsof`. | Rama `darwin` con `lsof -nP -iTCP:PUERTO -sTCP:LISTEN`. |

---

## 3. install.sh (macOS/Linux)

| # | Sev | Ubicación | Problema | Fix |
|---|-----|-----------|----------|-----|
| S1 | MEDIA | 135–138 | Instala MongoDB con paquetes **inexistentes** en repos modernos: `apt-get install mongodb` / `yum install mongodb-server` → falla en Ubuntu 20.04+/RHEL actuales (o instala un Mongo 3.x viejo). | Usar el repo oficial `mongodb-org`. |
| S2 | MEDIA | 439–440 | El `.app` de macOS **hardcodea la ruta absoluta del Python elegido** en el shebang (`#!${PYTHON_PATH}`). Si Homebrew actualiza/quita ese `python3.13`, el `.app` muere ("bad interpreter"); además hay límite de 127 chars. | Shebang `#!/usr/bin/env python3`, o que el `.app` ejecute el launcher shell resiliente. |
| S3 | MEDIA | 84–88 | Node por `apt/yum` puede quedar **fuera de `>=18 <=22`**; el script solo valida el piso (`>=18`), no el techo. Instalar `nodejs` + `npm` por apt además colisiona en Debian. | Usar NodeSource/nvm con versión 20 (acorde a `.nvmrc`); validar techo. |
| S4 | BAJA | ~165–166, 515–531 | Crea `DB/` (+`logs`) que **nunca usa** (Homebrew/`start-mongo.js` usan su propio dbpath) y **no arranca Mongo** (lo hace el launcher), pero el mensaje final implica que todo quedó listo. | Quitar el `DB/` muerto o arrancar Mongo de verdad. |
| S5 | BAJA | 499–501 + Info.plist | Copia `favicon.ico` como icono del `.app`, pero el plist no tiene `CFBundleIconFile` y macOS necesita `.icns` → icono genérico. | Convertir a `.icns` y añadir la clave, o quitar el copy. |

---

## 4. Verificados que **NO** son bugs (para no "arreglar" de más)

- **install.sh — `CURRENT_JWT="$(grep … | … | tr -d …)"` bajo `set -e`:** es un *pipeline* que termina en `tr` (exit 0) y **no hay `pipefail`**, así que `set -e` no aborta. Correcto como está.
- **install.ps1 — `$Service.Refresh()` sobre posible null:** está dentro de `if ($Service -and …)`, nunca se llama con null. Correcto.
- **Rutas/scripts referenciados:** `scripts/start-mongo.js`, `scripts/backup-db.js`, `create-admin.js`, `Server/scripts/dent.js`, `Server/ecosystem.config.cjs`, `Client/vite.config.js`, `mongod.cfg`, `.env.example` — **todos existen**.
- **Encoding de los scripts shell:** `install.sh`, `setup-mac.sh`, `setup-linux.sh`, `DentiaCore` son **LF sin BOM** (no hay problema de CRLF).
- **Puertos** (5002/5173/5174/27017) **consistentes** entre instalador, launcher y `package.json`.

---

## Orden de arreglo sugerido

1. **Seguridad/datos (ALTA):** L2 (mongod `0.0.0.0` en local), L1 (contraseña admin), P5 (firewall/Mongo abierto).
2. **Cadena BOM (ALTA):** sección 0 → P1 + L4 (instalador escribe sin BOM + parsers `utf-8-sig`).
3. **Robustez instalador Windows:** P2 (smoke real), P4 (build = error en LAN), P3 (techo Node).
4. **Robustez launcher:** L3 (diálogo Mongo), L5 (cierre síncrono), L6 (stop pm2), L7 (kill-port).
5. **macOS/Linux:** S1 (repo Mongo), S2 (shebang `.app`), S3 (versión Node).
