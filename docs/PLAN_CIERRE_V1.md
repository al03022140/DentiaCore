# Plan de Cierre V1 — DentiaCore

> **Fecha:** 2026-07-16 · **Autor:** Arquitectura técnica · **Alcance:** V1 producción completa (Release Checklist entero de `AUDITORIA_TECNICA_INTEGRAL.md`, Fases A–D).
> **Fuentes:** `docs/AUDITORIA_TECNICA_INTEGRAL.md` (8 fases, 120 hallazgos) + `CONFIG_AUDIT_2026-07-13.md` (H1–H4).
> **Naturaleza:** este documento NO contiene código. Es la lista de lo que falta cerrar y la planeación para que otra persona lo ejecute. La verificación del cierre la hace Arquitectura contra el criterio de aceptación de cada ítem (ver más abajo).
>
> **Pasada de cierre 2026-07-16:** C-1, O-1..O-8 y D-1..D-4 CERRADOS (comando de verificación de cada ítem corrido contra el repo real, ver anotaciones inline). Abierto: **V-2** (requiere la BD real de la clínica) y **O-9** (nuevo — el secreto de auditoría debe viajar con el backup; endurece la restauración de O-1). Roadmap fuera de V1: **R-1** (versionado de llaves del audit log HMAC). Detalle en cada sección.

---

## 0. Cómo se usa este documento

Cada ítem abierto es un mini-ticket autónomo con: **archivos**, **qué hacer**, **criterio de aceptación** (objetivo, verificable), **cómo se verifica** (comando exacto sobre el repo), **esfuerzo** y **dependencias**. El ejecutor no necesita leer la auditoría completa para empezar; la referencia a la fase está por si quiere el detalle de causa raíz.

**Regla de cierre (rol de Arquitectura):** un ítem pasa a `CERRADO` solo cuando su comando de verificación pasa sobre el repo real. No se cierra por reporte verbal. Cuando el ejecutor marque un ítem como hecho, Arquitectura corre el comando y confirma `CERRADO` o devuelve `ABIERTO` con la evidencia.

**Nivel del ejecutor asumido:** semi-senior. Cada ítem dice *qué* y el *criterio*; el *cómo* exacto queda a criterio del ejecutor.

---

## 1. Estado real de la línea base (lo más importante)

La auditoría es una foto de su fecha. Desde entonces el equipo ya cerró la mayoría de los Críticos y Altos. Verificado en código el 2026-07-16:

| Bloque | Estado real | Evidencia |
|---|---|---|
| **3 Críticos** | **2 de 3 cerrados** | BE-01 cerrado (`auditLogger.js:219-233`, error logueado y re-lanzado). CFG-01 cerrado (los 3 instaladores generan `AUDIT_HMAC_SECRET`). **DOC-01 ABIERTO** (update+migrate). |
| **Seguridad (Fase 6 + SEC-04)** | **Cerrado** | SEC-01 (`users.js:175-183`), SEC-02 (`appointmentController.js`), SEC-03 (`requireSignerRole`), SEC-04 (`middlewares/mongoSanitize.js` + coerción `?version` a String). |
| **Backend Altos (Fase 3)** | **Cerrado** | BE-02 (`exams.delete` en `permissions.js`), BE-03 (magic bytes en firma/logo), rollback de caja con `logger.error` + contexto (`cashController.js:551,565`), gate de `error.message` por `NODE_ENV` (`dent.js:332`). |
| **Frontend Altos (Fase 4)** | **Mayormente cerrado** | FE-01 catch-all 404 (`app.jsx:142`). `PatientCard` por teclado: **VERIFICAR**. A11y odontograma/perio: **decisión del dueño**. |
| **Runtime (Fase 7)** | **Parcial** | `gracefulShutdown` cierra Mongo con timeout (`dent.js:395`). `/api/health` devuelve 503 con DB caída. `uncaughtException`: **decisión de arquitectura** (ver §4). |
| **Tests fantasma** | **Cerrado** | `.github/workflows/ci.yml` corre `npm test` (17 suites) en Server y Client en cada push/PR. |
| **CONFIG_AUDIT H1–H3** | **Cerrado** | `.env.bak-jwt` borrado; URI redactada (`db.js:88`); fail-fast de `MONGODB_URI` (`db.js:21`). |
| **Operación / Docs op.** | **ABIERTO** | Backup+alertas, TZ, update+migrate, runbook PM2, README, mongoose split. → El grueso de este plan. |

**Titular:** la V1 no requiere trabajo de código de producto. Requiere cerrar **~8 huecos de operación y documentación operativa** + tomar **4 decisiones**. Es cuestión de días-hombre, no de semanas de desarrollo.

---

