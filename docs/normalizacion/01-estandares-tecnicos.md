# Guía de Estándares Técnicos — DentiaCore

**Fecha:** 2 de junio de 2026
**Estado:** Oficial. Obligatorio para todo código nuevo.

> Esta guía define **cómo se escribe código en DentiaCore de aquí en adelante**. El diagnóstico de lo que hoy está mal vive en `02-analisis-por-seccion.md`; cómo migrar lo existente, en `03-estrategia-migracion.md`. Regla de oro: **lo nuevo cumple esto desde el día uno**, aunque lo viejo se migre gradualmente.

---

## Índice

1. Idioma oficial
2. Variables y constantes
3. Estados y enums
4. Funciones
5. Archivos
6. Estructura de carpetas
7. Tipado y validación
8. APIs (contrato HTTP)
9. Base de datos
10. Eventos y auditoría
11. Convenciones de frontend
12. Convenciones de backend
13. Convenciones PROHIBIDAS
14. Checklist de revisión de PR

---

## 1. Idioma oficial

**Inglés para el código. Español solo para lo que ve el usuario.**

| Elemento | Idioma | Ejemplo correcto |
|----------|--------|------------------|
| Variables, constantes | Inglés | `selectedPatient`, `MAX_LOGIN_ATTEMPTS` |
| Funciones y métodos | Inglés | `createAppointment()`, `getMonthlyBalance()` |
| Campos de modelos / BD | Inglés | `firstName`, `birthDate`, `paymentMethod` |
| Valores de enum (en BD) | Inglés | `'DRAFT'`, `'INCOME'` |
| Rutas / endpoints | Inglés | `/api/patients/:id/treatment-plans` |
| Permisos | Inglés | `patients.read`, `cash.manage` |
| Nombres de archivo y carpeta | Inglés | `appointment-service.js`, `patient-detail/` |
| Comentarios de código | Inglés (preferido) | `// orphan sessions block new box opening` |
| **Texto visible al usuario (UI)** | **Español** | `"Cita confirmada"`, `"Saldo pendiente"` |
| **Mensajes de error mostrados** | **Español** | `"No se pudo guardar la nota"` |

### Excepciones permitidas (términos de dominio)

Algunos términos clínicos se mantienen porque son el nombre real del concepto y traducirlos confunde más que ayuda. Se permiten **solo en el dominio clínico**, escritos en inglés cuando exista equivalente claro, y documentados:

- `odontogram` (no `odontograma`), `periodontogram` (no `periodontograma`). El equivalente en inglés existe y es estándar internacional → se usa inglés.
- Clasificaciones nombradas: `angleClassification`, `kennedyClassification` (los apellidos Angle/Kennedy se conservan como nombre propio).

> Si dudas si un término clínico debe traducirse, la regla es: **¿existe el término en literatura odontológica en inglés?** Si sí, úsalo en inglés. Si no (caso raro), consérvalo y deja un comentario `// domain term, intentionally not translated`.

### Patrón para texto de usuario

El valor en BD/código está en inglés; la traducción al español vive en la capa de presentación, no en el modelo:

```js
// shared/i18n/appointment-status.js  (frontend)
export const APPOINTMENT_STATUS_LABELS = {
  PENDING:   'Pendiente',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  NO_SHOW:   'No asistió',
  CANCELLED: 'Cancelada',
};
// Uso en UI:  APPOINTMENT_STATUS_LABELS[appointment.status]
```

El modelo guarda `'CONFIRMED'`; el usuario ve `"Confirmada"`. Nunca al revés.

---

## 2. Variables y constantes

| Caso | Convención | Ejemplo |
|------|------------|---------|
| Variables locales y de instancia | `camelCase` | `const pendingCharges = ...` |
| Constantes de módulo (valor fijo) | `UPPER_SNAKE_CASE` | `const CLOSING_STALE_MS = 3600000` |
| Booleanos | prefijo `is`/`has`/`can`/`should` | `isVisible`, `hasPendingCharges`, `canSign` |
| Arrays/colecciones | plural | `patients`, `movements` |
| Objeto único | singular | `patient`, `session` |
| Funciones-constructoras / componentes / clases | `PascalCase` | `CashDashboard`, `PatientSchema` |

