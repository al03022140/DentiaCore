/**
 * Regresiones de la auditoría dirigida de NOTAS DE EVOLUCIÓN (2026-07-12).
 *
 * Cada describe cubre un hallazgo; los tests fallan contra el código previo
 * al fix correspondiente:
 *  - N1: fechaFormateada la derivaba el cliente (fecha visible ≠ fecha hasheada)
 *  - N2: dos intentos de firma sobre la misma nota compartían rutas de PNG
 *        (el perdedor pisaba/borraba la evidencia del ganador)
 *  - N3: payloads inválidos (tipo/fecha/cota) reventaban tarde con 500,
 *        con contador consumido; firma incompleta se degradaba en silencio
 *  - N4: el PATCH de borrador y el reject bypasseaban el maxlength del schema
 *  - N5: `_capturaExtemporanea` inyectada por el cliente se persistía como
 *        metadato falso cuando el body no traía fecha
 *  - N6: firmadoPor viajaba sin nombre (la UI imprimía al usuario logueado)
 *  - N10: el dataURL de firma no validaba magic bytes
 */

const request = require('supertest');
const fsExtra = require('fs-extra');

const app = require('../scripts/dent');
const Patient = require('../models/patient');
const { resolveUploadsPath } = require('../utils/uploads');
const { verifySignatureImageHash } = require('../utils/saveSignatureImage');
const { createUser, withMongoMemoryServer } = require('./helpers/testAuth');

jest.setTimeout(30000);

// PNG 1x1 y JPEG 1x1 válidos (magic bytes reales, contenidos distintos).
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

function uploadsAbsPath(publicUrl) {
  return resolveUploadsPath(...publicUrl.replace(/^\/uploads\//, '').split('/'));
}

async function createPatient() {
  return Patient.create({
    primer_nombre: 'Nota',
    apellido_paterno: 'Auditoria',
    fecha_nacimiento: new Date('1990-01-15'),
    sexo: 'Masculino',
    documento: { tipo: 'INE', numero: `NAUD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
}

async function getCounter(patientId) {
  const doc = await Patient.findById(patientId).select('+_evolutionNoteCounter').lean();
  return doc._evolutionNoteCounter || 0;
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

describe('N1 — fechaFormateada siempre derivada de la fecha clínica', () => {
  test('ignora la fechaFormateada enviada por el cliente', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: {
          procedimiento: 'Limpieza',
          fecha: new Date().toISOString(),
          fechaFormateada: '1 de enero de 1999, 00:00',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.fechaFormateada).not.toBe('1 de enero de 1999, 00:00');
    expect(res.body.data.fechaFormateada).toContain(String(new Date().getFullYear()));

    const saved = await Patient.findById(patient._id).lean();
    expect(saved.notas_evolucion[0].fechaFormateada).not.toContain('1999');
  });
});

describe('N3 — validación temprana del payload (400, sin efectos colaterales)', () => {
  test('campo no-string → 400 (antes TypeError → 500)', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 12345 } });
    expect(res.status).toBe(400);
  });

  test('fecha no parseable → 400 (antes CastError → 500 con contador consumido)', async () => {
    const patient = await createPatient();
    const before = await getCounter(patient._id);
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'X', fecha: 'no-es-una-fecha' } });
    expect(res.status).toBe(400);
    expect(await getCounter(patient._id)).toBe(before);
  });

  test('procedimiento sobre el maxlength → 400 antes de tocar contador/BD', async () => {
    const patient = await createPatient();
    const before = await getCounter(patient._id);
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'x'.repeat(5001) } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/procedimiento/);
    expect(await getCounter(patient._id)).toBe(before);
    const saved = await Patient.findById(patient._id).lean();
    expect(saved.notas_evolucion).toHaveLength(0);
  });

  test('firma incompleta (solo la del paciente) → 400, no BORRADOR silencioso', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Con firma a medias' },
        patientSignature: PNG_DATA_URL,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incompleta/i);
    const saved = await Patient.findById(patient._id).lean();
    expect(saved.notas_evolucion).toHaveLength(0);
  });
});

describe('N4 — cotas en edición de borrador y rechazo', () => {
  test('PATCH de borrador con observaciones sobre el maxlength → 400 y nota intacta', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { observaciones: 'Original' } });
    const noteId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/patients/${patient._id}/evolution-note/${noteId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ observaciones: 'x'.repeat(20001) });

    expect(res.status).toBe(400);
    const saved = await Patient.findById(patient._id).lean();
    expect(saved.notas_evolucion[0].observaciones).toBe('Original');
  });

  test('rechazo con motivo sobre 500 caracteres → 400', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Para rechazar' } });
    const noteId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/drafts/${noteId}/reject`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resourceType: 'nota_evolucion', motivo: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/500/);
  });
});

describe('N5 — _capturaExtemporanea no inyectable por el cliente', () => {
  test('marca inyectada sin fecha en el body NO se persiste', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Nota normal de hoy' },
        _capturaExtemporanea: {
          esExtemporanea: true,
          motivo: 'falsificado',
          fechaNota: '2020-01-01T00:00:00.000Z',
        },
      });

    expect(res.status).toBe(201);
    const saved = await Patient.findById(patient._id).lean();
    const ce = saved.notas_evolucion[0].capturaExtemporanea;
    expect(ce?.esExtemporanea || false).toBe(false);
    expect(ce?.motivo || null).toBeNull();
  });

  test('captura extemporánea legítima (fecha -8h + motivo) sigue funcionando', async () => {
    const patient = await createPatient();
    const fecha = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Registro tardío', fecha },
        capturaExtemporaneaMotivo: 'error_captura',
      });

    expect(res.status).toBe(201);
    const saved = await Patient.findById(patient._id).lean();
    const ce = saved.notas_evolucion[0].capturaExtemporanea;
    expect(ce.esExtemporanea).toBe(true);
    expect(ce.motivo).toBe('error_captura');
  });

  test('sin motivo, la captura extemporánea se sigue rechazando (400)', async () => {
    const patient = await createPatient();
    const fecha = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Tardía sin motivo', fecha } });
    expect(res.status).toBe(400);
    expect(res.body.esExtemporanea).toBe(true);
  });
});

