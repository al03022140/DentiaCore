# Análisis de Normalización por Sección — DentiaCore

**Fecha:** 2 de junio de 2026
**Método:** lectura del código real con referencia `archivo:línea`. Cada sección documenta **Problemas, Riesgos, Inconsistencias, Recomendación y Ejemplo normalizado**.
**Severidad:** 🔴 Crítico · 🟠 Alto · 🟡 Medio · ⚪ Bajo.

> Las reglas de destino están en `01-estandares-tecnicos.md`. El cómo migrar, en `03-estrategia-migracion.md`.

---

## Índice de secciones

| # | Sección | Severidad máx. |
|---|---------|----------------|
| 1 | Modelos y campos | 🟠 |
| 2 | Estados y enums | 🔴 |
| 3 | Controladores y rutas | 🟡 |
| 4 | Middlewares y utils | 🟡 |
| 5 | Contrato de API y respuestas | 🔴 |
| 6 | Features del frontend (carpetas/archivos) | 🟠 |
| 7 | Carpeta `shared/` | 🟠 |
| 8 | Estado y variables en componentes | 🟠 |
| 9 | Permisos y roles | 🟡 |
| 10 | Config y variables de entorno | ⚪ |
| 11 | Base de datos | 🟠 |
| 12 | Eventos y auditoría | 🟡 |

---

## 1. Modelos y campos `Server/models/` 🟠

**Problemas.** Coexisten dos estilos de campo según la antigüedad del modelo:

- **Español `snake_case`** (modelos antiguos): `patient.js` con `paciente_id`, `primer_nombre`, `apellido_paterno`, `apellido_materno`, `fecha_nacimiento`, `codigo_postal`, `entidad_federativa`; `appointment.js` con `paciente_id`, `doctor_id`, `fecha_hora`, `duracion`, `motivo`, `observaciones`. Son ~148 campos `snake_case` en español solo en modelos.
- **Inglés `camelCase`** (modelos recientes): `cashMovement.js` (`amount`, `paymentMethod`, `boxSessionId`), `boxSession.js`, `clinicSettings.js` (`clinicName`, `inactivityTimeout`).
- **Identificadores mezclando idiomas en un mismo nombre:** `doctorFirmaMethod` (`patient.js:541,603`), `comentarioProcedimiento` (`appointment.js`), y campos de auditoría `creadoPor`/`modificadoPor` conviviendo con campos en inglés dentro de `patientCharge.js` y `cashMovement.js`.

**Riesgos.** El desarrollador nunca sabe si un campo será `pacienteId` o `paciente_id` o `patientId`; obliga a memorizar por modelo. Aumenta bugs por typo y dificulta queries genéricas. Los nombres híbridos (`doctorFirmaMethod`) son imposibles de predecir.

**Inconsistencias clave.**

| Modelo | Estilo dominante | Outliers |
|--------|------------------|----------|
| `patient.js` | Español `snake_case` | `email`, `photoURL`, `doctorFirmaMethod` (mixto) |
| `appointment.js` | Español `snake_case` | `comentarioProcedimiento`, `totalEstimado` (mixto) |
| `users.js` | Inglés `camelCase` | `contraseña`, `rol` (español) |
| `cashMovement.js` | Inglés `camelCase` | `creadoPor` (español) |
| `patientCharge.js` | Inglés `camelCase` | `creadoPor`, `canceladoPor`, `registradoPor` (español) |

**Recomendación.** Adoptar **inglés `camelCase`** en todos los campos (§1, §9 del estándar). Campos de auditoría unificados: `createdBy`, `updatedBy`, `deletedBy`. Migración con alias de Mongoose para no romper datos existentes (ver `03`).

**Ejemplo normalizado.**

```js
// ANTES — patient.js
{
  paciente_id: String,
  primer_nombre: String,
  apellido_paterno: String,
  apellido_materno: String,
  fecha_nacimiento: Date,
  doctorFirmaMethod: { type: String, enum: ['pin','pad', null] },
  creadoPor: ObjectId,
}

// DESPUÉS
{
  patientId: String,
  firstName: String,
  lastNamePaternal: String,
  lastNameMaternal: String,
  birthDate: Date,
  doctorSignMethod: { type: String, enum: ['PIN','PAD', null] },
  createdBy: { type: ObjectId, ref: 'User' },
}
```

