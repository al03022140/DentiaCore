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

// Prueba de restauración (P0.5): un backup solo cuenta si se demostró
// restaurable. restore-test.js corre mensualmente (cron/schtasks) y deja
// marcador; aquí alertamos si falló o si lleva demasiado sin correr.
const RESTORE_MARKER = path.join(ROOT, 'backups', 'restore-test-last.json');

function checkRestoreTest(maxAgeDays = 40) {
  if (!fs.existsSync(RESTORE_MARKER)) {
    return { ok: true, message: 'Prueba de restauración aún sin correr (la programación mensual la creará) — omitida.' };
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(RESTORE_MARKER, 'utf8'));
  } catch (e) {
    return { ok: false, message: `restore-test-last.json corrupto: ${e.message}` };
  }
  if (!marker.pass) {
    return { ok: false, message: `La última prueba de restauración FALLÓ (${marker.timestamp}) — el backup NO está demostrado restaurable. Corre: npm run restore:test` };
  }
  const ageDays = (Date.now() - new Date(marker.timestamp).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > maxAgeDays) {
    return { ok: false, message: `Última prueba de restauración PASS hace ${ageDays.toFixed(0)} días (límite ${maxAgeDays}).` };
  }
  return { ok: true, message: `Última prueba de restauración PASS hace ${ageDays.toFixed(1)} días (${marker.backup}).` };
}

// Espejo (BACKUP_MIRROR_DIR): si está configurado y la última corrida no pudo
// copiar al segundo medio (USB desconectado, NAS caído), hay que enterarse —
// un espejo que falla en silencio es no tener espejo.
function checkMirror() {
  if (!fs.existsSync(BACKUP_MARKER)) {
    return { ok: true, message: 'Sin marcador de backup aún — espejo omitido.' };
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(BACKUP_MARKER, 'utf8'));
  } catch {
    return { ok: true, message: 'Marcador ilegible — el chequeo de backup ya lo reporta.' };
  }
  if (!marker?.mirror?.configured) {
    return { ok: true, message: 'Espejo no configurado (BACKUP_MIRROR_DIR) — omitido.' };
  }
  if (marker.mirror.ok) {
    return { ok: true, message: `Espejo OK en ${marker.mirror.dir}.` };
  }
  return { ok: false, message: `El espejo a ${marker.mirror.dir} falló en la última corrida: ${marker.mirror.error || 'sin detalle'}.` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = {
    backup: checkBackup(args.maxBackupAgeHours),
    mirror: checkMirror(),
    restoreTest: checkRestoreTest(),
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
