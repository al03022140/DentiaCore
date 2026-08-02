# Estrategia de Migración — DentiaCore

**Fecha:** 2 de junio de 2026
**Objetivo:** unificar el proyecto al estándar (`01-estandares-tecnicos.md`) **sin romper funcionalidad ni datos existentes**, con cambios reversibles y desplegables por fases.

> **Contexto crítico:** la app se instala por clínica (launcher, install.sh/ps1, pm2). **No hay una base de datos central**: cada clínica tiene la suya, con datos reales de pacientes (PHI). Por eso toda migración de datos debe ser idempotente, versionada y ejecutable en cada instalación al actualizar.

---

## 1. Principios de la migración

1. **Nunca un "big-bang".** Se renombra detrás de capas de compatibilidad; lo viejo sigue funcionando hasta que lo nuevo está probado en todas partes.
2. **Doble lectura, escritura nueva.** Durante la transición, el código **lee** ambos formatos (viejo y nuevo) y **escribe** solo el nuevo. Cuando ya no quedan datos viejos, se retira la lectura dual.
3. **Idempotencia.** Cada migración de datos puede correrse varias veces sin daño (clave para instalaciones que actualizan en momentos distintos).
4. **Reversibilidad.** Cada fase tiene un plan de rollback antes de ejecutarse.
5. **Lo nuevo nace limpio.** Mientras se migra lo viejo, **todo código nuevo cumple el estándar** (lo fuerza el linter de Fase 0).
6. **Una fase, un tipo de cambio.** No mezclar rename de enums con rename de archivos en el mismo PR.

---

## 2. Orden de fases y dependencias

```
Fase 0  Fundaciones (linters, constants, CI)        ── sin cambio de comportamiento
   │
   ├─ Fase 1  Enums (un concepto, un valor)          ◄── mayor riesgo de datos; primero
   │
   ├─ Fase 2  Contrato de respuesta de API           ◄── desbloquea limpieza del frontend
   │
   ├─ Fase 3  Campos de modelos (alias Mongoose)
   │             │
   │             └─ Fase 4  Migración de datos en BD + framework de migraciones
   │
   ├─ Fase 5  Frontend (contexts, services, componentes, consultas→appointments)
   │
   ├─ Fase 6  Rutas y permisos (alias de ruta)
   │
   └─ Fase 7  Retiro de capas de compatibilidad      ◄── solo cuando todo lo anterior está estable
```

Las fases 1–6 pueden solaparse parcialmente entre módulos, pero **dentro de un módulo** se respeta el orden. La Fase 7 es la última, siempre.

> ⚠️ **Antes de ejecutar las Fases 1, 3 y 4, lee la §14 "Trampas de Mongoose en este repo".** No son teóricas: tu código las dispara (44 usos de `.lean()`, queries y aggregations por campos físicos, y documentos legacy de periodontogram con estado inconsistente). Ignorarlas produce consultas que devuelven vacío en silencio o expedientes clínicos mal marcados.

---

## 3. Fase 0 — Fundaciones (sin cambio de comportamiento)

**Objetivo.** Dejar listas las herramientas que hacen el resto seguro. No cambia comportamiento ni datos.

**Pasos.**

1. Crear `Server/constants/enums.js` con los enums canónicos (§3 del estándar). Aún no se conectan a los modelos.
2. Configurar **ESLint** con reglas de naming que fuercen el estándar en **archivos nuevos/tocados**:
   - `camelcase` para variables y propiedades.
   - `id-match` o regla custom que rechace identificadores con tokens en español (lista negra: `fecha`, `nombre`, `apellido`, `motivo`, `duracion`, `creado`, `modificado`, `firma`, `contraseña`, etc.).
   - Convención de nombre de archivo (plugin `eslint-plugin-filenames` o `unicorn/filename-case`): PascalCase para `.jsx`, kebab-case para servicios/utils.
3. Añadir el **checklist de PR** (`01 §14`) como plantilla de pull request en `.github/`.
4. CI: que el lint falle el build ante violaciones nuevas (no sobre lo legacy todavía — usar `eslint --no-error-on-unmatched-pattern` acotado a rutas nuevas o `overrides`).

**Verificación.** El repo compila y los tests pasan igual que antes; un PR de prueba con `const fechaHora` es rechazado por CI.

**Rollback.** Trivial: revertir configuración de lint. No tocó runtime.