## 2. Bloque ABIERTO — plan ejecutable

Ordenado por la secuencia recomendada (§6). Severidad: 🔴 Crítica · 🟠 Alta · 🟡 Media · ⚪ Baja.

---

### C-1 · 🔴 Camino de actualización con migraciones (DOC-01)
**✅ CERRADO (2026-07-16).** `update.sh`/`update.ps1` creados en la raíz; orden verificado backup(BD+uploads)→`migrate:dry`(aborta si falla)→`migrate`→build→PM2 restart. `grep -c migrate update.sh update.ps1` → 5 y 6. Los pasos de backup y `migrate:dry` se corrieron de verdad contra la BD local (backup real generado, `migrate:dry` reportó "Esquema al día (6 migraciones, 0 pendientes)"). No se enganchó un botón en `launcher.py` (fuera del criterio de aceptación explícito; el runbook queda como el único camino documentado).
- **Fase auditoría:** 7 (DOC-01) · **Riesgo:** #4 (integridad de auditoría corrompible en cada update)
- **Archivos:** crear `update.sh` + `update.ps1` (raíz); enganchar en el flujo de actualización de `launcher.py`.
- **Qué hacer:** un único camino soportado de actualización que ejecute en orden: `backup` (BD + uploads) → `npm run migrate:dry` (aborta si falla) → `npm run migrate` → build del Client → reinicio vía PM2. Documentarlo como el ÚNICO método de update.
- **Criterio de aceptación:** existe `update.sh`/`update.ps1`; ejecutan migrate; ningún camino de actualización llega al arranque sin haber corrido `migrate`. `migrate:dry` que falla detiene el update antes de tocar datos.
- **Cómo se verifica:** `grep -c migrate update.sh update.ps1` > 0 en ambos; lectura del script confirma el orden backup→dry→migrate→build→restart; prueba en staging con una migración pendiente.
- **Esfuerzo:** 0.5–1 día · **Depende de:** — · **Owner:** Dev instalador/DevOps

---

### O-1 · 🟠 Backup de BD programado + canal de alertas (OBS-01/BKP-01)
**✅ CERRADO (2026-07-16).** `scripts/backup-db.js`/`restore-db.js` ya existían (robustos); se les agregó: marcador `backups/last-success.json` en cada corrida exitosa, `Server/utils/alerts.js` (webhook, decisión del dueño — ver D-1..D-4), `scripts/check-health.js` (backup viejo/ausente + `/api/health` + disco vía `fs.statfsSync`, sin dependencias nuevas), y registro de tareas programadas en `install.sh` (cron, idempotente) e `install.ps1` (`Register-ScheduledTask`, admin ya garantizado por `Assert-Admin`). Verificado en vivo: backup real corrido, `last-success.json` generado, `check-health.js` en verde contra el server local, alerta probada con un webhook mock local (POST recibido correctamente). **Restauración de prueba ejecutada (cierra V-3 también):** `restore-db.js` a una BD scratch (`DentiaCore_restore_test`, `--drop --force`), conteos por colección idénticos a producción (17 colecciones, 919 documentos), `AuditLog.verifyChain()` da el mismo resultado en ambas BDs (mecanismo de restore fiel al 100%; ver nota separada sobre el propio contenido del audit log más abajo). BD scratch borrada tras verificar.
- **Fase auditoría:** 7 (OBS/BKP) · **Riesgo:** #1 (pérdida silenciosa de respaldo — mayor impacto × mayor probabilidad de toda la auditoría)
- **Archivos:** instaladores (`install.sh`/`install.ps1`/`launcher.py`); nueva utilidad de alerta en `Server/` (email SMTP o webhook); marcador `backups/last-success.json`.
- **Qué hacer:** (a) el instalador registra un **backup automático de BD** (`mongodump`) programado —`schtasks` en Windows, `cron`/`systemd timer` en Linux— con rotación, escribiendo `last-success.json` al terminar OK. (b) **Canal de alerta mínimo** (email o webhook) que dispare ante: backup fallido (marcador viejo > N horas), `/api/health` con `db != connected`, y disco por debajo de umbral.
- **Criterio de aceptación:** tras instalar, existe una tarea programada de backup; una corrida exitosa actualiza `last-success.json`; forzar un fallo (renombrar destino) dispara la alerta configurada. El backup actual manual (PNGs legacy en `launcher.py`) NO cuenta: debe ser BD, automático y observable.
- **Cómo se verifica:** listar la tarea programada (`schtasks /query` / `crontab -l`); inspeccionar `last-success.json` tras una corrida; prueba de fallo forzado que produce alerta; una **restauración de prueba** verificada (conteos + `verifyChain`).
- **Esfuerzo:** 4–6 días (el ítem más grande del plan) · **Depende de:** — · **Owner:** Dev instalador/DevOps + Dev backend
- **Nota:** este ítem por sí solo justifica el bloque de "confiabilidad operativa". Es lo que separa "app que el dueño abre" de "servicio en el que una clínica confía".
- **Nota de esfuerzo real:** salió en horas, no días — el backup/restore YA existía, robusto y sin usar. El trabajo real fue únicamente scheduling + marcador + alertas.
- **Hallazgo nuevo durante la verificación (2026-07-16), NO relacionado con backup/restore:** `AuditLog.verifyChain()` contra la BD local de este entorno de desarrollo reporta 805 de 807 entradas con `hash_mismatch` (seq 1–805 rotas, seq 806–807 verifican OK). **Confirmado que el mecanismo de backup/restore NO es la causa** — el mismo resultado exacto (`breakCount:805`, mismo primer/último break) sale corriendo `verifyChain()` sobre la BD original SIN restaurar nada. La frontera cae entre el 9 y el 13 de julio 2026 (seq 805 vs 806), coincidiendo con la ventana de la auditoría dirigida de CONFIGURACIÓN (`CONFIG_AUDIT_2026-07-13.md`, CFG-01) — el síntoma es consistente con una rotación de `AUDIT_HMAC_SECRET` en el `Server/.env` **local** durante esa auditoría (los HMACs viejos dejan de verificar contra una clave nueva; es el comportamiento correcto y esperado del mecanismo anti-tamper cuando cambia la clave, no una corrupción de datos). **Los instaladores de producción preservan el secreto existente** (`AUDIT_HMAC_SECRET existente conservado` en install.sh/ps1/launcher.py) — este escenario no debería replicarse en la instalación real de la clínica salvo que alguien edite `Server/.env` a mano ahí. **Acción recomendada (no ejecutada — fuera del alcance de este cierre):** desde `Server/`, con `Server/.env` apuntando a la BD real de la clínica (si es distinta de este entorno de dev), correr:
  ```bash
  node -e "require('dotenv').config({path:'.env'}); const mongoose=require('mongoose'); const AuditLog=require('./models/auditLog'); mongoose.connect(process.env.MONGODB_URI).then(async()=>{const r=await AuditLog.verifyChain(); console.log(r.ok, r.checked, r.breaks.length); process.exit(r.ok?0:1);});"
  ```
  para confirmar que su secreto nunca rotó.

