# Auditoría Técnica Integral de Dentia Core

**Objetivo:** dejar la versión V1 (instalación local, un solo cliente) lista para producción, e identificar (sin implementar) qué deberá adaptarse para una futura V2 SaaS multi-tenant.

**Metodología:** auditoría en 8 fases usando como fuente principal el grafo de código indexado (`codebase-memory-mcp`, proyecto `Users-arleyramirezzz-Downloads-DentiaCore`, 3948 nodos / 8569 aristas), abriendo archivos completos solo para confirmar hallazgos puntuales. Este documento se llena de forma incremental, una fase por sesión de trabajo.

**Rama de trabajo:** `fix/auditoria-backend`. Ver también la memoria de sesiones previas (`auditoria-frontend-backend`) — 47 edge-cases y varios críticos de seguridad ya fueron encontrados y corregidos antes de esta auditoría; esta ronda no debe re-reportarlos salvo que se compruebe que la corrección no sigue vigente en el código actual.

**⚠️ Limitación metodológica conocida (aplica a todas las fases restantes):** el extractor de llamadas HTTP del indexador (`codebase-memory-mcp`, herramienta externa de Claude Code — binario compilado de ~268MB en `~/.local/bin/codebase-memory-mcp`, NO parte del repo de Dentia Core, compartida por todos los proyectos del usuario) detecta la arista `HTTP_CALLS` de forma inconsistente: en `Client/src/shared/services/`, algunos archivos quedan completamente indexados (`patient-service.js`) mientras que otros con código sintácticamente idéntico (`import API from './axios-instance'` + `const response = await API.get(...)`) no generan ninguna arista (`cashService.js`, `appointment-service.js`, `AuthContext.jsx`). Se confirmó que **no es un problema del código de Dentia Core** (comparación línea a línea entre archivos detectados y no detectados, sin diferencia relevante) ni de un índice desactualizado (reindexado forzado con `force=true` solo recuperó 1 de ~19 aristas faltantes). Se intentó además inyectar las aristas faltantes manualmente vía `ingest_traces`, pero la propia herramienta reporta esa función como no implementada (`"Runtime edge creation from traces not yet implemented"`). **No se intentará arreglar el indexador**: es una herramienta externa y de alcance global (no versionada en este repo); parchearla sería un proyecto aparte, de alto riesgo (recompilar y redesplegar un binario de 268MB usado por todos los proyectos del usuario) y sin relación con dejar Dentia Core listo para producción. **Consecuencia práctica para las fases 2-8:** las aristas `HTTP_CALLS`/`HANDLES` del grafo deben tratarse como una señal parcial, no exhaustiva — la ausencia de una arista NO implica código muerto ni ruta huérfana; todo hallazgo de "flujo roto" debe confirmarse siempre por lectura directa del código antes de reportarse como real.

---

## Fase 1 — Mapa General

### Resumen ejecutivo

Dentia Core es un sistema clínico dental (historia clínica electrónica) compuesto por dos aplicaciones separadas: un backend Node.js/Express con MongoDB/Mongoose (`Server/`) y un frontend React/Vite (`Client/src/`), más un conjunto disperso de scripts operativos (backups, migraciones, administración) tanto dentro de `Server/scripts/` como en la raíz del repositorio. El dominio cubre pacientes, citas, odontograma, periodontograma, caja/finanzas, estadísticas, firma digital/no-repudio y auditoría tipo NOM-024, lo que sitúa al proyecto en la categoría de software clínico con requisitos de integridad y trazabilidad legal (hashes de integridad, cadenas de firma, auditoría de acceso).

En tamaño, el grafo indexado reporta 3960 nodos y 8580 aristas sobre 380 archivos totales (204 bajo `Client/src`, el resto en `Server/` y raíz), con 1189 funciones, 279 métodos, 232 rutas Express y 16 clases. El backend concentra 16 controllers (11054 líneas), 17 modelos, 17 archivos de rutas y 17 utilidades; el frontend organiza 12 dominios funcionales bajo `features/` más una capa `shared/` de 11 subcarpetas de reuso (servicios API, validadores, hooks, contexts, estilos).

La organización a alto nivel es coherente en sus grandes bloques: `Server/config/routes.js` centraliza el montaje de 14 sub-routers con un orden de middlewares global bien definido (rutas públicas → healthcheck → `authenticate` → `auditLogger` → `snapshotCapture` → captura extemporánea → routers de dominio), y en el frontend `App` (`Client/src/app/app.jsx`) es el único punto que define rutas, con el estado de sesión centralizado en Context API (`AuthContext`) sin librería de store externa. La dirección de dependencia `shared/ → features/` se confirmó como correcta (0 aristas `IMPORTS` en sentido inverso).

La primera impresión de salud arquitectónica, basada exclusivamente en la evidencia de los cuatro reportes, es mixta. Por un lado hay señales positivas: ausencia de dependencias circulares de imports detectadas (0 ciclos de 2 y 3 nodos), una capa de ensamblaje de rutas/middlewares única y clara, y buena separación shared/features en el frontend. Por otro lado, hay señales de deuda estructural recurrentes: ausencia total de una capa de servicios en el backend (los controllers llaman directo a Mongoose y concentran lógica de negocio), un god-object confirmado (`patientsController.js`, 2579 líneas) que orquesta 5+ modelos desde el controller, varios "god components" de React por encima de 900 líneas y 60+ puntos de complejidad ciclomática, duplicación de lógica entre controllers y entre Client/Server (incluida una clase completa de validación clínica replicada byte-a-byte), y una limitación relevante del propio grafo indexado que dejó varias cadenas HTTP cliente→ruta sin resolver (citas, caja, login) — hallazgo que se documenta explícitamente como limitación de la herramienta, no como código muerto real.

Es importante remarcar, como nota metodológica heredada de los cuatro reportes, que varias aristas del grafo (`HANDLES`, `WRITES`, `CALLS`/`USAGE` sobre ciertos patrones CommonJS/Express) tienen cobertura incompleta y fueron verificadas puntualmente con `grep`/lectura directa de archivos donde fue posible. Los hallazgos de esta fase distinguen explícitamente entre lo confirmado por grafo + verificación manual (alta confiabilidad) y lo que queda como ambigüedad de indexado (señalado como tal, no presentado como certeza).

### Módulos y capas

| Carpeta/módulo | Responsabilidad | Capa |
|---|---|---|
| `Server/scripts/dent.js` | Entry point real de la aplicación (`app.listen`) | Entrada |
| `Server/config/routes.js` | Agregador central de 14 sub-routers, montaje de middlewares globales (`authenticate`, `auditLogger`, `snapshotCapture`, `capturaExtemporanea`) | Entrada/API (ensamblaje) |
| `Server/config/db.js` | Conexión Mongoose con retry/backoff exponencial | Datos (infraestructura) |
| `Server/routes/*.js` (17 archivos) | Definición de endpoints Express por dominio | API |
| `Server/controllers/*.js` (16 archivos, 11054 líneas) | Lógica de negocio, validación y orquestación — actúa también como capa de servicio de facto (no existe `services/`) | Dominio (+ datos, mezclado) |
| `Server/models/*.js` (17 archivos) | Esquemas Mongoose | Datos |
| `Server/middlewares/*.js` (11 archivos) | Auth, autorización, rate limiting, uploads, auditoría, validación de negocio — mezclados en carpeta plana sin subcarpetas por tipo | Entrada/API (transversal) |
| `Server/helpers/odontograma.js` | Único helper de dominio odontograma, solapamiento conceptual no aclarado con `utils/` | Dominio |
| `Server/utils/*.js` (17 archivos) | Criptografía, permisos, validadores, firma, magic bytes, etc. | Compartido (backend) |
| `Server/schemas/unified-periodontogram-schema.js` | Esquema unificado de periodontograma | Dominio/Datos |
| `Server/migrations/*.js` (4 migraciones + README) | Backfills y re-sellado de hashes de integridad | Datos (mantenimiento) |
| `Server/tests/*.js` (20 archivos, mezcla `.test.js`/`.script.js`/`.check.js`) | Pruebas automatizadas y scripts de verificación manual | Calidad/soporte |
| `scripts/` (raíz del repo) + sueltos (`create-admin.js`, `list-users.js`, `set-pin.js`) | Backups, migración, auditoría legacy, administración — duplica en cierta forma el rol de `Server/scripts/` | Operación/DevOps |
| `Client/src/app/` | Entry point Vite/React, definición de rutas (`app.jsx`), sesión global (`auth/AuthContext.jsx`, `ProtectedRoute.jsx`, `permissions.js`) | Entrada |
| `Client/src/features/*` (12 dominios) | Vistas y lógica de UI por dominio de negocio | Dominio (frontend) |
| `Client/src/shared/services/*` (10 archivos) | Clientes API (axios) por dominio | API (consumo) |
| `Client/src/shared/components/, contexts/, hooks/` | Componentes, contexts y hooks transversales de UI | Compartido (frontend) |
| `Client/src/shared/validators/universal-tooth-validator.js` | Validación clínica dental + logger/cache interno de facto | Dominio/Compartido (mal ubicado semánticamente, ver hallazgos) |
| `Client/src/shared/lib/wacom-stu/` | Driver WebHID para tableta de firma | Compartido (integración de hardware) |
| `Client/src/shared/styles/`, `schemas/`, `config/`, `stats/` | CSS global, esquema unificado, config de periodontograma, motor de estadísticas periodontales | Compartido |
| `Client/src/tests/` | 4 suites de integración + mocks | Calidad/soporte |

### Dominios funcionales identificados

| Dominio de negocio | Archivos backend relacionados | Archivos frontend relacionados |
|---|---|---|
| Autenticación / sesión | `controllers/authController.js` (564 líneas), `models/users.js`, `routes/authRoutes.js`, `routes/googleRoutes.js`, `middlewares/authenticate.js`, `middlewares/authorize.js` (in_degree=16), `utils/crypto.js`, `utils/permissions.js` | `features/auth/LoginPage.jsx`, `app/auth/AuthContext.jsx`, `app/auth/ProtectedRoute.jsx`, `app/auth/permissions.js` |
| Pacientes | `controllers/patientsController.js` (2579 líneas), `models/patient.js`, `routes/patientRoutes.js`, `middlewares/checkPatient.js`, `config/patientValidation.js`, `utils/hcConsent.js` | `features/patient-list/patient-list.jsx`, `features/patient-detail/patient-detail.jsx` (927 líneas), `features/add-patient/*` (8 secciones), `shared/services/patient-service.js` |
| Citas (appointments) | `controllers/appointmentController.js` (1101 líneas), `models/appointment.js`, `routes/appointmentRoutes.js`, `utils/appointmentValidation.js` | `features/consultas/ConsultasPage.jsx` (887 líneas), `features/main-page/components/calendar.jsx` (985 líneas), `shared/services/appointment-service.js` |
| Odontograma | `controllers/odontogramaController.js` (1226 líneas), `models/odontograma.js`, `models/odontogramaHistory.js`, `routes/odontogramaRoutes.js`, `helpers/odontograma.js`, `utils/UniversalToothValidator.js`, `utils/periodontogramAdaptors.js` | `features/odontogram/api/odontograma-service.js`, `components/odontogram-clinical-section.jsx` (710 líneas), `odontogram-initial-section.jsx`, `utils/odontogram-utils.js` |
| Periodontograma | `controllers/periodontogramController.js` (983 líneas), `models/periodontogram.js`, `models/periodontogramHistory.js`, `routes/periodontogramRoutes.js`, `schemas/unified-periodontogram-schema.js`, `utils/periodontogramData.js`, `middlewares/periodontogramValidation.js`, `config/periodontogram-config.js` | `features/periodontogram/periodontogram-design.jsx` (1116 líneas), `statistics-panel.jsx`, `hooks/use-periodontogram-linear-graphics.js`, `shared/services/periodontogram-service.js` |
| Caja / finanzas | `controllers/cashController.js` (787 líneas), `controllers/patientChargeController.js` (567 líneas), `models/cashMovement.js`, `boxSession.js`, `patientCharge.js`, `routes/cashRoutes.js`, `patientChargeRoutes.js` | `features/cash/*` (CashPage, CashDashboard, ActionsPanel, MovementsList, OpenBoxModal, PendingChargesPanel), `shared/services/cashService.js`, `patientChargeService.js` |
| Estadísticas | `controllers/statsController.js` (722 líneas), agrega sobre varios modelos, `routes/statsRoutes.js` | `features/statistics/StatisticsPage.jsx`, `components/ChartRenderer.jsx`, `data/statsService.js` |
| Exámenes / recetas / notas / borradores | `controllers/examController.js`, `noteTemplateController.js`, `draftController.js` (695 líneas), `models/exam.js`, `prescription.js`, `noteTemplate.js`, `treatment.js`, `routes/examRoutes.js`, `noteTemplateRoutes.js`, `draftRoutes.js`, `utils/signing.js`, `utils/signature-invalidation.js` | `features/consultas/DraftsCenter.jsx` (246 líneas), `shared/hooks/useDraftPersistence.js` |
| Firma / integridad / no-repudio | `controllers/signingController.js` (194 líneas), `routes/signingRoutes.js`, `utils/integrity.js`, `utils/crypto.js`, `utils/saveSignatureImage.js`, `utils/imageSignature.js`, `utils/fileMagicBytes.js` (in_degree=36) | `shared/hooks/useSignRecord.js`, `shared/components/SignaturePadModal.jsx`, `DoctorSignStep.jsx`, `SignatureBadge.jsx`, `shared/lib/wacom-stu/` |
| Auditoría (NOM-024) | `controllers/auditController.js` (417 líneas), `models/auditLog.js`, `routes/auditRoutes.js`, `middlewares/auditLogger.js`, `snapshotCapture.js`, `capturaExtemporanea.js` | `features/audit/` (solo CSS, sin componente propio — ver hallazgos), `shared/services/auditService.js`, consumido desde `settings/sections/TraceabilitySection.jsx` |
| Adjuntos / uploads | `controllers/attachmentController.js` (121 líneas), `models/patientAttachment.js`, `routes/attachmentRoutes.js`, `middlewares/uploadFirma.js`, `uploadLogo.js`, `uploadsAuth.js`, `utils/uploads.js` | `shared/services/attachmentService.js` |
| Usuarios / permisos | `controllers/usersController.js` (336 líneas), `models/users.js`, `routes/userRoutes.js`, `utils/permissions.js` | `features/settings/sections/` (cuentas/permisos) |
| Configuración clínica | `controllers/settingsController.js` (466 líneas), `models/clinicSettings.js`, `routes/settingsRoutes.js` | `features/settings/SettingsPage.jsx`, `SettingsSection.jsx`, 14 `sections/*`, `shared/services/settingsService.js` |
| Rate limiting / anti-abuso | `middlewares/rateLimiter.js` (globalLimiter, botGuard, keyByIpAndUser), aplicado en `dent.js` | — |

### Dependencias clave

**Backend — mayor fan-in:**
- `utils/fileMagicBytes.js::startsWith` — in_degree=36 (la función más reusada de todo Server).
- `middlewares/authorize.js::authorize` — in_degree=16 (middleware transversal, usado como referencia en casi toda ruta protegida vía `router.get('/x', authorize([...]), handler)`, no como `CALLS` directa).
- `utils/permissions.js::normalizeRole` — in_degree=7.
- `middlewares/auditLogger.js` — in_degree=3, cognitive=31.

**Backend — mayor fan-out (funciones individuales, controllers):**
- `draftController.js::batchSign` — out_degree=14, complexity=23, cognitive=80.
- `draftController.js::signDraft` — out_degree=14, complexity=19, cognitive=43.
- `usersController.js::createUser` — out_degree=12, complexity=12, cognitive=26.
- `odontogramaController.js::saveClinicalHistoryEntries` — out_degree=12, complexity=20, cognitive=55.
- `usersController.js::updateUser` — out_degree=10, complexity=23, cognitive=51.
- `authController.js::respondWithTokens` — out_degree=10 (complexity/cognitive reportados en 0, anotado como posible artefacto del extractor).
- `Server/config/routes.js::configureRoutes` — out_degree=22 (esperado, es el único punto de ensamblaje de rutas).

**Frontend — mayor fan-in:**
- `shared/validators/universal-tooth-validator.js` — `error` in_degree=214/156 según la consulta (ambos reportes coinciden en que la cifra exacta varía pero es, en cualquier caso, la más alta del frontend), `log` in_degree=65 (`self_recursive=true`), `warn` in_degree=52, `StatisticsCache.get` in_degree=84, `StatisticsCache.set` in_degree=37. Nota de fiabilidad: es un logger interno de un solo archivo, no una utilidad cross-módulo — el fan-in real de "blast radius" externo es menor al que sugiere la cifra bruta.
- `shared/services/periodontogram-service.js::exists` — in_degree=30/24 según el reporte (discrepancia menor entre reportes, señalada como tal), utilidad central legítima.
- `app/auth/AuthContext.jsx::useAuth` — in_degree=18-19 según el reporte, consumido por `Header`, `Sidebar`, `PatientDetail`, `SettingsPage` y 6 secciones de settings, `DraftsCenter`, `LoginPage`, `ProtectedRoute`, `useSessionKeepAlive`, `LockScreenProvider`, entre otros.
- `shared/services/settingsService.js::getSettings` — in_degree=16.
- `shared/lib/wacom-stu/index.js::start` — in_degree=15.

**Frontend — mayor fan-out (god components):**
- `PatientDetail` (`features/patient-detail/patient-detail.jsx`) — out_degree=44 (el mayor de todo el frontend), complexity=65, cognitive=119, 927 líneas.
- `PatientPrintPage` (`features/patient-detail/PatientPrintPage.jsx`) — out_degree=34, complexity=39, cognitive=67, 435 líneas.
- `PeriodontogramDesign` (`features/periodontogram/periodontogram-design.jsx`) — out_degree=32, complexity=79, cognitive=134, 1116 líneas (archivo más largo de `Client/src`).
- `PeriodontogramSection` (`features/patient-detail/components/periodontogram-section.jsx`) — out_degree=28, complexity=97 (la más alta medida), cognitive=185 (la más alta medida), 927 líneas.
- `OdontogramClinicalSection` — out_degree=21, complexity=62, cognitive=118, 710 líneas.
- `Calendar` (`main-page/components/calendar.jsx`) — out_degree=21, complexity=75, cognitive=121, 985 líneas.
- `ConsultasPage` — out_degree=21, complexity=45, cognitive=64, 887 líneas.

### Flujos principales (Frontend → API → Backend → Base de Datos)

1. **Pacientes — lectura por ID (cadena completa confirmada).** `Client/src/shared/services/patient-service.js::getPatientById` —`HTTP_CALLS`→ `url_path=/patients/:id` → `Server/routes/patientRoutes.js:208` (`router.route('/:id').get(...)`) → `patientCtrl.getPatientById` (`Server/controllers/patientsController.js`) → modelo `Patient` (`Server/models/patient.js`), vía `IMPORTS` del archivo del controller. (El alta de paciente, `POST /patients` en `patientRoutes.js:186` → `patientCtrl.createPatient`, se documentó por lectura de código/convención de rutas, sin arista `HTTP_CALLS` confirmada para esa función específica en el cliente.)

2. **Odontograma inicial — crear/consultar.** `Client/src/features/odontogram/api/odontograma-service.js::checkInitialOdontogram`/`saveInitialOdontogram` —`HTTP_CALLS`→ `url_path=/patients/:patientId/odontograma-inicial` → `Server/routes/odontogramaRoutes.js:63` (montado anidado bajo `/:id` en `patientRoutes.js:459`) → `verificarOdontogramaInicial`/`guardarOdontogramaInicial` (`Server/controllers/odontogramaController.js`) → modelos `OdontogramaModel` (`models/odontograma.js`) y `OdontogramaHistory` (`models/odontogramaHistory.js`), vía `IMPORTS`.

3. **Periodontograma — guardar datos clínicos.** `Client/src/shared/services/periodontogram-service.js::saveData` —`HTTP_CALLS`→ `url_path=/patients/:patientId/periodontogram/data` → `Server/routes/periodontogramRoutes.js:68` (montado en `patientRoutes.js:513`) → `periodontogramController.savePeriodontogramData` → modelos `Patient`, `Periodontogram`, `PeriodontogramHistory`, vía `IMPORTS`, con capa de validación previa (`utils/UniversalToothValidator`, `utils/periodontogramAdaptors`, `schemas/unified-periodontogram-schema`).

4. **Autenticación — login.** `Client/src/features/auth/LoginPage.jsx` → (llamada real vía `AuthProvider`, sin arista `HTTP_CALLS` indexada — ver flujos rotos) → `Server/routes/authRoutes.js:65-73` (`POST /auth/login`, montado público antes de `authenticate` global) → `authController.login` (`authController.js:142-207`) → modelos `Usuario` (`models/users.js`) y `ClinicSettings` (`models/clinicSettings.js`), vía `IMPORTS`; usa además `utils/crypto.js`, `middlewares/auditLogger.js`.

5. **Configuración de la clínica (settings).** `Client/src/shared/services/settingsService.js::getSettings`/`updateSettings` —conectado vía arista atípica `HANDLES`→ `Server/routes/settingsRoutes.js:72-78` (`GET /` y `PATCH /`, montado en `/settings`) → `settingsController.getSettings`/`updateSettings` → modelos `ClinicSettings`, `Usuario`, `AuditLog`, vía `IMPORTS`; usa `utils/uploads.js`, `utils/crypto.js`.

6. **Firma / auditoría de integridad (cadena end-to-end verificada, dominio adicional).** `Client/src/shared/hooks/useSignRecord.js::useSignRecord` —`HTTP_CALLS`→ `url_path=/sign/:resourceType/:resourceId` → `Server/routes/signingRoutes.js` (`POST /:resourceType/:resourceId`, con `authorize`) → `Server/controllers/signingController.js` (handler específico no confirmado línea a línea — ambigüedad señalada) → modelo(s) no verificados en esta pasada (pendiente para Fase 2/3).

### Señales preliminares para fases siguientes

*A confirmar en Fase 2/3 — Fase 1 es solo mapeo, no juicio de severidad.*

**Código muerto / huérfano (candidatos, verificados con grep además de grafo):**
- `isPermanentTooth`, `isTemporaryTooth`, `getToothQuadrant`, `validateMeasurement` en `Server/config/periodontogram-config.js` (fan-in=0, sin consumidores en Server+Client).
- `getDefaultToothData` en `Server/config/periodontogram-config.js` — posible duplicado homónimo de `Server/schemas/unified-periodontogram-schema.js:135/204`, requiere lectura puntual antes de concluir si está muerta o es duplicación.
- `convertISOToDDMMYYYY` (`Client/public/js/dateUtils.js`, motor legacy), `getIndicatorColor` (`Client/src/shared/config/periodontogram-config.js`), `getCacheStats` (`universal-tooth-validator.js`).
- `verifyIntegrity`, `getAuditTimeline` (`Client/src/shared/services/auditService.js`) — exportadas sin consumo en UI.
- 9 funciones específicas de `Client/src/features/statistics/data/statsService.js` (`fetchTotalRevenue`, `fetchCashboxPerformance`, etc.) — huérfanas tras refactor hacia `fetchMetricData` genérico.
- `getInitialOdontogramImageUrl`, `getInitialOdontogramHistory` (`odontograma-service.js`).
- `isSupported`, `isConnected`, `getDeviceInfo` del driver Wacom — confiabilidad media, podrían ser API pública pensada para consumo futuro.

**Duplicación funcional (jaccard≈1.000, alta confiabilidad):**
- `isStandaloneTxError` copiado en 4 controllers (`patients`, `periodontogram`, `odontograma`, `appointment`).
- Módulo completo `UniversalToothValidator`/`StatisticsCache` duplicado byte-a-byte entre `Client/src/shared/validators/` y `Server/utils/UniversalToothValidator.js` — mayor severidad de duplicación detectada.
- `generateDefaultVersionName` duplicado entre `periodontogramController` y `odontogramaController`.
- Handlers de multer (`destination`, `handleMulterError`) duplicados entre `uploadFirma.js`/`uploadLogo.js` (y posibles copias adicionales en rutas).
- Utilidad de formateo de fecha/hora reimplementada 4 veces (`CashDashboard`, `CashHistorySection` x2, `ConsultasPage`).
- Lógica de inicialización y `useOdontogramSetup` duplicada entre `patient-detail.jsx` y `PatientPrintPage.jsx`.
- Componentes de sección de paciente casi idénticos (`PatientContactInfo`~`PatientDocumentInfo` jaccard=0.984; `PatientEmergencyContacts`~`PatientFamilyHistory` jaccard=1.000).

**Acoplamiento oculto (vía `FILE_CHANGES_WITH`, historial git) y excesivo (fan-out/fan-in):**
- `draftController.js` acoplado a `models/patient.js` (0.80, 4 co-cambios) y a `patientsController.js` (0.80, 4 co-cambios) — el dominio de borradores/firma no parece estar aislado del dominio de pacientes.
- `install.ps1` ↔ `launcher.py` (0.38, 3 co-cambios) — posible falta de fuente única de verdad entre instalador y launcher.
- `patient-evolution-note.jsx` (Client) acoplado por historial git a `models/patient.js` y `patientsController.js` (Server) — indicio de contrato de datos sin capa de adaptación estable entre Client y Server.
- `patientsController.js` ↔ `models/patient.js`: coupling=1.00 con 8 co-cambios, el más alto del repo.
- God-object confirmado: `patientsController.js` (2579 líneas, ~21x el controller más pequeño), con 15+ funciones auxiliares no exportadas que orquestan 5 modelos distintos (`runCascade` sobre `Appointment`, `Odontograma`, `Periodontogram`, `PatientCharge`, `PatientAttachment`).
- Ausencia de carpeta `services/` en el backend — lógica de negocio inline en controllers.
- God components de React por fan-out: `PatientDetail` (44), `PatientPrintPage` (34), `PeriodontogramDesign` (32), `PeriodontogramSection` (28, con la mayor complexity=97 y cognitive=185 medidas).

**Flujos rotos / ambiguos (limitación confirmada del indexador, NO bug de producto):**
- `appointment-service.js` (8 funciones), `cashService.js` (10 funciones) y `AuthContext.jsx::AuthProvider` (login/logout/me) sin arista `HTTP_CALLS`, pese a que el backend expone y sirve esas rutas correctamente. **Investigado y cerrado (no accionable):** se comparó el código de estos archivos contra `patient-service.js` (que sí quedó indexado) y son sintácticamente idénticos (`import API from './axios-instance'` + `const response = await API.get(...)`) — no hay ningún patrón de código a corregir. Se forzó un reindexado completo (`index_repository force=true`): solo recuperó 1 de ~19 aristas faltantes. Se intentó reparar el grafo manualmente vía `ingest_traces`: la propia herramienta respondió `"Runtime edge creation from traces not yet implemented"`. Conclusión: es una limitación del extractor de la herramienta de indexado (`codebase-memory-mcp`), sin mecanismo de corrección disponible hoy. No requiere ni admite acción sobre el código de Dentia Core.
- Arista `HANDLES` no captura de forma sistemática Route→Controller de negocio (solo ~6 de 132 aristas apuntan a controllers reales); el resto son middlewares/rate-limiters/routers padre.
- 232 nodos `Route` sintéticos sin `file_path`/`start_line` — sin trazabilidad automática Route→archivo real vía grafo puro.
- `settingsService.js` conectado vía `HANDLES` en vez de `HTTP_CALLS` (inconsistencia de criterio de extracción entre archivos).
- Cobertura parcial no confirmada en `patient-service.js` para `createPatient`/`updatePatient`/`searchPatients`.
- Posibles rutas montadas dos veces: `/patients` GET, `/me` GET, `/settings/me/preferences` PATCH con in_degree=2 en el grafo de rutas — no confirmado como bug, solo señalado.

**Organización / consistencia (menor severidad, candidatas a revisión):**
- Triplicación de "capa de operación": `Server/scripts/`, `scripts/` en raíz del repo, y archivos sueltos (`create-admin.js`, `list-users.js`, `set-pin.js`).
- `middlewares/` plano (11 archivos) mezclando auth, rate limiting, uploads, validación de dominio y auditoría sin subcarpetas.
- `tests/` (Server) mezcla `.test.js`/`.script.js`/`.check.js` sin separación; fuerte concentración de scripts manuales alrededor de periodontograma (9 de 20 archivos).
- `utils/integrity.test.js` vive junto al código fuente, no en `Server/tests/`, rompiendo convención del resto del proyecto.
- `helpers/` (Server) con un solo archivo, posible duplicidad conceptual con `utils/`.
- `features/audit/` (Client) sin componente `.jsx` propio, solo CSS — carpeta posiblemente residual.
- Import cruzado `settings/SettingsPage.jsx` → `main-page/components/calendar.jsx`, y `patient-detail/PatientPrintPage.jsx` → `odontogram/components/*` (dos casos confirmados de acoplamiento feature→feature fuera de `shared/`).

Ningún hallazgo de esta lista implica una acción correctiva en Fase 1; todos quedan abiertos para profundización, priorización de severidad y decisión de remediación en las fases de Calidad de Código y Riesgo (Fase 2/3).

---

## Fase 2 — Arquitectura

### Resumen de la fase

La arquitectura de Dentia Core presenta un patrón consistente y bien documentado de deuda técnica estructural, más que fallos aislados: la ausencia total de una capa de servicios/dominio (`Server/services/` no existe) se repite de forma sistémica en los 6+ controllers grandes del backend y se replica en espejo en el frontend como 7 "god-components" que mezclan fetching, estado, lógica de dominio clínico y renderizado en un mismo archivo. Este patrón no es un accidente puntual: aparece de forma homogénea en `patientsController.js` (2579 líneas), `appointmentController.js` (mayor fan-out de modelos, 9), `draftController.js`, y en el frontend en `patient-detail.jsx` (1078 líneas, out_degree=44) y `periodontogram-section.jsx` (cognitive=185, la más alta del repo). El proceso adversarial de verificación confirmó la evidencia factual de prácticamente todos los hallazgos (líneas, funciones, métricas de complejidad citadas coinciden con el código real), pero ajustó a la baja varias severidades marcadas originalmente como "Crítica", con el argumento recurrente de que se trata de deuda de mantenibilidad y testabilidad genuina, no de vulnerabilidades activas, pérdida de datos confirmada, o bugs ya materializados en producción — con dos excepciones notables donde sí se confirmó impacto ya ocurrido (un `ReferenceError` real en `PatientPrintPage.jsx` por divergencia de código duplicado, y una duplicación algorítmica de detección de colisión de citas que se ejecuta en paralelo en el mismo request).

Un segundo patrón transversal es la duplicación de código como síntoma, no como causa: funciones idénticas byte-a-byte (`isStandaloneTxError` en 4 controllers, `generateDefaultVersionName` en 2, `mapTeethToPlain`/`mapToPlainTeeth` entre controller y modelo, `StatisticsCache` entre Server y Client) existen precisamente porque no hay un lugar natural común donde vivir esa lógica. El caso más grave de este grupo es el cruce de frontera de despliegue: el backend hace literalmente `require('../../Client/src/shared/stats/periodontal-stats-core.cjs')`, acoplando el proceso Node de producción a la estructura de carpetas del frontend.

En cuanto a organización y dependencias, el hallazgo más accionable y de mayor relación impacto/esfuerzo es el de "tests fantasma": de 20 archivos en `Server/tests/`, solo 11 son detectados y ejecutados por Jest/CI; los 9 restantes (`.script.js`/`.check.js`) documentan fixes reales de bugs de producción (guardado de periodontograma, subida de firma) pero nunca corren en `npm test`, dando una falsa sensación de cobertura. Por el lado positivo, se confirmó exhaustivamente (Tarjan sobre 681 aristas de imports) que el proyecto tiene **cero ciclos de imports** en todo el repo — una fortaleza estructural real que vale la pena proteger con una regla de lint.

En total, tras el proceso de verificación adversarial: **9 hallazgos quedan con severidad Alta**, **13 con severidad Media**, **2 con severidad Baja**, **0 hallazgos permanecen en Crítica** (los 3 originalmente marcados Crítica fueron todos ajustados a la baja), **0 hallazgos fueron marcados como REQUIERE_DECISION_DUENO explícitamente** (aunque varias justificaciones señalan que la decisión de invertir o no en la capa de servicios es, de fondo, una decisión de producto/dueño dado el contexto de v1 on-premise de un solo cliente), y **0 hallazgos fueron descartados como FALSO_POSITIVO** — todos los 27 hallazgos recibidos tuvieron su evidencia factual confirmada en algún grado, con ajustes de severidad como principal mecanismo de calibración.

### Hallazgos confirmados

#### Responsabilidades mezcladas / God-objects

**ARQ-01 (Backend) — God-object patientsController.js**
- **Ubicación**: Server/controllers/patientsController.js (2579 líneas, 16 handlers exportados vía `exports.*`, helpers internos no exportados líneas 22-2577)
- **Severidad**: Media (ajustada desde Crítica)
- **Categoría**: Arquitectura - Responsabilidades mezcladas
- **Evidencia**: Una sola función exportada mezcla rutinariamente: validación de input HTTP, reglas de negocio clínico-normativas citadas inline (NOM-004/013/024, `addEvolutionNote` líneas 1222-1625, ~404 líneas), autenticación secundaria vía PIN (`verificarPinDetallado`, línea 1341), autorización, acceso directo a 7 modelos Mongoose, orquestación transaccional cross-modelo (`runCascade`, línea 1152, `Promise.all` sobre 5 colecciones dentro de `deletePatient`), manejo de archivos y construcción de respuestas HTTP (`res.status()` aparece 176 veces). No existe carpeta `Server/services/`.
- **Causa raíz**: El proyecto nunca introdujo una capa de dominio/servicio; cada nueva feature clínica se agregó como más funciones dentro del mismo archivo controller.
- **Impacto**: Testing de reglas clínicas críticas inviable sin levantar Express completo; alto riesgo de regresión normativa al modificar un archivo de 2579 líneas; imposibilidad de reusar lógica (cascada de baja, firma de notas) desde scripts o jobs sin duplicar código.
- **Complejidad de solución**: Alta
- **Recomendación**: Extraer `Server/services/` (PatientService, EvolutionNoteService, PatientDeletionService) que encapsule reglas de negocio y acceso a Mongoose, priorizando `runCascade` y la lógica de firma de `addEvolutionNote`. Aplicar strangler pattern incremental, no refactor masivo. *Nota de verificación: la severidad se ajustó a la baja porque el patrón es la convención uniforme de los 11 controllers del backend (no un defecto aislado de este archivo), y porque existe cobertura de integración real (jest, 25/25 tests pasando) sobre la lógica de firma NOM-013/024 que el hallazgo original describía como "imposible de testear".*

**ARQ-01 (Frontend) — God-components patient-detail.jsx y periodontogram-section.jsx**
- **Ubicación**: Client/src/features/patient-detail/patient-detail.jsx (líneas 150-1076, 1078 líneas) y Client/src/features/patient-detail/components/periodontogram-section.jsx (líneas 47-973, 973 líneas)
- **Severidad**: Alta (ajustada desde Crítica)
- **Categoría**: Arquitectura - Responsabilidades mezcladas
- **Evidencia**: `PatientDetail` mezcla fetching (`Promise.all` líneas 598-627), carga dinámica de 11 scripts legacy no-React, concurrencia optimista (`ODONTOGRAMA_STALE`), una máquina de estados de firma legal de 2 pasos inline (`hcStep`), un modal de revocación de consentimiento de 110 líneas de JSX sin extraer, y eliminación de paciente — todo en 30 useState + 24 useCallback + 5 useEffect (confirmado por grep), sin un solo hook custom compartido. Grafo confirma out_degree=44 (el más alto de Client/src). `PeriodontogramSection` tiene out=28, complexity=97, cognitive=185 (las métricas más altas del repo), con `handleSave` (líneas 566-829, ~264 líneas) siendo lógica de mapeo/transformación de dominio puro ejecutada inline en un componente de presentación.
- **Causa raíz**: No existe capa de hooks de dominio ni de servicios/mappers en el frontend, equivalente a la ausencia de `Server/services/` en el backend — mismo patrón God-object replicado como God-component.
- **Impacto**: Blast radius elevado al modificar cualquier handler (24 useCallback comparten closures y refs); imposible unit-testear `handleSave` o la máquina de estados de firma sin renderizar todo el árbol; cero tests en el repo para estos archivos.
- **Complejidad de solución**: Alta
- **Recomendación**: Extraer hooks de dominio por responsabilidad (`usePatientRecordData`, `useHCConsentFlow`, `usePeriodontogramVersions` + módulo puro `periodontogram-mapper.js`), componentizar modales inline. Priorizar extraer `handleSave` a función pura testeable primero. *Nota de verificación: "Crítica" se reserva normalmente para vulnerabilidades o fallos activos en producción; el impacto aquí es proyectado/probabilístico, lo cual encaja mejor con Alta.*

**ARQ-02 (Frontend) — God-component periodontogram-design.jsx**
- **Ubicación**: Client/src/features/periodontogram/periodontogram-design.jsx (líneas 95-1210, componente de 1116 líneas)
- **Severidad**: Alta
- **Categoría**: Arquitectura - Responsabilidades mezcladas
- **Evidencia**: Mezcla normalización/migración de datos legado (`normalizeFurcaData`, líneas 26-70), lógica de negocio clínica compleja (`updateToothData`, líneas 531-606, con reglas de furca doble/simple), un sistema completo de auto-advance de foco entre inputs (>150 líneas), cacheo manual vía WeakMap, y un `renderCell` de 379 líneas (switch de 9 casos). Grafo confirma complexity=79, cognitive=134, out_degree=32 (2ª complejidad ciclomática más alta del repo). El cálculo de `faceKey` se duplica 4 veces dentro del mismo archivo (líneas 291, 547, 663, 748).
- **Causa raíz**: El componente creció acumulando features sucesivos sin revisar límites de responsabilidad; solo un hook (`usePeriodontogramLinearGraphics`) fue extraído, sin continuidad.
- **Impacto**: `renderCell` es el punto de mayor riesgo de inconsistencia entre las 4 duplicaciones de `faceKey`; el sistema de auto-advance con timers es frágil ante cambios descuidados, afectando la velocidad de captura del personal clínico.
- **Complejidad de solución**: Alta
- **Recomendación**: Extraer un hook `useToothFieldEditor` genérico para el auto-advance/foco, extraer `normalizeFurcaData` y el cálculo de `faceKey` a un módulo puro compartido, descomponer `renderCell` en subcomponentes por tipo de campo (ya existe el patrón en `MeasurementInput`/`MiniInputCell`).

**ARQ-05 (Backend) — addEvolutionNote y helpers internos no testeables**
- **Ubicación**: Server/controllers/patientsController.js, `exports.addEvolutionNote` (líneas 1222-1625) y helpers internos no exportados (líneas 22-2577)
- **Severidad**: Alta
- **Categoría**: Arquitectura - Anti-patrón
- **Evidencia**: `addEvolutionNote` es la función individual más larga del backend (~404 líneas). Confirmadas por grafo funciones internas con nombres y métricas exactas, incluyendo `parseAndValidateBirthDate` (complexity=13, cognitive=38, la más alta) y `savePatientWithRetry`. Ninguna es importable ni testeable de forma aislada porque viven como funciones locales de módulo sin `exports`. `parseAndValidateBirthDate` se reutiliza en 3 puntos (createPatient, createPatients, updatePatient) sin tests unitarios directos.
- **Causa raíz**: El patrón establecido es "todo vive en el controller"; la lógica auxiliar se agregó como función privada del mismo archivo en vez de moverla a un módulo importable.
- **Impacto**: `parseAndValidateBirthDate` (complejidad ciclomática 13, cognitiva 38) maneja reglas no triviales sin tabla de tests dedicada posible; `savePatientWithRetry` maneja condiciones de carrera enterradas sin visibilidad para el equipo.
- **Complejidad de solución**: Media
- **Recomendación**: Extraer las funciones puras sin dependencia de req/res a un módulo de utilidad, consolidando en `Server/config/patientValidation.js` que ya existe y ya es importado por el propio controller (línea 2449) — refactor mecánico de bajo riesgo.

**ARQ-03 (Backend) — batchSign en draftController.js**
- **Ubicación**: Server/controllers/draftController.js, función `batchSign` (líneas 438-594, out_degree=14)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Arquitectura - Responsabilidades mezcladas
- **Evidencia**: Mezcla verificación de PIN con lockout (línea 463), auditoría (línea 465 fire-and-forget, línea 576 con await), resolución polimórfica ad-hoc vía `resolveModel` (línea 532) más una rama especial `NOTE_RESOURCE` (línea 490) que también se duplica en `signDraft` (línea 328) y `reject` (línea 619), cálculo de hash, y mutación directa sin transacción envolvente. Contraste real con `deletePatient`/`runCascade` que sí usa transacción.
- **Causa raíz**: `batchSign` se diseñó como iteración simple sobre `signDraft` sin considerar estrategia transaccional explícita para lotes heterogéneos.
- **Impacto**: Un fallo parcial en firma en lote deja notas parcialmente firmadas, estado clínico ambiguo con implicaciones legales (NOM-004/013); la rama `NOTE_RESOURCE` duplicada en 3 lugares complica extender nuevos tipos de recurso firmable.
- **Complejidad de solución**: Media
- **Recomendación**: Extraer la resolución de "firmable" a un `SigningService` con interfaz uniforme; separar verificación de PIN de la lógica de firma. *Nota de verificación: el propio entorno de despliegue (MongoDB standalone sin replica set) hace que envolver en transacción real no aporte atomicidad adicional hoy; el diseño actual reporta el estado parcial de forma transparente en el array `errores` de la respuesta, no es un fallo silencioso.*

#### Acoplamiento

**ARQ-01 (Acoplamiento) — Contrato de string no tipado sobre notas_evolucion**
- **Ubicación**: Server/controllers/draftController.js (líneas 115-166, 220-260) y Server/controllers/patientsController.js (líneas 1626-1731, 1745-1917) sobre Server/models/patient.js (subdocumento `notas_evolucion`, líneas 534-596)
- **Severidad**: Alta (ajustada desde Crítica)
- **Categoría**: Arquitectura - Acoplamiento
- **Evidencia**: Par de mayor coupling_score del repo (patientsController.js↔models/patient.js, 1.00, 8 co-cambios). El mapeo de campos de `notas_evolucion` se reconstruye a mano en `persistNoteOfficial` (L115-139), `persistNoteRejected` (L148-166), `updateDraftEvolutionNote` (L1701-1709) y `signExistingEvolutionNote` (L1882-1897). El hook `pre('save')` (L778-830) que impone inmutabilidad de notas OFICIAL no se dispara en estas 4 escrituras porque usan `updateOne()`/`$set` posicional.
- **Causa raíz**: Ausencia de un método de dominio encapsulado (`patient.transitionNoteToOfficial()`); cada controller reimplementa el mapeo de campos y decide independientemente si pasar por el hook o evitarlo.
- **Impacto**: Agregar o renombrar un campo de `notas_evolucion` obliga a tocar 4 funciones en 2 archivos sin mecanismo de aviso. Riesgo de mantenimiento futuro real, no vulnerabilidad activa: las 4 rutas ya implementan su propio guard atómico redundante.
- **Complejidad de solución**: Media
- **Recomendación**: Extraer un método de dominio compartido (`PatientEvolutionNotes.transitionToOfficial(...)`/`.reject(...)`) como única vía de escritura para ambos controllers.

**ARQ-02 (Acoplamiento backend) — Ausencia de capa de servicio/repositorio**
- **Ubicación**: Server/controllers/*.js — patientsController (7 modelos), appointmentController (9 modelos, el mayor fan-out del backend), draftController (5), periodontogramController (3), cashController (4)
- **Severidad**: Alta (ajustada desde Crítica)
- **Categoría**: Arquitectura - Acoplamiento
- **Evidencia**: No existe `Server/services/`. Los controllers importan modelos Mongoose directamente vía `require('../models/...')`. `isStandaloneTxError` está duplicada byte-por-byte en exactamente 4 controllers (patientsController:1167, odontogramaController:815, appointmentController:730, periodontogramController:785).
- **Causa raíz**: Decisión arquitectónica temprana (o ausencia de ella) de usar Express controllers como única capa de la aplicación, sin adoptar el patrón repository/service.
- **Impacto**: Cualquier cambio al esquema de un modelo requiere grep manual a través de hasta 5-6 controllers. Cero puntos de inyección de dependencias para mockear acceso a datos en tests unitarios.
- **Complejidad de solución**: Alta
- **Recomendación**: Introducir `Server/services/` con un servicio por agregado; extraer el patrón transacción-con-fallback a `Server/utils/withTransaction.js` y reemplazar las 4 copias. Migrar controller por controller empezando por el de mayor riesgo. *Nota de verificación: se ajustó de Crítica a Alta porque describe un riesgo condicional futuro, no un bug ya manifestado hoy — no hay evidencia de divergencia real ya ocurrida entre los 4 controllers.*

**ARQ-04 (Acoplamiento) — syncCharge duplica invariante de negocio de PatientCharge**
- **Ubicación**: Server/controllers/appointmentController.js (1101 líneas), función interna `syncCharge` (líneas 655-713)
- **Severidad**: Alta
- **Categoría**: Arquitectura - Acoplamiento
- **Evidencia**: `syncCharge` accede y muta `PatientCharge` directamente desde el controller de citas, duplicando a mano la invariante `saldoPendiente = max(0, total - pagado)` que ya vive en un pre-save hook de `PatientCharge`, porque ese hook NO corre en `findOneAndUpdate` (confirmado por comentario del propio código, líneas 671-673). `patientChargeController.js` (líneas 305-328) reimplementa el mismo cálculo manualmente por la misma razón.
- **Causa raíz**: Ausencia de un `ChargeService`/`AppointmentService` que sea dueño de la relación Appointment-PatientCharge.
- **Impacto**: Riesgo de regresión contable: cualquier campo derivado nuevo en `PatientCharge` requiere recordar actualizar el hook Y esta lógica manual. Los try/catch silenciosos en cada rama degradan a warnings en vez de fallar la operación.
- **Complejidad de solución**: Media
- **Recomendación**: Mover la sincronización Appointment→PatientCharge a un servicio de dominio compartido o a un método reutilizable del modelo `PatientCharge`. Auditar los warnings silenciosos para decidir si deben convertirse en fallos duros o en un job de reconciliación asíncrono.

**ARQ-07 (Acoplamiento) — Clúster de coupling en módulo odontograma/periodontograma**
- **Ubicación**: Server/controllers/odontogramaController.js ↔ Server/models/odontograma.js (coupling=1.00, 3 co-cambios); periodontogramController.js ↔ Server/models/periodontogram.js (coupling=1.00, 4 co-cambios); odontogramaController.js ↔ periodontogramController.js (coupling=0.75, 3 co-cambios)
- **Severidad**: Media
- **Categoría**: Arquitectura - Acoplamiento
- **Evidencia**: query_graph sobre FILE_CHANGES_WITH revela este clúster de 3 pares con coupling máximo, más `draftController.js`↔`models/periodontogram.js` (0.75, 3 co-cambios). Mismo patrón estructural que el par patientsController↔patient.js, reforzado por la duplicación ya verificada de `generateDefaultVersionName` e `isStandaloneTxError` entre exactamente estos dos controllers.
- **Causa raíz**: Ausencia de capa de servicio, agravada por duplicación de código entre controllers hermanos que se ven forzados a cambiar juntos (Shotgun Surgery).
- **Impacto**: Un cambio de negocio en el flujo de versionado clínico obliga a coordinar cambios en 2-3 archivos simultáneamente sin garantía estructural de sincronización, en el módulo clínico más regulado del sistema.
- **Complejidad de solución**: Media
- **Recomendación**: Extraer un `ClinicalVersioningService` compartido consumido por ambos controllers.

**ARQ-08 (Acoplamiento/SOLID) — Violación sistémica de DIP**
- **Ubicación**: Contrastado contra la ausencia total de capa de abstracción en los 6+ controllers grandes
- **Severidad**: Media
- **Categoría**: Arquitectura - Dependencias
- **Evidencia**: Ningún controller depende de una interfaz/abstracción de repositorio; todos dependen directamente de la clase concreta de `mongoose.model()`. No es un caso aislado sino la convención uniforme de los 6+ controllers grandes, sin ADR que documente la decisión.
- **Causa raíz**: Decisión implícita, no documentada, de omitir una capa de dominio desde el inicio del proyecto.
- **Impacto**: Escalabilidad organizacional del código: a medida que el equipo crezca o se necesite test unitario real, cada test de lógica de negocio requiere BD real o mocks pesados a nivel de módulo completo.
- **Complejidad de solución**: Alta
- **Recomendación**: No es corregible con un fix puntual; requiere una decisión arquitectónica explícita (ADR) sobre introducir capa de repositorio/servicio incrementalmente o aceptar conscientemente el trade-off actual.

#### Duplicación

**ARQ-DUP-01 — UniversalToothValidator/StatisticsCache duplicados con API ya divergente**
- **Ubicación**: Server/utils/UniversalToothValidator.js (1116 líneas) vs Client/src/shared/validators/universal-tooth-validator.js (374 líneas)
- **Severidad**: Alta
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: `StatisticsCache` es idéntica línea por línea entre ambas copias. La matemática core ya está unificada en `periodontal-stats-core.cjs`, pero el Server literalmente escribe `require('../../Client/src/shared/stats/periodontal-stats-core.cjs')` (línea 24) — el proceso Node de producción importa un archivo físicamente ubicado bajo `Client/src/`. Las APIs ya divergieron: Server expone 14 métodos estáticos, Client 9, con 5 métodos exclusivos de Server y 2 exclusivos de Client. `calculateStatistics` ya difiere en comportamiento.
- **Causa raíz**: Copy-paste de un mismo diseño conceptual sin extraer un paquete compartido real; un esfuerzo de dedup previo unificó solo la matemática pero dejó la superficie de validación a medias.
- **Impacto**: Un fix a una regla de validación clínica debe aplicarse en 2 lugares con APIs ya distintas. El `require` cruzando a `Client/src/` acopla el backend a la estructura de carpetas del frontend.
- **Complejidad de solución**: Alta
- **Recomendación**: Extraer un único paquete de validación (shared/ en la raíz con paths relativos estables, no un require cruzando Server→Client/src) con una sola API, decidiendo cuál set de métodos es la fuente de verdad.

**ARQ-DUP-02 — isStandaloneTxError duplicada en 4 controllers**
- **Ubicación**: Server/controllers/patientsController.js (~L1167), periodontogramController.js (~L785), odontogramaController.js (~L815), appointmentController.js (~L730)
- **Severidad**: Alta
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Función idéntica byte-a-byte (SIMILAR_TO=1.000) redefinida en los 4 controllers más grandes del backend, decidiendo si degradar `session.withTransaction` a escritura sin sesión en modo standalone.
- **Causa raíz**: No existe capa `Server/services/` ni módulo utils compartido para lógica transversal de manejo de transacciones Mongo.
- **Impacto**: Si la detección de "standalone" necesita cubrir un código de error adicional y se corrige en 3 de 4 controllers, el cuarto seguirá fallando con error no controlado en producción. Cubre el núcleo clínico y de agenda del sistema. No existe ningún test que cubra esta función.
- **Complejidad de solución**: Baja
- **Recomendación**: Extraer a `Server/utils/mongoErrors.js` y reemplazar las 4 definiciones inline por un import — cambio mecánico de bajo riesgo.

**ARQ-DUP-07 — findConflict/findPatientConflict duplicados, mismo request**
- **Ubicación**: Server/controllers/appointmentController.js líneas 67-94 (findConflict) vs líneas 99-121 (findPatientConflict)
- **Severidad**: Alta
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Ambas funciones implementan el mismo algoritmo de detección de solapamiento de citas (jaccard=0.953), difiriendo solo en el campo de filtro Mongo. El propio código lo admite en un comentario ("Mismo algoritmo de solapamiento que findConflict", línea 98). Verificados los call sites: **ambas funciones se ejecutan secuencialmente en el mismo request** de crear/editar cita. Cero tests cubren `appointmentController.js`.
- **Causa raíz**: El algoritmo de detección de solapamiento de intervalos temporales no se parametrizó para cubrir la regla adicional "un paciente no puede tener 2 citas simultáneas con doctores distintos", sino que se copió íntegro.
- **Impacto**: Es el hallazgo de duplicación de mayor riesgo de negocio: si se corrige un bug de borde en una función y no en la otra, el sistema queda con protección asimétrica doctor-vs-paciente en el mismo flujo, sin que ningún test cubra ambas rutas a la vez.
- **Complejidad de solución**: Media
- **Recomendación**: Unificar en una función parametrizada `findOverlap({matchField, matchValue, fecha, duracion, excludeId, selectFields})`.

**ARQ-03 (Frontend Dup) — Duplicación de fetching entre patient-detail.jsx y PatientPrintPage.jsx, con bug ya materializado**
- **Ubicación**: Client/src/features/patient-detail/patient-detail.jsx (líneas 213-354) vs Client/src/features/patient-detail/PatientPrintPage.jsx (líneas 133-243) — `formatImageUrl`, `normalizeHistory`, `resetOdontogramState`, `fetchPatientData`, `useOdontogramSetup`
- **Severidad**: Alta
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Diff línea a línea confirma que las 5 funciones son idénticas salvo estilo de formato. **Se confirmó que el riesgo ya se materializó**: `PatientPrintPage.jsx` línea 305 tiene `setFetchedInitial(false)`, un setter que no existe en ese archivo (el estado real es `fetchedInitialRef` vía `useRef`); en `patient-detail.jsx` la línea equivalente sí usa correctamente `fetchedInitialRef.current = false`. Esto causaría un `ReferenceError` en runtime al cambiar de paciente en la vista de impresión. Además, `npm run lint` está roto en el entorno (config `react-app` no resuelve), por lo que ninguna red de seguridad automática atrapó este bug.
- **Causa raíz**: `PatientPrintPage` fue creado copiando `patient-detail.jsx` como punto de partida y nunca se extrajo la capa común de fetching/normalización antes de que ambos archivos divergieran.
- **Impacto**: Bug de cara al usuario final ya presente en el código (falla al navegar entre pacientes en la vista de impresión), no solo deuda técnica teórica.
- **Complejidad de solución**: Media
- **Recomendación**: Extraer las 5 funciones a un hook compartido en `shared/hooks/` (ej. `usePatientInitialOdontogramSetup`) — refactorización de bajo riesgo porque el código ya es idéntico.

**ARQ-DUP-03 — generateDefaultVersionName duplicada**
- **Ubicación**: Server/controllers/periodontogramController.js (líneas 634-638) vs Server/controllers/odontogramaController.js (líneas 41-45)
- **Severidad**: Media
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Función idéntica (SIMILAR_TO=1.000) usada para generar nombre de versión por defecto al guardar periodontograma/odontograma sin nombre provisto.
- **Causa raíz**: Mismo patrón de copy-paste entre los dos controllers de historial clínico que comparten lógica de versionado sin módulo común.
- **Impacto**: Bajo riesgo de deriva grave (función pura), pero si se cambia el formato de nombre de versión hay que recordar tocar 2 archivos.
- **Complejidad de solución**: Baja
- **Recomendación**: Mover a un helper compartido (ej. `Server/utils/clinicalVersioning.js`).

**ARQ-DUP-05 — Formateo de fecha/hora reimplementado 4+1 veces con comportamiento inconsistente**
- **Ubicación**: Client/src/features/cash/CashDashboard.jsx, Client/src/features/settings/sections/CashHistorySection.jsx, Client/src/features/consultas/ConsultasPage.jsx, y una quinta versión canónica sin usar en Client/src/shared/utils/formatters.js (línea 165)
- **Severidad**: Media
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: 4 reimplementaciones con opciones inconsistentes entre sí (una fuerza `hour12:false`, otras no; una incluye `weekday:'long'`, otras no). Ya existe una función `formatDateTime` exportada en el módulo compartido que ninguno de los 3 archivos usa — y esa versión "canónica" tiene comportamiento distinto: no fija locale `es-MX` y devuelve `'N/A'` en vez de `'—'`.
- **Causa raíz**: Existe un módulo de formatters compartido pero no se usa consistentemente.
- **Impacto**: El mismo dato puede mostrarse con formato distinto según la pantalla, visible para el usuario final. La versión "correcta" para el dominio (clínica mexicana) es una de las duplicadas, no la compartida.
- **Complejidad de solución**: Baja
- **Recomendación**: Definir una única función canónica en `shared/utils/formatters.js` con locale `es-MX` fijo, corregir el locale de la versión existente, y migrar los 3 usos locales.

**ARQ-DUP-08 — mapTeethToPlain/mapToPlainTeeth duplicado entre controller y modelo**
- **Ubicación**: Server/controllers/periodontogramController.js (líneas 53-62) vs Server/models/periodontogram.js (líneas 7-16)
- **Severidad**: Media
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Ambas funciones son idénticas carácter por carácter (jaccard=1.000), solo cambia el nombre y el archivo.
- **Causa raíz**: El controller y el modelo resuelven la misma necesidad de forma independiente porque no existe capa de servicios que medie entre "lógica de modelo" y "lógica de controller".
- **Impacto**: Sintomático de arquitectura sin límites claros entre capas; si Mongoose cambia el comportamiento de `.toObject()` hay que recordar actualizar 2 lugares.
- **Complejidad de solución**: Baja
- **Recomendación**: Exportar una única implementación desde el modelo o un `utils/mongooseHelpers.js` e importarla en el controller.

**ARQ-DUP-04 — Middlewares de upload duplicados (firma/logo)**
- **Ubicación**: Server/middlewares/uploadFirma.js (65 líneas) vs Server/middlewares/uploadLogo.js (65 líneas)
- **Severidad**: Baja
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Mismo storage engine multer.diskStorage con estructura idéntica; difieren intencionalmente en subcarpeta destino, límite de tamaño y mensajes.
- **Causa raíz**: Patrón de plantilla para middlewares de subida de archivos sin abstraer un factory común.
- **Impacto**: Riesgo de deriva bajo porque los valores que difieren son intencionales; si se agrega un tercer tipo de archivo subido es previsible una tercera copia casi idéntica.
- **Complejidad de solución**: Baja
- **Recomendación**: Extraer un factory genérico `createUploadMiddleware(options)` parametrizado.

**ARQ-DUP-06 — Componentes de sección de paciente duplicados**
- **Ubicación**: Client/src/features/patient-detail/components/patient-emergency-contacts.jsx vs patient-family-history.jsx (jaccard=1.000); patient-contact-info.jsx vs patient-document-info.jsx (jaccard=0.984)
- **Severidad**: Baja
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Comparten línea por línea el mismo esqueleto — solo cambian nombres de props y etiquetas. Inconsistencia adicional: 2 de los 4 usan `React.useId()` y los otros 2 `Math.random()` para generar IDs de sección.
- **Causa raíz**: Componentes presentacionales triviales generados copiando el componente hermano más parecido en vez de crear uno genérico parametrizado.
- **Impacto**: Bajo riesgo de deriva grave, pero cualquier cambio de estilo/accesibilidad debe replicarse en 4 lugares; el mecanismo `Math.random()` puede causar mismatch de hidratación o IDs duplicados.
- **Complejidad de solución**: Baja
- **Recomendación**: Crear 2 componentes genéricos reutilizables y unificar el mecanismo de sectionId a `React.useId()`.

#### Anti-patrones y SOLID

**ARQ-04 (Frontend) — 7 god-components sin extracción de hooks/reducer**
- **Ubicación**: patient-detail.jsx, PatientPrintPage.jsx, periodontogram-design.jsx, periodontogram-section.jsx, odontogram-clinical-section.jsx, calendar.jsx, ConsultasPage.jsx
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Arquitectura - Anti-patrón
- **Evidencia**: Conteo verificado por archivo (30/12/3/12/7/15/13 useState respectivamente). Solo 3 de 7 importan algún hook custom puntual. Ningún god-component usa `useReducer` pese a tener entre 12 y 30 piezas de estado local con transiciones acopladas.
- **Causa raíz**: Ausencia de convención de extracción de hooks; patrón dominante es "todo inline hasta que el archivo funciona".
- **Impacto**: Con 12-30 piezas de estado sin useReducer, cualquier `setState` dispara re-render de todo el árbol JSX. Sin hooks extraídos, imposible testear unitariamente la lógica sin renderizar el componente completo con providers.
- **Complejidad de solución**: Alta
- **Recomendación**: Establecer convención de extracción (custom hook por dominio con más de 2-3 piezas de estado relacionadas); usar `useReducer` para máquinas de estado con transiciones acopladas. Priorizar ConsultasPage.jsx y periodontogram-section.jsx.

**ARQ-04 (Backend, Anti-patrón) — Modelo Tratamiento anémico sin hook de invalidación de firma**
- **Ubicación**: Server/models/treatment.js (73 líneas) comparado con exam.js, odontograma.js, periodontogram.js (que sí usan `attachSignatureInvalidationHook`)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Arquitectura - Anti-patrón
- **Evidencia**: `treatment.js` define campos de auditoría clínica idénticos conceptualmente a los otros 3 modelos, pero es puramente anémico: 0 methods, 0 statics, 0 hooks.
- **Causa raíz**: El concepto de dominio "invalidación de firma al editar contenido firmado" se resolvió 3 veces de forma centralizada y no se aplicó de forma consistente a los 5 modelos con campos de auditoría.
- **Impacto**: Riesgo preventivo, no activo: no existe ningún controller ni ruta de escritura para el modelo `Tratamiento` standalone hoy (solo se usa en 3 agregaciones de solo lectura).
- **Complejidad de solución**: Media (probablemente Baja: una sola línea siguiendo el patrón existente)
- **Recomendación**: Aplicar `attachSignatureInvalidationHook` también a `treatment.js` como blindaje preventivo ante un futuro CRUD de tratamientos.

**ARQ-05 (Acoplamiento/Anti-patrón) — isStandaloneTxError y generateDefaultVersionName como Shotgun Surgery**
- **Ubicación**: odontogramaController.js, periodontogramController.js, appointmentController.js, patientsController.js (isStandaloneTxError, 4 copias); odontogramaController.js/periodontogramController.js (generateDefaultVersionName, 2 copias)
- **Severidad**: Media
- **Categoría**: Arquitectura - Anti-patrón
- **Evidencia**: Confirmado por lectura directa — mismo nombre, mismo propósito, 4 (y 2) implementaciones independientes en vez de 1 en `Server/utils/`.
- **Causa raíz**: `Server/utils/` existe y se usa activamente para otras utilidades, pero estas funciones específicas nunca se extrajeron ahí.
- **Impacto**: Alto riesgo de divergencia silenciosa sin ningún error de compilación que lo detecte.
- **Complejidad de solución**: Baja
- **Recomendación**: Extraer ambas funciones a `Server/utils/mongoTransactionHelpers.js` y reemplazar las copias.

**ARQ-06 (Backend) — Convención de exports inconsistente**
- **Ubicación**: Server/controllers/odontogramaController.js y draftController.js (`module.exports = {...}` al final) vs. el resto que usa `exports.fn` inline
- **Severidad**: Media
- **Categoría**: Arquitectura - Duplicación
- **Evidencia**: Confirmado por grep de ambos patrones coexistiendo sin convención documentada.
- **Causa raíz**: Sin lineamientos de estilo ni revisión de arquitectura que unifique el patrón de exports.
- **Impacto**: Incrementa la carga cognitiva de un nuevo desarrollador; el riesgo real está en la duplicación funcional derivada.
- **Complejidad de solución**: Baja
- **Recomendación**: Unificar el estilo de exports en una guía de estilo del backend (regla de ESLint si es viable); extraer `generateDefaultVersionName` e `isStandaloneTxError` a `Server/utils/`.

#### Organización y dependencias

**ARQ-01 (Org) — Tests fantasma: 9 de 20 archivos en Server/tests/ nunca corren en CI**
- **Ubicación**: Server/tests/ (10 archivos `.script.js`/`.check.js`) + .github/workflows/ci.yml
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Arquitectura - Anti-patrón
- **Evidencia**: `npx jest --listTests` devuelve exactamente 11 archivos; ninguno de los 10 `.script.js`/`.check.js` aparece. Ninguno contiene wrapper `describe`/`it`/`test` (son IIFEs con `process.exit`), estructuralmente incompatibles con jest tal como están.
- **Causa raíz**: Convención de nombres de archivo usada para marcar "pruebas ad-hoc sin framework", pero al vivir dentro de `Server/tests/` generan la ilusión de estar cubiertas por CI cuando no es así.
- **Impacto**: Una regresión en guardado/lectura de periodontogramas o subida de firma (funcionalidad NOM-004) puede pasar un PR con CI verde porque los checks que la detectarían simplemente no se ejecutan.
- **Complejidad de solución**: Baja
- **Recomendación**: Decidir explícitamente el destino de cada archivo: convertir a tests jest reales e incorporar a CI, o mover fuera de `Server/tests/` a `Server/scripts/diagnostics/`. Documentar la convención en un README.

**ARQ-02 (Org) — require('mongoose') muerto en set-pin.js, riesgo de "dos mongoose" latente**
- **Ubicación**: set-pin.js (raíz del repo, línea 4) vs /node_modules/mongoose (9.3.1) y Server/node_modules/mongoose (7.8.6)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Arquitectura - Dependencias
- **Evidencia**: `set-pin.js` línea 4 tiene `const mongoose = require('mongoose');` sin ningún uso posterior (import muerto real). Mismo patrón de causa raíz que ya produjo el bug documentado y corregido en `scripts/migrate.js`.
- **Causa raíz**: El root package.json declara su propia dependencia `mongoose: ^9.3.1`, separada del `^7.0.3` de Server/package.json; `set-pin.js` es evidencia de que el patrón de riesgo sigue vivo tras el incidente de `migrate.js`.
- **Impacto**: Hoy el import es inerte y no causa fallo funcional; es una trampa activa que requiere una acción humana futura específica para materializarse.
- **Complejidad de solución**: Baja
- **Recomendación**: Eliminar el `require('mongoose')` sin uso de `set-pin.js`; evaluar retirar la dependencia mongoose del root package.json si ningún script legítimo la necesita ya (confirmado: `migrate.js` y `audit-legacy-data.js` ya implementan resolución correcta, y `backup-db.js`/`restore-db.js`/`start-mongo.js` no usan mongoose en absoluto).

**ARQ-04 (Org) — Triplicación de capa de operación sin documentar**
- **Ubicación**: scripts/ (raíz), Server/scripts/, y sueltos create-admin.js/list-users.js/set-pin.js (raíz)
- **Severidad**: Media
- **Categoría**: Arquitectura - Organización
- **Evidencia**: No hay funcionalidad duplicada real entre las tres ubicaciones, pero el README solo menciona genéricamente "scripts/ o Server/scripts/" sin explicar el criterio de ubicación ni mencionar los 3 sueltos de la raíz.
- **Causa raíz**: Crecimiento orgánico sin convención documentada.
- **Impacto**: Un desarrollador nuevo o auditor no tiene forma de saber, sin leer cada archivo, si `create-admin.js` es soportado o abandonado.
- **Complejidad de solución**: Media
- **Recomendación**: Consolidar los 3 sueltos de la raíz en una subcarpeta única (ej. `scripts/admin/`) y documentar en un README dedicado.

**ARQ-06 (Org) — Inconsistencia de convención de nombres de archivo y dominio en español**
- **Ubicación**: Client/src/features/patient-detail/ (PatientPrintPage.jsx vs patient-detail.jsx); Client/src/features/consultas/ vs resto en inglés
- **Severidad**: Media
- **Categoría**: Arquitectura - Anti-patrón
- **Evidencia**: PascalCase conviviendo con kebab-case en el mismo nivel de carpeta de feature. De los 12 directorios en `Client/src/features/`, "consultas" es el único nombre de dominio en español.
- **Causa raíz**: Falta de convención de nombres de archivo documentada y enforced.
- **Impacto**: Dificulta la búsqueda predecible de archivos, incrementa fricción de code review y linting.
- **Complejidad de solución**: Media
- **Recomendación**: Definir y documentar una convención única (kebab-case, ya mayoritaria) y renombrar los outliers en una pasada dedicada de bajo riesgo.

**ARQ-05 (Org) — Middlewares planos sin subcarpetas temáticas**
- **Ubicación**: Server/middlewares/ (11 archivos planos)
- **Severidad**: Baja
- **Categoría**: Arquitectura - Organización
- **Evidencia**: 11 archivos mezclan 5 responsabilidades distintas en una carpeta plana sin subcarpetas. No se encontró evidencia de montaje en orden incorrecto a nivel de app.
- **Causa raíz**: No hay convención de subcarpetas por tipo de middleware.
- **Impacto**: Hoy no genera problema funcional confirmado; riesgo de escalabilidad organizativa a futuro.
- **Complejidad de solución**: Baja
- **Recomendación**: Cuando la carpeta crezca más allá de ~15 archivos, introducir subcarpetas temáticas (security/, validation/, uploads/, audit/). No urgente al tamaño actual.

**ARQ-03 (Org) — Dependencia muerta mongoose-unique-validator**
- **Ubicación**: Server/package.json (línea 19); comentario en Server/models/patient.js línea 1040
- **Severidad**: Baja
- **Categoría**: Arquitectura - Dependencias
- **Evidencia**: No hay ningún `require('mongoose-unique-validator')` en todo Server/. El propio código confirma: comentario dice "Se retiró mongoose-unique-validator: hacía un countDocuments extra por cada operación".
- **Causa raíz**: Refactor incompleto: al retirar el uso del paquete no se ejecutó `npm uninstall`.
- **Impacto**: Incrementa el árbol de node_modules a instalar/auditar sin ningún beneficio funcional.
- **Complejidad de solución**: Baja
- **Recomendación**: Ejecutar `npm uninstall mongoose-unique-validator` en Server/ y correr una auditoría de dependencias no usadas (ej. depcheck) como práctica recurrente.

**ARQ-07 (Org) — Ausencia de jest.config.js explícito en Server/**
- **Ubicación**: Server/package.json (script `test: jest`) vs Client/jest.config.js (con testMatch explícito y acotado)
- **Severidad**: Baja
- **Categoría**: Arquitectura - Dependencias
- **Evidencia**: Client/jest.config.js tiene testMatch bien delimitado; Server/ no tiene jest.config.js propio — esto es lo que permite que los 10 archivos `.script.js`/`.check.js` coexistan sin protección activa.
- **Causa raíz**: Ausencia de jest.config.js explícito en Server/ que documente y restrinja qué se considera suite de test.
- **Impacto**: Es la raíz técnica que permite el problema de tests fantasma (ARQ-01 de esta sección).
- **Complejidad de solución**: Baja
- **Recomendación**: Añadir `Server/jest.config.js` explícito con testMatch restringido a `**/*.test.js`, excluyendo `.script.js`/`.check.js` vía `testPathIgnorePatterns`.

**ARQ-02 (Org, positivo) — Cero ciclos de imports en todo el repo**
- **Ubicación**: Grafo de imports completo (Client/src + Server), 307 nodos File/Module, 681 aristas IMPORTS
- **Severidad**: Baja (hallazgo positivo, no defecto)
- **Categoría**: Arquitectura - Dependencias
- **Evidencia**: Búsqueda exhaustiva de ciclos de longitud 2, 3 y 4 más detección de componentes fuertemente conexos (Tarjan) sobre las 681 aristas: 0 ciclos de cualquier longitud, 0 SCCs con más de un nodo.
- **Causa raíz**: N/A — es una fortaleza estructural, no un defecto.
- **Impacto**: Ninguno negativo. Facilita bundling, tree-shaking y comprensión del grafo de dependencias; reduce riesgo de deadlocks de módulos.
- **Complejidad de solución**: Baja
- **Recomendación**: Mantener esta propiedad con una regla de lint (`import/no-cycle`) que falle el build si se introduce un ciclo en el futuro.

### Hallazgos que requieren decisión del dueño (no son bugs técnicos)

Ninguno de los 27 hallazgos analizados en esta fase fue marcado explícitamente con veredicto `REQUIERE_DECISION_DUENO` por los agentes verificadores. Sin embargo, varias justificaciones de veredicto señalan que la decisión de fondo detrás de los hallazgos ARQ-01/ARQ-02/ARQ-03/ARQ-08 de Acoplamiento (introducir o no una capa de servicios/repositorio en todo el backend) es, en esencia, una decisión de inversión de producto — no un bug a corregir — dado el contexto documentado de v1 on-premise para un solo cliente con un desarrollador. Se recomienda que el dueño del producto decida explícitamente y documente (aunque sea en un ADR breve) si:

1. Se invierte en la extracción incremental de `Server/services/` ahora, o se acepta conscientemente el trade-off actual mientras el producto permanezca en escala de un solo cliente.
2. Se prioriza el refactor de los god-components del frontend, dado que no hay evidencia de que el patrón ya haya causado incidentes de producción confirmados (a diferencia de la duplicación de fetching en PatientPrintPage.jsx, que sí es un bug concreto).

### Hallazgos descartados en verificación (transparencia)

Ningún hallazgo de los 27 recibidos en esta fase recibió veredicto `FALSO_POSITIVO`. Todos tuvieron su evidencia factual confirmada en algún grado por el proceso adversarial. El mecanismo de calibración principal fue el ajuste de severidad, no el descarte. Para transparencia, casos donde una pieza específica de evidencia citada no se sostenía (aunque el hallazgo en su conjunto se mantuvo):

- **ARQ-01 (God-object patientsController)**: la cifra de "15 helpers no exportados" no se pudo reproducir exactamente (conteo real más cercano a 8 en el top-level).
- **ARQ-01 (Frontend god-components)**: la afirmación de que PatientDetail tiene "las métricas de complejidad más altas del repo" es imprecisa — PeriodontogramSection, PeriodontogramDesign y Calendar la superan en cognitive/complexity; solo el out_degree=44 es efectivamente el máximo.
- **ARQ-04 (Anti-patrón, 7 god-components)**: el precedente citado del bug de LockScreen no tiene relación causal verificada con este anti-patrón, y la afirmación de "cero tests" para los 7 archivos es objetivamente falsa (existe un test de renderizado para PeriodontogramDesign).
- **ARQ-04 (Modelo Tratamiento anémico)**: la inclusión original de `patient.js` como caso equivalente no se sostuvo — sus hooks son una decisión de diseño deliberada y documentada, más estricta que el hook compartido.
- **ARQ-06 (dos versiones de mongoose, sección Acoplamiento)**: la evidencia de que 5 scripts operativos están en riesgo activo no se sostuvo — 3 no usan mongoose en absoluto y los otros 2 (`migrate.js`, `audit-legacy-data.js`) ya implementan la resolución correcta como parte de un fix ya aplicado (commit `5450bd10`).

### Conclusión de arquitectura

Si tuviera que elegir las 3 acciones de mayor impacto relativo al menor esfuerzo para esta fase, serían:

1. **Arreglar el gap de CI de tests fantasma en `Server/tests/`** (ARQ-01 Organización): agregar un `Server/jest.config.js` explícito con `testPathIgnorePatterns` para los 9 archivos `.script.js`/`.check.js`, y decidir en una sola pasada si se convierten a tests reales o se mueven a `Server/scripts/diagnostics/`. Es la corrección de menor esfuerzo con el mayor efecto de higiene: hoy el equipo cree que tiene cobertura sobre guardado de periodontograma y subida de firma que en realidad no corre en ningún pipeline automatizado.

2. **Extraer las funciones duplicadas byte-a-byte a `Server/utils/`** (`isStandaloneTxError` en 4 controllers, `generateDefaultVersionName` en 2, `mapTeethToPlain`/`mapToPlainTeeth`): son refactors mecánicos de complejidad Baja, sin riesgo de reconciliar comportamiento divergente porque el código ya es idéntico, que eliminan de un solo golpe la clase de riesgo de "corregir un bug en 3 copias y olvidar la cuarta" en el núcleo transaccional clínico del sistema.

3. **Unificar `findConflict`/`findPatientConflict` en `appointmentController.js`** en una sola función parametrizada: es el hallazgo de duplicación con mayor riesgo de negocio concreto (ambas funciones ya se ejecutan en paralelo en el mismo request de crear/editar cita, sin ningún test que las cubra), con complejidad Media, muy inferior al esfuerzo que implicaría cualquiera de los refactors de capa de servicios de mayor alcance.

Estas tres acciones comparten una característica: no requieren la decisión arquitectónica de fondo (introducir `Server/services/` en todo el backend, o refactorizar los 7 god-components del frontend a hooks de dominio), que sí son de alto valor pero de complejidad Alta y de retorno menos inmediato dado el contexto de v1 on-premise de un solo cliente — esa decisión de mayor alcance queda correctamente para el dueño del producto, no como una corrección técnica urgente de esta fase.

---

## Fase 3 — Backend

### Resumen de la fase

El backend de DentiaCore muestra una base de diseño sólida en las áreas que el equipo ya trató como críticas en auditorías previas (rate limiting de autenticación, hash-chain de auditoría NOM-024, sagas compensatorias de caja, agregaciones de estadísticas), pero exhibe un patrón sistemático de **aplicación inconsistente de sus propios estándares de calidad**: prácticamente cada hallazgo confirmado describe una utilidad, patrón o middleware que ya existe y funciona correctamente en un endpoint "hermano", pero que no se replicó en otro endpoint del mismo dominio. Esto ocurre con express-validator (presente en cash/patientCharge/settings, ausente en audit/appointments/patients/noteTemplate), con `validateMimeByMagicBytes` (presente en adjuntos y fotos, ausente en firma digital y logo), con `session.withTransaction` (presente en updateAppointment/deletePatient, ausente en createAppointment), y con el logger winston (presente en 5 archivos, ausente en 11 controllers con 111 usos de `console.*`).

De los 21 hallazgos originales de los 5 agentes especializados, tras verificación adversarial quedan **2 confirmados sin cambios** (1 Alta, 1 Crítica), **6 con severidad ajustada a la baja** (de Alta a Media/Media-Alta, todos justificados por el contexto real de un despliegue on-premise de un solo cliente), **12 con veredicto "NO_VERIFICADO_MEDIA_BAJA"** que se reportan igualmente por transparencia con su severidad declarada, y **1 falso positivo** (un hallazgo de auth/sesiones sin evidencia real, cuyo código verificado contradice la hipótesis). No se identificó ningún hallazgo que requiera decisión explícita del dueño del producto en esta fase.

El hallazgo más grave de todo Fase 3 es el registro silencioso (`.catch(() => {})`) de eventos de auditoría legal NOM-024 (login, firma electrónica, cambio de PIN) en al menos 12 puntos de 4 archivos distintos, que rompe de forma indetectable la cadena de auditoría exigida por ley ante cualquier fallo transitorio de Mongo — agravado porque el mismo tipo de evento (`firma_electronica`) se maneja correctamente (con propagación de error) en `signingController.js`, demostrando que no es una decisión de diseño sino una omisión. El segundo hallazgo confirmado sin ajuste, la inyección NoSQL vía operadores `$` en `auditController.getLogs`, es explotable únicamente por cuentas ya privilegiadas (admin/superadmin) pero compromete precisamente el log de trazabilidad legal del sistema.

### Hallazgos confirmados

#### Endpoints y Validación

**BE-01 — NoSQL injection vía operadores `$` en auditController.getLogs**
- **Ubicación**: `Server/controllers/auditController.js`, función `getLogs()` líneas 130-158; montado sin validador en `Server/routes/auditRoutes.js` línea 14
- **Severidad**: Alta
- **Categoría**: Backend - Validación
- **Evidencia**: `getLogs()` asigna `userId`, `patientId` y `evento` de `req.query` directamente a un objeto `filter` pasado tal cual a `AuditLog.find(filter)`, sin ningún `body()`/`query()` de express-validator, a diferencia de `cashRoutes.js`/`patientChargeRoutes.js` que sí exigen `query('patientId').isMongoId()`. No existe `express-mongo-sanitize` en ningún punto del pipeline (`grep -rn 'mongo-sanitize'` sin resultados). Con `express.urlencoded({extended:true})`, el parser `qs` interpreta `?userId[$ne]=null` como `{userId: {'$ne': 'null'}}`, un objeto real con clave `$ne` que llega intacto a `filter.userId`.
- **Causa raíz**: Ausencia total de middleware de validación/sanitización en el endpoint de auditoría más sensible del sistema, a diferencia de endpoints análogos del mismo proyecto que sí validan `isMongoId()`.
- **Impacto**: Un usuario con permiso `audit.read.full` (administrador/superadmin, o cuenta comprometida con ese rol) puede manipular la query para bypasear filtros esperados o provocar comportamiento no determinista en Mongo. Al ser el log de auditoría legal NOM-024, una consulta corrupta socava la confiabilidad del propio mecanismo de trazabilidad.
- **Complejidad de solución**: Baja
- **Recomendación**: Agregar `query('userId').optional().isMongoId()`, `query('patientId').optional().isMongoId()`, `query('evento').optional().isString().isIn([lista blanca])` con `withValidation`, y evaluar `express-mongo-sanitize` global en `config/routes.js` como defensa en profundidad.

**BE-02 — Permiso `exams.delete` inexistente en ningún rol del catálogo**
- **Ubicación**: `Server/routes/examRoutes.js` líneas 36-40 vs `Server/utils/permissions.js` (ROLE_PERMISSIONS)
- **Severidad**: Alta
- **Categoría**: Backend - Autenticación/Autorización
- **Evidencia**: `'exams.delete'` no aparece en ningún rol de `ROLE_PERMISSIONS` (ni siquiera `administrador`/`doctor_admin`, que sí tienen `exams.read`/`create`/`update`). Solo `superadmin` pasa el chequeo, vía bypass explícito de rol, no por wildcard de permisos. `rolePermissionOverrides` no puede remediarlo: `administrador` y `doctor_admin` están en `OVERRIDE_PROTECTED_ROLES`, bloqueados con 403 explícito en `settingsController.js:131`.
- **Causa raíz**: El comentario del código ("solo admin/superadmin (wildcard)") asume que `administrador` tiene wildcard, pero solo `superadmin` lo tiene — desalineación entre intención documentada y catálogo real.
- **Impacto**: `DELETE /api/exams/:id` es inalcanzable para cualquier rol clínico o administrativo real de la clínica; funcionalidad rota en producción sin ruta de auto-remediación (ni siquiera el dueño de la clínica puede otorgarse el permiso vía UI).
- **Complejidad de solución**: Baja
- **Recomendación**: Agregar explícitamente `'exams.delete'` a `administrador`/`doctor_admin` en `permissions.js` (análogo a `patients.delete`), o documentar y confirmar la restricción a superadmin si es la política deseada.

#### Manejo de Errores

**BE-01 — Registro de auditoría NOM-024 silenciado con `.catch(() => {})`**
- **Ubicación**: `authController.js` (líneas ~184, 201, 295, 366, 396, 413, 493, 544); `patientsController.js` (líneas ~1574, 1585, 1718, 1908, 2421); `draftController.js` (líneas ~319, 465); `capturaExtemporanea.js:103`
- **Severidad**: Crítica
- **Categoría**: Backend - Manejo de errores
- **Evidencia**: Todo evento de auditoría NOM-024 (login, cambio de PIN, firma electrónica, nota clínica, captura extemporánea) se dispara con `auditLogger.registrarManual(...).catch(() => {})`. `AuditLog.registrar()` puede lanzar tras agotar 5 reintentos ante colisión de `seq` o error de Mongo, y ese rechazo se descarta sin logging, sin reintento y sin alerta. El mismo evento (`firma_electronica`) en `signingController.js:130` sí propaga el error correctamente a `next(error)`, evidenciando inconsistencia y no decisión deliberada. El propio módulo `auditLogger.js` ya usa el patrón correcto (`.catch(err => console.error(...))`) en sus usos internos, y simplemente no se replicó en `registrarManual` ni en sus llamadores.
- **Causa raíz**: Se trató la escritura de auditoría como "fire and forget" sin considerar que es evidencia legal de no-repudio (NOM-024 §5.1.3).
- **Impacto**: Un fallo transitorio de MongoDB durante login/firma/cambio de PIN deja el evento sin registrar y sin traza en ningún log; un hueco en `seq` detectado por `verifyChain()` podría interpretarse erróneamente como manipulación del log en vez de fallo de escritura.
- **Complejidad de solución**: Baja
- **Recomendación**: Reemplazar `.catch(() => {})` por `.catch(err => logger.error('Fallo al registrar evento de auditoría NOM-024', {evento, userId, err}))` en todos los sitios listados; evaluar cola de reintento o alerta operacional.

**BE-02 — Rollback compensatorio de caja falla en silencio (solo `console.error`)**
- **Ubicación**: `cashController.js:538,552` (rollback en `addMovement`); `patientChargeController.js:504,516,525` (reverso en `cancelCharge`); también presente sin citar en `patientChargeController.js:347-356` (`createPayment`)
- **Severidad**: Alta
- **Categoría**: Backend - Manejo de errores
- **Evidencia**: Si el `CashMovement.deleteOne(...)` de compensación falla, el catch solo hace `console.error('CRITICAL: rollback ... falló:', ...)` y el flujo continúa devolviendo 409/200 al cliente, dejando el movimiento huérfano sin alertar. El repo ya tiene `Server/utils/logger.js` (winston con rotación) usado en otros archivos, por lo que la corrección es trivial de aplicar.
- **Causa raíz**: El diseño de compensación manual (sin `session.withTransaction`) asume que el `deleteOne` de rollback siempre tiene éxito; el propio comentario lo marca "CRITICAL" pero se degrada a un log de consola.
- **Impacto**: Un movimiento de caja fantasma contamina el balance de la sesión de caja (corte de caja NOM-024, reportes financieros), invisible salvo revisando logs de consola de pm2 (que no rotan).
- **Complejidad de solución**: Media
- **Recomendación**: Loguear con `logger.error` incluyendo `movementId`, `sessionId` y usuario; considerar marcar el `CashMovement` huérfano con un flag (`pendingReversalFailed: true`, no existe hoy en el schema) para reconciliación.

**BE-05 — Fuga de `error.message` crudo de Mongoose sin gate por NODE_ENV**
- **Ubicación**: `appointmentController.js:245,268,286,1040,1099`; `noteTemplateController.js:12,39,65,85`; `draftController.js:280,430,592,686`; `settingsController.js:23,102,113,157,175,208,234,252,299,336,356`; `patientChargeController.js:370` (103 ocurrencias totales de `res.status(500).json` en controllers, solo 4 archivos aplican algún gate)
- **Severidad**: Media-Alta (ajustada de Alta)
- **Categoría**: Backend - Manejo de errores
- **Evidencia**: A diferencia del error handler global (`scripts/dent.js:299`), que sí condiciona `error: process.env.NODE_ENV === 'production' ? undefined : err.message`, decenas de bloques catch en controllers devuelven `error.message` directamente en cualquier entorno, incluida producción.
- **Causa raíz**: El patrón de respuesta de error se copió entre controllers sin replicar el gate de `NODE_ENV` del handler global.
- **Impacto**: `error.message` de Mongoose puede filtrar nombres internos de colecciones/campos, valores de índices únicos duplicados (potencial PII en un E11000), o detalles de validación del schema.
- **Complejidad de solución**: Media
- **Recomendación**: Centralizar en un helper `sendError(res, status, message, error)` que aplique el mismo gate por `NODE_ENV` usado en el handler global.

#### Transacciones y Consultas

**BE-01 — createAppointment sincroniza Appointment+PatientCharge sin sesión de Mongo**
- **Ubicación**: `appointmentController.js`, función `createAppointment`, líneas 379-417
- **Severidad**: Media (ajustada de Alta)
- **Categoría**: Backend - Transacciones
- **Evidencia**: `createAppointment` usa un try/catch de compensación manual (borra el Appointment si `charge.save()` lanza una excepción capturable), sin `session.withTransaction`, a diferencia de `updateAppointment` (mismo archivo, líneas 740-769) y `deletePatient`, que sí usan el patrón con fallback standalone.
- **Causa raíz**: Asimetría de implementación — el patrón de transacción con fallback nunca se replicó en `createAppointment`.
- **Impacto**: Si el proceso Node crashea exactamente entre `newAppointment.save()` y la creación del `PatientCharge`, la cita queda creada sin el cargo correspondiente, de forma permanente y sin detección automática.
- **Complejidad de solución**: Media
- **Recomendación**: Envolver la creación de Appointment + PatientCharge con el mismo patrón `session.withTransaction` + `isStandaloneTxError` + fallback secuencial ya usado en `updateAppointment`. (Nota de contexto: `MONGODB_URI` apunta a instancia standalone sin replicaSet, por lo que `withTransaction` no otorga atomicidad real hoy; el beneficio es de consistencia de manejo de errores más que de atomicidad garantizada.)

**BE-02 — N+1 secuencial en cancelCharge (hasta ~4 queries por pago)**
- **Ubicación**: `patientChargeController.js`, función `cancelCharge`, líneas 444-527
- **Severidad**: Media (ajustada de Alta)
- **Categoría**: Backend - Rendimiento
- **Evidencia**: Por cada pago del array `charge.pagos` se ejecutan secuencialmente `CashMovement.findById`, `getCashOnHand` (que hace un `CashMovement.find` completo de la sesión), `CashMovement.create` y otro `getCashOnHand` post-insert. Sin `Promise.all` ni batching con `$in`.
- **Causa raíz**: El reverso se diseñó pago-por-pago con chequeos de fondos secuenciales in-DB en vez de un acumulador en memoria.
- **Impacto**: Un cobro con muchos pagos parciales genera hasta ~4N queries secuenciales al cancelarse; en v1 on-premise de un solo cliente, N es típicamente pequeño (2-5 pagos), atemperando el impacto real.
- **Complejidad de solución**: Media
- **Recomendación**: Precargar una vez los `CashMovement` de la sesión activa y mantener `cashOnHand` en memoria; persistir reversos en un solo `insertMany`. (Nota: las relecturas actuales son controles deliberados anti-race contra `closeBox` y retiros concurrentes documentados en el código — cualquier refactor debe preservar esas garantías.)

**BE-03 — batchSign sin límite de tamaño, procesamiento secuencial con I/O de disco**
- **Ubicación**: `draftController.js`, función `batchSign`, líneas 438-594
- **Severidad**: Media (ajustada de Alta)
- **Categoría**: Backend - Rendimiento
- **Evidencia**: `batchSign` solo valida `Array.isArray(draftIds) && draftIds.length > 0` (línea 442), sin tope máximo. Procesa cada elemento en un `for...of` secuencial con `findNoteSubdoc`, `attachDoctorSignatureToNote` (I/O de disco vía `copyFirmaToSnapshot`), y `persistNoteOfficial/doc.save()`, todo con `await` uno tras otro. El flujo "Firmar todo" del cliente (`DraftsCenter.jsx:118-119`) arma `draftIds` con todos los borradores cargados, sin límite en `listNoteDrafts` para notas de evolución.
- **Causa raíz**: El endpoint se implementó con un loop simple sin cota de tamaño de entrada ni paralelización.
- **Impacto**: Un lote de cientos de `draftIds` ejecuta cientos de queries y operaciones de disco secuenciales en un solo request HTTP, bloqueando el worker por tiempo proporcional al lote.
- **Complejidad de solución**: Media
- **Recomendación**: Imponer límite máximo a `draftIds.length` (ej. 50-100) devolviendo 400 si se excede; paralelizar items independientes con `Promise.all` agrupando por tipo de recurso.

#### Autenticación/Autorización

*(Sin hallazgos confirmados o con severidad ajustada en esta categoría — el único hallazgo del agente de Auth y Sesiones fue clasificado FALSO_POSITIVO; ver sección de descartados.)*

#### Logging y Rendimiento

**BE-03 — Firma digital (NOM-004) sin validación de magic bytes, solo MIME declarado por el cliente**
- **Ubicación**: `Server/middlewares/uploadFirma.js` (fileFilter, líneas 34-40) + `Server/controllers/settingsController.js:258-301` (`uploadFirma`)
- **Severidad**: Alta
- **Categoría**: Backend - Validación
- **Evidencia**: `uploadFirma.js` valida el archivo únicamente por `file.mimetype` declarado por el cliente. `settingsController.uploadFirma` no invoca `validateMimeByMagicBytes` en ningún punto (confirmado por grep: solo `attachmentController.js` la usa). Un atacante autenticado con rol firmante podría subir un archivo malicioso declarando `Content-Type: image/png`.
- **Causa raíz**: La utilidad `fileMagicBytes.js` se integró en adjuntos y fotos de pacientes, pero no se replicó en el flujo de firma digital.
- **Impacto**: Bypass de verificación de contenido real en un activo legalmente sensible (NOM-004), servido luego vía `express.static('/uploads')`. Impacto atemperado porque `middlewares/uploadsAuth.js` exige sesión válida para servir `/uploads/firmas`, `requireSignerRole` limita el vector a actores ya autenticados con rol doctor/doctor_admin/superadmin, y el nombre de archivo final se fuerza server-side a `.png`/`.jpg` vía `MIME_TO_EXT`.
- **Complejidad de solución**: Baja
- **Recomendación**: Invocar `validateMimeByMagicBytes(req.file.path, req.file.mimetype)` en `settingsController.uploadFirma` (y `uploadLogo`), eliminando el archivo con `fs.remove` si el sniff falla, replicando el patrón de `attachmentController.js`.

**BE-01 — Fuga de PII clínica (nombres de pacientes buscados) en logs de acceso vía morgan**
- **Ubicación**: `Server/routes/patientRoutes.js:202` (`searchPatients`) + `Server/scripts/dent.js:111` (morgan) + `Server/utils/logger.js`
- **Severidad**: Media (ajustada de Alta)
- **Categoría**: Backend - Logging
- **Evidencia**: morgan montado con formato `'combined'` en producción, escribiendo a `logger.stream` → winston → disco. El token `:url` incluye la query string completa. `GET /api/patients/search?q=<texto>` registra el nombre buscado en texto plano en `logs/dent-*.log` (retención 14 días, comprimido). Se halló un segundo endpoint análogo: `auditController.js:250` (también `q` en query).
- **Causa raíz**: Uso de morgan estándar sin token personalizado que redacte el query string en endpoints con PII de pacientes.
- **Impacto**: Cualquiera con acceso al filesystem del servidor o a un backup puede reconstruir qué pacientes fueron buscados por nombre. Atemperado porque ese mismo acceso ya otorgaría acceso directo a la base de datos MongoDB local completa (con historiales clínicos y odontogramas, PII más sensible); no hay integración real con un pipeline centralizado externo (ELK/Datadog) en el repo hoy.
- **Complejidad de solución**: Baja
- **Recomendación**: Añadir un `morgan.token` personalizado que redacte el query string en rutas sensibles, o cambiar `searchPatients` para recibir el término de búsqueda en el body de un POST.

### Hallazgos que requieren decisión del dueño

No se identificaron hallazgos con veredicto `REQUIERE_DECISION_DUENO` en esta fase.

### Hallazgos reportados sin verificación adversarial completa (severidad declarada por el agente, transparencia)

Los siguientes hallazgos fueron reportados por los agentes especializados con veredicto `NO_VERIFICADO_MEDIA_BAJA` (severidad Media o Baja, no verificados adversarialmente en profundidad por restricción de alcance del proceso de verificación, pero tampoco refutados). Se listan con su severidad declarada para completitud:

- **BE-03 (Endpoints)** — Media: `noteTemplateRoutes.js` sin ninguna validación express-validator en POST/PATCH, dejando `estructura`/`camposObligatorios`/`seccionesClinicas` sin control de tipo/tamaño.
- **BE-04 (Endpoints)** — Media: asimetría entre `createUser` (con `withValidation`) y `updateUser` (sin ninguna) en `userRoutes.js`.
- **BE-05 (Endpoints)** — Media: `appointmentRoutes.js` sin reglas express-validator; `motivo`/`observaciones`/`comentarioProcedimiento` sin `maxlength` en ruta ni en schema Mongoose.
- **BE-06 (Endpoints)** — Baja: `GET /api/settings/` y `GET /api/settings/logo` sin `authorize()` explícito, dependiendo solo del `authenticate` genérico.
- **BE-07 (Endpoints)** — Media: tres endpoints de Google Calendar (list/events GET y POST) sin exigir sesión de la app, solo un access token de Google válido.
- **BE-08 (Endpoints)** — Baja: `patientRoutes.js` sin express-validator en ninguna ruta de escritura, apoyado enteramente en validación manual dispersa en un controller de 2579 líneas.
- **BE-04 (Manejo de Errores)** — Media: el error handler global de `dent.js` siempre responde 500 sin inspeccionar `err.status`/`err.type`, incluyendo JSON malformado y `CastError` de Mongoose.
- **BE-06 (Manejo de Errores)** — Media: `saveOdontogramaScreenshot` en `patientsController.js` es la única función exportada sin try/catch (no async, riesgo ante refactors futuros).
- **BE-07 (Manejo de Errores)** — Media: ausencia de alerta activa (más allá del log) ante `uncaughtException`/`unhandledRejection`, decisión documentada de no matar el proceso.
- **BE-08 (Manejo de Errores)** — Baja: rutas con `:id`/`:chargeId` en `cashRoutes.js`/`patientChargeRoutes.js` sin middleware `validateId`, dependiendo del handler global genérico.
- **BE-04 (Transacciones)** — Media: `createPatients` (batch) serializa `generateUniquePatientId` por paciente, generando N+1 anidado de queries `exists()`.
- **BE-05 (Transacciones)** — Media: `cashController.updateMovement` persiste `movement` + `BoxSession` con dos `.save()` independientes sin sesión de Mongo.
- **BE-06 (Transacciones)** — Baja: `getAllAppointments` pagina pero sin `.lean()`, hidratando hasta 500 documentos Mongoose completos con doble populate.
- **BE-07 (Transacciones)** — Baja: `getChargesByPatient` con tope duro de 500 sin skip real y sin `.lean()`.
- **BE-08 (Transacciones)** — Baja: `getInactivePatients` usa 8 queries `distinct()` y filtra en memoria con Sets de JS en vez de una agregación Mongo.
- **BE-02 (Logging y Rendimiento)** — Media: 111 usos de `console.*` en 11 controllers vs. solo 3 usos de `logger.*` (winston), evadiendo rotación/retención centralizada.
- **BE-04 (Logging y Rendimiento)** — Media: mismo gap que BE-03 (firma digital) mencionado arriba, pero aplicado al logo de la clínica (`uploadLogo.js` + `settingsController.js:417-435`).
- **BE-05 (Logging y Rendimiento)** — Media: `batch-sign` sin límite de tamaño de payload validado en la ruta (complementa el hallazgo de Transacciones BE-03 desde el ángulo de rate-limiting/validación de entrada).
- **BE-06 (Logging y Rendimiento)** — Baja: `userRoutes.js` no aplica `readLimiter`/`writeLimiter` específicos, dependiendo solo del `globalLimiter` (1000 req/15min).
- **BE-07 (Logging y Rendimiento)** — Baja: ausencia de timeouts HTTP explícitos a nivel de servidor (`server.timeout`/`headersTimeout`), exposición teórica a Slowloris.

### Hallazgos descartados en verificación (transparencia)

- **BE-01 (Auth y Sesiones)** — FALSO_POSITIVO: el hallazgo no traía evidencia real (campos placeholder "test"); se verificó la ubicación citada (`authController.js:392-420`, función `verifyPin`) por si apuntaba a "PIN sin lockout", pero el código muestra lockout por contador (`MAX_PIN_ATTEMPTS=5`) con persistencia, auditoría por intento, reset documentado al reiniciar sesión, rate-limit HTTP adicional (`pinRateLimit`, 20/5min/IP) y un segundo mecanismo con TTL real (`pinLockedUntil`, 15 min) en el modelo — ya endurecido en una auditoría previa del mismo repo (commit 82e64322).

### Conclusión de backend

Las tres acciones de mayor impacto y menor esfuerzo identificadas en esta fase (no implementadas):

1. **Loguear los fallos de auditoría NOM-024 y de rollback de caja en vez de silenciarlos.** Reemplazar `.catch(() => {})` por `.catch(err => logger.error(...))` en los ~12 call sites de `registrarManual` (auth/patients/draft/capturaExtemporanea) y sustituir los `console.error` de rollback compensatorio en `cashController.js`/`patientChargeController.js` por `logger.error` con contexto (movementId, sessionId, usuario). Es una corrección de una línea por sitio, reutilizando infraestructura winston que ya existe en el repo, y cierra el hallazgo Crítico y uno de los Altos de la fase.

2. **Alinear el catálogo de permisos con la intención documentada del código para `exams.delete`, y cerrar el gap de validación de magic bytes en firma digital/logo.** Ambos son cambios triviales (agregar una línea a `permissions.js`; invocar `validateMimeByMagicBytes` ya existente en `settingsController.uploadFirma`/`uploadLogo`, copiando el patrón de `attachmentController.js`) que restauran funcionalidad rota en producción (exams.delete) y cierran una inconsistencia de seguridad real en un activo legalmente sensible (NOM-004).

3. **Añadir validación `isMongoId()`/`isIn()` con express-validator al endpoint de auditoría (`auditRoutes.js`) para cerrar la inyección NoSQL vía operadores `$`.** Mismo patrón ya usado en `cashRoutes.js`/`patientChargeRoutes.js`; de paso, evaluar si conviene extender `express-mongo-sanitize` de forma global en `config/routes.js` como defensa en profundidad para el resto de endpoints que arman filtros Mongo desde `req.query`/`req.body`.

---

## Fase 4 — Frontend

### Resumen de la fase

La auditoría de Fase 4 confirma que Dentia Core tiene un frontend funcionalmente sólido en sus flujos felices, pero con una robustez muy desigual en los bordes: manejo de errores, accesibilidad y defensas de UX de segundo orden (doble submit, límites de longitud, foco de teclado) están resueltos de forma ejemplar en algunas pantallas (PendingChargesPanel, ConsultasPage, StatisticsPage, periodontogram-section, ActionsPanel) y completamente ausentes en otras que resuelven el mismo problema (calendar.jsx, patient-list.jsx, CreateAppointmentModal.jsx). Este patrón — "el equipo ya sabe resolver X en un lugar, pero no lo generalizó" — es la causa raíz que se repite en prácticamente todos los hallazgos confirmados de esta fase, desde `window.confirm` nativo conviviendo con `Modal.confirm` de AntD, hasta guards de doble submit presentes en add-patient/caja pero ausentes en el modal de citas.

De los 31 hallazgos recibidos de los 5 agentes especializados, sobreviven la verificación adversarial 13 como CONFIRMADO o SEVERIDAD_AJUSTADA (2 en severidad Alta, 9 en Media, 2 en Baja tras ajuste), 17 quedan en estado NO_VERIFICADO_MEDIA_BAJA (no se relajaron por límite de tiempo/alcance de la verificación adversarial, se listan igualmente con su severidad reportada por el agente original) y 1 fue descartado como FALSO_POSITIVO por evidencia directa de que la causa técnica alegada no existe en el código actual. Ningún hallazgo quedó marcado como REQUIERE_DECISION_DUENO en esta fase — todos los ajustes de severidad fueron resueltos por el propio verificador con base en evidencia de código y contexto de producto (on-premise, cliente único, personal clínico ya autenticado), no por ambigüedad de negocio.

La accesibilidad merece mención aparte por ser la primera vez que se audita esta dimensión en el proyecto: el resultado es que el sistema no alcanza ni el nivel A de WCAG 2.1 en sus dos piezas clínicas más críticas. El odontograma (canvas puro con listeners de mouse) y el periodontograma (imágenes `<img onClick>` sin semántica de botón) son 100% inoperables por teclado, y la tarjeta de paciente en patient-list.jsx — el punto de entrada más usado del sistema — tampoco lo es, pese a que el mismo patrón de accesibilidad (`role="button"` + `tabIndex` + `onKeyDown`) ya está resuelto correctamente en otros componentes clic-interactivos del propio repo (StatisticsPage, patient-attachments, PendingChargesPanel). Ningún modal custom implementa focus trap ni cierre con Escape, incluyendo SignaturePadModal, que declara `role="dialog"`/`aria-modal` sin cumplir esa promesa semántica — relevante porque ese modal captura consentimientos legales de pacientes. El verificador ajustó consistentemente estos hallazgos de Crítica/Alta hacia Alta/Media considerando que no hay evidencia de obligación regulatoria de accesibilidad activa ni de usuarios con discapacidad identificados en la base actual, pero recomienda revisar la severidad al alza si eso cambia.

En navegación y estado global se confirman dos huecos de UX significativos y de bajo costo de arreglo: la ausencia total de ruta catch-all/404 (cualquier URL no reconocida deja al usuario ante una pantalla en blanco sin sidebar ni mensaje) y la expiración de sesión durante uso activo resuelta con un hard redirect silencioso sin explicación, agravado porque `refreshProfile` trata errores de red transitorios igual que sesiones inválidas. Ambos son de complejidad de solución baja/media y de alto impacto en percepción de calidad ante personal clínico no técnico.

### Hallazgos confirmados

#### Formularios y Validaciones

**FE-01 (Formularios) — Motivo/comentario de citas sin límite de longitud (cliente + servidor)**
- **Ubicación**: Client/src/features/consultas/components/CreateAppointmentModal.jsx líneas 38-39, 226, 418-437
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - Formularios
- **Evidencia**: El input de Motivo y el textarea de comentario no tienen `maxLength` ni validación de longitud en JS. `handleSave` solo valida que motivo no esté vacío. El backend (Server/models/appointment.js líneas 44-57) tampoco valida longitud en `motivo` ni `comentarioProcedimiento`, confirmando el gap detectado en Fase 3.
- **Causa raíz**: El formulario de citas replicó el patrón de texto libre de notas de evolución sin distinguir que motivo es un campo corto por naturaleza.
- **Impacto**: Entradas extremadamente largas pueden inflar documentos MongoDB y degradar rendimiento de listados de citas, sin control en cliente ni servidor.
- **Complejidad de solución**: Baja
- **Recomendación**: Agregar `maxLength` a los inputs, contador de caracteres, y validar longitud antes de enviar; coordinar con la corrección de backend ya reportada en Fase 3.

#### UX - Estados y Mensajes

**FE-01 (UX Estados) — Fallos silenciosos de sincronización en el calendario**
- **Ubicación**: Client/src/features/main-page/components/calendar.jsx, líneas 437-459 (re-fetch al navegar de mes) y líneas 592-607 (handleCreateEvent)
- **Severidad**: Alta
- **Categoría**: Frontend - Manejo de errores
- **Evidencia**: El efecto que re-consulta eventos al navegar fuera del rango cargado tiene un catch vacío (`catch { /* ignore */ }`) que no informa nada al usuario ni actualiza el indicador de sync, a diferencia de `fetchCalendarEvents` que sí setea `syncStatus`/`syncMessage` en cada rama de error. En `handleCreateEvent`, si no hay token válido el modal se cierra silenciosamente (`setShowEventModal(false)`) sin mostrar el error dentro del formulario.
- **Causa raíz**: El manejo de errores de sincronización se centralizó en un estado de UI de bajísima visibilidad (texto pequeño + tooltip en la topbar) en vez del canal `message`/`notification` de AntD que usa el resto de la app; no existe ningún import de AntD message/notification en todo el archivo.
- **Impacto**: Un doctor o asistente que navega el calendario puede ver una grilla vacía y asumir que no hay compromisos ese día cuando la carga falló silenciosamente, con riesgo real de doble-booking al agendar sobre un horario ya ocupado que no se está mostrando.
- **Complejidad de solución**: Media
- **Recomendación**: Sustituir los catch vacíos por manejo explícito vía `message.error`/`notification` de AntD, y mostrar el error de creación de evento dentro del propio modal antes de cerrarlo automáticamente.

**FE-02 (UX Estados) — window.confirm/window.prompt nativos conviviendo con Modal.confirm de AntD**
- **Ubicación**: ConsultasPage.jsx líneas 240-243, 292; patient-detail.jsx línea 20; periodontogram-section.jsx líneas 466, 514, 527, 868; patient-evolution-note.jsx línea 200; ProfessionalProfileSection.jsx línea 314; AccountsManagement.jsx línea 188; DraftsCenter.jsx línea 141; odontogram-clinical-section.jsx línea 252
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - UX
- **Evidencia**: 11 usos confirmados de `window.confirm`/`window.prompt` nativos del navegador para confirmar o pedir motivo en acciones sensibles (eliminar cita, desactivar cuenta de usuario, eliminar firma digital, rechazar borrador, descartar cambios), mientras que ActionsPanel.jsx líneas 72-91 usa `Modal.confirm` de AntD con icono y `okType: 'danger'` para acciones igual de destructivas.
- **Causa raíz**: No existe un componente de confirmación único y obligatorio; cada feature implementó su propia solución ad-hoc.
- **Impacto**: Diálogos nativos no respetan el tema dark-mode, no son estilizables, bloquean el hilo de JS abruptamente y dan una experiencia visualmente inconsistente en un producto clínico donde la confianza del usuario importa.
- **Complejidad de solución**: Media
- **Recomendación**: Reemplazar todos los `window.confirm`/`window.prompt` por `Modal.confirm` (o un componente `ConfirmModal` compartido) de AntD, replicando el patrón ya usado en ActionsPanel/PendingChargesPanel.

#### Accesibilidad

**FE-A11Y-01 — Odontograma y periodontograma 100% inoperables por teclado**
- **Ubicación**: periodontogram-design.jsx (~línea 1044-1061) y odontogram-clinical-section.jsx (canvas '#odontograma-canvas-2', líneas 733-740, listeners en líneas 399-400)
- **Severidad**: Alta (ajustada desde Crítica)
- **Categoría**: Frontend - Accesibilidad
- **Evidencia**: El periodontograma renderiza cada diente como `<img onClick={...}>` sin `role="button"`, `tabIndex` ni `onKeyDown` (cero ocurrencias en grep del archivo). El odontograma clínico usa un único `<canvas>` con listeners vía `addEventListener`, sin ningún elemento DOM intermedio focuseable. La tabla de resumen existente es de solo lectura, no sirve como vía alternativa de edición.
- **Causa raíz**: El odontograma clínico se construye sobre un motor de dibujo en canvas pensado solo para mouse/touch; el periodontograma usa imágenes PNG posicionadas con onClick en vez de controles nativos.
- **Impacto**: Un usuario dependiente de teclado o lector de pantalla no puede marcar diagnósticos en el odontograma clínico ni seleccionar diente en el periodontograma — la funcionalidad clínica más crítica del sistema queda 100% inoperable. Incumple WCAG 2.1 SC 2.1.1 (Keyboard), nivel A.
- **Complejidad de solución**: Alta
- **Recomendación**: Para el periodontograma, envolver cada imagen en un elemento con `role="button"`, `tabIndex="0"` y `onKeyDown` para Enter/Space, o usar `<button>` real. Para el odontograma clínico, proveer un modo de edición alternativo basado en formulario/tabla editable.

**FE-A11Y-03 — Ningún modal implementa focus trap ni cierre con Escape**
- **Ubicación**: SignaturePadModal.jsx (líneas 386-582, especialmente 394-395); CreateAppointmentModal.jsx (línea 301); calendar.jsx (líneas 850, 997)
- **Severidad**: Alta (ajustada desde Crítica)
- **Categoría**: Frontend - Accesibilidad
- **Evidencia**: Ninguno de estos cuatro modales/overlays implementa focus trap ni cierre con Escape. SignaturePadModal declara `role="dialog"` y `aria-modal="true"` pero grep de Escape/onKeyDown/tabIndex/autoFocus no devuelve resultados. CreateAppointmentModal y los overlays de calendar.jsx ni siquiera declaran `role="dialog"`.
- **Causa raíz**: Los modales se implementaron como `<div>` con overlay + stopPropagation, replicando visualmente un modal, sin usar el componente Modal de AntD (que trae focus-trap y Escape gratis) ni un hook compartido de focus-trap/Escape.
- **Impacto**: Un usuario de teclado puede tabular fuera del modal hacia elementos ocultos detrás, y ningún usuario puede cerrar estos diálogos con Escape. Particularmente grave en SignaturePadModal, que captura consentimientos legales de pacientes. Incumple WCAG 2.1 SC 2.1.2 y 2.4.3, nivel A.
- **Complejidad de solución**: Media
- **Recomendación**: Crear un hook compartido (`useModalA11y`) con captura de foco, ciclo de Tab confinado, cierre con Escape y devolución de foco al cerrar; aplicarlo a los tres componentes o migrar a AntD Modal.

**FE-A11Y-04 — Tarjeta de paciente (punto de entrada más usado) inoperable por teclado**
- **Ubicación**: Client/src/features/patient-list/patient-list.jsx, componente PatientCard, líneas 88-93
- **Severidad**: Alta
- **Categoría**: Frontend - Accesibilidad
- **Evidencia**: La tarjeta de paciente es un `<div onClick={handleClick}>` plano, sin `role="button"`, sin `tabIndex`, sin `onKeyDown`. Confirmado por grep: cero ocurrencias de tabIndex/role="button"/onKeyDown en todo el archivo.
- **Causa raíz**: Se usó el patrón "div con onClick" para la tarjeta completa en vez de `<button>` nativo o atributos ARIA/teclado equivalentes, pese a que el mismo patrón de accesibilidad ya está resuelto correctamente en StatisticsPage, patient-attachments, patient-cash-movements y PendingChargesPanel.
- **Impacto**: Un usuario que navegue solo con teclado no puede entrar a ningún expediente de paciente desde la lista, bloqueando el flujo de trabajo más frecuente de la aplicación. Incumple WCAG 2.1 SC 2.1.1, nivel A, sobre el punto de entrada principal a los datos clínicos.
- **Complejidad de solución**: Baja
- **Recomendación**: Agregar `role="button"`, `tabIndex={0}` y `onKeyDown` para Enter/Space a la tarjeta, replicando el patrón ya usado en otros componentes del mismo repo.

**FE-A11Y-02 — Inputs de medición del periodontograma sin aria-label**
- **Ubicación**: measurement-input.jsx (líneas 193-208) y mini-input-cell.jsx (líneas 44-107 y 110-161)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - Accesibilidad
- **Evidencia**: Ninguno de los `<input>` tiene `aria-label`, `aria-labelledby` ni `<label>` asociado, pese a que `MeasurementInput` recibe `toothNumber`, `rowKey`, `side`, `faceKey` e `index` como props disponibles para construirlo. El patrón de aria-label dinámico ya existe y funciona en componentes hermanos del mismo directorio (bleeding-multi-state-checkbox.jsx, periodontogram-utils.js línea 351).
- **Causa raíz**: Los componentes de celda se diseñaron para uso visual en grilla sin agregar la capa de metadatos accesibles, pese a que el patrón ya está resuelto en el mismo feature.
- **Impacto**: Incluso si se resolviera FE-A11Y-01, un usuario de lector de pantalla escucharía "edición, número, 0" repetido ~192 veces sin saber a qué diente/cara/medida corresponde. Incumple WCAG 2.1 SC 1.3.1 y 4.1.2, nivel A.
- **Complejidad de solución**: Media (casi copiar un patrón ya existente)
- **Recomendación**: Construir un aria-label dinámico a partir de las props ya disponibles, p. ej. `Diente ${toothNumber}, ${side}, profundidad de sondaje, sitio ${index+1}`.

**FE-A11Y-07 — Odontograma clínico sin alternativa textual (canvas como caja negra)**
- **Ubicación**: odontogram-clinical-section.jsx (canvas, línea 733) y odontogram-initial-section.jsx (canvas, línea 458, con aria-label en línea 464)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - Accesibilidad
- **Evidencia**: El odontograma clínico no tiene ningún aria-label ni contenido de fallback dentro del `<canvas>`. El odontograma inicial sí agrega un aria-label, pero genérico ("Odontograma inicial (editable)"), sin describir el contenido clínico real. La tabla de resumen colapsada usa `width:0 !important; opacity:0; pointer-events:none` sin `display:none` ni `aria-hidden`, por lo que no es un mecanismo de accesibilidad deliberado.
- **Causa raíz**: El odontograma se implementó completamente sobre canvas con un motor gráfico externo, sin una capa de datos estructurados en el DOM que sirva como alternativa textual sincronizada.
- **Impacto**: El registro dental es la pieza de información clínica más consultada del sistema; para un usuario con lector de pantalla es efectivamente una caja negra. Incumple WCAG 2.1 SC 1.1.1, nivel A.
- **Complejidad de solución**: Alta
- **Recomendación**: Generar un aria-label/aria-describedby dinámico que resuma el estado clínico, y asegurar que la tabla de resumen esté siempre disponible en el DOM (aunque colapsada visualmente) como alternativa textual completa.

#### Rendimiento y Re-renders

**FE-01 (Rendimiento) — Sin code-splitting por ruta**
- **Ubicación**: Client/src/app/app.jsx, líneas 1-24 (imports) y 95-146 (rutas)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - Rendimiento
- **Evidencia**: Ninguna ruta usa React.lazy/Suspense. Los 13 imports de páginas (PatientDetail -1078 líneas-, ConsultasPage -989 líneas-, Calendar -1112 líneas-, etc.) son imports estáticos de nivel superior. Confirmado: grep global sin resultados de React.lazy/Suspense en todo src/, y vite.config.js no define manualChunks.
- **Causa raíz**: No se aplicó code-splitting por ruta; el equipo nunca introdujo `React.lazy(() => import(...))` + `<Suspense>` alrededor de las rutas.
- **Impacto**: El bundle JS inicial incluye componentes pesados que la mayoría de sesiones nunca usan, alargando el Time-to-Interactive en redes lentas de consultorio.
- **Complejidad de solución**: Media
- **Recomendación**: Convertir los imports de páginas de nivel de ruta a `React.lazy()` y envolver en `<Suspense>`, priorizando primero las páginas más pesadas.

**FE-04 (Rendimiento) — 4 setInterval independientes en el calendario, 2 redundantes**
- **Ubicación**: Client/src/features/main-page/components/calendar.jsx, líneas 366-369, 372-389, 391-404 y 407-412
- **Severidad**: Media
- **Categoría**: Frontend - Rendimiento
- **Evidencia**: El componente registra 4 `setInterval` independientes en simultáneo: uno cada 60s para el reloj del sistema, otro cada 60s para el texto de sincronización relativa, uno cada 10 min para expiración de token, y otro cada 5 min para auto-sync. Los dos de 60000ms corren desacoplados haciendo esencialmente lo mismo.
- **Causa raíz**: Cada necesidad de actualización periódica se implementó como un useEffect con su propio setInterval aislado en vez de centralizar un único "tick" del que derivaran ambos estados.
- **Impacto**: Renders periódicos innecesarios y consumo de batería/CPU en equipos portátiles durante horas de uso continuo, al ser el componente de la pantalla de inicio.
- **Complejidad de solución**: Baja
- **Recomendación**: Unificar los dos intervalos de 60000ms en un solo useEffect/setInterval que actualice ambos estados derivados en el mismo tick.

**FE-05 (Rendimiento) — Lista de movimientos de caja con key por índice**
- **Ubicación**: Client/src/features/cash/MovementsList.jsx, línea 191-195 (`<List dataSource={movements}>`) y líneas 166-179 (`edits.map((e, idx))`)
- **Severidad**: Media
- **Categoría**: Frontend - Rendimiento
- **Evidencia**: El `<List>` de AntD se renderiza sin prop `rowKey`, por lo que usa el índice de posición como key interna. `movements` se recarga y reordena tras cada `refreshTrigger` (los más recientes se anteponen). El historial de ediciones por movimiento también usa índice como key sobre un array que puede crecer.
- **Causa raíz**: No se especificó `rowKey` en `<List>` de AntD, y el historial de ediciones se iteró con el índice del array en lugar de un identificador estable.
- **Impacto**: Cuando entra un movimiento nuevo al tope de la lista, React puede reutilizar por posición el nodo DOM/estado de un Tooltip o Button abierto de un ítem distinto, causando parpadeos o pérdida de foco al editar un movimiento mientras otro cajero registra uno nuevo en paralelo.
- **Complejidad de solución**: Baja
- **Recomendación**: Pasar `rowKey={(item) => item._id}` a `<List>`, y cambiar la key de ediciones por una derivada de `editedAt` + `editedBy`.

**FE-06 (Rendimiento) — Tabla del odontograma clínico sin virtualización, key mixta índice+campo**
- **Ubicación**: odontogram-clinical-section.jsx, líneas 579-600 (tableData useMemo) y línea 747-754 (`<Table>`)
- **Severidad**: Media
- **Categoría**: Frontend - Rendimiento
- **Evidencia**: La key de cada fila se construye como `` `current-${index}-${row.tooth}` ``, mezclando índice con número de diente. La tabla usa `pagination={false}` y solo limita altura con `scroll={{y:500}}`, sin virtualización: para un paciente con historial clínico extenso, todas las filas se renderizan en el DOM de una sola vez.
- **Causa raíz**: Se combinó índice + campo variable en la key en lugar de un identificador estable del hallazgo, y se optó por scroll interno en vez de paginación o virtualización real de AntD Table.
- **Impacto**: En pacientes con historial extenso, la tabla renderiza cientos de filas al DOM en cada carga; si el array se reordena, las keys basadas en índice provocan reutilización incorrecta de filas.
- **Complejidad de solución**: Media
- **Recomendación**: Reemplazar la key mixta por un id estable de cada registro, y evaluar activar `virtual` en AntD Table o paginación real.

**FE-02 (Rendimiento) — tabItems sin useMemo en patient-detail.jsx**
- **Ubicación**: Client/src/features/patient-detail/patient-detail.jsx, líneas 640-761 (tabItems) y línea 856 (`<Tabs>`)
- **Severidad**: Baja (ajustada desde Alta)
- **Categoría**: Frontend - Rendimiento
- **Evidencia**: `tabItems` se reconstruye en cada render (sin `useMemo`) y `<Tabs>` no tiene `destroyInactiveTabPane`. Verificación del motor real de rc-tabs/AntD v5 (CSSMotion) confirma que los paneles inactivos sin `forceRender` NO se montan hasta que el usuario hace clic en ellos por primera vez — el montaje simultáneo de las 5 pestañas alegado en la evidencia original no ocurre en la práctica.
- **Causa raíz**: Ausencia de `useMemo` en la construcción del array `tabItems`, lo que provoca reconciliación innecesaria del árbol de nodos en cada re-render del padre.
- **Impacto**: Coste de reconciliación en JS por reconstrucción de nodos, no de scripts Canvas ejecutándose de más ni montaje prematuro de pestañas. Micro-optimización, no percibida como lentitud real al abrir el expediente.
- **Complejidad de solución**: Media
- **Recomendación**: Envolver `tabItems` en `useMemo` con las dependencias reales, aunque el beneficio práctico es menor al descrito originalmente.

**FE-07 (Rendimiento) — Cálculo de listas derivadas duplicado en ConsultasPage**
- **Ubicación**: Client/src/features/consultas/ConsultasPage.jsx, líneas 138-168 y líneas 395-401
- **Severidad**: Baja
- **Categoría**: Frontend - Rendimiento
- **Evidencia**: Un useEffect recalcula manualmente `active`, `upcoming` y `closed` filtrando `agenda` con los mismos criterios que ya se calculan por separado y memoizados en `upcomingConsultations`/`completedConsultations`.
- **Causa raíz**: Falta una única fuente de verdad para las listas derivadas de `agenda` por estado; el efecto de "siguiente paciente" se escribió de forma independiente al useMemo que alimenta las listas visuales.
- **Impacto**: Riesgo de que futuros cambios en qué estados cuentan como "activos"/"cerrados" diverjan silenciosamente entre los dos puntos; recálculo duplicado de filtros redundante aunque de bajo costo absoluto.
- **Complejidad de solución**: Baja
- **Recomendación**: Reutilizar `upcomingConsultations`/`completedConsultations` (ya memoizados) dentro del useEffect de selección de "siguiente paciente".

#### Navegación y Consistencia Visual

**FE-01 (Navegación) — Sin ruta catch-all/404**
- **Ubicación**: Client/src/app/app.jsx (líneas 95-146, bloque `<Routes>`)
- **Severidad**: Alta
- **Categoría**: Frontend - Navegación
- **Evidencia**: No existe ninguna `<Route path="*">` ni componente NotFound en ningún nivel del árbol de rutas. Confirmado por grep: no hay ningún componente 404/NotFound en todo src/. En React Router v6, cuando ninguna ruta hija coincide, no se renderiza nada — ni siquiera el layout padre AppLayout se monta.
- **Causa raíz**: Falta una ruta catch-all (`path="*"`) con un componente NotFound/404.
- **Impacto**: Cualquier URL mal escrita, bookmark viejo tras un rename de ruta, o edición manual de la URL deja al usuario ante una pantalla completamente en blanco: sin sidebar, sin header, sin mensaje. En un entorno clínico con personal no técnico, esto se percibe como "el sistema se rompió".
- **Complejidad de solución**: Baja
- **Recomendación**: Agregar `<Route path="*" element={<NotFound/>} />` con un mensaje amigable y botón para volver a Inicio.

**FE-03 (Navegación) — Expiración de sesión con hard redirect silencioso, sin motivo**
- **Ubicación**: Client/src/shared/services/axios-instance.js líneas 161-173 y Client/src/features/auth/LoginPage.jsx líneas 36-38
- **Severidad**: Alta
- **Categoría**: Frontend - UX
- **Evidencia**: Cuando el refresh token expira, el interceptor ejecuta `window.location.href = /login?from=...` sin ningún parámetro que indique el motivo. LoginPage solo lee `from` para redirección post-login, nunca para mostrar mensaje. Confirmado: no existe lectura de `sessionExpired` en ningún archivo del repo.
- **Causa raíz**: El interceptor de axios y LoginPage no comparten un canal para comunicar la razón de la redirección.
- **Impacto**: Se percibe como cierre de sesión silencioso e inexplicado en pleno uso clínico (ej. a mitad de firmar una nota o registrar un pago en caja); al ser hard redirect, se pierde cualquier estado de la SPA en memoria no persistido.
- **Complejidad de solución**: Media
- **Recomendación**: Agregar un query param explícito (`?sessionExpired=1`) y en LoginPage detectarlo para mostrar un mensaje claro antes del formulario.

**FE-05 (Navegación) — Colores hex hardcodeados en vez de variables de tema**
- **Ubicación**: ActionsPanel.jsx líneas 219-220; AccountsManagement.jsx línea 450; odontogram-initial-section.jsx línea 515; odontogram-clinical-section.jsx línea 611
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - UX
- **Evidencia**: Cuatro componentes usan colores hex fijos en inline style (`#4caf50`, `#e53e3e`, `#dc2626`, `#ff4d4f`, `#d97706`) en vez de las variables del tema, pese a que el mismo módulo de caja (PendingChargesPanel.jsx, CashSection.jsx) ya usa correctamente `var(--color-danger)`. Las variables de tema sí cambian de valor real entre light/dark mode.
- **Causa raíz**: Desarrollo ad-hoc de estos indicadores sin pasar por el sistema de tokens ya definido, probablemente copiando valores hex de un mockup.
- **Impacto**: Riesgo de desincronización silenciosa de paleta si se ajustan los tokens de éxito/error/advertencia; riesgo de contraste insuficiente en dark mode dado que `Descriptions` no está en el `antdTheme` personalizado de app.jsx.
- **Complejidad de solución**: Baja
- **Recomendación**: Reemplazar los 5 valores hex hardcodeados por las variables ya existentes (`var(--color-success)`, `var(--color-danger)`, `var(--color-warning)`).

**FE-06 (Navegación) — Odontograma clínico no adaptado a viewports táctiles pequeños**
- **Ubicación**: odontogram-clinical-section.jsx líneas 733-739 (canvas 1200x700px) y patient-detail.css líneas 273-283
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Frontend - UX
- **Evidencia**: El odontograma clínico se dibuja sobre un canvas de resolución fija 1200x700px; el CSS aplica `max-width:100%` y `aspect-ratio` para escalar visualmente, pero el contenido interno mantiene la misma densidad de detalle. No existe lógica de auto-fullscreen en mobile (grep de `innerWidth|matchMedia|isMobile` sin resultados); el único disparador de fullscreen es un botón manual de 32x32px.
- **Causa raíz**: El motor de dibujo trabaja sobre coordenadas fijas de canvas constante; el CSS solo escala la presentación sin que el engine recalcule zonas de hit-testing táctil para viewports pequeños.
- **Impacto**: En tablet o teléfono, marcar hallazgos en el odontograma se vuelve poco práctico o propenso a errores de tap en el diente/superficie equivocada — error clínicamente relevante en un registro dental.
- **Complejidad de solución**: Alta
- **Recomendación**: Forzar automáticamente el modo fullscreen/zoom del odontograma bajo cierto breakpoint, o implementar gestos de pinch-zoom/pan sobre el canvas.

### Hallazgos que requieren decisión del dueño

Ningún hallazgo de esta fase quedó clasificado como REQUIERE_DECISION_DUENO de forma estricta. Cabe sin embargo una excepción parcial a considerar por el dueño del producto: los hallazgos de accesibilidad (FE-A11Y-01, FE-A11Y-02, FE-A11Y-03, FE-A11Y-07) fueron ajustados a la baja explícitamente bajo el supuesto de que hoy no existe obligación regulatoria de accesibilidad ni usuarios con discapacidad identificados. Si el dueño planea vender el producto a clínicas con obligaciones de contratación pública, ADA/Section 508, o la Ley General para la Inclusión de Personas con Discapacidad en México, o si ya hay o habrá personal/usuarios que dependen de teclado o lector de pantalla, estos 4 hallazgos deberían reclasificarse de vuelta a Crítica/Alta y priorizarse en consecuencia.

### Hallazgos descartados en verificación (transparencia)

- **FE-03 (Rendimiento y Re-renders)** — periodontogram-design.jsx: se descartó como FALSO_POSITIVO porque la cadena de dependencias real de `renderCell` no incluye `getToothData` ni remonta a `periodontogramData` (recibe `toothData` como parámetro directo); el propio código tiene comentarios de diseño explícitos que documentan que este problema ya fue diagnosticado y corregido en una iteración previa (actualización inmutable por-diente en periodontogram-section.jsx), y existe un test dedicado (`periodontogram-heavy-data.test.jsx`) que ejercita el escenario de datos densos.

### Conclusión de frontend

Las tres acciones de mayor impacto por menor esfuerzo detectadas en esta fase son:

1. **Agregar una ruta catch-all/404** (FE-01 Navegación) y **generalizar `role="button"` + `tabIndex` + `onKeyDown` a PatientCard** (FE-A11Y-04): ambas son correcciones triviales (minutos de trabajo, patrón ya existente en el propio repo para el segundo caso) que eliminan dos de los peores "callejones sin salida" de la experiencia de usuario — una pantalla en blanco sin ninguna pista, y el punto de entrada más usado del sistema completamente inoperable por teclado.

2. **Reemplazar los `window.confirm`/`window.prompt` nativos por `Modal.confirm` de AntD** (FE-02 UX Estados) en los 11 puntos ya identificados: el patrón de reemplazo ya existe y funciona en ActionsPanel/PendingChargesPanel dentro del mismo repo, por lo que es prácticamente replicar una solución probada en vez de diseñar una nueva.

3. **Comunicar el motivo de expulsión por expiración de sesión** (FE-03 Navegación) agregando un query param explícito y un mensaje en LoginPage, junto con distinguir en `refreshProfile` un 401 real de un error de red transitorio: soluciona de raíz la percepción de "el sistema me cerró sesión sin avisar" en pleno uso clínico, con un cambio acotado a dos archivos ya identificados.

---

## Fase 5 — Base de Datos

> Nota de proceso: el agente final de síntesis de esta fase se interrumpió por un límite de sesión del proveedor. Esta sección fue redactada directamente a partir de los datos ya verificados adversarialmente de las 4 dimensiones (modelado/relaciones, índices, integridad/consistencia, migraciones/escalabilidad), sin pérdida de información. Además, la dimensión de migraciones/escalabilidad se re-ejecutó porque en la primera corrida el agente devolvió un placeholder de prueba en lugar de análisis real; la versión aquí reflejada es la re-ejecución válida.

### Resumen de la fase

La capa de datos de Dentia Core es, de las auditadas hasta ahora, la que sale mejor parada: muestra madurez real en integridad clínica (hash-chain de auditoría NOM-024, inmutabilidad append-only de historiales, soft-delete NOM-004, índices únicos parciales bien pensados en odontograma, escrituras atómicas con `$push`/`$set` posicional para evitar reescribir el documento completo, `savePatientWithRetry` ante colisiones de `paciente_id`). El resultado más significativo de esta fase es que **tras la verificación adversarial no sobrevivió ningún hallazgo en severidad Alta ni Crítica**: los 9 hallazgos que los agentes especializados marcaron inicialmente como "Alta" fueron todos ajustados a Media o Baja, en cada caso con evidencia concreta de que el mecanismo de impacto agudo ya estaba mitigado en el código actual. Esto habla bien de las rondas de endurecimiento previas de la base de datos.

Los ajustes de severidad más ilustrativos: (1) el "muro de 9000 pacientes + carrera TOCTOU que aborta el alta" resultó parcialmente falso — `savePatientWithRetry` (patientsController.js:2554-2577) ya reintenta ante E11000 regenerando el id, exactamente el remedio que el hallazgo pedía como faltante; solo el techo duro de 9000 (horizonte multi-década para un cliente único) queda como limitación real, ajustada a Baja. (2) La búsqueda de pacientes por regex sin ancla sí hace COLLSCAN, pero con un techo arquitectónico de ~9000 documentos diminutos, debounce de 250ms y rate-limit, el COLLSCAN es una operación sub-10ms, no un evento de saturación — ajustado a Baja. (3) Los arrays clínicos embebidos en `patient` (`notas_evolucion`, `planes_tratamiento`) sí crecen sin cota hacia el límite de 16MB de BSON, pero los caminos calientes de escritura ya son atómicos y no reescriben el documento, y las firmas viven como archivos en disco (no base64 embebido), así que alcanzar 16MB exige miles de notas en un solo paciente — ajustado a Media/Baja como deuda de modelado a futuro, no amenaza viva.

Aun así, quedan hallazgos legítimos que conviene atender antes de considerar la V1 "lista para producción con años de datos": la cascada de baja del paciente (`runCascade`) **omite tres colecciones clínicas** (Examen —el único con camino de escritura vivo hoy—, Tratamiento y Receta), dejando registros activos de un paciente dado de baja; **faltan índices** de soft-delete y de acceso-por-paciente en varias colecciones (`exam` no indexa `paciente_id` pese a tener endpoint dedicado, y `getAllExams` no pagina — bomba de tiempo de heap); el **mismo vínculo lógico paciente→X está modelado con tres nombres de campo distintos** (`paciente_id` / `patientId` / `patient`), agravado porque los tres están dentro de `SIGNABLE_FIELDS` del hash NOM-024 (renombrar invalidaría firmas legales); y persisten dos riesgos operativos de fondo del despliegue **standalone sin replica set** (sin transacciones multi-documento reales, sin oplog/PITR) y del **dinero modelado como float IEEE-754** en vez de centavos/Decimal128.

Conteo tras verificación adversarial (fusionando 2 pares de hallazgos duplicados detectados entre dimensiones): **0 Crítica, 0 Alta, ~9 confirmados/ajustados en Media, ~5 en Baja**, más ~15 hallazgos en estado `NO_VERIFICADO_MEDIA_BAJA` (Media/Baja, listados por transparencia). **0 falsos positivos** — toda la evidencia factual se confirmó; el mecanismo de calibración fue exclusivamente el ajuste de severidad a la baja.

### Hallazgos confirmados

#### Integridad Referencial y Consistencia

**DB-INT-01 — runCascade omite Examen, Tratamiento y Receta al dar de baja un paciente**
- **Ubicación**: Server/controllers/patientsController.js:1152-1165 (`runCascade`) vs treatment.js:4-6/56-58, exam.js:4-8/73-75, prescription.js:4-8/60-62
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Base de datos - Integridad referencial
- **Evidencia**: `runCascade` hace soft-delete solo de 5 colecciones (Appointment, Odontograma, Periodontogram, PatientCharge, PatientAttachment) y omite Tratamiento, Examen y Receta, pese a que las tres referencian `paciente_id ref Patient` (required) y ya traen los campos `deletedAt`/`deletedBy`/`deleteReason` preparados. La lista de colecciones está hardcodeada en un `Promise.all`, no derivada de un registro central.
- **Causa raíz**: Cascada escrita como lista hardcodeada; al heredar los campos de soft-delete a treatment/exam/prescription no se actualizó `runCascade`.
- **Impacto**: Un paciente dado de baja conserva **exámenes activos y visibles** (Examen es el único de los tres con camino de escritura vivo hoy: `getAllExams`/`getExamsByPatient` filtran solo por `Exam.deletedAt`, sin excluir pacientes en baja). Rompe parcialmente el derecho de cancelación (LFPDPPP) y deja el expediente inconsistente. Tratamiento y Receta son modelos dormidos hoy (cero write-paths), por lo que su omisión es preventiva, no un leak activo.
- **Complejidad de solución**: Baja
- **Recomendación**: Añadir los tres `updateMany` de soft-delete al mismo `Promise.all`, con prioridad en Examen (el alcanzable). Centralizar la lista de colecciones-hijas-de-Patient en un array declarativo para que futuros modelos no se olviden. Migración de reconciliación para pacientes ya dados de baja.

**DB-INT-02 — Referencia al paciente con 3 nombres de campo distintos, dentro de SIGNABLE_FIELDS**
- **Ubicación**: `paciente_id` (appointment/exam/prescription/treatment) vs `patientId` (odontograma/patientCharge/patientAttachment/cashMovement/auditLog) vs `patient` (periodontogram/periodontogramHistory/odontogramaHistory)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Base de datos - Consistencia
- **Evidencia**: El mismo vínculo lógico "pertenece a este paciente" usa tres nombres de campo según la colección (todos ObjectId ref:'Patient', el tipo sí es consistente). Análogamente la referencia al doctor alterna `doctor_id` con `creadoPor`/`savedBy`/`openedBy`/`userId`. **Agravante verificado**: en `utils/integrity.js:16-44` (SIGNABLE_FIELDS) los tres nombres están firmados dentro del hash de integridad NOM-024 — un `$rename` ingenuo invalidaría firmas legales.
- **Causa raíz**: Ausencia de convención de nomenclatura de claves foráneas; cada modelo se creó en momentos distintos y sin capa de repositorio que uniforme el acceso, el nombre del campo quedó como contrato implícito por colección.
- **Impacto**: Ninguna query/populate "por paciente" se escribe de forma uniforme (filtrar por `patientId` en una colección que usa `paciente_id` devuelve 0 resultados **en silencio**, no error). Es riesgo latente (hoy cada query usa el nombre correcto), no bug activo. Complica auditorías legales que deben reconstruir todo lo asociado a un paciente.
- **Complejidad de solución**: Alta
- **Recomendación**: Dado que el rename toca la capa de firma legal, la remediación limpia (migración con re-firma) es una decisión del dueño. Puente de bajo riesgo sin tocar firmas: un módulo de acceso/repositorio que abstraiga el nombre físico por colección para consultar "por paciente" sin conocerlo. (Ver sección "requiere decisión del dueño".)

**DB-INT-03 — Dinero modelado como float IEEE-754 en vez de centavos/Decimal128**
- **Ubicación**: patientCharge.js (monto/subtotal/total/saldoPendiente), cashMovement.js:15-20 (amount), boxSession.js:5-12; balance acumulado en cashController.js:70-77 (`balance += amt`)
- **Severidad**: Media
- **Categoría**: Base de datos - Modelado
- **Evidencia**: Todos los importes se persisten como `Number` (double IEEE-754), no como enteros de centavos. La mitigación es `round2` en hooks pre-save y en el cálculo de saldo, pero el balance de caja se computa acumulando floats en JS (`balance += amt`/`balance -= amt`) y los totales se suman antes de `round2`. `round2` en los bordes no elimina el error de acumulación intermedia sobre decenas de miles de movimientos.
- **Causa raíz**: Modelado monetario con el tipo `Number` nativo; `round2` se agregó reactivamente como parche de presentación, no como representación de almacenamiento exacta.
- **Impacto**: Con años de operación, la suma de floats puede acumular errores de fracción de centavo → descuadres de caja o `saldoPendiente` que no cuadra con la suma exacta de pagos. Costo legal/contable de un arqueo que no cuadra.
- **Complejidad de solución**: Alta
- **Recomendación**: Migrar dinero a enteros de centavos o Decimal128, sumar en enteros/Decimal y convertir a decimal solo en presentación. Paso intermedio: mover las agregaciones de balance al pipeline de MongoDB con `$sum` sobre montos ya redondeados + un job de reconciliación (suma de pagos == totalPagado). (Migración de datos amplia — decisión del dueño.)

**DB-INT-04 — Referencia bidireccional pago↔CashMovement sin garantía de consistencia**
- **Ubicación**: patientCharge.js:7 (`pagos[].cashMovementId`) ⇄ cashMovement.js:57-61 (`linkedChargeId`); flujo patientChargeController.js:312-355, cashController.js:537-551
- **Severidad**: Media
- **Categoría**: Base de datos - Integridad referencial
- **Evidencia**: Punteros redundantes en ambos sentidos sin invariante a nivel de datos que los ate. En el registro de pago se crea primero el CashMovement, luego se hace `findOneAndUpdate` del charge; si eso falla se hace `deleteOne` del CashMovement — pero si ESE delete falla, queda un CashMovement huérfano (el propio comentario lo admite). Todo sin transacción real (standalone).
- **Causa raíz**: Relación many-to-one con punteros duplicados mantenida por código de controlador en dos writes separados sin atomicidad garantizada.
- **Impacto**: Movimientos de caja huérfanos que inflan el balance sin pago asociado, o pagos que apuntan a un CashMovement inexistente/editado. Reconciliación manual costosa; riesgo elevado precisamente por ser standalone.
- **Complejidad de solución**: Alta
- **Recomendación**: Reducir la referencia a una sola dirección de verdad + job de reconciliación periódico que detecte huérfanos en ambos lados. A mediano plazo, replica set para transacciones reales o patrón outbox.

**DB-INT-05 — Historiales clínicos (odontograma_history/periodontogram_history) no cascadean la baja del paciente**
- **Ubicación**: odontogramaHistory.js:17-19, periodontogramHistory.js:16-18 (no incluidos en runCascade); inmutables por diseño
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Integridad referencial
- **Evidencia**: Las colecciones de versiones referencian al paciente y son inmutables (`blockMutation` en hooks de borrado), sin campo `deletedAt`. Al dar de baja al paciente, estos snapshots quedan sin marca de baja y sin forma de cascadearlos (el guard de inmutabilidad impide borrarlos).
- **Causa raíz**: El diseño priorizó inmutabilidad anti-tamper sobre la capacidad de reflejar la baja del paciente.
- **Impacto**: Snapshots históricos consultables por `patient` sin marca de baja, fuera del alcance del derecho de cancelación (fuga de estado, no corrupción).
- **Complejidad de solución**: Media
- **Recomendación**: Agregar un campo de baja lógica (`patientDeletedAt`) que el guard permita escribir en whitelist, y cascadearlo. Documentar la tensión retención NOM-004 (5 años) vs cancelación LFPDPPP.

**DB-INT-06 — Usuario sin baja lógica; 73 referencias (incluidas firmas NOM-024) sin guardarraíl**
- **Ubicación**: users.js (solo `active:false`, sin soft-delete) frente a 73 refs `ref:'Usuario'`: doctor_id, openedBy, firmadoPor, auditLog.userId (required), etc.
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Integridad referencial
- **Evidencia**: Los usuarios se gestionan con `active:false` y no hay código que los elimine, pero tampoco constraint que prohíba borrarlos. Si algún script futuro borra un Usuario referenciado, todas las firmas electrónicas y entradas de auditoría que lo apuntan quedan colgando; los populate devuelven null en silencio. La seguridad actual depende solo de la convención no codificada "los usuarios nunca se borran".
- **Causa raíz**: No hay política explícita a nivel de datos (equivalente a ON DELETE RESTRICT) que prohíba borrar un Usuario referenciado.
- **Impacto**: Riesgo latente: cualquier futuro "eliminar usuario" produciría huérfanos en firmas y auditoría, invalidando la cadena de responsabilidad NOM-024/NOM-004.
- **Complejidad de solución**: Baja
- **Recomendación**: Codificar la invariante con un `pre('deleteOne'/'deleteMany')` que lance error si el usuario está referenciado; usar exclusivamente `active:false`. Para un futuro borrado LFPDPPP, definir anonimización controlada que conserve el `_id`.

**DB-INT-07 — Fechas de negocio con `default: Date.now` enmascaran datos faltantes; boxSessionId no required**
- **Ubicación**: cashMovement.js:37-40 (date default now, sin required), cashMovement.js:51-54 (boxSessionId sin required), patientCharge.js:31 (fecha required + default now)
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Consistencia
- **Evidencia**: `cashMovement.date` usa `default:Date.now` sin required → un movimiento sin fecha explícita queda estampado con la hora de inserción, no la real. `boxSessionId` no es required a nivel schema (por tolerancia a legacy) → es posible persistir un movimiento sin sesión, que queda fuera de cualquier corte de caja. En `patientCharge`, `fecha` es required pero con `default:Date.now`, así que el required nunca dispara.
- **Causa raíz**: `default:Date.now` junto con (o en lugar de) `required` convierte campos temporales de negocio en "siempre presentes" aunque el usuario no los capture.
- **Impacto**: Fechas que reflejan captura y no el hecho económico (problema en arqueos y captura extemporánea NOM-004); movimientos sin `boxSessionId` que desaparecen de reportes de sesión sin error visible.
- **Complejidad de solución**: Media
- **Recomendación**: Tras migrar los legacy, hacer `boxSessionId` required (o índice parcial). Separar "fecha del hecho" (required, sin default) de "fecha de registro" (`createdAt` automático).

#### Índices

**DB-IDX-01 — Modelo `exam` sin índice de `paciente_id` y `getAllExams` sin paginación**
- **Ubicación**: exam.js:4-8 (`paciente_id` sin index; solo `appointmentId` indexado) y examController.js:10 (`getAllExams`) / :40 (`getExamsByPatient`)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Base de datos - Índices
- **Evidencia**: En `exam.js` solo `appointmentId` tiene `index:true`; ni `paciente_id` ni `doctor_id` ni `deletedAt` están indexados. El controlador consulta `Exam.find({paciente_id, deletedAt:null})` (endpoint dedicado del expediente) → COLLSCAN. Peor: `getAllExams` hace `Exam.find({deletedAt:null})` **sin sort, sin limit, sin paginación** + doble populate. Agravante verificado: `exam.js` no define `autoIndex` ni se pasa a `createIndexes()` en el arranque, así que en producción probablemente ni `appointmentId` se construye — el único índice garantizado es `_id`.
- **Causa raíz**: `exam.js` es de los modelos antiguos, no tocado en la ola de fixes de índices que sí arregló treatment/cashMovement. Se indexó `appointmentId` por auditoría pero se olvidó el acceso primario real (por paciente). `getAllExams` nunca se pensó para escala.
- **Impacto**: La lista de exámenes por paciente escanea toda la colección; `getAllExams` trae todo a memoria — bomba de tiempo de heap que crece con los años. Irrelevante hoy (volumen moderado), grave a decenas de miles de exámenes.
- **Complejidad de solución**: Baja
- **Recomendación**: Agregar `examSchema.index({paciente_id:1, deletedAt:1})` y sumar Examen a `createIndexes()` de arranque. Reescribir `getAllExams` con paginación obligatoria o eliminarlo si no es caso de uso real.

**DB-IDX-02 — Búsqueda de pacientes por regex `'i'` sin ancla no usa índice (COLLSCAN)**
- **Ubicación**: patientsController.js:248-259 (`searchPatients`) vs índices patient.js:1010-1013,1028-1032
- **Severidad**: Baja (ajustada desde Alta)
- **Categoría**: Base de datos - Índices
- **Evidencia**: `new RegExp(escaped, 'i')` (case-insensitive, sin `^`) sobre un `$or` de 5 campos → MongoDB no puede usar índice B-tree, degrada a COLLSCAN; los índices compuestos de nombre quedan inútiles. **Pero** el consumidor real usa debounce de 250ms + rate-limit, y `paciente_id` tiene tope duro de 4 dígitos → **máximo ~9000 documentos diminutos**, haciendo el COLLSCAN una operación sub-10ms. El impacto "satura CPU/IO" no es creíble con ese techo.
- **Causa raíz**: Búsqueda por subcadena "contiene" con regex insensible en vez de índice de texto o campo normalizado indexable por prefijo.
- **Impacto**: Higiene/escalabilidad, no saturación real hoy. Se convertiría en problema si el techo de 9000 se levantara (SaaS multi-tenant).
- **Complejidad de solución**: Media
- **Recomendación**: Anclar `^` sobre un campo lowercase indexado con collation, o campo `nombreCompletoNormalizado` + índice `$text`; buscar `paciente_id`/`documento.numero` por igualdad, no por regex. (Prioridad baja hoy, obligatorio antes de SaaS.)

**DB-IDX-03 — Índices de soft-delete faltantes en colecciones clínicas (COLLSCAN latente)**
- **Ubicación**: `deletedAt` en exam/prescription/odontograma/periodontogram/patientAttachment/cashMovement sin índice de apoyo (solo patient, treatment, appointment lo indexan)
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Índices
- **Evidencia**: El patrón soft-delete NOM-004 (`deletedAt:null` = activo) atraviesa casi toda query de listado clínico, pero solo algunas colecciones tienen índice que lo cubra. `treatment.js:71` documenta explícitamente que sin él eran COLLSCAN — el mismo problema no se revisó sistemáticamente en las demás.
- **Causa raíz**: Índices añadidos reactivamente donde se detectó lentitud, sin revisión sistemática de cobertura del predicado `deletedAt` combinado con la clave de acceso (patientId + fecha).
- **Impacto**: A escala de años, los listados "documentos activos del paciente X ordenados por fecha" harán scans, degradando latencia — el costo aparece tarde, cuando es más caro diagnosticar.
- **Complejidad de solución**: Baja
- **Recomendación**: Añadir índices compuestos `{claveAcceso, deletedAt, fecha}` a las colecciones que faltan, alineados al patrón de treatment/patient. Verificar con `explain()`.

_(Índices adicionales Media/Baja no verificados: DB-IDX — agenda global de citas sin índice que empiece por `fecha_hora` y filtro de listado sin `deletedAt:null`; `patientCharge` sin compuesto `{patientId, fecha}`; índices redundantes de un solo campo en los *History cubiertos por compuestos; índices "preventivos" de nombre en patient huérfanos por el regex; `cashMovement` sin `{boxSessionId, date}`.)_

#### Modelado y Relaciones

**DB-MOD-01 — Arrays clínicos embebidos sin cota en `patient` (notas_evolucion, planes_tratamiento)**
- **Ubicación**: patient.js:490-531 (planes_tratamiento), 534-596 (notas_evolucion); append `$push $position:0` en patientsController.js:1551 — _(hallazgo detectado por dos dimensiones distintas, fusionado)_
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Base de datos - Escalabilidad
- **Evidencia**: Ambos arrays crecen monótonamente dentro del documento raíz `Patient`; cada nota es pesada (~40 campos, 3 hashes SHA-256, bloque de captura extemporánea, auditoría). MongoDB limita cada documento a 16MB. **Mitigaciones verificadas que bajan la severidad**: los caminos calientes de escritura ya usan operadores atómicos (`$push`/`$set` posicional) que NO reescriben el documento ni disparan el hook `pre('save')` costoso; las firmas se guardan como URLs de archivo en disco, no base64 → cada nota ≈ 2-8 KB; los listados proyectan fuera los arrays pesados con `.select()`/`.lean()`. Alcanzar 16MB exige del orden de miles de notas en UN paciente.
- **Causa raíz**: Diseño documento-céntrico que embebe historial de cardinalidad ilimitada en el aggregate raíz (herencia de la "estructura legacy normalizada" que el propio schema comenta).
- **Impacto**: Deuda de escalabilidad a horizonte multi-década para pacientes crónicos, no amenaza viva. Riesgo residual real: crecimiento sin techo por diseño + campos de texto de la nota **sin `maxlength`** en el schema (el único freno es el límite global de body JSON de 10mb) + no hay monitoreo de `bsonSize`.
- **Complejidad de solución**: Alta
- **Recomendación**: Mitigación barata inmediata: agregar `maxlength` a los campos de texto de la nota y alertar sobre `bsonSize` por paciente. Trabajo planificado (sin urgencia): extraer `notas_evolucion`/`planes_tratamiento` a colecciones referenciadas por `patientId` (como ya se hizo con odontograma/appointment), migración forward-only preservando `_id` y hashes firmados.

**DB-MOD-02 — Odontograma versiona por partida doble (array embebido `history[]` + colección separada)**
- **Ubicación**: odontograma.js:194 (`history:[historyEntrySchema]` embebido) coexistiendo con colección `odontograma_history`
- **Severidad**: Baja (ajustada desde Alta)
- **Categoría**: Base de datos - Modelado
- **Evidencia**: La premisa original ("doble fuente de verdad con riesgo de inconsistencia") resultó **falsa** al verificar: el odontograma clínico ya NO escribe el array embebido (comentario explícito en odontogramaController.js:775-781: "se conserva intacto como fuente legacy de solo lectura"); la versión se crea únicamente en `odontograma_history`. La lectura es fallback (usa la colección; solo cae al embebido si está vacía para pacientes legacy), nunca mezcla ambas. El array `history[]` sigue como store ACTIVO solo del odontograma **inicial** (captura única con imagen), que no usa la colección — es una estrategia por tipo, no dos estrategias para el mismo dato.
- **Causa raíz**: El `historyEntrySchema` y el array siguen declarados cumpliendo doble rol (store del inicial + fallback legacy del clínico); smell de mantenimiento, no defecto de integridad.
- **Impacto**: Oportunidad de consolidación/limpieza de schema, no riesgo de datos.
- **Complejidad de solución**: Media
- **Recomendación**: Consolidar la estrategia de versionado del inicial también hacia la colección, o documentar formalmente el doble rol del array embebido.

**DB-MOD-03 — Historiales usan `Mixed` para el snapshot clínico legalmente conservado**
- **Ubicación**: odontogramaHistory.js:42-45 (`datos: Mixed`), periodontogramHistory.js:40-43 (`teeth: Mixed`)
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Modelado
- **Evidencia**: Las colecciones de historial almacenan el snapshot como `Schema.Types.Mixed`. Esto significa que el dato clínico que legalmente debe preservarse 5+ años (NOM-004) queda **sin esquema** en la BD: cualquier forma que se inserte se persiste sin validar `numeroDiente`, rangos de sondaje/margen, ni estructura de 4 caras que el modelo vivo sí valida estrictamente.
- **Causa raíz**: Uso de `Mixed` para conservar la misma forma que `current` y evitar recodificar el sub-schema; toda la validación se delega a código previo a la escritura.
- **Impacto**: La copia que se conservará años es la menos validada. Un bug en el armado del snapshot, una migración futura o un camino nuevo puede grabar historial corrupto sin que Mongoose lo rechace, y al ser inmutable ya no se corrige.
- **Complejidad de solución**: Media
- **Recomendación**: Tipar `teeth`/`datos` con el mismo sub-schema del documento vivo (aunque con validación laxa), o versionar el formato del snapshot y almacenarlo junto para lecturas futuras deterministas.

**DB-MOD-04 — Enums de estado documental solapados con defaults inconsistentes**
- **Ubicación**: odontograma.js:197-201 (`estado`, default OFICIAL) vs periodontogram/exam/prescription/treatment (`estadoRegistro`) vs periodontogram.js:378-382 (segundo enum `status`); defaults divergentes
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Modelado
- **Evidencia**: El concepto "estado del registro para firma/inmutabilidad" se llama `estado` en odontograma y `estadoRegistro` en el resto, con los mismos valores. Los defaults divergen para documentos equivalentes: la mayoría default `OFICIAL`, pero `periodontogram.estadoRegistro` default `BORRADOR` (con comentario explícito de que `OFICIAL` causaba bloqueo por inmutabilidad). Dentro del mismo `patient.js`, `notas_evolucion` default BORRADOR pero `planes_tratamiento` default OFICIAL. El periodontograma arrastra además un segundo enum paralelo `status`.
- **Causa raíz**: El campo de estado se copió entre modelos sin unificar nombre ni default; el default "seguro" (BORRADOR) se corrigió solo en algunos a medida que se descubría el bug.
- **Impacto**: Defaults `OFICIAL` crean registros marcados como firmados/inmutables SIN firma real si un camino omite el campo — exactamente el riesgo que los comentarios de periodontograma/notas documentan haber sufrido. Dos enums en periodontograma pueden contradecirse.
- **Complejidad de solución**: Media
- **Recomendación**: Unificar nombre (`estadoRegistro`) y default (`BORRADOR`) en todos los modelos firmables; deprecar el `status` del periodontograma; migración que normalice legacy nacidos OFICIAL sin `firmadoEn`.

**DB-MOD-05 — Ausencia total de integridad referencial declarada + pre('remove') peligroso**
- **Ubicación**: todos los ObjectId con `ref` sin verificación de existencia ni cascada; `patient.pre('remove')` en patient.js:717 solo borra archivos de disco
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Base de datos - Integridad referencial
- **Evidencia**: Ningún modelo verifica que la referencia apuntada exista, y no hay cascada declarada. El único hook de borrado, `patient.pre('remove')`, solo elimina la carpeta de archivos — NO toca ninguna colección hija (appointments/charges/exams/odontogramas/... quedarían con `paciente_id` huérfano). MongoDB no ofrece FK, así que cada referencia es un puntero no garantizado.
- **Causa raíz**: MongoDB no impone integridad referencial y el proyecto no introdujo una capa que la simule.
- **Impacto**: A años vista se acumulan referencias huérfanas que rompen populate y falsean reportes/auditorías NOM-024. El `pre('remove')` que solo borra archivos puede destruir la carpeta física mientras los documentos hijos siguen refiriendo al paciente.
- **Complejidad de solución**: Alta
- **Recomendación**: Centralizar la política de borrado del paciente en un servicio que cascadee soft-delete a todas las colecciones hijas (converge con DB-INT-01). Documentar que el borrado físico está prohibido por NOM-004 y que el `pre('remove')` actual es peligroso si se invocara.

_(Consistencia adicional Baja no verificada: idioma mixto español/inglés en nombres de campo entre y dentro de colecciones — `amount`/`monto`, `date`/`fecha`, `status`/`estado`/`estadoRegistro` — deuda de mantenibilidad.)_

#### Migraciones, Escalabilidad y Operación

**DB-OPS-01 — Backups sin scheduling forzado ni offsite por defecto; restore sin verificación automática**
- **Ubicación**: scripts/backup-db.js (BACKUP_BASE = `<repo>/backups`, mismo disco; sin cron en package.json), scripts/restore-db.js (solo imprime recordatorio, no verifica)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Base de datos - Migraciones/Operación
- **Evidencia**: `backup-db.js` hace mongodump full bajo demanda al mismo disco de la BD; cifrado/offsite son solo comentario, no impuestos. `restore-db.js` tras un restore exitoso solo IMPRIME "verifica conteos y firmas NOM-024", no ejecuta `verifyChain` ni compara conteos. **Mitigación verificada que baja la severidad**: `docs/server/operacion/backups-y-restauracion.md` YA documenta el schedule (schtasks/cron diario con `--keep=14`), la prueba de restauración obligatoria con criterios de éxito, la recuperación ante desastre, y un checklist que exige medio cifrado + copia fuera del equipo. Es diseño on-premise deliberado (setup único de SO documentado, no dependencia de cron en la app).
- **Causa raíz**: El backup se concibió como herramienta manual y paso previo del migrate; la automatización está documentada pero no pre-instalada (depende de que el instalador siga el runbook), y el default del binario escribe al mismo disco.
- **Impacto**: Si el instalador no ejecuta el runbook, la clínica puede pasar semanas sin respaldo; al vivir en el mismo disco, un fallo de disco/ransomware se lleva BD y backups juntos. Sin oplog (standalone) se pierde lo escrito entre el último dump y el desastre.
- **Complejidad de solución**: Media
- **Recomendación**: Asegurar que el instalador ejecute el checklist ya documentado; defaultear/forzar destino externo cifrado; añadir verificación automática post-restore (`verifyChain` + comparación de conteos, salir con código ≠ 0 si falla).

**DB-OPS-02 — Despliegue standalone sin replica set: sin transacciones reales, sin PITR, punto único de falla**
- **Ubicación**: config/db.js:20-38 (sin replicaSet); withTransaction degrada a fallback en 4 controllers; autoIndex off en prod (patient.js:652)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Base de datos - Escalabilidad/Operación
- **Evidencia**: MongoDB standalone sin réplica → (a) sin transacciones multi-documento reales (`withTransaction` siempre toma el camino degradado, así que cargo+cita y versión+current corren sin atomicidad), (b) sin oplog no hay point-in-time recovery (solo el último mongodump), (c) `autoIndex` off en prod, los índices únicos dependen de `createIndexes()` al arranque. **Mitigación verificada**: existe una red de seguridad deliberada — `scripts/dent.js` ejecuta dos pasadas de índices con un `utils/ensureIndexes.js` que construye índices uno por uno, clasifica E11000 vs conflicto de nombre, loguea remediación accionable y apunta a `findPatientDuplicates.js`.
- **Causa raíz**: Topología de un solo nodo elegida por simplicidad de despliegue on-premise, que traslada a la capa de datos la ausencia de failover, atomicidad multi-doc y PITR.
- **Impacto**: Punto único de falla: si el proceso/disco cae, la clínica no opera y se pierde la ventana entre backups. La falta de atomicidad multi-doc expone escrituras compuestas a estados intermedios ante crash. Para un producto vendido a varias clínicas es un riesgo estructural que debe declararse al cliente.
- **Complejidad de solución**: Alta
- **Recomendación**: Para producción, evaluar replica set mínimo (habilita transacciones reales, failover, oplog/PITR). Como mínimo, documentar formalmente RPO/RTO del standalone y compensarlo con backups verificados. Ampliar `ensureCriticalIndexes` más allá de Patient y escalar operativamente (alerta) el fallo de `createIndexes`, no solo loguearlo. (Ver "requiere decisión del dueño".)

**DB-OPS-03 — Anexo legacy: `preferences` fuera de enum puede bloquear cambios de credenciales; sin migración 0005**
- **Ubicación**: users.js:116 (theme enum), 132 (signatureInput enum); audit-legacy-users.js (self-check); ausencia de migración 0005; write-path PATCH /me/preferences (settingsRoutes.js:100) sin validador
- **Severidad**: Media tendiendo a Baja (ajustada desde Alta)
- **Categoría**: Base de datos - Consistencia
- **Evidencia**: Mongoose valida el sub-documento completo en cada `save()`; un usuario con `preferences.signatureInput`/`theme` fuera de enum no podrá guardar cambio de contraseña/PIN (flujos que usan `findById()+save()`). **Verificación (git history)**: la causa raíz original ("se estrechó el enum sin migración") es falsa — ambos enums nacieron ya restringidos y nunca se estrecharon, así que no existe la población legacy que el hallazgo asumía. El estado vulnerable solo es alcanzable por un request manipulado a `PATCH /me/preferences` (que usa `findByIdAndUpdate` sin `runValidators` y sin validador de entrada), no por el cliente real (radios con opciones cerradas). Sin población afectada demostrada.
- **Causa raíz**: Revalidación de sub-documento completo en flujos de credenciales + falta de validación en el write-path de `preferences`.
- **Impacto**: Bug de robustez defensivo, no incidente activo. Si un dato malo llegara (tampering/import externo), brickearía los cambios de credenciales de ese usuario.
- **Complejidad de solución**: Baja
- **Recomendación**: La corrección mínima correcta es **en código**, no solo la migración 0005: validar la entrada de `preferences` y usar `save({validateModifiedOnly:true})` o `runValidators:true` en los flujos de credenciales (una migración 0005 sola no cierra el hueco porque el dato malo podría reaparecer). Correr `audit-legacy-users.js` contra la BD real para dimensionar (probablemente cero).

_(Migraciones adicionales Media no verificadas: colección `migrations` sin índice único en `id` ni advisory-lock → doble aplicación posible si se automatiza el deploy; `verifyChain` carga toda la cadena en memoria con `.lean()` sin cursor/checkpoint → impracticable a 100K+ entradas de auditoría, justo cuando más importa; runner sin atomicidad multi-doc → un `up()` que aborte a mitad deja datos parcialmente mutados, recuperación depende de idempotencia manual de cada migración.)_

### Hallazgos que requieren decisión del dueño

Dos decisiones estructurales de esta fase no son "bugs a corregir" sino inversiones que dependen del roadmap del producto:

1. **Representación del dinero (DB-INT-03)**: migrar de float IEEE-754 a centavos/Decimal128 es una migración de datos amplia (complejidad Alta). Para un cliente único con volumen moderado el riesgo de descuadre es bajo hoy; la decisión es si se paga ahora o se difiere con un job de reconciliación como red de seguridad.

2. **Topología standalone vs replica set (DB-OPS-02)**: habilitar transacciones reales, failover y PITR requiere un replica set (complejidad Alta, cambia el modelo de despliegue on-premise). Es una decisión de negocio/arquitectura, especialmente relevante de cara al SaaS. Como mínimo debe **declararse formalmente al cliente** el RPO/RTO del despliegue standalone.

3. **Nombre canónico de FK (DB-INT-02)**: unificar `paciente_id`/`patientId`/`patient` con una migración de `$rename` toca `SIGNABLE_FIELDS` del hash NOM-024, por lo que implica re-firmar registros legales. La alternativa sin tocar firmas (capa de repositorio que abstraiga el nombre físico) es de menor riesgo — el dueño decide entre pagar la migración con re-firma o adoptar el adaptador.

### Hallazgos descartados en verificación (transparencia)

Ningún hallazgo de esta fase recibió veredicto `FALSO_POSITIVO` — toda la evidencia factual se confirmó leyendo schemas/migraciones/scripts reales. El mecanismo de calibración fue exclusivamente el ajuste de severidad a la baja. Casos donde la verificación refutó una **pieza específica** de la evidencia (aunque el hallazgo se mantuvo con menor severidad):

- **paciente_id de 4 dígitos**: el "alta abortada por E11000 no reintentado" es falso — `savePatientWithRetry` ya reintenta regenerando el id. Solo sobrevive el techo de 9000 a horizonte multi-década.
- **periodontogram unique**: el E11000 predicho no es alcanzable por ningún camino actual (las queries `findOne({patient})` sin filtro `deletedAt` interceptan antes con un 409); y la afirmación de que la migración 0002 dejaría un fantasma es falsa (0002 hace `deleteOne` físico). Queda como inconsistencia de schema latente + un bug distinto no reportado (esas queries devuelven docs soft-deleted).
- **preferences legacy**: la causa raíz "se estrechó el enum" es falsa por git history; no hay población legacy demostrada.
- **backups**: la premisa "falta la capa operativa (schedule/offsite/verificación)" está refutada por `docs/server/operacion/backups-y-restauracion.md`, que ya documenta todo eso; el gap real es que no está pre-instalado por el instalador.

### Conclusión de base de datos

La capa de datos es sólida en integridad clínica y ya absorbió varias rondas de endurecimiento; ningún hallazgo sobrevivió en Alta/Crítica. Las 3 acciones de mayor impacto/menor esfuerzo de esta fase (sin implementarlas):

1. **Completar `runCascade`** (DB-INT-01, complejidad Baja): añadir el soft-delete de Examen (el único con camino de escritura vivo, hoy deja exámenes activos de pacientes dados de baja), y de Tratamiento/Receta como blindaje preventivo. Centralizar la lista de colecciones-hijas-de-Patient en un array declarativo para que futuros modelos no se olviden. Cierra un gap real de consistencia/compliance con muy poco código.

2. **Cerrar los agujeros de índices y paginación** (DB-IDX-01/03, complejidad Baja): agregar `{paciente_id, deletedAt}` a `exam` (+ sumarlo a `createIndexes()` de arranque + paginar `getAllExams`, que hoy es una bomba de heap), y los índices compuestos de soft-delete que faltan en las colecciones clínicas. Previene COLLSCAN y agotamiento de memoria que solo aparecen tarde, cuando son caros de diagnosticar.

3. **Endurecer la operación de respaldo** (DB-OPS-01, complejidad Media): garantizar que el instalador ejecute el runbook ya documentado (schedule + destino externo cifrado), y añadir verificación automática post-restore (`verifyChain` + conteos, con código de salida ≠ 0 si falla). Para un producto que custodia expedientes clínicos legales, la confianza en el respaldo es ilusoria sin verificación automática — y el runbook ya existe, solo falta forzar su ejecución y automatizar el check.

Las decisiones de mayor alcance (dinero como Decimal128, replica set para transacciones/PITR, nombre canónico de FK con re-firma) quedan correctamente para el dueño del producto, no como correcciones urgentes de esta fase.

---

## Fase 6 — Seguridad

> Nota de proceso: dos de las cinco dimensiones (inyección/XSS/CSRF/path-traversal y exposición de datos) devolvieron placeholders de prueba en las primeras corridas y fueron re-ejecutadas; la dimensión de inyección se recuperó finalmente con un agente de texto libre (el esquema forzado inducía el placeholder). El agente de síntesis también se vio afectado, por lo que esta sección fue redactada directamente a partir de los datos ya verificados adversarialmente de las 5 dimensiones, sin pérdida de información. Ninguna transcribe valores de secretos.

### Resumen de la fase

La postura de seguridad **base** de Dentia Core es notablemente sólida para un producto de un solo desarrollador, y varias rondas de endurecimiento previas dejaron huella: bcrypt con cost 12, access token de la app solo en memoria (no en localStorage, lo que lo protege de robo por XSS), refresh token en cookie `httpOnly`+`sameSite`+`secure` con rotación y detección de reuso, lockout de login y de PIN, login timing-safe con dummy hash contra enumeración, arranque **fail-fast** que rechaza secretos débiles/ausentes en producción (sin fallback hardcodeado en el camino de producción), helmet con CSP (`scriptSrc 'self'`), y `.env` reales correctamente fuera de git. La verificación adversarial confirmó además que **tres clases enteras de vulnerabilidad no son explotables**: XSS (React auto-escapa, cero `dangerouslySetInnerHTML`, la impresión usa iframe aislado), CSRF clásico (auth por `Bearer` header + `SameSite` en cookies), y path traversal en uploads (validación estricta 24-hex de ObjectId + nombres de archivo generados server-side).

Sobre esa base sólida, la auditoría encontró **2 hallazgos Alta confirmados** y un conjunto de hallazgos Media que comparten una raíz común: **el control de acceso a nivel de dato-por-rol es inconsistente**. La infraestructura de sanitización por rol existe y funciona para pacientes (`sanitizeAppointmentForBasicRead`, `filterPatientFields`), pero no se aplicó a varios recursos hermanos igual de sensibles — los endpoints de lectura de citas devuelven el motivo de consulta y observaciones clínicas al rol recepcionista; el listado de adjuntos clínicos y la firma digital del doctor son accesibles por cualquier sesión autenticada. Este es el patrón más importante de la fase porque **aplica sin importar la exposición de red**: es un incumplimiento de NOM-004 (acceso al expediente restringido a personal clínico) y del principio de proporcionalidad de LFPDPPP, incluso en una LAN aislada.

Nota honesta sobre el modelo de amenaza: el sistema es on-premise para un solo cliente, lo que mitiga fuertemente los vectores que requieren exposición a internet abierto (los CVEs de dependencias, el OAuth-CSRF, MongoDB sin autenticación en `127.0.0.1`). Pero el dueño pidió explícitamente auditar **como si estuviera expuesto**, y sobre todo hay una distinción clave: los hallazgos de **frontera de rol interno** (recepción viendo PHI clínico, firma del doctor descargable por cualquiera) son reales y de cumplimiento legal **con o sin exposición a internet**, porque el atacante relevante ahí es una cuenta interna de la propia clínica o una estación comprometida, no un atacante remoto.

Conteo tras verificación adversarial (fusionando duplicados entre dimensiones): **0 Crítica, 2 Alta, ~5 Media confirmados/ajustados, ~2 Baja**, más ~18 hallazgos en estado `NO_VERIFICADO_MEDIA_BAJA` (varios de ellos genuinamente relevantes: MongoDB sin autorización, `ENCRYPTION_KEY` aprovisionada pero nunca usada, el clúster de exposición por rol, confianza ciega en el payload del JWT). **1 falso positivo** descartado (el `NODE_ENV=development` del `.env.example` quedó en gran parte refutado porque el instalador genera un `.env` fresco con `production` y el `package.json` lo fuerza).

### Hallazgos confirmados

#### Autenticación

**SEC-01 — Revocación de sesión incompleta en resetPassword (refresh token robado sobrevive al reset)**
- **Ubicación**: Server/controllers/authController.js — `resetPassword()` líneas 529-538 (limpia `refreshTokenHash`/`refreshTokenExpiresAt` pero NO `previousRefreshTokenHash`); explotable vía `refresh()` líneas 235-252. Misma omisión en settingsController.js `changeMyPassword` (203-204) y usersController.js `updateUser` (278-279).
- **Severidad**: Alta (CONFIRMADO)
- **Categoría**: Seguridad - Autenticación
- **Evidencia**: `resetPassword` pone `refreshTokenHash=null` y `refreshTokenExpiresAt=null` pero omite `previousRefreshTokenHash`, que sobrevive. `refresh()` acepta el token si coincide con el actual **o con el previo** (`matchesPrevious`, línea 241) y re-emite un par de tokens fresco. `logout()` (líneas 275-277) sí limpia los tres, confirmando que la omisión es un descuido. La ruta `POST /auth/refresh` es pública (solo rate-limit + cookie); el JWT de refresh vive 7 días. Vector: atacante roba un refresh token; una rotación posterior (natural con access tokens de vida corta, o forzada por el propio atacante) mueve su hash a `previousRefreshTokenHash`; la víctima resetea su contraseña creyendo cerrar todo; el atacante llama `/auth/refresh` → `matchesPrevious=true` → recupera acceso persistente.
- **Causa raíz**: `previousRefreshTokenHash` (introducido para tolerar refresh multi-tab) no se incluyó en la rutina de invalidación total de sesión, a diferencia de `logout`. Falta un único punto de "revocar todas las sesiones".
- **Impacto**: El reset de contraseña — control primario de recuperación ante cuenta comprometida — no expulsa al atacante, que mantiene acceso a expedientes clínicos, caja y auditoría. Falla de gestión de sesiones/no-repudio relevante a NOM-024 (CWE-613).
- **Complejidad de solución**: Baja
- **Recomendación**: Extraer `user.revokeAllSessions()` que limpie los tres campos y usarlo en `logout`, `resetPassword`, `changeMyPassword`, `updateUser`, desactivación de usuario y detección de reuso, eliminando la divergencia de raíz.

#### Autorización / IDOR / Exposición por rol

**SEC-02 — Fuga de PHI clínico de citas al rol recepcionista (BOLA de campo)**
- **Ubicación**: Server/controllers/appointmentController.js — `getAppointmentById` (273-288), `getTodayAppointments` (250-270), `getAllAppointments` (196-247); rutas appointmentRoutes.js:8-11 (`authorize(['appointments.read'])` sin sanitización)
- **Severidad**: Alta (CONFIRMADO)
- **Categoría**: Seguridad - Exposición de datos / Autorización
- **Evidencia**: Los tres endpoints de lectura de citas devuelven el documento `Appointment` completo — incluyendo `motivo`, `observaciones`, `comentarioProcedimiento`, `items`, `totalEstimado` — con solo `authorize(['appointments.read'])`, permiso que **posee el rol recepcionista** (permissions.js:168). No aplican `filterPatientFields` ni `sanitizeAppointmentForBasicRead`, pese a que esa infraestructura de sanitización existe, está exportada y sí se usa en las rutas de pacientes (patientRoutes.js:181,202,208).
- **Causa raíz**: El post-filtro por rol se implementó para el recurso Paciente pero no se replicó en el recurso Cita, semánticamente equivalente en sensibilidad.
- **Impacto**: Fuga de PHI (el motivo de consulta es dato sensible de salud) a personal no clínico; incumple NOM-004 Art. 5.7 (acceso al expediente restringido a personal clínico) y proporcionalidad LFPDPPP Art. 6. Aplica incluso sin exposición a internet.
- **Complejidad de solución**: Baja
- **Recomendación**: Añadir a appointmentRoutes un middleware análogo a `filterPatientFields` que marque `req.filterClinicalData` cuando el actor no tenga acceso clínico, y mapear la respuesta con `sanitizeAppointmentForBasicRead` (ya exportado) en los tres controladores.

**SEC-03 — Firma digital del doctor descargable por cualquier sesión autenticada**
- **Ubicación**: Server/middlewares/uploadsAuth.js:44-57 (`classifyUploadPath`) y :129-133 (rama 'non-patient'); archivos generados en uploadFirma.js:23-28 (`${userId}_firma_${Date.now()}.png`)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Seguridad - Exposición de datos
- **Evidencia**: La firma digital del doctor (PNG legalmente vinculante, NOM-004/NOM-013) se sirve vía `/uploads/firmas/...`. `classifyUploadPath` clasifica todo lo que no esté bajo `/pacientes/<id>/` como 'non-patient', y la rama final solo exige `hasValidSession(req)` — cualquier rol autenticado, incluida la recepcionista, puede descargarla. El endpoint sancionado `GET /api/settings/users/:userId/firma` sí exige `requireClinicalRole`, así que la ruta estática es un gate más débil. El nombre (`<userId>_firma_<timestamp>.png`) es parcialmente adivinable (el `userId` es un ObjectId que aparece en múltiples respuestas). Ajustado a Media porque el `timestamp` dificulta la adivinación exacta del nombre, pero el defecto estructural (control de acceso por sesión y no por rol) es real.
- **Causa raíz**: `/uploads/firmas` cae en la clasificación genérica 'non-patient' que solo valida sesión, en lugar de tratarse como recurso de alta sensibilidad que exija rol firmante.
- **Impacto**: Exfiltración de la firma autógrafa digitalizada → posible inserción en documentos falsificados, socavando el valor probatorio de la firma electrónica (NOM-004 Art. 5.10, NOM-013). Confidencialidad + integridad legal.
- **Complejidad de solución**: Baja
- **Recomendación**: Clasificar `/uploads/firmas` como recurso clínico y exigir `requireSignerRole`/`requireClinicalRole` (no solo sesión); idealmente servir la firma solo vía endpoint controlado, no por estático. Añadir un componente aleatorio (`crypto.randomBytes`) al nombre.

#### Inyección (NoSQL)

**SEC-04 — Inyección de operadores `$` vía parámetro `?version` en odontograma y periodontograma**
- **Ubicación**: Server/controllers/odontogramaController.js:549-550 (`verificarOdontogramaClinico`) y periodontogramController.js:886-888 (`getPeriodontogramData`)
- **Severidad**: Media (CONFIRMADO, dos vectores)
- **Categoría**: Seguridad - Inyección
- **Evidencia**: `req.query.version` entra crudo al filtro Mongo: `findOne({ patient: patientId, versionName: req.query.version })`, sin coerción a String ni validación. Como el servidor usa `express.urlencoded({extended:true})` (parser `qs`) y **no existe `express-mongo-sanitize`** en el proyecto, un atacante inyecta `?version[$ne]=zzz` → `{versionName:{$ne:'zzz'}}` (match con cualquier versión) o `?version[$regex]=.*` (recupera la más reciente sin conocer el nombre). En periodontograma, el guard `collectForbiddenKeys` opera sobre `...rest` y excluye `version` por la desestructuración previa, así que no lo protege. No cruza frontera de autorización (el actor ya tiene `odontogram.read`/`perio.read` sobre ese paciente), de ahí Media y no Alta.
- **Causa raíz**: Ausencia de coerción a String del parámetro `version` + parser `qs` con `extended:true` + sin sanitización global de operadores `$`.
- **Impacto**: Confidencialidad — enumerar/recuperar versiones del odontograma/periodontograma (PHI) sin conocer el nombre exacto. Solo lectura, sin cruce de autorización.
- **Complejidad de solución**: Baja
- **Recomendación**: Coercer `versionName: String(req.query.version)` (o `typeof === 'string'`, 400 si no) en ambos handlers. Como defensa en profundidad transversal, montar `express-mongo-sanitize` global en dent.js (también refuerza el hallazgo de Fase 3 en `auditController.getLogs`). Nota de higiene: `models/patient.js:960/981` (`findWithFilters`) construye `RegExp` sin escapar (ReDoS/regex-injection) pero es **código muerto** (solo lo llaman tests); escapar o eliminar si se llega a cablear.

#### Configuración / Secretos / CSRF de OAuth / Dependencias

**SEC-05 — Flujo OAuth2 de Google sin nonce anti-CSRF (state solo como transporte de redirección)**
- **Ubicación**: Server/routes/googleRoutes.js — `/auth/url` (91-114) y `/oauth2callback` (117-173)
- **Severidad**: Media (ajustada desde Alta)
- **Categoría**: Seguridad - CSRF
- **Evidencia**: El parámetro `state` se construye solo con la URL del cliente y un `returnPath` (`JSON.stringify({url, path})`), sin nonce aleatorio ligado a la sesión. En el callback, `state` se lee únicamente para elegir `clientUrl`/`returnPath` y nunca se compara contra un nonce almacenado. El callback tampoco lleva `authenticate`. Permite un OAuth-CSRF clásico: el atacante inicia el flujo con su propia cuenta de Google y engaña a la víctima para completar el callback, vinculando el Google Calendar del atacante a la sesión de la clínica.
- **Causa raíz**: El `state` se diseñó como transporte de redirección, no como token anti-CSRF con nonce.
- **Impacto**: Vinculación/fijación de cuenta de Google Calendar cruzada; potencial exfiltración/creación de eventos en el calendario equivocado, con persistencia (refresh token de 30 días).
- **Complejidad de solución**: Media
- **Recomendación**: Generar un nonce criptográfico en `/auth/url`, guardarlo en cookie httpOnly firmada o sesión, embeberlo en el `state`, y rechazar el callback si no coincide. Considerar exigir `authenticate` en el callback.

**SEC-06 — Dependencias con CVEs conocidos (npm audit: highs en Server y Client)**
- **Ubicación**: Server/package.json y Client/package.json — mongoose 7.8.6, express 4.21.2, form-data, validator, multer 1.x; Client: axios 1.12.2, react-router 7.6.0
- **Severidad**: Baja-Media (ajustada desde Alta — higiene de dependencias/proceso, no explotabilidad directa demostrada)
- **Categoría**: Seguridad - Dependencias vulnerables
- **Evidencia**: `npm audit --omit=dev` reporta en Server 5 high (mongoose 7.8.6 en rango vulnerable a NoSQL injection vía `$nor` en `sanitizeFilter` — relevante dado los operadores `$` sin sanitizar; express vía body-parser/qs; form-data CRLF; validator bypass isURL) y en Client 6 high (axios SSRF/NO_PROXY bypass, react-router). multer 1.x está deprecado con CVEs de DoS. La verificación notó que la narrativa de explotabilidad estaba inflada (varios requieren condiciones no presentes), por eso Baja-Media: es deuda de mantenimiento real, no un exploit directo confirmado.
- **Causa raíz**: Dependencias sin actualizar y sin `npm audit` en el pipeline de CI.
- **Impacto**: Superficie de riesgo acumulativa; la CVE de mongoose es la más relevante por combinarse con los operadores `$` sin sanitizar (Fase 3 + SEC-04).
- **Complejidad de solución**: Media
- **Recomendación**: Actualizar mongoose a ≥7.8.9, express a la última 4.x parcheada, axios a ≥1.15.3, y migrar multer a 2.x; añadir `npm audit` al CI. Priorizar mongoose y axios.

### Hallazgos que requieren decisión del dueño

**SEC-CONFIG-MONGO — MongoDB corre sin control de acceso (authorization deshabilitado)**
- **Ubicación**: `mongod.cfg` (raíz) — `net.bindIp 127.0.0.1` pero sin sección `security.authorization`; `MONGODB_URI` sin credenciales
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Seguridad - Configuración
- **Evidencia**: `mongod.cfg` no contiene ninguna sección `security`/`authorization`: MongoDB corre con control de acceso deshabilitado, confiando enteramente en el bind a loopback. Cualquier proceso local (o un atacante que logre RCE/port-forward en el host) accede a toda la base clínica sin credenciales.
- **Causa raíz**: Decisión de despliegue on-premise que confía en el aislamiento de red en lugar de autenticación de base de datos.
- **Impacto**: Si el host se compromete o se expone el puerto, acceso total a PHI sin barrera adicional. Defensa en profundidad ausente.
- **Complejidad de solución**: Media
- **Recomendación**: Decisión del dueño — habilitar autenticación de MongoDB (usuario/rol con `MONGODB_URI` con credenciales) como defensa en profundidad, especialmente si el modelo de despliegue puede variar entre clínicas. Es una decisión de operación/instalación, no un bug de código.

**SEC-ENCRYPT — `ENCRYPTION_KEY` aprovisionada pero PHI sin cifrar at-rest**
- **Ubicación**: Server/.env.example:36 (`ENCRYPTION_KEY=` "Optional encryption key for sensitive data at rest") — la variable existe pero un grep no encuentra ningún uso en el código
- **Severidad**: Media (NO verificado adversarialmente)
- **Categoría**: Seguridad - Exposición de datos
- **Evidencia**: El `.env.example` documenta una `ENCRYPTION_KEY` para cifrado at-rest, presente también en el `.env` real, pero no se referencia en ningún punto del código: los datos clínicos se almacenan en MongoDB y en `/uploads` en claro. La expectativa de cifrado at-rest quedó a medio implementar.
- **Causa raíz**: Variable de configuración provisionada sin la implementación de cifrado correspondiente.
- **Impacto**: PHI (expedientes, odontogramas, fotos, firmas) sin cifrado at-rest; un robo de disco/backup expone todo en claro. Relevante para NOM-024/LFPDPPP.
- **Complejidad de solución**: Alta
- **Recomendación**: Decisión del dueño — implementar cifrado at-rest (a nivel de campo para los datos más sensibles, o cifrado de volumen/disco a nivel de despliegue), o retirar la variable y documentar explícitamente que el cifrado se delega al cifrado de disco del SO. No dejarla como promesa incumplida.

### Hallazgos reportados sin verificación adversarial completa (severidad declarada, transparencia)

Reportados por los agentes especializados con severidad Media/Baja, no verificados individualmente en profundidad (varios son relevantes y merecen revisión):

- **Autorización — confianza ciega en el payload del JWT** (Media): `authenticate` copia `role`/`permissions` del payload del access token sin re-consultar la BD ni verificar `active`; un cambio de rol o una desactivación de usuario no surte efecto hasta que expira el access token (15 min).
- **Exposición — adjuntos clínicos accesibles por recepción** (Media): las rutas de adjuntos aceptan `patients.read.basic`/`patients.update.basic` (que posee la recepcionista) sin `requireClinicalRole`; `listAttachments` devuelve nombre/descripción/categoría de documentos clínicos.
- **Exposición — respuestas de perfil filtran `previousRefreshTokenHash`** (Media): `updateProfessionalProfile`/`updateMyProfile` usan `.select('-contraseña -refreshTokenHash -pinHash -passwordResetToken')` pero omiten `previousRefreshTokenHash` en la negación.
- **Exposición — `getSignatureStatus` popula `firmadoPor` con email/cédula profesional** sin recortar (Media).
- **Exposición — campos sensibles del modelo Usuario sin `select:false` ni `toJSON` transform** (Media): `contraseña`/`pinHash`/`refreshTokenHash`/`previousRefreshTokenHash`/`passwordResetToken` dependen de allowlists manuales en cada query; un futuro `.find()` sin `.select()` los filtraría.
- **Autorización — odontograma inicial (imagen) servido sin `authorize`** (Media): `GET /:id/odontograma-inicial/image` usa solo `validateId`+`checkPatient`, sin el permiso `odontogram.read` que sí exigen las demás rutas de odontograma.
- **Autenticación — JWT verificado sin fijar `algorithms`** (Media): defensa en profundidad contra confusión de algoritmo si se migrara a claves asimétricas.
- **Config — fallback hardcodeado del HMAC de auditoría en no-producción** (Media): `getAuditHmacSecret` usa la constante `'dev-audit-hmac-secret-NOT-FOR-PRODUCTION'` fuera de producción (mitigado por el fail-fast en producción).
- **Config — multer 1.x deprecado** (Media): CVEs de DoS conocidos.
- **Exposición — token OAuth de Google en localStorage** (Media): robable por XSS (aunque no hay XSS explotable hoy).
- **Autorización — `updateRolePermissions` permite override autoritativo de roles editables** (Media): revisar que el modelo de permisos no permita a un administrador escalar indirectamente.
- **Secretos — `Server/.env.bak-jwt` en texto plano** (Baja): backup con el set completo de secretos de producción; bien ignorado por git (verificado, no trackeado), pero amplía la superficie de exposición en disco.
- **Exposición — `GET /api/settings` sin `authorize`** (Baja): devuelve `ClinicSettings` completo incluyendo `rolePermissionOverrides` a cualquier usuario autenticado.
- **Exposición — endpoint `/api/health` público** (Baja): expone `uptime` y estado de conexión a Mongo sin sesión.
- **CSRF/Config — CORS refleja `true` para peticiones sin `Origin` con `credentials:true`** (Baja): aceptable para curl/same-origin, no habilita CSRF desde navegador (falta el Bearer), pero es una laxitud a estrechar.
- **Exposición — `/uploads` servido con cabeceras de caché por defecto** (Baja): `Cache-Control: public` sobre PHI.
- **Autenticación — token de reset logueado en no-producción** (Baja): `forgotPassword` escribe el `rawToken` a `logger.info` fuera de producción.
- **Autenticación — verificación de `issuer` inconsistente** (Baja): `refresh()`/`logout()` verifican el JWT sin `{ issuer }`, a diferencia de `authenticate`/`uploadsAuth`.

### Hallazgos descartados en verificación (transparencia)

- **`NODE_ENV=development` en `.env.example`** — FALSO_POSITIVO (en gran parte): la premisa de que el operador copia la plantilla y colapsa el hardening quedó refutada — el instalador (`install.sh`/`install.ps1`) genera un `.env` fresco con `NODE_ENV=production`, y `Server/package.json` arranca con `cross-env NODE_ENV=production`, forzando producción independientemente de la plantilla.
- **XSS** — sin hallazgo explotable: cero `dangerouslySetInnerHTML`, React auto-escapa, CSP `scriptSrc 'self'`, impresión vía iframe aislado.
- **CSRF clásico** — mitigado: access token en `Authorization: Bearer` (no cookie), refresh token con `SameSite=lax`.
- **Path traversal en uploads** — mitigado: validación estricta 24-hex de ObjectId + nombres de archivo generados server-side con extensión derivada del MIME validado.
- **Command injection / prototype pollution** — sin hallazgo: ningún `child_process` con input de usuario; el único merge recursivo (`flattenToDot`) opera sobre datos ya filtrados por whitelist.
- **Inyección NoSQL en citas/caja/cobros/búsquedas** — descartada: `appointmentController` valida con `ObjectId.isValid`/whitelist/`Date`; `cashController` está cubierto por `query('patientId').isMongoId()` en la ruta; `searchPatients`/`auditController.searchPatients` escapan la regex y coercen a String.

### Conclusión de seguridad

La base de seguridad es sólida; los problemas son focalizados y en su mayoría de baja complejidad de corrección. Las 3 acciones de mayor impacto/menor esfuerzo (sin implementarlas):

1. **Corregir la revocación de sesión** (SEC-01, Baja): extraer `user.revokeAllSessions()` (limpia los tres campos de refresh) y usarlo en `resetPassword`, `changeMyPassword`, `updateUser`, `logout` y desactivación de usuario. Cierra el único hallazgo Alta de autenticación con un cambio trivial y elimina la divergencia de raíz.

2. **Aplicar el post-filtro por rol a citas, adjuntos y firmas** (SEC-02/SEC-03 + los Media de exposición, Baja-Media): reutilizar la infraestructura de sanitización que ya existe para pacientes (`sanitizeAppointmentForBasicRead`, `requireClinicalRole`) en los recursos hermanos que hoy la omiten. Cierra el patrón más importante de la fase — el incumplimiento NOM-004/LFPDPPP de que recepción vea PHI clínico — y aplica sin importar la exposición de red.

3. **Montar `express-mongo-sanitize` global + coercer los parámetros `?version` a String** (SEC-04, Baja): cierra de un golpe los dos vectores nuevos de inyección NoSQL de esta fase Y el de `auditController.getLogs` de Fase 3, como defensa en profundidad transversal para toda la app (que hoy corre `extended:true` sin sanitización de operadores `$`). De paso, actualizar mongoose (SEC-06) para eliminar la CVE de NoSQL injection subyacente.

Las decisiones de mayor alcance (habilitar autenticación de MongoDB, implementar cifrado at-rest de PHI) quedan correctamente para el dueño del producto — son de operación/arquitectura, especialmente relevantes de cara a un despliegue que pueda variar entre clínicas o a la futura V2 SaaS.

---

## Fase 7 — Producción

### Resumen de la fase

Dentia Core esta a medio camino entre una "app de escritorio que el dueno abre a mano" y un "servidor de clinica siempre disponible", y esa contradiccion es la fuente de casi todos los riesgos operativos graves de la fase. El producto puede funcionar dia a dia en el escritorio del dueno, pero no opera como un servicio desatendido, confiable y recuperable: no hay arranque automatico de la aplicacion al boot en ningun SO (solo MongoDB queda como servicio en Windows), el unico camino de arranque es una GUI Tkinter (`launcher.py`) que un humano debe abrir y mantener abierta, el modo por defecto (`local`) corre el backend con `nodemon` en `NODE_ENV=development` sin ningun supervisor, y pm2 —el unico mecanismo de auto-restart— ni siquiera es dependencia declarada y no persiste entre reinicios (`pm2 save`/`pm2 startup` no aparecen en el repo). Un corte de luz o un reinicio de Windows deja la clinica sin sistema hasta que alguien sepa reabrir el launcher.

El patron recurrente es "control documentado pero no forzado": el runbook (`docs/server/operacion/configuracion-produccion.md`, `backups-y-restauracion.md`) describe correctamente la generacion de secretos, el schedule de backups, el cifrado, TLS y la prueba de restauracion, pero el sistema no automatiza ni bloquea ninguno de esos pasos. Los instaladores generan `JWT_SECRET` pero nunca `AUDIT_HMAC_SECRET` (asimetria que produce el modo de fallo de PROD-01/config), el backup depende de que el dueno agende `schtasks`/`cron` a mano, ningun camino de instalacion ejecuta `npm run migrate`, y el `README.md` raiz describe un proyecto distinto al real. Junto a esto conviven fallos de robustez de runtime confirmados en codigo (el `uncaughtException` que deja el proceso vivo y posiblemente corrupto en `dent.js` L377-386, el graceful shutdown que no cierra Mongo en L351-357, y los cortes de caja atados a la TZ del SO en `cashController.js` L297-300).

Conteo de hallazgos confirmados por severidad (tras verificacion adversarial y descontando duplicados entre dimensiones): **1 Critica** (integracion de migraciones en el release — DOC PROD-01), **8 Altas** (falta de `AUDIT_HMAC_SECRET` en instaladores, sin arranque al boot de la app, sin supervisor real de proceso, precedencia invertida de `.env`, sin alertas proactivas, health check solo al arranque + siempre HTTP 200, backup silencioso, README obsoleto, runbook con nombre PM2 erroneo, `uncaughtException` sin barrera, graceful shutdown incompleto, TZ del SO en cortes de caja), y el resto en **Media/Baja**. Un hallazgo va a decision del dueno (PHI sobre HTTP plano en LAN). La ausencia de falsos positivos verificados en las dimensiones de configuracion, observabilidad, documentacion y runtime se compensa con recalibraciones a la baja en la dimension de backups por duplicacion con la fase previa de Base de Datos (DB-OPS-01/02).

El **riesgo operativo dominante** es doble y converge en el mismo perfil de cliente (clinica sin DevOps): (1) **perdida de datos silenciosa** — un backup que deja de correr o un `AUDIT_HMAC_SECRET` en fallback development que desactiva la integridad NOM-024 no se detectan hasta el dia del desastre; y (2) **indisponibilidad tras un evento discreto** — un crash del backend o un reinicio del equipo dejan la clinica detenida hasta intervencion manual, sin supervisor que reinicie ni alerta que avise. Ambos son consecuencia directa del mismo modelo mental "app de escritorio" aplicado a un contexto que exige garantias de servidor.

---

### Hallazgos confirmados

#### Configuracion y Despliegue

**CFG-01 — Instaladores no generan `AUDIT_HMAC_SECRET`; el server no arranca en produccion o corre con integridad de auditoria desactivada**
- **Ubicacion:** `install.sh` L248/L252-258/L263-284; `install.ps1` L307/L314-330; `launcher.py` L1340; vs `Server/utils/integrity.js` L197-202 (fail-fast) y `Server/scripts/dent.js` L30-37
- **Severidad:** Critica
- **Categoria:** Produccion - Configuracion / Cumplimiento
- **Evidencia:** Ambos instaladores generan el `.env` con `NODE_ENV=production` y garantizan `JWT_SECRET` (bloque dedicado en los tres: install.sh L263-284, install.ps1 L314-320, launcher.py L652-653), pero **ninguno genera `AUDIT_HMAC_SECRET`** (grep = 0 coincidencias en los tres). `dent.js` L30-37 llama `getAuditHmacSecret()` al arrancar, e `integrity.js` L197-202 lanza `'FATAL: AUDIT_HMAC_SECRET must be set (≥32 chars) in production'` con `process.exit(1)` cuando `NODE_ENV==='production'`. Resultado verificado en disco: una instalacion LAN fresca via install.sh escribiria `NODE_ENV=production` sin el secreto → **no arranca**; el `Server/.env` real actual quedo en `NODE_ENV=development` sin `AUDIT_HMAC_SECRET`, cayendo al fallback `'dev-audit-hmac-secret-NOT-FOR-PRODUCTION'` (integrity.js L213), que **desactiva la deteccion de manipulacion del audit log** exigida por NOM-024.
- **Causa raiz:** El fail-fast de `AUDIT_HMAC_SECRET` se agrego al server (Fase 3) pero los instaladores/launcher nunca se actualizaron para generarlo, a diferencia de `JWT_SECRET`. La doc lo lista como paso manual requerido (`configuracion-produccion.md` L22) pero el aprovisionamiento no esta automatizado.
- **Impacto:** O el sistema no arranca en produccion (indisponibilidad total que la clinica no puede resolver sin soporte tecnico), o corre en development con integridad de auditoria desactivada e incumplimiento regulatorio silencioso. Sin secreto estable, los HMAC de auditoria dejan de ser verificables tras cualquier cambio.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Anadir generacion de `AUDIT_HMAC_SECRET` (≥32 hex, preservado en reinstalaciones) en `install.sh`, `install.ps1` y en el fallback de `launcher._ensure_server_env_file`, con la misma logica ya usada para `JWT_SECRET`.

**CFG-02 — La aplicacion no arranca al boot en ningun SO (solo MongoDB queda como servicio)**
- **Ubicacion:** `launcher.py` (arranque de la app via GUI Tkinter); `install.ps1` L216 (`New-Service ... -StartupType Automatic` solo para MongoDB); ausencia de `pm2 startup`/`pm2 save`/LaunchAgent/systemd en `install.sh`/`install.ps1`
- **Severidad:** Alta (ajustada desde Critica)
- **Categoria:** Produccion - Disponibilidad
- **Evidencia:** El unico camino de arranque de la aplicacion es `launcher.py` (GUI Tkinter). `install.ps1` L216 registra como servicio Windows automatico **solo MongoDB**; no hay equivalente para la API/frontend. La busqueda de mecanismos de persistencia al boot para la app (`pm2 startup/save/resurrect`, `LaunchAgent`, `systemd`, `launchctl`, `Register-ScheduledTask`) no arroja resultados (las unicas coincidencias de `schtasks` estan en la doc de backups). Tras un reinicio, MongoDB vuelve pero la aplicacion clinica NO: alguien debe iniciar sesion en el escritorio y abrir el launcher a mano.
- **Causa raiz:** El modelo mental es "app de escritorio que el dueno abre", no "servidor de clinica siempre disponible". pm2 se lanza como hijo del proceso del launcher, no como demonio persistente arrancado por el SO.
- **Impacto:** Cualquier reinicio (corte de luz, actualizacion de Windows) deja la clinica sin sistema hasta intervencion manual. En horario de atencion es perdida directa de operacion; el tiempo de recuperacion depende de que alguien sepa abrir el launcher.
- **Complejidad de solucion:** Media
- **Recomendacion:** En Windows, registrar la API como servicio (o `pm2-installer`/`pm2 startup`+`pm2 save`); en Mac/Linux, un LaunchAgent/servicio systemd que corra `pm2 resurrect` o `npm start` al boot. El launcher GUI debe ser un panel de control opcional, no el unico punto de arranque.
- **Nota de calibracion:** Ajustada de Critica a Alta porque el impacto es alto pero requiere un evento gatillo (reinicio) y la recuperacion es una accion manual conocida, no una falla irreversible ni perdida de datos.

**CFG-03 — Sin supervisor real de proceso: fallback a `nodemon`/`concurrently` sin autorestart-on-crash; pm2 no es dependencia**
- **Ubicacion:** `Server/package.json` / `package.json` raiz / `Client/package.json` (pm2 no declarado en ninguno); `launcher.py` L1461-1493 (`_start_server_with_pm2`) con fallback L1530-1537 a `npm run start`; `package.json` raiz L10/L12
- **Severidad:** Alta
- **Categoria:** Produccion - Resiliencia
- **Evidencia:** pm2 no aparece en ningun `package.json`. El launcher intenta `pm2 start ecosystem.config.cjs` (L1483) y, si pm2 no esta instalado, cae con `FileNotFoundError` a `npm run start` (L1530-1537), que ejecuta `concurrently "npm run mongod" "npm run client" "npm run server"` donde `server` es `nodemon Server/scripts/dent.js` (raiz L10). Ni `concurrently` ni `nodemon` reinician un proceso que **crashea** (solo reinician ante cambios de archivos). `ecosystem.config.cjs` define `autorestart: true` y `max_memory_restart: '512M'`, pero solo aplica si pm2 existe, cosa no garantizada. Se confirma ademas que el `uncaughtException` (dent.js L377-386) NO cierra el proceso, amplificando el riesgo en la ruta sin supervisor.
- **Causa raiz:** La resiliencia se delego a pm2 pero no se hizo dependencia ni se instala en los instaladores; el fallback usa herramientas de desarrollo que no supervisan crashes.
- **Impacto:** En la ruta de fallback, un crash del proceso Node (o una excepcion no controlada que deja el proceso vivo pero inconsistente) queda sin reinicio automatico. El operador no sabe si esta corriendo supervisado o no.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Declarar `pm2` como dependencia (o instalarlo explicitamente en los instaladores) y hacer que el arranque de produccion **siempre** pase por pm2; eliminar el fallback a `npm run start`/nodemon para modo LAN o sustituirlo por un supervisor real.

**CFG-04 — Precedencia de entorno invertida: el `.env` raiz pisa con `override:true` la config de red que escriben los instaladores en `Server/.env`**
- **Ubicacion:** `Server/scripts/dent.js` L4-6 (carga `Server/.env` y luego el raiz con `override: true`); `.env` raiz en disco; instaladores en `install.sh` L238-261 / `install.ps1` L280-337
- **Severidad:** Alta
- **Categoria:** Produccion - Configuracion (precedencia de entorno)
- **Evidencia:** `dent.js` L4-6 carga `Server/.env` y despues el `.env` raiz con `override: true`, es decir el raiz **gana**. El `.env` raiz existe en disco y contiene `HOST`, `PORT`, `MONGODB_URI`, `CLIENT_URL` (verificado, valores redactados), pero **ambos instaladores escriben la configuracion de red solo en `Server/.env`** y ademas EXCLUYEN explicitamente esas claves del preservado. Por tanto la IP/HOST/MONGODB_URI que el instalador detecta puede quedar **anulada** por valores obsoletos del `.env` raiz preexistente. Precision confirmada: el `.env` raiz NO contiene `NODE_ENV`, asi que el override no afecta el arranque production/development; el riesgo es estrictamente de red.
- **Causa raiz:** Se mantienen dos `.env` en distinto nivel con precedencia invertida (el raiz gana) por razones historicas (credenciales Google en el raiz), mientras los instaladores solo gestionan `Server/.env`.
- **Impacto:** Diagnostico confuso (el instalador reporta una IP/URI y el server usa otra) y, tras una reinstalacion, un `MONGODB_URI`/`CLIENT_URL` obsoleto en el raiz puede romper la conexion a DB o el CORS de forma dificil de detectar, porque el archivo que el operador edita no es el que gana.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Unificar en un solo `.env` (`Server/.env`) o invertir la precedencia para que el archivo que gestionan los instaladores sea el autoritativo; documentar claramente que archivo manda. Como minimo, que los instaladores reconcilien/adviertan sobre claves de red duplicadas en el `.env` raiz.

**CFG-05 — Health check del launcher sin monitoreo continuo post-arranque**
- **Ubicacion:** `launcher.py` L2916-2977 (`_wait_for_server_ready`, unica verificacion de vida); ausencia de bucle de monitoreo post-arranque
- **Severidad:** Media
- **Categoria:** Produccion - Observabilidad / Resiliencia
- **Evidencia:** La unica comprobacion de salud es `_wait_for_server_ready`, que solo corre **durante el arranque** con timeout (30-60s) y detecta muerte via `process.poll()` (L2960) mientras espera el primer `/api/health` 200. No existe hilo/bucle que vigile `/api/health` de forma continua una vez arrancado (`watchdog|monitor|is_alive` sin supervision periodica). Si el server muere despues de arrancar y no hay pm2 (CFG-03), el badge de estado del launcher puede seguir mostrando "corriendo".
- **Causa raiz:** El launcher fue disenado para "encender y olvidar", delegando la resiliencia a pm2; sin pm2 no hay watchdog.
- **Impacto:** Una caida silenciosa post-arranque no se detecta ni se auto-recupera; el estado mostrado puede mentir, aumentando el tiempo hasta que alguien nota que el sistema no responde.
- **Complejidad de solucion:** Media
- **Recomendacion:** Anadir un hilo de health-check periodico en el launcher que refresque el estado real y, si detecta caida, intente reiniciar o al menos alerte visiblemente. Idealmente sobre pm2 con su propio monitoreo.

**CFG-06 — `mongod.cfg` versionado con rutas absolutas de una maquina concreta**
- **Ubicacion:** `mongod.cfg` L10/L13 (rutas absolutas a `C:\Users\USER\Desktop\DentiaCore-master\...`); `Server/scripts/dent.js` L135/L305 (rutas relativas `../../Client/dist`); `install.ps1` L193-199
- **Severidad:** Media
- **Categoria:** Produccion - Portabilidad
- **Evidencia:** `mongod.cfg` esta commiteado con `path: C:\Users\USER\Desktop\DentiaCore-master\DB\logs\mongod.log` (L10) y `dbPath: C:\Users\USER\Desktop\DentiaCore-master\DB` (L13). El archivo advierte que install.ps1 lo reescribe (L2-7), pero si MongoDB se inicia con este cfg **sin** pasar por la reescritura (o si se mueve la carpeta sin re-correr el instalador), el servicio apunta a un `dbPath` inexistente y muere al arrancar; el comentario en install.ps1 L193-199 confirma este modo de fallo historico. Ademas dent.js sirve el frontend desde `../../Client/dist` relativo a `__dirname`, correcto solo mientras la estructura no cambie.
- **Causa raiz:** `mongod.cfg` versionado con el valor materializado de una instalacion concreta en lugar de una plantilla; la portabilidad depende de re-ejecutar install.ps1.
- **Impacto:** Mover el proyecto o clonar en otra ruta/usuario sin re-correr el instalador rompe MongoDB. Genera soporte y downtime en migraciones de equipo.
- **Complejidad de solucion:** Baja
- **Recomendacion:** No versionar `mongod.cfg` con rutas absolutas (ignorarlo o dejar solo `.example`); generarlo siempre desde el instalador. Documentar que mover la carpeta exige re-ejecutar el instalador.

**CFG-07 — Directorio `.vercel/` residual en un producto on-premise**
- **Ubicacion:** `.vercel/project.json` (`{"projectName":"trae_1u56m44k"}`); `.gitignore` L61; `README.md`
- **Severidad:** Baja
- **Categoria:** Produccion - Higiene de despliegue
- **Evidencia:** Existe un `.vercel/project.json` que vincula el repo a un proyecto Vercel (`trae_1u56m44k`), residuo de un intento de despliegue cloud, en un producto explicitamente on-premise LAN. `.vercel/` esta en `.gitignore` (L61) pero sigue presente en la copia de trabajo (y, segun la dimension de Documentacion, fue commiteado antes de la regla de ignore, por lo que sigue rastreado — ver DOC-06). No hay `vercel.json` ni funciones, asi que es un artefacto muerto, no un despliegue activo.
- **Causa raiz:** Experimentacion previa con Vercel (nombre `trae_...` tipico de scaffolding) no limpiada.
- **Impacto:** Un tecnico nuevo podria creer que existe un despliegue cloud o intentar `vercel deploy`, con riesgo de subir PHI a un tercero. Bajo porque esta ignorado y vacio de logica.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Eliminar `.vercel/` de la copia de trabajo (ver DOC-06 para el `git rm --cached`) y documentar en el README que el despliegue es exclusivamente on-premise.

#### Observabilidad (Logs / Monitoreo)

**OBS-01 — Sin ningun mecanismo de alerta proactiva (backup fallido, disco lleno, Mongo caido post-arranque son invisibles)**
- **Ubicacion:** Todo el proyecto — grep sin coincidencias de `alert|notify|smtp|nodemailer|webhook|slack|telegram|pagerduty|ntfy` en `Server/`, `scripts/`, `launcher.py`, `install.sh`, `install.ps1`, `docs/`
- **Severidad:** Alta (ajustada desde Critica)
- **Categoria:** Produccion - Monitoreo y Alertas
- **Evidencia:** No existe ningun canal de notificacion en todo el codebase. El backup falla con `console.error(...)` + `process.exit()` (`scripts/backup-db.js` L254-258) solo a stdout; el arranque falla con `logger.error(...)` + `process.exit(1)` (`dent.js` L335-336); `uncaughtException`/`unhandledRejection` solo loguean (`dent.js` L377-386). Matiz verificado: de los eventos criticos, "proceso caido" SI esta cubierto por pm2 (`ecosystem.config.cjs` L8, `autorestart: true`) mientras la maquina esta encendida; los realmente invisibles son **backup fallido, disco lleno y Mongo desconectado a mitad de jornada**. El unico canal para esos tres es que el usuario note el sintoma y llame a soporte.
- **Causa raiz:** El sistema se diseno para operar sin equipo de monitoreo; se asumio que launcher, pm2 y las llamadas del usuario cubren la deteccion, sin construir un canal de notificacion para eventos de infraestructura que pm2 no ve.
- **Impacto:** Un backup que empieza a fallar queda invisible durante semanas; cuando el cliente necesita restaurar, descubre que no hay respaldo reciente (vector de perdida de PHI, se traslapa con BKP-01). Cada hora de inoperancia tiene costo directo.
- **Complejidad de solucion:** Media
- **Recomendacion:** Anadir un canal minimo de notificacion (email SMTP o webhook a ntfy/Telegram) en los tres puntos que pm2 no cubre: fallo de backup, fallo de conexion a Mongo al arranque, y un chequeo periodico de disco. Alternativamente, un cron "heartbeat" con dead-man's switch (la ausencia del OK diario es la alerta).
- **Nota de calibracion:** Ajustada de Critica a Alta porque "proceso caido" ya tiene recuperacion via pm2 y el peor vector (backup silencioso) se contabiliza en BKP-01, evitando doble conteo. Sigue siendo Alta por las implicaciones NOM-024/LFPDPPP de un backup roto invisible.

**OBS-02 — `/api/health` solo se consulta al arranque y siempre devuelve HTTP 200 aun con la DB caida**
- **Ubicacion:** `Server/config/routes.js` L33-51 (endpoint) vs `launcher.py` L2916-2938 e `install.ps1` L482-500 (unicos consumidores)
- **Severidad:** Alta
- **Categoria:** Produccion - Health Checks
- **Evidencia:** `/api/health` reporta `db.readyState` correctamente pero solo se consulta en momentos de arranque (instalacion en install.ps1 L495; launcher en L1557 → `_wait_for_server_ready`, un bucle con timeout que termina al recibir 200). No hay supervisor externo que lo consulte de forma continua; pm2 vigila el proceso pero NO consulta el endpoint HTTP. Confirmado ademas que el endpoint **siempre devuelve HTTP 200** (`routes.js` L42, `res.json` sin status code) incluso con `db.status === 'disconnected'`: un monitor por codigo de estado no detectaria la degradacion. Si Mongo se desconecta a media jornada, el JSON dice `disconnected` pero nadie lo pregunta.
- **Causa raiz:** El health check se concibio como gate de arranque, no como sonda de liveness para un watchdog; no se desplego ningun proceso que lo poleé periodicamente.
- **Impacto:** Una degradacion post-arranque (Mongo caido, pool agotado) no se detecta hasta que un usuario ejecuta una operacion y falla. La senal existe pero nadie la escucha.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Anadir una tarea programada (schtasks/cron, la misma infra ya documentada para backups) que consulte `/api/health` cada N minutos y verifique `status==ok` y `db.status==connected`, disparando la alerta de OBS-01 tras dos fallos. Enriquecer el endpoint para devolver HTTP 503 cuando `readyState !== 1`.

**OBS-03 — Sin correlacion de requests (cero request IDs)**
- **Ubicacion:** `Server/scripts/dent.js` L111 (morgan) y `Server/config/routes.js`; grep de `requestId|correlationId|x-request-id|traceId` en `Server/` sin coincidencias
- **Severidad:** Media (ajustada desde Alta)
- **Categoria:** Produccion - Trazabilidad / Observabilidad
- **Evidencia:** No hay middleware que asigne request ID, ni cabecera `X-Request-Id`, ni campo de correlacion en los logs. Morgan escribe la linea de acceso (dent.js L111) y winston loguea los errores por separado, sin clave comun. Reconstruir "que le paso a este request" obliga a cruzar timestamps a mano entre morgan y winston.
- **Causa raiz:** El logging se anadio por capas (morgan para acceso, winston para app) sin un diseno de trazabilidad transversal.
- **Impacto:** Cuando un usuario reporta "guarde una nota y dio error a las 3pm", soporte no puede aislar el request exacto ni seguir su recorrido por los middlewares. En single-tenant de bajo volumen cruzar timestamps a mano es tedioso pero factible, lo que atenua el impacto respecto a un sistema multi-tenant.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Middleware temprano que genere/propague un request ID (`crypto.randomUUID`), inyectado en un token custom de morgan y en el meta de todos los `logger.*`, y devuelto en la respuesta de error para que el usuario pueda citarlo.
- **Nota de calibracion:** Ajustada de Alta a Media: la severidad Alta esta calibrada para multi-tenant de alto volumen; en una clinica de un solo cliente con trafico bajo es mantenibilidad, no fallo operativo. El arreglo de complejidad Baja lo hace buen candidato de todos modos.

**OBS-04 — Error handler primario usa `console.error` en vez de winston (errores de request fuera del log estructurado)**
- **Ubicacion:** `Server/config/routes.js` L105-112 (error handler primario) y `Server/scripts/dent.js` L34
- **Severidad:** Media
- **Categoria:** Produccion - Consistencia de Logs / Observabilidad
- **Evidencia:** El handler que efectivamente captura los errores de las rutas usa `console.error(\`[ERROR] ${req.method} ${req.originalUrl}:\`, err)` (routes.js L108), NO winston. Esta montado dentro del router de `/api` (L105) y se ejecuta antes que el handler de `dent.js` L295 (que si usa `logger.error`), porque `next(err)` desde una ruta de `/api` lo alcanza primero. Resultado: los errores de negocio salen por `console.error` sin timestamp estructurado, sin nivel, sin ir al archivo rotado ni a `exceptions.log`. Igual pasa con el fallo de secretos al arranque (dent.js L34).
- **Causa raiz:** Convivencia de dos estilos de logging (console.* legacy y winston) sin migrar los handlers de error; un handler quedo dentro del router y otro fuera, con el interno ganando.
- **Impacto:** El log estructurado y rotado —la fuente que soporte revisaria— NO contiene los errores de request mas relevantes; quedan solo en el stdout de pm2, fragmentando la unica fuente de verdad y agravando OBS-03/OBS-05.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Reemplazar `console.error` de routes.js L108 por `logger.error` con el request ID de OBS-03 como meta, y unificar en un unico error handler para que todo error transite winston y termine en el archivo rotado y en `exceptions.log`.

**OBS-05 — Sin herramienta de error tracking / agregacion (todos los errores en archivos locales)**
- **Ubicacion:** Todo el proyecto — grep de `sentry|newrelic|datadog|prometheus|opentelemetry|prom-client|rollbar` en `Server/`, raiz y `package.json` sin coincidencias
- **Severidad:** Media
- **Categoria:** Produccion - Error Tracking
- **Evidencia:** No hay agregacion/tracking de errores. Todos terminan en archivos locales `logs/dent-<fecha>.log`, `logs/exceptions-<fecha>.log`, `logs/rejections-<fecha>.log` (`Server/utils/logger.js` L37-64), en el mismo disco de la clinica, sin panel. Nadie los revisa salvo que el launcher haga `_tail_file` bajo diagnostico manual (`launcher.py` L2894).
- **Causa raiz:** Diseno on-premise single-tenant sin observabilidad centralizada; se asume que los logs locales bastan para diagnostico reactivo.
- **Impacto:** Errores recurrentes (p. ej. una escritura de auditoria que rechaza tras cada guardado, el patron que motivo el cambio de `uncaughtException`) se acumulan invisibles en un archivo que solo se mira cuando ya hay una queja. No hay deteccion de tendencias ni de regresiones tras un update.
- **Complejidad de solucion:** Media
- **Recomendacion:** Para on-premise no hace falta SaaS: basta un transport de winston que agregue por nivel/tipo y un resumen periodico (email diario con el conteo de errores via el canal de OBS-01). Si el cliente acepta telemetria saliente, Sentry self-hosted o su tier gratuito cubre dedupe y alertas.

**OBS-06 — `LOGS_DIR`/`LOG_MAX_FILES` sin documentar y sin limite total de disco compartido con datos criticos**
- **Ubicacion:** `Server/utils/logger.js` L6-10/L43 vs `Server/.env.example` (solo `LOG_LEVEL=info`, L7)
- **Severidad:** Media
- **Categoria:** Produccion - Configuracion de Logs / Riesgo de disco
- **Evidencia:** La rotacion por archivo esta bien acotada (`maxSize: '20m'`, `zippedArchive: true`, retencion `14d`/`30d`, logger.js L41-63). PERO (a) `LOGS_DIR` y `LOG_MAX_FILES` no estan en ningun `.env.example` (solo `LOG_LEVEL`), asi que el operador no sabe que existen; (b) no hay limite total agregado ni chequeo de espacio en disco (grep de `disk|freemem|statvfs|free space` solo arroja `multer.diskStorage`). Con tres familias de logs rotando en el mismo volumen que la base de datos y `/uploads` (PHI), un pico de errores en bucle puede consumir disco antes de que Mongo se quede sin espacio.
- **Causa raiz:** La rotacion se configuro pensando en tamano por-archivo, no en presupuesto total de disco compartido con datos criticos; las palancas no se expusieron en la plantilla de entorno.
- **Impacto:** En el peor caso, los logs llenan el disco y Mongo no puede escribir → corrupcion/parada de la base con PHI. El operador no tiene forma documentada de mover los logs a otro volumen ni recibe aviso de disco bajo.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Documentar `LOGS_DIR` y `LOG_MAX_FILES` en `Server/.env.example` con guia para apuntar los logs a un volumen separado. Anadir chequeo periodico de espacio libre (reutilizando el monitor de OBS-02) que alerte antes de un umbral critico. Considerar un tope total de retencion combinado.

#### Backups y Recuperacion

**BKP-01 — Backup con exito no observado: scheduling manual no forzado, fallo solo a stdout, sin marcador de exito**
- **Ubicacion:** `docs/server/operacion/backups-y-restauracion.md` L21-38 vs `scripts/backup-db.js` L254-258/L271-277
- **Severidad:** Alta
- **Categoria:** Produccion - Operacion de Backups (observabilidad)
- **Evidencia:** El scheduling es manual y su exito no se observa. La doc dice "El script existe; falta dispararlo solo. Configuralo una vez" (L23) y ofrece un cron que redirige a `backups/backup.log 2>&1` (L35), archivo que nadie revisa. El script solo comunica fallo por `console.error` + exit code (backup-db.js L254-257); si el operador olvida agendar o la tarea empieza a fallar (mongodump ausente, disco lleno), el unico sintoma es que dejan de aparecer archivos en `backups/`. La compresion fallida solo emite `console.warn` y continua (L271-272), degradando en silencio. Verificado: los instaladores NO crean la tarea programada; queda como paso manual.
- **Causa raiz:** El backup se implemento como script CLI de ejecucion manual; la automatizacion y la verificacion de exito se delegaron a la disciplina del operador en vez de forzarse en el sistema.
- **Impacto:** Perdida de datos. En una clinica sin DevOps, "revisar backups/ periodicamente" no ocurre; un backup que dejo de correr hace un mes se descubre el dia del desastre. El costo es la perdida del expediente clinico (PHI), con implicaciones NOM-024/LFPDPPP.
- **Complejidad de solucion:** Media
- **Recomendacion:** Que `backup-db.js` escriba tras cada corrida un marcador de exito (timestamp + tamano en `backups/last-success.json`) y que un chequeo diario alerte (via OBS-01) si el marcador tiene mas de 25h o si el ultimo backup es sospechosamente pequeno. Idealmente, el instalador debe agendar la tarea automaticamente.

**BKP-02 — `uncaughtException`/`unhandledRejection` solo loguean: proceso "vivo pero degradado" sin barrera ni supervisor**
- **Ubicacion:** `Server/scripts/dent.js` L361-386 (verificado en codigo: los handlers solo llaman `logger.error`, sin `process.exit`)
- **Severidad:** Alta
- **Categoria:** Produccion - Resiliencia / Estado corrupto silencioso
- **Evidencia:** Tras una excepcion no controlada el proceso NO se reinicia: `process.on('uncaughtException', (err) => { logger.error('...el server sigue activo...', ...) })` (L377-381) e igual para `unhandledRejection` (L382-386). El comentario (L361-372) lo justifica para evitar que "al guardar, el programa se reinicia" tras un error async post-respuesta. Node documenta que continuar tras un `uncaughtException` deja el runtime en estado indefinido (sockets, file handles, transacciones Mongo, locks a medio liberar). No hay barrera intermedia (ni drenar la request en curso, ni marcar el proceso unhealthy, ni reinicio controlado), y en modo local no hay pm2 (CFG-03) ni watchdog periodico (`_wait_for_server_ready` solo corre al arranque).
- **Causa raiz:** Se corrigio un bug real (un rechazo async post-respuesta tumbaba el server via pm2) apagando por completo la deteccion de fallos en vez de acotarla al caso concreto. Se confundio "no reiniciar por errores async triviales" con "nunca terminar ante ningun fallo fatal".
- **Impacto:** El server puede quedar zombie sirviendo respuestas sobre estado inconsistente; el operador no tiene forma de saber que esta degradado. Riesgo de perdida/corrupcion silenciosa de expediente clinico y errores intermitentes dificiles de diagnosticar.
- **Complejidad de solucion:** Media
- **Recomendacion:** Diferenciar rechazos async benignos (solo loguear) de excepciones fatales. Para `uncaughtException` genuino: loguear, dejar de aceptar conexiones nuevas, drenar las requests en vuelo con timeout corto y salir con codigo distinto de 0 para que pm2 (`autorestart: true`) reinicie limpio. Alternativamente, un circuit-breaker que reinicie tras N excepciones en una ventana. No dejar el proceso indefinidamente vivo.

**BKP-03 — Graceful shutdown incompleto: no cierra Mongo, sin timeout de respaldo, sin listeners de conexion en runtime**
- **Ubicacion:** `Server/scripts/dent.js` L351-357 (`gracefulShutdown`) y `Server/config/db.js` (sin listeners de conexion)
- **Severidad:** Alta
- **Categoria:** Produccion - Graceful shutdown
- **Evidencia:** `gracefulShutdown` solo hace `server.close(() => process.exit(0))` (verificado, dent.js L351-357). Nunca cierra la conexion a Mongo (`mongoose.connection.close()`) ni tiene timeout de respaldo: si una request en vuelo esta bloqueada (p. ej. esperando a Mongo tras suspension de la laptop), `server.close()` no llama al callback y el proceso queda colgado ante SIGTERM/SIGINT, forzando un SIGKILL que corta escrituras a medias. En `db.js` no hay listeners de `disconnected`/`reconnected`/`error` mas alla del connect inicial; los unicos `mongoose.connection.close()` viven en scripts one-shot (`findPatientDuplicates.js`, `audit-legacy-users.js`), no en el ciclo de vida del server. Si Mongo muere en runtime, el server no lo detecta ni lo reporta.
- **Causa raiz:** El shutdown se implemento como el minimo "cerrar el listener HTTP" sin drenado con timeout ni cierre ordenado de la BD; la resiliencia de conexion vive solo en la fase de arranque (retries con backoff en db.js L40-85), no en runtime.
- **Impacto:** Reinicios/actualizaciones/apagados que deberian ser limpios pueden colgarse o cortar transacciones; una caida de Mongo a media jornada no se refleja hasta que el siguiente request falla con un error opaco. Los updates de la app requieren matar el proceso a la fuerza.
- **Complejidad de solucion:** Media
- **Recomendacion:** En `gracefulShutdown`: cerrar el HTTP server, luego `await mongoose.connection.close(false)`, y envolver todo en un `setTimeout(...).unref()` de respaldo (~10s) que fuerce la salida si el drenado no completa. Registrar listeners de `mongoose.connection.on('disconnected'/'reconnected'/'error', ...)` para observabilidad en runtime. Guardar contra doble invocacion del handler.

**BKP-04 — Backup sin cifrado ni offsite forzados (control documentado, no impuesto)**
- **Ubicacion:** `scripts/backup-db.js` L246-296 (no cifra) vs `docs/server/operacion/backups-y-restauracion.md` L4/L83; archivos reales `backups/*.tar.gz`
- **Severidad:** Media (ajustada desde Alta)
- **Categoria:** Produccion - Backups / Confidencialidad (PHI)
- **Evidencia:** `backup-db.js` hace `mongodump` (L250) → `tar -czf` (L265-269) sin etapa de cifrado; el propio script lo reconoce en su cabecera ("guarda los archivos en un medio cifrado", L22-24). El runbook exige lo contrario: "guardalos cifrados" (L4) y "[ ] Backups en medio cifrado" (L83). Los `.tar.gz` reales estan en claro → PHI expuesto si el medio es robado.
- **Causa raiz:** El script cubre dump y rotacion pero delega cifrado y offsite al operador; el runbook los pide (checklist) pero nada los fuerza ni valida.
- **Impacto:** Confidencialidad y cumplimiento (NOM-024/LFPDPPP). Un backup robado sin cifrado expone expedientes completos. Mitigado parcialmente por el checklist que exige medio cifrado, no por control tecnico.
- **Complejidad de solucion:** Media
- **Recomendacion:** Cifrar el artefacto en el propio script (clave derivada de `ENCRYPTION_KEY`/passphrase) y soportar/forzar un destino offsite configurable, con verificacion de que ambos ocurrieron.
- **Nota de calibracion:** Ajustada de Alta a Media. Duplica la cobertura de cifrado/offsite ya reportada en **DB-OPS-01** (`AUDITORIA_TECNICA_INTEGRAL.md` L1111) y calibrada a Media, porque el runbook ya exige medio cifrado como control operativo compensatorio. Un backup en claro en el mismo disco de una maquina on-premise de acceso fisico controlado, con un control documentado que exige cifrarlo, no sostiene Alta por encima de la calibracion previa.

**BKP-05 — Sin verificacion automatica de que un backup sea restaurable**
- **Ubicacion:** `scripts/restore-db.js` L266-267; `docs/server/operacion/backups-y-restauracion.md` L56-63 (verificacion 100% manual)
- **Severidad:** Media
- **Categoria:** Produccion - Verificacion de backups restaurables
- **Evidencia:** No existe verificacion automatica de restaurabilidad. `backup-db.js` no valida el dump (solo reporta tamano, L285-295). `restore-db.js` tras restaurar solo imprime "Verifica: conteos por coleccion y que las firmas NOM-024 sigan validas" (L267), delegando al humano. El runbook confirma que los criterios de exito (L56-63) son pasos manuales a repetir "p. ej. mensual". (Tambien cubierto por DB-OPS-01 como "restore sin verificacion automatica".)
- **Causa raiz:** El diseno "seguro por dry-run" facilita probar el restore, pero la verificacion de integridad/restaurabilidad quedo como responsabilidad del operador, no automatizada.
- **Impacto:** Perdida de datos latente. Un backup corrupto o incompleto pasa desapercibido hasta el dia del desastre.
- **Complejidad de solucion:** Media
- **Recomendacion:** Anadir verificacion automatica post-backup (restore a BD scratch efimera + conteos comparados contra origen + verificacion de firmas NOM-024) ejecutada periodicamente, con alerta si falla. Registrar la fecha del ultimo restore-test verificado.

**BKP-06 — Instalador no programa el backup (duplica DB-OPS-01)**
- **Ubicacion:** `install.sh` / `install.ps1` (sin `schtasks`/`crontab`/`Register-ScheduledTask`/`backup-db`); `docs/server/operacion/backups-y-restauracion.md` §2
- **Severidad:** Media (ajustada desde Critica)
- **Categoria:** Produccion - Backups / Perdida de datos
- **Evidencia:** Ningun instalador programa el backup (grep de `schtasks|crontab|Register-ScheduledTask|backup-db` en ambos: sin resultados). El runbook lo admite: "El script existe; falta dispararlo solo. Configuralo una vez en el equipo" (L23).
- **Causa raiz:** El scheduling se documento como paso manual (setup unico de SO deliberado) en lugar de automatizarse en el instalador.
- **Impacto:** Perdida de datos si el dueno nunca ejecuta el paso manual del runbook. Mitigado por documentacion existente que el instalador deberia forzar.
- **Complejidad de solucion:** Media
- **Recomendacion:** Que el instalador registre automaticamente la tarea de backup diario ya documentada (`schtasks`/`Register-ScheduledTask`/`cron`/launchd) con `--keep=N`, y que el launcher verifique/reporte si la tarea existe y cuando corrio por ultima vez.
- **Nota de calibracion:** Ajustada de Critica a Media. Duplica **DB-OPS-01** (`AUDITORIA_TECNICA_INTEGRAL.md` L1107-1115), ya calibrado a Media precisamente porque la capa operativa (schedule, restore-test, offsite cifrado) SI esta documentada en `backups-y-restauracion.md`. Se alinea con la severidad ya asignada en la fase de Base de Datos. Es la misma evidencia y el mismo gap que BKP-01 aborda desde la observabilidad; se consolida aqui para no doble-contar.

**BKP-07 — Modelo operativo acoplado a una GUI Tkinter, sin modo servicio/headless**
- **Ubicacion:** `launcher.py` L814-964 (arranque asistido por GUI); sin modo servicio/headless
- **Severidad:** Media
- **Categoria:** Produccion - Modelo operativo / Continuidad
- **Evidencia:** Todo el ciclo de vida (arrancar Mongo, server, cliente, abrir navegador) esta acoplado a una app GUI Tkinter que un humano debe abrir y mantener abierta: los subprocesos son hijos del launcher (`self.server_process = self._safe_popen(...)`, L899) y `_stop_all_thread` los mata al cerrar (L972-981). No hay modo servicio/headless. Si el usuario cierra la ventana o cierra sesion de Windows, el server local muere con el; sin backend, la SPA no tiene operacion offline posible.
- **Causa raiz:** El producto se concibio como app de escritorio arrancada por un launcher, no como servicio de fondo; la continuidad degradada nunca fue requisito de diseno.
- **Impacto:** La operacion depende de mantener una ventana GUI abierta; cerrar sesion o el launcher tumba todo. Sin modo degradado, agenda/expedientes/cobros quedan inaccesibles ante cualquier caida del backend.
- **Complejidad de solucion:** Alta
- **Recomendacion:** Separar el plano de ejecucion (backend + Mongo como servicios de fondo autonomos, ver CFG-02/CFG-03) del plano de control (el launcher como panel que arranca/detiene/monitorea, no como proceso padre). Definir explicitamente la expectativa de continuidad.

> Nota de consolidacion (Backups y Recuperacion): la dimension de cifrado/offsite/verificacion de respaldos y la de RPO/RTO del despliegue standalone **ya fueron auditadas en la fase previa de Base de Datos** (DB-OPS-01/02/03, `docs/AUDITORIA_TECNICA_INTEGRAL.md` L1107-1156) y calibradas a Media / decision-del-dueno. Por eso el gap operativo que sobrevive con peso propio en esta fase es el de **supervision de proceso y continuidad tras reinicio** (BKP-02/BKP-03 y CFG-02/CFG-03), no la capa de respaldo que ya esta documentada.

#### Documentacion y Versionado

**DOC-01 — Ningun camino de instalacion/arranque ejecuta `npm run migrate`: codigo nuevo corre sobre esquema viejo**
- **Ubicacion:** `install.sh` (build en L304, sin migrate en todo el archivo), `install.ps1` (build en L384, sin migrate), `launcher.py` (grep de `migrate` = 0), `docs/server/MIGRACIONES_PENDIENTES.md` L27-43
- **Severidad:** Critica
- **Categoria:** Produccion - Release / Migraciones
- **Evidencia:** Ningun camino de instalacion o arranque ejecuta las migraciones. `grep migrate install.sh` = 0; `install.sh` corre `npm run build` (L304) pero nunca `npm run migrate`. `install.ps1` corre build (L384) pero no migrate. `grep migrate launcher.py` = 0. El checklist de `configuracion-produccion.md` no menciona migraciones. Existe documentacion del como migrar (`migracion-0004-odontograma-versiones.md` con `migrate:dry`→`migrate`, y `MIGRACIONES_PENDIENTES.md`), y el script `migrate`/`migrate:dry` existe en `package.json` raiz (L18-19), pero depende de que un operador humano lo recuerde y ejecute — nada lo automatiza ni lo gate-ea.
- **Causa raiz:** El runner de migraciones (`scripts/migrate.js`) se construyo como herramienta manual y nunca se integro en el flujo de instalacion/actualizacion ni en el arranque del servidor.
- **Impacto:** Perdida de datos / integridad clinica. Al entregar una actualizacion a la clinica (sin DevOps), el codigo nuevo corre sobre esquema viejo: `audit/verify` marca registros firmados como "alterados" (falso positivo NOM-024), el historial legacy del odontograma no aparece, y `user.save()` puede romperse por datos fuera de enum. El sintoma (verify fallido, datos "faltantes") no apunta obviamente a "falto migrar", elevando el tiempo de recuperacion.
- **Complejidad de solucion:** Media
- **Recomendacion:** Integrar `npm run migrate` en el flujo de release: un paso explicito de actualizacion (`update.sh`/`update.ps1`) que haga backup, corra `migrate:dry`, luego `migrate` y luego arranque; o un gate de arranque que aborte si hay migraciones pendientes. Anadir el paso al checklist de `configuracion-produccion.md`.

**DOC-02 — `README.md` raiz obsoleto: describe un proyecto distinto, referencia archivos inexistentes, no menciona los instaladores reales**
- **Ubicacion:** `README.md` (todo el archivo; ejemplos: L103/107 `tipoValueFix.txt`, L223 `scripts/migratePatientData.js`, L225 `Server/PATIENT_MODEL_IMPROVEMENTS.md`, L135 MongoDB Atlas, L133 "Node v16")
- **Severidad:** Alta
- **Categoria:** Produccion - Documentacion
- **Evidencia:** El `README.md` raiz es un stub auto-generado. Referencia archivos que **no existen** (verificado con `ls`): `tipoValueFix.txt`, `Server/PATIENT_MODEL_IMPROVEMENTS.md`, `scripts/migratePatientData.js`. Recomienda "instancia gestionada de MongoDB (Atlas)" (L46/L203) para un producto on-premise. Pide "Node.js (v16+ recomendado)" (L133) cuando `install.sh` exige v18 (L97) y `.nvmrc` fija 20. Termina con texto conversacional de un asistente (L209-215). Jamas menciona `install.sh`/`install.ps1`, ni la generacion de secretos, ni `create-admin` (0 menciones), ni `npm run migrate`.
- **Causa raiz:** El README se genero automaticamente en una fase temprana y nunca se reescribio; su ultimo toque fue limpieza de codigo, no actualizacion de contenido.
- **Impacto:** Un tecnico nuevo o soporte no puede instalar ni operar guiandose por el README; seguirlo lleva a rutas muertas. Erosiona la confianza en toda la documentacion.
- **Complejidad de solucion:** Media
- **Recomendacion:** Reescribir el README raiz como documento de instalacion/operacion real (instaladores, secretos, create-admin, migrate, arranque PM2, enlace a `docs/`), o reducirlo a un indice que apunte a los runbooks reales de `docs/server/operacion/`.

**DOC-03 — Runbook de `Server/README.md` documenta el nombre PM2 equivocado (`dent-api` vs `dentiacore-api`)**
- **Ubicacion:** `Server/README.md` L116/L152/L155 (`dent-api`) vs `Server/ecosystem.config.cjs` L4 (`dentiacore-api`) y `launcher.py` L978/1466/1475/1483/1597 (`dentiacore-api`)
- **Severidad:** Alta
- **Categoria:** Produccion - Runbook incorrecto
- **Evidencia:** El runbook instruye `pm2 start ... --only dent-api` (L116), `pm2 stop dent-api` (L152) y `pm2 start dent-api` (L155). El nombre real en `ecosystem.config.cjs` es `dentiacore-api` (L4), usado consistentemente por el launcher. `pm2 stop dent-api` no falla ruidosamente: reporta "process not found" y **no detiene nada**.
- **Causa raiz:** El servicio se renombro de `dent-api` a `dentiacore-api` en el ecosystem/launcher pero el runbook de `Server/README.md` no se actualizo.
- **Impacto:** Disponibilidad / recuperacion. Durante una restauracion o incidente, un operador que siga el runbook cree haber detenido el servicio (para restaurar la BD con `--drop`) cuando sigue vivo escribiendo, arriesgando corrupcion del restore; o no logra reiniciar el servicio tras el mantenimiento. Aumenta el tiempo de recuperacion en el peor momento.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Corregir las tres ocurrencias de `dent-api` en `Server/README.md` a `dentiacore-api`, y anadir una nota de verificacion (`pm2 describe dentiacore-api`) antes de operaciones destructivas.

**DOC-04 — Versionado incoherente y sin fuente unica de verdad (cuatro "versiones", cero tags, sin CHANGELOG)**
- **Ubicacion:** `package.json` raiz L3 (`1.0.0`), `Client/package.json` L3 (`0.1.0`), `Server/package.json` (sin `version`), `launcher.py` L421 y L591 (`v1.0` hardcodeado)
- **Severidad:** Media (ajustada desde Alta)
- **Categoria:** Produccion - Versionado
- **Evidencia:** Cuatro fuentes de "version" incoherentes y ninguna autoritativa: raiz `1.0.0`, Client `0.1.0`, Server sin `version`, y el GUI del launcher muestra un chip `' v1.0 '` escrito a mano en dos sitios (L421 y L591). `git tag -l` devuelve 0 tags. No existe ningun `CHANGELOG` (verificado con `find -iname CHANGELOG*`).
- **Causa raiz:** No se adopto convencion de versionado semantico ni fuente unica de verdad; las versiones quedaron con los defaults de `npm init`/scaffold y el launcher se etiqueto a ojo.
- **Impacto:** Cuando la clinica reporta un bug, ni el cliente ni soporte pueden decir que version corre ni que cambio entre releases. Imposible correlacionar un incidente con un cambio o auditar que version valido que comportamiento clinico.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Definir una version unica (en `package.json` raiz), derivar el chip del launcher de ahi, versionar en sincronia Client/Server o eliminar la version de los subpaquetes, adoptar tags de git por release y un `CHANGELOG.md` que soporte pueda consultar.
- **Nota de calibracion:** Ajustada de Alta a Media: el impacto es puramente de trazabilidad/soporte, no deja la clinica sin sistema ni arriesga datos. Para un solo cliente on-premise es mantenibilidad, no disponibilidad/integridad.

**DOC-05 — CI sin build/lint/deploy: un cambio que rompe `vite build` pasa el CI en verde**
- **Ubicacion:** `.github/workflows/ci.yml` (solo jobs `server-tests` y `client-tests`, sin build/lint/deploy)
- **Severidad:** Media
- **Categoria:** Produccion - CI/CD
- **Evidencia:** El pipeline solo corre `npm test` en Server y Client. No hay job de `build` (aunque el release depende de `vite build`, ejecutado manualmente en install.sh L304 e install.ps1 L384), ni de `lint`, ni de empaquetado/entrega. No existe workflow ni script que genere un artefacto de release ni que entregue una actualizacion a la clinica; el despliegue es 100% manual y no documentado. (La limitacion de tests-fantasma del Server ya se reporto en Fase 2; aqui el hallazgo nuevo es la ausencia de build/lint/entrega.)
- **Causa raiz:** El CI se anadio solo para cerrar la brecha de tests-fantasma; nunca se extendio a validar el build de produccion ni a producir un release reproducible.
- **Impacto:** Un cambio que rompe `vite build` o el lint pasa el CI (verde) y solo se descubre al ejecutar `install.sh` en la clinica, en pleno despliegue. Sin artefacto de release, cada actualizacion se ensambla a mano, propensa a errores irrepetibles.
- **Complejidad de solucion:** Media
- **Recomendacion:** Anadir un job `build` que corra `vite build` (y `npm run lint`) en el CI, y definir/generar un artefacto de release versionado (tarball con Client/dist + Server) para que la entrega sea reproducible.

**DOC-06 — `.vercel/project.json` rastreado en git pese al `.gitignore`**
- **Ubicacion:** `.vercel/project.json` (`{"projectName":"trae_1u56m44k"}`), rastreado en git (`git ls-files .vercel/`) pese a `.gitignore` L61
- **Severidad:** Media
- **Categoria:** Produccion - Artefacto de deploy obsoleto
- **Evidencia:** Existe y esta **versionado en git** un `.vercel/project.json` que ata el repo a un proyecto Vercel (`trae_1u56m44k`), en un producto explicitamente on-premise. Esta en `.gitignore` (L61) pero fue commiteado antes de la regla, asi que el ignore no lo remueve; sigue en el arbol y viaja en cada clon.
- **Causa raiz:** Un intento previo de desplegar en Vercel dejo configuracion residual que se commiteo; agregar `.vercel/` al `.gitignore` despues no des-rastrea el archivo ya versionado.
- **Impacto:** Contradice el modelo on-premise y puede llevar a un despliegue accidental a un proyecto cloud ajeno; el nombre `trae_1u56m44k` sugiere un scaffolding de terceros. Ruido que confunde a quien audita el despliegue.
- **Complejidad de solucion:** Baja
- **Recomendacion:** `git rm --cached .vercel/project.json` (manteniendo el `.gitignore`) para des-rastrearlo; confirmar que no hay ningun flujo de despliegue apoyandose en Vercel. (Relacionado con CFG-07, que aborda la copia de trabajo.)

**DOC-07 — Runbooks huerfanos: sin indice `docs/README.md` ni runbook de "actualizar una instalacion existente"**
- **Ubicacion:** `docs/` (sin `docs/README.md`), `README.md` raiz (sin enlaces a `docs/`), ausencia de runbook de actualizacion consolidado y de guia de onboarding de dev
- **Severidad:** Media
- **Categoria:** Produccion - Documentacion (cobertura)
- **Evidencia:** Los runbooks existentes son buenos y especificos (`backups-y-restauracion.md`, `configuracion-produccion.md`, `migracion-0004-odontograma-versiones.md`) pero estan huerfanos: no hay `docs/README.md` que los indexe y el README raiz no enlaza a `docs/`. No existe ningun documento que consolide **como entregar una actualizacion a una clinica ya instalada** (backup → migrate → build → reiniciar PM2 → smoke); el flujo esta disperso entre `migracion-0004` (una migracion concreta) y `configuracion-produccion.md` (que no menciona migrar). El unico troubleshooting vive dentro de `Server/README.md`, no descubrible desde la raiz.
- **Causa raiz:** La documentacion crecio por fases de auditoria sin un indice ni un mapa de navegacion, ni un runbook de ciclo de vida "actualizar una instalacion existente".
- **Impacto:** Ante un problema comun, el operador o dev nuevo no encuentra el runbook correcto porque no hay punto de entrada. La falta de runbook de actualizacion consolidado es la que hace posible DOC-01 (nadie sabe que hay que migrar al actualizar, salvo que abra el runbook por-migracion correcto).
- **Complejidad de solucion:** Baja
- **Recomendacion:** Crear `docs/README.md` como indice navegable de todos los runbooks, enlazarlo desde el README raiz, y escribir un runbook de "Actualizar una instalacion existente" (backup → migrate:dry → migrate → build → reiniciar PM2 → smoke test).

**DOC-08 — Runbook de recuperacion parcial: falta un runbook de incidentes de arranque consolidado**
- **Ubicacion:** `docs/server/operacion/` (solo `backups-y-restauracion.md`, `configuracion-produccion.md`, `migracion-0004`); ausencia de runbook de "no arranca"/RPO/RTO consolidado
- **Severidad:** Baja (ajustada desde Alta)
- **Categoria:** Produccion - Runbooks / Soporte
- **Evidencia:** Parcialmente refutado. SI existe recuperacion ante desastre documentada (`backups-y-restauracion.md` §4 "Restauracion real", L67-74) y diagnostico de arranque por secretos (`configuracion-produccion.md`, "el server no arranca en produccion" si faltan `JWT_SECRET`/`AUDIT_HMAC_SECRET`, comprobacion en L47-53, y §5 "Verificacion al desplegar"). Lo que NO existe es un runbook dedicado tipo "abri el launcher y no levanta" con arbol de decision (puerto ocupado, Mongo caido, server zombi), ni un documento formal de RPO/RTO — pero **RPO/RTO ya se marco como decision del dueno en DB-OPS-02** (`AUDITORIA_TECNICA_INTEGRAL.md` L1145).
- **Causa raiz:** La documentacion operativa cubre configuracion, respaldo, restauracion y fail-fast de secretos, pero no un arbol de diagnostico de incidentes de arranque unificado.
- **Impacto:** Ante un fallo no cubierto por el fail-fast documentado, un dueno no-tecnico debe escalar al proveedor. Menor de lo reportado originalmente: si hay guia de restauracion y de arranque por secretos.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Escribir un runbook de incidentes de arranque ("no arranca", "va lento", "error al guardar") con arbol de decision y criterios de escalamiento, consolidando lo ya disperso en `configuracion-produccion.md`. Documentar RPO/RTO objetivo (ligado a la decision-del-dueno de DB-OPS-02).
- **Nota de calibracion:** Ajustada de Alta a Baja: la afirmacion "no existe runbook ni doc de recuperacion" es parcialmente falsa (§4 de backups es recuperacion ante desastre; `configuracion-produccion.md` cubre diagnostico por secretos) y la parte de RPO/RTO ya esta capturada como decision-del-dueno en la fase de BD. Lo que queda es un nit de documentacion operativa.

**DOC-09 — Prerrequisito de Node contradictorio en cinco lugares**
- **Ubicacion:** `README.md` L133 ("Node v16"), `Server/README.md` L86 ("Node.js LTS"), `install.sh` L97 (exige v18) vs L314 (mensaje "requiere v14+"), `.nvmrc` (`20`), `package.json` raiz L26 (`>=18 <=22`)
- **Severidad:** Baja
- **Categoria:** Produccion - Documentacion (consistencia de prerrequisitos)
- **Evidencia:** El prerrequisito de Node es contradictorio: `README.md` dice "v16+", `Server/README.md` "Node.js LTS" (impreciso), `.nvmrc` fija 20, `package.json` raiz declara `engines node >=18 <=22`, y `install.sh` es internamente inconsistente: aborta si la version es <18 (L97) pero su mensaje de error de build dice "requiere v14+" (L314). `install.ps1` si referencia correctamente `>=18 <=22` (L368).
- **Causa raiz:** Los requisitos de Node se escribieron en momentos distintos y no se sincronizaron cuando el stack (Vite 6) subio el minimo; el mensaje de error de `install.sh` quedo desactualizado tras endurecer el check.
- **Impacto:** Un tecnico que instale Node 16 siguiendo el README chocara con un fallo del instalador; el mensaje "requiere v14+" en un error real desorienta. Friccion de instalacion evitable en el sitio del cliente.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Unificar el requisito a una unica fuente de verdad (Node 20 LTS, alineado con `.nvmrc` y `engines`), corregir el "v16" del README y el "v14+" del mensaje de error de `install.sh`.

#### Robustez de Runtime

**RT-01 — Cortes de caja atados a la zona horaria del SO (contabilidad y auditoria descuadradas si el SO no esta en la TZ de la clinica)**
- **Ubicacion:** `Server/controllers/cashController.js` L297-311 (rango por dia del corte de caja) y L94-103 (rango mensual); ausencia total de TZ fija (sin `process.env.TZ`, `America/Mexico`, ni `timeZone` en `Server/`, `launcher.py`, `install.*`, `ecosystem.config.cjs`, ni en `docs/`)
- **Severidad:** Alta
- **Categoria:** Produccion - Zona horaria / correctitud de datos
- **Evidencia:** El corte de caja por dia construye los limites con `new Date(\`${req.query.day}T00:00:00\`)`, `start.setHours(0,0,0,0)` y `end.setHours(23,59,59,999)` (L297-300). `setHours` y el constructor sin sufijo Z operan en la TZ del SO. El resumen mensual usa `new Date(now.getFullYear(), now.getMonth(), 1)` (L95-100), tambien local — el propio comentario (L98-99) admite "Los limites usan la TZ local del proceso; se asume el servidor en la TZ de la clinica". No se fija `TZ=America/Mexico_City` en ningun punto de arranque, y el runbook de operacion NO menciona TZ. Si el servidor corre en UTC, el "dia" del corte se parte a las 18:00/19:00 hora Mexico: cobros de la tarde caen en el corte del dia siguiente. Los timestamps de auditoria NOM-024 quedan igualmente en la TZ del SO.
- **Causa raiz:** El codigo asume que la TZ del SO coincide con la de la clinica (suposicion documentada en el comentario pero no forzada ni verificada), sin fijar una zona horaria de negocio explicita ni normalizar los limites de dia/mes a esa zona.
- **Impacto:** Perdida/corrupcion de datos contables (cortes de caja descuadrados), citas mostradas en el dia equivocado, y timestamps de auditoria inconsistentes con la hora real del acto — problema legal/regulatorio NOM-024. Soporte recurrente por "el corte no cuadra". Nota de contexto: si la maquina Windows del consultorio esta en la TZ local (lo comun), el bug no se manifiesta; el riesgo real aparece si queda en UTC o se migra a un servidor/VM en UTC. Se mantiene Alta por su impacto (contabilidad + regulatorio) con probabilidad dependiente de la config del SO del cliente.
- **Complejidad de solucion:** Media
- **Recomendacion:** Definir una TZ de negocio fija (`America/Mexico_City`) y forzarla: como minimo exportar `TZ=America/Mexico_City` en el entorno de arranque (ecosystem `env`/launcher), y preferentemente calcular los limites de dia/mes con una libreria TZ-aware (Intl/`date-fns-tz`/Luxon) en vez de `setHours`. Documentar la suposicion de TZ y validarla al arranque.

**RT-02 — `set-pin.js` arrastra el bug de "dos mongoose" (trampa latente en una herramienta de rescate de acceso)**
- **Ubicacion:** `set-pin.js` (raiz) L4 (`const mongoose = require('mongoose')`) + L5 (`require('./Server/config/db')`); root `require('mongoose')` → `node_modules/mongoose` 9.3.1, `Server/config/db` → `Server/node_modules/mongoose` 7.8.6
- **Severidad:** Media
- **Categoria:** Produccion - Dos mongoose / scripts operativos
- **Evidencia:** `set-pin.js` hace `require('mongoose')` a nivel raiz (resuelve a la copia raiz 9.3.1) y ademas `require('./Server/config/db')`, que conecta con la copia de Server 7.8.6 (versiones confirmadas). Es el patron de "dos instancias de mongoose" que el comentario de `scripts/migrate.js` (L29-38) documenta como causa de cuelgues silenciosos. Aunque en este script la variable importada no se usa para queries (el `Usuario` viene de Server), el `require` carga una segunda instancia y es una trampa latente: cualquier edicion futura que use ese `mongoose` (`mongoose.Types.ObjectId`, `mongoose.connection`) operaria sobre la instancia desconectada y se colgaria sin timeout. Los scripts hermanos `create-admin.js` y `list-users.js` no importan mongoose de raiz; `start-mongo.js`/`backup-db.js`/`restore-db.js` no usan mongoose (invocan binarios).
- **Causa raiz:** El repo tiene dos `node_modules/mongoose` con versiones mayores distintas (raiz 9.x vs Server 7.x). Un `require('mongoose')` con cwd de raiz resuelve a la copia equivocada; ya provoco un bug corregido en migrate.js pero set-pin.js quedo con el import obsoleto.
- **Impacto:** `set-pin.js` (rescate de acceso: resetear el PIN de un usuario) es fragil y una modificacion trivial lo dejaria colgado indefinidamente sin error, justo en una emergencia de acceso. Riesgo de soporte en campo sin diagnostico claro.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Eliminar el `require('mongoose')` de raiz en set-pin.js (no se necesita) o, si se requiere, importarlo desde la copia de Server para garantizar una unica instancia. A nivel estructural, unificar mongoose en una sola version elimina esta clase de bug.

**RT-03 — `max_memory_restart` (512M) sin alinear con el heap de V8: reinicios abruptos por RSS bajo carga normal-alta**
- **Ubicacion:** `Server/ecosystem.config.cjs` L10 (`max_memory_restart: '512M'`) frente a la ausencia de `--max-old-space-size`/`node_args`/`NODE_OPTIONS` (en ecosystem, launcher.py, package.json)
- **Severidad:** Media
- **Categoria:** Produccion - Limites de recursos
- **Evidencia:** pm2 reinicia el proceso al superar 512 MB de RSS (L10), pero no se fija el limite de heap de V8 (`--max-old-space-size`) ni `NODE_OPTIONS`. En Node el heap por defecto ronda ~2 GB, muy por encima de 512 MB. Ante una fuga o un pico de carga (servir/procesar adjuntos de hasta 15 MB, `attachmentRoutes.js` L33 `MAX_SIZE_BYTES = 15 * 1024 * 1024`, con `express.json({limit:'10mb'})` en dent.js L109), pm2 reinicia el proceso EN CALIENTE por RSS antes de que V8 haga GC agresivo — un reinicio a mitad de operacion clinica en vez de degradar de forma controlada.
- **Causa raiz:** Se puso un techo de RSS conservador sin alinear el limite de heap de V8, de modo que el mecanismo de "seguridad" se convierte en fuente de reinicios abruptos bajo carga normal-alta.
- **Impacto:** Reinicios inesperados durante el uso (mismo sintoma que se quiso evitar con la resiliencia de BKP-02). Requests en vuelo cortadas en cada reinicio por memoria. Dificil de diagnosticar sin metricas.
- **Complejidad de solucion:** Baja
- **Recomendacion:** Alinear ambos limites: subir `max_memory_restart` a un valor holgado y realista (o fijar `--max-old-space-size` acorde), y medir el consumo real en un dia clinico antes de fijar el techo. El reinicio por memoria debe ser de ultimo recurso, no cotidiano.

**RT-04 — `setdefault('NODE_ENV', ...)` + `pm2 --update-env`: un `NODE_ENV=development` heredado del shell anula la config de produccion**
- **Ubicacion:** `launcher.py` L1321 (`os.environ.copy()`), L1340 (`env_vars.setdefault('NODE_ENV', ...)`), L1475/L1483 (`pm2 ... --update-env`) en interaccion con `Server/ecosystem.config.cjs` L11-16
- **Severidad:** Media
- **Categoria:** Produccion - Configuracion de entorno (NODE_ENV real)
- **Evidencia:** El arranque usa `pm2 ... --update-env` (L1475/L1483), que sobrescribe el entorno del proceso con `self.current_env` armado con `os.environ.copy()` (L1321) y `env_vars.setdefault('NODE_ENV', 'development' if mode=='local' else 'production')` (L1340). `setdefault` NO sobreescribe: si el proceso del launcher ya trae `NODE_ENV=development` heredado (una terminal de dev, un `.env` cargado antes), ese valor gana y `--update-env` lo inyecta al demonio, anulando el `env.NODE_ENV='production'` del ecosystem. Con `NODE_ENV != 'production'` se desactivan silenciosamente: el fail-fast de secretos debiles (`crypto.js` L31 + integrity), la cookie `Secure` (`authController.js` L63-64), TODO el rate limiting (`rateLimiter.js` L45 `skipInDev = req => process.env.NODE_ENV !== 'production'`) y el botGuard, ademas de exponer endpoints de debug y `err.message` en respuestas 500. No hay verificacion post-arranque de que el `NODE_ENV` efectivo sea 'production'.
- **Causa raiz:** El uso de `setdefault` + `--update-env` hace que un `NODE_ENV` heredado del shell tenga prioridad sobre el valor de produccion del ecosystem, sin assertion que detecte la discrepancia.
- **Impacto:** Seguridad y disponibilidad en un solo golpe: arrancar "en produccion" pero con config de desarrollo (secretos debiles admitidos, cookies sin Secure, sin rate limit, errores verbosos, endpoints de debug abiertos). Silencioso y dificil de detectar en campo.
- **Complejidad de solucion:** Baja
- **Recomendacion:** En modo LAN/produccion, forzar `env_vars['NODE_ENV']='production'` (asignacion directa, no `setdefault`) o dejar que el ecosystem sea la unica fuente de verdad (arrancar con `--env production` sin pisar con `--update-env`). Anadir un log de arranque en dent.js que imprima el `NODE_ENV` efectivo y avise si en modo LAN no es 'production'.
- **Nota de calibracion:** Se mantiene Media porque requiere que el operador arranque el launcher desde un shell con `NODE_ENV=development` ya exportado, escenario poco comun en el instalador estandar de una clinica pero plausible en soporte remoto por un tecnico.

**RT-05 — API escucha en `0.0.0.0` en modo LAN sirviendo PHI, mientras Mongo si se restringe a loopback**
- **Ubicacion:** `Server/scripts/dent.js` L342-345 (`host = process.env.HOST || '0.0.0.0'`, `app.listen(PORT, host)`) + `launcher.py` L1336 (`HOST='0.0.0.0'` en modo LAN) frente a mongod loopback-only (`scripts/start-mongo.js` L107-111; `mongod.cfg` L15)
- **Severidad:** Media
- **Categoria:** Produccion - Exposicion de red / configuracion
- **Evidencia:** En modo LAN el launcher fija `HOST=0.0.0.0` (L1336; en modo local usa `127.0.0.1`) y el API escucha en todas las interfaces (dent.js L342-345), sirviendo PHI (adjuntos, expediente) a cualquier dispositivo de la red del consultorio. Para Mongo se tomo la decision explicita y comentada de restringir a loopback por contener PHI (start-mongo.js L107-111 y `mongod.cfg` `bindIp: 127.0.0.1`), pero el API — que expone los MISMOS datos por HTTP — se abre a 0.0.0.0 sin equivalente. Sumado a que en modo LAN no se garantiza HTTPS (la cookie `Secure` depende de `NODE_ENV`, authController.js L63-64), el refresh token y el PHI pueden viajar en claro por el WiFi. Matiz: el runbook `configuracion-produccion.md` §3 exige TLS por reverse proxy y `COOKIE_SECURE=true`, y dent.js L41-49 soporta `TRUST_PROXY`, pero el default del codigo/launcher en modo LAN NO lo fuerza ni advierte.
- **Causa raiz:** El modo LAN prioriza accesibilidad sin acompanarlo de transporte seguro ni restriccion de interfaz por defecto, a diferencia del cuidado puesto en Mongo. La guia de TLS existe en el runbook pero no esta forzada en el arranque.
- **Impacto:** Confidencialidad de PHI (LFPDPPP/NOM-024): exposicion de expediente y tokens de sesion en la LAN, potencialmente sin cifrado si el operador no siguio el runbook. (Estrechamente relacionado con la decision de dueno DEC-01 sobre HTTP plano.)
- **Complejidad de solucion:** Media
- **Recomendacion:** Para modo LAN, forzar/validar TLS antes de exponer PHI (reverse-proxy Caddy/nginx con `TRUST_PROXY` ya soportado) o restringir el binding a la interfaz/subred concreta del consultorio. Como minimo, advertir en el arranque cuando se sirva en 0.0.0.0 sin HTTPS.

---

### Hallazgos que requieren decision del dueno

**DEC-01 — PHI y credenciales viajan sobre HTTP plano en la LAN sin TLS por defecto**
- **Ubicacion:** `install.sh` L255-257 y L286-289; `install.ps1` L327-330; `Server/scripts/dent.js` L52-77 (CSP/helmet sirve por HTTP); `docs/server/operacion/configuracion-produccion.md` L27-30
- **Severidad:** Alta
- **Categoria:** Produccion - Seguridad de transporte (PHI)
- **Evidencia:** Los instaladores fijan `CLIENT_URL`/`PUBLIC_URL` como `http://$LOCAL_IP:5002` (install.sh L256-257, install.ps1 L287-288) y `COOKIE_SECURE=false` por defecto (install.sh L286-289, install.ps1 L328-330), con el comentario explicito "no usamos HTTPS en LAN local". El expediente clinico (PHI) y las credenciales viajan en HTTP plano por la WiFi/LAN del consultorio. La doc de produccion (L27-30) reconoce que TLS "deberia" terminarse en un reverse proxy y poner `COOKIE_SECURE=true`, pero **no hay ningun script, config de nginx/Caddy, ni certificado** en el repo que lo implemente; queda como texto aspiracional. `TRUST_PROXY` esta soportado en dent.js L46-49 pero vacio por defecto.
- **Causa raiz:** Se prioriza la simplicidad de instalar sin certificados en LAN; la mitigacion de PHI-en-claro se documento pero no se automatizo ni se dejo un camino guiado.
- **Impacto:** Confidencialidad. Cualquier dispositivo en la misma LAN (otra PC, un movil en la WiFi del consultorio) puede capturar tokens y PHI en transito. Riesgo legal/reputacional y de cumplimiento (NOM-024 exige confidencialidad). El equipo mitigo el binding de Mongo a loopback (start-mongo.js L108-111) pero dejo el trafico HTTP de la app expuesto.
- **Complejidad de solucion:** Media
- **Recomendacion:** Proveer un camino TLS por defecto para LAN: generar un certificado local (mkcert o self-signed instalado en el trust store del cliente) y terminar TLS en Caddy/nginx o en Node, activando `COOKIE_SECURE=true` y `TRUST_PROXY`. Como minimo, documentar y scriptar el reverse proxy en vez de dejarlo como prosa.
- **Por que requiere decision del dueno:** A diferencia de los bugs, no es un defecto sino una decision explicita y documentada de operacion (LAN aislada sin certificados) con un trade-off de cumplimiento NOM-024. La resolucion —montar TLS con mkcert/Caddy y activar `COOKIE_SECURE`, o aceptar formalmente el riesgo en una LAN fisicamente controlada— es una decision de negocio/operacion, no una correccion mecanica. La severidad se mantiene Alta: el binding de Mongo a loopback demuestra que el equipo si mitiga confidencialidad donde decide hacerlo, y aqui el PHI queda expuesto a cualquier dispositivo de la WiFi del consultorio.

---

### Hallazgos descartados en verificacion (transparencia)

Ningun hallazgo Critica/Alta fue clasificado como FALSO_POSITIVO en la verificacion adversarial de esta fase. Todos los hechos tecnicos centrales se confirmaron en disco; las unicas correcciones fueron ajustes de severidad (documentados en las notas de calibracion de cada hallazgo) y consolidaciones para evitar doble conteo con la fase previa de Base de Datos (DB-OPS-01/02, ver BKP-04 y BKP-06). Se deja constancia de dos matices de precision que refinaron —sin refutar— hallazgos confirmados:

- **DOC-08 (recuperacion/runbooks):** la afirmacion original "no existe runbook ni doc de recuperacion" resulto **parcialmente falsa** — `backups-y-restauracion.md` §4 SI cubre recuperacion ante desastre y `configuracion-produccion.md` SI cubre diagnostico de arranque por secretos — por lo que se ajusto de Alta a Baja (queda solo el gap de un runbook de incidentes de arranque consolidado).
- **CFG-04 (`.env` raiz):** se verifico que el `.env` raiz **no** contiene `NODE_ENV`, por lo que el `override:true` NO afecta el arranque production/development; el riesgo es estrictamente de red (HOST/PORT/MONGODB_URI/CLIENT_URL). El hallazgo se mantiene en Alta por ese vector.

---

### Conclusion de produccion

El sistema puede operar en el escritorio del dueno, pero no cumple hoy el estandar de disponibilidad, recuperabilidad ni confidencialidad que exige una clinica que paga. Tres acciones concentran la mayor reduccion de riesgo por el menor esfuerzo (todas de complejidad Baja/Media y ya con causa raiz y ubicacion identificadas):

1. **Cerrar el ciclo de release: generar `AUDIT_HMAC_SECRET` en los instaladores y ejecutar las migraciones en la actualizacion** (CFG-01 + DOC-01, ambos con causa raiz "automatizacion faltante"). Anadir la generacion de `AUDIT_HMAC_SECRET` (≥32 hex, preservado en reinstalaciones) en `install.sh`/`install.ps1`/`launcher.py` con la misma logica ya usada para `JWT_SECRET`, y crear un `update.sh`/`update.ps1` que haga backup → `migrate:dry` → `migrate` → build → arranque. Esto elimina de un golpe el escenario "no arranca en produccion o corre con integridad NOM-024 desactivada" y el de "codigo nuevo sobre esquema viejo" (falsos positivos de `audit/verify`, `user.save()` roto) — los dos vectores de mayor severidad de la fase.

2. **Convertir el arranque en un servicio supervisado y persistente al boot** (CFG-02 + CFG-03 + BKP-02/BKP-03). Declarar `pm2` como dependencia real, arrancar SIEMPRE por pm2 (eliminando el fallback a `nodemon`/`concurrently`), y registrar `pm2 startup`+`pm2 save` (o un servicio de SO / LaunchAgent / systemd) en la instalacion, en simetria con lo que ya se hace para MongoDB. En el mismo cambio, acotar el `uncaughtException` para salir con codigo distinto de 0 bajo supervisor y completar el `gracefulShutdown` con cierre de Mongo + timeout de respaldo. Con esto un crash o un reinicio del equipo dejan de significar "clinica caida hasta intervencion manual".

3. **Anadir un canal minimo de alerta con un marcador de exito de backup** (OBS-01 + OBS-02 + BKP-01). Un cron/schtasks que consulte `/api/health` periodicamente (verificando `db.status==connected`, tras enriquecer el endpoint para devolver 503 con la DB caida) y que valide un marcador `backups/last-success.json` (>25h o tamano sospechoso dispara aviso), notificando por email SMTP o webhook. Esto ilumina los tres eventos hoy invisibles —backup roto, disco lleno, Mongo caido a media jornada— y transforma el modelo operativo de "nos enteramos cuando el cliente se queja" a una deteccion proactiva, cerrando el peor vector: la perdida silenciosa de PHI.

Fuera de estas tres, quedan como seguimiento la decision del dueno sobre TLS en LAN (DEC-01), la correccion de la TZ de negocio en los cortes de caja (RT-01) y la higiene de documentacion/versionado (DOC-02/03/04), todas ya calibradas y ubicadas en los hallazgos anteriores.


---

## Fase 8 — SaaS Readiness

### Resumen de la fase

Dentia Core V1 fue diseñado, de punta a punta, sobre la premisa "una instalación = una clínica": los 17 modelos Mongoose no tienen ningún campo de tenant/organización (confirmado por grep exhaustivo de `tenantId|organizationId|clinicId|orgId|sucursal|branch` sobre todo `Server/`, con cero coincidencias en modelos, controllers, rutas o middlewares), el JWT no lleva ningún claim de tenant, `ClinicSettings` es un singleton explícitamente documentado como tal en su propio código (`// Singleton: siempre un solo documento`), la conexión a MongoDB es única por proceso, el almacenamiento de archivos es un disco local sin namespacing, y no existe ninguna capa de servicios/repositorio que centralice el acceso a datos (0 archivos en `Server/services/` o `Server/repositories/`, y 320 llamadas Mongoose directas repartidas en 16 controllers). Esta arquitectura es coherente y madura para su propósito actual — no hay lógica de negocio dispersa acoplada a "una sola clínica" fuera de estos puntos de infraestructura/configuración, lo cual es en sí mismo una base razonable de partida — pero está lejos, estructuralmente, de soportar multi-tenancy sin una re-arquitectura deliberada.

Si se lanzara un SaaS de base de datos compartida sin resolver estos puntos, los tres riesgos más graves serían: (1) **fuga de PHI cross-tenant por ausencia de capa de servicios** — con ~320 puntos de acceso directo a Mongoose sin ningún filtro de tenant, basta que uno solo (de los existentes o de cualquier controller nuevo) omita el filtro para que expedientes clínicos completos de una clínica queden visibles/editables desde la sesión de otra; (2) **el singleton de `ClinicSettings`**, que haría que todas las clínicas compartan la misma configuración de seguridad, horarios, catálogo de servicios, moneda y overrides de permisos por rol — un cambio de cualquier clínica rompería instantáneamente a todas las demás, incluyendo el cálculo de permisos efectivos en cada login; y (3) **tres índices únicos globales que hoy son intencionales pero se romperían operativamente con más de un tenant** (`paciente_id`, `documento.numero`, `email` de `Usuario`, y la sesión de caja `OPEN` única), que bloquearían el alta de pacientes/usuarios o la apertura de caja de la segunda clínica desde el primer día. A esto se suma un riesgo regulatorio propio: la cadena de hash de `AuditLog` (integridad NOM-024) es una secuencia global (`seq` único) que entrelazaría la verificabilidad de auditoría de todas las clínicas si no se particiona por tenant.

En total se identificaron **21 áreas únicas** a través de las cinco dimensiones auditadas (Datos y Aislamiento, Autenticación y Autorización, Configuración y White-Labeling, Infraestructura y Almacenamiento, Arquitectura y Capa de Servicios), de las cuales, tras la verificación adversarial, **13 quedan en prioridad Critica**, **6 en Alta**, y **el resto en Media/Baja o reclasificadas a la baja** por la revisión. Ninguna fue descartada por sobreestimación — la revisión, si acaso, encontró que el volumen real de puntos de acceso directo a Mongoose (320) es mayor al estimado originalmente (~270), y que el singleton de `ClinicSettings` es aún más frágil de lo descrito (no hay ni siquiera un índice único a nivel de BD que lo blinde; la garantía de "un solo documento" depende enteramente de la disciplina de no invocar `create()` fuera de `getSettings()`).

**Nota importante de alcance**: esta sección es un inventario de diagnóstico para planificación futura, no una lista de trabajo a ejecutar ahora. El propio dueño del producto solicitó explícitamente **no implementar SaaS todavía** — el objetivo de esta fase es dejar documentado, con evidencia verificada línea por línea contra el código real, qué tendría que cambiar y con qué severidad, para que una futura decisión de negocio de avanzar hacia multi-tenancy parta de un diagnóstico preciso en vez de una estimación a ciegas.

### Areas identificadas (por dimension)

#### Datos y Aislamiento

**SAAS-DATA-01 — `paciente_id` de 4 dígitos con índice único global**
- **Ubicación**: `Server/models/patient.js` líneas 6-8 (`generate4Digits`), 13-18 (campo `paciente_id`, `unique: true, sparse: true`), 922-952 (`generateUniquePatientId`)
- **Prioridad**: Critica
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: `paciente_id` es un `String` de 4 dígitos (rango 1000-9999, tope teórico ~9000 IDs) con índice único GLOBAL sobre toda la colección `patients`. `generateUniquePatientId` hace `this.exists({ paciente_id: id })` sin ningún filtro de tenant, y si 100 intentos colisionan, escanea toda la colección buscando el primer hueco libre.
- **Qué cambia para SaaS**: El índice único debe pasar a ser compuesto `{tenantId:1, paciente_id:1}`, y `generateUniquePatientId`/su fallback deben operar siempre dentro del scope de un tenant.
- **Riesgo si no se aborda**: La segunda clínica del sistema no podría dar de alta pacientes tan pronto sus IDs de 4 dígitos elegidos al azar choquen con los de la primera — errores E11000 intermitentes desde el primer piloto multi-cliente.
- **Complejidad de migración**: Alta
- **Recomendación**: Redefinir la unicidad como compuesta con tenantId y parametrizar el generador/fallback; reevaluar si el rango de 4 dígitos sigue siendo adecuado multiplicado por N clínicas.

**SAAS-DATA-02 — `ClinicSettings` singleton (también reportado en Configuración y Arquitectura; consolidado aquí)**
- **Ubicación**: `Server/models/clinicSettings.js` líneas 90-97 (`getSettings`, comentario literal "Singleton: siempre un solo documento"); consumido en `settingsController.js` (12+ invocaciones), `authController.js` (líneas 104 y 316), `usersController.js` (líneas 136 y 236)
- **Prioridad**: Critica
- **Categoría**: SaaS - Configuración / Datos y aislamiento
- **Estado actual**: `getSettings()` ejecuta `this.findOne()` sin ningún filtro y crea el único documento con `this.create({})` si no existe. No hay ni siquiera un índice único a nivel de BD que blinde el singleton — la garantía es puramente de convención de código. Contiene nombre/dirección/logo de la clínica, políticas de seguridad de sesión, horarios, catálogo de servicios, moneda y `rolePermissionOverrides` (permisos por rol). Se confirmó que el radio de consumo real excede el panel de settings: también lo leen el login/refresh (`authController`) y la gestión de usuarios (`usersController`).
- **Qué cambia para SaaS**: Debe convertirse en colección con un documento por tenant; `getSettings()`/`updateSettings()` deben requerir el tenant como parámetro obligatorio en lugar de un `findOne()` ciego, cubriendo explícitamente los 4 call-sites fuera de `settingsController`.
- **Riesgo si no se aborda**: Todas las clínicas compartirían la misma configuración de seguridad, horarios, catálogo de servicios, moneda y overrides de permisos — un cambio de cualquier clínica afectaría instantáneamente a todas las demás, incluyendo el flujo de login y la resolución de permisos efectivos.
- **Complejidad de migración**: Media (el modelo en sí es pequeño y autocontenido; el barrido de call-sites es mecánico pero no trivial)
- **Recomendación**: Convertir a colección indexada por tenant con índice único `{tenantId:1}`, actualizar todos los call-sites conocidos (incluyendo los de auth/usuarios, no solo settings) para pasar el tenant explícito.

**SAAS-DATA-03 — Índices únicos globales en `documento.numero` y `Usuario.email`**
- **Ubicación**: `Server/models/patient.js` línea 31 (`documento.numero`, `unique: true`); `Server/models/users.js` línea 22 (`email`, `unique: true`)
- **Prioridad**: Alta
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: Ambos campos de negocio (no ObjectId) tienen unicidad GLOBAL en toda la base de datos, asumiendo una sola población de pacientes/usuarios en toda la instalación.
- **Qué cambia para SaaS**: `documento.numero` debería pasar a unicidad compuesta `{tenantId, documento.numero}` (dos clínicas distintas pueden atender legítimamente a la misma persona). `Usuario.email` requiere antes una decisión de negocio explícita: por-tenant vs. identidad global de persona (relevante si un doctor trabaja para varias clínicas).
- **Riesgo si no se aborda**: Bloqueo operativo real: la clínica B no podría registrar como paciente a alguien que ya es paciente de la clínica A con el mismo documento de identidad — caso de negocio válido que el esquema actual rechaza con E11000.
- **Complejidad de migración**: Media
- **Recomendación**: Decidir explícitamente el modelo de identidad de `Usuario.email` antes de migrar (afecta el diseño de autenticación); migrar `documento.numero` a índice compuesto con tenant salvo decisión de negocio en contrario.

**SAAS-DATA-04 — Múltiples índices únicos globales repetidos en 5 modelos (patrón consolidado)**
- **Ubicación**: `patient.js:31` (`documento.numero`), `patient.js:15` (`paciente_id`), `users.js:22` (`email`), `periodontogram.js:289` (`{patient:1}` unique, comentario "Un periodontograma por paciente"), `odontogramaHistory.js:60` y `periodontogramHistory.js:61` (`{patient:1, versionName:1}` unique compuesto, pero sin tenantId)
- **Prioridad**: Critica
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: El mismo patrón de "unique global sin dimensión de tenant" se repite en al menos 5 modelos distintos, no es un caso aislado.
- **Qué cambia para SaaS**: Todos estos índices deben recomponerse con `tenantId` como primer campo del índice compuesto.
- **Riesgo si no se aborda**: Bloqueo operativo inmediato al incorporar la segunda clínica: coincidencia de cédula/pasaporte entre pacientes de distintas clínicas, o de email entre profesionales de distintas clínicas, algo estadísticamente probable en la primera semana de un piloto real.
- **Complejidad de migración**: Media
- **Recomendación**: Migración de índices (`dropIndex` + `createIndex` compuesto con tenantId) coordinada con la introducción del campo tenantId en los documentos existentes, como un solo esfuerzo, no aislado modelo por modelo.

**SAAS-DATA-05 — Sesión de caja única global (`BoxSession.status:'OPEN'`)**
- **Ubicación**: `Server/models/boxSession.js` líneas 52-55 (índice `{status:1}` unique con `partialFilterExpression: {status:'OPEN'}`)
- **Prioridad**: Alta
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: El índice garantiza "una sola sesión OPEN en toda la colección", consistente con el negocio actual (una clínica = una caja física).
- **Qué cambia para SaaS**: El índice debe pasar a compuesto `{tenantId:1, status:1}` con el mismo `partialFilterExpression`, de lo contrario ninguna segunda clínica podría abrir caja mientras la primera tenga una abierta.
- **Riesgo si no se aborda**: Bloqueo operativo funcional inmediato y muy visible: la clínica B no podría abrir su caja del día si la clínica A ya tiene una abierta.
- **Complejidad de migración**: Baja
- **Recomendación**: Ampliar el índice único parcial para incluir tenantId como prefijo compuesto antes de permitir que dos clínicas compartan la misma base física.

**SAAS-DATA-06 — Ausencia total de capa de servicios/repositorio (320 accesos directos a Mongoose)**
- **Ubicación**: `Server/controllers/*.js` (16 archivos; ~320 llamadas `.find/.findOne/.findById/.updateOne/.updateMany/.deleteOne/.aggregate/.create/.save`, verificadas por conteo directo); no existe `Server/services/` ni `Server/repositories/`
- **Prioridad**: Critica
- **Categoría**: SaaS - Arquitectura/Servicios
- **Estado actual**: Ningún modelo tiene campo de tenant. Cada controller importa el modelo Mongoose directamente y arma sus queries inline; no existe ningún punto único de acceso a datos ni ningún uso de `mongoose.plugin()` en todo el proyecto (0 resultados).
- **Qué cambia para SaaS**: Introducir tenantId en los 17 modelos es solo el primer paso; lo estructuralmente crítico es una capa intermedia (servicios/repositorios, o un plugin de Mongoose que inyecte el filtro de tenant vía middleware `pre('find')`/`pre('save')`) que centralice el filtrado en un solo lugar.
- **Riesgo si no se aborda**: Basta que UNA de las ~320 queries (existentes o de un controller futuro) omita el filtro de tenant para que expedientes clínicos completos de una clínica sean visibles/editables desde la sesión de otra — incidente de fuga de PHI con implicaciones regulatorias serias.
- **Complejidad de migración**: Alta
- **Recomendación**: Tratar la capa de servicios como prerrequisito arquitectónico antes del aislamiento multi-tenant, no como algo paralelo: filtrar por tenant en un solo lugar es sostenible, hacerlo disperso en ~320 callsites no lo es.

**SAAS-DATA-07 — Cadena de hash de `AuditLog` (integridad NOM-024) como secuencia global**
- **Ubicación**: `Server/models/auditLog.js` (índice `{seq:1}` unique global línea 203, `registrar()` líneas 216-251, `verifyChain()` líneas 263-293)
- **Prioridad**: Critica
- **Categoría**: SaaS - Arquitectura/Servicios
- **Estado actual**: La cadena de hash es una única secuencia autoincremental (`seq`) para toda la instalación, sin distinción de origen; el índice único es global a la colección `audit_logs`.
- **Qué cambia para SaaS**: `seq` debe pasar a único por combinación `(tenantId, seq)`; `registrar()` y `verifyChain()` deben operar y verificar cadenas independientes por tenant.
- **Riesgo si no se aborda**: La integridad de auditoría de todas las clínicas queda entrelazada — un incidente de integridad en una clínica podría invalidar la verificabilidad NOM-024 de las demás sin que tengan responsabilidad en ello; además, el índice único global es un cuello de botella de escritura concurrente entre tenants.
- **Complejidad de migración**: Media
- **Recomendación**: Namespacing de la cadena por tenant (índice compuesto único `{tenantId:1, seq:1}`) y adaptación de `registrar()`/`verifyChain()` al nuevo scope; cambio acotado a un solo modelo pero sensible por tratarse de un mecanismo regulatorio ya en producción.

**SAAS-DATA-08 (positivo/bajo riesgo) — Índice único de `Periodontogram.patient` (ObjectId)**
- **Ubicación**: `Server/models/periodontogram.js` línea 289
- **Prioridad**: Media
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: El índice único es sobre un `ObjectId` que referencia `Patient._id` — únicos globalmente por construcción, no colisionarían entre tenants aunque la BD se comparta.
- **Qué cambia para SaaS**: No requiere cambio funcional de unicidad; conviene añadir tenantId como parte de un índice compuesto secundario por rendimiento/defensa en profundidad, no por unicidad.
- **Riesgo si no se aborda**: Bajo por este índice específico; el riesgo real estaría en un `findOne({patient: X})` sin verificar que el usuario pertenece al mismo tenant que el paciente X — problema de autorización, no del índice.
- **Complejidad de migración**: Baja
- **Recomendación**: Mantener la unicidad actual; añadir tenantId como índice secundario de performance y asegurar verificación de pertenencia de tenant en la capa de autorización.

**SAAS-DATA-09 — Migración de datos históricos de clientes existentes**
- **Ubicación**: Runner de migraciones (`scripts/migrate.js`, ya auditado en Fase 5) + los 17 modelos sin tenantId, incluyendo históricos (`odontograma_history`, `periodontogram_history`, `audit_logs`)
- **Prioridad**: Media
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: Si un cliente on-premise migra a SaaS, todos sus documentos históricos carecerían de tenantId. La Fase 5 encontró bugs concretos que impedían correr el runner de punta a punta (corregidos en el commit `5450bd10`), señal de que el pipeline de migración es joven, no un proceso maduro probado a gran escala.
- **Qué cambia para SaaS**: El backfill en sí es conceptualmente simple (un valor constante de tenantId por cliente, sin ambigüedad de asignación); la complejidad real está en cubrir las 17 colecciones + históricos + `audit_logs` sin omitir ninguna, y en la confiabilidad del runner.
- **Riesgo si no se aborda**: Documentos huérfanos sin tenantId (invisibles para su propia clínica) o bitácora de auditoría legal inconsistente si se omite `audit_logs` o se rompe su cadena de integridad.
- **Complejidad de migración**: Media
- **Recomendación**: Backfill como valor constante por cliente migrado, cubriendo todas las colecciones sin excepción, ejecutado solo sobre un runner que ya haya demostrado estabilidad de punta a punta.

#### Autenticación y Autorización

**SAAS-AUTH-01 — JWT sin claim de tenant**
- **Ubicación**: `Server/middlewares/authenticate.js` líneas 17-30; `Server/controllers/authController.js` (`signAccessToken`/`signRefreshToken`, líneas 73-101)
- **Prioridad**: Critica
- **Categoría**: SaaS - Autenticación/Autorización
- **Estado actual**: El access token solo incluye `sub`, `role`, `nombre` y `permissions`; el refresh token solo `sub` y `type`. Ningún claim identifica la clínica/tenant del usuario. `req.user` se reconstruye sin `tenantId` en ningún punto.
- **Qué cambia para SaaS**: El JWT (ambos tokens) debe incluir un claim de tenant inmutable durante la vida del token, y cada request debe validar que ese tenant coincide con el del recurso solicitado.
- **Riesgo si no se aborda**: En BD compartida, un token robado o reutilizado entre entornos permitiría leer/escribir datos de otra clínica sin que el middleware lo detecte — incumplimiento de LFPDPPP/NOM-024.
- **Complejidad de migración**: Alta
- **Recomendación**: Incorporar tenant como claim de primera clase en el JWT y como criterio obligatorio de validación en middleware, no solo en queries de negocio.

**SAAS-AUTH-02 — `Usuario` sin campo de tenant + índice único global de email**
- **Ubicación**: `Server/models/users.js` (schema completo, líneas 13-138; índice `email` línea 19-26)
- **Prioridad**: Critica
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: Sin `clinicId`/`tenantId`; `email` único globalmente en toda la colección `usuarios`.
- **Qué cambia para SaaS**: Se necesita un campo de pertenencia a tenant (o tabla de membresía usuario-clínica) y el índice de email re-alcanzado a `(tenantId, email)`.
- **Riesgo si no se aborda**: Con múltiples clínicas en la misma BD, dos clínicas no podrían tener nunca un usuario con el mismo email aunque sean personas distintas — bloqueo operativo desde el primer piloto multi-cliente.
- **Complejidad de migración**: Alta
- **Recomendación**: Diseñar el modelo de pertenencia usuario-clínica y migrar el índice de email a alcance por tenant.

**SAAS-AUTH-03 — `ClinicSettings` singleton afecta cálculo de permisos en login (ver también SAAS-DATA-02)**
- **Ubicación**: `Server/models/clinicSettings.js` líneas 91-97; consumido en `authController.js` (líneas 104, 316) y `usersController.js` (líneas 136, 236)
- **Prioridad**: Critica
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: `getSettings()` sin filtro; consumido en cada login/refresh para resolver `rolePermissionOverrides` y calcular permisos efectivos.
- **Qué cambia para SaaS**: Debe convertirse en documento por tenant, recibido explícitamente en `respondWithTokens` y `/auth/me`.
- **Riesgo si no se aborda**: Todas las clínicas leerían/modificarían la misma configuración de seguridad y overrides de permisos; un cambio de la Clínica A rompería la operación de la Clínica B, incluyendo login.
- **Complejidad de migración**: Alta
- **Recomendación**: Rediseñar como multi-documento con clave de tenant; auditar cada llamada a `getSettings()` para que reciba el tenant de la sesión en curso.

**SAAS-AUTH-04 — Modelo de usuario asume 1 usuario = 1 clínica (sin membresía múltiple)**
- **Ubicación**: `Server/models/users.js` + `Server/controllers/usersController.js` (`ROLE_HIERARCHY`, `checkPrivilegeEscalation`, líneas 10-52)
- **Prioridad**: Alta
- **Categoría**: SaaS - Autenticación/Autorización
- **Estado actual**: Un usuario tiene exactamente un rol, evaluado de forma absoluta e independiente de contexto de clínica. No hay mecanismo de membresía múltiple.
- **Qué cambia para SaaS**: Si el negocio requiere que un doctor trabaje en más de una clínica, el modelo debe evolucionar a "usuario tiene una lista de membresías", cada una con su propio rol/permisos por clínica.
- **Riesgo si no se aborda**: Sin este cambio, un doctor con 2 consultorios necesitaría 2 cuentas con emails distintos (workaround artificial), cerrando de entrada un caso de uso de negocio ya anticipado.
- **Complejidad de migración**: Alta (moderada-alta tras recalibración: `getEffectivePermissions` en `permissions.js` ya implementa el patrón de merge base-rol + overrides + individual que se necesitaría por membresía, precedente de diseño reutilizable)
- **Recomendación**: Decidir explícitamente si el modelo de negocio soporta multi-membresía antes de construir V2; si sí, diseñar la relación usuario-clínica como entidad separada del usuario.
- **Nota de recalibración**: reclasificado de hallazgo de aislamiento a decisión de producto pendiente — no es una brecha de seguridad activa hoy, a diferencia de SAAS-AUTH-01/02 y SAAS-DATA-02. No bloquea un piloto mono-clínica-por-cliente.

**SAAS-AUTH-05 — Rol `superadmin` fusiona operador de plataforma y dueño de clínica**
- **Ubicación**: `Server/utils/permissions.js` (rol `superadmin`, líneas 12-19); `Server/middlewares/authorize.js` (bypass, líneas 20-39)
- **Prioridad**: Alta
- **Categoría**: SaaS - Autenticación/Autorización
- **Estado actual**: `superadmin` bypasea el chequeo de permisos por completo dentro de una instalación, fusionando "operador de plataforma" y "dueño técnico de esta clínica" porque solo existe un tenant.
- **Qué cambia para SaaS**: Deben separarse: (1) operador de plataforma SaaS cross-tenant, auditado estrictamente; (2) dueño/administrador de una clínica específica, siempre acotado a su propio tenant sin wildcard cross-tenant.
- **Riesgo si no se aborda**: Cualquier cuenta `superadmin` tendría wildcard de acceso a TODAS las clínicas del SaaS — superficie de riesgo inaceptable para un piloto multi-cliente.
- **Complejidad de migración**: Media
- **Recomendación**: Modelar "operador de plataforma" como entidad separada del `superadmin` actual, con acceso cross-tenant solo mediante mecanismo auditado.
- **YA_MITIGADO_PARCIALMENTE**: la exigencia de `motivo` obligatorio (≥3 caracteres) en cada escritura de `superadmin`, junto con el log de auditoría asociado, YA ESTÁ CONSTRUIDA y funcionando en `authorize.js` — es un cimiento directamente reusable para el futuro rol de "operador de plataforma auditado"; falta solo la segmentación de roles, no la trazabilidad de sus acciones.

**SAAS-AUTH-06 — Secreto JWT único por proceso (sin rotación/revocación por tenant)**
- **Ubicación**: `Server/utils/crypto.js` (`getJwtSecret`, línea 24); `Server/.env` (`JWT_SECRET`)
- **Prioridad**: Media (recalibrado de Alta)
- **Categoría**: SaaS - Autenticación/Autorización
- **Estado actual**: Un único `JWT_SECRET` por proceso Node firma/valida todos los JWT. No hay concepto de secreto o rotación por tenant. La revocación de sesión hoy es por-usuario (`refreshTokenHash`), nunca a nivel clínica completa.
- **Qué cambia para SaaS**: Con un proceso sirviendo múltiples clínicas, un solo secreto sigue siendo técnicamente válido, pero no hay forma de revocar/rotar el acceso de una sola clínica sin invalidar todas las sesiones.
- **Riesgo si no se aborda**: Imposibilidad de respuesta a incidentes por tenant (revocar todas las sesiones de una clínica sospechosa de compromiso).
- **Complejidad de migración**: Media
- **Recomendación**: Mantener secreto único combinado con el claim de tenant (SAAS-AUTH-01) como mecanismo de invalidación por clínica, en vez de secretos por tenant.
- **Nota de recalibración**: bajado de Alta a Media — no es una brecha de aislamiento cross-tenant por sí misma (hoy comprometer el secreto de un proceso ya compromete solo a ese cliente); es una limitación operativa de respuesta a incidentes, subordinada a SAAS-AUTH-01, y no bloquea un piloto inicial.

**SAAS-AUTH-07 — `/uploads` sin verificación de pertenencia de tenant**
- **Ubicación**: `Server/middlewares/uploadsAuth.js` (`classifyUploadPath` y gate de autorización)
- **Prioridad**: Media
- **Categoría**: SaaS - Datos y aislamiento
- **Estado actual**: Autoriza acceso verificando sesión válida y permisos de rol, pero no valida que el paciente dueño del archivo pertenezca al mismo tenant que el usuario (porque esa noción no existe hoy).
- **Qué cambia para SaaS**: Debe verificar `paciente.tenantId === req.user.tenantId` antes de servir el archivo, además del chequeo de rol existente.
- **Riesgo si no se aborda**: Si `/uploads` se centraliza en almacenamiento compartido, un usuario de la Clínica A podría acceder a expedientes de un paciente de la Clínica B adivinando/enumerando IDs de 4 dígitos.
- **Complejidad de migración**: Media
- **Recomendación**: Extender el gate para incluir verificación de pertenencia de tenant en cuanto exista el claim correspondiente.

#### Configuración y White-Labeling

**SAAS-CFG-01 — Google OAuth: credenciales de proceso + tokens solo en cookie**
- **Ubicación**: `Server/routes/googleRoutes.js` (`buildAuthUrl`, `/auth/url`, `/oauth2callback`, `/refresh-token`); `Server/.env.example` (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`)
- **Prioridad**: Alta
- **Categoría**: SaaS - Configuración
- **Estado actual**: Credenciales OAuth como variables de proceso; tokens del usuario en cookies httpOnly, nunca persistidos en BD asociados a tenant.
- **Qué cambia para SaaS**: Cada clínica necesitaría conectar su propio Google Calendar; decidir entre app OAuth única de plataforma (con tokens por tenant en BD) o app OAuth propia por clínica.
- **Riesgo si no se aborda**: Todas las clínicas compartirían la misma app OAuth sin mecanismo que verifique que el calendario conectado en una sesión de navegador corresponde al tenant correcto — riesgo de eventos escritos en el calendario equivocado.
- **Complejidad de migración**: Alta
- **Recomendación**: Definir si "conectar Google Calendar" es feature por-tenant con credenciales/tokens propios persistidos y ligados a `clinicId`.
- **YA_MITIGADO_PARCIALMENTE**: el endurecimiento existente (`authenticate` obligatorio en `/auth/token` y `/refresh-token`, rate limiting vía `oauthLimiter`, validación de `state`/`returnPath` contra whitelist) ya reduce el riesgo de fuga *hoy* en instalación single-tenant, aunque no cambia la complejidad de la migración real (sigue Alta porque el diseño de fondo no tiene punto de enganche a `clinicId`).

**SAAS-CFG-02 — Almacenamiento de logo sin namespacing por tenant**
- **Ubicación**: `Server/controllers/settingsController.js` (`uploadLogo`/`deleteLogo`/`getLogo`, líneas 417-466); `Server/utils/uploads.js` (`resolveUploadsPath`)
- **Prioridad**: Alta
- **Categoría**: SaaS - Infraestructura/Almacenamiento
- **Estado actual**: Logo guardado en `uploads/logos/<filename>` sin segmentación por clínica; `getLogo` lo sirve sin verificar tenant.
- **Qué cambia para SaaS**: Namespacing por tenant en el path (`uploads/{clinicId}/logos/...`) y validación de pertenencia en el endpoint de lectura.
- **Riesgo si no se aborda**: Colisión de nombres de archivo entre tenants y fuga de branding de una clínica a otra.
- **Complejidad de migración**: Baja
- **Recomendación**: Extender el mismo cambio de namespacing que aplicaría a `/uploads` en general, coordinado con SAAS-DATA-02.

**SAAS-CFG-03 — Variables de entorno de "plataforma" vs. cadena de auditoría global**
- **Ubicación**: `Server/.env.example` (líneas 12, 28, 36, 43: `JWT_SECRET`, `AUDIT_HMAC_SECRET`, `ENCRYPTION_KEY`, `MONGODB_URI`); `Server/models/auditLog.js` (índice `seq` único global línea 203)
- **Prioridad**: Media
- **Categoría**: SaaS - Configuración
- **Estado actual**: Variables de un solo valor por instalación completa. `AUDIT_HMAC_SECRET` firma toda la cadena de auditoría de la instalación, estructurada como secuencia lineal única.
- **Qué cambia para SaaS**: Estas variables pueden seguir siendo "de plataforma" bajo BD compartida con aislamiento lógico; lo que sí requiere cambio de esquema es partición de `seq`/`prevHash` de `AuditLog` por tenant (ver SAAS-DATA-07).
- **Riesgo si no se aborda**: Bajo si el aislamiento lógico en queries se resuelve correctamente (pendiente en otros hallazgos); el riesgo real está en que ese aislamiento aún no existe, incluida la propia cadena de auditoría.
- **Complejidad de migración**: Baja
- **Recomendación**: Documentar estas variables como "de plataforma/instancia" explícitamente, distinguiéndolas de las que deben moverse a config por-tenant; incluir la partición de `seq`/`prevHash` en el alcance.

**SAAS-CFG-04 — Locale/TZ de fechas hardcodeado a `es-ES`/TZ del servidor**
- **Ubicación**: `Server/controllers/patientsController.js` (líneas 1432, 2384, `toLocaleDateString('es-ES', ...)`); TZ heredada del SO (hallazgo de Fase 7)
- **Prioridad**: Media
- **Categoría**: SaaS - Configuración
- **Estado actual**: Locale fijo `es-ES` en formateo de fechas de notas/planes de tratamiento; sin campo de TZ/locale en `ClinicSettings` ni en ningún modelo.
- **Qué cambia para SaaS**: Cada tenant necesitaría poder configurar su propia zona horaria y locale.
- **Riesgo si no se aborda**: Con clínicas en distintos husos/países, horarios de citas, timestamps de audit log y fechas impresas podrían calcularse o mostrarse incorrectamente de forma silenciosa.
- **Complejidad de migración**: Media
- **Recomendación**: Añadir campo TZ/locale a la configuración por-tenant (tras resolver SAAS-DATA-02) y auditar los puntos que asumen TZ/locale implícito del servidor.

**SAAS-CFG-05 (positivo) — Campos de configuración operativa ya en forma multi-tenant-friendly**
- **Ubicación**: `Server/models/clinicSettings.js` (`businessHours`, `workDays`, `currency`, `serviceCatalog`, `cashCategories`, `rolePermissionOverrides`, `defaultAppointmentDuration`, `inactivityTimeout`, `maxLoginAttempts`, `lockDuration`)
- **Prioridad**: Baja
- **Categoría**: SaaS - Configuración
- **Estado actual**: Todos modelados como valores simples o subdocumentos embebidos en un esquema plano, sin referencias cruzadas complejas más allá de la ausencia del campo de tenant.
- **Qué cambia para SaaS**: Nada en la forma de estos datos necesita rediseño; basta con agregar `clinicId` al esquema para que funcionen "por fila" sin tocar su estructura interna.
- **Riesgo si no se aborda**: N/A (hallazgo positivo).
- **Complejidad de migración**: Baja
- **Recomendación**: Priorizar la adición de tenant al esquema (SAAS-DATA-02) como único cambio estructural real necesario aquí.

#### Infraestructura y Almacenamiento

**SAAS-INFRA-01 — Modelo de despliegue "instalador on-premise" vs. onboarding SaaS**
- **Ubicación**: `install.sh` / `install.ps1` / `launcher.py` / `EJECUTAR_INSTALADOR.bat` (raíz del repo)
- **Prioridad**: Critica
- **Categoría**: SaaS - Infraestructura/Despliegue
- **Estado actual**: El "despliegue" hoy es un instalador que aprovisiona una máquina completa por cliente (Node, MongoDB standalone local, IP LAN horneada en `.env`, launcher de escritorio Tkinter).
- **Qué cambia para SaaS**: El instalador se reemplaza por un flujo de onboarding de tenant contra infraestructura corriendo 24/7, sin instalación local ni proceso de escritorio por cliente.
- **Riesgo si no se aborda**: Sin este cambio no hay SaaS posible: cada cliente nuevo seguiría requiriendo máquina, instalador y admin de sistemas local.
- **Complejidad de migración**: Alta
- **Recomendación**: Diseñar pipeline de onboarding (API/portal); el launcher e instalador quedan obsoletos para SaaS (conservables solo para clientes on-premise que no migren).

**SAAS-INFRA-02 — `/uploads` en disco local sin namespacing por tenant**
- **Ubicación**: `Server/scripts/dent.js:129-135` (`express.static`); `Server/utils/uploads.js` (`getUploadsBase`); `Server/middlewares/uploadsAuth.js`; rutas `/uploads/pacientes/<id>/...`
- **Prioridad**: Critica
- **Categoría**: SaaS - Infraestructura/Almacenamiento
- **Estado actual**: Archivos clínicos (fotos, adjuntos, firmas, logos, capturas de odontograma) en disco local, servidos con `express.static`. Estructura `pacientes/<patientObjectId>/...` sin segmento de tenant.
- **Qué cambia para SaaS**: Migrar a almacenamiento de objetos (S3-compatible) con prefijo por tenant, URLs firmadas, y `uploadsAuth.js` validando pertenencia de tenant, no solo rol/sesión.
- **Riesgo si no se aborda**: Con N instancias tras un load balancer, archivos subidos en una instancia serían 404 en otra; sin namespace, riesgo de colisión o exposición de PHI entre clínicas.
- **Complejidad de migración**: Alta
- **Recomendación**: Capa de storage abstraída (adapter local vs. objeto) con tenantId obligatorio en cada path/key desde el diseño, planeando migración de archivos existentes como parte del onboarding de cada cliente.

**SAAS-INFRA-03 — Backup/restore de BD completa, sin granularidad por tenant**
- **Ubicación**: `scripts/backup-db.js`, `scripts/restore-db.js` (`mongodump --uri ... --out ...`, `--nsFrom=<db>.* --nsTo=<db>.*`)
- **Prioridad**: Critica
- **Categoría**: SaaS - Infraestructura/Almacenamiento
- **Estado actual**: Backup es un `mongodump` de la BD completa; el propio comentario del script advierte "NUNCA restaures un backup ajeno a la clínica destino" — la garantía de aislamiento es puramente operativa/humana.
- **Qué cambia para SaaS**: Con BD compartida por N tenants, se necesita backup/restore granular por tenant, sin que restaurar el tenant A afecte a B, C, D.
- **Riesgo si no se aborda**: Una restauración de emergencia para un tenant podría hacer rollback de datos de TODOS los demás — incidente catastrófico y probablemente irreversible.
- **Complejidad de migración**: Alta
- **Recomendación**: Decidir primero el modelo de aislamiento físico (BD-por-tenant vs. colección compartida), porque de eso depende si el backup granular es viable con herramientas nativas de Mongo o requiere tooling propio.

**SAAS-INFRA-04 — Runner de migraciones asume una sola BD de destino**
- **Ubicación**: `scripts/migrate.js`, `Server/migrations/*.js`
- **Prioridad**: Alta
- **Categoría**: SaaS - Arquitectura/Servicios
- **Estado actual**: El runner conecta a una sola BD, lista pendientes contra la colección `migrations` de esa misma BD, y aplica backup-first sobre esa única conexión.
- **Qué cambia para SaaS**: Con N tenants, una migración debe poder aplicarse de forma segura a volúmenes distintos por tenant, con posibilidad de rollout gradual, y sin ambigüedad sobre qué tenant ya la recibió.
- **Riesgo si no se aborda**: En BD-por-tenant, el runner no tiene mecanismo para iterar sobre N conexiones; en BD compartida, una migración no-tenant-aware podría corromper datos de todos los tenants simultáneamente.
- **Complejidad de migración**: Media
- **Recomendación**: Extender el runner para iterar sobre un registro de tenants/conexiones, o incluir tenantId como parámetro obligatorio en migraciones de datos.

**SAAS-INFRA-05 — Rate limiter con `MemoryStore` en memoria de proceso, sin dimensión de tenant**
- **Ubicación**: `Server/middlewares/rateLimiter.js` (`globalLimiter`, `writeLimiter`, `readLimiter`, `strictAuthLimiter`, `accountCreationLimiter`, `oauthLimiter`); `ecosystem.config.cjs` (`instances: 1`)
- **Prioridad**: Media (recalibrado de Alta)
- **Categoría**: SaaS - Infraestructura/Arquitectura
- **Estado actual**: Ningún limiter configura `store` externo; usan `MemoryStore` por defecto. `keyByIpAndUser` combina IP+userId pero no tenant; PM2 fijado a `instances: 1`.
- **Qué cambia para SaaS**: Añadir dimensión de cuota por tenant, con store compartido (Redis) en cuanto haya más de una instancia del backend.
- **Riesgo si no se aborda**: "Vecino ruidoso" — una clínica con mucho tráfico puede saturar recursos compartidos y degradar el servicio de otras; y con múltiples instancias, cada una tendría contador independiente, debilitando el rate-limiting real proporcionalmente al número de instancias.
- **Complejidad de migración**: Baja
- **Recomendación**: Añadir limiter con `keyGenerator` basado en tenantId y cuotas agregadas por clínica; migrar de `MemoryStore` a store centralizado antes de escalar a múltiples instancias.
- **Nota de recalibración**: bajado de Alta a Media — es un problema de degradación de disponibilidad, no de fuga de PHI/confidencialidad; solo se manifiesta con volumen real de tráfico multi-tenant (fase de escala, no de piloto inicial), y la migración a Redis es un cambio de infraestructura conocido y de bajo riesgo que no toca lógica de negocio ni esquemas de datos.

**SAAS-INFRA-06 — Cache de estadísticas de periodontograma en memoria de proceso**
- **Ubicación**: `Server/utils/UniversalToothValidator.js:209-258` (`class StatisticsCache`, instancia singleton en módulo)
- **Prioridad**: Media
- **Categoría**: SaaS - Infraestructura/Arquitectura
- **Estado actual**: Cache `Map()` en memoria de proceso con TTL y tope propio; la clave se deriva de un hash de los datos del periodontograma, sin identificador de tenant (no hace falta hoy).
- **Qué cambia para SaaS**: En multi-instancia, cada proceso tendría su propia copia; no es riesgo de fuga (la clave depende de hash de contenido), sino de eficiencia/consistencia de cache-hit entre instancias.
- **Riesgo si no se aborda**: Degradación de rendimiento y comportamiento no determinista entre instancias; no bloqueante para un piloto SaaS.
- **Complejidad de migración**: Baja
- **Recomendación**: Si se migra a multi-instancia, evaluar mover a store compartido (Redis) o aceptar el costo de cache local por instancia.

**SAAS-INFRA-07 — Patrón operativo actual como aislamiento de facto por infraestructura**
- **Ubicación**: `Server/config/db.js` (única `MONGODB_URI` por proceso); `Server/.env.example`; `Server/utils/uploads.js`
- **Prioridad**: Alta
- **Categoría**: SaaS - Infraestructura/Almacenamiento
- **Estado actual**: Cada instalación on-premise corre su propio Mongo standalone, con un único `AUDIT_HMAC_SECRET`/`ENCRYPTION_KEY`/`JWT_SECRET` y su propia carpeta `/uploads` local.
- **Qué cambia para SaaS**: Bajo BD compartida, esos secretos seguirían siendo compartidos entre clínicas (aceptable si el aislamiento es a nivel de dato), pero `/uploads` necesitaría prefijo por tenant obligatoriamente.
- **Riesgo si no se aborda**: Con BD compartida y sin scoping de `/uploads`, un identificador predecible o bug de autorización podría servir archivos de otra clínica.
- **Complejidad de migración**: Media
- **Recomendación**: Evaluar seriamente "BD/instancia separada por tenant" como opción de menor disrupción, dado que el patrón actual (una instalación completa por cliente) ya es funcionalmente equivalente a "tenant aislado por infraestructura".
- **YA_MITIGADO_PARCIALMENTE**: el patrón operativo actual — un proceso/Mongo/`.env`/`/uploads` completo por cliente (ver Fase 7) — ya funciona como aislamiento de facto a nivel de infraestructura; "BD separada por tenant" no sería un cambio nuevo sino la continuación literal de cómo ya se opera hoy, lo que reduce el riesgo si esa es la ruta elegida.

#### Arquitectura y Capa de Servicios

**SAAS-ARQ-01 — Middleware de resolución de tenant inexistente en el pipeline de requests**
- **Ubicación**: `Server/routes/*.js`, `Server/controllers/*.js` — ausencia total de middleware o campo `tenantId`/`organizationId`/`clinicId` en el request pipeline
- **Prioridad**: Critica
- **Categoría**: SaaS - Autenticación/Autorización
- **Estado actual**: No existe ningún middleware que resuelva o adjunte un tenant al request. Grep exhaustivo `tenantId|organizationId|clinicId|orgId|sucursal|branchId|multi-?tenant` sobre todo `Server/`: cero coincidencias en cualquier archivo, incluyendo comentarios/TODOs.
- **Qué cambia para SaaS**: Se necesita un middleware de resolución de tenant (usuario autenticado, subdominio, o header) ejecutado temprano en el pipeline, con tenantId propagado a todos los modelos de negocio.
- **Riesgo si no se aborda**: Sin este middleware no hay ningún lugar natural donde enganchar el filtro automático de SAAS-DATA-06; la única defensa sería disciplina manual en ~320 puntos de acceso, ya identificada como insuficiente.
- **Complejidad de migración**: Alta
- **Recomendación**: Diseñar la resolución de tenant como pieza fundacional previa a cualquier otro cambio de esta lista — es la dependencia de la que dependen prácticamente todos los demás hallazgos Críticos.

**SAAS-ARQ-02 — God-objects que concentran validación/negocio/persistencia (multiplicador de riesgo de ejecución)**
- **Ubicación**: `Client/src/features/add-patient/add-patient.jsx` (1702 líneas), `periodontogram-design.jsx` (1213), `patient-detail.jsx` (1078), `ConsultasPage.jsx` (989); `Server/controllers/patientsController.js` (2579), `odontogramaController.js` (1226)
- **Prioridad**: Media
- **Categoría**: SaaS - Arquitectura/Servicios
- **Estado actual**: Archivos ya señalados en Fase 2 por tamaño/mezcla de responsabilidades, sin separación de capas.
- **Qué cambia para SaaS**: Introducir tenantId como dimensión transversal requiere tocar quirúrgicamente puntos dispersos dentro de archivos de 1000-2600 líneas con contexto de negocio, validación y persistencia entremezclados.
- **Riesgo si no se aborda**: No es riesgo de fuga en sí, sino multiplicador de riesgo de ejecución al implementar los cambios de aislamiento sobre esta base de código.
- **Complejidad de migración**: Alta
- **Recomendación**: Priorizar descomposición de estos archivos como trabajo previo o paralelo a la introducción de tenantId, empezando por los de mayor tamaño.

**SAAS-ARQ-03 — Acoplamiento de `require` entre Server y árbol fuente de Client**
- **Ubicación**: `Server/utils/UniversalToothValidator.js:24` (`require('../../Client/src/shared/stats/periodontal-stats-core.cjs')`); `Server/tests/periodontal-stats-core.test.js`
- **Prioridad**: Media
- **Categoría**: SaaS - Arquitectura/Servicios
- **Estado actual**: El servidor hace `require` directo al árbol fuente del frontend — en producción depende de que `Client/src/...` exista físicamente en el mismo filesystem.
- **Qué cambia para SaaS**: En una topología con backend escalable horizontalmente y frontend en CDN, este acoplamiento por path relativo se rompe.
- **Riesgo si no se aborda**: Imposibilidad de escalar el backend horizontalmente sin empaquetar también el código fuente del frontend en cada instancia.
- **Complejidad de migración**: Baja
- **Recomendación**: Extraer la lógica compartida a un paquete interno versionado, consumido por ambos proyectos.

**SAAS-ARQ-04 (positivo) — Sin plugins previos de Mongoose en conflicto**
- **Ubicación**: `Server/models/*.js` (los 17 modelos)
- **Prioridad**: Media
- **Categoría**: SaaS - Arquitectura/Servicios
- **Estado actual**: Ningún modelo usa `mongoose.plugin()` (0 resultados en todo el árbol, incluyendo node_modules del proyecto). No hay ningún mecanismo transversal previo (soft-delete global, auditoría automática a nivel de esquema) ocupando el punto de extensión necesario para tenant-scoping.
- **Qué cambia para SaaS**: Nada que desenredar de un plugin preexistente; un plugin de tenant-scoping partiría de cero sin conflictos.
- **Riesgo si no se aborda**: N/A (hallazgo positivo); el riesgo es de oportunidad perdida si no se aprovecha este punto de extensión limpio.
- **Complejidad de migración**: Baja
- **Recomendación**: Evaluar un plugin de Mongoose único y centralizado para tenant-scoping en vez de repetir la lógica en cada uno de los 17 modelos.

### Fundamentos que YA facilitan el camino a SaaS (hallazgos positivos)

- **Ningún dato de tenant colisionaría a nivel de ObjectId.** Los identificadores primarios de Mongo son únicos globalmente por construcción; el único índice único problemático sobre un `ObjectId` (`Periodontogram.patient`) es inherentemente tenant-safe (SAAS-DATA-08).
- **El patrón operativo actual (una instalación completa por cliente) ya funciona como aislamiento de facto a nivel de infraestructura.** Un Mongo, un `.env`, un `/uploads` por cliente es funcionalmente equivalente a "tenant aislado por infraestructura"; la opción "BD separada por tenant" seria la continuación literal de cómo ya se opera hoy (SAAS-INFRA-07).
- **El mecanismo de auditoría con `motivo` obligatorio + audit log en escrituras de `superadmin` ya está construido y funcionando**, y es directamente reusable como cimiento del futuro rol de "operador de plataforma" auditado (SAAS-AUTH-05).
- **`getEffectivePermissions` ya implementa el patrón de merge (base del rol + overrides + individual)** que se necesitaría para resolver permisos por membresía usuario-clínica, reduciendo la complejidad real de construir ese mecanismo desde cero (SAAS-AUTH-04).
- **Los campos de configuración operativa de `ClinicSettings`** (horarios, moneda, catálogo de servicios, categorías de caja, overrides de permisos) están en una forma simple y embebida que no requiere rediseño de tipos — basta con agregar `tenantId` al esquema (SAAS-CFG-05).
- **El endurecimiento ya aplicado al flujo OAuth de Google** (`authenticate` obligatorio, rate limiting, validación de `state`/`returnPath` contra whitelist) reduce el riesgo de fuga hoy, aunque no resuelve el diseño de fondo (SAAS-CFG-01).
- **No hay lógica de negocio dispersa acoplada a "una sola clínica" fuera de puntos de infraestructura/configuración concentrados e identificables** — controladores, rutas y modelos clínicos en sí no tienen la premisa mono-tenant entretejida en su lógica de dominio, lo cual es una base razonable para una migración ordenada en vez de una reescritura total.
- **No existen plugins de Mongoose previos en conflicto** — el terreno para introducir un mecanismo centralizado de tenant-scoping está limpio (SAAS-ARQ-04).

### Areas recalibradas en verificacion (transparencia)

No se encontraron áreas SOBREESTIMADAS en esta fase — es decir, ningún hallazgo Crítica/Alta del conjunto de reportes recibidos resultó estar más cerca de ser multi-tenant-ready de lo que se había reportado originalmente. Sí se recalibraron 3 hallazgos a una prioridad menor tras la verificación adversarial (categoría PRIORIDAD_AJUSTADA, no SOBREESTIMADO):

- **Modelo de usuario sin multi-membresía** (SAAS-AUTH-04): se mantiene en Alta pero se reclasifica de "hallazgo de aislamiento" a "decisión de producto pendiente" — no es una vulnerabilidad activa hoy, y existe un precedente de diseño reutilizable (`getEffectivePermissions`) que reduce la complejidad real de construirlo.
- **Secreto JWT único por proceso** (SAAS-AUTH-06): bajado de Alta a Media — el propio informe original ya lo subordinaba a la solución de SAAS-AUTH-01 (claim de tenant) y no representa un riesgo de aislamiento cross-tenant independiente dado el modelo actual de proceso+BD por cliente.
- **Rate limiter con `MemoryStore`** (SAAS-INFRA-05): bajado de Alta a Media — es un problema de degradación de disponibilidad ("vecino ruidoso"), no de fuga de PHI/confidencialidad; solo se manifiesta en fase de escala real con múltiples instancias, y su corrección (store centralizado tipo Redis) es un cambio de infraestructura conocido y de bajo riesgo que no toca esquemas ni lógica de negocio.

### Hoja de ruta sugerida para la migracion a SaaS (alto nivel, sin implementar)

1. **Decisión de arquitectura de aislamiento de datos (prerrequisito de todo lo demás).** Definir explícitamente si el modelo será "BD compartida + tenantId + filtrado por query/servicio" o "BD/instancia separada por tenant" (esta última es, dado el patrón operativo actual confirmado en Fase 7, la de menor fricción con la arquitectura existente). Esta decisión determina el diseño de cada punto siguiente — backups, migraciones, storage y el propio middleware de resolución de tenant dependen de ella.

2. **Middleware de resolución de tenant + claim de tenant en el JWT.** Es la pieza fundacional de la que dependen prácticamente todos los hallazgos Críticos (SAAS-ARQ-01, SAAS-AUTH-01). Sin esto no existe ningún lugar natural donde enganchar el resto de los cambios.

3. **Capa de servicios/repositorio que centralice el acceso a datos.** Introducir esta capa (o un plugin de Mongoose de tenant-scoping) ANTES de tocar los ~320 puntos de acceso directo dispersos en los 16 controllers (SAAS-DATA-06). El orden importa: filtrar por tenant en un solo lugar es sostenible; hacerlo disperso no lo es.

4. **Migración de esquemas: `tenantId` en los 17 modelos + recomposición de índices únicos globales.** Cubre `ClinicSettings` (SAAS-DATA-02), `paciente_id`/`documento.numero`/`email` (SAAS-DATA-01, 03, 04), `BoxSession.status:'OPEN'` (SAAS-DATA-05), y la partición de la cadena de `AuditLog` (SAAS-DATA-07) — este último con cuidado especial por su naturaleza regulatoria (NOM-024).

5. **Infraestructura operativa multi-tenant-safe: storage, backups y runner de migraciones.** Namespacing de `/uploads` por tenant (SAAS-INFRA-02, SAAS-CFG-02), rediseño de backup/restore granular por tenant (SAAS-INFRA-03), y extensión del runner de migraciones para operar de forma tenant-aware (SAAS-INFRA-04) — solo una vez que el runner haya demostrado estabilidad de punta a punta (ver Fase 5).

6. **Separación de roles de plataforma vs. clínica, decisiones de producto pendientes, e integraciones externas.** Separar `superadmin` en "operador de plataforma" vs. "dueño de clínica" (SAAS-AUTH-05, ya con cimiento de auditoría reusable), decidir el modelo de identidad de `Usuario.email` y de multi-membresía (SAAS-AUTH-02, SAAS-AUTH-04), y rediseñar la integración de Google Calendar por tenant (SAAS-CFG-01). Estos son de menor urgencia estructural que los bloques 1-5 porque no bloquean un piloto inicial con pocas clínicas, pero sí son necesarios antes de una operación comercial a escala.

---

**Archivos relevantes citados en esta síntesis** (todos bajo `/Users/arleyramirezzz/Downloads/DentiaCore`): `Server/models/patient.js`, `Server/models/users.js`, `Server/models/clinicSettings.js`, `Server/models/boxSession.js`, `Server/models/periodontogram.js`, `Server/models/odontogramaHistory.js`, `Server/models/periodontogramHistory.js`, `Server/models/auditLog.js`, `Server/middlewares/authenticate.js`, `Server/middlewares/authorize.js`, `Server/middlewares/uploadsAuth.js`, `Server/middlewares/rateLimiter.js`, `Server/controllers/authController.js`, `Server/controllers/usersController.js`, `Server/controllers/settingsController.js`, `Server/routes/googleRoutes.js`, `Server/utils/crypto.js`, `Server/utils/permissions.js`, `Server/utils/uploads.js`, `Server/utils/UniversalToothValidator.js`, `Server/config/db.js`, `scripts/backup-db.js`, `scripts/restore-db.js`, `scripts/migrate.js`, `install.sh`/`install.ps1`/`launcher.py`, `ecosystem.config.cjs`.


---

## Entregables Finales

> Esta sección consolida las 8 fases anteriores en los entregables solicitados originalmente. Los conteos de severidad se extrajeron programáticamente (grep/parsing) de los bloques de hallazgos ya escritos en este mismo documento, no de memoria — son verificables releyendo cada fase. No se repite el detalle completo de cada hallazgo (evidencia, causa raíz, cita de línea): eso ya vive en su fase correspondiente; aquí se cita solo lo necesario para priorizar y decidir.

### 1. Diagnóstico Ejecutivo

**Estado general del proyecto.** Dentia Core llega a esta auditoría con una base de código notablemente más sólida de lo que suele encontrarse en un producto de un solo desarrollador: múltiples rondas previas de endurecimiento (documentadas en la memoria de sesiones) ya habían corregido criptografía de integridad NOM-024, escalada de privilegios, PIN sin lockout, y 47 edge-cases de negocio. Esta auditoría, ejecutada de forma independiente con verificación adversarial en cada fase (no solo se reportó lo que un agente encontró, sino que otro intentó refutarlo leyendo el código real), confirma esa base: **ningún hallazgo de Arquitectura, Base de Datos o Seguridad sobrevivió en severidad Crítica**, y varios "Alta" iniciales se recalibraron a la baja con evidencia concreta de que el mecanismo de impacto ya estaba mitigado.

El patrón más importante de **toda** la auditoría, repetido de forma consistente en las 8 fases, es este: **el equipo ya sabe resolver X en un lugar del sistema, pero no lo generalizó** — `sanitizeAppointmentForBasicRead` existe y funciona para pacientes pero no para citas; `Modal.confirm` de AntD se usa en caja pero `window.confirm` nativo sobrevive en 11 puntos; `express-validator` cubre cash/patientCharge pero no audit/appointments; `validateMimeByMagicBytes` protege adjuntos pero no la firma digital; los instaladores generan `JWT_SECRET` pero nunca `AUDIT_HMAC_SECRET`. Esto es una noticia relativamente buena: no son bugs de diseño profundo, son inconsistencias de aplicación de patrones ya correctos y ya presentes en el propio repo — la corrección típica es replicar algo que ya funciona, no inventar una solución nueva.

La excepción real a ese patrón optimista es la **Fase 7 (Producción)**: el sistema fue construido con un modelo mental de "aplicación de escritorio que el dueño abre" y se le pide operar como "servidor de clínica siempre disponible" — esa contradicción es estructural, no un descuido puntual, y concentra 2 de los 3 únicos hallazgos Críticos de toda la auditoría (además de 12 de los 35 Altos). **El riesgo dominante del proyecto hoy no es que el código tenga un bug grave escondido — es que el proceso de instalación, arranque y operación no está listo para que una clínica sin equipo de DevOps dependa de él sin intervención técnica constante.**

**Calificación por categoría (0–100):**

| Categoría | Calificación | Justificación |
|---|---|---|
| **Base de datos** | **80/100** | La de mejor desempeño: 0 hallazgos sobrevivieron en Crítica o Alta tras verificación (16 Media + 2 Baja de 18 totales). Modelo de datos maduro en integridad clínica (hash-chain NOM-024, inmutabilidad append-only, soft-delete, índices parciales bien pensados). Lo que resta es deuda de escalabilidad a años vista (arrays embebidos sin cota, `runCascade` incompleto) y decisiones de negocio pendientes (dinero como float, standalone sin réplica), no defectos activos. |
| **Seguridad** | **74/100** | 0 Crítica, solo 2 Alta confirmados (revocación de sesión incompleta en `resetPassword`; fuga de PHI de citas al rol recepcionista) de 8 hallazgos totales en la fase. Se confirmó explícitamente que XSS, CSRF clásico y path traversal en uploads **no son explotables** — verificación real, no ausencia de búsqueda. La base de auth (bcrypt cost 12, fail-fast de secretos, lockouts, rotación de refresh token) es sólida. |
| **Backend** | **70/100** | 1 Crítica (auditoría NOM-024 silenciada con `.catch(()=>{})`) + 5 Alta (permiso `exams.delete` roto; NoSQL injection en logs de auditoría; rollback de caja silencioso; fuga de `error.message` crudo; firma digital sin validar magic bytes) de 10 hallazgos. El único Crítico de código (no de proceso) de toda la auditoría vive aquí, pero es de complejidad Baja de corregir. |
| **Rendimiento** | **69/100** | Sin hallazgo Crítico ni Alto sobreviviente en ninguna de las tres fases donde se evaluó (índices DB, re-renders frontend, transacciones/consultas backend) tras calibrar por el volumen real de un cliente único. Riesgo genuino pero diferido: varios de estos "problemas" se activarían recién a escala de miles de registros, no hoy. |
| **Arquitectura** | **66/100** | 10 Alta + 15 Media + 6 Baja de 31 hallazgos (0 Crítica tras ajuste — los 3 originales bajaron con evidencia de que el patrón es convención uniforme del proyecto, no un defecto aislado). Confirma deuda estructural real (ausencia de capa de servicios, god-objects, duplicación) pero también una fortaleza poco común: **0 dependencias circulares de imports** en todo el repo, verificado exhaustivamente. |
| **Calidad de código** | **62/100** | Evaluada junto con Arquitectura pero con foco en duplicación/código muerto: 3 duplicaciones Alta confirmadas (`UniversalToothValidator` divergente Client/Server, `isStandaloneTxError` en 4 controllers, `findConflict`/`findPatientConflict` con **bug de negocio real ya materializado**), más 9 de "tests fantasma" (archivos que el equipo cree que corren en CI y no corren). Ninguna es difícil de arreglar; el riesgo es que nadie las note sin auditoría. |
| **Frontend** | **63/100** | 6 Alta + 10 Media + 2 Baja de 18. La primera auditoría de accesibilidad jamás hecha en el proyecto encontró que el odontograma/periodontograma — la pieza clínica más usada — es **100% inoperable por teclado**, y que la tarjeta de paciente en el listado principal tampoco lo es. Funcionalmente el frontend es sólido (un bug real confirmado: `ReferenceError` en `PatientPrintPage.jsx`), pero la accesibilidad estaba en cero antes de esta auditoría. |
| **Preparación para producción** | **46/100** | La categoría más débil, por un margen amplio: 2 Crítica + 12 Alta + 18 Media + 3 Baja de 35. Los instaladores no generan `AUDIT_HMAC_SECRET` (no arranca en producción, o corre con integridad de auditoría desactivada), ninguna actualización corre migraciones automáticamente, no hay arranque persistente al boot en ningún SO, no hay supervisor real de proceso, y no hay ningún canal de alerta proactiva (un backup roto o un disco lleno son invisibles hasta que el cliente se queja). |

**Calificación global ponderada: 66/100 — "código listo, operación no."** Esta cifra no debe leerse como "el proyecto está a medio camino": el trabajo de código (arquitectura, backend, frontend, base de datos, seguridad) está, en conjunto, en un estado defendible para un producto de un solo desarrollador, con una lista corta y barata de arreglos concretos. Lo que separa a Dentia Core de un lanzamiento profesional no es una reescritura — es cerrar ~10 huecos operativos específicos (la mayoría de complejidad Baja o Media) antes de entregarlo a un cliente que no tiene a nadie técnico de guardia.

### 2. Inventario Completo de Hallazgos

**Conteo por severidad y fase** (extraído directamente de los bloques de hallazgos de este documento; Fase 1 fue mapeo sin juicio de severidad y Fase 8 es un inventario de SaaS, no defectos, por lo que se muestran aparte):

| Fase | Crítica | Alta | Media | Baja | Total |
|---|---|---|---|---|---|
| Fase 2 — Arquitectura | 0 | 10 | 15 | 6 | 31 |
| Fase 3 — Backend | 1 | 5 | 4 | 0 | 10 |
| Fase 4 — Frontend | 0 | 6 | 10 | 2 | 18 |
| Fase 5 — Base de Datos | 0 | 0 | 16 | 2 | 18 |
| Fase 6 — Seguridad | 0 | 2 | 6 | 0 | 8 |
| Fase 7 — Producción | 2 | 12 | 18 | 3 | 35 |
| **Total (Fases 2–7)** | **3** | **35** | **69** | **13** | **120** |
| Fase 8 — SaaS Readiness *(inventario, no defectos)* | 12 | 8 | 11 | 1 | 32 |

*(La tabla anterior a esta sección, en el resumen del cuerpo de cada fase, puede mostrar un total ligeramente distinto por fase porque agrupa además notas de contexto sin severidad propia — esta tabla cuenta únicamente bloques de hallazgo con los 8 campos completos.)*

Además de estos, cada fase documenta un número adicional de hallazgos Media/Baja reportados por los agentes especializados pero no sometidos a verificación adversarial individual (por alcance/costo del proceso) — están listados con severidad declarada en la sección "reportados sin verificación completa" de cada fase (aprox. 15-20 adicionales por fase en Fases 3, 5 y 6). No se duplican aquí; son consultables en su fase de origen.

**Los 3 hallazgos Críticos (los únicos de código, no de arquitectura ni de proceso — más los 2 de producción):**

1. **BE-01 (Fase 3)** — Registro de auditoría NOM-024 silenciado con `.catch(() => {})` en ~12 puntos (login, firma electrónica, cambio de PIN). Complejidad: **Baja**.
2. **CFG-01 (Fase 7)** — Instaladores no generan `AUDIT_HMAC_SECRET`: el servidor no arranca en producción, o arranca con la integridad del audit log desactivada. Complejidad: **Baja**.
3. **DOC-01 (Fase 7)** — Ningún camino de instalación/actualización ejecuta `npm run migrate`: el código nuevo corre sobre esquema viejo tras cada actualización al cliente. Complejidad: **Media**.

**Los 35 hallazgos Alta** (lista completa, agrupados por fase — detalle completo en cada sección):

- **Fase 2 (10):** god-components sin extracción de hooks (patient-detail.jsx/periodontogram-section.jsx); god-component periodontogram-design.jsx; addEvolutionNote con 15 helpers no testeables; contrato de string no tipado sobre notas_evolucion; ausencia de capa de servicio/repositorio; syncCharge duplica invariante de PatientCharge; UniversalToothValidator/StatisticsCache duplicados con API divergente; isStandaloneTxError duplicada en 4 controllers; findConflict/findPatientConflict duplicados (bug de negocio real); duplicación de fetching PatientPrintPage.jsx (con `ReferenceError` ya materializado).
- **Fase 3 (5):** NoSQL injection vía operadores `$` en `auditController.getLogs`; permiso `exams.delete` inexistente en el catálogo de roles; rollback compensatorio de caja falla en silencio (solo `console.error`); fuga de `error.message` crudo de Mongoose sin gate por `NODE_ENV`; firma digital (NOM-004) sin validar magic bytes.
- **Fase 4 (6):** fallos silenciosos de sincronización en el calendario; odontograma/periodontograma inoperables por teclado; ningún modal con focus trap/Escape; tarjeta de paciente inoperable por teclado; sin ruta catch-all/404; expiración de sesión con hard-redirect silencioso.
- **Fase 6 (2):** revocación de sesión incompleta en `resetPassword`; fuga de PHI de citas al rol recepcionista.
- **Fase 7 (12):** app no arranca al boot en ningún SO; sin supervisor real de proceso; precedencia de `.env` invertida; sin alertas proactivas; `/api/health` no monitoreado y siempre 200; backup sin observabilidad de éxito; `uncaughtException` deja el proceso zombie; graceful shutdown incompleto; README raíz obsoleto; runbook con nombre de servicio PM2 equivocado; cortes de caja atados a la TZ del SO; PHI sobre HTTP plano en LAN (esta última es decisión del dueño, no bug).

Los 69 Media y 13 Baja no se repiten aquí por espacio — cada uno con evidencia, causa raíz e impacto completos en su fase.

### 3. Plan de Acción Priorizado

**INMEDIATAMENTE (esta semana — los 3 Críticos, todos de Complejidad Baja/Media):**
1. Reemplazar `.catch(()=>{})` por `.catch(err => logger.error(...))` en los ~12 puntos de auditoría NOM-024 (Fase 3, BE-01).
2. Añadir generación de `AUDIT_HMAC_SECRET` en `install.sh`/`install.ps1`/`launcher.py` con la misma lógica ya usada para `JWT_SECRET` (Fase 7, CFG-01).
3. Crear un `update.sh`/`update.ps1` que haga backup → `migrate:dry` → `migrate` → build → arranque, y documentarlo como el único camino soportado de actualización (Fase 7, DOC-01).

**ANTES DE PRUEBAS FORMALES (arreglos baratos que además destapan/evitan falsos negativos en QA):**
- Agregar `Server/jest.config.js` explícito para que los "tests fantasma" corran de verdad en CI (Fase 2).
- Corregir el permiso `exams.delete` en el catálogo de roles (Fase 3, BE-02).
- Unificar `findConflict`/`findPatientConflict` en citas — es el único bug de duplicación con riesgo de negocio ya concreto (Fase 2, ARQ-DUP-07).
- Arreglar el `ReferenceError` de `PatientPrintPage.jsx` (Fase 2, ARQ-03 Frontend Dup).
- Agregar ruta catch-all/404 y hacer `PatientCard` operable por teclado — ambas triviales, ambas eliminan "callejones sin salida" de UX (Fase 4).
- Corregir la revocación de sesión incompleta en `resetPassword`/`changeMyPassword`/`updateUser` (Fase 6, SEC-01).
- Aplicar `sanitizeAppointmentForBasicRead` a los 3 endpoints de lectura de citas (Fase 6, SEC-02).

**ANTES DE PRODUCCIÓN (bloqueantes reales para entregar a un cliente sin soporte técnico de guardia):**
- Declarar `pm2` como dependencia real y forzar que el arranque **siempre** pase por él; registrar `pm2 startup`+`pm2 save` (o servicio de SO equivalente) en el instalador (Fase 7, CFG-02/CFG-03).
- Acotar `uncaughtException` para salir con código ≠0 bajo supervisor, y completar `gracefulShutdown` cerrando Mongo con timeout de respaldo (Fase 7, BKP-02/BKP-03).
- Canal mínimo de alerta (email/webhook) para: backup fallido (marcador `last-success.json`), `/api/health` con `db.status!=connected` (enriquecido a HTTP 503), y disco bajo (Fase 7, OBS-01/OBS-02/BKP-01).
- Fijar `TZ=America/Mexico_City` en el entorno de arranque (Fase 7, RT-01).
- Montar `express-mongo-sanitize` global + coercer los parámetros `?version` a String (cierra 3 vectores de inyección de una vez: Fase 3 + Fase 6) y actualizar mongoose a ≥7.8.9 (Fase 6, SEC-06).
- Validar magic bytes en firma digital/logo, reutilizando el patrón ya usado en adjuntos (Fase 3, BE-03).
- Clasificar `/uploads/firmas` como recurso clínico con `requireSignerRole`, no solo sesión válida (Fase 6, SEC-03).
- Reemplazar el `console.error` del rollback compensatorio de caja por `logger.error` con contexto (movementId/sessionId/usuario) — un movimiento huérfano contamina el corte de caja sin alertar a nadie (Fase 3, BE-02 Manejo de Errores).
- Centralizar las respuestas de error en un helper que aplique el mismo gate por `NODE_ENV` que ya usa el handler global, para dejar de filtrar `error.message` crudo de Mongoose en producción (Fase 3, BE-05).
- Corregir el README raíz y el nombre de servicio PM2 en `Server/README.md` (Fase 7, DOC-02/DOC-03) — un runbook incorrecto durante un incidente real empeora el incidente.

**DESPUÉS DEL LANZAMIENTO (deuda técnica planificada, no urgente hoy):**
- Extraer `Server/services/` de forma incremental, empezando por `runCascade` y la lógica de firma de `addEvolutionNote` (Fase 2) — **decisión del dueño** sobre si invertir ahora o diferir mientras el producto siga siendo de un solo cliente.
- Accesibilidad completa del odontograma/periodontograma (Complejidad Alta) — priorizar si hay planes de venta a clínicas con obligaciones de accesibilidad, o si ya hay personal que depende de teclado/lector de pantalla (Fase 4).
- Migrar dinero de float a Decimal128/centavos, habilitar autenticación de MongoDB, decidir cifrado at-rest de PHI (Fase 5/6) — **decisiones del dueño**, todas de alto esfuerzo y bajo riesgo inmediato al día de hoy.
- Toda la Fase 8 (SaaS Readiness) — explícitamente fuera de alcance de "producción V1", es insumo para una decisión de negocio futura.

### 4. Roadmap hacia Producción

**Fase A — Higiene crítica (1–3 días).** Los 3 hallazgos Críticos + los de "antes de pruebas" que son de Complejidad Baja. Objetivo: que el sistema arranque de forma confiable en producción y que ningún dato clínico se pierda silenciosamente.

**Fase B — Cierre de seguridad puntual (3–5 días).** Revocación de sesión, fuga de PHI a recepción, sanitización NoSQL global, magic bytes en firma/logo, control de acceso a `/uploads/firmas`. Todo de Complejidad Baja-Media y ya con evidencia y recomendación exacta en Fase 3 y Fase 6.

**Fase C — Confiabilidad operativa (1–2 semanas).** El bloque más grande: supervisor de proceso persistente al boot, alertas proactivas, graceful shutdown/uncaughtException correctos, TZ fijada, runbooks corregidos. Esta fase convierte "app de escritorio" en "servicio que una clínica sin DevOps puede confiar en que sigue corriendo".

**Fase D — QA dirigido y accesibilidad mínima viable (según prioridad de negocio).** Verificación manual de los flujos tocados en Fases A-C; al menos hacer operable por teclado la tarjeta de paciente y la ruta catch-all (ya en "antes de pruebas"); evaluar si el odontograma/periodontograma requiere accesibilidad completa antes de este release o puede planificarse para el siguiente.

**Fase E — Deuda técnica planificada (post-lanzamiento, sin fecha fija).** Capa de servicios, deduplicación de código, decisiones de dinero/cifrado/MongoDB-auth. Se aborda con el producto ya operando, priorizando por impacto real observado en producción.

### 5. Release Checklist

**Seguridad y cumplimiento:**
- [ ] `AUDIT_HMAC_SECRET` generado y presente en el `.env` de producción (no en fallback de desarrollo)
- [ ] Registro de auditoría NOM-024 ya no usa `.catch(()=>{})` silencioso en ningún punto
- [ ] `resetPassword`/`changeMyPassword`/`updateUser` limpian `previousRefreshTokenHash`
- [ ] Endpoints de citas aplican `sanitizeAppointmentForBasicRead` para roles no clínicos
- [ ] `/uploads/firmas` exige `requireSignerRole`, no solo sesión válida
- [ ] Firma digital y logo validan magic bytes, no solo MIME declarado
- [ ] `express-mongo-sanitize` montado globalmente; parámetros `?version` coercidos a String
- [ ] `mongoose` actualizado a ≥7.8.9; dependencias con CVE High revisadas (`npm audit`)
- [ ] Permiso `exams.delete` corregido en el catálogo de roles

**Configuración y despliegue:**
- [ ] Instalador genera `AUDIT_HMAC_SECRET`, `JWT_SECRET` y todos los secretos críticos, sin fallback a valores de desarrollo
- [ ] `TZ=America/Mexico_City` fijada explícitamente en el entorno de arranque
- [ ] Precedencia de `.env` raíz vs `Server/.env` resuelta o documentada sin ambigüedad
- [ ] `pm2` es dependencia declarada; el arranque de producción siempre pasa por él (sin fallback a nodemon)
- [ ] `pm2 startup` + `pm2 save` (o equivalente de servicio del SO) configurado para persistir al boot
- [ ] `mongod.cfg` generado por el instalador, no versionado con rutas absolutas de una máquina concreta

**Migraciones y datos:**
- [ ] Proceso de actualización documentado y probado: backup → `migrate:dry` → `migrate` → build → reinicio
- [ ] Migraciones 0001–0004 corridas y verificadas contra la BD real del cliente (no solo local)
- [ ] Anexo A (preferences legacy fuera de enum) resuelto contra la BD real del cliente

**Observabilidad y continuidad:**
- [ ] `uncaughtException` sale con código ≠0 bajo supervisor en vez de dejar el proceso vivo indefinidamente
- [ ] `gracefulShutdown` cierra la conexión a Mongo con timeout de respaldo
- [ ] `/api/health` refleja el estado real de Mongo (503 si desconectado) y algo lo consulta periódicamente
- [ ] Canal de alerta mínimo configurado (backup fallido, disco bajo, Mongo caído)
- [ ] Backup programado automáticamente por el instalador (no como paso manual olvidable)
- [ ] Al menos una restauración de prueba ejecutada y verificada (conteos + `verifyChain`)

**Documentación:**
- [ ] README raíz reescrito para reflejar el proyecto real (instaladores, secretos, migrate)
- [ ] `Server/README.md` con el nombre de servicio PM2 correcto (`dentiacore-api`)
- [ ] `docs/README.md` como índice de todos los runbooks operativos

**Accesibilidad (evaluar según destino comercial del release):**
- [ ] Tarjeta de paciente operable por teclado (`role="button"` + `tabIndex` + `onKeyDown`)
- [ ] Ruta catch-all/404 con mensaje amigable
- [ ] Decisión explícita del dueño sobre accesibilidad del odontograma/periodontograma para este release

### 6. Riesgos Técnicos (si se desplegara HOY sin cambios adicionales)

Ordenados por impacto:

1. **Pérdida silenciosa de respaldo.** Ningún mecanismo detecta un backup que dejó de correr; el cliente lo descubre el día del desastre, cuando ya es demasiado tarde. Es el riesgo de mayor impacto (pérdida irreversible de historia clínica legal) combinado con la mayor probabilidad (nadie revisa `backups/` sin que algo se lo recuerde).
2. **El servidor no arranca en producción, o arranca con integridad de auditoría desactivada.** Consecuencia directa de `AUDIT_HMAC_SECRET` no generado por los instaladores — bloqueante total o incumplimiento silencioso de NOM-024 desde el primer día.
3. **Indisponibilidad total tras cualquier reinicio.** Sin arranque persistente al boot ni supervisor real de proceso, un corte de luz o una actualización de Windows deja a la clínica sin sistema hasta que alguien abra el launcher a mano — en horario de atención, esto es pérdida directa de operación.
4. **Actualizar el sistema puede corromper la integridad de auditoría sin que nadie lo note.** Sin migraciones automáticas, el código nuevo corre sobre esquema viejo; `verify` puede marcar registros legítimamente firmados como "alterados", generando falsas alarmas de manipulación — o peor, ocultando una real.
5. **Fuga de PHI clínico a personal no clínico.** Recepción puede leer motivo de consulta y observaciones de cualquier cita; la firma digital del doctor es descargable por cualquier sesión autenticada — ambos incumplen NOM-004/LFPDPPP independientemente de si hay exposición a internet.
6. **El odontograma/periodontograma es inoperable para cualquier usuario que dependa de teclado.** Baja probabilidad hoy (sin usuarios con discapacidad identificados), pero severo si cambia el contexto comercial o regulatorio.
7. **Descuadres de caja y auditoría si el servidor no corre en la TZ de la clínica.** Silencioso, difícil de diagnosticar, con implicación contable y legal.
8. **Proceso "zombie" tras un error no controlado.** El servidor puede seguir sirviendo respuestas sobre estado inconsistente sin que nadie lo sepa, en vez de reiniciarse limpio.
9. **Inyección NoSQL en 3 endpoints** (auditoría, odontograma, periodontograma) — impacto acotado porque requiere una cuenta ya autenticada con permiso sobre ese recurso, pero real y de arreglo trivial.
10. **Runbooks incorrectos agravan cualquier incidente real.** El nombre de servicio PM2 equivocado en `Server/README.md` puede llevar a un operador a creer que detuvo el servicio (arriesgando corrupción en un restore) cuando sigue corriendo.

---

**Preparación para SaaS:** cubierta en su totalidad en la Fase 8 — SaaS Readiness de este mismo documento (21 áreas identificadas, hoja de ruta de 6 bloques). No se repite aquí porque es, por diseño, un inventario de planificación futura y no una lista de acción para el release actual.