---

## 2. Estados y enums 🔴

Es la sección con mayor severidad: el mismo concepto se representa de hasta tres formas, y un modelo tiene **dos** campos de estado a la vez.

**Problemas.**

1. 🔴 **Doble estado en `periodontogram.js`.** Coexisten `status: ['draft','completed','reviewed','archived']` (`:377`, default `'draft'` en `:580`) y `estadoRegistro: ['BORRADOR','OFICIAL','ARCHIVADO']` (`:473`, default `'BORRADOR'` en `:557`). Dos fuentes de verdad para el estado del documento.
2. 🔴 **Mismo concepto, distinta representación según modelo.** "Estado de documento" es `['BORRADOR','OFICIAL','ARCHIVADO']` (español MAYÚS) en `patient.js:476,512`, `exam.js:55`, `odontograma.js:165`, `periodontogram.js:473`, pero `['draft','completed','reviewed','archived']` (inglés minús) en el `status` de periodontogram. Y el nombre del campo cambia: a veces `estado`, a veces `estadoRegistro`.
3. 🟠 **Enums de estado con formato humano, no de máquina.** `appointment.js:40` → `["Pendiente","Confirmada","EnCurso","Pasada","NoShow","Cancelada"]`: mezcla español/inglés (`NoShow`), casing inconsistente (`EnCurso` vs `Pasada`). `exam.js:28` → `["Pendiente","Realizado","En revisión","Entregado"]`: con espacio y acento.
4. ⚪ **Lo que sí está bien:** caja/sesión usa inglés UPPER limpio: `cashMovement.js:23` `['INCOME','EXPENSE']`, `:28` `['CASH','DIGITAL']`, `boxSession.js:24` `['OPEN','CLOSED','CLOSING']`. Sirve de modelo a seguir.

**Riesgos.** Comparaciones que fallan silenciosamente (`status === 'archived'` vs `estadoRegistro === 'ARCHIVADO'`); lógica duplicada para mantener ambos campos sincronizados; al mostrar en UI hay que adivinar el idioma del valor. El doble estado de periodontogram puede producir documentos "archivados según un campo y borrador según el otro".

**Inconsistencias clave.**

| Concepto | Representaciones actuales | Archivos |
|----------|---------------------------|----------|
| Estado de documento | `['BORRADOR','OFICIAL','ARCHIVADO']` **y** `['draft','completed','reviewed','archived']` | patient, exam, odontograma, periodontogram |
| Estado de cita | `["Pendiente","Confirmada","EnCurso","Pasada","NoShow","Cancelada"]` | appointment.js:40 |
| Estado de examen | `["Pendiente","Realizado","En revisión","Entregado"]` | exam.js:28 |
| Tipo de documento | `['initial','clinic']` (minús inglés) | odontograma.js:150 |

**Recomendación.** Crear `Server/constants/enums.js` como **fuente única** (§3 del estándar). Un solo campo `status` por documento, valores `UPPER_SNAKE` inglés. Diccionario de etiquetas en español en el frontend para la UI. Eliminar el `estadoRegistro` redundante de periodontogram unificando en `status`.

**Ejemplo normalizado.**

```js
// Server/constants/enums.js
const DOCUMENT_STATUS = Object.freeze({ DRAFT:'DRAFT', OFFICIAL:'OFFICIAL', ARCHIVED:'ARCHIVED' });
const APPOINTMENT_STATUS = Object.freeze({
  PENDING:'PENDING', CONFIRMED:'CONFIRMED', IN_PROGRESS:'IN_PROGRESS',
  COMPLETED:'COMPLETED', NO_SHOW:'NO_SHOW', CANCELLED:'CANCELLED',
});

// periodontogram.js — un solo estado
const { DOCUMENT_STATUS } = require('../constants/enums');
status: { type:String, enum:Object.values(DOCUMENT_STATUS), default:DOCUMENT_STATUS.DRAFT }
// (se elimina estadoRegistro)
```

```js
// Frontend — etiquetas en español para la UI
export const APPOINTMENT_STATUS_LABELS = {
  PENDING:'Pendiente', CONFIRMED:'Confirmada', IN_PROGRESS:'En curso',
  COMPLETED:'Completada', NO_SHOW:'No asistió', CANCELLED:'Cancelada',
};
```