---

### O-2 · 🟠 Zona horaria fijada en el arranque (RT-01)
**✅ CERRADO (2026-07-16).** `TZ=America/Mexico_City` fijado en 4 capas: (1) `Server/scripts/dent.js` como fallback de `process.env.TZ` justo tras cargar `.env` — la garantía real, funciona sin importar el mecanismo de arranque; (2) `Server/ecosystem.config.cjs` (`env` y `env_development`); (3) `install.sh`/`install.ps1` (escriben `TZ=` en `.env` si falta); (4) `launcher.py` (repara/crea `.env` con el default). `grep -rn "America/Mexico_City" Server/ecosystem.config.cjs install.sh install.ps1 launcher.py` → match en los 4. Verificado en runtime: con `TZ` seteado, `Intl.DateTimeFormat().resolvedOptions().timeZone` resuelve a `America/Mexico_City` (de donde `statsController.js` ya leía `REPORT_TZ`).
- **Fase auditoría:** 7 (RT-01) · **Riesgo:** #7 (descuadres de caja/auditoría, silenciosos)
- **Archivos:** `Server/ecosystem.config.cjs` (env de PM2) y/o registro de servicio en los instaladores. Contexto en `statsController.js:25`.
- **Qué hacer:** fijar `TZ=America/Mexico_City` de forma explícita en el entorno con que arranca el server (no depender de la TZ del SO del cliente).
- **Criterio de aceptación:** el proceso corre con `TZ=America/Mexico_City` sin importar la TZ de la máquina; los cortes de caja y timestamps de auditoría usan esa zona.
- **Cómo se verifica:** `grep -rn "America/Mexico_City" Server/ecosystem.config.cjs install.* launcher.py` con match; en runtime, `process.env.TZ` == `America/Mexico_City` (exponer en `/api/health` en dev o comprobar en logs de arranque).
- **Esfuerzo:** 1–2 h · **Depende de:** — · **Owner:** Dev instalador/DevOps

---

