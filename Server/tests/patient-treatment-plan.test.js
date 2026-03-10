const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../scripts/dent');
const Patient = require('../models/patient');
const Usuario = require('../models/users');
const { getEffectivePermissions } = require('../utils/permissions');

jest.setTimeout(30000);

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

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

describe('POST /api/patients/:id/treatment-plan', () => {
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
      email: `tp-test-${Date.now()}@test.com`,
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

  test('should save treatment plan and return formatted data', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Test',
      apellido_paterno: 'Paciente',
      fecha_nacimiento: new Date('1990-01-01'),
      sexo: 'Masculino',
      documento: { tipo: 'INE', numero: 'TEST1234567890' }
    });

    const payload = {
      treatmentPlan: {
        texto: 'Aplicar tratamiento periodontal',
        fecha: '2025-02-01T12:00:00.000Z',
        confirmar: 'confirmar'
      }
    };

    const response = await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        texto: 'Aplicar tratamiento periodontal'
      }
    });

    const updatedPatient = await Patient.findById(patient._id).lean();
    expect(updatedPatient.planes_tratamiento).toHaveLength(1);
    expect(updatedPatient.planes_tratamiento[0].texto).toBe('Aplicar tratamiento periodontal');
  });

  test('should reject empty treatment plan text', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Test',
      apellido_paterno: 'Paciente',
      fecha_nacimiento: new Date('1990-01-01'),
      sexo: 'Masculino',
      documento: { tipo: 'INE', numero: 'TEST1234567891' }
    });

    const response = await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ treatmentPlan: { texto: '   ', confirmar: 'confirmar' } })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false
    });
  });

  test('should trim treatment text and prepend newest entry', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Test',
      apellido_paterno: 'Paciente',
      fecha_nacimiento: new Date('1990-01-01'),
      sexo: 'Masculino',
      documento: { tipo: 'INE', numero: 'TEST1234567892' },
      planes_tratamiento: [{
        texto: 'Control semestral',
        fecha: new Date('2025-01-10T10:00:00.000Z')
      }]
    });

    const payload = {
      treatmentPlan: {
        texto: '   Ajustar férula nocturna   ',
        confirmar: '  CONFIRMAR  '
      }
    };

    const response = await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        texto: 'Ajustar férula nocturna'
      }
    });

    const updatedPatient = await Patient.findById(patient._id).lean();
    expect(updatedPatient.planes_tratamiento).toHaveLength(2);

    const [latestPlan, previousPlan] = updatedPatient.planes_tratamiento;
    expect(latestPlan.texto).toBe('Ajustar férula nocturna');
    expect(latestPlan.fecha).toBeInstanceOf(Date);
    expect(previousPlan.texto).toBe('Control semestral');
  });

  test('should reject when confirmation word is missing or incorrect', async () => {
    const patient = await Patient.create({
      primer_nombre: 'Test',
      apellido_paterno: 'Paciente',
      fecha_nacimiento: new Date('1990-01-01'),
      sexo: 'Masculino',
      documento: { tipo: 'INE', numero: 'TEST1234567893' }
    });

    await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ treatmentPlan: { texto: 'Aplicar flúor' } })
      .expect(400);

    await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ treatmentPlan: { texto: 'Aplicar flúor', confirmar: 'confirm' } })
      .expect(400);
  });
});
