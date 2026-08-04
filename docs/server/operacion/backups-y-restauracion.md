# Backups y restauración — DentiaCore

**Aplica a:** instalación por clínica (MongoDB local). Datos = expediente clínico (PHI).
**Regla NOM-024 / LFPDPPP:** los backups contienen datos personales sensibles → guárdalos **cifrados**, restringe permisos del SO y mantén **al menos una copia fuera del equipo**.

> Antes de meter datos reales en producción, este flujo debe estar **probado**: un backup que nunca se restauró no es un backup, es una ilusión.

> **El backup NO incluye los secretos.** `AUDIT_HMAC_SECRET` (y `JWT_SECRET`) viven en `Server/.env`, no en la BD. Sin el `AUDIT_HMAC_SECRET` original, la cadena de auditoría NOM-024 restaurada **no se puede verificar** (queda indistinguible de una manipulación). Respalda `Server/.env` por separado y **nunca lo regeneres sobre una BD existente** — ver §6.

---

## 1. Hacer un backup

```bash
npm run backup:db                 # → backups/<db>_<ts>.tar.gz + backups/uploads_<ts>.tar.gz
npm run backup:db -- --keep=14    # conserva solo los 14 más recientes POR FAMILIA
npm run backup:db -- --no-uploads # solo BD (lo usa migrate.js en su backup-first)
```

Respalda la **BD** (`mongodump`, MongoDB Database Tools) y la carpeta de
**uploads** (radiografías, adjuntos, firmas — PHI) en el mismo paso. La
rotación `--keep=N` cuenta por separado los dumps de BD y los de uploads.

**Copia fuera del equipo (obligatoria):** configura `BACKUP_MIRROR_DIR` en
`Server/.env` apuntando a un USB/NAS montado. Cada corrida copia ahí ambos
respaldos y aplica la misma rotación; si el espejo falla (medio desconectado),
`check-health.js` lo alerta — un espejo que falla en silencio es no tener espejo.

---

## 2. Automatizar (backup diario + monitoreo)

**Ya no hace falta configurarlo a mano (O-1):** `install.sh`/`install.ps1` registran automáticamente, en cada instalación:

