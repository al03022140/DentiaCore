# roles.MD — Sistema de Roles y Permisos DentiaCore

> Documento de referencia para implementación y auditorías COFEPRIS.  
> Cada restricción de acceso está respaldada en los artículos exactos de las cuatro normas de referencia.  
> Última actualización: 2025

---

## 1. Marco Legal

### NOM-004-SSA3-2012 — Del Expediente Clínico
*(DOF 15/10/2012, vigente)*

- **Art. 5.3** — El médico y demás personal de salud tienen la obligación de cumplir las disposiciones de la norma de forma ética y profesional.
- **Art. 5.4** — El expediente es propiedad del prestador de servicios médicos. El paciente tiene derechos de titularidad sobre la información para protección de su salud y de la confidencialidad de sus datos. Los expedientes deben conservarse un **mínimo de 5 años** desde el último acto médico.
- **Art. 5.5 / 5.5.1** — Los datos personales contenidos en el expediente son confidenciales. Solo pueden ser proporcionados a terceros cuando medie solicitud escrita del paciente, tutor, representante legal o médico debidamente autorizado por el paciente.
- **Art. 5.7** — La información del expediente clínico será manejada con **discreción y confidencialidad** por todo el personal. Solo será dada a conocer a autoridades judiciales, órganos de procuración de justicia y autoridades administrativas.
- **Art. 5.10** — Todas las notas en el expediente deben contener **fecha, hora, nombre completo y firma** (autógrafa, electrónica o digital) de quien las elabora.
- **Art. 5.12** — Se podrán utilizar medios electrónicos en la integración del expediente, conforme a disposiciones jurídicas aplicables.
- **Art. 6.2** — Las **notas de evolución** deben ser elaboradas por el **médico** cada vez que proporciona atención al paciente.
- **Art. 5.15** — El expediente odontológico en consulta ambulatoria se ajustará a la NOM-013.

### NOM-024-SSA3-2012 — Sistemas de Información de Registro Electrónico para la Salud (SIRES)
*(DOF 30/11/2012, vigente)*

Los SIRES deben garantizar:

- **Autenticación** de usuarios (identificación unívoca por credenciales).
- **Control de acceso por roles y perfiles** — cada usuario accede únicamente a los módulos y funciones correspondientes a su perfil.
- **Registro de auditoría** (trazabilidad) de todas las operaciones: quién, qué acción, sobre qué registro y cuándo.
- **Confidencialidad e integridad** de los datos del paciente.
- **Trazabilidad de modificaciones** — ningún registro clínico se elimina; las correcciones generan una nota de addendum con fecha/hora/responsable referenciando el registro original.
- Los logs de auditoría deben ser **inalterables** e incluir el identificador del usuario responsable.

### NOM-013-SSA1-2015 — Para la Prevención y Control de Enfermedades Bucales
*(vigente, reemplaza NOM-013-SSA2-2006)*

- Solo el **cirujano dentista** (y en su caso el especialista) puede elaborar, firmar y modificar el **odontograma**, **periodontograma** y las notas clínicas de diagnóstico y plan de tratamiento.
- Todos los procedimientos realizados deben quedar registrados en el expediente odontológico con fecha y firma del dentista responsable.
- El **personal auxiliar** (asistente dental) actúa bajo la **supervisión directa** del dentista; no puede elaborar diagnósticos ni planes de tratamiento de manera autónoma.
- El expediente odontológico debe incluir: ficha de identificación, historia clínica, odontograma, periodontograma, plan de tratamiento, notas de evolución y consentimientos informados.

### LFPDPPP — Ley Federal de Protección de Datos Personales en Posesión de los Particulares
*(DOF 20/03/2025, vigente)*

- **Art. 6** — Principios rectores: licitud, consentimiento, información, calidad, **finalidad**, **lealtad**, **proporcionalidad**, responsabilidad. → *Cada rol solo accede a los datos que son necesarios para su función (mínimo privilegio).*
- **Art. 9** — Los **datos de salud son datos sensibles**. Su tratamiento requiere **consentimiento expreso y por escrito** del titular. Nadie puede difundirlos sin autorización del paciente.
- **Art. 10** — Queda prohibida la comercialización de datos personales sin consentimiento del titular.
- **Art. 13** — El responsable debe designar una persona o departamento de privacidad de datos.
- **Art. 19** — Obligación de implementar medidas de seguridad **técnicas, administrativas y físicas** para proteger los datos personales.
- **Arts. 22-36** — Derechos ARCO del paciente: **Acceso, Rectificación, Cancelación, Oposición**. El sistema debe proveer mecanismos para ejercerlos.

---

## 2. Roles Definidos

### `superadmin` (Programador / Técnico del Sistema)

Rol reservado **exclusivamente para el equipo de desarrollo y soporte técnico**. No es un rol de clínica — no representa a ningún personal de salud ni administrativo real. Existe para labores de mantenimiento, despliegue, depuración y operaciones de emergencia sobre el sistema.