### O-3 · 🟠→🟡 Runbook con nombre de servicio PM2 correcto (DOC-02/03)
**✅ CERRADO (2026-07-16).** Las 3 ocurrencias de `dent-api` en `Server/README.md` (L116/152/155) corregidas a `dentiacore-api`, más nota de verificar con `pm2 describe dentiacore-api` antes de operaciones destructivas. `grep -c "dent-api" Server/README.md` → 0.
- **Fase auditoría:** 7 (DOC-02/03) · **Riesgo:** #10 (runbook incorrecto agrava un incidente real)
- **Archivos:** `Server/README.md` (usa `dent-api` y `--only dent-api`).
- **Qué hacer:** corregir el nombre del servicio a `dentiacore-api` en todo `Server/README.md`. El nombre real ya es `dentiacore-api` en `ecosystem.config.cjs:4` y en `launcher.py`; el runbook es el único desalineado. Verificar de paso los comandos `pm2 stop/start/restart` del documento.
- **Criterio de aceptación:** cero ocurrencias de `dent-api` (nombre viejo) en `Server/README.md`; los comandos del runbook funcionan copy-paste contra el servicio real.
- **Cómo se verifica:** `grep -c "dent-api" Server/README.md` == 0 (cuidando no romper `dentiacore-api`); prueba manual de un comando del runbook.
- **Esfuerzo:** 30 min · **Depende de:** — · **Owner:** Dev backend

---

### O-4 · 🟠 Unificar la versión de mongoose (hallazgo nuevo, no en la auditoría)
**✅ CERRADO (2026-07-16) — causa raíz distinta a la sospechada.** `create-admin.js` y `list-users.js` nunca tocaban mongoose directamente (van vía `Server/config/db.js`/`Server/models/*`, que resuelven al mongoose de `Server/node_modules` por la resolución normal de Node) — no eran el problema. El único punto real era `set-pin.js`: tenía `const mongoose = require('mongoose')` suelto en la raíz (resolviendo a la copia de la raíz, ^9.3.1) y la variable **nunca se usaba** en el archivo. Se borró la línea (dead code, no una migración de versión) y se quitó `mongoose` de `package.json` raíz (no lo usa ningún script de la raíz — confirmado con `grep -rl "require(['\"]mongoose"` excluyendo `Server/`/`Client/`). `npm install` en la raíz purgó 17 paquetes. Suite completa: 19/19 suites, 259/259 tests, sin regresión.
- **Detectado:** 2026-07-16 en la línea base · **Riesgo:** comportamiento de esquema divergente en scripts de mantenimiento
- **Archivos:** `package.json` raíz (`mongoose ^9.3.1`) vs `Server/package.json` (`mongoose ^7.0.3`). Scripts raíz afectados: `create-admin.js`, `list-users.js`, `set-pin.js`.
- **Qué hacer:** los modelos están escritos para mongoose 7; la raíz declara mongoose 9. Un script de mantenimiento en la raíz que conecte con v9 (cambios en `strictQuery`, casting, índices) puede comportarse distinto al server. Decidir **una** versión: lo más seguro es que los scripts raíz usen el mongoose de `Server/` (o alinear la raíz a `^7`). No subir el server a 9 sin una pasada de regresión completa.
- **Criterio de aceptación:** una sola familia mayor de mongoose gobierna todo acceso a datos; los scripts raíz corren contra la BD real sin warnings de deprecación ni cambios de comportamiento.
- **Cómo se verifica:** `grep mongoose package.json Server/package.json` → mismo mayor, o los scripts raíz documentados/reapuntados al runtime de Server; correr `create-admin.js` contra una BD de staging y confirmar resultado idéntico.
- **Esfuerzo:** 0.5–1 día (incluye regresión de los scripts) · **Depende de:** — · **Owner:** Dev backend

---

### O-5 · 🟡 README raíz reescrito (DOC — Fase 7)
**✅ CERRADO (2026-07-16).** Reescrito por completo: instaladores, generación de secretos, `migrate`/`migrate:dry`, PM2 (`dentiacore-api`), `update.sh`/`update.ps1`, backup/restore, dev quickstart, tests, link a `docs/README.md`. Se borró todo el contenido stale (referencias a `tipoValueFix.txt`/`PATIENT_MODEL_IMPROVEMENTS.md`/`migratePatientData.js` inexistentes, "Node v16+", recomendación de MongoDB Atlas gestionado, el texto conversacional de asistente al final). `grep -icE "install|AUDIT_HMAC|migrate|pm2" README.md` → 13 líneas; 0 referencias a los archivos inexistentes.
- **Fase auditoría:** 7 (README obsoleto)
- **Archivos:** `README.md` raíz (aún describe "aplicación DENT", odontograma-céntrica; no menciona instaladores, secretos ni migrate).
- **Qué hacer:** reescribir para reflejar el proyecto real: instaladores (`install.sh`/`install.ps1`/`launcher.py`), generación de secretos (`JWT_SECRET`/`AUDIT_HMAC_SECRET`), flujo de `migrate`, arranque por PM2 (`dentiacore-api`), y el `update.sh`/`update.ps1` de C-1.
- **Criterio de aceptación:** el README raíz permite a un técnico nuevo instalar, actualizar y operar sin conocimiento previo; menciona explícitamente instaladores, secretos, migrate y PM2.
- **Cómo se verifica:** lectura; `grep -iE "install|AUDIT_HMAC|migrate|pm2" README.md` con matches en las secciones correctas.
- **Esfuerzo:** 2–3 h · **Depende de:** C-1 (para documentar el update) · **Owner:** Dev backend

