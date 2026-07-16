# Backups y restauración — DentiaCore

**Aplica a:** instalación por clínica (MongoDB local). Datos = expediente clínico (PHI).
**Regla NOM-024 / LFPDPPP:** los backups contienen datos personales sensibles → guárdalos **cifrados**, restringe permisos del SO y mantén **al menos una copia fuera del equipo**.

> Antes de meter datos reales en producción, este flujo debe estar **probado**: un backup que nunca se restauró no es un backup, es una ilusión.

---

## 1. Hacer un backup

```bash
npm run backup:db                 # → backups/<db>_<ts>.tar.gz
npm run backup:db -- --keep=14    # conserva solo los 14 más recientes (rotación)
```

Usa `mongodump` (parte de las MongoDB Database Tools). Si no está instalado, el script indica cómo hacerlo según el SO.

---

## 2. Automatizar (backup diario + monitoreo)

**Ya no hace falta configurarlo a mano (O-1):** `install.sh`/`install.ps1` registran automáticamente, en cada instalación:

- Backup diario (3am): `node scripts/backup-db.js --keep=14`. Cada corrida exitosa actualiza `backups/last-success.json`.
- Chequeo de salud cada 4h: `node scripts/check-health.js` — verifica que el backup no esté viejo/ausente, que `/api/health` reporte la DB conectada, y disco libre. Ver [Server/README.md](../../../Server/README.md#-respaldo-monitoreo-y-recuperación) para configurar `ALERT_WEBHOOK_URL` y recibir alertas activas (Slack/Discord/ntfy.sh).

Verificar que quedó registrado: `crontab -l` (macOS/Linux) o `schtasks /query /tn DentiaCore-Backup` (Windows).

**Configuración manual (fallback, o si reinstalaste sin el instalador):**

```cmd
schtasks /Create /SC DAILY /ST 03:00 /TN "DentiaCore-Backup" ^
  /TR "node \"C:\ruta\al\repo\scripts\backup-db.js\" --keep=14"
```

```cron
0 3 * * *  cd /ruta/al/repo && /usr/bin/node scripts/backup-db.js --keep=14 >> backups/backup.log 2>&1
```

---

## 3. Probar la restauración (OBLIGATORIO antes de producción)

La prueba se hace contra una **BD scratch**, nunca contra producción. El script es *dry-run* por defecto (muestra el plan); `--force` ejecuta.

```bash
# 1) Ver el plan (no toca nada):
npm run restore:db -- backups/DentiaCore_<ts>.tar.gz \
  --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test"

# 2) Ejecutar la prueba en la BD scratch:
npm run restore:db -- backups/DentiaCore_<ts>.tar.gz \
  --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test" --drop --force
```

**Verificar tras restaurar (criterios de éxito):**

- Conteos por colección coinciden con producción (`patients`, `appointments`, `cashmovements`, `auditlogs`, …).
- Abrir algunos expedientes restaurados y confirmar que los datos están completos.
- **Firmas NOM-024:** los documentos firmados siguen verificando (`firmaDesactualizada` no se dispara).
- La app levanta apuntada a la BD scratch y los flujos clave funcionan.

Cuando la prueba pase, **borra la BD scratch**. Repite esta prueba periódicamente (p. ej. mensual) y tras cualquier cambio de esquema.

---

## 4. Restauración real (recuperación ante desastre)

```bash
# Detener la app primero. Luego restaurar a la BD de producción (MONGODB_URI):
npm run restore:db -- backups/DentiaCore_<ts>.tar.gz --drop --force
```

Sin `--uri`, el destino es `MONGODB_URI` de `Server/.env` (producción). `--drop` reemplaza las colecciones. **Toma un backup fresco del estado actual antes**, por si necesitas volver atrás.

---

## 5. Checklist de producción (backups)

- [ ] `mongodump`/`mongorestore` instalados en el equipo de la clínica.
- [ ] Backup diario agendado (§2) y verificado que corre (revisar `backups/`).
- [ ] **Restauración probada** en BD scratch al menos una vez (§3), con verificación de firmas.
- [ ] Backups en medio **cifrado** y con permisos de SO restringidos.
- [ ] **Copia fuera del equipo** (disco externo cifrado o nube) — el disco de la clínica puede fallar.
- [ ] Rotación activa (`--keep=N`) para no llenar el disco.