> **Regla crítica:** Este rol **nunca debe ser asignado a usuarios de la clínica**. Su uso debe quedar registrado en el log de auditoría con motivo obligatorio. En producción, las cuentas con este rol deben estar desactivadas por defecto y activarse solo durante ventanas de mantenimiento autorizadas.

#### Puede hacer
- Acceso completo a todos los módulos del sistema (lectura y escritura)
- Ejecutar migraciones de base de datos y scripts de mantenimiento
- Acceder a logs de auditoría y logs de errores del servidor
- Crear, modificar y desactivar cualquier usuario (incluidos `administrador`)
- Ejecutar operaciones de respaldo y restauración de datos
- Impersonar usuarios en modo de depuración (**siempre con registro de auditoría explícito**)
- Configurar parámetros técnicos del sistema no expuestos al `administrador`

#### No puede — Restricciones legales que aplican también al programador
- **No puede eliminar físicamente** expedientes clínicos ni logs de auditoría. NOM-004 Art. 5.4 (conservación 5 años) y NOM-024 (trazabilidad inalterable) aplican **independientemente del rol técnico**.
- **No puede divulgar ni exportar** datos de pacientes fuera del entorno autorizado sin consentimiento del titular (LFPDPPP Art. 9). Las operaciones de respaldo deben realizarse sobre datos cifrados.
- **Toda operación** realizada con este rol debe generar una entrada en el log de auditoría con `motivo` obligatorio (campo requerido).
- No debe tener acceso a este rol desde la interfaz de usuario de la clínica — solo vía herramientas de administración de servidor o CLI.

#### Diferencia clave con `administrador`
| Aspecto | `superadmin` | `administrador` |
|---|---|---|
| Asignado a | Programador / Soporte técnico | Dueño / Director de la clínica |
| Acceso a datos clínicos | Técnico (solo para mantenimiento) | Operativo (gestión del día a día) |
| Visible en la UI de la clínica | No | Sí |
| Activación | Solo en ventanas de mantenimiento | Permanente |
| Uso normal | Despliegues, migraciones, depuración | Gestión de usuarios, estadísticas, caja |

---

### `administrador`

Dueño/director de la clínica o responsable técnico del sistema.

#### Puede hacer
- CRUD completo de usuarios del sistema (con registro de auditoría en cada operación)
- Ver bitácoras de auditoría completas
- Configurar parámetros del sistema
- Exportar/importar datos (con registro de operación)
- Ver todas las estadísticas y reportes
- Gestionar caja y movimientos financieros
- Archivar (soft-delete) expedientes con justificación registrada

#### No puede — Restricciones legales
- **No puede eliminar físicamente** expedientes clínicos. La NOM-004 Art. 5.4 obliga a conservar al menos 5 años. Acción permitida: archivar/anonimizar con trazabilidad.
- **No puede alterar** notas médicas ya firmadas. La NOM-024 exige trazabilidad; cualquier corrección genera una nota de addendum con `fecha + hora + userId + motivo`, nunca sobreescribe.
- **No puede divulgar** datos de pacientes a terceros sin consentimiento escrito del titular (LFPDPPP Art. 9 + NOM-004 Art. 5.5).
- **No puede omitir** el registro de auditoría en ninguna operación de escritura (NOM-024).

---

### `doctor` (Cirujano Dentista)

Profesional de salud con cédula profesional que ejerce la práctica odontológica.

#### Puede hacer
- Leer todos los expedientes de pacientes asignados a su cargo
- Crear nuevos expedientes de pacientes (historia clínica inicial)
- Actualizar datos clínicos de sus pacientes
- **Revisar y aprobar borradores** capturados por la asistente: odontograma, periodontograma y notas de evolución *(el doctor revisa en pantalla lo que la asistente dictó, corrige si es necesario y presiona "Aprobar y Firmar")*
- **Crear y actualizar odontograma** directamente *(NOM-013: exclusividad del dentista para registros oficiales)*
- **Crear y actualizar periodontograma** directamente *(NOM-013: exclusividad del dentista para registros oficiales)*
- Crear y actualizar **notas de evolución / consultas** *(NOM-004 Art. 6.2)*
- Leer y crear exámenes (radiológicos, de laboratorio)
- Ver estadísticas de sus propios pacientes
- Gestionar sus propias citas

#### No puede
- **Eliminar físicamente** expedientes, notas ni registros clínicos firmados *(NOM-004 Art. 5.4 + NOM-024 trazabilidad)*
- **Modificar o borrar** notas ya firmadas (solo addendum)
- Ver **movimientos de caja** o información financiera detallada *(LFPDPPP Art. 6: proporcionalidad — no es necesario para su función clínica)*
- Crear ni modificar usuarios del sistema
- Acceder a expedientes de pacientes de otro doctor sin ser titular del caso *(NOM-004 Art. 5.7: confidencialidad — la información solo circula con necesidad justificada)*
- Ver las bitácoras de auditoría del sistema

---