---

### O-6 · ⚪ Índice de runbooks `docs/README.md`
**✅ CERRADO (2026-07-16).** `docs/README.md` creado, enlaza los 4 reportes de auditoría + subdirectorios `server/`, `cliente/`, `normalizacion/` + el flujo de `update.sh`/`update.ps1`. Los 21 links verificados uno por uno contra el filesystem real (`[ -f "$f" ]` por cada uno) — los 21 resuelven.
- **Fase auditoría:** 7 (DOC)
- **Archivos:** crear `docs/README.md`.
- **Qué hacer:** índice que enlace `AUDITORIA_TECNICA_INTEGRAL.md`, este `PLAN_CIERRE_V1.md`, `API_CALLS_MAP.md`, `CONFIG_AUDIT_2026-07-13.md`, `STATISTICS_AUDIT_2026-07-13.md` y los subdirectorios `docs/server`, `docs/cliente`, `docs/normalizacion`.
- **Criterio de aceptación:** `docs/README.md` existe y enlaza todos los runbooks/reportes vigentes.
- **Cómo se verifica:** `ls docs/README.md`; los enlaces resuelven.
- **Esfuerzo:** 30 min · **Depende de:** — · **Owner:** cualquiera

---

### O-7 · 🟡 Quitar cache header `public, 1yr` sobre `/uploads` (CONFIG_AUDIT M2)
**✅ YA CERRADO antes de este plan** — resuelto por el commit `670c8294` (auditoría dirigida de configuración, previo a esta pasada). Verificado 2026-07-16: `Client/vite.config.js` no tiene bloque `headers` en el proxy `/uploads`; `grep -n "max-age" Client/vite.config.js` → 0 resultados. Sin cambios de código en esta pasada.
- **Fuente:** `CONFIG_AUDIT_2026-07-13.md` M2 · **Riesgo:** política de caché pública de 1 año sobre PHI (aunque sea dev-proxy, no debe existir en el repo)
- **Archivos:** `Client/vite.config.js:88-91` (bloque `headers` del proxy `/uploads`).
- **Qué hacer:** borrar el bloque `headers` con `Cache-Control: public, max-age=31536000`. El server ya sirve `/uploads` como `private, no-store` (`dent.js:164`); el header del proxy es incorrecto y contradice esa intención.
- **Criterio de aceptación:** ningún `max-age` público sobre `/uploads` en el repo.
- **Cómo se verifica:** `grep -n "max-age" Client/vite.config.js` sin resultados sobre `/uploads`.
- **Esfuerzo:** 15 min · **Depende de:** — · **Owner:** Dev frontend

---

### O-8 · 🟡 Reconciliar `periodontogram-config` Server↔Client (CONFIG_AUDIT M1)
**✅ YA CERRADO al mínimo aceptable antes de este plan.** Verificado 2026-07-16: ambos archivos ya tienen comentarios de cruce-referencia actualizados y correctos (`Server/config/periodontogram-config.js` apunta al del Client y viceversa, ninguno stale), el enum `pronostico` incluye `'Imposible'` en AMBOS lados, y los 8 `MEASUREMENT_LIMITS` numéricos coinciden exactamente entre las dos convenciones de nombres (inglés UPPER_SNAKE vs español camelCase). La extracción a fuente única (stretch goal) sigue sin hacerse — diferida a post-lanzamiento por diseño del propio plan. Sin cambios de código en esta pasada.
- **Fuente:** `CONFIG_AUDIT_2026-07-13.md` M1 · **Riesgo:** cambio de límite/enum hecho en un solo lado → divergencia clínica silenciosa
- **Archivos:** `Server/config/periodontogram-config.js` (v1.0.0) vs `Client/src/shared/config/periodontogram-config.js` (v4.0.0).
- **Qué hacer:** extraer los constantes realmente compartidos (listas de dientes, `MEASUREMENT_LIMITS`, enum `pronostico` incl. `'Imposible'`) a un `.cjs` único consumido por ambos lados —usar el mismo mecanismo que ya comparte `periodontal-stats-core.cjs`. Mínimo aceptable si se difiere: corregir el comentario stale de `pronostico` y cruzar-referenciar ambos archivos.
- **Criterio de aceptación:** una sola fuente de verdad para límites y enums, o (mínimo) comentarios corregidos y cruzados.
- **Cómo se verifica:** lectura; los rangos/enum viven en un solo archivo compartido.
- **Esfuerzo:** 0.5 día (extracción) / 30 min (mínimo) · **Depende de:** — · **Owner:** Dev fullstack · **Nota:** candidato a diferir a post-lanzamiento.

