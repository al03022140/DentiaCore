# Migraciones pendientes — handoff

**Generado:** 2026-06-23 · **Rango analizado:** commits del 2026-06-09 al 2026-06-23 (~2 semanas) · **Alcance:** cambios que afectan la forma de los documentos en MongoDB (`Server/models/**`, migraciones, índices, validadores, enums).
**Método:** solo lectura de git + código. Este documento NO ejecuta nada.

---

## Resumen ejecutivo

En la ventana se introdujeron **4 migraciones ya escritas** (`Server/migrations/0001`–`0004`), todas idempotentes y forward-only, más cambios de esquema **aditivos** (índices nuevos, validadores relajados) que **no requieren** acción manual.

| Migración | Tipo | ¿Crítica? | Qué resuelve |
|---|---|---|---|
| `0001-resellar-hashes-integridad` | Re-sellado de hashes + cadena de auditoría | **Sí** (si no, `audit/verify` marca falsos "alterados") | Recalcula `contentHash`/`integrityHash` de registros firmados y re-encadena el audit log |
| `0002-limpiar-periodontogramas-vacios` | Limpieza de datos legacy | No (higiene) | Borra periodontogramas BORRADOR demostrablemente vacíos |
| `0003-backfill-hash-odontograma-inicial` | Backfill de hash | **Sí** (verify) | Sella odontogramas iniciales OFICIAL que nacieron sin hash |
| `0004-backfill-odontograma-clinico-versions` | Backfill a colección nueva | **Sí** (versionado) | Migra `history[]` embebido del odontograma clínico → colección `odontograma_history` |