Reglas:

- Nada de abreviaturas crípticas (`amt`, `qty`, `usr`). Excepción: `id`, `i`/`j` en loops triviales, y siglas establecidas (`url`, `pin`, `db`).
- Un identificador, un idioma. **Prohibido** mezclar dentro de un nombre (`doctorFirmaMethod`). Debe ser `doctorSignMethod`.
- Las unidades van en el nombre cuando aplica: `timeoutMs`, `amountMxn`, `delayMs` (siempre `Ms`, ver §13).

---

## 3. Estados y enums

Esta es la sección con más deuda hoy. Reglas firmes:

### 3.1 Forma de los valores

- **Valores de enum se guardan en BD en inglés y en `UPPER_SNAKE_CASE`.** Son identificadores estables, no texto para humanos.
- Sin acentos, sin espacios, sin PascalCase. `'IN_PROGRESS'`, nunca `'EnCurso'` ni `"En revisión"`.

### 3.2 Un concepto = un enum compartido

Si dos modelos tienen "estado de documento", **comparten el mismo enum** definido en un solo lugar. Nada de redefinirlo por modelo.

```js
// Server/constants/enums.js   (fuente única)
const DOCUMENT_STATUS = Object.freeze({
  DRAFT:    'DRAFT',
  OFFICIAL: 'OFFICIAL',
  ARCHIVED: 'ARCHIVED',
});

const APPOINTMENT_STATUS = Object.freeze({
  PENDING:     'PENDING',
  CONFIRMED:   'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED',
  NO_SHOW:     'NO_SHOW',
  CANCELLED:   'CANCELLED',
});

const CASH_MOVEMENT_TYPE = Object.freeze({ INCOME: 'INCOME', EXPENSE: 'EXPENSE' });
const PAYMENT_METHOD     = Object.freeze({ CASH: 'CASH', DIGITAL: 'DIGITAL' });

module.exports = { DOCUMENT_STATUS, APPOINTMENT_STATUS, CASH_MOVEMENT_TYPE, PAYMENT_METHOD };
```

Y en el modelo se referencia, no se reescribe:

```js
const { DOCUMENT_STATUS } = require('../constants/enums');
status: { type: String, enum: Object.values(DOCUMENT_STATUS), default: DOCUMENT_STATUS.DRAFT }
```

### 3.3 Un solo campo de estado por documento

Un documento tiene **un** campo de estado, no dos. El caso de `periodontogram.js` con `status` + `estadoRegistro` simultáneos (líneas 377 y 473) se unifica en un solo `status`.

### 3.4 Nombre del campo de estado

El campo se llama `status` (no `estado`, no `estadoRegistro`). El tipo de documento se llama `type` con valores en inglés (`'INITIAL'`, `'CLINIC'`, no `'initial'`/`'clinic'` mezclando casing — pasan a UPPER_SNAKE).

### 3.5 Demografía y catálogos clínicos

`sex`, `civilStatus`, etc. también en inglés UPPER_SNAKE en BD (`'MALE'`, `'FEMALE'`, `'OTHER'`), con su diccionario de etiquetas en español en la UI. Los catálogos largos (medicamentos, frecuencias) que hoy son texto libre en español se tratan como datos, no como enum de código: si son seleccionables, se modelan como catálogo con `key` (inglés) + `label` (español).

---

## 4. Funciones

| Caso | Convención | Ejemplo |
|------|------------|---------|
| Funciones y métodos | `camelCase`, verbo primero | `getPatientById`, `summarizeMovements` |
| Controladores (CRUD) | verbo + recurso | `createPatient`, `updateAppointment`, `deleteExam` |
| Handlers de evento (frontend) | `handle` + sujeto | `handleSubmit`, `handleBoxClosed` |
| Props callback (frontend) | `on` + evento | `onClose`, `onCreated`, `onCommit` |
| Hooks de React | `use` + sustantivo | `useDraftPersistence`, `useSidebar` |
| Predicados (devuelven boolean) | `is`/`has`/`can` | `isOrphanSession`, `hasPermission` |
| Funciones async | mismo nombre; no se sufija `Async` | `loadPatients()` |

