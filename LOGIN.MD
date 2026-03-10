# Planificación del sistema de login, roles y permisos

## 1) Estado actual del proyecto (hallazgos relevantes)

- No hay sistema de autenticación activo. Solo existe un usuario temporal en el middleware de [Server/routes/periodontogramRoutes.js](Server/routes/periodontogramRoutes.js).
- Existe un modelo de usuarios con hash de contraseña y roles básicos en [Server/models/users.js](Server/models/users.js).
- Las rutas API principales montadas están en [Server/config/routes.js](Server/config/routes.js) (patients, periodontograms, cash). No hay rutas para login/usuarios.
- En el frontend, no hay páginas de login ni rutas protegidas; el router principal está en [Client/src/app/app.jsx](Client/src/app/app.jsx).
- El cliente ya tiene un interceptor de Axios que maneja 401/403 con un TODO en [Client/src/shared/services/axios-instance.js](Client/src/shared/services/axios-instance.js).
- Swagger ya declara un esquema bearer en [Server/config/swagger.js](Server/config/swagger.js), pero no se implementa JWT.

## 2) Objetivo funcional

Implementar autenticación y autorización por roles/permisos para:
- Proteger API y UI.
- Controlar acceso a módulos (pacientes, periodontogramas, caja, consultas, estadísticas, configuración).
- Permitir administración de usuarios y auditoría básica de acceso.

## 3) Principios legales y derechos

- **Finalidad (LFPDPPP)**: separa administrativo/demográfico de clínico/sensible y solo expone lo necesario según rol.
- **Inmutabilidad (NOM-004)**: los expedientes clínicos nunca se eliminan de forma destructiva; se usa soft delete con banderas administrativas y se exige nota aclaratoria para correcciones.
- **Trazabilidad (NOM-024)**: cada `create`/`update` debe guardar quién lo hizo y cuándo. Audita `lastUpdatedBy`, `updatedAt` y almacena eventos en logs.

## 4) Estructura legal de roles y permisos

### A. ADMINISTRADOR (Responsable sanitario / Dueño)
- Acceso total, pero cada operación registrada.
- Auditoría obligatoria antes de permitir `delete`:
  - Solo `soft delete` para usuarios comunes (flag `isActive: false`).
  - Borrado físico solo tras 5 años de inactividad y con doble confirmación explícita.

### B. DOCTOR (Odontólogo tratante)
- Acceso clínico completo y datos personales.
- Permisos:
  - `patients.read.full`, `patients.updateClinical`
  - `clinical.create`, `clinical.update` (solo campos permitidos y ventanas de tiempo de corrección)
  - `schedule.read`, `schedule.create`
  - `files.read`, `files.upload`
- Prohibido `clinical.delete`.

### C. ASISTENTE DENTAL
- Acceso clínico limitado y agenda.
- Permisos:
  - `patients.readClinical`
  - `clinical.read`
  - `files.read`, `files.upload`
  - `schedule.read`
- Prohibido `clinical.write` (no firma diagnóstica).

### D. RECEPCIONISTA (Administrativo)
- Solo datos administrativos y financieros.
- Permisos:
  - `patients.read.basic`, `patients.create`, `patients.update.contact`
  - `schedule.manage`, `cash.manage`, `stats.read.basic`
- Bloqueado acceso a `antecedentes`, `encuesta_medica`, `informacion_femenina`, `notas_evolucion`.

## 5) Matriz técnica de permisos (JSON extendida)

```javascript
const ROLES_PERMISSIONS = {
  ADMIN: ['*'],
  DOCTOR: [
    'patients.read.full',
    'patients.updateClinical',
    'clinical.read',
    'clinical.create',
    'clinical.update',
    'clinical.append',
    'files.read',
    'files.upload',
    'schedule.read',
    'schedule.own.update'
  ],
  ASISTENTE: [
    'patients.readClinical',
    'clinical.read',
    'files.read',
    'files.upload',
    'schedule.read'
  ],
  RECEPCIONISTA: [
    'patients.read.basic',
    'patients.create',
    'patients.update.contact',
    'schedule.manage',
    'cash.manage',
    'stats.read.basic'
  ]
};
```

## 6) Acceso controlado por proyección de datos (Patient)
Implementa un middleware o helper que filtre campos por rol antes de responder.

```javascript
const PUBLIC_FIELDS = 'nombre apellido_paterno apellido_materno contacto identificacion fecha_nacimiento fotoURL';

if (role === 'RECEPCIONISTA') {
  patient = await Patient.findById(patientId).select(PUBLIC_FIELDS);
} else if (['DOCTOR', 'ADMIN'].includes(role)) {
  patient = await Patient.findById(patientId);
}
```

- `informacion_femenina` solo DOCTOR/ADMIN (y ASISTENTE cuando sea indispensable).
- `documento.tipo` y `documento.numero` sí se incluyen para RECEPCIONISTA (facturación) con lectura y escritura.
- Excluir arrays sensibles (`antecedentes`, `encuesta_medica`, `notas_evolucion`) para roles administrativos.