**Acción principal:** correr el runner de migraciones (hace backup automático y aplica solo las pendientes). Ver [Cómo ejecutar](#cómo-ejecutar).

**Ítem latente relacionado (NO proviene de esta ventana, requiere decisión):** datos legacy con `preferences.signatureInput` / `preferences.theme` **fuera de enum** que rompen cualquier `user.save()`. Detección ya disponible; limpieza **propuesta** (migración `0005`, aún no escrita). Ver [Anexo A](#anexo-a--datos-legados-de-preferences-enum--propuesta-0005).

**Drift de índice menor (opcional):** el índice TTL de `auditLog` fue removido del código pero no se dropea solo. Ver [Anexo B](#anexo-b--drift-de-índices-opcional).

---

## Cómo ejecutar

El repo trae una maquinaria de migraciones versionadas (runner en `scripts/migrate.js`, migraciones en `Server/migrations/`, registro en la colección `migrations`).

```bash
# desde la raíz del repo (~/Downloads/DentiaCore)
npm run migrate:dry     # lista las pendientes, NO aplica nada
npm run migrate         # toma backup automático y aplica las pendientes
```

Garantías del runner (según `Server/migrations/README.md`):
- **Backup automático** antes de aplicar (`scripts/backup-db.js`). Si el backup falla, **aborta** sin tocar datos.
- **Idempotente / una sola vez:** registra las aplicadas en la colección `migrations`; re-correr no repite.
- **Forward-only:** no hay `down()`. Rollback = **restaurar el backup** (`scripts/restore-db.js`, ver `docs/server/operacion/backups-y-restauracion.md`).
- **Prueba primero en copia:** correr contra un restore de la BD real antes de producción.

Las 4 migraciones se aplican **en orden numérico** (0001 → 0004). Son independientes en datos, pero el orden numérico es el correcto.

---

## Commits revisados (19)

| Fecha | Hash | Mensaje | Impacto en BD |
|---|---|---|---|
| 06-22 | `45196a4e` | fix(firma): persiste firmaDigitalUrl atómico + índice auditoría frontend | No (fix de código; *relacionado* con el Anexo A) |
| 06-19 | `9279fbbe` | refactor: elimina código muerto (ponytail) | No |
| 06-19 | `ae6cb699` | docs: referencias obsoletas | No |
| 06-19 | `0d0465a6` | refactor: elimina código muerto/sobre-ingeniería | No |
| 06-19 | `d91b7851` | perf(wacom-stu): coalesce preview | No |
| 06-19 | `8c5f5c3e` | docs(csp): checklist CSP | No |
| 06-19 | `763c99a0` | fix(csp): Failed to fetch en alta de paciente | No (cliente) |
| 06-19 | `0b5d7db2` | fix(wacom-stu): Failed to fetch al guardar firma | No (cliente) |
| 06-18 | `cba16dbf` | fix(wacom-stu): STU-500/500B + firma doctor | No esquema |
| 06-18 | `ff088198` | chore(cleanup): código muerto, imágenes, artefactos | **Models**: borra `schemas/damageSchema.js` + `initialSnapshotSchema.js` (dead code, **sin impacto en datos**) |
| 06-18 | `17bc0b62` | chore(deps): elimina 19 dependencias | No |
| 06-18 | `1ed9f2b6` | test(server): alinea 3 tests | No |
| 06-14 | `70058a7e` | fix(auditoría-backend): hardening settings/caja/consultas/citas/uploads | No esquema (controllers/middleware) |
| 06-14 | `c38afb44` | fix(auditoría-backend): hardening validación de pacientes | **patient.js**: índice **no único** `{deletedAt,createdAt}` → aditivo, **sin migración** |
| 06-14 | `3a846635` | feat(odontograma): versionado clínico + migración legacy | **Sí → `0004`** + nueva colección `odontograma_history` |
| 06-14 | `00898219` | fix(auditoría-edge-cases): 5 HIGH + 12 MEDIUM | No esquema (lógica) |
| 06-13 | `1c4b0518` | fix(auditoría-backend): 5 pendientes (perio/odonto/PII/citas/FDI) | **Sí → `0002` + `0003`** (models odontograma/patient/periodontogram) |
| 06-12 | `82e64322` | fix(auditoría-backend): 2 críticos NOM-024 + seguridad/caja | **Sí → `0001`** (models auditLog/patient/treatment) |
| 06-12 | `8c6fcc1c` | fix(auditoría): hallazgos frontend + limpieza | **odontograma.js**: validadores de subdoc **relajados** (required→condicional) → aditivo, **sin migración** |

---

## Detalle por migración

### 0001 — Re-sellado de hashes de integridad y cadena de auditoría
- **Commit / modelos:** `82e64322` · `auditLog.js`, `patient.js`, `treatment.js`.
- **Qué cambió a nivel datos:** el fix de canonicalización en `utils/integrity.js` cambia el valor del hash (antes reducía `Map`/`ObjectId` a `{}`). Además `auditLog` ganó campos `seq` y `prevHash` (default `null`) y un índice **único sparse** `{ seq: 1 }`.
- **Qué hace la migración:** recomputa y persiste `contentHash`/`integrityHash` de **todos los registros clínicos firmados** (patient, exam, prescription, treatment, periodontogram, odontograma, appointment) y **re-encadena** el audit log (asigna `seq` incremental, `prevHash`, y re-HMAC con el formato corregido de 7 campos).
- **Impacto en docs existentes:** sin esto, `audit/verify` reporta como "alterados" registros que nadie tocó. No hay integridad previa que romper (la anterior era ciega) → **establece la línea base correcta**.
- **Clasificación:** **REQUIERE.** **Idempotente** (recomputa los mismos valores). **Riesgo:** bajo. **Orden:** primera.

### 0002 — Limpieza de periodontogramas BORRADOR vacíos
- **Commit / modelos:** `1c4b0518` · `periodontogram.js`.
- **Qué cambió a nivel datos:** se eliminaron las vías que auto-creaban periodontogramas BORRADOR vacíos; quedan documentos basura en instalaciones previas (aparecían en el Centro de Firmas).
- **Qué hace la migración:** **borra** únicamente los demostrablemente vacíos: `estadoRegistro:'BORRADOR'` **y** `current.teeth` sin llaves **y** `firmadoEn:null` **y** sin ninguna entrada en `periodontogram_history`. Cualquiera con historial o mediciones **no se toca**.
- **Impacto:** elimina ruido; ningún dato clínico real se pierde.
- **Clasificación:** **LIMPIEZA (recomendada, no crítica).** **Idempotente.** **Riesgo:** bajo, pero **es un DELETE** → el backup automático es la red de seguridad.

### 0003 — Backfill de hash en odontogramas iniciales
- **Commit / modelos:** `1c4b0518` · `odontograma.js`.
- **Qué cambió a nivel datos:** el odontograma inicial nacía OFICIAL e inmutable pero **sin** `contentHash`/`integrityHash`, así que `verify` daba `ok:false` para registros previos al fix.
- **Qué hace la migración:** recalcula y persiste el hash sobre el contenido actual (inmutable: captura única). Solo toca los que aún no tienen `contentHash`.
- **Impacto:** registros iniciales previos al fix; sin esto `verify` falla para ellos.
- **Clasificación:** **REQUIERE.** **Idempotente.** **Riesgo:** bajo.

### 0004 — Backfill de versiones del odontograma clínico (→ colección nueva)
- **Commit / modelos:** `3a846635` · `odontograma.js` + **nuevo modelo `odontogramaHistory.js`** (colección `odontograma_history`, índice **único** `{ patient, versionName }`).
- **Qué cambió a nivel datos:** las versiones del odontograma clínico se movieron del array embebido `history[]` a la colección inmutable `odontograma_history` (espejo del periodontograma).
- **Qué hace la migración:** convierte los snapshots legacy de `history[]` en filas de `odontograma_history`, **agrupando por día** (unión/dedup de hallazgos por clave `espacio|diente|daño|superficie|nota`), y fija `current.versionName`. `versionName` es **determinístico** (`ISO + sha1(_id|día)`). Es **aditiva**: NO reescribe `history[]` (se conserva como respaldo) y **nunca** toca documentos firmados (guard `firmadoEn:null`). Alcance: `type:'clinic'`, `deletedAt:null`.
- **Impacto:** sin esto, el odontograma clínico nuevo no muestra el historial legacy del paciente.
- **Clasificación:** **REQUIERE.** **Idempotente** (el `versionName` determinístico choca con el índice único en reruns y se salta). **Riesgo:** bajo-medio (inserciones masivas en colección nueva) → backup.

---

## Cambios de esquema **sin acción** (aditivos / relajantes)

No requieren migración; se aplican solos o no rompen datos viejos:

- **Índices nuevos no únicos** (se crean al arrancar vía `createIndexes`/`ensureIndexes`): `patient` `{deletedAt,createdAt}` (`c38afb44`); `treatment` `{paciente_id}` y `{deletedAt,'tratamientos.fecha'}` (`82e64322`).
- **Validadores relajados** en subdocumentos del odontograma (`space`/`damage`/`note`/`surface` pasaron de `required` estricto a `default:''` + `required` **condicional**, `8c6fcc1c`/`1c4b0518`): es más permisivo, los docs viejos ya cumplían la regla más estricta.
- **`versionName` (default `'Inicial'`)** en odontograma: campo con default; los clínicos los fija `0004`.
- **Archivos de subschema borrados** (`damageSchema.js`, `initialSnapshotSchema.js`, `ff088198`): eran código muerto, **sin impacto en datos**.

---

## Anexo A — Datos legados de `preferences` (enum) → propuesta `0005`

> ⚠️ **No proviene de esta ventana** (`users.js` no cambió entre 06-09 y 06-23) pero está directamente relacionado con el fix de firma `45196a4e` y con el trabajo previo. **Requiere decisión del dueño**, no es bloqueante.

- **Problema:** documentos de usuario legacy pueden tener `preferences.signatureInput` fuera de `['mouse','tablet','touch','stu']` (p.ej. `'wacom-legacy'`) o `preferences.theme` fuera de `['light','dark','system']`. Como Mongoose valida **todo** el documento en `save()`, esos valores hacen fallar **cualquier** `user.save()` (subir firma, editar perfil, cambiar contraseña). El fix `45196a4e` esquivó el bloqueo **solo** en la subida de firma (update atómico con `runValidators:false`); el dato sucio sigue ahí para los demás `save()`.
- **Detección (ya disponible, read-only):**
  ```bash
  node Server/scripts/audit-legacy-users.js            # reporte por consola
  node Server/scripts/audit-legacy-users.js --json users-audit.json
  ```
  Reusa el modelo real y `validateSync()`; lista `_id`/`email`/`rol` y el path/valor ofensor.
- **Limpieza PROPUESTA (migración `0005`, aún NO escrita — requiere tu OK):** resetear los valores fuera de enum a su default. Transformación exacta (idempotente por el `$nin`):
  ```js
  // 0005-normalizar-preferences-enums.js  (PROPUESTA)
  await db.collection('usuarios').updateMany(
    { 'preferences.signatureInput': { $nin: ['mouse','tablet','touch','stu'] } },
    { $set: { 'preferences.signatureInput': 'mouse' } }   // default del schema
  );
  await db.collection('usuarios').updateMany(
    { 'preferences.theme': { $nin: ['light','dark','system'] } },
    { $set: { 'preferences.theme': 'system' } }            // default del schema
  );
  ```
  - **Decisión pendiente:** ¿resetear a default (arriba) o **mapear** (p.ej. `'wacom-legacy' → 'stu'`)? Mapear conserva la intención del usuario; resetear es más simple.
  - **Confirmar** el nombre real de la colección (el modelo `Usuario` pluraliza a **`usuarios`** salvo override; verificar antes de correr).
  - Corre `audit-legacy-users.js` **antes y después** para confirmar 0 ofensores.

---

## Anexo B — Drift de índices (opcional)

- En `auditLog.js` (`82e64322`) se **removió del código** el índice TTL `{ timestamp: 1 }, { expireAfterSeconds: 157680000 }` (≈5 años) y se **agregó** `{ seq: 1 }` único sparse.
- Mongoose **no dropea** índices que dejaste de declarar (solo `syncIndexes` lo haría). El TTL viejo **puede seguir vivo en la BD** y seguir expirando audit logs a los 5 años.
- **Acción opcional (baja prioridad):** si ya no se desea expiración, dropear el índice TTL stale manualmente:
  ```js
  // verificar primero: db.auditlogs.getIndexes()
  // db.auditlogs.dropIndex('timestamp_1')   // nombre real según getIndexes()
  ```
- El índice `{ seq: 1 }` único sparse se crea solo al arrancar; `0001` asigna los `seq` que lo poblan.

---

## Checklist de ejecución (para quien lo corra)

- [ ] **Respaldo manual extra** además del automático del runner (snapshot/mongodump de la BD de la clínica).
- [ ] Correr **en una copia/restore** de la BD real primero (no directo a producción).
- [ ] `npm run migrate:dry` → confirmar que aparecen como pendientes `0001`, `0002`, `0003`, `0004` (las ya aplicadas no deben listarse).
- [ ] `npm run migrate` → verifica que el **backup automático** se completó (si falla, aborta solo).
- [ ] Post-`0001`/`0003`: correr `audit/verify` (o el endpoint de verificación) y confirmar que los registros firmados dan `ok:true`.
- [ ] Post-`0004`: abrir un odontograma clínico con historial legacy y confirmar que las versiones por día aparecen; verificar que `history[]` embebido sigue intacto (respaldo).
- [ ] Confirmar que ningún documento **firmado** fue modificado por `0004` (guard `firmadoEn:null`).
- [ ] **(Decisión)** Anexo A: correr `audit-legacy-users.js`; si hay ofensores, decidir reset vs. mapeo y, si se aprueba, escribir/correr `0005`.
- [ ] **(Opcional)** Anexo B: revisar `db.auditlogs.getIndexes()` y dropear el TTL stale si aplica.
- [ ] Smoke test de la app (login, subir firma, guardar nota/odontograma) tras migrar.

---

*Fuentes: `git log 2026-06-09..2026-06-23`, `Server/migrations/0001`–`0004` + `README.md`, `Server/models/{auditLog,patient,treatment,odontograma,odontogramaHistory,periodontogram}.js`, `Server/scripts/audit-legacy-users.js`, `scripts/migrate.js` + `package.json`.*
