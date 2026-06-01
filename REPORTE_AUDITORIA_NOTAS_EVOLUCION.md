# Auditoría — Subida de Notas de Evolución

**Proyecto:** DentiaCore · **Fecha:** 2026-05-31 · **Alcance:** ciclo completo de la nota (crear → editar borrador → firmar → verificar) + middlewares y vías de firma.

## Resumen

El flujo de subida está, en general, **sólido y bien defendido**: numeración atómica anti‑duplicados (`_evolutionNoteCounter` con pipeline `$max`+1), inserción con `$push` atómico en vez de `save()` (evita perder notas en escrituras concurrentes con `versionKey:false`), *rollback* de los PNG de firma si la inserción falla, validación de contenido, validación de que la firma del doctor la haga un doctor real, verificación de PIN con bloqueo por intentos, y *hash* de contenido + *hash* del PNG para detectar manipulación.

Aun así encontré **3 defectos reales** en el ciclo de firma/verificación, los tres ya **corregidos y verificados**. Añado **3 recomendaciones** que requieren tu decisión porque cambian comportamiento o exceden el alcance acordado.

| # | Severidad | Área | Estado |
|---|-----------|------|--------|
| 1 | Media | Verificación de integridad demasiado laxa para notas OFICIALES | ✅ Corregido |
| 2 | Media | Notas OFICIALES sin firma del doctor al firmar desde el Centro de Firmas | ✅ Corregido |
| 3 | Baja‑Media | Chequeo de "admin" sensible a mayúsculas al editar borrador | ✅ Corregido |
| R1 | Media | Sin idempotencia en el POST + *timeout* axios de 10 s → riesgo de notas duplicadas | ⚠️ Recomendación |
| R2 | Baja | Firma del paciente ausente en firma en lote | ⚠️ A confirmar |
| R3 | Baja | `firmaDesactualizada` / indicador ⚠ de la UI es inerte | ⚠️ Recomendación |

---

## Hallazgos corregidos

### 1. Verificación de integridad demasiado laxa para notas OFICIALES — *Media*

**Dónde:** `Server/controllers/patientsController.js` → `verifyEvolutionNoteIntegrity`.

**Problema:** el veredicto era `integro = contenido.ok !== false && firmaPaciente.ok !== false && firmaDoctor.ok !== false`. Como las piezas **ausentes** devuelven `ok: null` (no `false`), una nota **OFICIAL sin `contentHash`** o **sin firma del doctor** reportaba `integro: true`. Es decir, una nota firmada a la que le falta su firma —o que nunca tuvo *hash* de referencia— pasaba la verificación de integridad (NOM‑024 / NOM‑004 Art. 5.10). Esto enmascaraba exactamente el defecto #2.

**Arreglo:** extraje un veredicto **puro y testeable** `evaluateNoteIntegrity()` en `Server/utils/signing.js` y lo usa el controlador. Reglas nuevas:

- Una nota **OFICIAL** exige `contentHash` válido **y** firma del doctor presente e íntegra; si falta cualquiera → **no íntegra** (`motivos: ['oficial_sin_hash_contenido' | 'oficial_sin_firma_doctor']`).
- Cualquier *hash* que no coincida (contenido o firma) → manipulación.
- La firma del **paciente** es informativa (el flujo interactivo la captura; la firma en lote no): sólo penaliza si está presente y alterada.
- Una nota **BORRADOR** se evalúa de forma laxa (no tiene referencia de firma).

La respuesta de `/verify` ahora incluye `motivos[]` para que la auditoría vea *por qué* una nota no es íntegra.

### 2. Notas OFICIALES sin firma del doctor al firmar desde el Centro de Firmas — *Media*

**Dónde:** `Server/controllers/draftController.js` → `signDraft` y `batchSign` (rama de nota de evolución).

**Problema:** al aprobar un borrador desde el Centro de Firmas / firma en lote, la nota pasaba a `OFICIAL` y se guardaba `firmadoPor` + `contentHash`, pero **nunca** se guardaba la firma del doctor: `doctorFirmaUrl`, `doctorFirmaMethod` y `doctorFirmaImageHash` quedaban en `null`. Resultado: notas **OFICIALES sin firma visible**, incoherentes con `addEvolutionNote` y `signExistingEvolutionNote` (que sí la guardan) y contra NOM‑004 Art. 5.10.

**Arreglo:** helper `attachDoctorSignatureToNote(note, signer, patientId)` que, al firmar, registra `doctorFirmaMethod = 'pin'` (firma electrónica ya validada con el PIN del doctor) y, si el doctor tiene imagen de firma subida (`firmaDigitalUrl`), copia un **snapshot inmutable** servible (`copyFirmaToSnapshot`) con su *hash*. No bloquea la firma legalmente válida ante un fallo de disco (queda firma electrónica sin imagen). Se invoca en ambas vías (`signDraft` y `batchSign`).

