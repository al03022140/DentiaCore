# Auditoría: Odontograma y Periodontograma — Procesos y Errores

**Fecha:** 2026-06-01
**Alcance:** Procesos de guardado, lectura, normalización, validación, versionado y cálculo clínico del **odontograma** y **periodontograma** (backend `Server/` y frontend `Client/`).
**Método:** Lectura del código fuente real (modelos, controllers, utils, schemas, helpers, normalizers, servicios) + verificación puntual con scripts. Las suites de tests existentes **no dan señal fiable** (ver nota al final).

---

## Estado de correcciones — actualización 2026-06-02

| Hallazgo | Estado | Nota |
|----------|--------|------|
| CRÍTICO #1 (NIC) | ✅ Aplicado | Unificado a `NIC = PS − MG` (margen firmado) en cliente y backend. |
| P2 (% > 100%) | ✅ Aplicado | Rama canónica inglés (backend) y validador del cliente filtran a 2 caras por arcada. |
| P3 (TOCTOU) | ✅ Aplicado | Guards (`estado≠OFICIAL`, `firmadoEn:null`) en el filtro del `findOneAndUpdate` + traducción de E11000 → 409/403, apoyado en el índice único parcial. |
| P4 (`runValidators`) | ✅ Aplicado | `runValidators:true` en los 3 updates + validación FDI en `validarEntradasOdontograma` (400 claro, no 500). |
| P5 (ObjectId) | ✅ Aplicado | `mongoose.Types.ObjectId.isValid` en `obtenerSnapshotPorId` y `deleteClinicalHistoryEntry`. |
| P6 (pronóstico) | ✅ Aplicado | Enum unión `bueno/regular/malo/dudoso/imposible` en cliente (config + validador) y backend (modelo, schema, validator, adaptors). |
| P7 (ceros) | ✅ Aplicado | `pickFaceTriplesFromFourFaces` devuelve `undefined` para caras **ausentes** (no `[0,0,0]`), para que la cadena `??` siga al respaldo. Tests de normalización/save-flow verdes. |
| P1 (validador único) | ⏸️ Diferido | Refactor arquitectónico mayor (dos validadores + dos contratos de caras). Requiere harness de tests antes de unificar; alto riesgo de regresión sin él. |
| Medios | ◑ Parcial | Aplicados: PHI en logs gateados por `NODE_ENV` (periodontogramController), arcada de temporales (`getToothSection` cliente + `inferArcada` backend), namespacing de `localStorage` por paciente. Diferidos (decisión/migración): índice de `versionName`, superficie `'0'` vs `'O'`, estadísticas solo-permanentes. |

> Verificación de esta ronda: `node -c` OK en los 7 archivos server; tests de cliente de periodontograma verdes (13/13 reales). La suite `periodontogram-validation.test.js` falla por "must contain at least one test" — es un script sin bloques `test()`, ya documentado abajo, no una regresión.

---

## Resumen ejecutivo

- Se aplicaron **3 correcciones seguras** (verificadas, sin dependencia de convención clínica).
- El hallazgo **#1 crítico** es una **inconsistencia en el cálculo del Nivel de Inserción Clínica (NIC/CAL)** entre frontend (`PD + margen`) y backend (`PD − margen`). **No se corrigió** porque es una decisión de convención clínica que debes tomar tú; cambiarla a ciegas corrompería el significado de datos de pacientes.
- Varios hallazgos confirmados de alto impacto (concurrencia/TOCTOU, validadores duplicados, `runValidators` ausente) son **refactors mayores con riesgo de regresión** y se documentan con fix propuesto en vez de aplicarse sin tests.
- Se descartaron **falsos positivos**: p. ej., el rango `-9..9` de sondaje/margen NO es un bug (está en la spec `inputs_periodontograma.md`).

---

## ✅ Correcciones aplicadas (seguras y verificadas)

