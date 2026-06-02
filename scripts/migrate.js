#!/usr/bin/env node

/**
 * Runner de migraciones de esquema/datos — DentiaCore.
 *
 * Aplica las migraciones pendientes de Server/migrations/NNNN-*.js, en orden,
 * UNA sola vez cada una (idempotente a nivel de runner: registra las aplicadas
 * en la colección `migrations`). Antes de aplicar cualquier pendiente, toma un
 * BACKUP automático (backup-first). El rollback es restaurar ese backup
 * (ver docs/operacion/backups-y-restauracion.md) — no hay `down()`.
 *
 * Cada migración exporta:
 *   module.exports = {
 *     id: '0001-descripcion',                 // = nombre de archivo sin .js
 *     async up(db) { ... }                     // db = handle nativo (mongoose.connection.db)
 *   };
 * La función up DEBE ser idempotente (ver Server/migrations/README.md y las
 * trampas de Mongoose del doc 03 §14).
 *
 * Uso:
 *   node scripts/migrate.js              # aplica pendientes (con backup previo)
 *   node scripts/migrate.js --dry-run    # lista pendientes, no aplica
 *   node scripts/migrate.js --no-backup  # omite el backup (solo BD scratch/test)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'Server', '.env');
const MIGRATIONS_DIR = path.join(ROOT, 'Server', 'migrations');
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/DentiaCore';
const COLLECTION = 'migrations';

function loadEnvValue(key) {
  if (!fs.existsSync(ENV_FILE)) return null;
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

// ── Lógica pura (exportada para pruebas) ───────────────────────

// Descubre los archivos de migración válidos (NNNN-*.js), ordenados.
// Devuelve [{ id, file }]. No requiere los módulos (eso lo hace el runner).
function discoverMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{4}[-_].+\.js$/.test(name))
    .sort() // los prefijos NNNN con ceros ordenan correctamente lexicográficamente
    .map((file) => ({ id: file.replace(/\.js$/, ''), file }));
}

// Dadas las migraciones descubiertas y el set de ids ya aplicadas, devuelve las pendientes.
function computePending(migrations, appliedIds) {
  const applied = appliedIds instanceof Set ? appliedIds : new Set(appliedIds || []);
  return migrations.filter((m) => !applied.has(m.id));
}

function parseArgs(argv) {
  const args = { dryRun: false, backup: true };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-backup') args.backup = false;
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/migrate.js [--dry-run] [--no-backup]');
      console.log('  --dry-run     Lista las migraciones pendientes y NO aplica nada.');
      console.log('  --no-backup   Omite el backup previo (solo para BD scratch/test).');
      process.exit(0);
    }
  }
  return args;
}

function runBackup() {
  console.log('📦 Backup previo (backup-first)…');
  const res = spawnSync('node', [path.join('scripts', 'backup-db.js'), '--keep=30'], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return res.status === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = loadEnvValue('MONGODB_URI') || DEFAULT_URI;

  const all = discoverMigrationFiles(MIGRATIONS_DIR);
  if (all.length === 0) {
    console.log('ℹ️  No hay migraciones en Server/migrations/. Nada que hacer.');
    return;
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  try {
    const appliedDocs = await db.collection(COLLECTION).find({}, { projection: { id: 1 } }).toArray();
    const appliedIds = new Set(appliedDocs.map((d) => d.id));
    const pending = computePending(all, appliedIds);

    if (pending.length === 0) {
      console.log(`✅ Esquema al día (${all.length} migraciones, 0 pendientes).`);
      return;
    }

    console.log(`🔎 Pendientes (${pending.length}): ${pending.map((p) => p.id).join(', ')}`);
    if (args.dryRun) {
      console.log('🔒 DRY-RUN: no se aplicó nada.');
      return;
    }

    if (args.backup && !runBackup()) {
      console.error('❌ El backup previo falló — se ABORTA la migración (no se aplicó nada).');
      process.exitCode = 1;
      return;
    }

    for (const { id, file } of pending) {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      if (typeof migration.up !== 'function') {
        throw new Error(`La migración ${id} no exporta una función up(db).`);
      }
      console.log(`⏳ Aplicando ${id}…`);
      await migration.up(db);
      await db.collection(COLLECTION).insertOne({ id, appliedAt: new Date() });
      console.log(`   ✓ ${id} aplicada y registrada.`);
    }
    console.log(`✅ ${pending.length} migración(es) aplicada(s).`);
  } catch (err) {
    console.error(`❌ Falló la migración: ${err.message}`);
    console.error('   Nada quedó a medias en el registro; corrige y vuelve a correr (las up son idempotentes).');
    console.error('   Si los datos quedaron inconsistentes, restaura el backup previo (docs/operacion/backups-y-restauracion.md).');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

// Exporta lógica pura para pruebas; ejecuta main() solo si se invoca directo.
module.exports = { discoverMigrationFiles, computePending };
if (require.main === module) {
  main();
}
