# Reporte de Auditoría — DentiaCore

**Fecha:** 31 de mayo de 2026
**Alcance:** Repositorio completo (`Client/` Vite+React, `Server/` Express+MongoDB, tooling raíz e instaladores).
**Objetivo:** Identificar bugs y riesgos que deben resolverse antes de pasar a producción. Esta es una **auditoría de solo lectura**: no se modificó código.
**Naturaleza de la app:** Gestión clínica dental con datos de salud de pacientes (PHI). El nivel de exigencia de seguridad y privacidad es alto (LFPDPPP / NOM-024).

> **Nota de método:** la app se distribuye e instala por clínica (launcher.py, install.sh/ps1, pm2). Los hallazgos se verificaron leyendo el código real con referencia `archivo:línea`. Todos los CRÍTICOS y varios ALTOS fueron re-verificados manualmente. Se ignoraron `node_modules/`, `Client/dist/` y la copia duplicada en `.claude/worktrees/`.

---

## 1. Veredicto

**No está listo para producción todavía.** La base es sólida (buen manejo de JWT, bcrypt, defensa contra NoSQL injection, helmet, rate limiting en login, suite de pruebas), pero hay **3 bloqueadores críticos** y un conjunto de problemas altos que afectan seguridad de datos clínicos, estabilidad del proceso y operación.

| Severidad | Cantidad | ¿Bloquea producción? |
|-----------|----------|----------------------|
| 🔴 Crítico | 3 | Sí — resolver antes de desplegar |
| 🟠 Alto | 12 | Sí — resolver antes o inmediatamente después |
| 🟡 Medio | 16 | Planificar en el primer ciclo post-lanzamiento |
| ⚪ Bajo | 12 | Higiene / deuda técnica |

**Top 3 a resolver primero:**
1. Archivos de pacientes (PHI) servibles **sin autenticación** en `/uploads`.
2. **Escalada de privilegios**: cualquier usuario con `settings.update`/`users.update` puede otorgarse permisos `*` (superadmin).
3. **Crash del proceso** por `fsExtra is not defined` dentro del manejador de errores de subidas.

---

## 2. Hallazgos Críticos 🔴

### C-1 · Archivos de pacientes (PHI) servidos sin autenticación
- **Archivo:** `Server/scripts/dent.js:116`
- **Evidencia:** `app.use('/uploads', express.static(uploadsBase));` — montado globalmente, sin `authenticate` ni autorización por paciente delante.
- **Impacto:** Cualquiera con acceso de red puede descargar adjuntos, odontogramas, periodontogramas y fotos de pacientes (p. ej. `/uploads/pacientes/<ObjectId>/adjuntos/<archivo>`). La carpeta es el `ObjectId` del paciente y varios nombres son predecibles (`..._${Date.now()}`). Es divulgación de datos de salud sin sesión — la categoría más grave para una app clínica.
- **Corrección:** Servir los archivos a través de un controlador que valide `authenticate` + acceso al `patientId`, o anteponer middleware de autorización a `/uploads`.

### C-2 · Escalada de privilegios vía endpoints de permisos
- **Archivos:** `Server/controllers/settingsController.js` (`updateUserPermissions`, `updateRolePermissions`); rutas `Server/routes/settingsRoutes.js:83` y `:86`. Vector adicional en `Server/controllers/usersController.js:146` (crear) y `:222` (actualizar).
- **Evidencia:** Las rutas están protegidas solo por `authorize(['settings.update'])` y el controlador **no llama a `checkPrivilegeEscalation`** (verificado: no existe esa referencia en `settingsController.js`). Se hace `$set: { permissions }` con un arreglo arbitrario del cliente. En `usersController`, `checkPrivilegeEscalation` solo valida el campo `rol`, nunca `permissions`.
- **Impacto:** Como `hasPermission` concede todo cuando el arreglo `includes('*')` (`Server/utils/permissions.js`), un usuario no-admin (rol `doctor` tiene `settings.update`) puede hacer `PATCH /settings/user-permissions/<propioId>` con `{ "permissions": ["*"] }` y volverse superadmin de toda la clínica. Rompe por completo la jerarquía de roles.
- **Corrección:** Validar `role` contra `VALID_ROLES` y cada permiso contra una lista blanca; ejecutar `checkPrivilegeEscalation` sobre `permissions` (el actor no puede otorgar permisos por encima de los propios ni auto-escalar).