Reglas:

- El verbo describe la acción real: `get` (lee y devuelve), `fetch` (trae de red), `load` (carga a estado), `create`/`update`/`delete`, `compute`/`calculate`, `format`, `validate`, `normalize`, `toggle`.
- Una función, una responsabilidad. Si el nombre necesita "and" (`saveAndNotify`), probablemente son dos funciones.

---

## 5. Archivos

Regla única por tipo de artefacto. **Sin mezclar** PascalCase y kebab-case dentro de la misma carpeta.

| Tipo de archivo | Convención | Ejemplo |
|-----------------|------------|---------|
| Componente React (`.jsx`) | `PascalCase` | `CashDashboard.jsx`, `PatientDetail.jsx` |
| Hook (`.js`) | `camelCase` con `use` | `useDraftPersistence.js` |
| Servicio / util / config (`.js`) | `kebab-case` | `cash-service.js`, `date-utils.js` |
| CSS de un componente | igual nombre que el componente | `CashDashboard.css` junto a `CashDashboard.jsx` |
| Modelo Mongoose | `camelCase` singular | `patient.js`, `cashMovement.js` |
| Controlador | `camelCase` + `Controller`, **recurso en singular** | `patientController.js`, `userController.js` |
| Ruta | `camelCase` + `Routes`, **recurso en singular** | `patientRoutes.js`, `userRoutes.js` |
| Middleware | `camelCase` | `authenticate.js`, `rateLimiter.js` |

> **Decisión sobre componentes:** se adopta **PascalCase para todos los `.jsx` de componente** (estándar de React y mayoritario en el repo). Los actuales `add-patient.jsx`, `patient-detail.jsx`, etc. se renombran a PascalCase. El CSS del componente toma el mismo nombre.

> **Decisión sobre singular/plural en backend:** el archivo de **modelo, controlador y ruta usa el recurso en singular** (`patient`, no `patients`). La **URL** del endpoint sí va en plural (`/api/patients`), porque representa una colección. Así se elimina la mezcla actual `patientsController.js` (plural) vs `appointmentController.js` (singular).

---

## 6. Estructura de carpetas

### Frontend (`Client/src/`)

```
app/            arranque, router, providers globales, estilos base
features/       una carpeta por dominio funcional (ver abajo)
shared/         lo reutilizable entre features
  components/   componentes UI compartidos (PascalCase.jsx)
  contexts/     React Contexts (SOLO plural; eliminar `context/`)
  hooks/        hooks compartidos (use*.js)
  services/     capa de acceso a API (kebab-case, ver §11)
  utils/        utilidades puras (kebab-case)
  validators/   validaciones de formularios
  styles/       tokens y estilos globales
  config/       configuración del cliente
```

Reglas de feature: cada feature es `features/<nombre-en-ingles>/` y, si crece, contiene:

```
features/patient-detail/
  PatientDetailPage.jsx      // entrada del feature
  components/                // subcomponentes (PascalCase.jsx)
  hooks/                     // hooks locales del feature
  api/  o usa shared/services
  styles/
  index.js                   // barrel export (ver nota)
```

- **`consultas/` → `appointments/`** (o el término en inglés acordado). No quedan features en español.
- **`periodontograma-functions/` → `periodontogram-functions/`**.
- **Barrel files (`index.js`):** o todos los features los usan, o ninguno. Decisión: **sí**, cada feature expone su entrada vía `index.js`. Hoy solo `periodontogram` lo hace.

### Backend (`Server/`)

```
config/         conexión BD, montaje de rutas, env
constants/      enums y constantes compartidas (NUEVO, ver §3)
models/         esquemas Mongoose
  schemas/      sub-esquemas reutilizables (subdocumentos)
controllers/    lógica de cada endpoint
routes/         definición de rutas Express
middlewares/    auth, audit, rate-limit, uploads, validación
services/        lógica de negocio reutilizable (NUEVO; sacar lógica gorda de controllers)
utils/          utilidades puras
helpers/        (fusionar con utils; no mantener ambas, ver §13)
```