---

## 3. Controladores y rutas `Server/controllers`, `Server/routes` 🟡

**Problemas.** El naming de funciones es **bueno** (camelCase inglés, verbo+recurso: `getAllPatients`, `createAppointment`, `updateAppointmentStatus`). El problema está en los **nombres de archivo**: mezcla singular/plural y un par en español.

**Inconsistencias clave.**

- **Singular vs plural sin regla:** `patientsController.js` y `usersController.js` (plural) frente a `appointmentController.js`, `examController.js`, `cashController.js` (singular). En rutas, en cambio, casi todo es singular: `patientRoutes.js`, `userRoutes.js`.
- **Cruce ruta/controlador:** ruta `patientRoutes.js` (singular) ↔ controlador `patientsController.js` (plural).
- **Español vs inglés en el mismo par de dominios:** `odontogramaController.js`/`odontogramaRoutes.js` (español) frente a `periodontogramController.js`/`periodontogramRoutes.js` (inglés).

**Riesgos.** Bajo a nivel de bug, pero alto en fricción: para importar un controlador hay que recordar si es singular o plural. Dificulta scripts y convenciones automáticas.

**Recomendación.** **Recurso en singular** para archivo de modelo, controlador y ruta (`patientController.js`, `patientRoutes.js`); la **URL** en plural (`/api/patients`). Renombrar `odontograma*` → `odontogram*`. Mantener el naming de funciones actual (ya es correcto).

**Ejemplo normalizado.**

```
ANTES:  patientsController.js + patientRoutes.js + odontogramaController.js
DESPUÉS: patientController.js  + patientRoutes.js + odontogramController.js
URL:     GET /api/patients   (plural en la URL, singular en el archivo)
```

---

## 4. Middlewares y utils `Server/middlewares`, `Server/utils`, `Server/helpers` 🟡

**Problemas.** Mayoría en inglés camelCase correcto (`authenticate.js`, `rateLimiter.js`, `auditLogger.js`), pero hay outliers en español y carpetas redundantes.

**Inconsistencias clave.**

- 🟡 **Middleware en español:** `capturaExtemporanea.js` cuando ya existe la versión inglesa `backdatedEntry.js`. Hay solapamiento funcional.
- 🟡 **Util en español:** `Server/utils/periodontograma.js` (español) junto a `periodontogramUtils.js`, `periodontogramData.js`, `periodontogramAdaptors.js` (inglés). Confunde cuál es la fuente real.
- ⚪ **Casing atípico:** `UniversalToothValidator.js` (PascalCase para un util), `signature-invalidation.js` (kebab-case en una carpeta camelCase).
- 🟠 **`utils/` y `helpers/` coexisten** cumpliendo la misma función (helpers tiene 1 archivo).

**Riesgos.** Duplicación silenciosa (dos archivos para lo mismo, uno se actualiza y el otro no). El reviewer no sabe dónde poner una nueva utilidad.

**Recomendación.** Consolidar `helpers/` dentro de `utils/`. Renombrar a inglés camelCase: `periodontograma.js` → fusionar en `periodontogramUtils.js`; `capturaExtemporanea.js` → eliminar en favor de `backdatedEntry.js`. Normalizar `UniversalToothValidator.js` → `toothValidator.js` y `signature-invalidation.js` → `signatureInvalidation.js`.

---

## 5. Contrato de API y respuestas 🔴

**Problemas.** No existe una forma de respuesta estándar. Conviven al menos cuatro patrones:

- `{ success:true, message, data }` — `patientsController.js:1661`
- `{ message, ...campos }` sin `success` — `settingsController.js:144`
- `{ success:true, versions:[] }` — `periodontogramController.js:858`
- Datos crudos sin envoltura — `statsController.js:219` (`{ labels, datasets, granularity }`)

Además, rutas y bodies mezclan idiomas: paths `/odontograma-inicial`, `/odontograma-clinico` (español) vs `/periodontogram` (inglés); singular/plural en URL (`/cash` vs `/patients`, `/users`); bodies como `{ email, contraseña }` y `{ treatmentPlan: { texto, fecha, fechaFormateada } }` (wrapper inglés, campos español).