### C-3 · `fsExtra is not defined` crashea el worker en errores de subida
- **Archivo:** `Server/controllers/odontogramaController.js:888` (función `manejarError`, registrada como error handler en `odontogramaRoutes.js:110` y `patientRoutes.js:509`).
- **Evidencia:** `fsExtra.remove(req.file.path).catch(...)` — `fsExtra` **nunca se importa** en el archivo (verificado: el único uso es la línea 888, no hay `require('fs-extra')`).
- **Impacto:** Cuando un error llega al manejador con `req.file.path` presente, se lanza `ReferenceError: fsExtra is not defined` **dentro** del middleware de error. Express no puede capturarlo: aborta la respuesta y puede tumbar el worker. Afecta cualquier flujo de subida de odontograma/paciente que falle.
- **Corrección:** Agregar `const fsExtra = require('fs-extra');` (ya es dependencia) o usar el `fs` ya importado.

---

## 3. Hallazgos Altos 🟠

### A-1 · ErrorBoundary no funcional → pantalla en blanco ante cualquier error de render
- **Archivo:** `Client/src/shared/components/error-boundary.jsx`
- **Evidencia:** Es un **componente de función** con `const [state, setState] = useState(...)`; `setState` nunca se invoca y no hay `getDerivedStateFromError`/`componentDidCatch`. Los error boundaries deben ser componentes de clase.
- **Impacto:** Cualquier error de render dentro del `<Outlet>` no se captura: la app entera queda en blanco en lugar de mostrar el fallback.
- **Corrección:** Convertir a clase con `static getDerivedStateFromError()` y `componentDidCatch()`.

### A-2 · Token JWT de la app guardado en localStorage (expuesto a XSS)
- **Archivo:** `Client/src/shared/services/auth-token.js:5,14`; se adjunta en `axios-instance.js:87-89`.
- **Evidencia:** `localStorage.setItem(ACCESS_TOKEN_KEY, token)`.
- **Impacto:** En una app médica, un token en localStorage es legible por cualquier script inyectado (XSS). El backend ya emite cookie httpOnly (`withCredentials: true`), así que la copia en localStorage es el eslabón débil.
- **Corrección:** Apoyarse en la cookie de sesión/refresh httpOnly del backend y mantener el access token solo en memoria.

### A-3 · Refresh token de Google OAuth en localStorage y aceptado desde la URL
- **Archivo:** `Client/src/features/main-page/components/calendar.jsx:22,305,363`
- **Evidencia:** `urlParams.get('refreshToken')` → `storeTokenWithExpiration(...)` que hace `localStorage.setItem('accessToken', JSON.stringify({ token, expiration, refreshToken }))`.
- **Impacto:** El refresh token de larga vida viaja en la URL (queda en historial/Referer/logs) y se persiste en localStorage; cualquier XSS obtiene acceso duradero al Google Calendar del usuario.
- **Corrección:** Eliminar el flujo legacy `?accessToken/?refreshToken` por URL (dejar solo el de cookie httpOnly `google_auth=success`) y no almacenar el refresh token en el cliente.

### A-4 · Router de Google fuera de la autenticación de la app; `/auth/token` refleja tokens httpOnly
- **Archivos:** `Server/scripts/dent.js:270` / `Server/config/routes.js:30` (montado antes de `authenticate`); `Server/routes/googleRoutes.js:52,223,260,290`.
- **Evidencia:** `router.get('/auth/token', ...)` devuelve `accessToken`/`refreshToken` desde cookies a cualquier llamante (anula el httpOnly); `/refresh-token` y `/calendar/*` no exigen sesión de la app; solo `/auth/url` y `/oauth2callback` tienen rate limit.
- **Impacto:** Datos y tokens de Google alcanzables sin sesión de DentiaCore; endpoints abusables sin throttling.
- **Corrección:** Montar el router de Google detrás de `authenticate`, eliminar `/auth/token` (usar la cookie del lado servidor) y aplicar rate limiting a todos los endpoints.

### A-5 · Secretos reales en disco y backup de la clave de firma
- **Archivos:** `Server/.env` (contiene `GOCSPX-…` real y `JWT_SECRET` real — verificado), backup `Server/.env.bak-jwt`.
- **Aclaración importante:** **No hay fuga en git.** `Server/.env.example` (rastreado) trae placeholders **vacíos** (verificado: longitudes 0, sin `GOCSPX-`); `Server/.env` y `.env.bak-jwt` están en `.gitignore` y nunca estuvieron en el historial.
- **Impacto:** Aun así, en un modelo de distribución por clínica, shippear un `.env` poblado y un backup de la clave de firma (`.env.bak-jwt`) junto al código es riesgoso: el **mismo secreto de Google** llegaría a cada instalación y un backup de `JWT_SECRET` permite forjar tokens de cualquier rol si se filtra.
- **Corrección:** Rotar el secreto de Google y el `JWT_SECRET` (tratarlos como comprometidos por el manejo laxo); borrar `Server/.env.bak-jwt`; generar `JWT_SECRET` por instalación (el `install.sh` ya lo hace) y mantener el secreto de Google solo en backend, no en el artefacto distribuido.