- **Eliminar la dualidad `Server/models/schemas/` vs `Server/schemas/`.** Los subdocumentos reutilizables viven en `models/schemas/`. La carpeta `Server/schemas/` se vacía o se fusiona.
- **`helpers/` y `utils/` cumplen la misma función** → consolidar en `utils/`.

---

## 7. Tipado y validación

El proyecto es JavaScript (no TypeScript), con **Joi** para validación de entrada. Estándar:

- **Validación de request:** todo endpoint que recibe body valida con un esquema **Joi** centralizado por recurso. Las claves del esquema Joi están en inglés y coinciden 1:1 con los campos del modelo.
- **Documentar contratos con JSDoc** en funciones públicas de servicios y controladores:

```js
/**
 * @param {string} patientId
 * @param {{ amount:number, type:'INCOME'|'EXPENSE', paymentMethod:'CASH'|'DIGITAL' }} movement
 * @returns {Promise<CashMovement>}
 */
async function addMovement(patientId, movement) { ... }
```

- **Frontend:** props tipadas con `PropTypes` (o JSDoc) en componentes compartidos. Sin `any` implícito disfrazado de objeto sin forma.
- **Enums siempre desde `constants/enums.js`**, nunca strings sueltos repetidos (`'DRAFT'` escrito a mano en 5 archivos).
- **Si en el futuro se adopta TypeScript**, los enums de §3 son el punto de entrada natural (`as const` / `enum`).

---

## 8. APIs (contrato HTTP)

### 8.1 Rutas

- **Recurso en plural, kebab-case, inglés:** `/api/patients`, `/api/cash-movements`, `/api/treatment-plans`.
- Sub-recursos anidados bajo el padre: `/api/patients/:patientId/periodontograms`.
- Acciones no-CRUD como sub-ruta con verbo claro: `/api/cash/sessions/:id/close` (POST).
- Parámetros de query en `camelCase`: `?listVersions=true&group=month`.
- **Eliminar rutas en español:** `/odontograma-inicial` → `/odontograms?type=INITIAL` o `/odontograms/initial`.

### 8.2 Envoltura de respuesta (contrato único)

Toda respuesta JSON usa **la misma forma**:

```jsonc
// Éxito
{ "success": true, "data": { /* ... */ } }

// Éxito con mensaje para el usuario (en español, es texto de UI)
{ "success": true, "data": { /* ... */ }, "message": "Nota firmada correctamente" }

// Error
{ "success": false, "error": { "code": "VALIDATION", "message": "Falta el campo fecha" } }
```

Reglas:

- Claves del sobre **siempre en inglés**: `success`, `data`, `message`, `error`, `error.code`, `error.message`.
- `message` es **texto para el usuario** → en español. `error.code` es **identificador** → en inglés UPPER_SNAKE (`VALIDATION`, `FORBIDDEN`, `CONFLICT`, `NOT_FOUND`).
- Nunca devolver datos crudos sin envoltura (hoy `statsController` devuelve `{ labels, datasets }` directo). Va dentro de `data`.

### 8.3 Códigos de estado HTTP

| Situación | Código |
|-----------|--------|
| OK lectura | 200 |
| Creado | 201 |
| Sin contenido (delete OK) | 204 |
| Error de validación | 400 |
| No autenticado | 401 |
| Sin permiso | 403 |
| No encontrado | 404 |
| Conflicto de estado (ej. caja ya abierta) | 409 |
| Error servidor | 500 |

El `error.code` interno acompaña pero no reemplaza el status HTTP.

### 8.4 Cuerpos de request

Campos del body en **inglés camelCase**, coincidiendo con el modelo. Nada de `{ email, contraseña }` ni wrappers en inglés con campos en español (`{ treatmentPlan: { texto, fecha } }` → `{ treatmentPlan: { text, date } }`).

---

## 9. Base de datos