---

## 4. Fase 1 — Enums (🔴 prioridad máxima)

**Objetivo.** Un concepto, un enum, un campo de estado por documento. Es el cambio de mayor riesgo de datos, por eso va primero y con la mayor red de seguridad.

**Técnica sin romper: normalización en lectura/escritura.**

1. Definir tablas de mapeo viejo→nuevo en `constants/enum-migrations.js`:

```js
const STATUS_MAP = {
  // documento
  'BORRADOR':'DRAFT', 'OFICIAL':'OFFICIAL', 'ARCHIVADO':'ARCHIVED',
  'draft':'DRAFT', 'completed':'OFFICIAL', 'reviewed':'OFFICIAL', 'archived':'ARCHIVED',
};
const APPOINTMENT_MAP = {
  'Pendiente':'PENDING','Confirmada':'CONFIRMED','EnCurso':'IN_PROGRESS',
  'Pasada':'COMPLETED','NoShow':'NO_SHOW','Cancelada':'CANCELLED',
};
```

2. Añadir a los esquemas un **setter/getter** que normalice al leer y escribir, de modo que el código nuevo siempre vea el valor canónico aunque la BD aún tenga el viejo:

```js
status: {
  type: String,
  set: v => STATUS_MAP[v] || v,          // escribe canónico
  get: v => STATUS_MAP[v] || v,          // lee canónico aunque el dato sea viejo
}
```

3. Ampliar temporalmente el `enum` para aceptar viejos **y** nuevos valores, evitando errores de validación con datos existentes. Restringir al set canónico recién en Fase 7.
4. **Unificar el doble estado de `periodontogram`:** elegir `status` como único campo. Mantener `estadoRegistro` como **virtual** que lee de `status` (compatibilidad de lectura) y dejar de escribirlo.

```js
PeriodontogramSchema.virtual('estadoRegistro').get(function(){ return this.status; });
```

5. Migrar los datos en BD a valores canónicos (ver Fase 4 para el runner): `UPDATE` idempotente que aplica `STATUS_MAP`.

**Verificación.** Tests de modelo que: (a) leer un doc con valor viejo devuelve el canónico; (b) guardar acepta ambos y persiste el canónico; (c) periodontogram expone `estadoRegistro === status`. Smoke test de la UI de citas/periodontograma.

**Rollback.** Quitar los `set/get` y el virtual; los datos siguen legibles porque el `enum` ampliado aún acepta los viejos. Sin pérdida de datos.

---

## 5. Fase 2 — Contrato de respuesta de API (🔴)

**Objetivo.** Toda respuesta usa el sobre `{ success, data, message?, error? }` sin romper a los clientes que esperan la forma vieja.

**Técnica sin romper.**

1. Crear un helper de respuesta en backend:

```js
// utils/respond.js
const ok   = (res, data, message) => res.json({ success:true, data, ...(message && { message }) });
const fail = (res, status, code, message) => res.status(status).json({ success:false, error:{ code, message } });
```

2. Crear en el frontend un **interceptor de Axios** que entienda **ambas formas** (vieja y nueva) y entregue siempre `data` normalizado al resto de la app. Así se puede migrar endpoint por endpoint sin tocar todos los componentes a la vez:

```js
// axios-instance.js — response interceptor
const body = response.data;
const normalized = (body && typeof body === 'object' && 'success' in body)
  ? (body.success ? body.data : Promise.reject(body.error))   // forma nueva
  : body;                                                      // forma vieja (crudo)
```

3. Migrar los controladores a `ok()/fail()` **uno por uno**, empezando por los que devuelven datos crudos (`statsController`).

**Verificación.** Suite de tests de API que valida la forma del sobre por endpoint migrado; el frontend sigue funcionando con endpoints aún no migrados gracias al interceptor.

**Rollback.** Por endpoint: revertir ese controlador a su forma previa; el interceptor tolera ambas.

---

## 6. Fase 3 — Campos de modelos (🟠)

**Objetivo.** Renombrar campos español `snake_case` → inglés `camelCase` sin romper lecturas existentes.

**Técnica sin romper: alias de Mongoose.** Mongoose permite exponer un campo con nombre nuevo mientras la BD guarda el viejo, o viceversa, vía `alias`:

