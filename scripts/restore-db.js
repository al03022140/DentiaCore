#!/usr/bin/env node

/**
 * Restore de MongoDB desde un backup creado por scripts/backup-db.js
 * (carpeta `<db>_<ts>/` o archivo `<db>_<ts>.tar.gz`).
 *
 * SEGURO POR DISEÑO:
 *   - DRY-RUN por defecto: imprime el plan y NO toca nada. Requiere --force.
 *   - --drop es opt-in (sin él, mongorestore inserta sin borrar lo existente).
 *   - Permite restaurar a una BD destino DISTINTA (--uri) para PROBAR el restore
 *     sin clobberar producción (workflow recomendado de "restauración probada").
 *
 * Uso:
 *   # 1) Ver el plan (no ejecuta nada):
 *   node scripts/restore-db.js backups/DentiaCore_2026-06-02_1200.tar.gz \
 *        --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test"
 *
 *   # 2) Ejecutar la prueba de restore en una BD scratch:
 *   node scripts/restore-db.js backups/DentiaCore_2026-06-02_1200.tar.gz \
 *        --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test" --drop --force
 *
 *   # 3) Restore real a producción (recuperación ante desastre):
 *   node scripts/restore-db.js backups/DentiaCore_<ts>.tar.gz --drop --force
 *   (sin --uri usa MONGODB_URI de Server/.env)
 *
 * NOM-024 / LFPDPPP: los backups contienen PHI. Manéjalos cifrados, restringe
 * permisos del SO y NUNCA restaures un backup ajeno a la clínica destino.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'Server', '.env');
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/DentiaCore';
const IS_WIN = process.platform === 'win32';
const MONGORESTORE_EXE = IS_WIN ? 'mongorestore.exe' : 'mongorestore';

// ── Helpers (mismos que backup-db.js) ──────────────────────────

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

// Devuelve la URI sin el path de BD (host-level), para usar con --nsFrom/--nsTo.
function hostLevelUri(uri) {
  try {
    const u = new URL(uri);
    u.pathname = '';
    return u.toString();
  } catch {
    return uri.replace(/(mongodb(?:\+srv)?:\/\/[^/]+)\/[^?]*/, '$1');
  }
}

function maskUri(uri) {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)[^:@/]+:[^@/]+@/, '$1***:***@');
}

function findMongorestore(argv) {
  const overrideArg = argv.find((a) => a.startsWith('--mongorestore='));
  if (overrideArg) {
    const explicitPath = overrideArg.slice('--mongorestore='.length);
    if (fs.existsSync(explicitPath)) return explicitPath;
    console.warn(`⚠️  --mongorestore apunta a un archivo inexistente: ${explicitPath}`);
  }

  const check = spawnSync(MONGORESTORE_EXE, ['--version'], { encoding: 'utf8' });
  if (!check.error && check.status === 0) return MONGORESTORE_EXE;

  const candidates = [];
  if (IS_WIN) {
    candidates.push(path.join(ROOT, 'tools', 'mongo', 'bin', 'mongorestore.exe'));
    const programFilesList = [
      process.env['ProgramFiles'] || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ];
    for (const pf of programFilesList) {
      for (const subdir of ['Tools', 'Server']) {
        const baseDir = path.join(pf, 'MongoDB', subdir);
        try {
          if (fs.existsSync(baseDir)) {
            for (const v of fs.readdirSync(baseDir)) {
              candidates.push(path.join(baseDir, v, 'bin', 'mongorestore.exe'));
            }
          }
        } catch { /* ignore */ }
      }
    }
    candidates.push('C:\\ProgramData\\chocolatey\\bin\\mongorestore.exe');
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, 'scoop', 'shims', 'mongorestore.exe'));
    }
  } else {
    candidates.push(
      '/opt/homebrew/bin/mongorestore',
      '/usr/local/bin/mongorestore',
      '/usr/bin/mongorestore',
      '/opt/mongodb/bin/mongorestore',
      path.join(ROOT, 'tools', 'mongo', 'bin', 'mongorestore'),
    );
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return null;
}