- Backup diario (3am): `node scripts/backup-db.js --keep=14` — BD + uploads + espejo (si `BACKUP_MIRROR_DIR` está configurado). Cada corrida exitosa actualiza `backups/last-success.json`.
- Chequeo de salud cada 4h: `node scripts/check-health.js` — verifica que el backup no esté viejo/ausente, que el **espejo** no haya fallado en la última corrida, que `/api/health` reporte la DB conectada, y disco libre. Ver [Server/README.md](../../../Server/README.md#-respaldo-monitoreo-y-recuperación) para configurar `ALERT_WEBHOOK_URL` y recibir alertas activas (Slack/Discord/ntfy.sh).

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

**Automatizada (P0.5):** una copia solo cuenta como backup si se demostró
**restaurable y funcional** — no basta con que Mongo importe el BSON.

```bash
npm run restore:test    # PASS/FAIL de punta a punta con el último par de backups
```

`scripts/restore-test.js` ejecuta el criterio de aceptación completo, en una BD
temporal que borra al terminar:

1. Restaura el backup de BD (`restore-db.js --drop --force`).
2. Extrae el backup de uploads a un directorio temporal.
3. **Arranca el servidor real** contra la restauración y espera `/api/health` OK.
4. Verifica la cadena de auditoría NOM-024 (`verify-audit-chain.js`).
5. `migrate:dry` (pendientes = informativo; error = FAIL).
6. Documentos críticos: pacientes/usuarios/citas presentes y con forma válida.
7. **Filesystem:** cada archivo referenciado por la BD (adjuntos, firmas de
   usuario, fotos de perfil) existe y es legible — nada de BD perfecta con
   adjuntos en 404. Huérfanos en disco se reportan como informativo.

El resultado queda en `backups/restore-test-last.json`; `check-health.js`
alerta si la última prueba falló o lleva >40 días sin correr, y un FAIL manda
alerta por `ALERT_WEBHOOK_URL`. Los instaladores la programan mensualmente
(cron día 1 4am / tarea `DentiaCore-RestoreTest`). Repítela manualmente tras
cualquier cambio de esquema.

**Manual (inspección puntual):** `npm run restore:db -- backups/DentiaCore_<ts>.tar.gz --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test" --drop --force` (sin `--force` es dry-run y solo muestra el plan). Un `❌ Cadena ROTA` con `hash_mismatch` masivo al verificar significa que el `AUDIT_HMAC_SECRET` del `.env` no es el que selló los datos.

---

## 4. Restauración real (recuperación ante desastre)

```bash
# Detener la app primero. Luego restaurar a la BD de producción (MONGODB_URI):
npm run restore:db -- backups/DentiaCore_<ts>.tar.gz --drop --force
```

Sin `--uri`, el destino es `MONGODB_URI` de `Server/.env` (producción). `--drop` reemplaza las colecciones. **Toma un backup fresco del estado actual antes**, por si necesitas volver atrás.

**Si es recuperación en hardware nuevo:** restaura primero `Server/.env` con el `AUDIT_HMAC_SECRET` **original** (el que respaldaste con los datos), nunca uno regenerado. Luego corre el paso de aceptación:

```bash
npm run verify:audit    # cadena de auditoría restaurada → debe dar "✅ Cadena íntegra"
```

---

## 5. Checklist de producción (backups)

- [ ] `mongodump`/`mongorestore` instalados en el equipo de la clínica.
- [ ] Backup diario agendado (§2) y verificado que corre (revisar `backups/`).
- [ ] **Restauración probada** en BD scratch al menos una vez (§3), con verificación de firmas.
- [ ] Backups en medio **cifrado** y con permisos de SO restringidos.
- [ ] **Copia fuera del equipo** (disco externo cifrado o nube) — el disco de la clínica puede fallar.
- [ ] Rotación activa (`--keep=N`) para no llenar el disco.
- [ ] **`Server/.env` respaldado por separado** (medio seguro, distinto del dump) — sin `AUDIT_HMAC_SECRET` la auditoría restaurada no verifica.
- [ ] **Restauración probada corre `npm run verify:audit`** y da "Cadena íntegra".

---

## 6. El secreto de integridad NOM-024 (crítico)

La cadena de auditoría (`auditlogs`) se sella con un HMAC cuya clave es `AUDIT_HMAC_SECRET` (`Server/.env`). `verifyChain` recomputa cada entrada con el secreto **actual**; no hay `keyId` por entrada. Consecuencias operativas:

- **El secreto NO está en la BD ni en el backup.** Un `mongodump` respalda los datos pero no su verificabilidad. Respalda `Server/.env` en un medio seguro y **separado** del dump (juntos, quien los obtenga puede alterar datos y re-firmar la cadena sin dejar rastro).
- **Nunca regeneres `AUDIT_HMAC_SECRET` sobre una BD existente.** Invalida el sello de toda la historia previa: `verifyChain` pasará a reportar `hash_mismatch` en cada entrada. Los instaladores (`install.sh`/`install.ps1`/`launcher.py`) **conservan** el secreto existente en un update in-place; el riesgo es una reinstalación o una recuperación manual.
- **Paso de aceptación tras restaurar:** `npm run verify:audit` (o `-- --uri="<BD scratch>"`). `✅ Cadena íntegra` = el secreto restaurado es el correcto. `❌ Cadena ROTA` = el `.env` no trae el secreto original.

> La fragilidad ante **rotación** de llaves (versionar el secreto para rotarlo sin invalidar el pasado) es otro tema, en el roadmap como R-1. O-9 solo garantiza que el secreto **actual** no se pierda.