### A-6 · Sobrepago por condición de carrera en `addPayment`
- **Archivo:** `Server/controllers/patientChargeController.js:204-208,272-279`
- **Evidencia:** Se valida `amount > charge.saldoPendiente` y luego `charge.pagos.push(...)` + `await charge.save()` (no atómico).
- **Impacto:** Dos pagos concurrentes leen el mismo `saldoPendiente`, ambos pasan la validación y ambos se registran. El hook recalcula `saldoPendiente = max(0, total - pagado)`, enmascarando el sobrepago a $0, y la caja recibe dos ingresos reales que exceden el cargo. Los libros sobre-cobran.
- **Corrección:** Aplicar el pago con update atómico condicional (`findOneAndUpdate` filtrando por el `totalPagado`/`saldoPendiente` esperado) y compensar el `CashMovement` si pierde la carrera.

### A-7 · `cancelCharge` crea movimientos de reverso sin re-validar caja abierta
- **Archivo:** `Server/controllers/patientChargeController.js:362-393`
- **Evidencia:** Obtiene `BoxSession.findOne({ status: 'OPEN' })` y en el bucle hace `CashMovement.create({ ..., boxSessionId: activeSession._id })` sin volver a verificar que la sesión siga abierta (a diferencia de `addMovement`/`addPayment`, que revierten si se cerró).
- **Impacto:** Si la caja se cierra a mitad de la cancelación, los egresos de reverso quedan atados a una sesión CERRADA/CLOSING y se excluyen del corte: el arqueo no refleja la reversión y se corrompe el balance diario.
- **Corrección:** Re-verificar `status: 'OPEN'` tras cada `create` (o ejecutar cancelación + reverso bajo el mismo guard) y compensar si se cerró.

### A-8 · `addEvolutionNote`: el contador se incrementa sin filtro de paciente eliminado
- **Archivo:** `Server/controllers/patientsController.js:1110-1111` vs `1275-1282`
- **Evidencia:** El `findOneAndUpdate({ _id: id }, [...$inc...])` no filtra `deletedAt: null`, pero el `$push` posterior sí (`{ _id: id, deletedAt: null }`).
- **Impacto:** Para un paciente con soft-delete, el contador se incrementa pero la nota nunca se inserta; la petición responde 500 tras mutar estado y el contador monotónico avanza de forma permanente. Además, ambas operaciones no son atómicas entre sí.
- **Corrección:** Agregar `deletedAt: null` al filtro del `findOneAndUpdate` del contador.

### A-9 · `getMonthlyBalance` excluye sesiones >48h y subreporta dinero real
- **Archivo:** `Server/controllers/cashController.js:66-74`
- **Evidencia:** Si la sesión no está CERRADA, descarta el movimiento cuando `Date.now() - opened >= 48h`.
- **Impacto:** Una caja que quedó abierta por olvido >48h (común en clínicas) pierde todos sus movimientos reales del total mensual; los reportes de ingreso/egreso subestiman el dinero manejado. Problema serio de integridad contable.
- **Corrección:** No descartar movimientos financieros por antigüedad de la sesión; marcar sesiones rezagadas como advertencia e incluir sus movimientos (o exigir su resolución antes de reportar).

### A-10 · Plan de tratamiento: guardado no atómico (lost update)
- **Archivos:** `Server/controllers/patientsController.js:2104,2107`; modelo `Server/models/patient.js:616` (`versionKey: false`).
- **Evidencia:** `patient.planes_tratamiento.unshift(newTreatmentPlan)` + `await patient.save()` con `versionKey: false` (sin control de concurrencia optimista).
- **Impacto:** Dos adiciones casi simultáneas (o una concurrente con cualquier otra escritura del paciente) hacen read-modify-write del documento completo y descartan silenciosamente un plan. `addEvolutionNote` ya se reescribió con `$push` atómico justamente por esto; `addTreatmentPlan` no.
- **Corrección:** Persistir con `Patient.updateOne(..., { $push: { planes_tratamiento: {...} } })`.

### A-11 · Sin pipeline de CI a pesar de una suite de pruebas real
- **Evidencia:** No existe `.github/workflows/`; el único contenido de `.github` es un chatmode. Hay 25 archivos de prueba (`Server/tests/*.test.js`, `Client/**/*.test.jsx`) con `jest` + `supertest` + `mongodb-memory-server`.
- **Impacto:** Las pruebas existen pero nada las ejecuta en push/PR para una app médica instalada por clínica; las regresiones se publican en silencio.
- **Corrección:** Agregar un workflow de GitHub Actions que ejecute `npm test` (el script raíz encadena `test:server` + `test:client`).