### `asistente` (Asistente Dental)

Personal auxiliar que apoya al dentista durante los procedimientos clínicos.

#### Puede hacer — Flujo de Delegación Controlada

> **Base legal:** NOM-013 Art. (personal auxiliar actúa bajo supervisión directa) + NOM-004 Art. 5.10 (la nota solo es válida con firma del responsable). El sistema resuelve la tensión entre eficiencia clínica y cumplimiento legal mediante el **estado de Borrador**.

- **Leer** expedientes e historial de los pacientes asignados al doctor que asiste
- **Capturar en modo Borrador** sobre el odontograma del paciente *(el doctor le dicta qué marcar durante el procedimiento — la captura queda en estado `DRAFT`, visualmente diferenciado en la UI, sin validez médica oficial aún)*
- **Capturar en modo Borrador** en el periodontograma *(ídem)*
- **Redactar borradores de notas de evolución** que el doctor revisará y firmará al terminar el procedimiento *(ídem)*
- Registrar signos vitales básicos (también en estado `DRAFT`)
- Leer historial de consultas ya firmadas

> **Estado `DRAFT`:** la información existe en base de datos pero el campo `estado` = `'borrador'` y `firmadoPor` = `null`. No aparece en reportes oficiales ni en el expediente imprimible hasta que el doctor la aprueba.

#### No puede
- **Publicar / oficializar** ningún registro clínico de forma directa *(la transición de `DRAFT` → `OFICIAL` requiere la firma/aprobación del doctor — NOM-004 Art. 5.10)*
- **Crear, modificar ni eliminar** registros ya en estado `OFICIAL` *(NOM-013 + NOM-024 trazabilidad)*
- **Crear diagnósticos ni planes de tratamiento** de forma autónoma *(NOM-013: exclusividad del dentista)*
- Crear nuevos expedientes de pacientes
- Acceder a información financiera *(LFPDPPP Art. 6: proporcionalidad)*
- Ver expedientes de pacientes no asignados al doctor que asiste *(NOM-004 Art. 5.7: confidencialidad)*
- Ver más datos personales del paciente que los estrictamente necesarios para su función *(LFPDPPP Art. 6)*
- Ver bitácoras de auditoría

---

### `recepcionista`

Personal administrativo que gestiona la agenda y la caja de la clínica.

#### Puede hacer
- Leer **datos básicos** del paciente: nombre, teléfono, correo, dirección, fecha de nacimiento, próximas citas
- Crear pacientes (ficha básica de identificación, **sin** historia clínica)
- Actualizar datos de contacto del paciente
- Gestionar citas: crear, modificar, cancelar
- Operar la caja: registrar pagos, generar recibos, ver balance
- Ver estadísticas administrativas (número de citas, ingresos)

#### No puede
- **Leer el expediente clínico**: historia clínica, odontograma, periodontograma, notas médicas, exámenes *(NOM-004 Art. 5.7: la información médica es confidencial; el recepcionista no tiene necesidad clínica de conocerla)*
- Ver diagnósticos ni planes de tratamiento *(datos sensibles de salud — LFPDPPP Art. 9)*
- Crear ni modificar usuarios
- Acceder a las bitácoras de auditoría
- Modificar o eliminar registros clínicos *(NOM-004 Art. 5.3 + NOM-024)*

---

## 3. Matriz de Permisos por Recurso

| Recurso | `superadmin` | `administrador` | `doctor` | `asistente` | `recepcionista` |
|---|---|---|---|---|---|
| **Pacientes — datos básicos** | C R U D‡ | C R U D* | C R U | R | C R U |
| **Pacientes — historia clínica** | R | R | C R U | R | ✗ |
| **Odontograma** | R | R | C R U (oficial) + Aprobar | C R U (solo borrador) | ✗ |
| **Periodontograma** | R | R | C R U (oficial) + Aprobar | C R U (solo borrador) | ✗ |
| **Consultas / Notas de evolución** | R | R | C R U (oficial) + Aprobar | C R (solo borrador)† | ✗ |
| **Exámenes clínicos** | R | R | C R U | R | ✗ |
| **Citas** | C R U D | C R U D | C R U | R | C R U D |
| **Caja / Movimientos** | C R U D | C R U D | ✗ | ✗ | C R U |
| **Estadísticas** | R (todas) | R (todas) | R (propias) | ✗ | R (admin.) |
| **Usuarios del sistema** | C R U D | C R U D | ✗ | ✗ | ✗ |
| **Auditoría / Logs** | R (completo) | R (clínica) | ✗ | ✗ | ✗ |
| **Config. técnica / Migraciones** | C R U D | ✗ | ✗ | ✗ | ✗ |

> **Leyenda:** C = Crear · R = Leer · U = Actualizar · D = Desactivar (soft-delete)  
> `‡` El `superadmin` no puede eliminar físicamente expedientes ni logs — solo operar a nivel técnico de sistema.  
> `*` El `administrador` no puede eliminar físicamente expedientes, solo archivar.  
> `†` El asistente escribe **exclusivamente en estado `DRAFT`**; el doctor es quien transiciona a `OFICIAL` mediante firma. Ver §4 — Flujo de Delegación Controlada.

