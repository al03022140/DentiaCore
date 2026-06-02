<!--
  Plantilla de PR — DentiaCore
  La checklist de normalización proviene de docs/normalizacion/01-estandares-tecnicos.md §14.
  Borra las secciones que no apliquen, pero NO borres la checklist de normalización.
-->

## Qué cambia

<!-- Resumen breve del cambio y por qué. -->

## Tipo de cambio

- [ ] Fix
- [ ] Feature
- [ ] Refactor / normalización
- [ ] Docs / tooling

## Checklist de normalización (obligatoria)

> Ver `docs/normalizacion/01-estandares-tecnicos.md`. Lo nuevo cumple el estándar desde el día uno; lo legacy que toques no debe empeorar.

- [ ] Todo identificador nuevo está en **inglés** (variables, funciones, campos, archivos, rutas, permisos).
- [ ] Texto visible al usuario en **español**; claves y códigos (`error.code`, enums) en inglés.
- [ ] Enums nuevos en `UPPER_SNAKE` inglés y referenciados desde `Server/constants/enums.js` (no strings sueltos).
- [ ] Ningún modelo introduce un segundo campo de estado (un solo `status` por documento).
- [ ] Archivos siguen la convención por tipo (componentes `PascalCase.jsx`; servicios/utils `kebab-case`; CSS = nombre del componente).
- [ ] No se crean carpetas duplicadas; los contexts van en `shared/contexts/` (plural).
- [ ] Endpoints nuevos: ruta en inglés/plural/kebab, respuesta con el sobre estándar `{ success, data, message?, error? }`, status HTTP correcto.
- [ ] Body validado con Joi; claves en inglés que coinciden con el modelo.
- [ ] Sin identificadores que mezclen idiomas (`doctorFirmaMethod`) ni nada de la lista de convenciones prohibidas (`01 §13`).
- [ ] Si toca un módulo en migración, respeta la fase y las **Trampas de Mongoose** (`03 §14`): `.lean()`, alias en queries/aggregations y reconciliación por `firmadoEn`.

## Pruebas

<!-- Cómo se verificó: tests, smoke test manual, etc. -->

- [ ] `npm test` (server/client) en verde
- [ ] Smoke test manual del módulo afectado
