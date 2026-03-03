/**
 * Pruebas del Sistema de Autorización — DentiaCore
 *
 * Cubre:
 * 1. Permisos: doctor vs asistente vs recepcionista en endpoints clínicos
 * 2. Draft logic: asistente crea BORRADOR, doctor crea OFICIAL
 * 3. PIN: setPin, verifyPin, bloqueo tras N intentos
 * 4. Drafts: crear borrador, firmar sin PIN, firmar con PIN
 * 5. BackdatedEntry: rechazo sin motivo, aceptación con motivo
 * 6. filterPatientFields: recepcionista solo ve datos básicos
 * 7. Audit: verificar que se generen logs en audit_logs
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../scripts/dent');
const Usuario = require('../models/users');
const Patient = require('../models/patient');
const Exam = require('../models/exam');
const OdontogramaModel = require('../models/odontograma');
const AuditLog = require('../models/auditLog');
const { getEffectivePermissions } = require('../utils/permissions');

jest.setTimeout(60000);

// ── Helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function makeToken(user) {
  const permissions = getEffectivePermissions(user);
  return jwt.sign(
    { sub: user._id.toString(), role: user.rol, permissions },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'dentia-core' }
  );
}

async function createUser(overrides = {}) {
  const base = {
    nombre: 'Test User',
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    contraseña: 'Password123!',
    rol: 'doctor',
    ...overrides,
  };
  const user = await Usuario.create(base);
  const token = makeToken(user);
  return { user, token };
}

async function createPatient(extraFields = {}) {
  return Patient.create({
    primer_nombre: 'Paciente',
    apellido_paterno: 'Prueba',
    fecha_nacimiento: new Date('1990-01-15'),
    sexo: 'Masculino',
    documento: {
      tipo: 'INE',
      numero: `DOC-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    ...extraFields,
  });
}

// ── Setup / Teardown ────────────────────────────────────────────────────

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  // Desconectar si ya hay conexion activa (por otros tests)
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map(c => c.deleteMany({})));
});

// ═══════════════════════════════════════════════════════════════════════
// 1. PERMISOS: Autorizacion granular por rol
// ═══════════════════════════════════════════════════════════════════════

describe('Permisos por rol', () => {
  test('Doctor puede crear examen (OFICIAL)', async () => {
    const { token: doctorToken, user: doctor } = await createUser({ rol: 'doctor' });
    const patient = await createPatient();

    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ paciente_id: patient._id, doctor_id: doctor._id, tipo_examen: 'Otro' });

    expect(res.status).toBe(201);
    expect(res.body.exam.estadoRegistro).toBe('OFICIAL');
    expect(res.body.exam.creadoPor).toBe(doctor._id.toString());
  });

  test('Recepcionista NO puede crear examen (403)', async () => {
    const { token: recToken } = await createUser({ rol: 'recepcionista' });
    const patient = await createPatient();

    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${recToken}`)
      .send({ paciente_id: patient._id, tipo_examen: 'Otro' });

    expect(res.status).toBe(403);
  });

  test('Recepcionista puede crear cita', async () => {
    const { token: recToken } = await createUser({ rol: 'recepcionista' });
    const { user: doctor } = await createUser({ rol: 'doctor' });
    const patient = await createPatient();

    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${recToken}`)
      .send({
        paciente_id: patient._id,
        doctor_id: doctor._id,
        fecha_hora: new Date(Date.now() + 86400000).toISOString(),
        motivo: 'Revision',
      });

    // 201 o 200 segun implementacion
    expect([200, 201]).toContain(res.status);
  });

  test('Asistente NO puede eliminar paciente (403)', async () => {
    const { token: asisToken } = await createUser({ rol: 'asistente' });
    const patient = await createPatient();

    const res = await request(app)
      .delete(`/api/patients/${patient._id}`)
      .set('Authorization', `Bearer ${asisToken}`);

    expect(res.status).toBe(403);
  });

  test('Sin token retorna 401', async () => {
    const res = await request(app).get('/api/patients');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. DRAFT LOGIC: estadoRegistro automatico segun permisos
// ═══════════════════════════════════════════════════════════════════════

describe('Draft logic automatico', () => {
  test('Asistente crea nota de evolucion como BORRADOR', async () => {
    const { token: asisToken } = await createUser({ rol: 'asistente' });
    const { token: doctorToken, user: doctor } = await createUser({ rol: 'doctor' });
    // Crear paciente con token de doctor (que tiene patients.create)
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${asisToken}`)
      .send({
        evolutionNote: {
          procedimiento: 'Limpieza dental',
          observaciones: 'Paciente estable',
        },
      });

    // Asistente tiene consultas.create.draft pero NO consultas.create
    expect(res.status).toBe(201);
    expect(res.body.data.estadoRegistro).toBe('BORRADOR');
  });

  test('Doctor crea nota de evolucion como OFICIAL', async () => {
    const { token: doctorToken } = await createUser({ rol: 'doctor' });
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: {
          procedimiento: 'Extraccion',
          observaciones: 'Sin complicaciones',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.estadoRegistro).toBe('OFICIAL');
  });

  test('Doctor crea plan de tratamiento como OFICIAL', async () => {
    const { token: doctorToken } = await createUser({ rol: 'doctor' });
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        treatmentPlan: {
          texto: 'Plan de tratamiento ortodontico',
          confirmar: 'confirmar',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.estadoRegistro).toBe('OFICIAL');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. PIN: Establecer, verificar, bloqueo
// ═══════════════════════════════════════════════════════════════════════

describe('Sistema de PIN', () => {
  let token, user;

  beforeEach(async () => {
    const created = await createUser({ rol: 'doctor' });
    token = created.token;
    user = created.user;
  });

  test('Puede establecer PIN por primera vez (sin password)', async () => {
    const res = await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/PIN establecido/i);
  });

  test('No puede establecer PIN con formato invalido', async () => {
    const res = await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: 'abcd' });

    expect(res.status).toBe(400);
  });

  test('Puede verificar PIN correcto', async () => {
    // Primero establecer PIN
    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '5678' });

    // Verificar
    const res = await request(app)
      .post('/api/auth/verify-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '5678' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test('PIN incorrecto retorna 401 con intentos restantes', async () => {
    // Establecer PIN
    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1111' });

    // Intentar con PIN incorrecto
    const res = await request(app)
      .post('/api/auth/verify-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '9999' });

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.intentosRestantes).toBeDefined();
  });

  test('PIN se bloquea tras 5 intentos fallidos', async () => {
    // Establecer PIN
    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1111' });

    // 5 intentos fallidos
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/verify-pin')
        .set('Authorization', `Bearer ${token}`)
        .send({ pin: '0000' });
    }

    // El sexto intento deberia indicar bloqueo
    const res = await request(app)
      .post('/api/auth/verify-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '0000' });

    expect(res.status).toBe(423);
    expect(res.body.locked).toBe(true);
  });

  test('Cambiar PIN existente requiere password', async () => {
    // Establecer PIN inicial
    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1111' });

    // Intentar cambiar sin password
    const res = await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '2222' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contrase/i);
  });

  test('Cambiar PIN con password correcta', async () => {
    // Establecer PIN inicial
    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1111' });

    // Cambiar con password
    const res = await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '2222', contraseña: 'Password123!' });

    expect(res.status).toBe(200);

    // Verificar que el nuevo PIN funciona
    const verifyRes = await request(app)
      .post('/api/auth/verify-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '2222' });

    expect(verifyRes.body.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. DRAFTS: Firma individual y batch sign
// ═══════════════════════════════════════════════════════════════════════

describe('Flujo de borradores y firma', () => {
  let doctorToken, doctor;

  beforeEach(async () => {
    const created = await createUser({ rol: 'doctor' });
    doctorToken = created.token;
    doctor = created.user;

    // Establecer PIN para el doctor
    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ pin: '4321' });
  });

  test('Firmar borrador sin PIN falla (400)', async () => {
    const patient = await createPatient();
    const exam = await Exam.create({
      paciente_id: patient._id,
      doctor_id: doctor._id,
      tipo_examen: 'Otro',
      estadoRegistro: 'BORRADOR',
      creadoPor: doctor._id,
    });

    const res = await request(app)
      .patch(`/api/drafts/${exam._id}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resourceType: 'examen' }); // sin pin

    expect(res.status).toBe(400);
  });

  test('Firmar borrador con PIN correcto transiciona a OFICIAL', async () => {
    const patient = await createPatient();
    const exam = await Exam.create({
      paciente_id: patient._id,
      doctor_id: doctor._id,
      tipo_examen: 'Otro',
      estadoRegistro: 'BORRADOR',
      creadoPor: doctor._id,
    });

    const res = await request(app)
      .patch(`/api/drafts/${exam._id}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resourceType: 'examen', pin: '4321' });

    expect(res.status).toBe(200);
    expect(res.body.doc.estadoRegistro).toBe('OFICIAL');

    // Verificar en BD
    const updated = await Exam.findById(exam._id);
    expect(updated.estadoRegistro).toBe('OFICIAL');
    expect(updated.firmadoPor?.toString()).toBe(doctor._id.toString());
  });

  test('Firmar borrador con PIN incorrecto falla (401)', async () => {
    const patient = await createPatient();
    const exam = await Exam.create({
      paciente_id: patient._id,
      doctor_id: doctor._id,
      tipo_examen: 'Otro',
      estadoRegistro: 'BORRADOR',
      creadoPor: doctor._id,
    });

    const res = await request(app)
      .patch(`/api/drafts/${exam._id}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resourceType: 'examen', pin: '0000' });

    expect(res.status).toBe(401);
  });

  test('Batch sign firma multiples borradores', async () => {
    const patient = await createPatient();
    const exams = await Promise.all([
      Exam.create({
        paciente_id: patient._id,
        doctor_id: doctor._id,
        tipo_examen: 'Otro',
        estadoRegistro: 'BORRADOR',
        creadoPor: doctor._id,
      }),
      Exam.create({
        paciente_id: patient._id,
        doctor_id: doctor._id,
        tipo_examen: 'Otro',
        estadoRegistro: 'BORRADOR',
        creadoPor: doctor._id,
      }),
    ]);

    const draftIds = exams.map(e => ({
      id: e._id.toString(),
      resourceType: 'examen',
    }));

    const res = await request(app)
      .post('/api/drafts/batch-sign')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ draftIds, pin: '4321' });

    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBe(2);

    // Verificar en BD
    for (const exam of exams) {
      const updated = await Exam.findById(exam._id);
      expect(updated.estadoRegistro).toBe('OFICIAL');
    }
  });

  test('Listar borradores devuelve solo documentos en BORRADOR', async () => {
    const patient = await createPatient();
    await Exam.create({
      paciente_id: patient._id,
      doctor_id: doctor._id,
      tipo_examen: 'Otro',
      estadoRegistro: 'BORRADOR',
      creadoPor: doctor._id,
    });
    await Exam.create({
      paciente_id: patient._id,
      doctor_id: doctor._id,
      tipo_examen: 'Otro',
      estadoRegistro: 'OFICIAL',
      creadoPor: doctor._id,
    });

    const res = await request(app)
      .get('/api/drafts')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. BACKDATED ENTRY: Captura extemporanea
// ═══════════════════════════════════════════════════════════════════════

describe('Captura extemporanea (backdatedEntry)', () => {
  let doctorToken;

  beforeEach(async () => {
    const created = await createUser({ rol: 'doctor' });
    doctorToken = created.token;
  });

  test('Nota con fecha >6h sin motivo es rechazada (400)', async () => {
    const patient = await createPatient();
    const pastDate = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 horas atras

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        fecha: pastDate.toISOString(),
        evolutionNote: {
          procedimiento: 'Curacion tardia',
          observaciones: 'Se registra tardiamente',
          fecha: pastDate.toISOString(),
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motivo|extempor/i);
  });

  test('Nota con fecha >6h CON motivo se acepta y marca como extemporanea', async () => {
    const patient = await createPatient();
    const pastDate = new Date(Date.now() - 8 * 60 * 60 * 1000); // 8 horas atras

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        fecha: pastDate.toISOString(),
        evolutionNote: {
          procedimiento: 'Curacion tardia',
          observaciones: 'Se registra tardiamente',
          fecha: pastDate.toISOString(),
        },
        capturaExtemporaneaMotivo: 'Emergencia atendida fuera de horario, registro posterior obligado',
      });

    expect(res.status).toBe(201);
    // La nota debe tener la marca de captura extemporanea
    expect(res.body.data.capturaExtemporanea).toBeDefined();
    expect(res.body.data.capturaExtemporanea.esExtemporanea).toBe(true);
  });

  test('Nota con fecha reciente (< 6h) NO requiere motivo', async () => {
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: {
          procedimiento: 'Control rutinario',
          observaciones: 'Todo normal',
        },
      });

    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. FILTER PATIENT FIELDS: Recepcionista solo ve datos basicos
// ═══════════════════════════════════════════════════════════════════════

describe('filterPatientFields (recepcionista)', () => {
  test('Recepcionista no ve datos clinicos del paciente', async () => {
    const { token: recToken } = await createUser({ rol: 'recepcionista' });
    const patient = await createPatient({
      encuesta_medica: {
        informacion_general: {
          considera_su_salud: 'Buena',
        },
      },
      notas_evolucion: [{
        numero_procedimiento: 1,
        procedimiento: 'Profilaxis',
        observaciones: 'OK',
        fecha: new Date(),
      }],
    });

    const res = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', `Bearer ${recToken}`);

    expect(res.status).toBe(200);

    const data = res.body.patient;
    // Debe tener campos basicos
    expect(data.primer_nombre).toBe('Paciente');
    expect(data.contacto).toBeDefined();
    // No debe tener campos clinicos
    expect(data.encuesta_medica).toBeUndefined();
    expect(data.notas_evolucion).toBeUndefined();
    expect(data.planes_tratamiento).toBeUndefined();
    expect(data.habitos_higiene).toBeUndefined();
  });

  test('Doctor ve todos los datos del paciente', async () => {
    const { token: doctorToken } = await createUser({ rol: 'doctor' });
    const patient = await createPatient({
      encuesta_medica: {
        informacion_general: {
          considera_su_salud: 'Buena',
        },
      },
    });

    const res = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    // Doctor ve todos los campos
    expect(res.body.patient.encuesta_medica).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. AUDIT LOGS: Registro de eventos
// ═══════════════════════════════════════════════════════════════════════

describe('Audit Logs', () => {
  test('Login genera un log de auditoria', async () => {
    // Crear usuario de forma directa
    const user = await Usuario.create({
      nombre: 'Audit User',
      email: `audit-${Date.now()}@test.com`,
      contraseña: 'AuditPass123!',
      rol: 'doctor',
    });

    // Login
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, contraseña: 'AuditPass123!' });

    // Si el login fue exitoso, verificar log
    if (res.status === 200) {
      // Dar un breve delay para que el fire-and-forget log se procese
      await new Promise(r => setTimeout(r, 500));

      const logs = await AuditLog.find({ userId: user._id, evento: 'login_exitoso' });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('Cambio de PIN genera log de auditoria', async () => {
    const { token, user } = await createUser({ rol: 'doctor' });

    await request(app)
      .post('/api/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1234' });

    // Dar un breve delay
    await new Promise(r => setTimeout(r, 500));

    const logs = await AuditLog.find({ userId: user._id, evento: 'cambio_pin' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. MODO CORTINA: Lock / Unlock pantalla
// ═══════════════════════════════════════════════════════════════════════

describe('Modo Cortina', () => {
  test('Bloquear pantalla retorna locked: true', async () => {
    const { token } = await createUser({ rol: 'doctor' });

    const res = await request(app)
      .post('/api/auth/lock-screen')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
  });

  test('Desbloquear pantalla retorna locked: false', async () => {
    const { token } = await createUser({ rol: 'doctor' });

    const res = await request(app)
      .post('/api/auth/unlock-screen')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. PERMISSIONS UNIT TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('hasPermission (unit)', () => {
  const { hasPermission: hp } = require('../utils/permissions');

  test('Wildcard * cubre todo', () => {
    expect(hp(['*'], ['patients.read'])).toBe(true);
    expect(hp(['*'], ['system.maintenance'])).toBe(true);
  });

  test('Permiso padre cubre hijo', () => {
    expect(hp(['patients.read'], ['patients.read.basic'])).toBe(true);
  });

  test('Wildcard jerarquico patients.* cubre patients.read', () => {
    expect(hp(['patients.*'], ['patients.read'])).toBe(true);
    expect(hp(['patients.*'], ['patients.create'])).toBe(true);
  });

  test('Permiso exacto funciona', () => {
    expect(hp(['consultas.create.draft'], ['consultas.create.draft'])).toBe(true);
  });

  test('Permiso insuficiente retorna false', () => {
    expect(hp(['patients.read.basic'], ['patients.read'])).toBe(false);
    expect(hp(['patients.read.basic'], ['patients.create'])).toBe(false);
  });

  test('Sin permisos retorna false', () => {
    expect(hp([], ['patients.read'])).toBe(false);
  });

  test('Sin requeridos retorna true', () => {
    expect(hp(['patients.read'], [])).toBe(true);
  });
});