---

## 4. Principios Transversales de Diseño

Derivados directamente de las normas:

### 1. Trazabilidad Total (NOM-024)
Toda operación de escritura debe registrar `userId`, `timestamp` ISO 8601 y tipo de acción. Sin excepción.

### 2. Inmutabilidad de Registros Firmados (NOM-004 Art. 5.10 + NOM-024)
Los registros clínicos firmados **no se pueden modificar ni eliminar físicamente**.  
Flujo de corrección permitido:  
`registro original (intacto) → nota de addendum (nueva entrada) { motivo, userId, timestamp, ref: originalId }`

### 3. Mínimo Privilegio (LFPDPPP Art. 6 — Proporcionalidad)
Cada rol solo accede a los datos y operaciones estrictamente necesarios para el ejercicio de su función. Un recepcionista no necesita ver diagnósticos; un asistente no necesita ver movimientos de caja.

### 4. Responsabilidad Nominal (NOM-004 Art. 5.10)
Toda nota debe quedar vinculada al nombre completo, cédula profesional y firma digital del responsable.  
Implicación técnica: el campo `creadoPor` / `firmadoPor` no puede ser nulo en registros clínicos.

### 5. Datos Sensibles (LFPDPPP Art. 9)
Los datos de salud (diagnósticos, tratamientos, odontograma, notas clínicas) son **datos sensibles** bajo la ley. Su acceso está restringido al personal clínico con necesidad justificada y requieren consentimiento informado documentado del paciente.

### 6. Segregación Clínico / Administrativo
Los roles administrativos (`recepcionista`) tienen **acceso cero** al contenido clínico. La barrera no es configurable por el usuario.

### 7. Flujo de Delegación Controlada — Estado de Borrador (NOM-013 + NOM-004 Art. 5.10)

Reconoce la realidad clínica: el doctor tiene las manos ocupadas durante el procedimiento. La solución técnico-legal es el estado `DRAFT`:

```
[Asistente captura] → estado: DRAFT, creadoPor: assistantId, firmadoPor: null
         ↓  (doctor revisa en pantalla al terminar)
[Doctor aprueba]   → estado: OFICIAL, firmadoPor: doctorId, firmadoEn: timestamp
```

**Garantías legales del flujo:**
- La responsabilidad clínica y legal recae **exclusivamente** en el doctor (NOM-013).
- El log de auditoría registra ambos actores: `creadoPor: [ID_Asistente]` + `autorizadoPor: [ID_Doctor]` (NOM-024 trazabilidad).
- Un borrador **nunca aparece** en el expediente oficial imprimible ni en reportes hasta que el doctor lo firma.
- El doctor puede **editar el borrador antes de firmarlo** — si la asistente capturó algo incorrecto.
- Una vez firmado, el registro es inmutable; cualquier corrección posterior genera un addendum.

**Mecanismo de firma rápida (UI):**
- Botón `"Aprobar y Firmar"` que solicita un **PIN numérico corto** del doctor (no contraseña completa).
- El PIN se valida contra el hash almacenado del doctor; si es correcto, el sistema firma todos los borradores pendientes de esa consulta en un solo paso.
- El evento queda en el log: `tipo: 'firma_consulta'`, `doctorId`, `asistenteCapturaId`, `registrosAprobados: [...]`, `timestamp`.

**Estados posibles de un registro clínico:**

| Estado | Descripción | Visible en expediente oficial |
|---|---|---|
| `DRAFT` | Capturado por asistente, pendiente de firma | No |
| `OFICIAL` | Aprobado y firmado por el doctor | Sí |
| `ARCHIVADO` | Soft-deleted con justificación | Solo para `administrador` / `superadmin` |

### 8. Soft-Delete Obligatorio (NOM-004 Art. 5.4)
Ningún rol puede ejecutar un `DELETE` físico sobre expedientes ni notas. Los modelos deben incluir:
```js
deletedAt: Date,
deletedBy: ObjectId, // ref: User
deleteReason: String
```
Registros con `deletedAt != null` son accesibles solo por el `administrador` en modo de solo lectura.

---

## 5. Auditoría y Registro de Eventos

### Eventos que deben loggear obligatoriamente (NOM-024)

