#!/usr/bin/env node
/**
 * AUDITORÍA DE DATOS LEGADOS EN USUARIOS  —  DRY-RUN, SOLO LECTURA
 * ────────────────────────────────────────────────────────────────────────────
 * Recorre TODA la colección de usuarios y, por cada documento, corre
 * `doc.validateSync()` (NO toca la BD) para detectar exactamente lo que tronaría
 * en un `user.save()`: enums fuera de rango (p.ej. `preferences.signatureInput`
 * o `preferences.theme`), email que ya no cumple el regex, cédula vacía en
 * doctores, y CUALQUIER otro validador síncrono que defina el schema.
 *
 * No hardcodea enums ni reglas: reusa el modelo real `Usuario` (models/users.js)
 * como única fuente de verdad. Es idempotente y NO escribe NADA en la BD
 * (cero `.save()`, cero updates). El único archivo que puede escribir es el
 * reporte JSON local si lo pides con `--json` (no toca Mongo).
 *
 * Uso (lee Server/.env automáticamente, igual que el server):
 *   node Server/scripts/audit-legacy-users.js
 *
 * Sobre-escribiendo la URI (mismo env que el server: MONGODB_URI):
 *   MONGODB_URI="mongodb://127.0.0.1:27017/DentiaCore" node Server/scripts/audit-legacy-users.js
 *
 * Volcar el detalle completo a un JSON local:
 *   node Server/scripts/audit-legacy-users.js --json users-audit.json
 *
 * Self-check de la lógica de detección (NO conecta a la BD):
 *   node Server/scripts/audit-legacy-users.js --selfcheck
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Usuario = require('../models/users');

const SAMPLE_MAX = 50;

// ── argv mínimo ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const SELFCHECK = args.includes('--selfcheck');
let jsonPath = null;
{
  const i = args.findIndex((a) => a === '--json' || a === '--out');
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) jsonPath = args[i + 1];
  else if (i !== -1) jsonPath = 'users-audit.json';
  for (const a of args) { const m = a.match(/^--(?:json|out)=(.+)$/); if (m) jsonPath = m[1]; }
}

/**
 * Audita UN documento Mongoose `Usuario`. Read-only: solo `validateSync()`.
 * @returns {null|{_id,email,rol,fields:Array<{path,value,kind,message}>}}
 */
function auditDoc(doc) {
  const err = doc.validateSync(); // no I/O, no muta el doc
  if (!err || !err.errors) return null;
  const fields = Object.keys(err.errors).map((p) => {
    const e = err.errors[p];
    let value;
    try {
      value = e.value && typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value);
    } catch { value = '[unserializable]'; }
    if (typeof value === 'string' && value.length > 120) value = value.slice(0, 117) + '...';
    return { path: e.path || p, value, kind: e.kind, message: e.message };
  });
  return { _id: String(doc._id), email: doc.email || null, rol: doc.rol || null, fields };
}

// ── Self-check sin BD: demuestra que la detección funciona ───────────────────
function runSelfCheck() {
  const assert = require('assert');

  // Doc LEGADO: doctor con cédula vacía + enums fuera de rango.
  const legacy = new Usuario({
    nombre: 'Dra. Legacy',
    email: 'legacy@clinica.mx',
    contraseña: 'x'.repeat(12), // ≥8; validateSync no corre el hook pre-save
    rol: 'doctor',
    cedulaProfesional: '', // ← vacía: inválida para doctor
    preferences: { theme: 'neon', signatureInput: 'wacom-legacy' }, // ← fuera de enum
  });
  const r1 = auditDoc(legacy);
  assert(r1, 'esperaba problemas en el doc legado');
  const paths = r1.fields.map((f) => f.path);
  assert(paths.includes('cedulaProfesional'), 'debe detectar cédula vacía en doctor');
  assert(paths.includes('preferences.signatureInput'), 'debe detectar signatureInput fuera de enum');
  assert(paths.includes('preferences.theme'), 'debe detectar theme fuera de enum');

  // Doc INVÁLIDO por email mal formado (validador distinto).
  const badEmail = new Usuario({
    nombre: 'Sr. Email', email: 'no-es-un-email', contraseña: 'x'.repeat(12), rol: 'asistente',
  });
  assert(auditDoc(badEmail)?.fields.some((f) => f.path === 'email'), 'debe detectar email inválido');

  // Doc VÁLIDO: no debe marcar nada.
  const ok = new Usuario({
    nombre: 'Dr. Válido', email: 'valido@clinica.mx', contraseña: 'x'.repeat(12),
    rol: 'doctor', cedulaProfesional: '1234567', preferences: { theme: 'system', signatureInput: 'stu' },
  });
  assert.strictEqual(auditDoc(ok), null, 'el doc válido no debe marcar nada');

  console.log('SELF-CHECK OK — detección por validateSync confirmada:');
  console.log('  • legacy detectado en:', paths.join(', '));
  console.log('  • email inválido detectado; doc válido limpio');
}