| # | Archivo:línea | Problema | Corrección | Verificación |
|---|---------------|----------|------------|--------------|
| 1 | `Server/utils/periodontograma.js:321` | `cleanupInactiveSessions` hacía `new Date(timestamp.replace(/-/g, ':'))`. El timestamp se guarda como `YYYY-MM-DDTHH-MM-SS`, así que reemplazar **todos** los `-` produce `YYYY:MM:DD...` = **Invalid Date** → `NaN` → las sesiones inactivas **nunca se limpiaban** (fuga de memoria lenta en `activeSessionTimestamps`). | Convertir a `:` **solo** los guiones de la parte de hora; reconstruir fecha válida; saltar timestamps no parseables. | Script: viejo→`NaN`, nuevo→fecha válida con diff correcto. ✅ |
| 2 | `Server/models/periodontogram.js:509` | Opción de esquema `bufferMaxEntries: 0`, **removida en Mongoose 6+** (el proyecto usa 7.8.6). Se ignora silenciosamente (config muerta/engañosa). | Eliminada; se conserva `bufferCommands: false`. | `node -c` OK. ✅ |
| 3 | `Server/controllers/periodontogramController.js:137` | `.select('-history')` sobre un campo **inexistente** (el historial vive en la colección `PeriodontogramHistory`). No-op con comentario engañoso ("mejorar rendimiento"). | Eliminado el `.select`; comentario aclaratorio. | `node -c` OK. ✅ |

> Los 3 archivos pasan `node -c` (sintaxis válida). Ningún cambio altera datos clínicos ni cálculos.

---

## 🔴 CRÍTICO #1 — Inconsistencia en el cálculo de NIC/CAL (requiere tu decisión)

**El mismo periodontograma produce un "Nivel de Inserción Clínica" distinto según se calcule en el cliente o en el servidor.**

- **Frontend** usa `NIC = profundidad + margen`:
  - `Client/src/shared/validators/universal-tooth-validator.js:1052` → `const attachmentLevel = depth + margin;`
  - `Client/src/features/periodontogram/utils/periodontogram-linear-graphics.js:1556` → `depth + Math.abs(margin)`
  - Y lo **muestra al usuario como "fórmula clínica estándar"** en `statistics-panel.jsx:281` y `periodontograma-functions/measurements.js:497`.
- **Backend** usa `NIC = profundidad − margen` (6 lugares):
  - `Server/utils/UniversalToothValidator.js:860, 877, 897, 947, 1018, 1044`
  - Comentario interno: *"NIC = PS − MG (margen positivo reduce, margen negativo aumenta)"*.

**Análisis:** la convención clínica estándar con margen **firmado** (recesión = valor negativo) es `NIC = PD − MG`, que coincide con el backend y con la lógica de colores de `periodontogram-constants.js` (`value >= -5` ⇒ recesión). El `+` del frontend sólo es correcto si la recesión se captura como **positiva**. Además el frontend es **internamente contradictorio**: `periodontogram-utils.js:250` trata `margen ≥ 0` como recesión, mientras `periodontogram-constants.js:646` trata recesión como **negativa**.

**Por qué no lo corregí:** elegir el signo equivocado invertiría el NIC de todos los pacientes. Es una decisión clínica/de producto, no mecánica.

**Acción recomendada (elige una y la aplico en todo el sistema):**
1. **Unificar a `PD − margen`** (estándar con margen firmado; recesión negativa). Implica corregir el frontend (`+`→`−`) y la lógica de color de `periodontogram-utils.js`.
2. **Unificar a `PD + margen`** (lo que la UI ya muestra). Implica corregir el backend (`−`→`+`) y recalcular `averageAttachmentLevel` ya guardado.
3. Documentar y decidir luego.

> **Dato relacionado:** `Server/models/periodontogram.js` calcula y guarda `averageGingivalMargin` sobre **4 caras**, pero `calculateStatistics` mide profundidad/NIC sobre **2 caras** (la arcada del diente), y el `averageAttachmentLevel` que sí calcula `calculateStatistics` **se descarta** (no está en el esquema `statistics`). Cualquiera sea la convención elegida, conviene propagar `averageAttachmentLevel` y unificar el conjunto de caras.

---

## 🟠 Confirmados de alto impacto (fix propuesto; no aplicados sin tu visto bueno)

### P1. Dos validadores y dos contratos de "caras" coexistiendo
Hay validadores duplicados con contratos **incompatibles** de caras:
- Canónico real (todo el sistema): `vestibularSuperior / palatinoSuperior / vestibularInferior / lingualInferior`.
- Pero `Client/src/shared/validators/universal-tooth-validator.js` (`addCanonicalFaceStructure`, ~L292) genera caras `['mesial','distal','vestibular','lingual']`, y la furca como `{vestibular, lingual, mesial}` en vez de `{vestibular, lingualPalatino, doble:{furca1,furca2}}`.
- En backend hay **dos** `validatePeriodontogramData` (`utils/periodontogramData.js` vs `schemas/unified-periodontogram-schema.js`); el controller usa la del schema.
**Riesgo:** según qué función entre en juego, mediciones/furca se guardan con claves que el resto no lee → pérdida al releer.
**Fix:** un único validador y un único contrato de caras canónicas compartido Front/Back.

