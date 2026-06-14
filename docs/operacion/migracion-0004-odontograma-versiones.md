# Runbook — Migración 0004: versiones del odontograma clínico (Windows)

Esta migración (`Server/migrations/0004-backfill-odontograma-clinico-versions.js`) convierte
el historial **legacy** del odontograma clínico (snapshots por fecha en el array embebido
`history[]`) en **versiones** dentro de la colección nueva `odontograma_history`, **agrupando
todos los snapshots del mismo día en una sola versión acumulada** (unión/dedup de hallazgos).

- **Aditiva**: inserta en `odontograma_history`; NO reescribe los documentos auditados.
- **No toca documentos firmados** (`firmadoEn` ≠ null): respeta la firma NOM-024.
- **Idempotente**: re-correrla no duplica nada (los `versionName` por día son determinísticos).
- **Forward-only**: no hay `down()`. El rollback es restaurar el backup previo.

> El código nuevo ya hace que cada guardado del odontograma clínico cree una versión. La
> migración solo es necesaria **una vez** en cada base con datos previos, para que el historial
> viejo aparezca como versiones en el selector.

---

## Prerrequisitos en la PC Windows

1. **Node.js** instalado (el mismo que usa el proyecto) y el repo en esta PC con esta rama
   (`fix/auditoria-backend`) ya aplicada.
2. **MongoDB corriendo** y accesible con la URI de `Server/.env` (`MONGODB_URI`).
   Si usas el Mongo del propio repo: `npm run mongod` (deja esa terminal abierta).
3. **MongoDB Database Tools (`mongodump`)** — lo usa el **backup automático** previo a migrar.
   El runner busca `mongodump.exe` en PATH, `C:\Program Files\MongoDB\Tools\<ver>\bin`,
   Chocolatey, Scoop y `tools\mongo\bin`. Si no lo tienes:
   - Descárgalo: <https://www.mongodb.com/try/download/database-tools> (instala el `.msi`), **o**
   - `choco install mongodb-database-tools`, **o** `scoop install mongodb-database-tools`.
   - Alternativa sin instalar: ver la opción **`--no-backup`** más abajo (toma tú el backup).

---

## Pasos (PowerShell o CMD, desde la raíz del repo)

```powershell
# 0) (si transfieres por git) traer la rama con los cambios
git fetch
git checkout fix/auditoria-backend
git pull

# 1) instalar dependencias (no cambian, pero es seguro)
npm install

# 2) asegurar MongoDB arriba (en otra terminal, si usas el del repo)
npm run mongod

# 3) DRY-RUN: lista las pendientes y NO aplica nada
npm run migrate:dry
#    Debe aparecer: 0004-backfill-odontograma-clinico-versions como pendiente.

# 4) APLICAR (toma backup automático previo y aplica las pendientes)
npm run migrate
```

### Si no tienes/quieres `mongodump` (omitir el backup automático)

Toma tú un respaldo primero (o úsalo solo en una base de prueba) y luego:

```powershell
node scripts/migrate.js --no-backup
```

---

## Verificación post-migración

1. La salida del runner muestra una línea `[0004] ... versiones insertadas: N ...`.
2. En MongoDB (mongosh), revisa que existan versiones para algún paciente con historial:
   ```js
   use DentiaCore
   db.odontograma_history.find({ patient: ObjectId("<idPaciente>") }).sort({ createdAt: 1 })
   // → una fila por día, con `versionName`, `datos` unidos/dedup y `createdAt` = fecha real.
   ```
3. En la app (ficha del paciente → Odontograma Clínico): el `<select>` de versiones muestra
   las fechas legibles y al cambiar de versión el canvas recarga esos daños.
4. **Idempotencia**: volver a correr `npm run migrate` no aplica nada
   (queda registrada en la colección `migrations`). Si re-ejecutaras solo el `up`, insertaría 0.

---

## Rollback

No hay `down()`. Si algo sale mal, restaura el backup que el runner tomó antes de aplicar:

```powershell
npm run restore:db
```

Ver `docs/operacion/backups-y-restauracion.md` para el detalle de restauración.

---

## Notas

- La migración agrupa por **día UTC** (determinismo/idempotencia). Para datos históricos la
  precisión de día es suficiente.
- Solo procesa odontogramas `type: 'clinic'` **no archivados** (`deletedAt: null`).
- El array embebido `history[]` viejo **se conserva** (la migración no lo borra); deja de
  escribirse pero sirve de respaldo legacy.
