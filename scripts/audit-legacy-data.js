#!/usr/bin/env node
/**
 * Auditoría READ-ONLY de data en formato legacy.
 *
 * NO modifica nada. Se conecta a MongoDB definido en Server/.env y reporta:
 *   - Pacientes con schema modular obsoleto (informacion_personal/informacion_medica)
 *   - Periodontogramas con claves en inglés (plaque/bleeding/probingDepth/etc.)
 *   - Odontogramas con current.imageUrl o history[].imageUrl no vacíos (legacy PNG)
 *   - Archivos huérfanos en Server/uploads/pacientes/*\/odontograma-inicial/
 *   - Carpetas viejas Server/uploads/pacientes/*\/periodontograma/{superior,inferior}/
 *
 * Uso:
 *   node scripts/audit-legacy-data.js
 *   node scripts/audit-legacy-data.js --json   # salida machine-readable
 *
 * Exit codes:
 *   0 = no se encontró legacy data
 *   1 = se encontró legacy data (revisar reporte)
 *   2 = error al conectar / ejecutar
 */

/* eslint-disable no-console */
const path = require('path');
const fs = require('fs').promises;
const { createRequire } = require('module');

const projectRoot = __dirname.endsWith('scripts') ? path.resolve(__dirname, '..') : __dirname;
const serverDir = path.join(projectRoot, 'Server');

// Crear un `require` que actúa COMO SI fuera llamado desde Server/ — así Node
// resuelve mongoose, mongoose-unique-validator, etc. desde Server/node_modules.
// Sin esto, los models (que requieren 'mongoose-unique-validator', 'fs', etc.)
// fallan al cargar desde el directorio scripts/.
const serverRequire = createRequire(path.join(serverDir, 'package.json'));

// Cargar variables de entorno de forma autónoma — sin depender de dotenv
// instalado, que puede faltar en Server/node_modules tras un npm install parcial.
// Solo necesitamos MONGODB_URI.
function loadEnvFile(filePath) {
  try {
    const raw = require('fs').readFileSync(filePath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eq = trimmed.indexOf('=');
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* archivo no existe, OK */ }
}
loadEnvFile(path.join(serverDir, '.env'));
loadEnvFile(path.join(projectRoot, '.env'));

let mongoose;
try {
  mongoose = serverRequire('mongoose');
} catch (e) {
  console.error('❌ No se pudo cargar mongoose desde Server/node_modules.');
  console.error('   Ejecuta primero "npm install" en Server/.');
  console.error('   Error:', e.message);
  process.exit(2);
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/DentiaCore';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 20000,
  });
  return uri;
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');

const PERIODONTOGRAM_LEGACY_KEYS = ['plaque', 'bleeding', 'suppuration', 'gingivalMargin', 'probingDepth'];
const UPLOADS_BASE = path.join(serverDir, 'uploads', 'pacientes');

function log(...a) { if (!jsonMode) console.log(...a); }
function warn(...a) { if (!jsonMode) console.warn(...a); }

async function auditPatients() {
  const Patient = serverRequire('./models/patient');
  const total = await Patient.countDocuments({});
  // Cualquier paciente con campo informacion_personal o informacion_medica es legacy
  // (schema actual es FLAT).
  const legacyModular = await Patient.countDocuments({
    $or: [
      { informacion_personal: { $exists: true, $ne: null } },
      { informacion_medica: { $exists: true, $ne: null } }
    ]
  });
  return { collection: 'patients', total, legacy: legacyModular };
}

