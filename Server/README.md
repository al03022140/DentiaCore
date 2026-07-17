# Servidor - Sistema Dental

## 📁 Estructura de Carpetas

```
Server/
├── config/           # Configuraciones del servidor
├── controllers/      # Controladores MVC
├── helpers/          # Funciones auxiliares
├── logs/            # Archivos de registro
├── middlewares/     # Middlewares de Express
├── models/          # Modelos de base de datos
├── routes/          # Rutas de la API
├── scripts/         # Scripts de desarrollo y testing
├── tmp/             # Archivos temporales
├── uploads/         # Archivos subidos por usuarios
└── utils/           # Utilidades generales
```

## 🎯 Convenciones de Nomenclatura

### Carpetas
- **Formato**: `kebab-case` + plural
- **Ejemplos**: `controllers/`, `middlewares/`, `utils/`

### Archivos
- **Controladores**: `camelCase.js` → `patientsController.js`
- **Modelos**: `camelCase.js` → `patient.js`
- **Rutas**: `camelCase.js` → `patientRoutes.js`
- **Utilidades**: `camelCase.js` → `dateUtils.js`
- **Configuración**: `camelCase.js` → `db.js`

### Código JavaScript
- **Funciones**: `camelCase` → `getAllPatients`, `createPatient`
- **Variables**: `camelCase` → `patientData`, `fechaNacimiento`
- **Constantes**: `UPPER_SNAKE_CASE` → `MAX_FILE_SIZE`

### Propiedades de Modelos
- **Formato**: `snake_case` (español)
- **Ejemplos**: `primer_nombre`, `fecha_nacimiento`, `contacto_emergencia`
- **Props técnicas**: `camelCase` (inglés) → `createdAt`, `updatedAt`

## 🚀 Scripts Disponibles

### Desarrollo
```bash
npm run dev          # Iniciar servidor en modo desarrollo
npm run start        # Iniciar servidor en producción
npm test             # Ejecutar pruebas
```

### Scripts de Utilidad
- `scripts/dent.js` - Script principal del servidor
- `scripts/cleanupOdontogramUrls.js` - Limpieza de URLs de odontogramas
- `scripts/seedAndTestCheckOdontograma.js` - Seed y testing de odontogramas
- `scripts/test-odontograma.js` - Pruebas específicas de odontogramas

## 📋 Buenas Prácticas

### Nuevos Archivos
1. **Controladores**: Seguir patrón `[entidad]Controller.js`
2. **Modelos**: Usar nombre singular en `camelCase`
3. **Rutas**: Seguir patrón `[entidad]Routes.js`
4. **Utilidades**: Describir función + `Utils.js`

### Estructura de Código
- Mantener separación clara de responsabilidades
- Usar comentarios descriptivos en español
- Implementar manejo de errores consistente
- Seguir principios SOLID y DRY

### Base de Datos
- Propiedades en `snake_case` (español)
- Referencias con sufijo `_id`
- Enumeraciones en strings descriptivos
- Métodos de modelo en `camelCase`

## 🔧 Configuración

### Variables de Entorno
- Configurar en archivo `.env`
- Documentar variables requeridas
- Usar valores por defecto seguros

### Portabilidad en Windows
- Prerrequisitos: `Node.js LTS`, `npm`, `MongoDB` (o ejecutar `install.ps1`), y `Microsoft Visual C++ Build Tools 2022` si se compilan módulos nativos como `canvas`.
- Archivo principal de entorno: usar `Server/.env` como fuente prioritaria. El servidor ahora carga primero `Server/.env` y usa `root/.env` solo como respaldo.
- Puertos: el API respeta `PORT` del entorno (valor libre) con defecto `5002`. En el cliente, `VITE_PORT` admite `5173/5174` y `VITE_API_PORT` admite `5000/5002`.
- Firewall: si se requiere acceso desde otras máquinas, crea una regla de firewall para el puerto del API. Ejemplo PowerShell (administrador):
  ```powershell
  netsh advfirewall firewall add rule name="Dent API" dir=in action=allow protocol=TCP localport=5002
  ```
- Rutas de datos: configura `UPLOADS_DIR`, `LOGS_DIR`, `TMP_DIR` apuntando a `C:\ProgramData\DENT\...` o a la ruta preferida. El servidor las resolverá correctamente.
- Inicio rápido:
  - Desarrollo: en la raíz del repo `npm run dev` (inicia cliente y servidor, y verifica MongoDB).
  - Producción local: en `Server/` `npm run start` (usa `Server/.env`).
  - Instalación automática: ejecuta `install.ps1` con PowerShell (administrador) para instalar dependencias, crear carpetas y generar `Server/.env`.

### Modos de ejecución (Launcher)

El `launcher.py` permite iniciar y detener servicios con configuración guiada.