### A-12 · Binario `mongod.exe` de 64 MB rastreado en git
- **Archivo:** `tools/mongo/bin/mongod.exe` (verificado: aparece en `git ls-files`).
- **Evidencia:** `.gitignore:44` lo lista, pero se commiteó antes de la regla, así que la regla no surte efecto.
- **Impacto:** Infla cada clon ~64 MB y es un binario de **Windows** dentro de una app distribuida también para macOS. La presencia de `bfg.jar` en `.gitignore` sugiere que se intentó purgar el historial y no se completó.
- **Corrección:** `git rm --cached tools/mongo/bin/mongod.exe` y obtener Mongo vía instalador; considerar BFG para purgar el historial.

---

## 4. Hallazgos Medios 🟡

### M-1 · CSP de producción solo permite `connect-src` a localhost
- **Archivo:** `Client/index.html:16` — `connect-src 'self' http://localhost:* http://127.0.0.1:* ...`. En producción la API no está en localhost: o la CSP bloquea todas las llamadas, o es configuración muerta. No es una política lista para desplegar. **Corrección:** inyectar el origen real de la API por entorno en build.

### M-2 · CSP permite `unsafe-inline` y `unsafe-eval` en scripts
- **Archivo:** `Client/index.html:15` — `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:`. Anula gran parte de la protección XSS de la CSP, agravado por el token en localStorage (A-2). **Corrección:** usar nonces/hashes y quitar `unsafe-*` y `data:` de `script-src`.

### M-3 · Rate limiting global desactivado fuera de producción (y se shippea `NODE_ENV=development`)
- **Archivo:** `Server/middlewares/rateLimiter.js:45,57` — `skipInDev = NODE_ENV !== 'production'`. El `Server/.env` distribuido trae `NODE_ENV=development`. Login conserva su propio limitador, pero `strictAuthLimiter` se define y nunca se monta. **Corrección:** no shippear `NODE_ENV=development`; forzar producción y montar `strictAuthLimiter`.

### M-4 · `authenticate` no fija issuer ni tipo de token
- **Archivo:** `Server/middlewares/authenticate.js:15` — `jwt.verify(token, getJwtSecret())` sin `{ issuer }`. Los tokens se firman con `issuer: 'dentia-core'` pero no se valida, y un token `type:'refresh'` pasaría (con `role=undefined`). **Corrección:** pasar `{ issuer }` y rechazar `payload.type === 'refresh'`.

### M-5 · `GET /users/doctors` expone la cédula profesional a cualquier rol
- **Archivo:** `Server/routes/userRoutes.js:24` — `router.get('/doctors', usersController.listDoctors)` sin `authorize()`. Devuelve `cedulaProfesional` a cualquier usuario autenticado, incluido `recepcionista`. **Corrección:** quitar la cédula del endpoint o protegerlo con un permiso adecuado.

### M-6 · Subida de SVG (XSS almacenado) y validación solo por MIME
- **Archivos:** `Server/middlewares/uploadLogo.js:26` (permite `image/svg+xml`) y constructores de nombre en `uploadLogo.js:17`, `uploadFirma.js:19`, `upload.js:29` (conservan la extensión del `originalname`). Combinado con `/uploads` público (C-1), un SVG con `<script>` ejecuta en el navegador. **Corrección:** quitar SVG (o servir con `Content-Disposition: attachment`), fijar la extensión a partir del tipo validado y verificar magic bytes (el proyecto ya tiene `utils/fileMagicBytes.js`, sin usar aquí).

### M-7 · `createCharge` acepta una `fecha` arbitraria del cliente (backdating)
- **Archivo:** `Server/controllers/patientChargeController.js:141` — `fecha: fecha || new Date()` sin validación; la ruta `patientChargeRoutes.js:60` no tiene `backdatedEntry`. La fecha alimenta toda agregación de stats. **Corrección:** validar la fecha o enrutarla por `backdatedEntry()`.

### M-8 · `closeBox` puede dejar una sesión `CLOSING` atascada
- **Archivo:** `Server/controllers/cashController.js:382-389`. Si el recálculo falla y el revert CLOSING→OPEN también falla, la sesión queda CLOSING y `openBox` bloquea (409) toda caja nueva al envejecer. **Corrección:** hacer el paso de recálculo idempotente/reintentable.

