#!/usr/bin/env node

/**
 * Backup de MongoDB → <repo>/backups/<dbName>_<ts>.tar.gz
 *
 * Uso:
 *   node scripts/backup-db.js                    # backup completo + tar.gz
 *   node scripts/backup-db.js --no-compress      # deja la carpeta sin comprimir
 *   node scripts/backup-db.js --keep=10          # rotación: solo últimos N
 *   node scripts/backup-db.js --mongodump=PATH   # path explícito a mongodump
 *
 * Lee MONGODB_URI desde Server/.env. Busca `mongodump` en:
 *   1. Flag --mongodump=<path>
 *   2. PATH del sistema
 *   3. Ubicaciones estándar según el SO:
 *      Windows: C:\Program Files\MongoDB\Tools\<ver>\bin\mongodump.exe
 *               C:\Program Files\MongoDB\Server\<ver>\bin\mongodump.exe
 *               <repo>\tools\mongo\bin\mongodump.exe
 *      macOS:   /opt/homebrew/bin/mongodump, /usr/local/bin/mongodump
 *      Linux:   /usr/bin/mongodump, /usr/local/bin/mongodump
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
const IS_WIN = process.platform === 'win32';
const MONGODUMP_EXE = IS_WIN ? 'mongodump.exe' : 'mongodump';

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

/**
 * Localiza `mongodump`:
 *  1. --mongodump=<path>
 *  2. PATH del sistema
 *  3. Ubicaciones estándar por SO
 *  4. Carpeta local <repo>/tools/mongo/bin (proyectos portables)
 *
 * Devuelve el path absoluto, o null si no se encontró.
 */
function findMongodump(argv) {
  // 1) Override explícito
  const overrideArg = argv.find((a) => a.startsWith('--mongodump='));
  if (overrideArg) {
    const explicitPath = overrideArg.slice('--mongodump='.length);
    if (fs.existsSync(explicitPath)) return explicitPath;
    console.warn(`⚠️  --mongodump apunta a un archivo inexistente: ${explicitPath}`);
  }

  // 2) PATH del sistema (usa `where`/`which` o probamos directo)
  const check = spawnSync(MONGODUMP_EXE, ['--version'], { encoding: 'utf8' });
  if (!check.error && check.status === 0) return MONGODUMP_EXE;

  // 3) Buscar en ubicaciones estándar
  const candidates = [];

  if (IS_WIN) {
    // 3a) Carpeta local del proyecto
    candidates.push(path.join(ROOT, 'tools', 'mongo', 'bin', 'mongodump.exe'));

    // 3b) MongoDB Database Tools (instalación oficial separada — recomendada)
    const programFilesList = [
      process.env['ProgramFiles'] || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ];
    for (const pf of programFilesList) {
      for (const subdir of ['Tools', 'Server']) {
        const baseDir = path.join(pf, 'MongoDB', subdir);
        try {
          if (fs.existsSync(baseDir)) {
            // Listar versiones instaladas y agregarlas como candidatos
            const versions = fs.readdirSync(baseDir);
            for (const v of versions) {
              candidates.push(path.join(baseDir, v, 'bin', 'mongodump.exe'));
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 3c) Chocolatey
    candidates.push('C:\\ProgramData\\chocolatey\\bin\\mongodump.exe');

    // 3d) Scoop
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, 'scoop', 'shims', 'mongodump.exe'));
    }
  } else {
    // macOS / Linux
    candidates.push(
      '/opt/homebrew/bin/mongodump',
      '/usr/local/bin/mongodump',
      '/usr/bin/mongodump',
      '/opt/mongodb/bin/mongodump',
      path.join(ROOT, 'tools', 'mongo', 'bin', 'mongodump'),
    );
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch { /* ignore */ }
  }

  return null;
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
    } else if (a.startsWith('--mongodump=')) {
      // se maneja en findMongodump
    } else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/backup-db.js [opciones]');
      console.log('');
      console.log('Opciones:');
      console.log('  --no-compress         No comprimir el dump (deja la carpeta cruda)');
      console.log('  --keep=N              Conservar solo los N backups más recientes');
      console.log('  --mongodump=PATH      Path explícito al binario de mongodump');
      console.log('  -h, --help            Muestra esta ayuda');
      process.exit(0);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // 1) Localizar mongodump (PATH o ubicaciones estándar de Windows/macOS/Linux)
  const mongodumpPath = findMongodump(process.argv.slice(2));
  if (!mongodumpPath) {
    console.error('❌ No se encontró mongodump.');
    console.error('');
    if (IS_WIN) {
      console.error('   En Windows, instala las MongoDB Database Tools:');
      console.error('     1. Descarga: https://www.mongodb.com/try/download/database-tools');
      console.error('     2. Instala el .msi (típicamente queda en C:\\Program Files\\MongoDB\\Tools)');
      console.error('     3. Reabre la terminal y vuelve a correr este script');
      console.error('');
      console.error('   O con Chocolatey:  choco install mongodb-database-tools');
      console.error('   O con Scoop:       scoop install mongodb-database-tools');
      console.error('');
      console.error('   También puedes indicar el path manualmente:');
      console.error('     node scripts/backup-db.js --mongodump="C:\\\\ruta\\\\a\\\\mongodump.exe"');
    } else {
      console.error('   macOS:  brew install mongodb-database-tools');
      console.error('   Linux:  apt install mongodb-database-tools');
      console.error('           (o descarga: https://www.mongodb.com/try/download/database-tools)');
    }
    process.exit(1);
  }

  console.log(`🔧 mongodump:  ${mongodumpPath}`);

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
  const dump = spawnSync(mongodumpPath, ['--uri', uri, '--out', backupDir], {
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
