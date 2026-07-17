/**
 * validateFormat — reglas de formato del alta/edición de paciente.
 * Espejo del servidor (schema + validatePatientFieldRules); ver auditoría
 * add-patient: topes de documento/nombres/textos y fechas no futuras.
 */
import { validateFormat, TEXT_MAX_LEN } from './validate-format';

const base = () => ({
  documento: { tipo: 'INE', numero: 'ABC-123' },
  primer_nombre: 'Juan',
  apellido_paterno: 'Pérez',
  fecha_nacimiento: '1990-01-15',
  contacto: { telefono: '55 1234 5678' },
});

const labels = (data) => validateFormat(data).map((e) => e.label).join(' | ');

test('datos válidos → sin errores (apóstrofes y & permitidos)', () => {
  expect(validateFormat({ ...base(), primer_nombre: "D'Angelo", contacto: { telefono: '55 1234 5678', direccion: 'Av. Juárez & 5' } })).toEqual([]);
});

test('documento de 31 caracteres → error; de 30 → ok', () => {
  expect(labels({ ...base(), documento: { tipo: 'INE', numero: 'A'.repeat(31) } })).toMatch(/entre 3 y 30/);
  expect(validateFormat({ ...base(), documento: { tipo: 'INE', numero: 'A'.repeat(30) } })).toEqual([]);
});

test('nombre de más de 50 caracteres → error', () => {
  expect(labels({ ...base(), primer_nombre: 'a'.repeat(51) })).toMatch(/primer nombre.*50/);
  expect(labels({ ...base(), apellido_materno: 'a'.repeat(51) })).toMatch(/apellido materno.*50/);
});

test(`texto clínico de más de ${TEXT_MAX_LEN} chars → error que nombra el campo (anti-truncado silencioso)`, () => {
  const data = {
    ...base(),
    encuesta_medica: { informacion_general: { observaciones_salud_general: 'x'.repeat(TEXT_MAX_LEN + 1) } },
  };
  expect(labels(data)).toMatch(/observaciones salud general/);
});

test('photoURL base64 gigante NO dispara el error de longitud', () => {
  const data = { ...base(), photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(TEXT_MAX_LEN * 3) };
  expect(validateFormat(data)).toEqual([]);
});

test('semanas de gestación fuera de 0-45 → error; vacía → sin error', () => {
  const conSemanas = (v) => ({ ...base(), encuesta_medica: { embarazo: { semanas_gestacion: v } } });
  expect(labels(conSemanas(46))).toMatch(/gestación/);
  expect(labels(conSemanas(-1))).toMatch(/gestación/);
  expect(validateFormat(conSemanas(''))).toEqual([]);
  expect(validateFormat(conSemanas(12))).toEqual([]);
});

test('fechas médicas futuras → error', () => {
  const future = '2999-01-01';
  expect(labels({ ...base(), encuesta_medica: { informacion_general: { ultimo_examen_medico: { fecha: future } } } }))
    .toMatch(/examen médico/);
  expect(labels({ ...base(), habitos_higiene: { fecha_ultima_visita_odontologo: future } }))
    .toMatch(/odontólogo/);
  expect(labels({ ...base(), informacion_femenina: { fecha_ultimo_parto: future } }))
    .toMatch(/último parto/);
});

test('reglas preexistentes siguen: email inválido y teléfono corto', () => {
  expect(labels({ ...base(), email: 'no-es-email' })).toMatch(/correo/);
  expect(labels({ ...base(), contacto: { telefono: '123' } })).toMatch(/teléfono/i);
});
