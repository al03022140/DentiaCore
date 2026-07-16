/**
 * Regresión D-2 (docs/PLAN_CIERRE_V1.md): findConflict (doctor) y
 * findPatientConflict (paciente) en appointmentController.js comparten el
 * mismo algoritmo de solapamiento pero cubren dos dimensiones distintas
 * (un doctor no puede tener 2 citas a la vez; un paciente tampoco, aunque
 * sea con doctores distintos). El hallazgo ARQ-DUP-07 de la auditoría los
 * marcó como candidatos a deduplicar; este test confirma primero que el
 * solapamiento se detecta correctamente en ambas dimensiones antes de
 * decidir si fusionarlas es seguro.
 */

const request = require('supertest');

const app = require('../scripts/dent');
const Patient = require('../models/patient');
const Appointment = require('../models/appointment');
const { createUser, withMongoMemoryServer } = require('./helpers/testAuth');

jest.setTimeout(30000);

async function createPatient(nombre) {
  return Patient.create({
    primer_nombre: nombre,
    apellido_paterno: 'Conflicto',
    fecha_nacimiento: new Date('1990-01-15'),
    sexo: 'Masculino',
    documento: { tipo: 'INE', numero: `CONF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
}

function futureDate(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

const mongoMemory = withMongoMemoryServer();
let token, docA, docB, patientX, patientY;

beforeAll(() => mongoMemory.start());
afterAll(() => mongoMemory.stop());

beforeEach(async () => {
  const requester = await createUser({ rol: 'doctor' });
  token = requester.token;
  docA = requester.user;
  docB = (await createUser({ rol: 'doctor' })).user;
  patientX = await createPatient('PacienteX');
  patientY = await createPatient('PacienteY');
});

afterEach(async () => {
  await Appointment.deleteMany({});
  await Patient.deleteMany({});
});

describe('D-2 — findConflict (doctor) vs findPatientConflict (paciente)', () => {
  test('mismo doctor, horario solapado, pacientes distintos → 409 conflictType doctor', async () => {
    const base = futureDate(24);
    const first = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientX._id, doctor_id: docA._id, fecha_hora: base.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });
    expect(first.status).toBe(201);

    const overlapStart = new Date(base.getTime() + 15 * 60 * 1000); // dentro de los 30 min
    const second = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientY._id, doctor_id: docA._id, fecha_hora: overlapStart.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });

    expect(second.status).toBe(409);
    expect(second.body.conflictType).toBe('doctor');
  });

  test('mismo paciente, horario solapado, doctores distintos → 409 conflictType patient', async () => {
    const base = futureDate(25);
    const first = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientX._id, doctor_id: docA._id, fecha_hora: base.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });
    expect(first.status).toBe(201);

    const overlapStart = new Date(base.getTime() + 15 * 60 * 1000);
    const second = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientX._id, doctor_id: docB._id, fecha_hora: overlapStart.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });

    expect(second.status).toBe(409);
    expect(second.body.conflictType).toBe('patient');
  });

  test('mismo doctor, horarios consecutivos sin solape → ambas 201', async () => {
    const base = futureDate(26);
    const first = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientX._id, doctor_id: docA._id, fecha_hora: base.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });
    expect(first.status).toBe(201);

    const nonOverlapStart = new Date(base.getTime() + 30 * 60 * 1000); // justo al terminar la primera
    const second = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientY._id, doctor_id: docA._id, fecha_hora: nonOverlapStart.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });

    expect(second.status).toBe(201);
  });

  test('force=true salta el conflicto de doctor pero NO el de paciente', async () => {
    const base = futureDate(27);
    await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientX._id, doctor_id: docA._id, fecha_hora: base.toISOString(), duracion: 30, motivo: 'Consulta de rutina' });

    const overlapStart = new Date(base.getTime() + 15 * 60 * 1000);

    // force=true: el doctor puede quedar doble-agendado a propósito...
    const doctorForced = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientY._id, doctor_id: docA._id, fecha_hora: overlapStart.toISOString(), duracion: 30, force: true, motivo: 'Consulta de rutina' });
    expect(doctorForced.status).toBe(201);

    // ...pero el MISMO paciente nunca puede estar en dos citas a la vez, ni con force.
    const patientForced = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: patientX._id, doctor_id: docB._id, fecha_hora: overlapStart.toISOString(), duracion: 30, force: true, motivo: 'Consulta de rutina' });
    expect(patientForced.status).toBe(409);
    expect(patientForced.body.conflictType).toBe('patient');
  });
});