### M-9 · `updateMovement` recalcula `finalAmount` de una sesión CERRADA sin piso
- **Archivo:** `Server/controllers/cashController.js:675-683`. Editar un movimiento histórico recomputa `finalAmount` sin floor; puede dejar negativo un corte pasado, reescribiendo contabilidad consolidada que debería ser inmutable. **Corrección:** bloquear (o exigir autorización elevada para) ediciones que alteren el flujo de caja de una sesión CERRADA y rechazar `finalAmount` negativo.

### M-10 · `getAppointmentActivity` usa ventana de 24h UTC mal segmentada
- **Archivo:** `Server/controllers/appointmentController.js:887-896`. La ventana `[hora_cita, +24h)` atribuye mal pagos hechos minutos antes o movimientos no relacionados dentro de 24h. **Corrección:** usar límites del día local y/o correlacionar por sesión de caja.

### M-11 · `audit/patients` devuelve pacientes con soft-delete
- **Archivo:** `Server/controllers/auditController.js:256-262` — la búsqueda no filtra `deletedAt: null`, a diferencia de todas las demás consultas de pacientes. Contradice la garantía de cancelación (LFPDPPP). **Corrección:** agregar `deletedAt: null`.

### M-12 · Sistema de tokens de Google duplicado fuera del axios central
- **Archivos:** `Client/src/features/consultas/components/CreateAppointmentModal.jsx:208-250`, `GoogleCalendarSection.jsx:17-55`, `calendar.jsx:179-188`. Usan `fetch` crudo y reimplementan `getAccessToken`/`store...` leyendo `localStorage('accessToken')`, evadiendo el interceptor de refresh/401. **Corrección:** centralizar el manejo del token de Google en un servicio y enrutar por el axios compartido.

### M-13 · `buildAttachmentUrl` apunta los archivos al origen del frontend, no a la API
- **Archivo:** `Client/src/shared/services/attachmentService.js:37-41` — `return \`${window.location.origin}${relativeUrl}\``. Los archivos viven en la API (puerto 5002); en producción esto da 404 salvo que un proxy reenvíe `/uploads`. (`getLogoUrl`/`getFirmaUrl` sí usan `API.defaults.baseURL`.) **Corrección:** construir desde la base de la API.

### M-14 · Borradores con PHI persistidos en localStorage por 7 días
- **Archivo:** `Client/src/shared/hooks/useDraftPersistence.js:5,26-37` — `DRAFT_MAX_AGE_MS = 7 días`. Snapshots de formularios/odontograma (PHI) sin cifrar en estaciones compartidas, sobreviven al logout. **Corrección:** limpiar borradores al cerrar sesión, acortar retención y keyear por usuario.

### M-15 · `package.json` raíz: dependencia `path` y mongoose con majors distintos
- **Archivos:** `package.json:34` (`"path": "^0.12.7"`, shim obsoleto del módulo nativo — red flag) y `package.json:30` (`mongoose ^9`) vs `Server/package.json:23` (`mongoose ^7`). Raíz también arrastra deps pesadas de server/client. **Corrección:** quitar `path`, unificar el major de mongoose y podar deps raíz.

### M-16 · Ruido de `console.*` en producción
- **Evidencia:** ~68 `console.log` en `Server/` (127 `console.*` solo en `Server/controllers/`) y ~152 en `Client/src`, pese a tener un logger Winston (`Server/utils/logger.js`). Algunos imprimen identificadores de paciente a stdout. **Corrección:** enrutar por el logger; en cliente, `esbuild: { drop: ['console','debugger'] }` para el build de producción.

---

## 5. Hallazgos Bajos ⚪

