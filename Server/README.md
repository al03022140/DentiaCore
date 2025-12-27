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
  - Intenta usar PM2 (`pm2 start ecosystem.config.cjs --only dent-api`) y cae a `npm run start` si PM2 no está presente.
  - Recomendación: agrega una regla de firewall para el puerto 5002 (ver ejemplo arriba) y usa IP fija.

### Troubleshooting rápido

- Backend no conecta a MongoDB (`ECONNREFUSED 127.0.0.1:27017`):
  - Ejecuta `npm run mongod`. Verifica el puerto: `Test-NetConnection -ComputerName 127.0.0.1 -Port 27017`.
  - Confirma `Server/.env` contiene `MONGODB_URI=mongodb://127.0.0.1:27017/Dent`.

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

## 🛡️ Respaldo y Mantenimiento

### Copias de seguridad semanales
- **Archivos clínicos**: Copia el contenido de `C:\ProgramData\DENT\uploads` (o el valor que definas en `UPLOADS_DIR`).
- **Base de datos**: Ejecuta `mongodump --db dent --out C:\Backups\Dent\%date%` desde una consola con permisos.
- **Logs**: Opcionalmente preserva `C:\ProgramData\DENT\logs` para auditoría.

### Restaurar un entorno
1. Detén el servicio (por ejemplo, `pm2 stop dent-api`).
2. Restaura los archivos: copia el respaldo de `uploads` al directorio configurado en `UPLOADS_DIR`.
3. Restaura la base de datos: `mongorestore --db dent --drop C:\Backups\Dent\<fecha>\dent`.
4. Vuelve a iniciar el servicio (`pm2 start dent-api` o el comando que uses).

### Automatización recomendada
- Programa tareas en el Programador de Windows para ejecutar los comandos de `mongodump` y copiar `uploads`.
- Verifica periódicamente que los respaldos se completen y mantén al menos 2-3 versiones históricas.

## 🛡️ Respaldo y Recuperación

### Programar respaldos semanales
- **Uploads**: Copia la carpeta `C:\ProgramData\DENT\uploads` a un medio externo o unidad de red.
- **Base de datos**:
	- Usa `mongodump` con el servicio MongoDB en ejecución:
		```powershell
		mongodump --db dent --out "C:\Backups\Dent\$(Get-Date -Format yyyy-MM-dd)"
		```
	- Automatiza este comando con el Programador de Tareas de Windows.

### Restaurar entorno
1. Detén el servicio o proceso de la aplicación.
2. Restaura la carpeta de uploads:
	 ```powershell
	 robocopy "<ruta respaldo uploads>" "C:\ProgramData\DENT\uploads" /MIR
	 ```
3. Restaura la base de datos:
	 ```powershell
	 mongorestore --db dent "C:\Backups\Dent\<fecha>\dent"
	 ```
4. Verifica permisos NTFS para que el usuario del servicio tenga acceso a `C:\ProgramData\DENT\uploads` y `C:\ProgramData\DENT\logs`.
5. Reinicia el servicio (PM2 o el servicio Windows configurado).

---

**Nota**: Esta estructura sigue las convenciones establecidas en el documento de nomenclatura del proyecto para mantener consistencia entre frontend y backend.