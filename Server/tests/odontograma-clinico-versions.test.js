/**
 * Tests del versionado del ODONTOGRAMA CLÍNICO:
 *  - Inmutabilidad e índice único del modelo OdontogramaHistory.
 *  - Migración 0004: agrupación legacy por día (acumulada/dedup), versionName
 *    determinístico, idempotencia, current.versionName y respeto a docs firmados.
 *
 * Autocontenido con MongoMemoryServer (no requiere mongod local ni la pila HTTP).
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const OdontogramaHistory = require('../models/odontogramaHistory');
const OdontogramaModel = require('../models/odontograma');
const migration0004 = require('../migrations/0004-backfill-odontograma-clinico-versions');
const {
  saveClinicalHistoryEntries,
  verificarOdontogramaClinico
} = require('../controllers/odontogramaController');

// Mock mínimo de res (status/json encadenables) y un next que propaga.
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

const VERSION_NAME_RE = /^\d{8}T\d{9}Z_[0-9a-f]{6}$/;

const entry = (tooth, damage, surface = 'O', note = '') => ({ tooth, space: '', damage, surface, note });

describe('Odontograma clínico — versionado', () => {
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

  // ── Modelo OdontogramaHistory ───────────────────────────────────────────
  describe('Modelo OdontogramaHistory (inmutable + índice único)', () => {
    test('permite .create() de una versión', async () => {
      const v = await OdontogramaHistory.create({
        patient: new mongoose.Types.ObjectId(),
        odontograma: new mongoose.Types.ObjectId(),
        versionName: 'v-test-1',
        datos: [entry('11', '1')]
      });
      expect(v.versionName).toBe('v-test-1');
      expect(Array.isArray(v.datos)).toBe(true);
    });

    test('bloquea updateOne y deleteOne (inmutabilidad NOM-024)', async () => {
      const patient = new mongoose.Types.ObjectId();
      await OdontogramaHistory.create({
        patient, odontograma: new mongoose.Types.ObjectId(), versionName: 'v-imm', datos: [entry('11', '1')]
      });
      await expect(
        OdontogramaHistory.updateOne({ patient, versionName: 'v-imm' }, { $set: { versionName: 'x' } })
      ).rejects.toThrow(/inmutable/i);
      await expect(
        OdontogramaHistory.deleteOne({ patient, versionName: 'v-imm' })
      ).rejects.toThrow(/inmutable/i);
    });

    test('índice único {patient, versionName} rechaza duplicados', async () => {
      const patient = new mongoose.Types.ObjectId();
      const odontograma = new mongoose.Types.ObjectId();
      await OdontogramaHistory.create({ patient, odontograma, versionName: 'dup', datos: [entry('11', '1')] });
      let err;
      try {
        await OdontogramaHistory.create({ patient, odontograma, versionName: 'dup', datos: [entry('12', '2')] });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.code).toBe(11000);
    });

    test('mismo versionName en pacientes distintos SÍ se permite', async () => {
      const odontograma = new mongoose.Types.ObjectId();
      await OdontogramaHistory.create({ patient: new mongoose.Types.ObjectId(), odontograma, versionName: 'shared', datos: [entry('11', '1')] });
      await expect(
        OdontogramaHistory.create({ patient: new mongoose.Types.ObjectId(), odontograma, versionName: 'shared', datos: [entry('11', '1')] })
      ).resolves.toBeDefined();
    });
  });

  // ── Migración 0004 ──────────────────────────────────────────────────────
  describe('Migración 0004 — backfill legacy por día (acumulada)', () => {
    const db = () => mongoose.connection.db;

    test('agrupa snapshots por día, une/dedup, y fija current.versionName', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const _id = new mongoose.Types.ObjectId();
      // Día 1: dos snapshots con un hallazgo duplicado entre ellos.
      // Día 2: un snapshot.
      await db().collection('odontogramas').insertOne({
        _id,
        patientId,
        type: 'clinic',
        deletedAt: null,
        firmadoEn: null,
        current: { datos: [entry('21', '1')], savedAt: new Date('2026-06-11T10:00:00.000Z'), versionName: 'Inicial' },
        history: [
          { savedAt: new Date('2026-06-10T09:00:00.000Z'), datos: [entry('11', '1'), entry('12', '5', 'V')] },
          { savedAt: new Date('2026-06-10T14:00:00.000Z'), datos: [entry('11', '1'), entry('13', '2')] }, // 11/1 dup
          { savedAt: new Date('2026-06-11T10:00:00.000Z'), datos: [entry('21', '1')] }
        ]
      });

      await migration0004.up(db());

      const versions = await db().collection('odontograma_history')
        .find({ patient: patientId }).sort({ createdAt: 1 }).toArray();

      expect(versions).toHaveLength(2); // una versión por día

      const [day1, day2] = versions;
      // Día 1: unión/dedup = {11/1/O, 12/5/V, 13/2/O} → 3 entradas (no 4)
      expect(day1.datos).toHaveLength(3);
      expect(day2.datos).toHaveLength(1);

      // versionName con el formato del periodontograma, derivado de la fecha real
      expect(day1.versionName).toMatch(VERSION_NAME_RE);
      expect(day2.versionName).toMatch(VERSION_NAME_RE);
      expect(day1.versionName.startsWith('20260610T140000000Z_')).toBe(true); // último del día 1
      expect(day2.versionName.startsWith('20260611T100000000Z_')).toBe(true);

      // createdAt = fecha real del snapshot (no la de migración)
      expect(new Date(day1.createdAt).toISOString()).toBe('2026-06-10T14:00:00.000Z');
      expect(new Date(day2.createdAt).toISOString()).toBe('2026-06-11T10:00:00.000Z');

      // current.versionName apunta al día más reciente
      const doc = await db().collection('odontogramas').findOne({ _id });
      expect(doc.current.versionName).toBe(day2.versionName);
    });

    test('es idempotente: re-correr no inserta versiones nuevas', async () => {
      const patientId = new mongoose.Types.ObjectId();
      await db().collection('odontogramas').insertOne({
        patientId, type: 'clinic', deletedAt: null, firmadoEn: null,
        history: [{ savedAt: new Date('2026-05-01T08:00:00.000Z'), datos: [entry('11', '1')] }]
      });

      await migration0004.up(db());
      const after1 = await db().collection('odontograma_history').countDocuments({ patient: patientId });
      await migration0004.up(db());
      const after2 = await db().collection('odontograma_history').countDocuments({ patient: patientId });

      expect(after1).toBe(1);
      expect(after2).toBe(1); // sin duplicados en el rerun
    });

    test('NO toca current.versionName de un odontograma firmado', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const _id = new mongoose.Types.ObjectId();
      await db().collection('odontogramas').insertOne({
        _id, patientId, type: 'clinic', deletedAt: null,
        firmadoEn: new Date('2026-04-01T00:00:00.000Z'), // FIRMADO
        current: { datos: [entry('11', '1')], versionName: 'firmada-original' },
        history: [{ savedAt: new Date('2026-03-15T08:00:00.000Z'), datos: [entry('11', '1')] }]
      });

      await migration0004.up(db());

      // Las versiones legacy SÍ se insertan (aditivo, no invalida firma)...
      const count = await db().collection('odontograma_history').countDocuments({ patient: patientId });
      expect(count).toBe(1);
      // ...pero current NO se modificó (firma intacta).
      const doc = await db().collection('odontogramas').findOne({ _id });
      expect(doc.current.versionName).toBe('firmada-original');
    });

    test('sintetiza una versión desde current si no hay history embebido', async () => {
      const patientId = new mongoose.Types.ObjectId();
      await db().collection('odontogramas').insertOne({
        patientId, type: 'clinic', deletedAt: null, firmadoEn: null,
        current: { datos: [entry('46', '23')], savedAt: new Date('2026-02-20T12:00:00.000Z'), versionName: 'Inicial' },
        history: []
      });

      await migration0004.up(db());

      const versions = await db().collection('odontograma_history').find({ patient: patientId }).toArray();
      expect(versions).toHaveLength(1);
      expect(versions[0].datos).toHaveLength(1);
      expect(versions[0].datos[0].tooth).toBe('46');
    });

    test('ignora odontogramas archivados (deletedAt != null)', async () => {
      const patientId = new mongoose.Types.ObjectId();
      await db().collection('odontogramas').insertOne({
        patientId, type: 'clinic', deletedAt: new Date('2026-01-01T00:00:00.000Z'), firmadoEn: null,
        history: [{ savedAt: new Date('2025-12-01T08:00:00.000Z'), datos: [entry('11', '1')] }]
      });

      await migration0004.up(db());

      const count = await db().collection('odontograma_history').countDocuments({ patient: patientId });
      expect(count).toBe(0);
    });
  });

  // ── Controlador (save + verificar) ──────────────────────────────────────
  describe('Controlador saveClinicalHistoryEntries + verificarOdontogramaClinico', () => {
    test('flujo: guardar → dedup → cambiar → listar → obtener versión → 404', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      // 1) Primer guardado → crea versión
      const res1 = mockRes();
      await saveClinicalHistoryEntries(buildSaveReq(patientId, userId, [entry('11', '1')]), res1, throwingNext);
      expect(res1.statusCode).toBe(201);
      expect(res1.body.versionName).toMatch(VERSION_NAME_RE);
      expect(await OdontogramaHistory.countDocuments({ patient: patientId })).toBe(1);

      // 2) Guardado idéntico → dedup: NO crea versión, conserva versionName
      const res2 = mockRes();
      await saveClinicalHistoryEntries(buildSaveReq(patientId, userId, [entry('11', '1')]), res2, throwingNext);
      expect(res2.statusCode).toBe(201);
      expect(await OdontogramaHistory.countDocuments({ patient: patientId })).toBe(1);
      const docAfterDedup = await OdontogramaModel.findOne({ patientId, type: 'clinic' });
      expect(docAfterDedup.current.versionName).toBe(res1.body.versionName);

      // 3) Guardado con cambios → nueva versión
      const res3 = mockRes();
      await saveClinicalHistoryEntries(buildSaveReq(patientId, userId, [entry('11', '1'), entry('12', '5', 'V')]), res3, throwingNext);
      expect(await OdontogramaHistory.countDocuments({ patient: patientId })).toBe(2);
      expect(res3.body.versionName).not.toBe(res1.body.versionName);

      // 4) Listar versiones
      const resList = mockRes();
      await verificarOdontogramaClinico({ patient: { id: String(patientId) }, query: { listVersions: 'true' } }, resList, throwingNext);
      expect(resList.body.success).toBe(true);
      expect(resList.body.versions).toHaveLength(2);

      // 5) Obtener una versión específica
      const resVer = mockRes();
      await verificarOdontogramaClinico({ patient: { id: String(patientId) }, query: { version: res3.body.versionName } }, resVer, throwingNext);
      expect(resVer.body.exists).toBe(true);
      expect(resVer.body.versionName).toBe(res3.body.versionName);
      expect(resVer.body.datos).toHaveLength(2);

      // 6) Versión inexistente → 404
      const res404 = mockRes();
      await verificarOdontogramaClinico({ patient: { id: String(patientId) }, query: { version: 'no-existe' } }, res404, throwingNext);
      expect(res404.statusCode).toBe(404);
    });

    test('versionName duplicado → 409 VERSION_NAME_CONFLICT', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const res1 = mockRes();
      await saveClinicalHistoryEntries(buildSaveReq(patientId, userId, [entry('11', '1')]), res1, throwingNext);
      const usedName = res1.body.versionName;

      // Mandar un cambio real pero con un versionName que ya existe.
      const resConf = mockRes();
      await saveClinicalHistoryEntries(
        buildSaveReq(patientId, userId, [entry('33', '2')], { versionName: usedName }),
        resConf, throwingNext
      );
      expect(resConf.statusCode).toBe(409);
      expect(resConf.body.error.code).toBe('VERSION_NAME_CONFLICT');
    });

    test('odontograma firmado → 403 IMMUTABLE_RECORD (no crea versión)', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      await OdontogramaModel.create({
        patientId, type: 'clinic',
        firmadoEn: new Date(),
        current: { datos: [entry('11', '1')], versionName: 'firmada' }
      });

      const res = mockRes();
      await saveClinicalHistoryEntries(buildSaveReq(patientId, userId, [entry('22', '5')]), res, throwingNext);
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('IMMUTABLE_RECORD');
      expect(await OdontogramaHistory.countDocuments({ patient: patientId })).toBe(0);
    });
  });
});