// Localiza la carpeta-dump (la que contiene subcarpetas de BD con .bson).
// Acepta: un .tar.gz (lo extrae a temp), una carpeta `<db>_<ts>`, o la carpeta `<db>`.
function resolveDumpRoot(inputPath, tmpDirs) {
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ No existe el backup: ${inputPath}`);
    process.exit(1);
  }

  let dumpRoot = inputPath;
  if (/\.(tar\.gz|tgz)$/.test(inputPath)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dentia-restore-'));
    tmpDirs.push(tmp);
    const tar = spawnSync('tar', ['-xzf', inputPath, '-C', tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
    if (tar.status !== 0) {
      console.error('❌ No se pudo extraer el tar.gz.');
      process.exit(1);
    }
    // El tar contiene una sola carpeta top-level `<db>_<ts>/`
    const tops = fs.readdirSync(tmp).filter((n) => fs.statSync(path.join(tmp, n)).isDirectory());
    dumpRoot = tops.length === 1 ? path.join(tmp, tops[0]) : tmp;
  }

  // dumpRoot debe contener subcarpetas de BD (cada una con archivos .bson).
  // Si dumpRoot ES la carpeta de BD (contiene .bson directo), subimos un nivel virtual.
  const entries = fs.readdirSync(dumpRoot, { withFileTypes: true });
  const hasBson = entries.some((e) => e.isFile() && e.name.endsWith('.bson'));
  if (hasBson) {
    // dumpRoot es la carpeta de la BD; su nombre es el nombre de la BD origen.
    return { dumpRoot: path.dirname(dumpRoot), srcDb: path.basename(dumpRoot) };
  }
  const dbDirs = entries.filter((e) => e.isDirectory());
  if (dbDirs.length === 0) {
    console.error('❌ El backup no contiene carpetas de base de datos reconocibles.');
    process.exit(1);
  }
  // Normalmente una sola BD por backup.
  return { dumpRoot, srcDb: dbDirs[0].name };
}

function parseArgs(argv) {
  const args = { force: false, drop: false, uri: null, backup: null };
  for (const a of argv) {
    if (a === '--force') args.force = true;
    else if (a === '--drop') args.drop = true;
    else if (a.startsWith('--uri=')) args.uri = a.slice('--uri='.length);
    else if (a.startsWith('--mongorestore=')) { /* findMongorestore */ }
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/restore-db.js <backup.tar.gz|carpeta> [opciones]');
      console.log('');
      console.log('Opciones:');
      console.log('  --uri=<conn>          BD destino (default: MONGODB_URI de Server/.env)');
      console.log('  --drop                Borra las colecciones destino antes de restaurar');
      console.log('  --force               EJECUTA el restore (sin esto: dry-run, solo muestra el plan)');
      console.log('  --mongorestore=PATH   Path explícito al binario de mongorestore');
      console.log('  -h, --help            Muestra esta ayuda');
      console.log('');
      console.log('Para PROBAR el restore sin tocar producción, usa --uri a una BD scratch:');
      console.log('  ...restore-db.js backups/X.tar.gz --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test" --drop --force');
      process.exit(0);
    } else if (!a.startsWith('--')) {
      args.backup = a;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.backup) {
    console.error('❌ Falta indicar el backup a restaurar. Usa --help para ver el uso.');
    process.exit(1);
  }

  const targetUri = args.uri || loadEnvValue('MONGODB_URI') || DEFAULT_URI;
  const targetDb = parseDbFromUri(targetUri);

  const tmpDirs = [];
  try {
    const { dumpRoot, srcDb } = resolveDumpRoot(args.backup, tmpDirs);

    console.log('🩺 Plan de restauración');
    console.log(`   Backup:   ${args.backup}`);
    console.log(`   BD origen:  ${srcDb}`);
    console.log(`   BD destino: ${targetDb}   (${maskUri(targetUri)})`);
    console.log(`   --drop:   ${args.drop ? 'SÍ (borra colecciones destino)' : 'no'}`);

    // Aviso si el destino parece ser la BD de producción (misma que .env).
    const envUri = loadEnvValue('MONGODB_URI');
    if (envUri && parseDbFromUri(envUri) === targetDb && !args.uri) {
      console.log('   ⚠️  El destino es la BD de PRODUCCIÓN (MONGODB_URI). Asegúrate de tener un backup fresco antes.');
    }

    const mongorestorePath = findMongorestore(process.argv.slice(2));
    if (!mongorestorePath) {
      console.log('');
      console.log('ℹ️  No se encontró mongorestore en este equipo (parte de MongoDB Database Tools).');
      console.log('    Instálalo igual que mongodump (ver scripts/backup-db.js) para ejecutar el restore.');
      if (args.force) process.exit(1);
    } else {
      console.log(`   mongorestore: ${mongorestorePath}`);
    }

    // Comando mongorestore (remapea srcDb → targetDb con --nsFrom/--nsTo).
    const restoreArgs = [
      '--uri', hostLevelUri(targetUri),
      `--nsFrom=${srcDb}.*`,
      `--nsTo=${targetDb}.*`,
    ];
    if (args.drop) restoreArgs.push('--drop');
    restoreArgs.push(dumpRoot);

    console.log('');
    console.log(`   $ mongorestore ${restoreArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);

    if (!args.force) {
      console.log('');
      console.log('🔒 DRY-RUN: no se ejecutó nada. Agrega --force para restaurar de verdad.');
      return;
    }

    console.log('');
    console.log('⏳ Ejecutando mongorestore…');
    const res = spawnSync(mongorestorePath, restoreArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (res.status !== 0) {
      console.error('❌ mongorestore falló.');
      process.exit(res.status || 1);
    }
    console.log(`✅ Restore completado en la BD "${targetDb}".`);
    console.log('   Verifica: conteos por colección y que las firmas NOM-024 sigan válidas.');
  } finally {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

main();