- **B-1 · `.claude/` no está en `.gitignore`** — el worktree duplicado `.claude/worktrees/fervent-banach-b1066f/` (copia completa de Client/Server/node_modules/DB) está "untracked", a un `git add .` de commitearse. **Fix:** agregar `.claude/` al `.gitignore`.
- **B-2 · `vite-build.log` rastreado** y documenta un bug real: clave duplicada `"arteriosclerosis"` en `Client/src/features/patient-detail/components/patient-medical-survey.jsx:403` (un valor sobrescribe al otro). **Fix:** eliminar el log, ignorar `*.log` y corregir la clave duplicada.
- **B-3 · `DentiaCore.app/` rastreado** (incluye `_CodeSignature` que se desactualiza). **Fix:** generar el `.app` en instalación, fuera de VCS.
- **B-4 · `.vercel/project.json` rastreado** en una app pm2/desktop. Configuración muerta y engañosa. **Fix:** borrar `.vercel/` e ignorarlo.
- **B-5 · Sin pinning de versión de Node** — no hay `engines` ni `.nvmrc`; instalaciones por clínica pueden caer en versiones incompatibles (mongoose 7 / vite 6 tienen pisos reales). **Fix:** `"engines": { "node": ">=18 <=22" }` + `.nvmrc`.
- **B-6 · Entry point CRA obsoleto** `Client/src/app/router/index.js` renderiza `App` sin `AuthProvider` (código muerto y engañoso; el real es `src/main.jsx`). **Fix:** eliminarlo (y `report-web-vitals.js` si no se usa).
- **B-7 · `error.message` crudo en algunas respuestas 500** — p. ej. `Server/controllers/patientsController.js:194`, `settingsController.js:19` (los handlers centrales sí ocultan stack). **Fix:** registrar el detalle en servidor y devolver mensaje genérico.
- **B-8 · `uploadDocs.js` no valida `patientId`** antes de construir la ruta (path traversal latente; hoy es código muerto). **Fix:** validar `/^[a-f\d]{24}$/i` o borrar el archivo.
- **B-9 · `getAllUsers` sin paginación** — `Server/controllers/usersController.js:67` (`find()` sin límite). Riesgo latente de payload/timeout. **Fix:** agregar límite/paginación.
- **B-10 · Opción inválida `bufferMaxEntries: 0`** en `Server/models/periodontogram.js:509` (removida en Mongoose 6+); además `bufferCommands: false` hace que estas consultas fallen en reconexiones breves. **Fix:** quitar `bufferMaxEntries`; reconsiderar `bufferCommands: false`.
- **B-11 · Scripts operativos en la raíz** (`create-admin.js`, `list-users.js`, `set-pin.js`, rastreados; toman credenciales por CLI, sin secretos hardcodeados). **Fix:** moverlos a `Server/scripts/`.
- **B-12 · README desactualizado / fallback de puerto incorrecto** — el README no menciona la integración con Google ni la distribución desktop/pm2; `Server/config/swagger.js:18` usa fallback `http://localhost:5000` (puerto equivocado, la API es 5002). **Fix:** actualizar README y unificar puertos desde env. (`Client/dist/` local existe pero está correctamente ignorado por git.)

---

## 6. Lo que está bien hecho ✅ (balance)

La auditoría también confirmó prácticas sólidas que conviene preservar:

- **Contraseñas/PIN:** bcrypt con costo 12, PIN hasheado y complejidad de contraseña forzada (`models/users.js`, `utils/crypto.js`).
- **JWT sin fallback inseguro:** `getJwtSecret` se niega a arrancar en producción sin un secreto fuerte (≥32 chars) y rechaza `'dev-secret'` (`utils/crypto.js:24`); el server falla rápido en boot.
- **Login endurecido:** comparación bcrypt en tiempo constante (anti-enumeración), lockout tras 5 intentos, mensajes 401 genéricos y rate limiters dedicados en login/reset/refresh/PIN.
- **Refresh tokens:** solo en cookie httpOnly, hasheados (SHA-256) en reposo, con rotación y detección de reuso que invalida la sesión.
- **Reset de contraseña:** tokens hasheados con TTL, respuesta genérica anti-enumeración, invalidación de sesiones.
- **NoSQL injection:** defensa consistente — `String()`, `ObjectId.isValid`, enums contra lista blanca y regex de búsqueda escapado.
- **Autorización:** `authenticate` delante de todas las rutas `/api` (`config/routes.js`), con `authorize([...])` de mínimo privilegio, `requireClinicalRole` y `filterPatientFields` para PHI.
- **Transporte/headers:** helmet con CSP, `frameguard: deny`, `x-powered-by` off, límites de body de 10 MB y CORS con allow-list (sin wildcard).
- **Operación:** `/api/health` con readyState de DB, apagado gracioso (SIGINT/SIGTERM), pm2 (`ecosystem.config.cjs`) con `NODE_ENV=production`, `autorestart` y `max_memory_restart`.
- **Frontend:** interceptor de refresh con single-flight + cola y manejo de 401; `ProtectedRoute` bloquea render hasta resolver auth (sin flash); sin `dangerouslySetInnerHTML` ni `eval` en `Client/src`; sin sourcemaps en producción por defecto.
- **Calidad:** 25 archivos de prueba con `mongodb-memory-server` + `supertest`; logger Winston con rotación.

---

## 7. Checklist priorizado antes de producción

**Bloqueadores (resolver sí o sí):**
1. [ ] Proteger `/uploads` con autenticación + autorización por paciente (C-1).
2. [ ] Validar permisos/roles y aplicar `checkPrivilegeEscalation` en settings y users (C-2).
3. [ ] Importar `fs-extra` en `odontogramaController.js` (C-3).