async function auditPeriodontogramas() {
  const Periodontogram = serverRequire('./models/periodontogram');
  const total = await Periodontogram.countDocuments({});

  // Buscamos cualquier diente que tenga clave en inglés en current.teeth o history.*.teeth.
  // No podemos hacer query agregada simple sobre Map por nombre dinámico — usamos sample.
  const docs = await Periodontogram.find({}, { current: 1, history: 1 }).lean();
  let withLegacyKeys = 0;
  const exampleIds = [];
  for (const doc of docs) {
    const teethMaps = [];
    if (doc?.current?.teeth) teethMaps.push(doc.current.teeth);
    if (Array.isArray(doc?.history)) {
      for (const h of doc.history) {
        if (h?.teeth) teethMaps.push(h.teeth);
      }
    }
    let hasLegacy = false;
    for (const teeth of teethMaps) {
      if (!teeth || typeof teeth !== 'object') continue;
      for (const toothKey of Object.keys(teeth)) {
        const tooth = teeth[toothKey];
        if (!tooth || typeof tooth !== 'object') continue;
        if (PERIODONTOGRAM_LEGACY_KEYS.some(k => k in tooth)) {
          hasLegacy = true;
          break;
        }
      }
      if (hasLegacy) break;
    }
    if (hasLegacy) {
      withLegacyKeys++;
      if (exampleIds.length < 5) exampleIds.push(String(doc._id));
    }
  }
  return { collection: 'periodontograms', total, legacy: withLegacyKeys, examples: exampleIds };
}

async function auditOdontogramas() {
  const Odontograma = serverRequire('./models/odontograma');
  const total = await Odontograma.countDocuments({});
  const withImageUrl = await Odontograma.countDocuments({
    $or: [
      { 'current.imageUrl': { $exists: true, $nin: [null, ''] } },
      { 'history.imageUrl': { $exists: true, $nin: [null, ''] } }
    ]
  });
  return { collection: 'odontogramas', total, legacy: withImageUrl };
}

async function auditUploads() {
  let orphanInitialPngs = 0;
  let oldPeriodontogramFolders = 0;
  const examples = [];

  try {
    await fs.access(UPLOADS_BASE);
  } catch {
    return { orphanInitialPngs: 0, oldPeriodontogramFolders: 0, examples: [], note: 'uploads/pacientes/ no existe' };
  }

  let patientDirs = [];
  try {
    patientDirs = await fs.readdir(UPLOADS_BASE);
  } catch (e) {
    return { error: e.message };
  }

  const Odontograma = serverRequire('./models/odontograma');

  for (const pid of patientDirs) {
    // Odontograma inicial: si la carpeta tiene PNGs pero el doc en MongoDB no los referencia → huérfanos
    const initialDir = path.join(UPLOADS_BASE, pid, 'odontograma-inicial');
    try {
      const files = await fs.readdir(initialDir);
      const pngs = files.filter(f => /\.png$/i.test(f));
      if (pngs.length > 0) {
        const doc = await Odontograma.findOne({ patient: pid }).select('current.imageUrl history.imageUrl').lean();
        const referenced = new Set();
        if (doc?.current?.imageUrl) referenced.add(path.basename(doc.current.imageUrl));
        if (Array.isArray(doc?.history)) {
          for (const h of doc.history) {
            if (h?.imageUrl) referenced.add(path.basename(h.imageUrl));
          }
        }
        const orphans = pngs.filter(f => !referenced.has(f));
        if (orphans.length > 0) {
          orphanInitialPngs += orphans.length;
          if (examples.length < 5) examples.push(`${pid}/odontograma-inicial/ (${orphans.length} PNG huérfanos)`);
        }
      }
    } catch { /* sin carpeta o sin acceso, skip */ }

    // Periodontograma: las carpetas superior/inferior son la estructura vieja
    for (const section of ['superior', 'inferior']) {
      try {
        const stat = await fs.stat(path.join(UPLOADS_BASE, pid, 'periodontograma', section));
        if (stat.isDirectory()) {
          oldPeriodontogramFolders++;
          if (examples.length < 8) examples.push(`${pid}/periodontograma/${section}/`);
        }
      } catch { /* no existe, OK */ }
    }
  }

  return { orphanInitialPngs, oldPeriodontogramFolders, examples };
}

