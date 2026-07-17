/**
 * Tests de regresión de la auditoría dirigida del ODONTOGRAMA (2026-07-12).
 * Cada bloque reproduce un hallazgo que fallaba ANTES del fix:
 *
 *  S1 — versionName duplicado en Mongo standalone: el doc principal se
 *       actualizaba ANTES de que el insert de la versión fallara con E11000,
 *       dejando `current` con los datos del guardado RECHAZADO.
 *  S2 — entradas null / con campos no escalares → TypeError o CastError → 500.
 *       Ahora 400 con código claro. manejarError además mapea los
 *       ValidationError/CastError de Mongoose a 400.
 *  S3 — sin cotas: note/damage/surface/versionName/cantidad de entries sin
 *       límite. Ahora 400 (middleware) + maxlength en schema como backstop.
 *
 * Autocontenido con MongoMemoryServer (sin mongod local ni pila HTTP).
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const OdontogramaHistory = require('../models/odontogramaHistory');
const OdontogramaModel = require('../models/odontograma');
const {
  saveClinicalHistoryEntries,
  validarEntradasOdontograma,
  manejarError
} = require('../controllers/odontogramaController');

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }
});
const throwingNext = (e) => { throw e; };

const buildSaveReq = (patientId, userId, validatedEntries, body = {}) => ({
  patient: { id: String(patientId) },
  user: { id: String(userId), role: 'doctor' },
  body,
  validatedEntries,
  query: {}
});

const entry = (tooth, damage, surface = 'O', note = '') => ({ tooth, space: '', damage, surface, note });

// Corre el middleware de validación sobre un body y devuelve { res, nextCalled }.
const runValidation = (bodyEntries) => {
  const req = { body: { entries: bodyEntries } };
  const res = mockRes();
  let nextCalled = false;
  validarEntradasOdontograma(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
};

describe('Odontograma — fixes de auditoría', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(mongoServer.getUri());
    await OdontogramaHistory.createIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db.collection('odontograma_history').deleteMany({});
    await mongoose.connection.db.collection('odontogramas').deleteMany({});
  });

  // ── S1: versionName duplicado NO corrompe current (standalone) ──────────
  describe('S1 — conflicto de versionName no toca el documento principal', () => {
    test('409 y current queda EXACTAMENTE como estaba', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      // Primer guardado con nombre explícito.
      const res1 = mockRes();
      await saveClinicalHistoryEntries(
        buildSaveReq(patientId, userId, [entry('11', '1')], { versionName: 'consulta-enero' }),
        res1, throwingNext
      );
      expect(res1.statusCode).toBe(201);

      // Segundo guardado con DATOS DISTINTOS pero el MISMO nombre → 409.
      const res2 = mockRes();
      await saveClinicalHistoryEntries(
        buildSaveReq(patientId, userId, [entry('33', '5')], { versionName: 'consulta-enero' }),
        res2, throwingNext
      );
      expect(res2.statusCode).toBe(409);
      expect(res2.body.error.code).toBe('VERSION_NAME_CONFLICT');

      // Lo importante: el doc principal NO se actualizó con los datos del
      // guardado rechazado (antes del fix, en standalone, current.datos
      // quedaba con el diente 33 pese al 409).
      const doc = await OdontogramaModel.findOne({ patientId, type: 'clinic' }).lean();
      expect(doc.current.versionName).toBe('consulta-enero');
      expect(doc.current.datos).toHaveLength(1);
      expect(doc.current.datos[0].tooth).toBe('11');
      expect(doc.current.datos[0].damage).toBe('1');

      // Y la colección de versiones sigue con una sola versión (la original).
      expect(await OdontogramaHistory.countDocuments({ patient: patientId })).toBe(1);
    });
  });

  // ── S2: entradas malformadas → 400, nunca 500 ───────────────────────────
  describe('S2 — tipos inválidos responden 400', () => {
    test('entrada null en el array → 400 INVALID_ENTRY (antes TypeError → 500)', () => {
      const { res, nextCalled } = runValidation([null]);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ENTRY');
    });

    test('entrada con campo objeto (note) → 400 INVALID_ENTRY (antes CastError → 500)', () => {
      const { res, nextCalled } = runValidation([{ tooth: '11', damage: '1', note: { a: 1 } }]);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ENTRY');
    });

    test('entrada que es un array → 400', () => {
      const { res, nextCalled } = runValidation([['11', '1']]);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });

    test('campos numéricos del engine se coercen a string y pasan', () => {
      const { req, res, nextCalled } = runValidation([{ tooth: 11, damage: 1, surface: 0 }]);
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(req.validatedEntries[0]).toMatchObject({ tooth: '11', damage: '1', surface: '0' });
    });

    test('manejarError mapea ValidationError de Mongoose a 400 (antes 500)', () => {
      const err = new mongoose.Error.ValidationError();
      const res = mockRes();
      manejarError(err, { }, res, throwingNext);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('manejarError mapea CastError de Mongoose a 400', () => {
      const err = new mongoose.Error.CastError('String', {}, 'note');
      const res = mockRes();
      manejarError(err, { }, res, throwingNext);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── S3: cotas de tamaño ──────────────────────────────────────────────────
  describe('S3 — límites de longitud y cantidad', () => {
    test('note > 2000 chars → 400 ENTRY_FIELD_TOO_LONG', () => {
      const { res, nextCalled } = runValidation([{ tooth: '11', damage: '1', note: 'x'.repeat(2001) }]);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('ENTRY_FIELD_TOO_LONG');
    });

    test('damage > 100 chars → 400; surface > 20 chars → 400', () => {
      const d = runValidation([{ tooth: '11', damage: 'd'.repeat(101) }]);
      expect(d.res.statusCode).toBe(400);
      const s = runValidation([{ tooth: '11', damage: '1', surface: 's'.repeat(21) }]);
      expect(s.res.statusCode).toBe(400);
    });

    test('más de 1000 entries → 400 TOO_MANY_ENTRIES', () => {
      const many = Array.from({ length: 1001 }, () => ({ tooth: '11', damage: '1' }));
      const { res, nextCalled } = runValidation(many);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('TOO_MANY_ENTRIES');
    });

    test('note de exactamente 2000 chars pasa (cota inclusive)', () => {
      const { nextCalled } = runValidation([{ tooth: '11', damage: '1', note: 'x'.repeat(2000) }]);
      expect(nextCalled).toBe(true);
    });

    test('versionName > 200 chars → 400 VERSION_NAME_TOO_LONG', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const res = mockRes();
      await saveClinicalHistoryEntries(
        buildSaveReq(patientId, userId, [entry('11', '1')], { versionName: 'v'.repeat(201) }),
        res, throwingNext
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VERSION_NAME_TOO_LONG');
      // No dejó residuos.
      expect(await OdontogramaModel.countDocuments({ patientId })).toBe(0);
      expect(await OdontogramaHistory.countDocuments({ patient: patientId })).toBe(0);
    });
  });

  // ── Sanidad: el flujo feliz sigue intacto tras los cambios ───────────────
  describe('sanidad — guardado clínico normal', () => {
    test('espacios inter-dentales y entradas sólo-nota siguen persistiendo', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      // Pasar por el middleware real (como en producción) y luego el handler.
      const req = buildSaveReq(patientId, userId, []);
      req.body.entries = [
        { tooth: '11', damage: '1', surface: 'O', note: '' },
        { space: '1817', damage: '8', surface: '0', note: '' },   // diastema
        { tooth: '46', damage: '', surface: '0', note: 'vigilar' } // sólo-nota
      ];
      const resMw = mockRes();
      let passed = false;
      validarEntradasOdontograma(req, resMw, () => { passed = true; });
      expect(passed).toBe(true);

      const res = mockRes();
      await saveClinicalHistoryEntries(req, res, throwingNext);
      expect(res.statusCode).toBe(201);
      expect(res.body.datos).toHaveLength(3);
      const space = res.body.datos.find(e => e.space === '1817');
      expect(space).toBeDefined();
      expect(space.damage).toBe('8');
      const noteOnly = res.body.datos.find(e => e.tooth === '46');
      expect(noteOnly.note).toBe('vigilar');
    });
  });
});
