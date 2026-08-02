# Política de ramas — Dentia Core (v1.2)

Decisión arquitectónica oficial. Sustituye toda convención implícita anterior.

## Regla A-001 — `master` siempre desplegable

La rama `master` debe ser siempre **compilable, desplegable y apta para
instalarse en una clínica**.

Consecuencias:

- Nunca se deja código roto ("mañana lo arreglo" no existe).
- Nunca se hace merge con tests fallando. Gate mínimo antes de push:
  suite completa de Server y de Client en verde.
- Nunca se deja una migración incompleta.
- Nunca se rompe compatibilidad con instalaciones existentes.

## Modelo: trunk-based sobre `master`

No usamos GitFlow. No hay `develop`, `release/*` ni ramas de entorno.

```
master
   ├── feat/*      nueva funcionalidad
   ├── fix/*       corrección de bugs
   ├── sec/*       seguridad
   ├── docs/*      documentación
   ├── refactor/*  refactor sin cambio funcional
   └── hotfix/*    corrección urgente en producción
```

Prefijos no listados (`wip/*`, `integration/*`, etc.) no se crean.

## Ciclo de vida de una rama

1. Nace de `master`.
2. Vive **1–3 días** (máximo una semana). Si necesita un mes, el cambio
   es demasiado grande: partirlo.
3. Se integra con `git merge --no-ff` (el merge commit documenta la
   historia; `git log --graph` debe contar el proyecto).
4. Se elimina (local y remota) inmediatamente después del merge.

## Ramas estratégicas de larga duración

Excepción única al ciclo anterior, para transformaciones que tocarían
`master` durante meses (ej. la futura `saas-v2`).

- **Máximo UNA rama estratégica viva a la vez.** Nunca dos.
- Se rebasa/sincroniza con `master` de forma frecuente para evitar
  divergencias tipo "38 commits adelante".
- Al terminar: merge `--no-ff` a `master` y eliminación.

## Tags internos

Al cerrar una etapa importante (auditoría integrada, baseline de
arquitectura, pre-release) se deja un tag anotado como referencia en el
historial, sin que implique release. Ejemplo: `architecture-baseline`
(2026-08-02, cierre de normalización fase 0 + auditorías + CI completo).

## Checklist de integración (resumen del PR template)

Antes de mergear cualquier rama a `master`:

- [ ] Tests de Server en verde (suite completa).
- [ ] Tests de Client en verde (suite completa).
- [ ] `npm audit --omit=dev --audit-level=high` sin fallos (lo aplica CI).
- [ ] Checklist de normalización del PR template
      (`.github/pull_request_template.md`) cuando aplique.