// ── Auditoría real (lectura completa con cursor) ─────────────────────────────
async function runAudit() {
  await connectDB(); // reusa EXACTAMENTE la conexión del server (MONGODB_URI)

  console.log('\n========== AUDIT LEGACY USERS — DRY-RUN (SOLO LECTURA) ==========');
  console.log('Modo read-only: cero writes a la BD, sin .save(), sin updates.\n');

  let scanned = 0;
  let withProblems = 0;
  const byPath = Object.create(null);
  const sample = [];
  const full = jsonPath ? [] : null;

  // Cursor: un documento a la vez (memoria estable en colecciones grandes).
  // Docs HIDRATADOS (no .lean()) — validateSync necesita una instancia real.
  const cursor = Usuario.find().cursor();
  for await (const doc of cursor) {
    scanned += 1;
    let res = null;
    try {
      res = auditDoc(doc);
    } catch (e) {
      res = { _id: String(doc?._id), email: doc?.email || null, rol: doc?.rol || null,
        fields: [{ path: '(hidratación/cast)', value: '', kind: 'cast', message: e.message }] };
    }
    if (res) {
      withProblems += 1;
      for (const f of res.fields) byPath[f.path] = (byPath[f.path] || 0) + 1;
      if (sample.length < SAMPLE_MAX) sample.push(res);
      if (full) full.push(res);
    }
  }

  console.log(`Escaneados:                 ${scanned}`);
  console.log(`Con problemas de validación: ${withProblems}`);

  if (withProblems === 0) {
    console.log('\n✅ Sin datos legados que rompan validateSync().');
  } else {
    console.log('\nDesglose por campo (path → # docs):');
    Object.entries(byPath).sort((a, b) => b[1] - a[1])
      .forEach(([p, c]) => console.log(`  ${p.padEnd(30)} ${c}`));

    console.log(`\nMuestra (máx ${SAMPLE_MAX} docs):`);
    for (const s of sample) {
      console.log(`  _id=${s._id}  rol=${s.rol || '—'}  email=${s.email || '—'}`);
      for (const f of s.fields) console.log(`      • ${f.path} = ${JSON.stringify(f.value)}  →  ${f.message}`);
    }
  }

  if (jsonPath) {
    const out = path.resolve(process.cwd(), jsonPath);
    fs.writeFileSync(out, JSON.stringify({ scanned, withProblems, byPath, docs: full }, null, 2));
    console.log(`\n📝 Detalle completo escrito en: ${out}  (archivo local, la BD no se tocó)`);
  }
  console.log('================================================================\n');
}

// ── Entry ────────────────────────────────────────────────────────────────────
(async () => {
  if (SELFCHECK) { runSelfCheck(); return; } // no conecta a la BD
  await runAudit();
})()
  .then(async () => { if (!SELFCHECK) await mongoose.connection.close(); })
  .catch(async (e) => {
    console.error('\n❌ Error en la auditoría:', e && e.stack || e);
    try { if (mongoose.connection.readyState) await mongoose.connection.close(); } catch { /* noop */ }
    process.exit(1);
  });