| Evento | Datos a registrar |
|---|---|
| Login exitoso | `userId`, `timestamp`, `ip` |
| Login fallido | `userName`, `timestamp`, `ip`, `motivo` |
| Logout | `userId`, `timestamp` |
| Acceso a expediente | `userId`, `patientId`, `timestamp` |
| Creación de registro | `userId`, `resourceType`, `resourceId`, `timestamp` |
| Modificación de registro | `userId`, `resourceType`, `resourceId`, `campos`, `timestamp` |
| Addendum / corrección | `userId`, `resourceId`, `motivoCorrección`, `timestamp` |
| **Borrador creado** | `assistantId`, `resourceType`, `resourceId`, `patientId`, `timestamp` |
| **Borrador aprobado / firmado** | `doctorId`, `assistantId`, `resourceType`, `resourceId`, `timestamp` |
| **Borrador rechazado / editado antes de firma** | `doctorId`, `resourceId`, `camposEditados`, `timestamp` |
| Exportación / impresión | `userId`, `patientId`, `timestamp` |
| Soft-delete | `userId`, `resourceType`, `resourceId`, `motivo`, `timestamp` |
| Cambio de contraseña | `userId`, `timestamp` |
| Creación/modificación de usuario | `adminUserId`, `targetUserId`, `timestamp` |
| **Pantalla bloqueada** | `userId`, `trigger (auto\|manual)`, `timestamp` |
| **Pantalla desbloqueada** | `userId`, `timestamp` |
| **Firma en lote (batch)** | `doctorId`, `registrosAprobados: [ids]`, `totalRegistros`, `timestamp` |
| **Plantilla de evolución usada** | `userId`, `templateId`, `templateNombre`, `patientId`, `timestamp` |
| **Captura extemporánea** | `userId`, `resourceId`, `fechaNota`, `fechaServidor`, `motivo`, `timestamp` |

### Quién puede ver los logs
Solo el rol `administrador`. Los logs son de solo lectura desde la interfaz — no modificables.

### Tiempo de retención de logs
**Mínimo 5 años**, en concordancia con el plazo de conservación del expediente clínico (NOM-004 Art. 5.4).

---

## 6. Derechos ARCO del Paciente (LFPDPPP Arts. 22–36)

El sistema debe proveer mecanismos documentados para que el paciente pueda ejercer sus derechos:

| Derecho | Descripción | Canal en DentiaCore |
|---|---|---|
| **Acceso** | Solicitar copia de sus datos | El doctor/administrador genera un resumen del expediente a solicitud escrita |
| **Rectificación** | Corregir datos inexactos | Solo mediante addendum; el registro original se conserva intacto |
| **Cancelación** | Solicitar que sus datos no sean usados para fines secundarios | Se registra en campo `datosNoCompartir: Boolean`; no implica borrado del expediente |
| **Oposición** | Oponerse al tratamiento de sus datos para fines específicos | Requiere proceso formal; se documenta en el expediente |

> **Importante:** La cancelación de datos de salud **no implica la eliminación del expediente clínico**. La NOM-004 Art. 5.4 establece que los expedientes son propiedad del prestador de servicios y deben conservarse 5 años. El derecho de cancelación aplica a fines secundarios (marketing, investigación, estadística comercial), no al expediente clínico en sí.

---

## 7. Implicaciones de Implementación en DentiaCore

### Archivos en scope

| Archivo | Cambio necesario |
|---|---|
| `Server/utils/permissions.js` | Actualizar `ROLE_PERMISSIONS` según la matriz del §3; agregar permisos de auditoría |
| `Server/middlewares/authorize.js` | Sin cambios de lógica; verificar que la normalización de roles sea case-insensitive |
| `Server/models/*.js` | Agregar campos de auditoría y estado de borrador: `estado` (enum: `DRAFT`\|`OFICIAL`\|`ARCHIVADO`), `creadoPor`, `modificadoPor`, `modificadoEn`, `firmadoPor`, `firmadoEn`, `autorizadoPor`, `deletedAt`, `deletedBy`, `deleteReason` en todos los modelos clínicos |
| `Server/models/user.js` | Agregar `pinHash: String` y `pinSalt: String` — hash bcrypt del PIN de 4 dígitos requerido para **todos los roles** (desbloqueo Modo Cortina + firma digital del doctor) |
| `Server/controllers/*` | Inyectar `req.user._id` en operaciones de escritura para alimentar los campos de auditoría |
| Nuevo: `Server/models/auditLog.js` | Modelo de log de auditoría con los campos del §5 |
| Nuevo: `Server/middlewares/auditLogger.js` | Middleware que registra automáticamente las operaciones en la colección `auditLogs` |
| Nuevo: `Server/models/noteTemplate.js` | Colección de plantillas de evolución por tipo de procedimiento (§9.2) |

### Cambios en `permissions.js` (propuesta)

