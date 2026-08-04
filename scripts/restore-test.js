#!/usr/bin/env node

/**
 * P0.5 — Prueba de restauración de punta a punta (PASS/FAIL).
 *
 * "Un backup que nunca se restauró no es un backup, es una ilusión" — y un
 * mongorestore exitoso tampoco basta: hay que demostrar que LA APLICACIÓN
 * puede operar sobre lo restaurado y que los adjuntos (PHI) no dan 404.
 *
 * Pasos (criterio de aceptación):
 *   1. Restaurar el backup de BD en una BD temporal (restore-db.js --drop --force).
 *   2. Extraer el backup de uploads a un directorio temporal.
 *   3. Arrancar el servidor real contra la BD temporal y esperar /api/health OK.
 *   4. verify-audit-chain.js contra la BD temporal (cadena NOM-024 íntegra).
 *   5. migrate:dry (misma lógica del runner: pendientes = informativo, error = FAIL).
 *   6. Documentos críticos: pacientes/usuarios/citas presentes y con forma válida.
 *   7. Filesystem: uploads existe, legible, y CADA archivo referenciado por la
 *      BD (adjuntos, firmas de usuario, fotos de perfil) existe en disco.
 *      Huérfanos en disco se reportan como informativo (no FAIL).
 *
 * Resultado: PASS/FAIL por paso + marcador backups/restore-test-last.json
 * (check-health.js alerta si la prueba está vieja o falló) + alerta webhook en FAIL.
 *
 * Uso:
 *   node scripts/restore-test.js                     # usa el último par de backups
 *   node scripts/restore-test.js --backup=backups/DentiaCore_X.tar.gz --uploads=backups/uploads_X.tar.gz
 *   node scripts/restore-test.js --keep-temp         # no borra BD/carpeta temporal (debug)
 *   node scripts/restore-test.js --port=5102 --uri=mongodb://127.0.0.1:27017/DentiaCore_restore_test
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_BASE = path.join(ROOT, 'backups');
const MARKER = path.join(BACKUP_BASE, 'restore-test-last.json');
// El mongoose de Server/ (mismo que los modelos) — ver nota en migrate.js.
const connectDB = require(path.join(ROOT, 'Server', 'config', 'db'));
const { discoverMigrationFiles, computePending } = require('./migrate');
const { sendAlert } = require(path.join(ROOT, 'Server', 'utils', 'alerts'));

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/DentiaCore_restore_test';
const DEFAULT_PORT = 5102;

function parseArgs(argv) {
  const args = { backup: null, uploads: null, uri: DEFAULT_URI, port: DEFAULT_PORT, keepTemp: false };
  for (const a of argv) {
    if (a.startsWith('--backup=')) args.backup = a.slice('--backup='.length);
    else if (a.startsWith('--uploads=')) args.uploads = a.slice('--uploads='.length);
    else if (a.startsWith('--uri=')) args.uri = a.slice('--uri='.length);
    else if (a.startsWith('--port=')) args.port = Number(a.slice('--port='.length)) || DEFAULT_PORT;
    else if (a === '--keep-temp') args.keepTemp = true;
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/restore-test.js [--backup=X.tar.gz] [--uploads=Y.tar.gz] [--uri=<conn>] [--port=N] [--keep-temp]');
      process.exit(0);
    }
  }
  return args;
}

// Último archivo por prefijo en backups/ (mismo criterio que la rotación: mtime).
function latestBackup(prefix) {
  if (!fs.existsSync(BACKUP_BASE)) return null;
  const files = fs.readdirSync(BACKUP_BASE)
    .filter((n) => n.startsWith(prefix) && /\.(tar\.gz|tgz)$/.test(n))
    .map((n) => ({ n, mtime: fs.statSync(path.join(BACKUP_BASE, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(BACKUP_BASE, files[0].n) : null;
}

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', ...opts });
  return { ok: res.status === 0, status: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

// ── Pasos ───────────────────────────────────────────────────────

function pasoRestoreDb(backupPath, uri) {
  const r = run('node', [path.join('scripts', 'restore-db.js'), backupPath, `--uri=${uri}`, '--drop', '--force']);
  return r.ok
    ? { ok: true, message: `Restaurado ${path.basename(backupPath)} en BD temporal.` }
    : { ok: false, message: `restore-db.js falló (exit ${r.status}): ${r.out.slice(-300)}` };
}

function pasoExtraerUploads(uploadsTar, tempDir) {
  if (!uploadsTar) {
    return { ok: false, message: 'No hay backup de uploads (uploads_*.tar.gz) en backups/.' };
  }
  fs.mkdirSync(tempDir, { recursive: true });
  const r = run('tar', ['-xzf', uploadsTar, '-C', tempDir]);
  if (!r.ok) return { ok: false, message: `tar -xzf falló: ${r.out.slice(-200)}` };
  // El tar guarda la carpeta con su basename real (p. ej. "uploads/").
  const rootEntry = fs.readdirSync(tempDir)[0];
  if (!rootEntry) return { ok: false, message: 'El backup de uploads está vacío.' };
  return { ok: true, message: `Uploads extraídos (${path.basename(uploadsTar)}).`, uploadsRoot: path.join(tempDir, rootEntry) };
}

// Arranca el server real contra la BD temporal. dotenv NO pisa variables ya
// presentes en process.env, así que MONGODB_URI/PORT del hijo mandan.
async function pasoServidor(uri, port) {
  const child = spawn('node', [path.join('scripts', 'dent.js')], {
    cwd: path.join(ROOT, 'Server'),
    env: { ...process.env, MONGODB_URI: uri, PORT: String(port), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += d; });
  child.stderr.on('data', (d) => { serverOut += d; });

  const deadline = Date.now() + 30_000;
  let result = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      result = { ok: false, message: `El servidor murió al arrancar (exit ${child.exitCode}): ${serverOut.slice(-300)}` };
      break;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3_000) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        result = { ok: true, message: `Servidor arrancó sobre la restauración; /api/health OK (db: ${body?.db?.status || 'ok'}).` };
        break;
      }
      result = { ok: false, message: `/api/health respondió ${res.status} (db: ${body?.db?.status || '?'})` };
      break;
    } catch { /* aún no escucha — reintentar */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!result) result = { ok: false, message: 'Timeout (30 s) esperando /api/health.' };
  try { child.kill('SIGTERM'); } catch { /* ya muerto */ }
  return result;
}

