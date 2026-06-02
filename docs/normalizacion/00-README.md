# Normalización de DentiaCore — Documentación Oficial

**Fecha:** 2 de junio de 2026
**Estado:** Plan aprobado, pendiente de ejecución
**Alcance:** Repositorio completo (`Client/` Vite+React, `Server/` Express+MongoDB, contrato API, base de datos, tooling).
**Naturaleza de la app:** Gestión clínica dental con datos de salud de pacientes (PHI). Aplican LFPDPPP / NOM-024. La app se instala por clínica (launcher, install.sh/ps1, pm2), por lo que **no hay una sola base de datos central que migrar**: cada instalación tiene la suya.

> **Nota de método:** los hallazgos se verificaron leyendo el código real con referencia `archivo:línea`. Se ignoraron `node_modules/`, `Client/dist/` y `.claude/worktrees/`. Esta entrega es **solo planeación**: define el estándar y la estrategia, no modifica código.

---

## 1. Qué es esto

Esta carpeta es la **fuente única de verdad** sobre cómo se nombra y estructura el código en DentiaCore. Nace de una auditoría de normalización que confirmó inconsistencias reales y extendidas: variables y enums mezclando español e inglés, un mismo concepto representado de 3 formas distintas, archivos en PascalCase y kebab-case dentro del mismo módulo, y carpetas duplicadas (`context` y `contexts`).

| Documento | Para qué sirve | Lo usa |
|-----------|----------------|--------|
| **00-README.md** (este) | Resumen ejecutivo, decisión de idioma y mapa de severidad | Todos |
| **01-estandares-tecnicos.md** | Las reglas oficiales para escribir código nuevo | Todo el equipo, en cada PR |
| **02-analisis-por-seccion.md** | Diagnóstico sección por sección con evidencia y ejemplos normalizados | Quien migra cada módulo |
| **03-estrategia-migracion.md** | Cómo unificar sin romper nada, por fases | Lead técnico / quien planea sprints |

---

## 2. Decisión central: idioma oficial del código

> **Inglés para el código. Español solo para lo que ve el usuario.**

Toda identificación de código —variables, funciones, modelos, campos de base de datos, enums, rutas, permisos, nombres de archivo y carpeta— se escribe en **inglés**. El **español** queda reservado exclusivamente para:

- Textos visibles en la interfaz (labels, botones, mensajes de error mostrados al usuario).
- Contenido clínico/legal que es un término propio del dominio y no tiene traducción operativa (se documenta como excepción explícita).

### Por qué inglés y no español

1. **El backend ya está casi todo en inglés.** Las respuestas de API usan `message`/`success`/`data` en 467 vs 1 caso de claves en español. Las funciones de controladores (`getAllPatients`, `createAppointment`), los permisos (`patients.read`), los modelos recientes (`cashMovement`, `boxSession`) y las variables de entorno (`MONGODB_URI`) ya están en inglés. Migrar **hacia** inglés es el camino de menor fricción; migrar hacia español implicaría reescribir la mayoría del código sano.
2. **Es el estándar de industria.** Librerías, frameworks (React, Mongoose, Express), Stack Overflow y la documentación viven en inglés. Mezclar `fechaHora` con `selectedPatient` en el mismo componente aumenta la carga cognitiva sin beneficio.
3. **Separa datos de presentación.** El usuario final ve español; el código habla inglés. Esto permite, si algún día se requiere, internacionalizar la UI sin tocar la lógica.

### Qué NO cambia con esto

El usuario seguirá viendo todo en español. Los textos de la interfaz, los nombres de estados que se muestran ("Pendiente", "Confirmada") y los mensajes se mantienen en español **en la capa de presentación**, mapeados desde claves en inglés. Ver `01-estandares-tecnicos.md §3` (enums y diccionarios de traducción).

---

## 3. Mapa de severidad de inconsistencias

Clasificación de los hallazgos por impacto en mantenibilidad y riesgo de bug. El detalle con evidencia está en `02-analisis-por-seccion.md`.

| Severidad | Cantidad | Significado |
|-----------|----------|-------------|
| 🔴 Crítico | 3 | Genera bugs o ambigüedad real; tocar pronto |
| 🟠 Alto | 6 | Inconsistencia extendida que confunde a diario |
| 🟡 Medio | 7 | Deuda de naming localizada |
| ⚪ Bajo | 5 | Higiene / cosmético |

**Top 3 críticos a resolver primero:**

1. 🔴 **Doble sistema de estado en `periodontogram.js`.** El modelo tiene a la vez `status: ['draft','completed','reviewed','archived']` (línea 377) y `estadoRegistro: ['BORRADOR','OFICIAL','ARCHIVADO']` (línea 473), con defaults `status: 'draft'` y `estadoRegistro: 'BORRADOR'`. Dos fuentes de verdad para "en qué estado está el documento" — fuente segura de inconsistencia de datos.
2. 🔴 **El mismo concepto "estado de documento" se representa de formas distintas según el modelo.** `['BORRADOR','OFICIAL','ARCHIVADO']` (español MAYÚS) en patient/exam/odontograma/periodontogram, frente a `['draft','completed','reviewed','archived']` (inglés minús) en el `status` de periodontogram. No hay un único enum compartido.
3. 🔴 **Respuestas de API sin contrato fijo.** Conviven `{ success, message, data }`, `{ message }` y datos crudos sin envoltura. El cliente no puede asumir una forma estable, lo que obliga a parsers defensivos y oculta errores.

---

## 4. Principios que guían el estándar

1. **Consistencia sobre preferencia personal.** Si una regla ya está escrita aquí, se sigue aunque a alguien le guste otra forma.
2. **Sin romper nada.** Todo cambio de naming pasa por capas de compatibilidad (aliases, virtuals, mapeos) antes de eliminar lo viejo. La migración es gradual y reversible (ver `03`).
3. **El código en inglés; el usuario en español.** Frontera clara entre lógica y presentación.
4. **Un concepto, un nombre.** Nada de `estado` + `status` + `estadoRegistro` para la misma idea.
5. **Lo nuevo nace limpio.** Aunque la migración de lo existente sea gradual, **todo código nuevo cumple el estándar desde el día uno**. No se añade deuda.

---

## 5. Cómo usar esta documentación

- **Vas a escribir código nuevo:** lee `01-estandares-tecnicos.md`. Es la referencia obligatoria.
- **Vas a migrar un módulo existente:** lee la sección correspondiente en `02-analisis-por-seccion.md` (qué está mal y cómo debe quedar) y sigue la fase aplicable de `03-estrategia-migracion.md`.
- **Estás revisando un PR:** usa la checklist de `01-estandares-tecnicos.md §11` y la lista de convenciones prohibidas (`§10`).
- **Vas a planear sprints de normalización:** parte de `03-estrategia-migracion.md`, que ordena las fases por riesgo y dependencia.

---

## 6. Estado de adopción

| Hito | Estado |
|------|--------|
| Estándar definido y documentado | ✅ Hecho (esta entrega) |
| Linters que fuercen el estándar | ⬜ Pendiente (Fase 0, ver `03`) |
| Migración backend (enums, modelos, respuestas) | ⬜ Pendiente |
| Migración frontend (servicios, componentes, contexts) | ⬜ Pendiente |
| Eliminación de capas de compatibilidad | ⬜ Pendiente (última fase) |

> Mantener esta tabla actualizada conforme avance la migración.