```js
const ROLE_PERMISSIONS = {
  superadmin: ['*', 'system.*', 'audit.read.full', 'maintenance.*'], // solo para el programador
  administrador: ['*'],  // todos los permisos de clínica — sin acceso a system.* ni maintenance.*
  doctor: [
    'patients.read', 'patients.create', 'patients.update',
    'odontogram.read', 'odontogram.create', 'odontogram.update',
    'periodontogram.read', 'periodontogram.create', 'periodontogram.update',
    'consultas.read', 'consultas.create', 'consultas.update',
    'exams.read', 'exams.create', 'exams.update',
    'appointments.read', 'appointments.create', 'appointments.update',
    'stats.read.own',
    'drafts.batch_sign',        // firmar/aprobar borradores en lote (Centro de Firmas Pendientes)
    'notes.create.backdated',   // captura extemporánea — requiere motivo (trazabilidad NOM-004)
    'notes.template.use',       // uso de plantillas de evolución Anti-Olvidos
    'session.lock',             // bloqueo manual de pantalla (Modo Cortina)
  ],
  asistente: [
    'patients.read',
    'odontogram.read',
    'odontogram.write.draft',        // captura en borrador durante procedimiento
    'periodontogram.read',
    'periodontogram.write.draft',    // captura en borrador durante procedimiento
    'consultas.read',
    'consultas.create.draft',        // redacción de nota — pendiente de firma del doctor
    'consultas.update.draft',        // edición de borrador propio antes de que el doctor firme
    'appointments.read',
    'notes.template.use',            // uso de plantillas de evolución Anti-Olvidos
    'session.lock',                  // bloqueo manual de pantalla (Modo Cortina)
  ],
  // Permiso exclusivo del doctor para aprobar borradores:
  // 'draft.approve' — transiciona DRAFT → OFICIAL con firma
  recepcionista: [
    'patients.read.basic',   // solo datos de contacto, NO expediente clínico
    'patients.create.basic',
    'patients.update.basic',
    'appointments.read', 'appointments.create', 'appointments.update', 'appointments.delete',
    'cash.read', 'cash.manage',
    'stats.read.admin',
    'session.lock',                  // bloqueo manual de pantalla (Modo Cortina)
  ],
};
```

### Regla de negocio crítica: distinción `patients.read` vs `patients.read.basic`

El middleware de autorización debe diferenciar entre:
- `patients.read` — acceso completo al expediente incluyendo historia clínica, odontograma y notas
- `patients.read.basic` — acceso solo a datos de contacto e identificación (nombre, teléfono, dirección, citas)

Esta distinción es el punto de implementación que garantiza la segregación clínico/administrativo exigida por NOM-004 Art. 5.7 y LFPDPPP Art. 9.

---

## 8. Checklist de Cumplimiento Normativo

Basado en el Apéndice A (MECIC) de la NOM-004-SSA3-2012:

- [ ] El rol `superadmin` solo existe como herramienta de mantenimiento; está desactivado por defecto en producción
- [ ] Toda operación del `superadmin` genera log de auditoría con campo `motivo` obligatorio
- [ ] Ningún usuario de la clínica tiene asignado el rol `superadmin`
- [ ] Toda nota clínica tiene `fecha`, `hora`, `nombre del responsable` y `firma digital`
- [ ] Ningún registro clínico se puede eliminar físicamente
- [ ] Las correcciones a registros firmados generan addendum, no sobrescritura
- [ ] El log de auditoría existe, es inalterable y cubre todos los eventos del §5
- [ ] El flujo de delegación controlada está implementado: la asistente solo escribe en `DRAFT`; el doctor firma para oficializar
- [ ] Los borradores no aparecen en el expediente oficial imprimible hasta ser firmados
- [ ] El log de auditoría registra `creadoPor` (asistente) y `autorizadoPor` (doctor) como campos separados en los registros firmados
- [ ] El mecanismo de firma rápida (PIN) está implementado y el PIN se almacena como hash (nunca en texto plano)
- [ ] El rol `recepcionista` no tiene acceso de escritura a registros clínicos ni en estado `DRAFT`
- [ ] Los datos de salud (datos sensibles) solo son accesibles por roles clínicos con necesidad justificada
- [ ] El sistema guarda consentimiento informado del paciente vinculado a su expediente
- [ ] Los logs se conservan mínimo 5 años
- [ ] Existe un mecanismo documentado para ejercer los derechos ARCO del paciente
- [ ] Cada operación de escritura queda vinculada al `userId` del actor
- [ ] **Todos** los usuarios tienen un PIN de 4 dígitos almacenado como `pinHash` (bcrypt) — nunca en texto plano
- [ ] El Modo Cortina se activa automáticamente tras el tiempo de inactividad configurado (default 2–3 min) y también con el botón manual `🔒 Bloquear`
- [ ] El desbloqueo de pantalla requiere únicamente el PIN (no credenciales completas); 5 intentos fallidos cierran la sesión
- [ ] Los eventos de bloqueo y desbloqueo de pantalla quedan registrados en el log de auditoría con `trigger (auto|manual)`
- [ ] El Centro de Firmas Pendientes muestra alerta en el dashboard cuando existen borradores (`DRAFT`) sin firmar asignados al doctor
- [ ] La firma en lote (batch) estampa `firmadoPor` y `firmadoEn` en cada registro individualmente en la BD; el evento de auditoría incluye `registrosAprobados: [ids]`
- [ ] Las plantillas de evolución cubren la estructura mínima de la NOM-004: signos vitales, interrogatorio, exploración física, diagnóstico, tratamiento y pronóstico
- [ ] El editor de nota valida que todos los campos obligatorios de la plantilla tengan contenido antes de permitir guardar el borrador
- [ ] El menú de Captura Extemporánea es **obligatorio** (no omitible) cuando `fechaNota` difiere del `fechaServidor` en más de ±6 horas
- [ ] El motivo de captura extemporánea se almacena en el documento clínico Y en el log de auditoría
- [ ] Existe la colección `noteTemplates` con al menos las plantillas base: Extracción, Endodoncia, Limpieza, Consulta General, Urgencia