**Riesgos.** 🔴 El cliente no puede asumir una forma estable → cada llamada necesita parser defensivo; los errores se manejan distinto por endpoint y algunos se tragan. Es deuda que se paga en cada feature nueva del frontend.

**Recomendación.** Sobre único `{ success, data, message?, error:{ code, message } }` (§8 del estándar), claves en inglés, `message` en español (texto de UI), `error.code` en inglés UPPER. Rutas en inglés/plural/kebab. Bodies con claves en inglés que coinciden con el modelo.

**Ejemplo normalizado.**

```jsonc
// ANTES (statsController.js:219)
{ "labels": [...], "datasets": [...], "granularity": "month" }

// DESPUÉS
{ "success": true, "data": { "labels": [...], "datasets": [...], "granularity": "MONTH" } }

// Error estándar
{ "success": false, "error": { "code": "CONFLICT", "message": "La caja ya está abierta" } }
```

---

## 6. Features del frontend `Client/src/features/` 🟠

**Problemas.** A nivel de carpeta el naming es casi consistente (kebab-case/inglés), con un outlier en español. A nivel de archivo, mezcla fuerte PascalCase/kebab-case.

**Inconsistencias clave.**

- 🟡 **Feature en español:** `consultas/` entre 12 features en inglés (`add-patient`, `cash`, `odontogram`, `periodontogram`, `patient-detail`, etc.). Subcarpeta en español dentro de inglés: `periodontogram/periodontograma-functions/`.
- 🟠 **Archivos de componente PascalCase vs kebab-case** según el feature:
  - PascalCase: `cash/CashDashboard.jsx`, `auth/LoginPage.jsx`, `settings/SettingsPage.jsx`, `users/UsersPage.jsx`, `audit/AuditTimelinePage.jsx`.
  - kebab-case: `add-patient/add-patient.jsx`, `patient-list/patient-list.jsx`, `patient-detail/patient-detail.jsx`, `periodontogram/periodontogram-design.jsx`.
  - **Mezcla dentro del mismo feature:** `patient-detail/` tiene `patient-detail.jsx` (kebab) y `PatientPrintPage.jsx` (Pascal).
- ⚪ **CSS desalineado:** `PatientDetail.css` (Pascal) importado por `patient-detail.jsx` (kebab).
- ⚪ **Barrel `index.js` solo en `periodontogram`**, ausente en el resto.

**Riesgos.** Para abrir un componente hay que adivinar el casing del archivo; los imports se rompen por mayúscula/minúscula en sistemas case-sensitive (Linux/CI) aunque funcionen en macOS.

**Recomendación.** **PascalCase para todos los `.jsx` de componente** y CSS con el mismo nombre. Renombrar `consultas/` → `appointments/` y `periodontograma-functions/` → `periodontogram-functions/`. Barrel `index.js` en todos los features.

**Ejemplo normalizado.**

```
ANTES:  features/patient-detail/patient-detail.jsx  + PatientPrintPage.jsx + PatientDetail.css
DESPUÉS: features/patient-detail/PatientDetail.jsx   + PatientPrintPage.jsx + PatientDetail.css
        features/consultas/  →  features/appointments/
```

---

## 7. Carpeta `shared/` 🟠

**Problemas.** Carpetas duplicadas y capa de servicios con dos convenciones de nombre.

**Inconsistencias clave.**

- 🟠 **`shared/context/` y `shared/contexts/` coexisten** sin diferencia funcional: `context/` tiene `SidebarContext.jsx`, `ThemeContext.jsx`; `contexts/` tiene `AppointmentContext.jsx`, `UnsavedChangesContext.jsx`. Todos son React Contexts.
- 🟠 **Servicios con doble convención en la misma carpeta** `shared/services/`:
  - camelCase: `attachmentService.js`, `auditService.js`, `cashService.js`, `patientChargeService.js`, `settingsService.js`.
  - kebab-case: `appointment-service.js`, `auth-token.js`, `axios-instance.js`, `patient-service.js`, `periodontogram-service.js`.