```js
// El documento en BD sigue con apellido_paterno; el código usa lastNamePaternal
lastNamePaternal: { type:String, alias:'apellido_paterno' }
```

**Pasos.**

1. Para cada campo a renombrar, añadir el campo nuevo con `alias` apuntando al físico viejo (lectura/escritura transparente).
2. Actualizar el código de la app para usar **solo** el nombre nuevo.
3. Cuando todo el código usa el nombre nuevo, programar la migración física del dato (Fase 4) y luego invertir: el nombre físico pasa a ser el nuevo y se elimina el alias (Fase 7).
4. Unificar campos de auditoría: `creadoPor`→`createdBy`, `modificadoPor`→`updatedBy` con el mismo patrón de alias.

**Verificación.** Tests que escriben con nombre nuevo y leen el documento crudo para confirmar persistencia; lectura de documentos viejos devuelve el campo nuevo poblado.

**Rollback.** Quitar los campos nuevos/alias; el código vuelve a los nombres viejos. La BD no cambió todavía (el cambio físico es Fase 4).

---

## 7. Fase 4 — Migración de datos en BD + framework de migraciones (🟠)

**Objetivo.** Mover los datos al formato canónico en **cada instalación de clínica**, de forma versionada e idempotente.

**Técnica.**

1. Crear `Server/migrations/` con runner versionado. Cada migración:

```js
// Server/migrations/0001-normalize-status-values.js
module.exports = {
  id: '0001-normalize-status-values',
  async up(db) {
    // idempotente: solo toca docs con valores viejos
    await db.collection('periodontograms').updateMany(
      { estadoRegistro: { $in:['BORRADOR','OFICIAL','ARCHIVADO'] } },
      [{ $set:{ status:{ $switch:{ branches:[
        { case:{ $eq:['$estadoRegistro','BORRADOR'] }, then:'DRAFT' },
        { case:{ $eq:['$estadoRegistro','OFICIAL'] },  then:'OFFICIAL' },
        { case:{ $eq:['$estadoRegistro','ARCHIVADO'] },then:'ARCHIVED' },
      ], default:'$status' } } } }]
    );
  }
};
```

2. Registrar migraciones aplicadas en una colección `migrations` (`{ id, appliedAt }`) para no repetirlas.
3. **Enganchar el runner al arranque del servidor o al actualizador** (launcher/install): al actualizar una clínica, corre las migraciones pendientes antes de aceptar tráfico.
4. **Backup automático antes de migrar** (ya existe `npm run backup:db`; invocarlo desde el runner antes de aplicar).
5. Migrar también la colección outlier: `odontogramas` → `odontograms` (renombrar colección, idempotente con verificación de existencia).

**Verificación.** En una copia de datos real (o el backup de una clínica), correr el runner dos veces: la primera migra, la segunda no hace nada (idempotencia). Validar conteos antes/después.

**Rollback.** Restaurar el backup tomado en el paso 4. Como los `set/get`/alias de fases 1 y 3 siguen activos, una versión anterior del código aún lee los datos migrados.

---

## 8. Fase 5 — Frontend (🟠)

**Objetivo.** Unificar carpetas, servicios y componentes sin romper imports.

**Pasos (cada uno es un PR independiente y mecánico).**

1. **Contexts:** mover `shared/context/*` a `shared/contexts/`; dejar temporalmente un re-export en la ruta vieja (`export * from '../contexts/...'`) para no romper imports; actualizar imports con codemod; borrar el re-export y la carpeta vieja al final.
2. **Servicios a kebab-case:** renombrar `cashService.js`→`cash-service.js`, etc. Usar `git mv` y un re-export temporal del nombre viejo. Mover `features/odontogram/api/odontograma-service.js` → `shared/services/odontogram-service.js`.
3. **Componentes a PascalCase:** renombrar `add-patient.jsx`→`AddPatient.jsx`, `patient-detail.jsx`→`PatientDetail.jsx`, etc., con su CSS homónimo. **Cuidado en CI case-sensitive:** hacer el rename en dos commits si el sistema de archivos local es case-insensitive (macOS), o usar `git mv` con nombre intermedio.
4. **`consultas/` → `appointments/`** y `periodontograma-functions/` → `periodontogram-functions/`.
5. **Estado/props en español → inglés** dentro de componentes (`fechaHora`→`appointmentDateTime`), feature por feature, después de que el campo de BD correspondiente ya esté normalizado (Fase 3) para que coincidan.
6. Añadir barrel `index.js` a los features que no lo tienen.

