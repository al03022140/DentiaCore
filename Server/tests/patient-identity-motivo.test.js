/**
 * Edición de ficha por niveles + historial de cambios (NOM-004/024).
 *
 * Política implementada (feat/historial-edicion-paciente):
 *  - Datos de IDENTIDAD (nombre, fecha_nacimiento, sexo, documento): editables
 *    SIN revocar la HC, pero si cambian de verdad exigen `motivo` → 422
 *    MOTIVO_REQUERIDO si falta. El diff queda en la bitácora.
 *  - Secciones CLÍNICAS: siguen congeladas con HC firmada (409
 *    HC_CONSENT_LOCKED, flujo de revocación sin cambios).
 *  - Datos ADMINISTRATIVOS (email, contacto...): edición libre auditada.
 *  - GET /patients/:id/change-history: diffs campo a campo desde el audit
 *    trail, tolerando el formato legacy { patientData: '<json>' }.
 *
 * Autocontenido con MongoMemoryServer, controllers llamados directo con
 * req/res simulados (mismo patrón que inventory-audit-fixes.test.js).
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET
  || 'test-secret-para-cadena-hmac-0123456789abcdef0123456789abcdef';

const Patient = require('../models/patient');
const AuditLog = require('../models/auditLog');
const patientsController = require('../controllers/patientsController');
const auditLoggerMw = require('../middlewares/auditLogger');
const {
  IDENTITY_PATIENT_FIELDS,
  CLINICAL_LOCKED_FIELDS,
  findClinicalLockedFieldsInPayload,
  findIdentityFieldsInPayload,
} = require('../utils/hcConsent');

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
});

const adminUser = () => ({
  id: new mongoose.Types.ObjectId().toString(),
  role: 'administrador',
  nombre: 'Admin Test',
});

const buildUpdateReq = (patientId, patientData, extraBody = {}) => ({
  params: { id: patientId.toString() },
  body: { patientData: JSON.stringify(patientData), ...extraBody },
  file: null,
  user: adminUser(),
  ip: '127.0.0.1',
});

const basePatient = (overrides = {}) => ({
  primer_nombre: 'María',
  apellido_paterno: 'López',
  apellido_materno: 'Santos',
  sexo: 'Femenino',
  fecha_nacimiento: new Date(1990, 4, 10), // local midnight, como parseAndValidateBirthDate (new Date('1990-05-10') sería UTC → falso "cambió")
  documento: { tipo: 'INE', numero: 'LOP900510' },
  email: 'maria@example.com',
  ruta_archivos: '/tmp/dentia-test-uploads/maria', // evita ensureUploadsPath en pre-save
  ...overrides,
});

describe('Edición de ficha por niveles (motivo de identidad) + historial', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Patient.deleteMany({});
    // AuditLog es append-only a nivel app: limpiar vía driver crudo.
    await mongoose.connection.db.collection('auditlogs').deleteMany({});
  });

  // ── Particiones de campos ────────────────────────────────────────────────
  describe('hcConsent — particiones identidad/clínico', () => {
    test('identidad y clínico no se traslapan', () => {
      for (const f of IDENTITY_PATIENT_FIELDS) {
        expect(CLINICAL_LOCKED_FIELDS.has(f)).toBe(false);
      }
    });

    test('finders clasifican el payload correctamente', () => {
      const payload = { primer_nombre: 'X', email: 'a@b.c', encuesta_medica: {} };
      expect(findIdentityFieldsInPayload(payload)).toEqual(['primer_nombre']);
      expect(findClinicalLockedFieldsInPayload(payload)).toEqual(['encuesta_medica']);
    });
  });

  // ── Motivo obligatorio en identidad ──────────────────────────────────────
  describe('updatePatient — motivo obligatorio SOLO en cambio real de identidad', () => {
    test('cambio de apellido sin motivo → 422 MOTIVO_REQUERIDO con el campo', async () => {
      const p = await Patient.create(basePatient());
      const res = mockRes();
      await patientsController.updatePatient(
        buildUpdateReq(p._id, { apellido_paterno: 'Lopes' }), res
      );
      expect(res.statusCode).toBe(422);
      expect(res.body.code).toBe('MOTIVO_REQUERIDO');
      expect(res.body.camposIdentidad).toEqual(['apellido_paterno']);
    });

    test('cambio de apellido CON motivo → 200 y el dato queda actualizado', async () => {
      const p = await Patient.create(basePatient());
      const res = mockRes();
      const req = buildUpdateReq(p._id, { apellido_paterno: 'Lopes' }, { motivo: 'Corrección de errata de captura' });
      await patientsController.updatePatient(req, res);
      expect(res.statusCode).toBe(200);
      const updated = await Patient.findById(p._id).lean();
      expect(updated.apellido_paterno).toBe('Lopes');
      // El motivo queda expuesto donde el auditLogger lo lee.
      expect(req.body.motivo).toBe('Corrección de errata de captura');
    });

    test('motivo demasiado corto (<5) → 422', async () => {
      const p = await Patient.create(basePatient());
      const res = mockRes();
      await patientsController.updatePatient(
        buildUpdateReq(p._id, { primer_nombre: 'Marta' }, { motivo: 'err' }), res
      );
      expect(res.statusCode).toBe(422);
      expect(res.body.code).toBe('MOTIVO_REQUERIDO');
    });

    test('reenviar la MISMA identidad (formulario completo sin cambios) NO exige motivo', async () => {
      const p = await Patient.create(basePatient());
      const res = mockRes();
      await patientsController.updatePatient(
        buildUpdateReq(p._id, {
          primer_nombre: 'María',
          apellido_paterno: 'López',
          apellido_materno: 'Santos',
          sexo: 'Femenino',
          fecha_nacimiento: '1990-05-10',
          documento: { tipo: 'INE', numero: 'lop900510' }, // case-insensitive
          email: 'nuevo@example.com', // admin: cambia libre
        }), res
      );
      expect(res.statusCode).toBe(200);
      const updated = await Patient.findById(p._id).lean();
      expect(updated.email).toBe('nuevo@example.com');
    });

    test('cambio administrativo (email) sin motivo → 200', async () => {
      const p = await Patient.create(basePatient());
      const res = mockRes();
      await patientsController.updatePatient(
        buildUpdateReq(p._id, { email: 'otro@example.com' }), res
      );
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Interacción con la HC firmada ────────────────────────────────────────
  describe('updatePatient — HC firmada: identidad editable con motivo, clínico bloqueado', () => {
    // El hook pre('validate') fuerza consentimientoHC a null en creación
    // (defensa anti mass-assignment): un paciente NO puede nacer firmado.
    // Se firma DESPUÉS, vía update directo (query middleware, no dispara el
    // hook de documento) — igual que finalizeClinicalHistory en producción.
    const createSignedPatient = async () => {
      const p = await Patient.create(basePatient());
      await Patient.updateOne(
        { _id: p._id },
        { $set: { 'consentimientoHC.firmadoEn': new Date(), 'consentimientoHC.contentHash': 'abc123' } }
      );
      return Patient.findById(p._id);
    };

    test('sección clínica con HC firmada → 409 HC_CONSENT_LOCKED (sin cambio de comportamiento)', async () => {
      const p = await createSignedPatient();
      const res = mockRes();
      await patientsController.updatePatient(
        buildUpdateReq(p._id, { encuesta_medica: { alergias: 'penicilina' } }), res
      );
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('HC_CONSENT_LOCKED');
      expect(res.body.lockedFields).toEqual(['encuesta_medica']);
    });

    test('identidad con HC firmada + motivo → 200 SIN revocar, con marca de auditoría', async () => {
      const p = await createSignedPatient();
      const res = mockRes();
      const req = buildUpdateReq(p._id, { apellido_paterno: 'Lopes' }, { motivo: 'Errata detectada al cotejar INE' });
      await patientsController.updatePatient(req, res);
      expect(res.statusCode).toBe(200);
      const updated = await Patient.findById(p._id).lean();
      expect(updated.apellido_paterno).toBe('Lopes');
      // La firma NO se toca (conserva su sello original).
      expect(updated.consentimientoHC.firmadoEn).toBeTruthy();
      expect(updated.consentimientoHC.contentHash).toBe('abc123');
      // Marca explícita para la bitácora.
      expect(req._auditDetallesExtra).toEqual({ identidadEditadaConHCFirmada: true });
    });

    test('identidad con HC firmada SIN motivo → 422 (no 409): el camino existe, falta el motivo', async () => {
      const p = await createSignedPatient();
      const res = mockRes();
      await patientsController.updatePatient(
        buildUpdateReq(p._id, { sexo: 'Masculino' }), res
      );
      expect(res.statusCode).toBe(422);
      expect(res.body.code).toBe('MOTIVO_REQUERIDO');
    });
  });

  // ── auditLogger: cuerpo efectivo (unwrap de patientData) ─────────────────
  describe('auditLogger — effectiveBody/detectEditedFields con FormData', () => {
    const { effectiveBody, detectEditedFields } = auditLoggerMw._internal;

    test('desempaqueta patientData y excluye metadatos de transporte', () => {
      const req = {
        body: {
          patientData: JSON.stringify({
            primer_nombre: 'Ana', email: 'a@b.c', expectedUpdatedAt: '2026-01-01',
          }),
          motivo: 'Corrección',
        },
      };
      const body = effectiveBody(req);
      expect(body.primer_nombre).toBe('Ana');
      const campos = detectEditedFields(req);
      expect(campos).toEqual(expect.arrayContaining(['primer_nombre', 'email']));
      expect(campos).not.toContain('patientData');
      expect(campos).not.toContain('motivo');
      expect(campos).not.toContain('expectedUpdatedAt');
    });

    test('body JSON normal (sin FormData) sigue funcionando', () => {
      const req = { body: { email: 'x@y.z', motivo: 'n/a' } };
      expect(detectEditedFields(req)).toEqual(['email']);
    });
  });

  // ── Historial de cambios ─────────────────────────────────────────────────
  describe('getPatientChangeHistory — diffs campo a campo desde la bitácora', () => {
    const seedLog = (patientId, data) => AuditLog.registrar({
      userId: new mongoose.Types.ObjectId(),
      userName: 'Dra. Prueba',
      userRole: 'doctor',
      evento: 'modificacion_registro',
      resourceType: 'patient',
      resourceId: patientId,
      patientId,
      ip: '127.0.0.1',
      ...data,
    });

    const historyReq = (patientId, query = {}) => ({
      params: { id: patientId.toString() },
      query,
      user: adminUser(),
    });

    test('entrada moderna: diff escalar con antes/después y marca de identidad', async () => {
      const p = await Patient.create(basePatient());
      await seedLog(p._id, {
        camposEditados: ['apellido_paterno', 'email'],
        motivo: 'Errata en el alta',
        detalles: {
          antes: { apellido_paterno: 'López', email: 'maria@example.com' },
          despues: { apellido_paterno: 'Lopes', email: 'maria@example.com' },
        },
      });
      const res = mockRes();
      await patientsController.getPatientChangeHistory(historyReq(p._id), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.historial).toHaveLength(1);
      const [entry] = res.body.historial;
      expect(entry.motivo).toBe('Errata en el alta');
      // email no cambió → no aparece; apellido sí, marcado como identidad.
      expect(entry.cambios).toHaveLength(1);
      expect(entry.cambios[0]).toMatchObject({
        campo: 'apellido_paterno', antes: 'López', despues: 'Lopes', esIdentidad: true,
      });
    });

    test('entrada legacy ({patientData: json-string}) se desempaqueta', async () => {
      const p = await Patient.create(basePatient());
      await seedLog(p._id, {
        camposEditados: ['patientData'],
        detalles: {
          antes: { email: 'maria@example.com' },
          despues: { patientData: JSON.stringify({ email: 'legacy@example.com' }) },
        },
      });
      const res = mockRes();
      await patientsController.getPatientChangeHistory(historyReq(p._id), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.historial).toHaveLength(1);
      expect(res.body.historial[0].cambios[0]).toMatchObject({
        campo: 'email', antes: 'maria@example.com', despues: 'legacy@example.com',
      });
    });

    test('secciones clínicas se reportan sin volcar contenido', async () => {
      const p = await Patient.create(basePatient());
      await seedLog(p._id, {
        camposEditados: ['encuesta_medica'],
        detalles: {
          antes: { encuesta_medica: { alergias: 'ninguna' } },
          despues: { encuesta_medica: { alergias: 'penicilina' } },
        },
      });
      const res = mockRes();
      await patientsController.getPatientChangeHistory(historyReq(p._id), res);
      const [entry] = res.body.historial;
      expect(entry.cambios[0]).toMatchObject({ campo: 'encuesta_medica', tipo: 'seccion', antes: null, despues: null });
    });

    test('ediciones sin cambio efectivo no aparecen; id inválido → 400', async () => {
      const p = await Patient.create(basePatient());
      await seedLog(p._id, {
        camposEditados: ['email'],
        detalles: {
          antes: { email: 'igual@example.com' },
          despues: { email: 'igual@example.com' },
        },
      });
      const res = mockRes();
      await patientsController.getPatientChangeHistory(historyReq(p._id), res);
      expect(res.body.historial).toHaveLength(0);

      const resBad = mockRes();
      await patientsController.getPatientChangeHistory(
        { params: { id: 'no-es-objectid' }, query: {}, user: adminUser() }, resBad
      );
      expect(resBad.statusCode).toBe(400);
    });
  });
});