function pasoAuditChain(uri) {
  const r = run('node', [path.join('scripts', 'verify-audit-chain.js'), `--uri=${uri}`]);
  return r.ok
    ? { ok: true, message: 'Cadena de auditoría NOM-024 íntegra en la restauración.' }
    : { ok: false, message: `verify-audit-chain falló: ${r.out.slice(-300)}` };
}

async function pasoMigrateDry(db) {
  try {
    const all = discoverMigrationFiles(path.join(ROOT, 'Server', 'migrations'));
    const applied = await db.collection('migrations').find({}, { projection: { id: 1 } }).toArray();
    const pending = computePending(all, new Set(applied.map((d) => d.id)));
    return {
      ok: true,
      message: pending.length === 0
        ? `Esquema al día (${all.length} migraciones, 0 pendientes).`
        : `Backup anterior al código actual: ${pending.length} migración(es) pendiente(s) (${pending.map((p) => p.id).join(', ')}) — correr migrate tras restaurar.`,
    };
  } catch (e) {
    return { ok: false, message: `migrate:dry falló sobre la restauración: ${e.message}` };
  }
}

async function pasoDocumentosCriticos(db) {
  const problemas = [];
  const conteos = {};
  for (const [col, minimo] of [['patients', 1], ['usuarios', 1], ['appointments', 0]]) {
    conteos[col] = await db.collection(col).countDocuments();
    if (conteos[col] < minimo) problemas.push(`${col}: ${conteos[col]} documentos (se esperaba ≥ ${minimo})`);
  }
  const paciente = await db.collection('patients').findOne({});
  if (paciente && (!paciente._id || !paciente.primer_nombre)) {
    problemas.push('el paciente de muestra no tiene la forma esperada (_id/primer_nombre)');
  }
  const usuario = await db.collection('usuarios').findOne({});
  if (usuario && (!usuario.email || !usuario['contraseña'])) {
    problemas.push('el usuario de muestra no tiene la forma esperada (email/contraseña)');
  }
  const resumen = Object.entries(conteos).map(([k, v]) => `${k}=${v}`).join(', ');
  return problemas.length === 0
    ? { ok: true, message: `Documentos críticos OK (${resumen}).` }
    : { ok: false, message: `Documentos críticos con problemas: ${problemas.join('; ')} (${resumen}).` };
}