- **Campos en inglés `camelCase`.** Migrar los `snake_case` español (`apellido_paterno` → `lastNamePaternal`, `fecha_nacimiento` → `birthDate`, `paciente_id` → `patientId`). Ver mapeo completo y estrategia en `02` y `03`.
- **Colecciones en inglés.** El outlier `odontogramas` se normaliza a `odontograms` (vía alias de colección durante migración).
- **Campos de auditoría estándar y en inglés** en todos los modelos: `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`, `deletedBy`. Sustituye a `creadoPor`/`modificadoPor` actuales.
- **Índices** nombrados explícitamente cuando importan al rendimiento; declarados junto al esquema.
- **Migraciones:** dejar de usar scripts ad-hoc sueltos. Adoptar una convención de migraciones versionadas en `Server/migrations/NNNN-descripcion.js` con `up()` idempotente (ver `03`). Cada instalación de clínica corre las migraciones pendientes al actualizar.

---

## 10. Eventos y auditoría

Hoy no hay sockets, colas ni cron: la auditoría es **middleware síncrono** que escribe en la colección `auditLogs`. Estándar para mantener y para cuando se agreguen eventos reales:

- **Nombres de evento de auditoría:** `recurso.accion` en inglés, minúsculas con punto: `patient.create`, `auth.login_failed`, `note.sign`, `cash.session_close`. Hoy hay valores en español (`login_exitoso`, `firma_electronica`) → migrar al esquema inglés.
- **Payload de auditoría** con claves en inglés: `userId`, `action`, `resourceType`, `resourceId`, `changedFields`, `reason`, `timestamp`.
- **Si se añade WebSocket/pub-sub a futuro:** nombres de evento en `kebab-case` con namespace: `cash:session-opened`, `appointment:created`.
- **Si se añaden jobs/cron:** nombre del job en `kebab-case` describiendo la acción: `purge-stale-drafts`, `close-orphan-sessions`.

---

## 11. Convenciones de frontend

- **Componentes:** `PascalCase`, un componente por archivo, archivo = nombre del componente.
- **Hooks:** `use*`, en `shared/hooks/` si se reutilizan o en `features/<f>/hooks/` si son locales. No hooks sueltos dentro de archivos de componente grandes.
- **Estado (`useState`):** variable + setter en inglés camelCase: `const [selectedPatient, setSelectedPatient] = useState(null)`. **Prohibido** `const [fechaHora, setFechaHora]` conviviendo con `selectedPatient` (caso real en `CreateAppointmentModal.jsx`).
- **Props:** inglés camelCase. Las props que reflejan campos de BD usarán el nombre **ya normalizado** (`lastNamePaternal`, no `apellido_paterno`).
- **Handlers:** `handleX` para internos, `onX` para props.
- **Capa de servicios (`shared/services/`):** archivos en **kebab-case** (`cash-service.js`, `appointment-service.js`). Hoy conviven `cashService.js` (camel) y `appointment-service.js` (kebab) en la misma carpeta → unificar a kebab-case. Funciones del servicio en camelCase verbo-primero (`getMonthlyBalance`, `openBox`).
- **Un solo lugar para llamadas API.** Evitar que un feature tenga su propio `api/odontograma-service.js` mientras otros usan `shared/services/`. Decisión: **toda llamada vive en `shared/services/<recurso>-service.js`**; los `api/` locales de feature se migran allí.
- **Contexts:** solo `shared/contexts/` (plural). Mover `SidebarContext.jsx` y `ThemeContext.jsx` desde `shared/context/` y eliminar la carpeta singular.
- **Comentarios:** preferentemente inglés. Si existen en español, no es bloqueante migrarlos, pero el código nuevo los escribe en inglés.

---

## 12. Convenciones de backend