describe('N2 — archivos de firma únicos por intento (evidencia inmutable)', () => {
  test('un segundo firmado no pisa ni borra los PNGs del primero', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Nota a firmar dos veces' } });
    const noteId = createRes.body.data._id;

    // Primer firmado (el "ganador" de la carrera).
    const sign1 = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note/${noteId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ patientSignature: PNG_DATA_URL, doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL } });
    expect(sign1.status).toBe(200);
    const url1 = sign1.body.data.pacienteFirmaUrl;
    const hash1 = sign1.body.data.pacienteFirmaImageHash;
    const abs1 = uploadsAbsPath(url1);
    expect(await fsExtra.pathExists(abs1)).toBe(true);

    // Simula el estado stale que ve un segundo request concurrente: la nota
    // vuelve a BORRADOR directo en Mongo (las URLs del primer firmado quedan).
    await Patient.updateOne(
      { _id: patient._id, 'notas_evolucion._id': noteId },
      { $set: { 'notas_evolucion.$.estadoRegistro': 'BORRADOR' } }
    );

    // Segundo firmado con CONTENIDO de firma distinto (JPEG).
    const sign2 = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note/${noteId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ patientSignature: JPEG_DATA_URL, doctorSignature: { method: 'pad', dataUrl: JPEG_DATA_URL } });
    expect(sign2.status).toBe(200);

    // Antes del fix ambos intentos escribían `<noteId>_paciente.png`: la URL
    // era idéntica y el PNG del primer firmado quedaba SOBREESCRITO (el hash
    // guardado ya no coincidía con el archivo en disco).
    expect(sign2.body.data.pacienteFirmaUrl).not.toBe(url1);
    expect(await fsExtra.pathExists(abs1)).toBe(true);
    const verdict = await verifySignatureImageHash(abs1, hash1);
    expect(verdict.ok).toBe(true);
  });
});

describe('N10 — magic bytes del dataURL de firma', () => {
  test('base64 que no es PNG real → 400 y nada persistido', async () => {
    const patient = await createPatient();
    const fake = 'data:image/png;base64,' + Buffer.from('no soy un png').toString('base64');
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Firma falsa' },
        patientSignature: fake,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG\/JPG/i);
    const saved = await Patient.findById(patient._id).lean();
    expect(saved.notas_evolucion).toHaveLength(0);
  });
});

