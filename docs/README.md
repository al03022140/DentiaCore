# Índice de documentación — DentiaCore

Punto de entrada a toda la documentación vigente del proyecto. Si buscas cómo instalar, actualizar u operar el sistema, empieza por [Server/README.md](../Server/README.md) y por [Operación](#operación) abajo.

## Auditorías y plan de cierre

- [PLAN_CIERRE_V1.md](PLAN_CIERRE_V1.md) — lista ejecutable de lo que falta para cerrar la V1, con criterios de aceptación y comandos de verificación. Empieza aquí si vas a cerrar pendientes.
- [AUDITORIA_TECNICA_INTEGRAL.md](AUDITORIA_TECNICA_INTEGRAL.md) — auditoría técnica completa (8 fases, 120 hallazgos) que dio origen al plan de cierre.
- [../CONFIG_AUDIT_2026-07-13.md](../CONFIG_AUDIT_2026-07-13.md) — auditoría dirigida de configuración (secretos, TZ, caché, `.env`).
- [../STATISTICS_AUDIT_2026-07-13.md](../STATISTICS_AUDIT_2026-07-13.md) — auditoría dirigida del módulo de estadísticas.

## Operación

- [server/operacion/configuracion-produccion.md](server/operacion/configuracion-produccion.md) — checklist de configuración para producción.
- [server/operacion/backups-y-restauracion.md](server/operacion/backups-y-restauracion.md) — respaldo y restauración de la base de datos.
- [server/operacion/migracion-0004-odontograma-versiones.md](server/operacion/migracion-0004-odontograma-versiones.md) — guía de la migración 0004 (versiones de odontograma).
- [server/MIGRACIONES_PENDIENTES.md](server/MIGRACIONES_PENDIENTES.md) — handoff histórico de migraciones (0001–0004).
- Actualizar una instalación existente: correr `./update.sh` (macOS/Linux) o `.\update.ps1` (Windows) desde la raíz del repo — único camino soportado (backup → `migrate:dry` → `migrate` → build → reinicio). Ver [../README.md](../README.md).

## Referencia técnica

- [API_CALLS_MAP.md](API_CALLS_MAP.md) — mapa de llamadas API cliente↔servidor.
- [server/roles.MD](server/roles.MD) — roles y matriz de permisos.
- [server/AUDIT_MODULES.md](server/AUDIT_MODULES.md) — módulos cubiertos por auditoría (backend).
- [server/PERIODONTOGRAMA.md](server/PERIODONTOGRAMA.md) · [server/inputs_periodontograma.md](server/inputs_periodontograma.md) · [server/periodontogram-normalization-schema.md](server/periodontogram-normalization-schema.md) — modelo de datos del periodontograma (backend).
- [cliente/AUDIT_MODULES.md](cliente/AUDIT_MODULES.md) — módulos cubiertos por auditoría (frontend).
- [cliente/design-system.md](cliente/design-system.md) — sistema de diseño del cliente.
- [cliente/analisis-datos-periodontograma.md](cliente/analisis-datos-periodontograma.md) · [cliente/periodontogram-mapping.md](cliente/periodontogram-mapping.md) — modelo de datos del periodontograma (frontend).
- [normalizacion/00-README.md](normalizacion/00-README.md) — punto de entrada al proceso de normalización de datos (ver también 01–03 en la misma carpeta).

## Convenciones

- Los reportes de auditoría dirigida por módulo (caja, odontograma, periodontograma, notas de evolución, add-patient, estadísticas, configuración) viven como commits individuales en `fix/auditoria-backend` — ver `git log` para el detalle de cada uno; los `.md` de la raíz (`CONFIG_AUDIT_*`, `STATISTICS_AUDIT_*`) son su rastro cuando el reporte es independiente del commit.
- Este índice no se actualiza solo — si agregas un runbook o reporte nuevo, enlázalo aquí.