---

## 9. Funcionalidades de Cumplimiento Operativo

Estas cuatro funcionalidades son requerimientos de producto derivados de las obligaciones normativas y no son opcionales. Cada una tiene su base legal explícita.

---

### 9.1 PIN Universal — Requisito Transversal

**Todos los usuarios del sistema, sin excepción de rol, deben tener un PIN de 4 dígitos.**

| Uso | Rol(es) | Descripción |
|---|---|---|
| Desbloqueo de pantalla (Modo Cortina) | Todos | El PIN desbloquea la sesión sin requerir credenciales completas |
| Firma digital de registros | `doctor` | El doctor ingresa su PIN para transicionar `DRAFT → OFICIAL` y para firma en lote |
| Aprobación de acciones críticas | `administrador`, `superadmin` | Confirmación de acciones irreversibles (eliminaciones lógicas, cambios de rol) |

**Almacenamiento en User model:**
```js
pinHash: { type: String, required: true },  // bcrypt hash del PIN — NUNCA texto plano
pinSalt: { type: String, required: true },  // salt generado en bcrypt.genSalt(12)
```

> **Seguridad:** El PIN nunca viaja en texto plano. En el front-end se envía por HTTPS. El endpoint de verificación de PIN solo retorna `{ valid: true|false }` — no expone el hash.

---

### 9.2 Plantillas de Evolución "Anti-Olvidos" (NOM-004 Arts. 7.1–7.5)

**Base legal:** NOM-004-SSA3-2012 Art. 7.1 — La nota de evolución debe contener como mínimo: signos vitales, interrogatorio, exploración, diagnóstico, tratamiento y pronóstico.

**Problema que resuelve:** Sin guía, los campos se omiten bajo presión clínica. La omisión de cualquier campo mínimo es infracción a la NOM-004.

**Comportamiento:**
1. El usuario (doctor o asistente) selecciona el tipo de procedimiento al crear la nota (ej. "Extracción Simple", "Endodoncia", "Limpieza Dental").
2. El sistema precarga en el editor de texto enriquecido un esqueleto estructurado:
   ```
   SIGNOS VITALES: TA ___ / ___ mmHg | FC ___ lpm | T° ___ °C
   INTERROGATORIO: ___
   EXPLORACIÓN FÍSICA: ___
   DIAGNÓSTICO: ___
   TRATAMIENTO REALIZADO: ___
   PRONÓSTICO: ___
   INDICACIONES AL PACIENTE: ___
   ```
3. El usuario rellena los blancos o selecciona opciones de un dropdown contextual por campo.
4. El sistema valida que todos los campos obligatorios tengan contenido antes de permitir guardar el borrador.

**Permisos:** `notes.template.use` — asignado a `doctor` y `asistente`.

**Modelos afectados:**
- Nuevo: `Server/models/noteTemplate.js` — colección de plantillas por tipo de procedimiento
- `Server/models/consulta.js` — campo `templateId: ObjectId` (referencia a la plantilla usada, para trazabilidad)

---

### 9.3 Modo Cortina — Bloqueo Rápido de Pantalla (LFPDPPP Art. 19 / NOM-024)

**Base legal:** LFPDPPP Art. 19 — El responsable del tratamiento debe implementar medidas de seguridad administrativas, físicas y **técnicas** para proteger los datos personales. La pantalla desbloqueada con expediente visible es un vector de exposición técnico.

**Comportamiento:**
1. **Bloqueo automático:** Tras 2–3 minutos de inactividad (configurable por el administrador), la interfaz muestra una capa de desenfoque que cubre todo el contenido clínico. La sesión **no se cierra** — el estado de la pantalla (formulario abierto, tab activo) se preserva.
2. **Bloqueo manual:** Botón visible en la barra de navegación: `🔒 Bloquear`. Útil al salir momentáneamente del escritorio.
3. **Desbloqueo:** El usuario ingresa su PIN de 4 dígitos. Si el PIN es incorrecto 5 veces consecutivas, la sesión se cierra y se requiere login completo.
4. **Registro en auditoría:** Todo bloqueo y desbloqueo genera un evento en la colección `auditLogs` con `userId`, `trigger (auto|manual)` y `timestamp`.

**Permiso:** `session.lock` — asignado a todos los roles.

**Implementación front-end sugerida:**
- Listener global `mousemove` / `keydown` que resetea un timer en `localStorage`.
- Worker thread o `setInterval` en el layout principal comprueba inactividad cada 30 s.
- El estado de bloqueo se persiste en `sessionStorage` — si el usuario recarga, requiere PIN aunque la sesión JWT siga válida.