- 🟡 **Componentes compartidos con casing mixto y español:** `CapturaExtemporanea.jsx` (Pascal + español), `SignatureModal.jsx`, `LockScreen.jsx` (Pascal) junto a `footer.jsx`, `header.jsx`, `sidebar.jsx`, `error-boundary.jsx` (minúsculas).
- ⚪ **API local de feature** `features/odontogram/api/odontograma-service.js` (español) mientras el resto centraliza en `shared/services/`.

**Riesgos.** Un context nuevo puede ir a cualquiera de las dos carpetas; un import busca en la incorrecta. La doble convención de servicios obliga a recordar el nombre exacto de cada archivo.

**Recomendación.** Una sola `shared/contexts/` (plural); mover los dos de `context/` y borrar la carpeta. Servicios todos en **kebab-case**. Componentes compartidos todos en **PascalCase** (`Footer.jsx`, `Header.jsx`, `Sidebar.jsx`, `ErrorBoundary.jsx`); `CapturaExtemporanea.jsx` → `BackdatedEntry.jsx`. Mover `odontograma-service.js` a `shared/services/odontogram-service.js`.

**Ejemplo normalizado.**

```
ANTES:  shared/context/SidebarContext.jsx   + shared/contexts/AppointmentContext.jsx
        shared/services/cashService.js       + shared/services/patient-service.js
DESPUÉS: shared/contexts/  (SidebarContext, ThemeContext, AppointmentContext, UnsavedChangesContext)
        shared/services/cash-service.js      + shared/services/patient-service.js  (todo kebab)
```

---

## 8. Estado y variables en componentes 🟠

**Problemas.** Dentro de un mismo componente conviven variables de estado en inglés y en español.

**Inconsistencias clave.** Caso real en `CreateAppointmentModal.jsx`:

```js
const [patientQuery, setPatientQuery] = useState('');     // inglés
const [selectedPatient, setSelectedPatient] = useState(null); // inglés
const [searching, setSearching] = useState(false);        // inglés
const [fechaHora, setFechaHora] = useState('');           // español
const [duracion, setDuracion] = useState(30);             // español
const [motivo, setMotivo] = useState('');                 // español
```

Además props que arrastran nombres de BD en español (`apellido_paterno`, `proximaCita`) hasta los componentes.

**Riesgos.** Carga cognitiva y errores al refactorizar; el origen del dato (BD en español) contamina toda la cadena hasta la UI.

**Recomendación.** Estado y props en inglés camelCase. Las props que reflejan campos de BD usan el nombre ya normalizado (`lastNamePaternal`, `nextAppointment`). Handlers `handleX`, callbacks `onX` (ya mayormente correcto).

**Ejemplo normalizado.**

```js
const [appointmentDateTime, setAppointmentDateTime] = useState('');
const [durationMinutes, setDurationMinutes] = useState(30);
const [reason, setReason] = useState('');
```

---

## 9. Permisos y roles `Server/utils/permissions.js`, `roles.MD` 🟡

**Problemas.** El esquema general es bueno (`recurso.accion` en inglés, con punto y wildcards), pero hay tres tipos de outlier.

**Inconsistencias clave.**

- 🟡 **Estilo legacy con guion bajo:** `read_periodontogram`, `create_periodontogram`, `update_periodontogram` (`permissions.js:61,97,141,142`) conviviendo con el estilo de punto `periodontogram.read`.
- 🟡 **Recurso en español:** `consultas.read/create/update` entre permisos en inglés.
- ⚪ **Singular vs plural:** `draft.approve` (`:91,124`) vs `drafts.batch_sign` (`:91,125`).

**Riesgos.** Una verificación de permiso puede fallar por usar el alias equivocado (`read_periodontogram` vs `periodontogram.read`); difícil auditar quién puede qué.

**Recomendación.** Un solo estilo `recurso.accion` en inglés. Eliminar los `*_periodontogram` con guion bajo. `consultas.*` → `appointments.*`. Unificar a `drafts.approve` y `drafts.batch_sign`. Mantener wildcards (`patients.*`) y herencia ya existentes.

---

## 10. Config y variables de entorno `.env.example`, `Server/config/` ⚪

**Problemas.** Casi todo correcto. Las variables de entorno están bien (`UPPER_SNAKE`: `MONGODB_URI`, `CLIENT_URL`, `GOOGLE_CLIENT_ID`).

**Inconsistencias clave.**