describe('R1 — firma cruzada con pad exige el PIN del doctor (anti-suplantación)', () => {
  test('asistente + asDoctorId + pad SIN pin → 401 (antes 201 con PNG arbitrario)', async () => {
    const { token: asistenteToken } = await createUser({ rol: 'asistente' });
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${asistenteToken}`)
      .send({
        evolutionNote: { procedimiento: 'Intento sin PIN' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL, asDoctorId: doctor._id.toString() },
      });

    expect(res.status).toBe(401);
    const saved = await Patient.findById(patient._id).lean();
    expect(saved.notas_evolucion).toHaveLength(0);
  });

  test('asistente + asDoctorId + pad + PIN correcto → 201 OFICIAL firmada por el doctor', async () => {
    const { token: asistenteToken } = await createUser({ rol: 'asistente' });
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${asistenteToken}`)
      .send({
        evolutionNote: { procedimiento: 'Firmada por el doctor presente' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL, asDoctorId: doctor._id.toString(), pin: '4321' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.estadoRegistro).toBe('OFICIAL');
    expect(res.body.data.firmadoPor._id).toBe(doctor._id.toString());
  });

  test('doctor con asDoctorId de sí mismo + pad sin pin sigue funcionando (no es cruzada)', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Auto-firma vía selector' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL, asDoctorId: doctor._id.toString() },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.estadoRegistro).toBe('OFICIAL');
  });

  test('firma cruzada hacia doctor sin PIN configurado → 400 accionable', async () => {
    const { token: asistenteToken } = await createUser({ rol: 'asistente' });
    const { user: doctorSinPin } = await createUser({ rol: 'doctor' });
    const patient = await createPatient();

    const res = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${asistenteToken}`)
      .send({
        evolutionNote: { procedimiento: 'Cruzada sin PIN configurado' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL, asDoctorId: doctorSinPin._id.toString() },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PIN configurado/i);
  });
});

describe('R3 — GET /evolution-note/:noteId/verify (integridad de la nota)', () => {
  async function createOfficialNote(patientId) {
    const res = await request(app)
      .post(`/api/patients/${patientId}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Nota verificable' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  test('nota OFICIAL recién firmada → íntegra (contenido y firmas)', async () => {
    const patient = await createPatient();
    const note = await createOfficialNote(patient._id);

    const res = await request(app)
      .get(`/api/patients/${patient._id}/evolution-note/${note._id}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.integro).toBe(true);
    expect(res.body.motivos).toEqual([]);
    expect(res.body.checks).toMatchObject({ contenidoOk: true, firmaPacienteOk: true, firmaDoctorOk: true });
  });

  test('contenido manipulado en BD → contenido_alterado', async () => {
    const patient = await createPatient();
    const note = await createOfficialNote(patient._id);

    await Patient.updateOne(
      { _id: patient._id, 'notas_evolucion._id': note._id },
      { $set: { 'notas_evolucion.$.procedimiento': 'CONTENIDO ALTERADO POST-FIRMA' } }
    );

    const res = await request(app)
      .get(`/api/patients/${patient._id}/evolution-note/${note._id}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.integro).toBe(false);
    expect(res.body.motivos).toContain('contenido_alterado');
  });

  test('PNG de la firma del paciente reemplazado en disco → firma_paciente_alterada', async () => {
    const patient = await createPatient();
    const note = await createOfficialNote(patient._id);

    const abs = uploadsAbsPath(note.pacienteFirmaUrl);
    await fsExtra.writeFile(abs, Buffer.from('bytes ajenos que no son la firma'));

    const res = await request(app)
      .get(`/api/patients/${patient._id}/evolution-note/${note._id}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.integro).toBe(false);
    expect(res.body.motivos).toContain('firma_paciente_alterada');
  });

  test('BORRADOR sin firmas → íntegro (evaluación laxa)', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ evolutionNote: { procedimiento: 'Borrador' } });

    const res = await request(app)
      .get(`/api/patients/${patient._id}/evolution-note/${createRes.body.data._id}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.integro).toBe(true);
  });
});

describe('R4 — addTreatmentPlan: fechaFormateada derivada de la fecha del plan', () => {
  test('ignora la fechaFormateada del cliente', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        treatmentPlan: {
          texto: 'Plan de tratamiento',
          confirmar: 'confirmar',
          fecha: new Date().toISOString(),
          fechaFormateada: '1 de enero de 1999, 00:00',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.fechaFormateada).not.toBe('1 de enero de 1999, 00:00');
    expect(res.body.data.fechaFormateada).toContain(String(new Date().getFullYear()));
  });

  test('fecha no parseable → 400 (antes CastError → 500)', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .post(`/api/patients/${patient._id}/treatment-plan`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ treatmentPlan: { texto: 'Plan', confirmar: 'confirmar', fecha: 'no-es-fecha' } });
    expect(res.status).toBe(400);
  });
});

describe('N6 — nombre del firmante real en las respuestas', () => {
  test('GET del paciente popula firmadoPor.nombre de las notas firmadas', async () => {
    const patient = await createPatient();
    const createRes = await request(app)
      .post(`/api/patients/${patient._id}/evolution-note`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evolutionNote: { procedimiento: 'Firmada' },
        patientSignature: PNG_DATA_URL,
        doctorSignature: { method: 'pad', dataUrl: PNG_DATA_URL },
      });
    expect(createRes.status).toBe(201);
    // La respuesta del POST ya trae el nombre (sin recargar).
    expect(createRes.body.data.firmadoPor.nombre).toBe(doctor.nombre);

    const getRes = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(getRes.status).toBe(200);
    const note = getRes.body.patient.notas_evolucion[0];
    expect(note.firmadoPor).toMatchObject({ nombre: doctor.nombre });
  });
});
