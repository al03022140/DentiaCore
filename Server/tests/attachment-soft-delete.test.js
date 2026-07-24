/**
 * Regresión de cumplimiento: DELETE /patients/:id/attachments/:attachmentId
 * debe hacer SOFT-DELETE, no destrucción física.
 *
 * Antes del fix el controller hacía `fs.remove` + `PatientAttachment.deleteOne`:
 * borraba físicamente consentimientos firmados y radiografías (parte del
 * expediente clínico) sin dejar forma de reconstruir qué se eliminó — hueco
 * NOM-004 (retención) + NOM-024 (trazabilidad). Ahora se marca
 * deletedAt/deletedBy/deleteReason y se conserva el registro.
 *
 * Autocontenido con MongoMemoryServer (sin mongod local ni pila HTTP), llamando
 * al controller directo — mismo estilo que odontograma-audit-fixes.test.js.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PatientAttachment = require('../models/patientAttachment');
const { deleteAttachment } = require('../controllers/attachmentController');

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }
});

const buildReq = (patientId, attachmentId, userId, body = {}) => ({
  params: { id: String(patientId), attachmentId: String(attachmentId) },
  user: { id: String(userId), role: 'doctor', nombre: 'Dra. Prueba' },
  body,
  ip: '127.0.0.1'
});

const createAttachment = (patientId, over = {}) => PatientAttachment.create({
  patientId,
  originalName: 'consentimiento-firmado.pdf',
  filename: 'adjunto-123.pdf',
  url: '/uploads/pacientes/x/adjuntos/adjunto-123.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  categoria: 'consentimiento',
  ...over
});

describe('Adjuntos — soft-delete (NOM-004 / NOM-024)', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await PatientAttachment.deleteMany({});
  });

  test('conserva el registro marcándolo en vez de destruirlo', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const doc = await createAttachment(patientId, { categoria: 'radiografia' });

    const req = buildReq(patientId, doc._id, userId, { motivo: 'Duplicado por error' });
    const res = mockRes();
    await deleteAttachment(req, res);

    expect(res.body).toEqual({ success: true });

    // Lo crítico: el registro NO desapareció (antes: deleteOne lo borraba).
    const persisted = await PatientAttachment.findById(doc._id);
    expect(persisted).not.toBeNull();
    expect(persisted.deletedAt).toBeInstanceOf(Date);
    expect(String(persisted.deletedBy)).toBe(String(userId));
    expect(persisted.deleteReason).toBe('Duplicado por error');
  });

  test('sin motivo usa una razón por defecto', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const doc = await createAttachment(patientId);

    const req = buildReq(patientId, doc._id, new mongoose.Types.ObjectId());
    await deleteAttachment(req, mockRes());

    const persisted = await PatientAttachment.findById(doc._id);
    expect(persisted.deleteReason).toBe('Eliminado desde el expediente');
  });

  test('anexa a la bitácora qué documento se quitó (req._auditDetallesExtra)', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const doc = await createAttachment(patientId, { originalName: 'panoramica.jpg', categoria: 'radiografia' });

    const req = buildReq(patientId, doc._id, new mongoose.Types.ObjectId());
    await deleteAttachment(req, mockRes());

    expect(req._auditDetallesExtra).toEqual({
      attachmentId: String(doc._id),
      originalName: 'panoramica.jpg',
      categoria: 'radiografia'
    });
  });

  test('es idempotente: un segundo borrado responde 404 y no re-marca', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const doc = await createAttachment(patientId);

    await deleteAttachment(buildReq(patientId, doc._id, new mongoose.Types.ObjectId()), mockRes());
    const firstDeletedAt = (await PatientAttachment.findById(doc._id)).deletedAt;

    const res2 = mockRes();
    await deleteAttachment(buildReq(patientId, doc._id, new mongoose.Types.ObjectId()), res2);

    expect(res2.statusCode).toBe(404);
    const after = await PatientAttachment.findById(doc._id);
    expect(after.deletedAt.getTime()).toBe(firstDeletedAt.getTime());
  });
});