### P2. % de sangrado / placa puede superar 100 % (numerador 4 caras ÷ denominador 6 sitios)
- Backend `Server/utils/UniversalToothValidator.js`: la rama **canónica español** (L965-981) filtra a **2 caras** (consistente con `× 6`, L1059); pero la rama **canónica inglés** (`hasCanonical`, L919-951) cuenta las **4 caras** con el mismo denominador `presentTeeth * 6` → hasta ~200 %.
- Frontend (`universal-tooth-validator.js` L991-1018, denominador L1064 `teethWithClinicalData * 6`) cuenta las 4 caras; en datos normales las 2 caras vacías son `[0,0,0]` y no inflan, pero no hay defensa para el caso patológico.
**Fix:** numerador y denominador deben usar el **mismo** número de sitios (filtrar a 2 caras por arcada, como ya hace la rama español del backend).

### P3. Condiciones de carrera (TOCTOU) en guardado del odontograma
`Server/controllers/odontogramaController.js`:
- `guardarOdontogramaInicial` (L125-218): lee `existingDoc`, valida `estado === 'OFICIAL'` (409), y luego `findOneAndUpdate(... upsert:true)` **sin** incluir el guard en el filtro → dos requests concurrentes pueden pisar un odontograma ya OFICIAL.
- `saveClinicalHistoryEntries` (L558-633): mismo patrón con `firmadoEn`/`expectedUpdatedAt`.
- La concurrencia optimista es **opcional**: solo corre `if (expectedUpdatedAt)`; quien no lo envíe salta la protección.
**Fix:** mover los guards al filtro del `findOneAndUpdate` (`estado: { $ne: 'OFICIAL' }`, `firmadoEn: null`, `updatedAt: expected`) y responder 409 si devuelve `null`; idealmente transacción. Hacer `expectedUpdatedAt` obligatorio si ya existe `current`.

### P4. `runValidators` ausente en updates
Los `findOneAndUpdate` del odontograma (`L214, L379, L629`) no pasan `runValidators: true`, así que el `enum` de `estado` y los validadores de subdocumentos **no se aplican** al escribir vía `$set`/`$push`.
**Fix:** añadir `runValidators: true` **y** validar entradas (incl. número FDI) en middleware antes de persistir (los validadores de array bajo `$push` no son fiables).

### P5. IDs no validados → 500 en vez de 404/400
`obtenerSnapshotPorId` y `deleteClinicalHistoryEntry` (`odontogramaController.js` ~L286, ~L664) inyectan `req.params.snapshotId/entryId` en la query; un id no-ObjectId lanza `CastError` → 500.
**Fix:** `if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404/400)` al inicio (bajo riesgo; entradas válidas no se afectan).

### P6. Pérdida silenciosa de pronóstico "Imposible"
La UI ofrece `imposible` (`periodontogram-constants.js:184`), pero el enum del backend es `['Bueno','Regular','Malo','Dudoso']` → al validar/guardar se reemplaza por el default **"Bueno"**. Dato clínico perdido. También hay descoordinación de mayúsculas (`bueno` vs `Bueno`).
**Fix:** unificar el enum (incluir/eliminar `imposible`) y la capitalización en una sola fuente.

### P7. Posible pérdida de datos al guardar caras (frontend)
En `Client/src/shared/utils/periodontogram-helpers.js`, `toTriple(undefined)` devuelve `[0,0,0]` (no `undefined`), y `pickFaceTriplesFromFourFaces` devuelve `{vestibular:[0,0,0], palatino:[0,0,0]}` cuando no reconoce la forma. Como `[0,0,0]` **no es nullish**, la cadena de respaldo con `??` en `periodontogram-section.jsx` (L663-684) puede cortarse y persistir **ceros** en lugar de los datos reales de la cara, según la forma del objeto de entrada.
**Fix:** que `toTriple`/`pickFaceTriplesFromFourFaces` devuelvan `undefined` ante ausencia (para que `??` siga al fallback) y normalizar a `[0,0,0]` solo en el punto final de escritura. **Requiere verificación con datos reales de la UI** antes de tocar.

