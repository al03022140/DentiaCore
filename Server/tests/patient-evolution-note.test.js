const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../scripts/dent');
const Patient = require('../models/patient');
const Usuario = require('../models/users');
const { getEffectivePermissions } = require('../utils/permissions');
const { getJwtSecret } = require('../utils/crypto');

jest.setTimeout(30000);

const JWT_SECRET = getJwtSecret();

function makeToken(user) {
  const permissions = getEffectivePermissions(user);
  return jwt.sign(
    { sub: user._id.toString(), role: user.rol, permissions },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'dentia-core' }
  );
}

let mongoServer;
let authToken;

describe('POST /api/patients/:id/evolution-note', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    // Create a doctor user for authentication
    const user = await Usuario.create({
      nombre: 'Dr. Test',
      email: `evo-test-${Date.now()}@test.com`,
      contraseña: 'Password123!',
      rol: 'doctor'
    });
    authToken = makeToken(user);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  afterEach(async () => {
    await Patient.deleteMany({});
  });

  test('should save evolution note when at least one field is provided', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Eva',
      apellido_paterno: 'Lucion',
      fecha_nacimiento: new Date('1985-03-15'),
      sexo: 'Femenino',
      documento: { tipo: 'INE', numero: 'EVO1234567890' }
    });

    const payload = {
      evolutionNote: {
        procedimiento: 'Profilaxis',
        observaciones: 'Paciente se mantiene estable'
      }
    };

    const response = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        procedimiento: 'Profilaxis'
      }
    });

    const updatedPatient = await Patient.findById(patient._id).lean();
    expect(updatedPatient.notas_evolucion).toHaveLength(1);
    expect(updatedPatient.notas_evolucion[0].procedimiento).toBe('Profilaxis');
  });

  test('should reject request when all fields are empty', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Eva',
      apellido_paterno: 'Lucion',
      fecha_nacimiento: new Date('1985-03-15'),
      sexo: 'Femenino',
      documento: { tipo: 'INE', numero: 'EVO1234567891' }
    });

    const response = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ evolutionNote: { procedimiento: ' ', observaciones: ' ', correcciones: ' ' } })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false
    });
  });

  test('should increment numero_procedimiento and trim fields on save', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Eva',
      apellido_paterno: 'Lucion',
      fecha_nacimiento: new Date('1985-03-15'),
      sexo: 'Femenino',
      documento: { tipo: 'INE', numero: 'EVO1234567892' },
      notas_evolucion: [{
        numero_procedimiento: 1,
        procedimiento: 'Control inicial',
        observaciones: 'Sin novedades',
        correcciones: '',
        fecha: new Date('2025-01-01T10:00:00.000Z')
      }]
    });

    const payload = {
      evolutionNote: {
        procedimiento: '   Limpieza   ',
        observaciones: '   Con sangrado leve   '
      }
    };

    const response = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        numero_procedimiento: 2,
        procedimiento: 'Limpieza'
      }
    });

    const updatedPatient = await Patient.findById(patient._id).lean();
    expect(updatedPatient.notas_evolucion).toHaveLength(2);

    const [latestNote, previousNote] = updatedPatient.notas_evolucion;
    expect(latestNote.numero_procedimiento).toBe(2);
    expect(latestNote.procedimiento).toBe('Limpieza');
    expect(latestNote.observaciones).toBe('Con sangrado leve');
    expect(latestNote.fecha).toBeInstanceOf(Date);
    expect(previousNote.numero_procedimiento).toBe(1);
  });
});