## 7) Mecanismos de trazabilidad
- En cada `create`/`update` añader campos como `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.
- Loguear eventos críticos (login, refresh, logout, cambios clínicos, anulaciones).

## 8) Manejo seguro de borrado
- `patients.delete` no expone botón en UI; se cambia a `patients.archive` (set `isActive: false`).
- `ADMIN` puede ejecutar `patients.purge` con doble confirmación y comprobando 5 años sin actividad.
- Carpeta `uploads/` solo se limpia al purgar un paciente; las integraciones con storage deben respetar la vigencia legal.

**Roles actuales en modelo**: `doctor`, `recepcionista`, `administrador`.

**Propuesta (manteniendo compatibilidad y extendible)**:
- `administrador`: acceso total.
- `doctor`: acceso clínico completo (pacientes, odontogramas, periodontograma, consultas).
- `Asistentes`: acceso a pacientes, agenda/consultas y vista limitada.
- 'Recepcionista': Acceso a consultas, agenda vista limitada


**Permisos base (ejemplo)**
- ADMINISTRADOR, doctor,:`patients.read`, `patients.create`, `patients.update`, `patients.delete`
- `odontogram.read`, `odontogram.create`, `odontogram.update`, `odontogram.delete`
- `periodontogram.read`, `periodontogram.create`, `periodontogram.update`, `periodontogram.delete`
- `cash.read`, `cash.open`, `cash.close`, `cash.createMovement`, `cash.voidMovement`
- `stats.read`
- `users.read`, `users.create`, `users.update`, `users.disable`
- `settings.read`, `settings.update`

**Matriz mínima (inicio recomendado)**
- administrador: todos
- doctor: patients.*, odontogram.*, periodontogram.*, consultas.*, stats.read
- recepcionista: patients.read/create/update, consultas.*
- caja: cash.*

## 9) Arquitectura de autenticación

**Estrategia**: JWT con Access Token + Refresh Token.

- **Access Token**: vida corta (15–30 min). Se envía en `Authorization: Bearer <token>`.
- **Refresh Token**: vida larga (7–30 días). Se almacena en DB y en cookie HttpOnly (recomendado) o en storage seguro si no hay cookies.
- **Flujos**:
  - `POST /api/auth/login`: email + contraseña → access + refresh.
  - `POST /api/auth/refresh`: refresh válido → nuevo access.
  - `POST /api/auth/logout`: invalida refresh actual.
  - `GET /api/auth/me`: retorna perfil y permisos.

## 10) Cambios en backend (plan)

### 10.1 Nuevos módulos
- `Server/routes/authRoutes.js`
- `Server/controllers/authController.js`
- `Server/middlewares/authenticate.js` (valida JWT)
- `Server/middlewares/authorize.js` (verifica permisos)

### 10.2 Modelo de usuario
Extender [Server/models/users.js](Server/models/users.js) con:
- `permissions: [String]` (sobrescribe/añade a rol)
- `active: Boolean`
- `failedLoginAttempts`, `lockUntil`
- `lastLoginAt`, `lastPasswordChangeAt`

### 10.3 Seguridad y políticas
- Rate-limit en `/api/auth/login`.
- Bloqueo temporal por intentos fallidos.
- Registro de eventos (login ok/failed, logout, refresh) en logs.

### 10.4 Integración en rutas
- Aplicar `authenticate` global a `/api` excepto `/api/auth/*` y `/api/health`.
- Reemplazar el usuario temporal en [Server/routes/periodontogramRoutes.js](Server/routes/periodontogramRoutes.js).
- Proteger rutas de `patients`, `periodontograms`, `cash` con `authorize` según permiso.

## 11) Cambios en frontend (plan)

### 11.1 UI
- Pantalla de login (email + contraseña).
- Ruta pública `/login`.

### 11.2 Estado de autenticación
- Contexto/Store (`AuthContext`) con: `user`, `permissions`, `isAuthenticated`.
- Guard de rutas (`<ProtectedRoute>`), bloquea y redirige a `/login`.

### 11.3 Axios
- Interceptor para agregar `Authorization`.
- Manejo de 401: intentar refresh token → reintentar request → si falla, logout.

### 11.4 Navegación por permisos
- Ocultar items de sidebar según permisos.
- Acciones UI (botones, edición, borrado) deshabilitadas sin permiso.

## 12) Endpoints propuestos (REST)

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

**Administración de usuarios (solo admin)**
- `GET /api/users`
- `POST /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`
- `PATCH /api/users/:id/disable`

## 13) Variables de entorno

- `JWT_SECRET`
- `JWT_ACCESS_TTL` (ej. `15m`)
- `JWT_REFRESH_TTL` (ej. `7d`)
- `JWT_ISSUER`
- `COOKIE_SECURE` (true en prod)
- `CLIENT_URL`

## 14) Plan de implementación (fases)

### Fase 1 – Backend Auth básico
1) Crear rutas y controller de auth.
2) Implementar JWT y refresh.
3) Middleware `authenticate` + `authorize`.
4) Proteger rutas existentes (patients, periodontograms, cash).

### Fase 2 – UI Login y guardas
1) Crear vista `/login` y formulario.
2) Implementar `AuthContext`.
3) Proteger rutas del dashboard.
4) Reintento de refresh token en Axios.

### Fase 3 – Roles/Permisos y administración
1) Endpoints de usuarios.
2) UI básica de administración (lista, creación, desactivar).
3) Ajuste de sidebar y botones por permisos.

### Fase 4 – Auditoría y endurecimiento
1) Logs de autenticación.
2) Bloqueo por intentos fallidos.
3) Rotación de tokens y revocación.

## 15) Pruebas mínimas

- Login correcto/incorrecto.
- Access token expirado → refresh OK.
- Logout invalida refresh.
- Rutas protegidas devuelven 401/403 sin token.
- Permisos por rol (matriz).

## 16) Riesgos y decisiones abiertas

- ¿Cookies HttpOnly o storage en cliente? (recomiendo cookies HttpOnly si se controla el dominio).
- ¿Se permitirá múltiples sesiones por usuario?
- ¿Se requiere MFA en roles admin?

---

## Próximo paso sugerido

Confirmar: 
1) Roles finales y permisos exactos por módulo. 
2) Si se usarán cookies HttpOnly
despues veremos la configuración de creacion de usuarios de 