# Índice de auditoría — Backend (Server)

El backend se divide por **dominio/recurso**: cada módulo es una tríada `ruta → controller → modelo`,
montada bajo `/api` (ver `config/routes.js`). Audita uno por uno. Las capas **transversales**
(middleware, utils, config, esquema, migraciones) se auditan aparte porque las consume todo.

Ruta base de todo: `Server/` · Arranque: `scripts/dent.js` (Express + conexión Mongo + montaje de rutas).

## Módulos (por dominio/recurso)

| # | Módulo | Ruta API | Entrada | Archivos | LOC | Qué hace |
|---|--------|----------|---------|---------:|----:|----------|
| 1 | **patients** | `/api/patients` | `controllers/patientsController.js` | 3 | 4189 | Núcleo del expediente: alta/validación, ficha, notas de evolución, plan de tratamiento, HC/consentimiento, derechos ARCO |
| 2 | **periodontogram** | `/api/periodontograms` (+ `/patients/:id/periodontogram`) | `controllers/periodontogramController.js` | 4 | 1792 | Mediciones, versiones (`periodontogram_history`), normalización del esquema |
| 3 | **odontograma** | `/api/patients/:id/odontograma-*` (anidado) | `controllers/odontogramaController.js` | 4 | 1674 | Odontograma inicial y clínico + versionado (`odontograma_history`) |
| 4 | **appointments** | `/api/appointments` | `controllers/appointmentController.js` | 3 | 1249 | Agenda/citas, estados e historial de la cita |
| 5 | **cash** | `/api/cash` | `controllers/cashController.js` | 4 | 1062 | Caja: apertura/cierre de sesión, movimientos |
| 6 | **patient-charges** | `/api/patient-charges` | `controllers/patientChargeController.js` | 3 | 782 | Cargos del paciente y pendientes de cobro |
| 7 | **audit** | `/api/audit` | `controllers/auditController.js` | 3 | 765 | Log inmutable (NOM-024) + verificación de integridad/cadena |
| 8 | **stats** | `/api/stats` | `controllers/statsController.js` | 2 | 763 | Agregaciones y estadísticas clínicas/de caja |
| 9 | **drafts** | `/api/drafts` | `controllers/draftController.js` | 2 | 722 | Centro de firmas: flujo BORRADOR→OFICIAL, firma en lote |
| 10 | **settings** | `/api/settings` | `controllers/settingsController.js` | 3 | 692 | Config de clínica, perfil profesional, firma digital, logo |
| 11 | **auth** | `/api/auth` (público) | `controllers/authController.js` | 2 | 675 | Login, refresh, PIN, Modo Cortina |
| 12 | **users** | `/api/users` | `controllers/usersController.js` | 3 | 645 | Gestión de cuentas, roles y permisos |
| 13 | **google** | `/api/google` (público) | `routes/googleRoutes.js` | 1 | 418 | OAuth2 Google + sincronización de calendario (sin controller dedicado) |
| 14 | **exams** | `/api/exams` | `controllers/examController.js` | 3 | 343 | Exámenes clínicos |
| 15 | **attachments** | `/api/patients/:id/attachments` | `controllers/attachmentController.js` | 3 | 269 | Adjuntos del paciente (subida/listado) — montado ANTES de patientRoutes |
| 16 | **note-templates** | `/api/note-templates` | `controllers/noteTemplateController.js` | 3 | 249 | Plantillas de notas de evolución (Anti-Olvidos) |
| 17 | **signing** | `/api/sign` | `controllers/signingController.js` | 2 | 234 | Firma electrónica con PIN — transversal (firma patient/exam/receta/tratamiento/periodonto/odonto) |

## Transversal (auditar aparte)

| Carpeta | Archivos | LOC | Qué contiene |
|---------|---------:|----:|--------------|
| `middlewares/` | 11 | 1238 | `authenticate`/`authorize` (RBAC), `auditLogger` (NOM-024), `snapshotCapture` (diff), `capturaExtemporanea`, `rateLimiter`, `uploadFirma`/`uploadLogo`/`uploadsAuth`, `checkPatient`, `periodontogramValidation` |
| `utils/` | 16 | 3005 | `UniversalToothValidator` (1116), integridad/firma (`integrity`, `signing`, `crypto`, `saveSignatureImage`, `imageSignature`, `signature-invalidation`), `permissions` (408), `periodontogramAdaptors`/`periodontogramData`, `ensureIndexes`, `fileMagicBytes`, `hcConsent`, `logger`, `uploads`, `appointmentValidation` |
| `config/` | 4 | 599 | `db` (conexión Mongo), `routes` (montaje `/api`), `periodontogram-config` (336), `patientValidation` |
| `schemas/` | 1 | 301 | `unified-periodontogram-schema` (esquema unificado del periodontograma) |
| `helpers/` | 1 | 59 | `odontograma` (helper de armado) |
| `migrations/` | 4 | 347 | `0001`–`0004` (re-sellado de hashes, limpieza, backfills). Ver `MIGRACIONES_PENDIENTES.md` |
| `scripts/` | 4 | 729 | `dent.js` (arranque del server, 398), `audit-legacy-users.js`, `findPatientDuplicates.js`, `fixArchivedVersionNames.js` |

## Notas para auditar

- **Más grande primero**: patients (4189), periodontogram (1792), odontograma (1674), appointments (1249), cash (1062) — son los de mayor riesgo.
- **patients** es el núcleo: embebe notas de evolución, plan de tratamiento y HC/consentimiento. **odontograma** va **anidado** bajo `/api/patients/:id`; audítalos juntos o en ese orden.
- **Modelos sin módulo propio**: `models/prescription.js` (71) y `models/treatment.js` (73) no tienen controller/ruta dedicados — se consumen desde **patients** y **signing**; audítalos con ellos.
- **`signing`** es transversal: firma varios `resourceType` (patient/exam/receta/tratamiento/periodonto/odonto) vía `utils/signing` + `utils/integrity`. Al auditar cualquier módulo clínico, mira también su ruta de firma.
- **Capas transversales** las toca todo: al auditar un módulo, revisa `authorize` (permisos, `roles.MD`), `auditLogger` (NOM-024) e integridad/firma.
- **Endpoints utilitarios** en `config/routes.js`: `/api/health` y `/api/metrics` (solo en desarrollo).
- **Datos = 17 modelos** (3656 LOC) repartidos por dominio; cada módulo lista su(s) modelo(s) en el conteo de Archivos/LOC.