---

## 🟡 Medios / robustez

- **Inconsistencia numérico vs letra en superficie del odontograma:** `Server/helpers/odontograma.js:98` usa `'0'` (cero); el modelo (`odontograma.js:44`) y `odontogramUtils.js:77` usan `'O'` (letra); el frontend mapea `NUMERIC_TO_LETTER['0']='O'`. Ambos resuelven a "Oclusal" al mostrar, pero rompen el **dedupe** (`'0'` ≠ `'O'`) → posibles duplicados. **No es fix de una línea**: hay que elegir una representación (numérica o letra) y usarla en todas las capas. (El comentario del doc en `odontograma.js:23` dice `default: '0'` y contradice el schema `'O'`.)
- **PHI en logs:** `periodontogramController.js` (~L188-193, 282-284, 637) hace `console.log` del `payload`/`validatedData` completo (mediciones del paciente). Enmascarar o condicionar a `NODE_ENV !== 'production'`.
- **`versionName` único e inmutable:** índice `unique (patient, versionName)` en `periodontogramHistory.js:61` → reguardar con el mismo nombre da 409 permanente, mientras `delete/archive` auto-sufija. Comportamiento incoherente; unificar (sufijar o índice `(patient, versionName, createdAt)`).
- **Inferencia de arcada para temporales (5x/6x):** varias utilidades (`periodontogramAdaptors.js` `inferArcada` L76, `periodontogram-utils.js` `getToothSection` L152) clasifican temporales superiores como "inferior", contradiciendo `getToothArcada` (`[1,2,5,6]`=superior). Reutilizar `getToothArcada`.
- **Estadísticas solo permanentes:** `calculateStatistics` itera `PERMANENT_TEETH` y fija `totalTeeth: 32`; las mediciones en dientes temporales se ignoran.
- **`localStorage` sin namespacing por paciente:** `periodontogram-state-manager.js` usa clave fija `periodontogram_state` → riesgo de cargar estado del paciente anterior.
- **`getToothPosition` retorna `1` por defecto** para dientes inválidos (`periodontogram-utils.js:82`) → render con posición equivocada en vez de fallar.
- **`parseInt` sin radix** en varios puntos (consistencia; usar `parseInt(x,10)` / `parseFloat` para decimales).

---

## ⚪ Falsos positivos / NO son bugs (corrigen el registro de la auditoría)

- **Rango `-9..9` de `profundidadSondaje` y `margenGingival`** (`config/periodontogram-config.js:64-65`): **es la spec**, está documentado en `Server/docs/inputs_periodontograma.md` ("Rango por elemento (UI/validador Front): -9..9"). No cambiar sin decidir antes la semántica clínica (podría rechazar datos que la UI permite).
- **Cálculo de NIC del backend** (`PD − margen`): es **internamente consistente** y documentado; el problema es la divergencia con el frontend (ver crítico #1), no el backend en sí.
- El "bug de fechas" reportado por la auditoría en `periodontogramUtils.js:321` estaba **mal citado** (ese archivo tiene 263 líneas); el real estaba en `periodontograma.js:321` y **ya fue corregido**.

---

## Nota sobre los tests

Las suites bajo `Server/tests/periodontogram-*.test.js` son **scripts con `console.log`**, no tests con bloques `test()/it()`; Jest reporta *"Your test suite must contain at least one test"* y `statistics-consistency.test.js` / `gingival-margin-statistics.test.js` están **vacíos de tests**. **No hay señal automática de regresión** para este módulo. Recomendado: convertir estos scripts en tests reales (con `mongodb-memory-server`, ya instalado) que cubran guardado/lectura, normalización de caras, NIC y porcentajes.

---

## Prioridad recomendada

1. **Decidir la convención de NIC/CAL** (crítico #1) y unificar Front/Back.
2. **P2** (% que excede 100 %) y **P7** (posible persistencia de ceros) — afectan datos/lectura clínica.
3. **P1** (un único validador/contrato de caras) — raíz de varios bugs.
4. **P3/P4/P5** (concurrencia, `runValidators`, validación de ObjectId) — integridad y robustez del backend.
5. **P6** (pronóstico) y los medios.
6. Reconstruir el harness de tests.