- Modo Local (desarrollo):
  - Arranca MongoDB y el backend en `http://127.0.0.1:5002` y el frontend Vite en `http://localhost:5173`.
  - Variables efectivas:
    - `HOST=127.0.0.1`, `PORT=5002`, `CLIENT_URL=http://localhost:5173`, `VITE_API_URL=http://localhost:5002`.
  - Comandos equivalentes manuales:
    1. `npm run mongod` (en raíz)
    2. `npm run dev --prefix Server`
    3. `npm run client`
  - Healthcheck: `Invoke-WebRequest -Uri 'http://127.0.0.1:5002/api/health' -UseBasicParsing | Select-Object -ExpandProperty Content`

- Modo LAN (red local):
  - Expone el backend en `HOST=0.0.0.0` y sirve el frontend estático desde `Server/Client/dist`.
  - `PUBLIC_URL` debe ser la URL accesible en la red, por ejemplo `http://<ip-del-servidor>:5002`.
  - Intenta usar PM2 (`pm2 start ecosystem.config.cjs --only dentiacore-api`) y cae a `npm run start` si PM2 no está presente.
  - Recomendación: agrega una regla de firewall para el puerto 5002 (ver ejemplo arriba) y usa IP fija.

### Troubleshooting rápido

- Backend no conecta a MongoDB (`ECONNREFUSED 127.0.0.1:27017`):
  - Ejecuta `npm run mongod`. Verifica el puerto: `Test-NetConnection -ComputerName 127.0.0.1 -Port 27017`.
  - Confirma `Server/.env` contiene `MONGODB_URI=mongodb://127.0.0.1:27017/DentiaCore`.

- Healthcheck falla en `http://localhost:5002/api/health`:
  - Comprueba el estado del backend: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5002`.
  - Revisa logs en `Server/logs` y que `PORT=5002` esté libre.
  - En Windows, confirma que el firewall no bloquee el puerto 5002.

- Acceso desde otra máquina en modo LAN:
  - Usa `HOST=0.0.0.0` y una `PUBLIC_URL` con la IP del servidor.
  - Crea regla de firewall y verifica conectividad desde el cliente: `Test-NetConnection -ComputerName <ip-servidor> -Port 5002`.

- Puertos ocupados (5002, 5173, 5174):
  - `npm run kill-port` y `npm run kill-client-port` (en raíz).
  - Reinicia los servicios desde el launcher o los comandos manuales.


### Logging
- Logs organizados por nivel en `logs/`
- Formato consistente con timestamps
- Rotación automática de archivos

## 🛡️ Respaldo, monitoreo y recuperación

### Automático (O-1)
`install.sh`/`install.ps1` registran, sin intervención manual:
- **Backup diario (3am)**: `node scripts/backup-db.js --keep=14` (mongodump → `backups/<db>_<fecha>.tar.gz`, rota y conserva 14). Cada corrida exitosa actualiza `backups/last-success.json`.
- **Chequeo de salud (cada 4h)**: `node scripts/check-health.js` — verifica que el último backup no esté viejo, que `/api/health` responda con la DB conectada, y disco libre. Alerta por webhook si algo falla.
- **Alertas**: configura `ALERT_WEBHOOK_URL` en `Server/.env` (placeholder ya viene comentado tras instalar) con cualquier URL que acepte `{text}` — Slack, Discord, ntfy.sh. Sin esta variable, los chequeos igual corren y quedan en el log (`backups/backup.log`, `backups/health-check.log`), solo no notifican activamente.
- Ver tarea: `crontab -l` (macOS/Linux) o `schtasks /query /tn DentiaCore-Backup` (Windows).

### Manual
```bash
npm run backup:db                 # mongodump → backups/<db>_<fecha>.tar.gz
node scripts/restore-db.js backups/<archivo>.tar.gz --uri="mongodb://127.0.0.1:27017/DentiaCore_test" --drop --force   # probar en BD scratch
node scripts/restore-db.js backups/<archivo>.tar.gz --drop --force   # restaurar a producción (dry-run por defecto sin --force)
npm run verify:audit              # tras restaurar: cadena de auditoría NOM-024 → "Cadena íntegra"
```
- **Uploads**: respalda por separado la carpeta configurada en `UPLOADS_DIR` (default `Server/uploads`) — `update.sh`/`update.ps1` ya lo hacen antes de cada actualización.
- **Secretos (O-9)**: respalda `Server/.env` por separado (medio seguro, distinto del dump) — contiene `AUDIT_HMAC_SECRET`, sin el cual la cadena de auditoría restaurada no verifica. **Nunca lo regeneres sobre una BD existente.**
- Antes de restaurar a producción: `pm2 stop dentiacore-api`; después: `pm2 start dentiacore-api` (verifica con `pm2 describe dentiacore-api`).

Detalle y checklist completos: [docs/server/operacion/backups-y-restauracion.md](../docs/server/operacion/backups-y-restauracion.md).

---

**Nota**: Esta estructura sigue las convenciones establecidas en el documento de nomenclatura del proyecto para mantener consistencia entre frontend y backend.