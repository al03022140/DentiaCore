/**
 * Firma de notas de evolución — regresión tras refactor de duplicación
 * (resolveSigningDoctor / persistNoteSignatures / signNoteDraft).
 *
 * Antes de este refactor, la ruta OFICIAL (con firma) de addEvolutionNote,
 * signExistingEvolutionNote y la rama `nota_evolucion` de /api/drafts no
 * tenían ninguna prueba automatizada — sólo se cubría la creación en
 * BORRADOR. Este archivo cierra ese hueco para la lógica que se movió a
 * los nuevos helpers compartidos.
 */

const request = require('supertest');

const app = require('../scripts/dent');
const Patient = require('../models/patient');
const { createUser, withMongoMemoryServer } = require('./helpers/testAuth');

jest.setTimeout(30000);

// PNG 1x1 válido — evita depender de un archivo de firma real en disco.
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function createPatient() {
  return Patient.create({
    primer_nombre: 'Paciente',
    apellido_paterno: 'Firma',
    fecha_nacimiento: new Date('1990-01-15'),
    sexo: 'Masculino',
    documento: { tipo: 'INE', numero: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
}

const mongoMemory = withMongoMemoryServer();
let doctorToken, doctor;

beforeAll(() => mongoMemory.start());

afterAll(() => mongoMemory.stop());

beforeEach(async () => {
  const created = await createUser({ rol: 'doctor' });
  doctorToken = created.token;
  doctor = created.user;

  await request(app)
    .post('/api/auth/set-pin')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ pin: '4321' });
});

afterEach(async () => {
  await Patient.deleteMany({});
});

describe('addEvolutionNote — creación OFICIAL con firma pad (resolveSigningDoctor + persistNoteSignatures)', () => {
  test('auto-firma del doctor guarda la nota como OFICIAL con ambas firmas', async () => {
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Limpieza dental' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.estadoRegistro).toBe('OFICIAL');
    expect(res.body.data.pacienteFirmaUrl).toBeTruthy();
    expect(res.body.data.doctorFirmaUrl).toBeTruthy();
    expect(res.body.data.contentHash).toBeTruthy();
    expect(res.body.data.firmadoPor).toBe(doctor._id.toString());
  });

  test('asistente no puede auto-firmar como OFICIAL (403)', async () => {
    const { token: asistenteToken } = await createUser({ rol: 'asistente' });
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${asistenteToken}`)
      .send({
        evolutionNote: { procedimiento: 'Intento no autorizado' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });

    expect(res.status).toBe(403);
  });
});

describe('signExistingEvolutionNote — BORRADOR → OFICIAL (resolveSigningDoctor + persistNoteSignatures)', () => {
  test('firma con pad transiciona el borrador a OFICIAL', async () => {
    const patient = await createPatient();

    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { observaciones: 'Nota en borrador' } });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.estadoRegistro).toBe('BORRADOR');
    const noteId = createRes.body.data._id;

    const signRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note/${noteId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });

    expect(signRes.status).toBe(200);
    expect(signRes.body.data.estadoRegistro).toBe('OFICIAL');
    expect(signRes.body.data.pacienteFirmaUrl).toBeTruthy();
    expect(signRes.body.data.doctorFirmaUrl).toBeTruthy();
    expect(signRes.body.data.contentHash).toBeTruthy();
  });
});

describe('Drafts de notas de evolución — resourceType nota_evolucion (signNoteDraft)', () => {
  test('PATCH /api/drafts/:id/sign firma una nota individual', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Revisión' } });
    const noteId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/drafts/${noteId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resourceType: 'nota_evolucion', pin: '4321' });

    expect(res.status).toBe(200);
    expect(res.body.noteId).toBe(noteId);

    const updated = await Patient.findById(patient._id).lean();
    const note = updated.notas_evolucion.find(n => n._id.toString() === noteId);
    expect(note.estadoRegistro).toBe('OFICIAL');
    expect(note.contentHash).toBeTruthy();
    expect(note.firmadoPor.toString()).toBe(doctor._id.toString());
  });

  test('POST /api/drafts/batch-sign firma varias notas en lote', async () => {
    const patient = await createPatient();
    const create1 = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Nota 1' } });
    const create2 = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Nota 2' } });

    const draftIds = [
      { id: create1.body.data._id, resourceType: 'nota_evolucion' },
      { id: create2.body.data._id, resourceType: 'nota_evolucion' },
    ];

    const res = await request(app)
      .post('/api/drafts/batch-sign')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ draftIds, pin: '4321' });

    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBe(2);
    expect(res.body.resultados.every(r => r.status === 'aprobado')).toBe(true);

    const updated = await Patient.findById(patient._id).lean();
    expect(updated.notas_evolucion.every(n => n.estadoRegistro === 'OFICIAL')).toBe(true);
  });

  test('firmar una nota ya OFICIAL devuelve error (no está en BORRADOR)', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Ya oficial' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });
    const noteId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/drafts/${noteId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resourceType: 'nota_evolucion', pin: '4321' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no está en estado BORRADOR/i);
  });
});