**Técnica sin romper.** Re-exports temporales en las rutas viejas + codemods (`jscodeshift`) para actualizar imports en masa. Un PR por tipo de cambio.

**Verificación.** Build de Vite sin warnings de import; tests del cliente verdes; smoke test manual de cada feature renombrado.

**Rollback.** Por PR: revertir el rename; los re-exports temporales evitan romper otros módulos durante la ventana.

---

## 9. Fase 6 — Rutas y permisos (🟡)

**Objetivo.** Rutas en inglés/plural/kebab y permisos con un solo estilo, sin romper clientes ni romper el control de acceso.

**Pasos.**

1. **Rutas:** registrar la ruta nueva **y** mantener la vieja como alias que apunta al mismo handler durante la transición:

```js
router.use('/odontograms', odontogramRouter);
router.use('/odontograma', odontogramRouter);   // alias temporal (deprecado)
```

Actualizar el frontend (servicios) para usar la ruta nueva; retirar el alias en Fase 7.

2. **Permisos:** en `permissions.js`, hacer que la verificación acepte el alias viejo mapeado al nuevo durante la transición:

```js
const PERM_ALIASES = { 'read_periodontogram':'periodontogram.read', 'consultas.read':'appointments.read', /* ... */ };
const canonical = p => PERM_ALIASES[p] || p;
```

Migrar los permisos almacenados en usuarios/roles con una migración de datos (Fase 4) y retirar los alias en Fase 7. Unificar `draft.*`/`drafts.*` a un recurso (`drafts.*`).

**Verificación.** Tests de autorización con permisos viejos y nuevos; tests de ruta golpeando alias viejo y ruta nueva.

**Rollback.** Quitar rutas/permisos nuevos; los alias garantizan que lo viejo siga vigente.

---

## 10. Fase 7 — Retiro de capas de compatibilidad (última)

**Objetivo.** Eliminar la deuda temporal una vez que todo lo demás es estable y todas las clínicas están actualizadas.

**Precondición.** Telemetría/logs confirman que ya no se usan: valores de enum viejos, rutas alias, claves de respuesta viejas, nombres de campo viejos, permisos legacy. Idealmente, una o dos versiones liberadas sin incidentes.

**Pasos.**

1. Restringir los `enum` al set canónico (quitar los valores viejos aceptados en Fase 1).
2. Quitar `set/get` de normalización y los virtuals de compatibilidad.
3. Invertir alias de Mongoose: el nombre físico pasa a ser el inglés; eliminar `alias`.
4. Eliminar rutas alias, re-exports temporales del frontend, `PERM_ALIASES` y las tablas de mapeo de enums.
5. Eliminar middlewares/utils duplicados en español (`capturaExtemporanea.js`, `periodontograma.js`).
6. Endurecer ESLint: aplicar las reglas de naming a **todo** el repo (ya no solo a archivos nuevos).

**Verificación.** Suite completa verde; grep del repo sin tokens prohibidos (§13 del estándar); build de CI case-sensitive limpio.

**Rollback.** Esta fase se hace cuando el riesgo es mínimo; si algo falla, se revierte el PR puntual. Para entonces no debería quedar dependencia de lo viejo.

---

## 11. Herramientas recomendadas

| Herramienta | Para qué |
|-------------|----------|
| **ESLint** + `eslint-plugin-unicorn`, `eslint-plugin-filenames` | Forzar naming de identificadores y de archivos |
| Regla `id-denylist` / custom | Rechazar tokens en español en identificadores nuevos |
| **jscodeshift** (codemods) | Renombrar imports/identificadores en masa de forma segura |
| **Mongoose `alias` / virtuals / `get`/`set`** | Compatibilidad de campos y enums sin tocar datos de inmediato |
| Runner de **migraciones versionadas** (`migrate-mongo` o propio) | Migrar datos por instalación, idempotente |
| `npm run backup:db` (ya existe) | Backup previo a cada migración de datos |
| Interceptor de **Axios** | Tolerar dos formas de respuesta durante la Fase 2 |
| CI **case-sensitive** (Linux) | Detectar renames de archivo que rompen en producción |

---

## 12. Matriz de riesgo por fase