- **Controladores delgados:** validan entrada (Joi), llaman a un servicio, formatean la respuesta con el sobre estándar (§8.2). La lógica de negocio gorda (ej. `summarizeMovements`) vive en `services/`, no inline en el controlador.
- **Funciones de controlador:** verbo + recurso (`createPatient`). Exportadas con nombre, no anónimas.
- **Rutas:** archivo por recurso, montan los handlers del controlador. Sin lógica de negocio en el archivo de rutas.
- **Middlewares:** una responsabilidad por middleware; nombre en inglés camelCase. `capturaExtemporanea.js` → `backdatedEntry.js` (ya existe la versión inglesa; consolidar y eliminar la española).
- **Manejo de errores:** lanzar errores con `code` interno y dejar que un middleware central los traduzca al sobre `{ success:false, error:{ code, message } }`. No `res.json` con formas distintas en cada catch.
- **Modelos:** un campo de estado por documento (§3.3); enums desde `constants/enums.js`; campos de auditoría estándar (§9).
- **Permisos:** `recurso.accion` en inglés (`patients.read`). Eliminar el estilo legacy con guion bajo (`read_periodontogram` en `permissions.js:61,97,141`) y unificar `draft.approve` vs `drafts.batch_sign` a un recurso consistente (`drafts.approve`, `drafts.batch_sign`). El outlier `consultas.*` → `appointments.*`.

---

## 13. Convenciones PROHIBIDAS

Lo que **no** debe volver a aparecer en el código (y que un reviewer debe rechazar):

| 🚫 Prohibido | ✅ En su lugar |
|-------------|----------------|
| Identificadores mezclando idiomas (`doctorFirmaMethod`, `comentarioProcedimiento`) | Un solo idioma: `doctorSignMethod`, `procedureComment` |
| Campos `snake_case` en español (`apellido_paterno`) | `camelCase` inglés (`lastNamePaternal`) |
| Enums en español/PascalCase/con acentos/espacios (`"En revisión"`, `"EnCurso"`, `['BORRADOR']`) | `UPPER_SNAKE` inglés (`'IN_REVIEW'`, `'IN_PROGRESS'`, `'DRAFT'`) |
| Dos campos de estado en el mismo modelo (`status` + `estadoRegistro`) | Un solo `status` |
| Redefinir el mismo enum en cada modelo | Importar de `constants/enums.js` |
| Mezclar PascalCase y kebab-case de archivos en una carpeta | Una convención por tipo (§5) |
| Carpetas duplicadas (`context` + `contexts`, `models/schemas` + `schemas`, `utils` + `helpers`) | Una sola carpeta canónica |
| Respuestas API sin envoltura o con formas distintas | Sobre único `{ success, data, message?, error? }` |
| Rutas o features en español (`/odontograma-inicial`, `consultas/`) | Inglés (`/odontograms`, `appointments/`) |
| Claves de respuesta en español (`mensaje`, `exito`) | `message`, `success` (texto de `message` sí en español) |
| Strings de enum escritos a mano repetidos | Referencia a la constante |
| Sufijos de unidad inconsistentes (`socketTimeoutMS` vs `baseDelayMs`) | Siempre `Ms` (`socketTimeoutMs`, `baseDelayMs`) |
| Abreviaturas crípticas (`amt`, `qty`, `usr`) | Nombre completo (`amount`, `quantity`, `user`) |
| Lógica de negocio dentro del controlador o del archivo de rutas | Extraer a `services/` |

---

## 14. Checklist de revisión de PR

Antes de aprobar un PR, verificar:

- [ ] Todo identificador nuevo está en inglés (variables, funciones, campos, archivos, rutas, permisos).
- [ ] Texto visible al usuario en español; claves y códigos en inglés.
- [ ] Enums nuevos en `UPPER_SNAKE` inglés y referenciados desde `constants/enums.js` (no strings sueltos).
- [ ] Ningún modelo introduce un segundo campo de estado.
- [ ] Archivos siguen la convención por tipo (§5); CSS coincide con el nombre del componente.
- [ ] No se crean carpetas duplicadas; los contexts van en `contexts/` (plural).
- [ ] Endpoints nuevos: ruta en inglés/plural/kebab, respuesta con el sobre estándar, status HTTP correcto.
- [ ] Body validado con Joi; claves en inglés que coinciden con el modelo.
- [ ] Sin identificadores mezclando idiomas ni nada de la tabla §13.
- [ ] Si toca un módulo legacy, no **empeora** el naming (idealmente lo acerca al estándar siguiendo `03`).
