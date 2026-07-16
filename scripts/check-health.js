#!/usr/bin/env node

/**
 * O-1: chequeo periódico de salud operativa, pensado para correr vía
 * cron/schtasks cada pocas horas (lo registran install.sh/install.ps1).
 * Alerta por webhook (ver Server/utils/alerts.js) ante:
 *   - respaldo de BD ausente o más viejo que --max-backup-age horas
 *   - /api/health degradado o inalcanzable (server caído o DB desconectada)
 *   - disco libre por debajo de --min-disk-gb
 *
 * Nunca falla "ruidoso": si un chequeo individual no se puede hacer (ej.
 * statfs no soportado en esta plataforma), lo reporta y sigue con el resto.
 *
 * Uso:
 *   node scripts/check-health.js
 *   node scripts/check-health.js --max-backup-age=30 --min-disk-gb=2
 *
 * Requiere ALERT_WEBHOOK_URL en Server/.env para efectivamente notificar;
 * sin él, igual imprime el resultado en consola (útil para logs de cron).
 */

const fs = require('fs');
const path = require('path');
const { sendAlert } = require('../Server/utils/alerts');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'Server', '.env');
const BACKUP_MARKER = path.join(ROOT, 'backups', 'last-success.json');

// Duplicado deliberado de loadEnvValue (ya vive en backup-db.js/restore-db.js):
// 15 líneas sin dependencias — no vale la pena una lib compartida para esto.
function loadEnvValue(key) {
  if (!fs.existsSync(ENV_FILE)) return null;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    if (k !== key) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

function parseArgs(argv) {
  const args = { maxBackupAgeHours: 26, minDiskGb: 1 };
  for (const a of argv) {
    if (a.startsWith('--max-backup-age=')) args.maxBackupAgeHours = Number(a.split('=')[1]) || args.maxBackupAgeHours;
    else if (a.startsWith('--min-disk-gb=')) args.minDiskGb = Number(a.split('=')[1]) || args.minDiskGb;
  }
  return args;
}

function checkBackup(maxAgeHours) {
  if (!fs.existsSync(BACKUP_MARKER)) {
    return { ok: false, message: `No existe ${BACKUP_MARKER} — el respaldo automático nunca corrió con éxito.` };
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(BACKUP_MARKER, 'utf8'));
  } catch (e) {
    return { ok: false, message: `last-success.json corrupto: ${e.message}` };
  }
  const ts = new Date(marker.timestamp).getTime();
  if (!Number.isFinite(ts)) {
    return { ok: false, message: 'last-success.json sin timestamp válido.' };
  }
  const ageHours = (Date.now() - ts) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return { ok: false, message: `Último respaldo exitoso hace ${ageHours.toFixed(1)}h (límite ${maxAgeHours}h).` };
  }
  return { ok: true, message: `Último respaldo exitoso hace ${ageHours.toFixed(1)}h.` };
}

async function checkHealthEndpoint() {
  const port = loadEnvValue('PORT') || '5002';
  const url = `http://127.0.0.1:${port}/api/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: `${url} respondió ${res.status} (db: ${body?.db?.status || 'desconocido'}).` };
    }
    return { ok: true, message: `${url} OK (db: ${body?.db?.status || 'desconocido'}).` };
  } catch (e) {
    return { ok: false, message: `${url} inalcanzable: ${e.message} (¿el servidor está corriendo?).` };
  }
}

function checkDisk(minGb) {
  try {
    const stats = fs.statfsSync(ROOT);
    const freeGb = (stats.bavail * stats.bsize) / 1024 ** 3;
    if (freeGb < minGb) {
      return { ok: false, message: `Disco libre: ${freeGb.toFixed(2)} GB (límite ${minGb} GB).` };
    }
    return { ok: true, message: `Disco libre: ${freeGb.toFixed(2)} GB.` };
  } catch (e) {
    // fs.statfsSync no está garantizado en toda plataforma/versión de Node — no
    // es un fallo del sistema monitoreado, solo del propio chequeo.
    return { ok: true, message: `No se pudo verificar disco (${e.message}) — omitido.` };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = {
    backup: checkBackup(args.maxBackupAgeHours),
    health: await checkHealthEndpoint(),
    disk: checkDisk(args.minDiskGb),
  };

  let anyFailed = false;
  for (const [key, r] of Object.entries(results)) {
    console.log(`${r.ok ? '✅' : '❌'} [${key}] ${r.message}`);
    if (!r.ok) {
      anyFailed = true;
      const sent = await sendAlert(`Chequeo de salud falló: ${key}`, { message: r.message });
      if (!sent) {
        console.log('   ⚠️  No se pudo enviar la alerta (¿ALERT_WEBHOOK_URL configurado en Server/.env?).');
      }
    }
  }

  process.exit(anyFailed ? 1 : 0);
}

main();
