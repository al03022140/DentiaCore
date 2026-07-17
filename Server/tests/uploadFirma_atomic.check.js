'use strict';
/*
 * Check mínimo (sin frameworks) para el fix de subida de firma.
 *
 * Demuestra:
 *  (A) Por qué fallaba: `user.save()` revalida TODO el documento, así que un
 *      doctor CON cédula pero con un campo legado inválido (enum viejo en
 *      preferences.signatureInput) lanza ValidationError → el controller daba 500.
 *  (B) Por qué el fix lo resuelve: el controller corregido persiste el filename
 *      con findByIdAndUpdate({ runValidators:false }) y NUNCA llama a save(),
 *      así que la subida funciona aunque el documento tenga otro campo inválido.
 *
 * Correr:  node tests/uploadFirma_atomic.check.js   (desde la carpeta Server/)
 */
const assert = require('assert');
const path = require('path');
const SERVER = path.resolve(__dirname, '..');

let passed = 0;
const ok = (name) => { console.log('  ✓', name); passed += 1; };

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

(async () => {
  const Usuario = require(path.join(SERVER, 'models/users'));

  // ── (A) Repro del bug a nivel modelo ────────────────────────────────────
  const base = {
    nombre: 'Dra. Prueba',
    email: 'dra.prueba@clinica.mx',
    // Hash bcrypt ya existente: el pre('save') NO lo re-hashea (isModified=false)
    contraseña: '$2b$12$abcdefghijklmnopqrstuv0123456789012345678901234567890',
    rol: 'doctor',
    cedulaProfesional: '12345678', // ← la cédula SÍ está presente
  };

  const docInvalido = new Usuario({
    ...base,
    preferences: { signatureInput: 'wacom-legacy' }, // ← valor fuera del enum
  });
  const verr = docInvalido.validateSync();
  assert(verr && verr.name === 'ValidationError', 'esperaba ValidationError al validar (lo que hace save())');
  assert(verr.errors['preferences.signatureInput'], 'el fallo viene de un campo ajeno a la firma, no de la cédula');
  assert(!verr.errors.cedulaProfesional, 'la cédula presente NO es la que falla');
  ok('(A) save() revalida todo y revienta por un enum legado AUNQUE la cédula esté presente');

  const docValido = new Usuario({
    ...base,
    preferences: { signatureInput: 'stu' },
    firmaDigitalUrl: 'doc123_firma_123.png',
  });
  assert.strictEqual(docValido.validateSync(), undefined, 'con campos válidos, validate() pasa');
  ok('(A) la firma en sí es válida; el problema son los campos ajenos revalidados');

  // ── (B) El controller corregido no revalida el documento ────────────────
  let saveCalled = false;
  let updateArgs = null;

  Usuario.findById = () => ({
    // .select('firmaDigitalUrl') -> doc con un save() que LANZA (doc "inválido")
    select: async () => ({
      _id: 'doc123',
      firmaDigitalUrl: null,
      save: async () => {
        saveCalled = true;
        const e = new Error('Usuario validation failed'); e.name = 'ValidationError'; e.errors = {};
        throw e;
      },
    }),
  });
  Usuario.findByIdAndUpdate = async (id, update, opts) => {
    updateArgs = { id, update, opts };
    return { firmaDigitalUrl: update.$set.firmaDigitalUrl };
  };

  const { uploadFirma, deleteFirma } = require(path.join(SERVER, 'controllers/settingsController'));

  const req = { file: { filename: 'doc123_firma_999.png' }, user: { id: 'doc123' } };
  const res = mockRes();
  await uploadFirma(req, res);

  assert.strictEqual(saveCalled, false, 'el controller NO debe llamar user.save()');
  assert.strictEqual(res.statusCode, 200, `esperaba 200, recibió ${res.statusCode} (${res.body && res.body.message})`);
  assert.strictEqual(res.body.firmaDigitalUrl, 'doc123_firma_999.png', 'devuelve el nuevo filename');
  assert(updateArgs && updateArgs.opts && updateArgs.opts.runValidators === false, 'usa runValidators:false');
  assert(updateArgs.update.$set && 'firmaDigitalUrl' in updateArgs.update.$set, 'hace $set sólo de firmaDigitalUrl');
  ok('(B) uploadFirma persiste con update atómico (runValidators:false) y nunca llama save()');

  // ── (C) Mismo fix en deleteFirma ────────────────────────────────────────
  // El doc tiene firma (hay archivo que borrar) y un save() que LANZA. El
  // controller corregido debe borrar y vaciar el campo con update atómico,
  // sin llamar save(), y poniendo firmaDigitalUrl:null.
  saveCalled = false;
  updateArgs = null;
  Usuario.findById = () => ({
    select: async () => ({
      _id: 'doc123',
      firmaDigitalUrl: 'doc123_firma_old.png',
      save: async () => {
        saveCalled = true;
        const e = new Error('Usuario validation failed'); e.name = 'ValidationError'; e.errors = {};
        throw e;
      },
    }),
  });
  Usuario.findByIdAndUpdate = async (id, update, opts) => {
    updateArgs = { id, update, opts };
    return { firmaDigitalUrl: update.$set.firmaDigitalUrl };
  };

  const resDel = mockRes();
  await deleteFirma({ user: { id: 'doc123' } }, resDel);

  assert.strictEqual(saveCalled, false, 'deleteFirma NO debe llamar user.save()');
  assert.strictEqual(resDel.statusCode, 200, `esperaba 200, recibió ${resDel.statusCode} (${resDel.body && resDel.body.message})`);
  assert.strictEqual(resDel.body.message, 'Firma eliminada', 'confirma borrado');
  assert(updateArgs && updateArgs.opts && updateArgs.opts.runValidators === false, 'usa runValidators:false');
  assert(updateArgs.update.$set && updateArgs.update.$set.firmaDigitalUrl === null, 'vacía con firmaDigitalUrl:null');
  ok('(C) deleteFirma vacía con update atómico (firmaDigitalUrl:null, runValidators:false) y nunca llama save()');

  console.log(`\nTODO OK (${passed} asserts)`);
})().catch((e) => { console.error('\nFALLA:', e && e.stack || e); process.exit(1); });