**Antes o inmediatamente después del lanzamiento:**
4. [ ] Convertir `ErrorBoundary` a componente de clase (A-1).
5. [ ] Sacar tokens (app y Google) de localStorage/URL; usar cookies httpOnly (A-2, A-3).
6. [ ] Poner el router de Google detrás de `authenticate` y quitar `/auth/token` (A-4).
7. [ ] Rotar secretos (Google + JWT), borrar `Server/.env.bak-jwt`, no shippear `.env` poblado (A-5).
8. [ ] Corregir carreras de caja/pagos y exclusiones contables (A-6, A-7, A-9) y atomicidad de planes (A-10) y contador de notas (A-8).
9. [ ] Agregar CI que ejecute las pruebas (A-11).
10. [ ] Quitar `mongod.exe` del repo (A-12).
11. [ ] Forzar `NODE_ENV=production` y endurecer CSP/rate limiting (M-1, M-2, M-3).

**Higiene / primer ciclo post-lanzamiento:** resto de Medios y Bajos (`.claude/` ignore, clave duplicada `arteriosclerosis`, dep `path`, ruido de `console`, README, etc.).

---

## 8. Correcciones aplicadas (31 may 2026)

Se corrigieron en código los 3 críticos y los altos/medios/bajos de bajo riesgo. **No** se tocó el flujo de tokens del frontend ni el OAuth de Google (A-2, A-3, A-4) por ser refactors de mayor riesgo que requieren prueba en navegador. Verificación: `node --check` en los 14 archivos backend, parseo JSX con `@babel/parser` en los 4 archivos frontend, carga del grafo de `require` de los 12 módulos, y 9 pruebas unitarias funcionales (escalada de privilegios + `authenticate`) — todas en verde.

| # | Hallazgo | Qué se hizo | Archivos |
|---|----------|-------------|----------|
| C-1 | `/uploads` PHI sin auth | Middleware `uploadsAuth` (Bearer o cookie httpOnly) antes del estático | `Server/middlewares/uploadsAuth.js` (nuevo), `Server/scripts/dent.js` |
| C-2 | Escalada de privilegios | Helper `validatePermissionAssignment` (lista blanca + no auto-escalar) en los 3 endpoints | `Server/utils/permissions.js`, `settingsController.js`, `usersController.js` |
| C-3 | Crash `fsExtra` | `require('fs-extra')` agregado | `Server/controllers/odontogramaController.js` |
| A-1 | ErrorBoundary no-op | Reescrito como componente de clase | `Client/src/shared/components/error-boundary.jsx` |
| A-6 | Sobrepago por carrera | Pago aplicado con update atómico condicional (`saldoPendiente >= amount`) | `Server/controllers/patientChargeController.js` |
| A-7 | Reverso sin re-validar caja | Re-check `OPEN` tras cada movimiento + reverso parcial informado | `patientChargeController.js` |
| A-8 | Contador de notas | Filtro `deletedAt: null` en el `findOneAndUpdate` + 404 limpio | `patientsController.js` |
| A-9 | Balance mensual subreporta | Se incluyen todos los movimientos; sesiones rezagadas → advertencia | `cashController.js` |
| A-10 | Plan de tratamiento no atómico | `$push`+`$position:0` atómico en vez de `unshift`+`save` | `patientsController.js` |
| A-11 | Sin CI | Workflow GitHub Actions (server + client tests) | `.github/workflows/ci.yml` (nuevo) |
| M-4 | JWT sin issuer/type | `jwt.verify({issuer})` + rechazo de refresh tokens | `Server/middlewares/authenticate.js` |
| M-5 | Cédula en `/doctors` | Removida del `select`/respuesta | `usersController.js` |
| M-6 | SVG / MIME en uploads | Quitado SVG; extensión derivada del MIME validado | `uploadLogo.js`, `uploadFirma.js` |
| M-7 | Backdating en cobros | Validación de `fecha` (no futura, no >2 años) | `patientChargeController.js` |
| M-9 | Corte CERRADO negativo | Guard de no-negatividad antes de persistir | `cashController.js` |
| M-10 | Ventana 24h mal segmentada | Cambiada a límites del día calendario | `appointmentController.js` |
| M-11 | Soft-deleted en audit | Filtro `deletedAt: null` agregado | `auditController.js` |
| M-13 | Adjuntos al origen equivocado | URL construida desde la base de la API | `Client/.../attachmentService.js` |
| M-14 | Drafts PHI en localStorage | `clearAllDrafts()` en logout + retención 7d→24h | `useDraftPersistence.js`, `AuthContext.jsx` |
| M-15 | dep `path` / sin `engines` | Quitada `path`; agregados `engines` y `.nvmrc` | `package.json`, `.nvmrc` (nuevo) |
| B-1 | `.claude/` sin ignorar | `.claude/`, `*.log`, `.vercel/`, `DentiaCore.app/` ignorados | `.gitignore` |