| Fase | Riesgo | Mitigación principal |
|------|--------|----------------------|
| 0 Fundaciones | ⚪ Muy bajo | Solo tooling; revertible |
| 1 Enums | 🔴 Alto (datos) | set/get + enum ampliado + migración idempotente + backup |
| 2 Contrato API | 🟠 Medio | Interceptor tolera ambas formas; endpoint por endpoint |
| 3 Campos modelo | 🟠 Medio | Alias Mongoose; sin tocar datos aún |
| 4 Datos BD | 🔴 Alto (PHI) | Backup obligatorio + idempotencia + correr en copia primero |
| 5 Frontend | 🟡 Medio | Re-exports temporales + codemods + un PR por tipo |
| 6 Rutas/permisos | 🟠 Medio | Alias de ruta y de permiso simultáneos |
| 7 Retiro | 🟡 Medio | Solo tras confirmar no-uso; PRs puntuales |

---

## 13. Checklist por fase (resumen operativo)

**Antes de empezar cualquier fase:**

- [ ] Rama dedicada y PR único por tipo de cambio.
- [ ] Tests existentes verdes en `main` antes de tocar.
- [ ] Plan de rollback escrito en el PR.

**Fases con datos (1, 4):**

- [ ] Backup de BD ejecutado y verificado.
- [ ] Migración probada en copia real (idempotente: corre dos veces sin efecto la segunda).
- [ ] Conteos antes/después validados.
- [ ] Runner enganchado al actualizador para que cada clínica lo aplique.

**Fases de código (2, 3, 5, 6):**

- [ ] Capa de compatibilidad activa (interceptor / alias / re-export).
- [ ] Smoke test manual del módulo afectado.
- [ ] Lint y build CI (incluido entorno case-sensitive) en verde.

**Fase 7 (retiro):**

- [ ] Confirmado vía logs que no se usa lo viejo.
- [ ] Todas las clínicas en versión compatible.
- [ ] Grep del repo sin tokens prohibidos (`01 §13`).

---

## 14. Trampas de Mongoose en este repo (leer antes de ejecutar)

Estas trampas **no son teóricas**: se verificaron leyendo el código real. Quien ejecute las Fases 1, 3 y 4 debe entenderlas, porque el patrón "confío en que el alias/getter lo resuelve" **rompe cosas en este repo en concreto**. El riesgo dominante no es perder datos, es **consultas que devuelven vacío sin lanzar error** y **expedientes clínicos mal clasificados**.

### 14.1 `.lean()` ignora getters, setters, virtuals y alias

Mongoose **no ejecuta** getters/setters/virtuals/`alias` cuando la consulta usa `.lean()`: devuelve el documento crudo de MongoDB. En este repo hay **44 llamadas `.lean()`** en controladores y utils:

| `.lean()` | Controlador |
|-----------|-------------|
| 13 | `appointmentController.js` |
| 7 | `periodontogramController.js` |
| 7 | `patientsController.js` |
| 5 | `cashController.js` |
| 4 | `auditController.js` |
| 2 | `draftController.js` |
| 1 c/u | `usersController.js`, `signingController.js`, `patientChargeController.js`, `odontogramaController.js`, `attachmentController.js` |

**Consecuencia.** La normalización en lectura vía `get()` (Fase 1) y los `alias` de campo (Fase 3) **no aplican** en esos 44 caminos → el código recibe el valor viejo crudo (`'BORRADOR'`, `apellido_paterno`). Es especialmente sensible en `appointmentController` (13 usos) sobre el `estado` de cita, que es justo uno de los enums a migrar.

**Regla.** No tratar getters/alias como garantía de corrección; son una **red parcial**. La corrección real es la **migración de datos (Fase 4)**. Mientras tanto, para una lectura `.lean()` que necesite el valor canónico, normalizar **explícitamente** con un helper (`normalizeStatus(doc.status)`), o quitar el `.lean()` en ese punto durante la transición.

**Acción concreta.** Auditar las 44 llamadas y, donde devuelvan un campo/enum en migración, aplicar el helper o retirar `.lean()` temporalmente.

### 14.2 `alias` NO funciona en `find()`, filtros de `update()` ni aggregation pipelines

El `alias` de Mongoose solo sirve para **acceder a una propiedad del documento**, no para construir consultas. Filtrar o agrupar por el nombre nuevo cuando el dato físico aún tiene el nombre viejo **no coincide con nada** y no lanza error. Puntos reales en el repo:

