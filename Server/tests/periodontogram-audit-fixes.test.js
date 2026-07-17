/**
 * Regresión de la auditoría del periodontograma:
 *  - P1: el historial guarda las estadísticas de los MISMOS teeth de la versión
 *    (antes heredaba las de la versión anterior; la primera quedaba en ceros).
 *  - P5: concurrencia optimista — expectedUpdatedAt desactualizado → 409.
 *  - P6: adaptTeethFromClientPayload clasifica temporales superiores (5x/6x)
 *    como arcada superior (antes 'inferior' → ValidationError del modelo).
 *  - P10: versionName con tope de 200 → 400.
 *  - Migración 0006: recomputa stats del historial legacy y es idempotente.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Patient = require('../models/patient');
const Periodontogram = require('../models/periodontogram');
const PeriodontogramHistory = require('../models/periodontogramHistory');
const periodontogramController = require('../controllers/periodontogramController');
const { adaptTeethFromClientPayload } = require('../utils/periodontogramAdaptors');
const migration0006 = require('../migrations/0006-recalcular-estadisticas-historial-periodontograma');

// El export es [middlewares..., handler] — tomamos el handler final.
const saveHandler = periodontogramController.savePeriodontogramData[
  periodontogramController.savePeriodontogramData.length - 1
];

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

let docCounter = 0;
const createTestPatient = async () => {
  docCounter++;
  return Patient.create({
    primer_nombre: 'Perio',
    apellido_paterno: 'Test',
    fecha_nacimiento: new Date('1990-01-15'),
    sexo: 'Masculino',
    documento: { tipo: 'INE', numero: `PERIO-AUDIT-${Date.now()}-${docCounter}` }
  });
};

// Diente canónico face-first con sangrado/placa reales.
const toothWithBleeding = (numeroDiente) => ({
  numeroDiente,
  ausente: false,
  vestibularSuperior: {
    sangrado: [1, 1, 0],
    placa: [1, 0, 0],
    supuracion: [0, 0, 0],
    margenGingival: [1, 1, 1],
    profundidadSondaje: [3, 3, 3]
  },
  palatinoSuperior: {
    sangrado: [0, 1, 0],
    placa: [0, 0, 0],
    supuracion: [0, 0, 0],
    margenGingival: [0, 0, 0],
    profundidadSondaje: [2, 2, 2]
  },
  vestibularInferior: {
    sangrado: [0, 0, 0], placa: [0, 0, 0], supuracion: [0, 0, 0],
    margenGingival: [0, 0, 0], profundidadSondaje: [0, 0, 0]
  },
  lingualInferior: {
    sangrado: [0, 0, 0], placa: [0, 0, 0], supuracion: [0, 0, 0],
    margenGingival: [0, 0, 0], profundidadSondaje: [0, 0, 0]
  }
});

const saveReq = (patientId, overrides = {}) => ({
  params: { id: String(patientId) },
  user: { id: new mongoose.Types.ObjectId().toString(), role: 'administrador' },
  query: {},
  body: {
    teeth: { 11: toothWithBleeding(11) },
    statistics: {},
    versionName: `test_${Date.now()}_${++docCounter}`,
    ...overrides
  }
});

describe('Periodontograma — fixes de auditoría', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Patient.deleteMany({}),
      Periodontogram.deleteMany({}),
      mongoose.connection.db.collection('periodontogram_history').deleteMany({})
    ]);
  });

  test('P1: la PRIMERA versión del historial guarda stats de sus propios teeth (no ceros)', async () => {
    const patient = await createTestPatient();
    const res = mockRes();
    await saveHandler(saveReq(patient._id), res);
    expect(res.statusCode).toBe(201);

    const entry = await PeriodontogramHistory.findOne({ patient: patient._id }).lean();
    expect(entry).toBeTruthy();
    // Antes: primera versión con estadísticas en ceros (heredaba las del doc vacío).
    expect(entry.statistics.sangradoTotal).toBeGreaterThan(0);
    // Semántica canónica: presentTeeth = 32 - ausentes (un diente sin medir
    // NO es ausente); con 1 diente medido y 0 ausentes → 32.
    expect(entry.statistics.presentTeeth).toBe(32);
    expect(entry.statistics.bleedingPercentage).toBeGreaterThan(0);

    // Y deben coincidir con el recompute canónico de esos mismos teeth.
    const recomputed = Periodontogram.computeStatistics(entry.teeth);
    expect(entry.statistics.sangradoTotal).toBe(recomputed.sangradoTotal);
    expect(entry.statistics.placaTotal).toBe(recomputed.placaTotal);
    expect(entry.statistics.bleedingPercentage).toBe(recomputed.bleedingPercentage);

    // La respuesta y el current también llevan las stats correctas.
    expect(res.body.statistics.sangradoTotal).toBe(recomputed.sangradoTotal);
  });

  test('P5: expectedUpdatedAt desactualizado → 409 PERIODONTOGRAMA_STALE; el correcto → 201', async () => {
    const patient = await createTestPatient();

    const first = mockRes();
    await saveHandler(saveReq(patient._id), first);
    expect(first.statusCode).toBe(201);

    // Token viejo (otro usuario "guardó" después de nuestra lectura).
    const stale = mockRes();
    await saveHandler(
      saveReq(patient._id, { expectedUpdatedAt: new Date('2020-01-01').toISOString() }),
      stale
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.body.code).toBe('PERIODONTOGRAMA_STALE');

    // Token correcto (el que devolvió el save anterior) → pasa.
    const ok = mockRes();
    await saveHandler(
      saveReq(patient._id, { expectedUpdatedAt: first.body.updatedAt }),
      ok
    );
    expect(ok.statusCode).toBe(201);
  });

  test('P10: versionName de más de 200 caracteres → 400', async () => {
    const patient = await createTestPatient();
    const res = mockRes();
    await saveHandler(saveReq(patient._id, { versionName: 'x'.repeat(201) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/200/);
  });

  test('P6: temporales superiores (55, 65) → arcada superior; inferiores (75) → inferior', () => {
    const adapted = adaptTeethFromClientPayload({
      55: toothWithBleeding(55),
      65: toothWithBleeding(65),
      75: toothWithBleeding(75)
    });
    expect(adapted['55'].arcada).toBe('superior');
    expect(adapted['65'].arcada).toBe('superior');
    expect(adapted['75'].arcada).toBe('inferior');
  });

  test('P6 (end-to-end): guardar un periodontograma con un temporal superior NO revienta', async () => {
    const patient = await createTestPatient();
    const res = mockRes();
    await saveHandler(saveReq(patient._id, { teeth: { 55: toothWithBleeding(55) } }), res);
    // Antes: getArcada marcaba 55 como 'inferior' y el cross-check FDI del
    // modelo rechazaba el save con ValidationError.
    expect(res.statusCode).toBe(201);
  });

  test('Migración 0006: corrige stats desfasadas del historial y es idempotente', async () => {
    const db = mongoose.connection.db;
    const history = db.collection('periodontogram_history');
    const patientId = new mongoose.Types.ObjectId();
    const perioId = new mongoose.Types.ObjectId();

    // Entrada legacy: teeth con sangrado pero statistics en ceros (el bug).
    const teeth = { 11: toothWithBleeding(11) };
    await history.insertOne({
      patient: patientId,
      periodontogram: perioId,
      versionName: 'legacy_desfasada',
      teeth,
      statistics: { sangradoTotal: 0, placaTotal: 0, presentTeeth: 0, bleedingPercentage: 0 },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    // Entrada ya correcta: no debe tocarse.
    const okStats = Periodontogram.computeStatistics(teeth);
    await history.insertOne({
      patient: patientId,
      periodontogram: perioId,
      versionName: 'legacy_correcta',
      teeth,
      statistics: okStats,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await migration0006.up(db);

    const fixed = await history.findOne({ versionName: 'legacy_desfasada' });
    expect(fixed.statistics.sangradoTotal).toBe(okStats.sangradoTotal);
    expect(fixed.statistics.presentTeeth).toBe(okStats.presentTeeth);

    // Idempotencia: segunda corrida no cambia nada.
    const before = await history.find({}).toArray();
    await migration0006.up(db);
    const after = await history.find({}).toArray();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