---

### O-9 · 🟠 El secreto de auditoría debe viajar con el backup (endurecimiento de restore · V1)
**⚠️ ABIERTO — nace del hallazgo de verificación en O-1.** El audit log NOM-024 usa un HMAC con clave `AUDIT_HMAC_SECRET` (`auditLog.js:263-293`: `verifyChain` recomputa cada entrada con el secreto **actual**, sin `keyId` por entrada). `backup-db.js` sólo hace `mongodump` — el secreto NO viaja en el backup. Consecuencia: si el `.env` se pierde/regenera o se restaura en hardware nuevo con otro secreto, **toda la historia clínica queda no-verificable e indistinguible de manipulación** (la prueba de restore de O-1 sólo verificó porque reusó el mismo `.env`). Los instaladores preservan el secreto en un update in-place, pero un desastre/reinstalación no está cubierto.
- **Origen:** verificación 2026-07-16 (nota en O-1) · **Riesgo:** adyacente al #1 (pérdida de la *verificabilidad* del expediente legal, no de los datos)
- **Archivos:** `scripts/backup-db.js`, `scripts/restore-db.js`, runbook de backup en `Server/README.md`, `update.sh`/`update.ps1`.
- **Qué hacer:** (a) que el respaldo incluya `AUDIT_HMAC_SECRET` (y `JWT_SECRET`) junto a los datos —copiados a un destino seguro y separado, pero recuperables con el dump—; como mínimo, que `backup-db.js` emita un aviso final "respalda también `Server/.env`" y el runbook lo documente como paso obligatorio. (b) Añadir `verifyChain()` al procedimiento de restore como paso de aceptación. (c) Regla explícita en README/runbook: **nunca regenerar `AUDIT_HMAC_SECRET` sobre una BD existente**.
- **Criterio de aceptación:** una restauración a un entorno con `.env` nuevo que use el secreto respaldado da `verifyChain().ok === true`; el runbook de restore incluye `verifyChain()`; README/runbook prohíbe regenerar el secreto sobre datos existentes.
- **Cómo se verifica:** `grep -i "AUDIT_HMAC_SECRET" scripts/backup-db.js scripts/restore-db.js Server/README.md` con la instrucción presente; prueba de restore dump+secreto en BD/entorno limpio → `verifyChain().ok`.
- **Esfuerzo:** 2–4 h (doc + aviso en `backup-db.js`; sin re-arquitectura) · **Depende de:** O-1 · **Owner:** Dev instalador/DevOps
- **Nota:** esto sólo garantiza que el secreto **actual** no se pierda (riesgo operativo inmediato). La fragilidad ante **rotación** de llaves se resuelve por separado en R-1.

---

## 3. Ítems a VERIFICAR (chequeo del ejecutor antes de cerrar)

No pude determinar el estado solo con grep; requieren lectura/prueba manual. Cada uno trae el criterio.

- **V-1 · `PatientCard` del listado principal operable por teclado** (Fase 4). **✅ CERRADO (2026-07-16).** Confirmado en `Client/src/features/patient-list/patient-list.jsx:101-104`: `role="button"` + `tabIndex={0}` + `onKeyDown={handleKeyDown}` + `aria-label`. Ya estaba aplicado desde la auditoría dirigida previa (FE-A11Y-04, 2026-07-12); esta pasada solo lo verificó contra el código actual.
- **V-2 · Migraciones 0001–0004 corridas contra la BD real del cliente** (Fase 5 / Release Checklist). **⚠️ SIGUE ABIERTO — requiere acceso a la BD real de la clínica, fuera del alcance de este entorno.** Lo que SÍ se verificó: contra la BD local de este entorno de desarrollo, `npm run migrate:dry` reporta "Esquema al día (6 migraciones, 0 pendientes)" — el mecanismo de migración funciona end-to-end. Falta: correr `migrate:dry` → `migrate` (vía `update.sh`/`update.ps1`, ya construidos en C-1) contra la BD real de la clínica, y resolver el Anexo A (preferences legacy) ahí si aplica. Acción del operador, no de código.
- **V-3 · Restauración de respaldo probada** (Fase 7 / Release Checklist). **✅ CERRADO (2026-07-16)**, ver detalle en O-1 arriba: restore real a BD scratch, conteos idénticos a producción (17 colecciones, 919 documentos), `verifyChain()` con resultado idéntico pre/post-restore (confirma que el restore es fiel — la propia BD local tiene una discrepancia de integridad preexistente y no relacionada, ver nota en O-1).