| Archivo:línea | Uso | Tipo |
|---------------|-----|------|
| `patientsController.js:148` | `paciente_id: { $in: patientIds }` | filtro `find` |
| `patientsController.js:215` | `{ primer_nombre: re }` | búsqueda regex |
| `patientsController.js:157` | `_id: '$paciente_id'` | aggregation |
| `patientsController.js:158` | `$fecha_hora` | aggregation |
| `statsController.js:144,320` | `$estado` | aggregation |
| `statsController.js:258,319,469` | `$fecha_hora` | aggregation |
| `statsController.js:259` | `$paciente_id` | aggregation |

**Regla.** Para un campo renombrado, **migrar primero el dato físico (Fase 4)** y cambiar las referencias `$campo` de las aggregations en el **mismo PR**; o seguir consultando/agrupando por el nombre físico viejo hasta que el dato esté migrado. Nunca renombrar el código de queries confiando solo en el alias.

### 14.3 Migrar valores de enum rompe aggregations que comparan literales

`statsController` agrupa por `$estado` (valores actuales `'Pendiente'`, `'Confirmada'`, …). Si la migración de datos pasa esos valores a `'PENDING'`/`'CONFIRMED'`, cualquier `$match` o comparación literal a `'Pendiente'` en el pipeline deja de cuadrar — las estadísticas saldrían en cero sin error.

**Regla.** Migrar los **literales en el código de estadísticas** junto con los datos, o aplicar el mapa de normalización (`STATUS_MAP`/`APPOINTMENT_MAP`) también dentro del pipeline. Revisar `statsController.js` en el mismo PR que migra el enum de citas.

### 14.4 Reconciliación de periodontogram: la verdad es `firmadoEn`, no `estadoRegistro`

`periodontogram.js` mantiene `status` y `estadoRegistro` por separado, **y existen datos legacy inconsistentes**. El comentario en `periodontogramController.js:687-692` lo documenta: el schema **antes tenía default `estadoRegistro: 'OFICIAL'`** (bug), por lo que hay documentos con `estadoRegistro: 'OFICIAL'` que **nunca se firmaron** (`firmadoEn` nulo). El código actual trata `firmadoEn != null` como la fuente de verdad de "firmado/oficial" y en cada save resetea `estadoRegistro = 'BORRADOR'` (`:693`) para auto-limpiar esos casos.

**Consecuencia.** Una migración ingenua `estadoRegistro:'OFICIAL' → status:'OFFICIAL'` marcaría como **oficiales** expedientes clínicos que jamás se firmaron. En un documento con valor legal (NOM-024 / firma electrónica), esto es un error grave, no cosmético.

**Regla de reconciliación canónica** al unificar en un solo `status` (aplicar en la migración de Fase 4):

```js
function reconcileStatus(doc) {
  if (doc.firmadoEn != null) return 'OFFICIAL';              // firmado = oficial (verdad real)
  if (doc.estadoRegistro === 'ARCHIVADO' || doc.status === 'archived') return 'ARCHIVED';
  return 'DRAFT';                                            // todo lo demás, incluido 'OFICIAL' sin firma
}
```

Es decir: **no usar `estadoRegistro` como fuente de "oficial"; derivarlo de `firmadoEn`.**

### 14.5 La migración debe alcanzar historial y versiones archivadas

El estado no vive solo en documentos "vivos": está también en `periodontogramHistory` y en versiones archivadas (por algo existe `Server/scripts/fixArchivedVersionNames.js`, que ya tuvo que reparar nombres de versiones archivadas). La migración de enums (Fase 4) y la regla de reconciliación de §14.4 deben aplicarse **también a esos registros** antes de restringir el `enum` al set canónico en la Fase 7. Si se migran solo los vivos, quedan valores viejos en el historial que fallarán validación al endurecer el enum.

### Resumen de la trampa por fase

| Fase | Trampa relevante | Qué hacer |
|------|------------------|-----------|
| 1 Enums | §14.1 lean ignora getters; §14.3 literales en aggregation | Helper de normalización explícito; migrar literales de `statsController` |
| 3 Campos | §14.2 alias no aplica en queries/aggregations | Migrar dato físico primero; cambiar `$campo` en lockstep |
| 4 Datos | §14.4 reconciliación por `firmadoEn`; §14.5 historial+archivados | Usar `reconcileStatus()`; incluir `periodontogramHistory` y versiones |
| 7 Retiro | §14.5 | No restringir enum hasta migrar también historial/archivados |

