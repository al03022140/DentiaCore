#!/usr/bin/env node

/**
 * Backup de MongoDB → <repo>/backups/<dbName>_<ts>.tar.gz
 *
 * Uso:
 *   node scripts/backup-db.js              # backup completo + tar.gz
 *   node scripts/backup-db.js --no-compress  # deja la carpeta sin comprimir
 *   node scripts/backup-db.js --keep=10    # tras backup, conserva solo los últimos N
 *
 * Lee MONGODB_URI desde Server/.env. Requiere `mongodump` en el PATH
 * (instalable con `brew install mongodb-database-tools` en macOS).
 *
 * NOM-024-SSA3-2012 §6.3 / LFPDPPP Art. 19: los respaldos del expediente
 * clínico contienen datos personales sensibles — guarda los archivos en
 * un medio cifrado y restringe permisos del sistema operativo.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'Server', '.env');
const BACKUP_BASE = path.join(ROOT, 'backups');
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/DentiaCore';

// ── Helpers ────────────────────────────────────────────────────

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

function parseDbFromUri(uri) {
  try {
    const u = new URL(uri);
    return u.pathname.replace(/^\//, '') || 'test';
  } catch {
    const m = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
    return m ? m[1] : 'test';
  }
}

function maskUri(uri) {
  // Oculta usuario:password si están presentes
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)[^:@/]+:[^@/]+@/, '$1***:***@');
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
  ].join('-') + '_' + [
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function rotateBackups(keepN) {
  if (!Number.isFinite(keepN) || keepN <= 0) return;
  const files = fs.readdirSync(BACKUP_BASE)
    .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUP_BASE, name)).mtimeMs }))
    .filter((e) => /\.(tar\.gz|tgz)$/.test(e.name) || fs.statSync(path.join(BACKUP_BASE, e.name)).isDirectory())
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of files.slice(keepN)) {
    const fullPath = path.join(BACKUP_BASE, old.name);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`🗑  Rotado: ${old.name}`);
    } catch (e) {
      console.warn(`⚠️  No se pudo borrar ${old.name}: ${e.message}`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { compress: true, keep: null };
  for (const a of argv) {
    if (a === '--no-compress') args.compress = false;
    else if (a.startsWith('--keep=')) {
      const n = Number(a.slice('--keep='.length));
      if (Number.isFinite(n) && n > 0) args.keep = n;
    } else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/backup-db.js [--no-compress] [--keep=N]');
      process.exit(0);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // 1) Verificar mongodump
  const dumpCheck = spawnSync('mongodump', ['--version'], { encoding: 'utf8' });
  if (dumpCheck.error || dumpCheck.status !== 0) {
    console.error('❌ mongodump no está disponible en el PATH.');
    console.error('   macOS:   brew install mongodb-database-tools');
    console.error('   Otros:   https://www.mongodb.com/try/download/database-tools');
    process.exit(1);
  }

  const uri = loadEnvValue('MONGODB_URI') || DEFAULT_URI;
  const dbName = parseDbFromUri(uri);
  const ts = timestamp();
  const backupDir = path.join(BACKUP_BASE, `${dbName}_${ts}`);

  console.log(`📦 Backup de ${dbName}`);
  console.log(`   URI:     ${maskUri(uri)}`);
  console.log(`   Destino: ${backupDir}`);

  fs.mkdirSync(BACKUP_BASE, { recursive: true });

  // 2) mongodump
  console.log('⏳ Ejecutando mongodump…');
  const dump = spawnSync('mongodump', ['--uri', uri, '--out', backupDir], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  if (dump.status !== 0) {
    console.error('❌ mongodump falló (revisa que MongoDB esté corriendo).');
    try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(dump.status || 1);
  }

  // 3) Comprimir (opcional)
  let finalPath = backupDir;
  if (args.compress) {
    const archive = `${backupDir}.tar.gz`;
    console.log('⏳ Comprimiendo a tar.gz…');
    const tar = spawnSync('tar', [
      '-czf', archive,
      '-C', BACKUP_BASE,
      path.basename(backupDir),
    ], { stdio: ['ignore', 'inherit', 'inherit'] });

    if (tar.status !== 0) {
      console.warn('⚠️  Compresión falló — se conserva el directorio sin comprimir.');
    } else {
      try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch { /* ignore */ }
      finalPath = archive;
    }
  }

  // 4) Rotación opcional
  if (args.keep) {
    rotateBackups(args.keep);
  }

  // 5) Reporte
  try {
    const stats = fs.statSync(finalPath);
    if (stats.isFile()) {
      const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`✅ Backup listo: ${finalPath} (${sizeMb} MB)`);
    } else {
      console.log(`✅ Backup listo: ${finalPath}`);
    }
  } catch {
    console.log(`✅ Backup listo: ${finalPath}`);
  }
}

main();
