#!/usr/bin/env bash
# C-1 (docs/PLAN_CIERRE_V1.md): único camino soportado para actualizar una
# instalación existente de DentiaCore. Orden fijo y no salteable:
#   1) backup (BD + uploads)
#   2) migrate:dry — aborta el update si falla, sin tocar nada
#   3) migrate
#   4) build del Client
#   5) reinicio del servicio (PM2 si está disponible)
#
# Uso:
#   ./update.sh
#
# Requiere: Node.js, `mongodump` en PATH (o ubicación estándar — ver
# scripts/backup-db.js), y opcionalmente PM2 para el reinicio automático.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo ""
echo "======================================================"
echo " DentiaCore — Actualización de instalación existente"
echo "======================================================"

echo ""
echo "[1/5] Respaldo de base de datos y uploads..."
# backup-db.js respalda BD + uploads (best-effort) y rota por familia.
node scripts/backup-db.js --keep=10

echo ""
echo "[2/5] Verificando migraciones pendientes (dry-run, no toca datos)..."
if ! npm run migrate:dry; then
  echo ""
  echo "❌ migrate:dry falló. Update ABORTADO antes de tocar datos o código."
  echo "   Revisa el error arriba y vuelve a correr ./update.sh cuando esté resuelto."
  exit 1
fi

echo ""
echo "[3/5] Aplicando migraciones..."
npm run migrate

echo ""
echo "[4/5] Compilando frontend..."
npm --prefix Client run build

echo ""
echo "[5/5] Reiniciando servidor..."
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe dentiacore-api >/dev/null 2>&1; then
    pm2 restart dentiacore-api --update-env
  else
    pm2 start Server/ecosystem.config.cjs --only dentiacore-api --update-env
  fi
  echo "✅ dentiacore-api reiniciado vía PM2."
else
  echo "⚠️  PM2 no encontrado en PATH. Reinicia el servidor manualmente, por ejemplo:"
  echo "    npm --prefix Server run start"
fi

echo ""
echo "✅ Actualización completa."
echo "   Verifica: curl http://localhost:5002/api/health"