---

## 15. Restricción de integridad NOM-024 (firmas) — campos firmados CONGELADOS

Esta es la restricción **más crítica** de toda la migración y la que el plan original no contemplaba. Afecta a cualquier campo que forme parte de un documento clínico firmado.

### 15.1 El problema

Los documentos clínicos firmados guardan un `contentHash` (SHA-256) calculado sobre un subconjunto de campos definido en `Server/utils/integrity.js` → `SIGNABLE_FIELDS`. La verificación recalcula ese hash y lo compara; si difiere, marca `firmaDesactualizada` (firma inválida). Hoy esos campos se hashean **con sus nombres y valores actuales en español**:

```js
// Server/utils/integrity.js — SIGNABLE_FIELDS (extracto)
patient:        ['primer_nombre','apellido_paterno','fecha_nacimiento','sexo', ...],
examen:         ['paciente_id','doctor_id','tipo_examen','estado', ...],
receta:         ['paciente_id','doctor_id','fecha','medicamentos','estado','notas'],
periodontograma:['patient','initial','current','status'],
cita:           ['paciente_id','doctor_id','fecha_hora','duracion_minutos','estado','motivo', ...],
```

Consecuencia: **renombrar un campo** (`apellido_paterno` → `lastNamePaternal`) o **canonicalizar un enum** (`'Pendiente'` → `'PENDING'`) que esté en esta lista **cambia el hash recalculado → invalida TODAS las firmas existentes** de ese tipo de documento. En un expediente con valor legal (NOM-024 / firma electrónica) eso es inaceptable.

Subtleza adicional del flujo de firma: el hash se calcula sobre un **snapshot** justo antes de setear `firmadoEn`/`estadoRegistro`. Por eso un campo firmable **no puede derivarse** de `firmadoEn` (que se setea después): la verificación recalcularía distinto. Esto es lo que hace inseguro convertir `status` de periodontograma en un virtual derivado de `firmadoEn`.

### 15.2 Decisión: NO se normalizan los campos firmados

Por esta restricción, la estrategia adoptada es **excluir de la normalización todos los campos que aparecen en `SIGNABLE_FIELDS`**. Esos campos clínicos firmados se dejan **CONGELADOS en su forma original (en español)** — no se renombran ni se canonicalizan sus enums. La normalización se limita a campos **NO firmados** (p. ej. el dominio caja: `cashMovement`, `boxSession`, `patientCharge`, que no son documentos firmados y ya se migraron a `enums.js`).

Ventaja: las firmas NOM-024 nunca se tocan → cero riesgo sobre expedientes legales. Costo aceptado: los modelos firmados quedan permanentemente "mixtos" (campos en español junto a código en inglés). Es un trade-off deliberado a favor de la seguridad de los datos.

**Campos que NO se deben renombrar ni canonicalizar** (excepción legítima al estándar, para PRs y linter): todos los listados en `SIGNABLE_FIELDS` de `Server/utils/integrity.js`.

### 15.3 Si algún día se decide migrar un campo firmado

No a la ligera. Requeriría primero una **capa de compatibilidad de hash** (hashear sobre la representación legacy: mapear nombres/valores nuevos → originales antes de calcular el hash), con tests que prueben hash byte-idéntico, y recién entonces migrar código y datos (Fases 3-4) con las trampas de Mongoose del §14 en mente. Se prototipó esa capa y **se revirtió por innecesaria** bajo la decisión de §15.2; queda en el historial de git (commit de Fase 1) como referencia si el criterio cambia.

### 15.4 Impacto en periodontograma

El `status` de periodontograma está en `SIGNABLE_FIELDS.periodontograma`, así que **no se toca**: ni se vuelve virtual ni se deriva de `firmadoEn` (rompería firmas). El doble estado `status` (firmado, congelado) / `estadoRegistro` (no firmado) se documenta como **inconsistencia conocida** y se deja como está; cualquier unificación quedaría sujeta a §15.3.

---

## 16. Runbook de día de migración (datos en producción)

Procedimiento para correr una migración de datos contra la base de una clínica **en producción** (cualquier migración de Fase 4: renombre de campos, canonicalización de enums, etc.).

