# DentiaCore

Sistema de gestión clínica dental on-premise: expediente de pacientes, odontograma y periodontograma, agenda de citas, caja, estadísticas y auditoría con integridad NOM-024. Pensado para instalarse en la PC de una clínica (mono-instancia), no como servicio multi-tenant.

## Stack

- **Cliente:** React + Vite (`Client/`).
- **Servidor:** Node.js + Express + MongoDB (`Server/`), proceso administrado con PM2 en producción (`dentiacore-api`, ver [Server/ecosystem.config.cjs](Server/ecosystem.config.cjs)).
- **Base de datos:** MongoDB local (WiredTiger), sin dependencia de servicios cloud.

## Instalación

Usa el instalador de tu plataforma — generan `Server/.env` y `Client/.env`, incluyendo secretos aleatorios fuertes (`JWT_SECRET`, `AUDIT_HMAC_SECRET`, ambos requeridos en producción):

- **Windows:** `install.ps1` (PowerShell, como administrador) o `EJECUTAR_INSTALADOR.bat`.
- **macOS/Linux:** `install.sh`.
- **GUI multiplataforma (dev/LAN, arranque y administración diaria):** `python3 launcher.py` — inicia/detiene MongoDB, servidor y cliente; también repara `Server/.env` si falta algún secreto.

Tras instalar, crea el primer usuario administrador:

```bash
node create-admin.js <email> <contraseña> <pin-4-dígitos> ["Nombre"]
```

Utilidades relacionadas en la raíz: `list-users.js`, `set-pin.js`.

## Desarrollo local

```bash
npm install              # dependencias de la raíz
npm --prefix Server install
npm --prefix Client install
npm run dev               # Mongo + Server + Client concurrentes (kill-port automático)
```

Healthcheck: `curl http://127.0.0.1:5002/api/health` (200 si la BD está conectada, 503 si no).

## Actualizar una instalación existente

**Único camino soportado.** Corre `update.sh` (macOS/Linux) o `update.ps1` (Windows) desde la raíz — hace, en este orden: respaldo de BD + uploads → `migrate:dry` (aborta sin tocar nada si falla) → `migrate` → build del Client → reinicio de `dentiacore-api` vía PM2.

```bash
./update.sh        # macOS/Linux
.\update.ps1        # Windows (PowerShell)
```

Nunca actualices el código y reinicies el servicio sin pasar por este script: el esquema de datos puede tener migraciones pendientes (`npm run migrate:dry` para verlas sin aplicarlas).

## Respaldo y restauración

```bash
npm run backup:db                 # mongodump → backups/<db>_<fecha>.tar.gz
node scripts/restore-db.js <backup> --uri=<destino> --drop --force   # dry-run por defecto sin --force
```

Detalle completo, incluyendo automatización (cron/schtasks) y prueba de restauración: [docs/server/operacion/backups-y-restauracion.md](docs/server/operacion/backups-y-restauracion.md).

## Producción con PM2

```bash
pm2 start Server/ecosystem.config.cjs --only dentiacore-api
pm2 restart dentiacore-api --update-env
pm2 describe dentiacore-api        # verificar antes de operaciones destructivas
```

Runbook completo (arranque, troubleshooting, firewall LAN): [Server/README.md](Server/README.md).

## Documentación

Índice completo (auditorías, runbooks de operación, mapa de API, roles, modelo de datos): [docs/README.md](docs/README.md).

## Tests

```bash
npm test              # Server + Client
npm run test:server
npm run test:client
```
