# Acta técnica de liberación — DentiaCore v1.1.0

Certifica que esta versión pasó todas las validaciones necesarias antes de
entrar en producción. Referencia única del estado liberado — no reconstruir
desde conversaciones, commits o documentación dispersa.

| Campo | Valor |
|---|---|
| **Versión** | v1.1.0 |
| **Commit** | `c959cb32` (master) |
| **Migraciones** | 0001–0008 (runner idempotente, backup-first) |
| **Tests Server** | ✅ 314/314 (27 suites) |
| **Tests Client** | ✅ 89/89 (14 suites) |
| **Audit Chain** | ✅ PASS — 919/919 entradas íntegras, 0 rupturas (`verify:audit`) |
| **Restore Test** | ✅ PASS — 7/7 pasos (`restore:test`, 2026-08-04): BD restaurada, server real arrancó con `/api/health` OK, cadena íntegra, documentos críticos válidos, 0 referencias de uploads rotas |
| **Backups** | ✅ PASS — BD + uploads diarios (cron/schtasks), rotación por familia, espejo opcional monitoreado, prueba de restauración mensual programada |
| **Health** | ✅ PASS — `/api/health` verificado dentro del restore-test (server operando sobre datos restaurados) |
| **Fecha de liberación** | 2026-08-04 |
| **Responsable** | Arley |

## Alcance de esta versión

Cierre de los 5 P0 operativos y de seguridad sobre la V1 funcional:

- **P0.1** — `update.sh`/`update.ps1` validados de punta a punta en ensayo local (backup → `migrate:dry` → migraciones → build → restart). Rollback demostrado con `restore-db.js`.
- **P0.2** — Secretos fuera del audit log: redactado en `AuditLog.registrar` antes de sellar + migración 0007 de re-sellado (`281ca21b`).
- **P0.3** — Key ring R-1: rotar `AUDIT_HMAC_SECRET` ya no invalida la historia; `keyId` por entrada, retiradas solo verifican (`dd8e79aa`).
- **P0.4** — Backups completos: uploads (PHI) en el respaldo diario, rotación por familia, espejo `BACKUP_MIRROR_DIR` con alerta (`223f1aa1`).
- **P0.5** — Prueba de restauración PASS/FAIL de punta a punta, mensual y monitoreada (`c959cb32`). Incluye fix de precedencia dotenv en `dent.js`.

## Pendiente para el acta de instalación

- [ ] **V-2**: ejecutar `./update.sh` (o `update.ps1`) contra la BD real de la clínica — ver [docs/server/operacion/instalacion-en-clinica.md](docs/server/operacion/instalacion-en-clinica.md).

| Campo | Valor |
|---|---|
| **Instalado en clínica (fecha)** | _pendiente_ |
| **Resultado** | _pendiente_ |

Todo lo posterior (backlog P1: `devError`, timing-safe compare, `verifyPin`, `.lean()`, `compression`, `React.lazy`, bugs de fechas/`round2`) pertenece al siguiente ciclo — no bloquea esta liberación.