> **Regla de oro:** la automatización/agente trabaja sobre **copias**; el disparo final sobre la base viva lo hace una **persona**, con backup y rollback en mano. Toda migración es *backup-first*, **idempotente** y **reversible**. Contexto actual: hay **una** clínica en producción — es a la vez tu único entorno real y tu mayor riesgo, así que el ensayo en copia (§16.4) no es opcional.

### 16.1 Roles

| Rol | Hace | NO hace |
|-----|------|---------|
| Agente (Opus / Cowork / Claude Code) | Escribe scripts + tests; corre y re-corre la migración sobre **copias**/datos sintéticos; ayuda a verificar y a redactar el post-mortem | Tener credenciales de escritura a prod; disparar la corrida final; "arreglar" en vivo |
| Persona responsable | Revisa los scripts; **dispara** la corrida en prod; decide *go/no-go* y *rollback* | — |

### 16.2 Precondiciones (antes del día) — todo o se pospone

- [ ] Código de la fase mergeado; CI en verde (tests + lint del módulo migrado).
- [ ] El módulo a migrar **no toca campos firmados** (§15.2); si los tocara, primero hay que construir la capa de compatibilidad de hash (§15.3). Capas de compatibilidad de Mongoose (alias/getters) registradas para los campos NO firmados que se renombren (§3, §6).
- [ ] Script en `Server/migrations/NNNN-*.js`: idempotente, con `up()` y registro de migraciones aplicadas (§7).
- [ ] Ensayo en copia ya realizado con éxito al menos una vez (§16.4).
- [ ] Plan de rollback escrito (§16.7).
- [ ] Ventana de mantenimiento acordada con la clínica y avisada.
- [ ] Espacio en disco para **2** backups.

### 16.3 Pre-flight (el día)

- [ ] Confirmar versión actual de la app y del esquema.
- [ ] Confirmar que nadie escribirá durante la ventana (fin de jornada).
- [ ] A la mano: credenciales, `npm run backup:db`, comando de restore, y este runbook.

### 16.4 Ensayo en copia (obligatorio, sin tocar prod)

1. Backup fresco de prod: `npm run backup:db`.
2. Restaurar ese backup en una base **copia** (otra instancia, aislada; anonimizada si la maneja un agente).
3. Correr la migración sobre la copia.
4. Verificar (§16.5) sobre la copia.
5. Correr la migración una **segunda vez** sobre la copia → no debe cambiar nada (prueba de idempotencia).
6. Solo si todo pasa → *go*.

### 16.5 Verificación (sobre copia, y luego sobre prod)

- [ ] Conteos antes/después coinciden con lo esperado (N migrados, **0** perdidos).
- [ ] Spot-check: abrir varios registros y confirmar que el dato migró bien.
- [ ] **Integridad NOM-024:** los documentos firmados siguen verificando — `firmaDesactualizada` **NO** se dispara. Como no se tocan campos firmados (§15.2), no debería cambiar; **si una firma se invalida → ABORTAR.**
- [ ] La app arranca y los flujos clave funcionan: login, ver expediente, caja, firma.
- [ ] Sin errores nuevos en logs.
- [ ] Suite de tests en verde contra la copia migrada.

### 16.6 Corrida en producción (la dispara una persona)

1. Poner la app en mantenimiento (detener writes; `pm2 stop` del server o modo lectura).
2. Backup fresco **otra vez** (el definitivo pre-cambio).
3. Correr el **mismo** script ya ensayado.
4. Verificar (§16.5) sobre prod.
5. Levantar la app en la nueva versión.
6. Monitoreo activo los primeros minutos/horas: logs, flujos clave, reportes de la clínica.

### 16.7 Rollback

Disparar si: la verificación falla, se invalidan firmas, la app no levanta, o hay errores en flujos críticos.

1. Detener la app.
2. Restaurar el backup pre-cambio.
3. Redesplegar la versión anterior de la app.
4. Confirmar que la clínica opera normal.
5. Post-mortem antes de reintentar.

### 16.8 Frontera del agente (resumen)

- ✅ Escribe scripts, tests y codemods; corre/re-corre la migración sobre copias; ayuda a verificar y documentar.
- ❌ No tiene credenciales de escritura a prod; no dispara la corrida final; no improvisa sobre datos reales.