> Combinado con el arreglo #1, las notas que se hubieran firmado en lote **antes** de este cambio (sin firma del doctor) ahora serán correctamente señaladas por `/verify` como no íntegras (`oficial_sin_firma_doctor`), en vez de pasar desapercibidas.

### 3. Chequeo de "admin" sensible a mayúsculas al editar borrador — *Baja‑Media*

**Dónde:** `Server/controllers/patientsController.js` → `updateDraftEvolutionNote`.

**Problema:** `const isAdmin = ['administrador','superadmin','doctor_admin'].includes(req.user?.role)` — comparación exacta y sensible a mayúsculas, mientras que todo el resto del sistema normaliza con `normalizeRole()` / `isAdminRole()`. Si el rol del token llegaba con otra capitalización, un administrador legítimo **no** era reconocido como tal y no podía editar un borrador ajeno (y el helper `isAdminRole` además cubre `'admin'`, que la lista omitía).

**Arreglo:** usar `isAdminRole(req.user?.role)` (importado de `utils/permissions`).

---

## Recomendaciones (requieren tu decisión)

### R1. Idempotencia + *timeout* del POST de subida — *Media*

`Client/.../axios-instance.js` usa `timeout: 10000` (10 s) para todas las peticiones, incluida la subida de una nota OFICIAL (dos PNG en base64 + verificación de PIN con bcrypt + 2 escrituras a disco). El POST **no es idempotente** y no hay clave de idempotencia. Si el servidor confirma la nota pero el cliente sufre *timeout*/caída de red **antes** de recibir el 201, el usuario ve un error y al reintentar crea una **nota duplicada** (con número nuevo, porque el contador ya avanzó). El interceptor no reintenta POSTs automáticamente (bien), así que el riesgo es por reintento manual.

**Sugerencia:** clave de idempotencia (p. ej. header `Idempotency-Key` generado en el cliente al abrir el formulario) que el backend use para deduplicar; y/o subir el *timeout* para subidas con firma.

### R2. Firma del paciente ausente en firma en lote — *Baja, a confirmar*

La firma en lote firma sólo con el doctor (el paciente no está presente). Tras el arreglo #2 la nota tendrá firma del doctor, pero seguirá sin firma autógrafa del paciente. Confirmar si eso es aceptable bajo tu interpretación de NOM‑004 (la firma del doctor es la exigida para la nota; el consentimiento del paciente se captura aparte en *finalize-history*) o si debe capturarse por nota.

### R3. `firmaDesactualizada` / indicador ⚠ de la UI es inerte — *Baja*

Las notas OFICIALES son inmutables, así que `firmaDesactualizada` nunca pasa a `true` por una vía de la app; el indicador ⚠ del frontend prácticamente no se dispara. El mecanismo **real** de detección es el endpoint `/verify` (ahora endurecido). Sugerencia: correr `/verify` periódicamente (job de auditoría) sobre las notas OFICIALES y alertar sobre `integro:false`.

---

## Verificación realizada

- **Pruebas unitarias de la lógica pura** (sin base de datos): 19/19 **PASS** — cubren `evaluateNoteIntegrity` (OFICIAL correcta, lote sin firma de paciente, sin `contentHash`, sin firma del doctor, contenido alterado, firma del doctor alterada, firma del paciente alterada, borrador laxo), `isAdminRole` (varias capitalizaciones) y `computeEvolutionNoteHash` (determinismo + detección de cambio).
- **`node --check`** OK en los 3 archivos modificados; **smoke `require`** OK (todos los *exports* y funciones del controlador presentes).
- **Sin impacto en `addEvolutionNote`:** no se tocó la creación, por lo que los 3 tests de integración existentes (`Server/tests/patient-evolution-note.test.js`) siguen siendo válidos.
- **Nota:** los tests de integración con `mongodb-memory-server` **no** se pudieron ejecutar en este entorno (no hay binario `mongod` para la arquitectura aarch64 y la descarga está bloqueada por red). Recomiendo correr `npm test` en tu equipo tras revisar los cambios.

## Archivos modificados

- `Server/utils/signing.js` — nuevo helper puro `evaluateNoteIntegrity` (+ export).
- `Server/controllers/patientsController.js` — `verifyEvolutionNoteIntegrity` usa el helper y expone `motivos`; `updateDraftEvolutionNote` usa `isAdminRole`.
- `Server/controllers/draftController.js` — helper `attachDoctorSignatureToNote` invocado en `signDraft` y `batchSign`.