---

## 4. Decisiones del dueño (bloquean diseño, no se cierran a ciegas)

Como arquitecto, estas NO son bugs a corregir sino decisiones con trade-off. Mi recomendación en cada una:

- **D-1 · `uncaughtException`: mantener vivo vs. salir ≠0 bajo supervisor.** **✅ DECIDIDO 2026-07-16 (AskUserQuestion, dueño): mantener keep-alive + enrutar a alertas** (la opción recomendada). **Implementado:** sin cambios a la política de crash; `uncaughtException`/`unhandledRejection` en `dent.js` ahora también llaman `sendAlert()` (`Server/utils/alerts.js`, O-1) además de `logger.error`, así que un proceso vivo-pero-degradado deja de ser invisible. Reevaluar a "salir ≠0 bajo supervisor" al entrar a SaaS-lite.
- **D-2 · Deduplicar `findConflict`/`findPatientConflict`** (`appointmentController.js:69,101`). **✅ VERIFICADO 2026-07-16 — el test pasa, dedup queda como deuda técnica diferible.** `Server/tests/appointment-conflict.test.js` (4 casos contra el endpoint real `POST /api/appointments`: conflicto de doctor, conflicto de paciente, sin solape, `force` salta solo el conflicto de doctor) — los 4 pasan. Lectura del código confirma que no son duplicados de propósito: verifican dimensiones distintas (agenda del doctor vs. del paciente) con el mismo algoritmo de solapamiento. Dedup diferida, con test de regresión ya en el repo.
- **D-3 · Accesibilidad del odontograma/periodontograma** (Fase 4, complejidad Alta). **✅ DECIDIDO 2026-07-16 (AskUserQuestion, dueño): fuera de la V1.** Diferido a una pasada dedicada futura.
- **D-4 · `AUDIT_HMAC_SECRET` en el `.env` de desarrollo** (CONFIG_AUDIT H4). **✅ CERRADO — ya no era un problema.** Verificado 2026-07-16: `Server/.env` local ya tiene `AUDIT_HMAC_SECRET` de 64 caracteres.

---

## 5. Ya CERRADO — confirmado en código (no re-hacer)

Verificado el 2026-07-16. Se lista para que nadie replanifique trabajo hecho.

| ID | Hallazgo | Evidencia |
|---|---|---|
| BE-01 🔴 | Auditoría NOM-024 ya no se silencia | `auditLogger.js:219-233` (loguea + re-lanza) |
| CFG-01 🔴 | Instaladores generan `AUDIT_HMAC_SECRET` | `install.sh:286-304`, `launcher.py:635-676`, `install.ps1` |
| SEC-01 🟠 | Revocación de sesión completa | `users.js:175-183`; test `security-fixes.test.js` |
| SEC-02 🟠 | PHI de citas filtrada por rol | `appointmentController.js:239,273,294` |
| SEC-03 🟠 | `/uploads/firmas` exige firmante | `authorize.js:174`; `settingsRoutes.js:110-112` |
| SEC-04 🟠 | NoSQL: sanitize global + `?version` a String | `middlewares/mongoSanitize.js`; `odontogramaController.js:468` |
| BE-02 🟠 | Permiso `exams.delete` en catálogo | `permissions.js:37-40,80` |
| BE-03 🟠 | Magic bytes en firma/logo | `saveSignatureImage.js:49`; `fileMagicBytes.js` |
| BE (caja) 🟠 | Rollback de caja con `logger.error`+contexto | `cashController.js:551,565` |
| BE-05 🟠 | `error.message` gated por `NODE_ENV` | `dent.js:332` |
| FE-01 🟠 | Ruta catch-all/404 | `app.jsx:142`; `NotFound.jsx` |
| RT/OBS 🟠 | `/api/health` 503 con DB caída; `gracefulShutdown` cierra Mongo | `dent.js:395-415`; CONFIG_AUDIT §5 |
| QA 🟠 | Tests corren en CI (17 suites) | `.github/workflows/ci.yml` |
| H1–H3 🟠 | `.env.bak-jwt` borrado; URI redactada; fail-fast `MONGODB_URI` | `db.js:21,88` |

---

## 6. Secuencia recomendada y Definition of Done del release