function listFilesRec(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRec(full));
    else out.push(full);
  }
  return out;
}

async function pasoUploadsFs(db, uploadsRoot) {
  if (!uploadsRoot || !fs.existsSync(uploadsRoot)) {
    return { ok: false, message: 'La carpeta de uploads restaurada no existe.' };
  }
  const enDisco = listFilesRec(uploadsRoot);
  // Legibilidad: si un archivo restaurado no se puede leer, el server dará 500/404.
  const ilegibles = enDisco.filter((f) => {
    try { fs.accessSync(f, fs.constants.R_OK); return false; } catch { return true; }
  });

  // Cruce BD → disco: cada archivo que la BD referencia debe existir.
  const faltantes = [];
  const referenciados = new Set();
  const existeRel = (rel) => {
    const full = path.join(uploadsRoot, rel);
    referenciados.add(path.normalize(full));
    return fs.existsSync(full);
  };

  const adjuntos = await db.collection('patientattachments')
    .find({ deletedAt: null, url: { $regex: '^/uploads/' } }, { projection: { url: 1 } }).toArray();
  for (const a of adjuntos) {
    const rel = a.url.replace(/^\/uploads\//, '');
    if (!existeRel(rel)) faltantes.push(`adjunto ${a.url}`);
  }

  const firmas = await db.collection('usuarios')
    .find({ firmaDigitalUrl: { $nin: [null, ''] } }, { projection: { firmaDigitalUrl: 1 } }).toArray();
  for (const u of firmas) {
    const rel = u.firmaDigitalUrl.startsWith('/uploads/')
      ? u.firmaDigitalUrl.replace(/^\/uploads\//, '')
      : path.join('firmas', u.firmaDigitalUrl);
    if (!existeRel(rel)) faltantes.push(`firma de usuario ${u.firmaDigitalUrl}`);
  }

  const fotos = await db.collection('patients')
    .find({ photoURL: { $regex: '^/uploads/' } }, { projection: { photoURL: 1 } }).toArray();
  for (const p of fotos) {
    const rel = p.photoURL.replace(/^\/uploads\//, '');
    if (!existeRel(rel)) faltantes.push(`foto de paciente ${p.photoURL}`);
  }

  const huerfanos = enDisco.filter((f) => !referenciados.has(path.normalize(f))).length;
  const totalRefs = adjuntos.length + firmas.length + fotos.length;
  const resumen = `${enDisco.length} archivos en disco, ${totalRefs} referencias BD verificadas, ${huerfanos} sin referencia directa (informativo: incluye firmas de notas)`;

  if (faltantes.length > 0) {
    return { ok: false, message: `Referencias BD sin archivo (darían 404): ${faltantes.slice(0, 5).join('; ')}${faltantes.length > 5 ? ` …y ${faltantes.length - 5} más` : ''}. ${resumen}.` };
  }
  if (ilegibles.length > 0) {
    return { ok: false, message: `${ilegibles.length} archivo(s) restaurado(s) sin permiso de lectura. ${resumen}.` };
  }
  return { ok: true, message: `Uploads OK: ${resumen}.` };
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backupPath = args.backup || latestBackup(''.concat(parseDbPrefix()));
  const uploadsTar = args.uploads || latestBackup('uploads_');

  if (!backupPath || !fs.existsSync(backupPath)) {
    console.error('❌ No se encontró backup de BD (backups/<db>_*.tar.gz). Corre npm run backup:db primero.');
    process.exit(1);
  }

  const tempUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'dentia-restore-test-'));
  const resultados = {};

  console.log('══════════════════════════════════════════════════');
  console.log(' DentiaCore — Prueba de restauración (P0.5)');
  console.log(`   BD:      ${path.basename(backupPath)}`);
  console.log(`   Uploads: ${uploadsTar ? path.basename(uploadsTar) : '(ninguno)'}`);
  console.log(`   Destino: ${args.uri}`);
  console.log('══════════════════════════════════════════════════');

  console.log('\n[1/7] Restaurando BD temporal…');
  resultados.restore = pasoRestoreDb(backupPath, args.uri);

  console.log('[2/7] Extrayendo uploads…');
  const ext = pasoExtraerUploads(uploadsTar, tempUploads);
  resultados.uploads_extract = { ok: ext.ok, message: ext.message };

  let connection = null;
  if (resultados.restore.ok) {
    console.log('[3/7] Arrancando servidor contra la restauración…');
    resultados.servidor = await pasoServidor(args.uri, args.port);

    console.log('[4/7] Verificando cadena de auditoría…');
    resultados.audit_chain = pasoAuditChain(args.uri);

    connection = await connectDB({ uri: args.uri, exitOnFail: false });
    const db = connection.db;

    console.log('[5/7] migrate:dry…');
    resultados.migrate_dry = await pasoMigrateDry(db);

    console.log('[6/7] Documentos críticos…');
    resultados.documentos = await pasoDocumentosCriticos(db);

    console.log('[7/7] Filesystem de uploads…');
    resultados.uploads_fs = ext.ok
      ? await pasoUploadsFs(db, ext.uploadsRoot)
      : { ok: false, message: 'Sin uploads extraídos que verificar.' };
  } else {
    console.log('   (restore falló — se omiten los pasos siguientes)');
  }

  // ── Veredicto ─────────────────────────────────────────────────
  console.log('\n──────────────── RESULTADO ────────────────');
  let pass = true;
  for (const [paso, r] of Object.entries(resultados)) {
    console.log(`${r.ok ? '✅' : '❌'} [${paso}] ${r.message}`);
    if (!r.ok) pass = false;
  }
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — la copia ${pass ? 'es restaurable y funcional' : 'NO pasó la prueba de restauración'}.`);

  // Marcador para check-health.js + alerta activa en FAIL.
  try {
    fs.writeFileSync(MARKER, JSON.stringify({
      timestamp: new Date().toISOString(),
      pass,
      backup: path.basename(backupPath),
      uploads: uploadsTar ? path.basename(uploadsTar) : null,
      resultados: Object.fromEntries(Object.entries(resultados).map(([k, r]) => [k, { ok: r.ok, message: r.message }])),
    }, null, 2));
  } catch (e) {
    console.warn(`⚠️  No se pudo escribir ${MARKER}: ${e.message}`);
  }
  if (!pass) {
    await sendAlert('Prueba de restauración FALLÓ', {
      backup: path.basename(backupPath),
      fallos: Object.entries(resultados).filter(([, r]) => !r.ok).map(([k, r]) => `${k}: ${r.message}`),
    });
  }

  // ── Limpieza ──────────────────────────────────────────────────
  if (args.keepTemp) {
    console.log(`\nℹ️  --keep-temp: BD ${args.uri} y ${tempUploads} conservados para inspección.`);
  } else {
    try {
      if (connection) await connection.dropDatabase();
      else {
        connection = await connectDB({ uri: args.uri, exitOnFail: false });
        await connection.dropDatabase();
      }
    } catch (e) {
      console.warn(`⚠️  No se pudo borrar la BD temporal: ${e.message}`);
    }
    try { fs.rmSync(tempUploads, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  if (connection) { try { await connection.close(); } catch { /* ignore */ } }

  process.exit(pass ? 0 : 1);
}

// Prefijo <dbName>_ del backup de BD, leído del .env (igual que backup-db.js).
function parseDbPrefix() {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, 'Server', '.env'), 'utf8');
    const m = envFile.match(/^MONGODB_URI=(.+)$/m);
    const uri = m ? m[1].trim() : '';
    const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'DentiaCore';
    return `${dbName}_`;
  } catch {
    return 'DentiaCore_';
  }
}

main().catch((e) => {
  console.error(`❌ Error inesperado en la prueba de restauración: ${e.message}`);
  process.exit(1);
});