### Pendiente para ti (no aplicado en código)

**Pasos manuales / de infraestructura (no son código):**
- **A-5 · Rotar secretos.** Rotar el `JWT_SECRET` y el `GOOGLE_CLIENT_SECRET` (trátalos como comprometidos) y **borrar `Server/.env.bak-jwt`**. El sandbox no tiene permiso de borrado ni acceso a tus credenciales.
- **A-12 · `git rm --cached tools/mongo/bin/mongod.exe`** (y considerar BFG para purgar el historial). Igual para `vite-build.log`, `esb.err`, `.vercel/`, `DentiaCore.app/`: ya están en `.gitignore`, pero hay que sacarlos del índice con `git rm --cached`.
- **M-3 · `NODE_ENV=production`** en el `.env` de cada despliegue (hoy se shippea `development`).

> Nota sobre las pruebas: la suite Jest del servidor no pudo ejecutarse en este entorno porque `mongodb-memory-server` necesita descargar el binario de Mongo y el sandbox no tiene acceso a internet. Verifiqué la lógica con chequeo de sintaxis, carga de módulos y pruebas unitarias puras. Conviene correr `npm test` en tu máquina (o dejar que el nuevo CI lo haga) antes de desplegar.

---

## 9. Segunda tanda — refactors de frontend (31 may 2026)

Tras la primera tanda se abordaron los 4 hallazgos de mayor riesgo que se habían dejado fuera (tokens/OAuth del frontend y CSP). Se hicieron de forma incremental y conservadora. Verificación: `node --check` + carga de `require` del router de Google, parseo `@babel/parser` de los 4 archivos frontend, y 4 pruebas funcionales (orden de middlewares de `/auth/token` y no-exposición del refresh token) — todas en verde.

| # | Hallazgo | Qué se hizo | Archivos |
|---|----------|-------------|----------|
| A-2 | JWT de la app en localStorage | Access token movido a **memoria**; rehidratación vía `/auth/refresh` (cookie httpOnly) en el bootstrap; limpieza del token heredado | `Client/.../auth-token.js`, `app/auth/AuthContext.jsx` |
| A-3 | Refresh token de Google en URL | Eliminado el flujo legacy `?accessToken/?refreshToken`; solo queda el flujo seguro por cookie (`google_auth=success`) | `Client/.../calendar.jsx` |
| A-4 | OAuth Google sin auth / refleja tokens | `/auth/token` y `/refresh-token` detrás de `authenticate`; **dejan de exponer el refresh token**; refresh server-side vía cookie httpOnly; `oauthLimiter` añadido a todos los endpoints de Google | `Server/routes/googleRoutes.js`, `Client/.../calendar.jsx` |
| M-1/M-2 | CSP débil | `script-src` sin `unsafe-inline`/`unsafe-eval`/`data:` (verificado: no hay scripts inline ni `eval` en código ni bundle); `img-src` con `blob:` para firmas/adjuntos; `frame-src`/`connect-src` acotados a Google | `Client/index.html` |

**⚠️ Requiere que pruebes en el navegador antes de desplegar** (son cambios en el camino de autenticación y la política de seguridad; no pude ejecutarlos en vivo):
1. **Login / logout / recarga de página** — al recargar, la sesión debe rehidratarse sola (A-2). Si algo falla, el síntoma sería que te manda a `/login` tras recargar.
2. **Sincronización con Google Calendar** — conectar cuenta, ver eventos, crear cita, y que el token se renueve solo (A-3/A-4).
3. **Editor de odontograma / periodontograma y vista de firmas** — confirmar que la CSP endurecida no bloquea el canvas ni las imágenes blob (M-1/M-2). Si la consola del navegador muestra errores `Content-Security-Policy`, revertir la etiqueta `<meta>` de `Client/index.html`.

### Sigue pendiente (solo manual / infraestructura)
- **A-5 · Rotar `JWT_SECRET` y `GOOGLE_CLIENT_SECRET`; borrar `Server/.env.bak-jwt`.**
- **A-12 · `git rm --cached`** de `tools/mongo/bin/mongod.exe`, `vite-build.log`, `esb.err`, `.vercel/`, `DentiaCore.app/` (ya en `.gitignore`).
- **M-3 · `NODE_ENV=production`** en el `.env` de cada despliegue.

---

*Auditoría inicial: revisión de solo lectura. Sección 8: primera tanda de correcciones (críticos + bajo riesgo). Sección 9: segunda tanda (refactors de frontend). Todo aplicado el 31 may 2026. Las referencias `archivo:línea` de las secciones 2–7 corresponden al estado previo a las correcciones; pueden haberse desplazado.*