**Sprint 1 — Higiene crítica + docs op. (2–3 días).** C-1 (update+migrate 🔴), O-2 (TZ), O-3 (runbook), O-4 (mongoose), O-5 (README), O-6 (índice). Todo de bajo esfuerzo; desbloquea operar y actualizar sin corromper datos.

**Sprint 2 — Confiabilidad operativa (≈1 semana).** O-1 (backup programado + alertas 🟠) — el bloque grande y de mayor riesgo. Incluye V-3 (restauración de prueba). Al cerrar este sprint, el sistema deja de tener puntos ciegos operativos.

**Sprint 3 — Limpieza + decisiones (1–2 días + tiempo de decisión).** O-7, O-8; resolver D-1..D-4; ejecutar V-1, V-2.

**Definition of Done de la V1 (el release sale cuando):**
- [x] C-1 cerrado: existe camino único de update que corre `migrate`. *(2026-07-16)*
- [x] O-1 cerrado: backup de BD automático + alerta de fallo + una restauración verificada. *(2026-07-16)*
- [x] O-2, O-3, O-4 cerrados (TZ, runbook, mongoose). *(2026-07-16)*
- [x] O-5, O-6 cerrados (README, índice). *(2026-07-16)*
- [x] O-7, O-8 cerrados (ya lo estaban antes de este plan; verificados). *(2026-07-16)*
- [x] V-1 verificado. [x] V-3 verificado. **[ ] V-2 sigue abierto — requiere la BD real de la clínica, acción del operador.**
- [ ] **O-9 abierto (V1)** — `AUDIT_HMAC_SECRET` debe respaldarse junto a los datos y el restore debe correr `verifyChain()`; sin esto el backup respalda datos pero no su verificabilidad.
- [x] D-1..D-4 decididas y documentadas arriba (D-1 keep-alive+alertas, D-2 verificado y diferido, D-3 fuera de V1, D-4 no aplicaba). *(2026-07-16)*
- [ ] `AUDITORIA_TECNICA_INTEGRAL.md` §5 (Release Checklist) revisado ítem por ítem contra este documento — pendiente, no cubierto por esta pasada (esta pasada cerró específicamente el contenido de este plan, no un re-barrido completo del checklist original).
- **Bloqueantes para producción con datos de la clínica: V-2** (correr `update.sh`/`update.ps1` contra la BD real la primera vez) y **O-9** (asegurar que el secreto de auditoría se respalde con los datos — sin él, una restauración a hardware nuevo pierde la verificabilidad del expediente legal).

Los ítems de la Fase 8 (SaaS) quedan **fuera** de la V1 por diseño: son insumo de la decisión de negocio, no del release.

---

## 7. Hallazgos para el roadmap (fuera de V1)

Deuda de diseño detectada durante el cierre; no bloquea V1, pero debe entrar al roadmap con severidad propia.

### R-1 · 🟠 Versionado de llaves del audit log HMAC (Roadmap — Fase 2 / pre-SaaS)
- **Origen:** verificación 2026-07-16 (ver O-1/O-9) · **Mecanismo:** `auditLog.js` — `computeEntryHash` firma con `AUDIT_HMAC_SECRET`; `verifyChain` recomputa con el secreto **actual**; no se guarda `keyId`/`keyVersion` por entrada. Por diseño, rotar el secreto invalida toda la historia previa (comportamiento correcto de un MAC con clave, pero operacionalmente frágil).
- **Problema:** (1) el mecanismo no distingue "roté la llave" de "manipulación" — ambos dan `hash_mismatch`; (2) si el secreto se filtra, no se puede rotar sin destruir la verificabilidad histórica → respuesta a incidentes bloqueada; (3) en SaaS, la rotación de secretos (por tenant, por política) se vuelve obligatoria.
- **Qué hacer:** llavero de claves. Guardar `keyId` por entrada; mantener clave activa + retiradas; `verifyChain` valida cada entrada contra la clave nombrada por su propio `keyId`. Rotar = agregar clave nueva como activa, conservar las viejas. **Nunca** re-firmar entradas viejas con la clave nueva (una re-firma es indistinguible de una reescritura y anula el tamper-evidence).
- **Migración:** campo `keyId` nuevo, default = clave "génesis" (el secreto actual) para las entradas existentes; cada entrada nueva graba su `keyId`.
- **Criterio de aceptación:** rotar `AUDIT_HMAC_SECRET` deja de romper `verifyChain()` sobre entradas pre-rotación; un test de rotación (firmar con K1, rotar a K2, firmar más, `verifyChain().ok`) pasa.
- **Severidad:** Alta (deuda de seguridad diferible) · **Esfuerzo:** 1–2 días · **Encaja en:** Roadmap Fase 2 (Producción/seguridad) o previo a SaaS.