---

### 9.4 Centro de Firmas Pendientes — Batch Signing (NOM-024 Art. 12)

**Base legal:** NOM-024-SSA3-2012 Art. 12 — Todo registro electrónico debe estar firmado por el profesionista responsable. Un registro no firmado al final de la jornada es un incumplimiento.

**Problema que resuelve:** El doctor puede terminar la jornada sin haber firmado borradores capturados por la asistente durante los procedimientos.

**Comportamiento:**
1. **Alerta en dashboard:** Mientras existan registros en estado `DRAFT` asignados al doctor, aparece un banner de alerta: `"Tienes X notas en borrador esperando tu firma"`.
2. **Vista de Firmas Pendientes:** Botón `"Ver y Firmar"` lleva a una vista de tarjetas — una por borrador — con resumen del paciente, tipo de nota y fecha.
3. **Revisión en secuencia:** El doctor puede revisar cada borrador individualmente, editar si es necesario y firmarlo uno a uno.
4. **Firma en lote:** Botón `"Firmar Todas"` + modal de confirmación + entrada de PIN → el sistema itera sobre todos los borradores y:
   - Registra `firmadoPor: doctorId`, `firmadoEn: new Date()` en cada documento.
   - Transiciona el `estado: "DRAFT" → "OFICIAL"` en cada documento.
   - Genera un **único evento de auditoría de tipo batch** con `registrosAprobados: [id1, id2, ...]` y `totalRegistros`.
5. Los registros firmados pasan a ser parte del expediente oficial imprimible.

**Permiso:** `drafts.batch_sign` — exclusivo de `doctor`.

**Endpoint propuesto:** `POST /api/drafts/batch-sign` — body: `{ draftIds: [...], pin: '****' }`.

---

### 9.5 Menú de Captura Extemporánea (NOM-004 + NOM-024 — Trazabilidad)

**Base legal:** NOM-004-SSA3-2012 — El expediente clínico debe reflejar la cronología real de los eventos. NOM-024 — Los SIRES deben garantizar la integridad y el no repudio de los registros.

**Problema que resuelve:** A veces una nota debe registrarse con fecha diferente a la del servidor (falla de sistema, emergencia, nota de hospital). Sin mecanismo de justificación, el COFEPRIS auditor ve una inconsistencia de fechas sin explicación.

**Comportamiento:**
1. **Detección automática:** Al guardar (borrador u oficial), el sistema compara `fechaNota` (campo que el usuario ingresa) con `Date.now()` en el servidor.
2. **Si `fechaNota` ≠ `fechaServidor` (con tolerancia de ±6 horas):** Aparece un modal obligatorio antes de confirmar el guardado:
   ```
   ⚠️ Estás registrando una nota con fecha pasada.
   Fecha de la nota:    [YYYY-MM-DD]
   Fecha del servidor:  [YYYY-MM-DD]

   Motivo (obligatorio):
   ◉ Falla de sistema
   ○ Falla eléctrica
   ○ Emergencia médica — nota retroactiva
   ○ Error de captura corregido
   ○ Otro: ________________

   [Cancelar]  [Confirmar y Guardar]
   ```
3. El campo `motivo` es obligatorio — no se puede guardar sin seleccionarlo.
4. El motivo se almacena en el campo `capturaExtemporaneaMotivo: String` del documento y en el evento de auditoría `captura_extemporanea`.
5. **No bloquea la operación** — el médico puede registrar con fecha pasada siempre que justifique. Esto es correcto y conforme a la norma.

**Permiso:** Todo rol con permiso de escritura puede usar captura extemporánea. El doctor además tiene `notes.create.backdated` para notas retroactivas de procedimientos pasados.

**Campo en modelos clínicos:**
```js
capturaExtemporanea: {
  esExtemporanea: Boolean,
  motivo: String,
  fechaNota: Date,
  fechaCaptura: Date,  // timestamp real del servidor
}
```

---

## Notas sobre las Normas Citadas

- **NOM-004-SSA3-2012**: Texto oficial obtenido directamente del DOF (código 5272787, 15/10/2012). Reemplaza a la NOM-168-SSA1-1998.
- **NOM-024-SSA3-2012**: Publicada en el DOF el 30/11/2012. Establece los requisitos mínimos que deben cumplir los Sistemas de Información de Registro Electrónico para la Salud (SIRES).
- **NOM-013-SSA1-2015**: Vigente (reemplaza a la NOM-013-SSA2-2006 referenciada en la NOM-004). Para la Prevención y Control de Enfermedades Bucales.
- **LFPDPPP**: La ley fue abrogada y sustituida por la nueva **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** (DOF 20/03/2025, última reforma 14/11/2025). Los principios nucleares (mínimo privilegio, proporcionalidad, datos sensibles, derechos ARCO) se mantienen y refuerzan en la nueva versión.