function printReport(results) {
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log(' AUDITORÍA LEGACY DATA — DentiaCore');
  console.log('='.repeat(60) + '\n');

  console.log(`📊 Pacientes: ${results.patients.total} total`);
  if (results.patients.legacy > 0) {
    console.log(`   ⚠️  ${results.patients.legacy} con campo modular obsoleto (informacion_personal/informacion_medica)`);
  } else {
    console.log(`   ✅ Todos en formato flat actual`);
  }

  console.log(`\n📊 Periodontogramas: ${results.periodontogramas.total} total`);
  if (results.periodontogramas.legacy > 0) {
    console.log(`   ⚠️  ${results.periodontogramas.legacy} con claves legacy en inglés (plaque/bleeding/probingDepth/etc.)`);
    if (results.periodontogramas.examples?.length) {
      console.log(`   Ejemplos: ${results.periodontogramas.examples.join(', ')}`);
    }
    console.log(`   ⚠️  El validador RECHAZA escrituras a estos docs hasta migrar las claves a español.`);
  } else {
    console.log(`   ✅ Todos con claves en español`);
  }

  console.log(`\n📊 Odontogramas: ${results.odontogramas.total} total`);
  if (results.odontogramas.legacy > 0) {
    console.log(`   ⚠️  ${results.odontogramas.legacy} con imageUrl legacy (referencia a PNG en uploads/)`);
    console.log(`   ℹ️  La data clínica está en current.entries — los PNGs son solo snapshots visuales`);
  } else {
    console.log(`   ✅ Sin imageUrl legacy`);
  }

  console.log(`\n📊 Server/uploads/pacientes/`);
  if (results.uploads.note) {
    console.log(`   ℹ️  ${results.uploads.note}`);
  } else {
    if (results.uploads.orphanInitialPngs > 0) {
      console.log(`   ⚠️  ${results.uploads.orphanInitialPngs} PNG huérfanos en odontograma-inicial/`);
    }
    if (results.uploads.oldPeriodontogramFolders > 0) {
      console.log(`   ⚠️  ${results.uploads.oldPeriodontogramFolders} carpetas viejas superior/inferior del periodontograma`);
    }
    if (results.uploads.orphanInitialPngs === 0 && results.uploads.oldPeriodontogramFolders === 0) {
      console.log(`   ✅ Sin archivos huérfanos ni carpetas viejas`);
    }
    if (results.uploads.examples?.length) {
      console.log(`   Ejemplos:`);
      for (const ex of results.uploads.examples) console.log(`     - ${ex}`);
    }
  }

  const hasLegacy =
    results.patients.legacy > 0 ||
    results.periodontogramas.legacy > 0 ||
    results.odontogramas.legacy > 0 ||
    (results.uploads.orphanInitialPngs || 0) > 0 ||
    (results.uploads.oldPeriodontogramFolders || 0) > 0;

  console.log('\n' + '='.repeat(60));
  if (hasLegacy) {
    console.log(' RESULTADO: Se encontró data legacy.');
    console.log(' SIGUIENTE PASO: Comparte este reporte con el equipo dev para');
    console.log(' generar la migración específica. NO modifiques manualmente la DB.');
  } else {
    console.log(' RESULTADO: ✅ No se encontró data legacy. Todo está al día.');
  }
  console.log('='.repeat(60) + '\n');
}

(async () => {
  try {
    log('🔄 Conectando a MongoDB...');
    const usedUri = await connectMongo();
    log(`✅ Conectado a ${usedUri.replace(/\/\/.*?@/, '//***@')}\n`);

    const results = {
      timestamp: new Date().toISOString(),
      mongoUri: (process.env.MONGODB_URI || '').replace(/\/\/.*?@/, '//***@'),
      patients: await auditPatients(),
      periodontogramas: await auditPeriodontogramas(),
      odontogramas: await auditOdontogramas(),
      uploads: await auditUploads(),
    };

    printReport(results);

    await mongoose.disconnect();

    const hasLegacy =
      results.patients.legacy > 0 ||
      results.periodontogramas.legacy > 0 ||
      results.odontogramas.legacy > 0 ||
      (results.uploads.orphanInitialPngs || 0) > 0 ||
      (results.uploads.oldPeriodontogramFolders || 0) > 0;

    process.exit(hasLegacy ? 1 : 0);
  } catch (err) {
    console.error('❌ Error durante auditoría:', err.message);
    if (err.stack) console.error(err.stack);
    try { await mongoose.disconnect(); } catch { /* noop */ }
    process.exit(2);
  }
})();