- ⚪ **Sufijo de unidad inconsistente** en `config/db.js`: `baseDelayMs` (Ms) frente a `socketTimeoutMS`, `connectTimeoutMS`, `serverSelectionTimeoutMS` (MS). El sufijo `MS` proviene del driver de Mongo, pero el código propio mezcla ambos.

**Riesgos.** Mínimo; cosmético, pero invita a más inconsistencia.

**Recomendación.** En código propio usar siempre `Ms` (`socketTimeoutMs`). Donde sea una opción literal del driver Mongo que exige `MS`, dejar el nombre del driver pero documentarlo con un comentario.

---

## 11. Base de datos 🟠

**Problemas.** Las colecciones derivan de los modelos, así que heredan los problemas de §1 y §2, más un outlier de colección y ausencia de framework de migración.

**Inconsistencias clave.**

- 🟠 **Campos `snake_case` español** en colecciones `patients`, `appointments` (heredado de §1).
- 🟡 **Colección outlier en español:** `odontogramas` (de `odontograma.js`) frente a todas las demás en inglés (`patients`, `appointments`, `cashmovements`, `boxsessions`, `auditlogs`).
- 🟡 **Sin framework de migración:** cambios de datos se hacen con scripts ad-hoc sueltos (p. ej. `Server/scripts/fixArchivedVersionNames.js`). Como la app se instala por clínica, cada base de datos evoluciona por su cuenta sin un control de versiones de esquema.

**Riesgos.** Migrar nombres de campo sin una estrategia versionada puede dejar instalaciones a medias. El outlier `odontogramas` rompe cualquier convención automática de colecciones.

**Recomendación.** Adoptar `Server/migrations/NNNN-*.js` con `up()` idempotente que cada instalación corre al actualizar (ver `03`). Renombrar colección `odontogramas` → `odontograms` vía alias. Campos a inglés camelCase con alias de Mongoose para lectura retro-compatible durante la transición.

---

## 12. Eventos y auditoría 🟡

**Problemas.** No hay sockets, colas ni cron. La auditoría es middleware síncrono que escribe en `auditLogs` (`middlewares/auditLogger.js`), lo cual es correcto. El problema son los **nombres de evento** en español/mixto.

**Inconsistencias clave.**

- 🟡 **Nombres de evento en español/mixto:** `auditLog.js` usa valores como `login_exitoso`, `login_fallido`, `firma_electronica`, `operacion_superadmin` (español con guion bajo).

**Riesgos.** Bajo, pero filtra el idioma español a un identificador de máquina; complica dashboards o alertas que filtren por `action`.

**Recomendación.** Esquema `recurso.accion` en inglés: `auth.login_success`, `auth.login_failed`, `note.sign`, `admin.operation`. Payload con claves en inglés (`userId`, `action`, `resourceType`, `resourceId`, `changedFields`, `reason`). Para futuros sockets/jobs, ver `01 §10`.

**Ejemplo normalizado.**

```js
// ANTES: evento: 'login_exitoso'
// DESPUÉS:
const AUDIT_ACTION = Object.freeze({
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED:  'auth.login_failed',
  NOTE_SIGN:     'note.sign',
});
```

---

## Resumen de hallazgos

| # | Sección | 🔴 | 🟠 | 🟡 | ⚪ |
|---|---------|----|----|----|----|
| 1 | Modelos y campos | | ✔ | | |
| 2 | Estados y enums | ✔ | ✔ | | ✔ |
| 3 | Controladores y rutas | | | ✔ | |
| 4 | Middlewares y utils | | ✔ | ✔ | ✔ |
| 5 | Contrato de API | ✔ | | | |
| 6 | Features frontend | | ✔ | ✔ | ✔ |
| 7 | `shared/` | | ✔ | ✔ | ✔ |
| 8 | Estado en componentes | | ✔ | | |
| 9 | Permisos y roles | | | ✔ | ✔ |
| 10 | Config y env | | | | ✔ |
| 11 | Base de datos | | ✔ | ✔ | |
| 12 | Eventos y auditoría | | | ✔ | |

Prioridad de ataque (por riesgo): **§2 enums → §5 contrato API → §1 modelos/BD → §6/§7 frontend → resto.** El orden de ejecución detallado está en `03-estrategia-migracion.md`.
