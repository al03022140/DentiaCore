// Validación de FORMATO del alta/edición de paciente (extraída de
// add-patient.jsx para poder testearla sin montar el componente).
// Espejo del servidor: schema (models/patient.js) + validatePatientFieldRules
// y sanitizeAndLimitPayload (patientsController.js).

// TLD de >=2 letras y sin caracteres raros/emojis en local-part o dominio.
// Debe mantenerse alineado con el validador del modelo (Server/models/patient.js).
export const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const EMAIL_MAX_LEN = 254; // RFC 5321
// Número de documento: alfanumérico + guion, 3-30 chars (rechaza emojis,
// símbolos puros y entradas de 1-2 chars claramente inválidas). El máximo de
// 30 es el maxlength del schema: sin este tope el error aparecía recién al
// guardar, como 400 genérico al final del wizard.
export const DOC_NUMERO_REGEX = /^[A-Za-z0-9-]+$/;
export const DOC_NUMERO_MAX_LEN = 30;
// Acepta el formato visible (espacios, guiones, paréntesis, +), pero
// requiere que tenga AL MENOS 7 dígitos reales; "((((((" o "+++--" se rechazan.
export const PHONE_ALLOWED_CHARS = /^[\d\s\-+()]+$/;
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;
// LIMITS.MAX_NAME_LENGTH del server (validatePatientFieldRules).
export const NAME_MAX_LEN = 50;
// MAX_LONG_TEXT_LENGTH del server: sanitizeAndLimitPayload TRUNCA EN SILENCIO
// cualquier string más largo. Validarlo aquí evita perder texto clínico sin
// que el usuario se entere (vería "guardado correctamente" con el texto mocho).
export const TEXT_MAX_LEN = 2000;

const NAME_FIELDS = [
  ['primer_nombre', 'El primer nombre'],
  ['otros_nombres', 'El segundo nombre'],
  ['apellido_paterno', 'El apellido paterno'],
  ['apellido_materno', 'El apellido materno'],
];

// Parsear YYYY-MM-DD en hora LOCAL (no UTC) para alinear con el backend y
// evitar el corrimiento de un día en zonas con offset negativo.
const parseLocalDate = (s) => {
  const raw = String(s).slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
};

// Junta los paths de strings que exceden TEXT_MAX_LEN. Se excluye photoURL:
// en el momento de validar todavía trae el base64 de la foto (se convierte a
// archivo después) y dispararía un falso positivo gigante.
const collectLongStrings = (value, path, out) => {
  if (typeof value === 'string') {
    if (value.length > TEXT_MAX_LEN) out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectLongStrings(v, `${path} #${i + 1}`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (!path && k === 'photoURL') continue;
      collectLongStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
};

export const validateFormat = (data) => {
  const errors = [];
  if (data.email && (!EMAIL_REGEX.test(data.email) || data.email.length > EMAIL_MAX_LEN)) {
    errors.push({ label: 'El correo electrónico tiene un formato inválido' });
  }
  const docNumero = data.documento?.numero ? String(data.documento.numero).trim() : '';
  if (docNumero && (docNumero.length < 3 || docNumero.length > DOC_NUMERO_MAX_LEN || !DOC_NUMERO_REGEX.test(docNumero))) {
    errors.push({ label: `El número de documento debe tener entre 3 y ${DOC_NUMERO_MAX_LEN} caracteres y solo letras, números o guiones` });
  }
  for (const [field, label] of NAME_FIELDS) {
    if (data[field] && String(data[field]).length > NAME_MAX_LEN) {
      errors.push({ label: `${label} no puede exceder ${NAME_MAX_LEN} caracteres` });
    }
  }
  const phone = data.contacto?.telefono;
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (!PHONE_ALLOWED_CHARS.test(phone) || digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
      errors.push({ label: `El teléfono debe tener entre ${PHONE_MIN_DIGITS} y ${PHONE_MAX_DIGITS} dígitos` });
    }
  }
  if (data.fecha_nacimiento) {
    // Edad por calendario, no resta cruda de años.
    const birthDate = parseLocalDate(data.fecha_nacimiento);
    const today = new Date();
    if (!Number.isNaN(birthDate.getTime())) {
      if (birthDate > today) {
        errors.push({ label: 'La fecha de nacimiento no puede ser futura' });
      }
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age > 120) {
        errors.push({ label: 'La fecha de nacimiento implica una edad mayor a 120 años' });
      }
    }
  }
  // Fechas clínicas que no pueden ser futuras (dato incoherente en el
  // expediente NOM-024). El `max` del input es evadible por teclado/pegado,
  // así que se valida aquí también. Espejo de validateFemaleDates +
  // validatePatientFieldRules del servidor.
  const fem = data.informacion_femenina || {};
  const noFutureChecks = [
    [fem.fecha_ultimo_parto, 'La fecha del último parto no puede ser futura'],
    [fem.fecha_ultima_menstruacion, 'La fecha de última menstruación no puede ser futura'],
    [data.encuesta_medica?.informacion_general?.ultimo_examen_medico?.fecha,
      'La fecha del último examen médico no puede ser futura'],
    [data.habitos_higiene?.fecha_ultima_visita_odontologo,
      'La fecha de la última visita al odontólogo no puede ser futura'],
  ];
  for (const [value, label] of noFutureChecks) {
    if (value) {
      const d = parseLocalDate(value);
      if (!Number.isNaN(d.getTime()) && d > new Date()) {
        errors.push({ label });
      }
    }
  }
  const semanas = data.encuesta_medica?.embarazo?.semanas_gestacion;
  if (semanas !== undefined && semanas !== null && semanas !== '') {
    const n = Number(semanas);
    if (!Number.isFinite(n) || n < 0 || n > 45) {
      errors.push({ label: 'Las semanas de gestación deben estar entre 0 y 45' });
    }
  }
  // Filas incompletas: el backend descarta en silencio contactos de emergencia
  // y antecedentes a los que les falta un campo requerido. Avisar para no
  // perder datos sin que el usuario lo note (vería "guardado correctamente").
  if (Array.isArray(data.contactos_emergencia)) {
    data.contactos_emergencia.forEach((c, i) => {
      if (!c) return;
      const vals = [c.nombre, c.parentesco, c.telefono];
      const some = vals.some((v) => v && String(v).trim());
      const all = vals.every((v) => v && String(v).trim());
      if (some && !all) {
        errors.push({ label: `Contacto de emergencia #${i + 1}: completa nombre, parentesco y teléfono (o elimínalo).` });
      }
    });
  }
  if (Array.isArray(data.antecedentes_heredo_familiares)) {
    data.antecedentes_heredo_familiares.forEach((a, i) => {
      if (!a) return;
      const p = a.parentesco && String(a.parentesco).trim();
      const ant = a.antecedentes && String(a.antecedentes).trim();
      const esp = a.parentesco_especifico && String(a.parentesco_especifico).trim();
      if ((p || ant || esp) && (!p || !ant || (p === 'Otros' && !esp))) {
        errors.push({ label: `Antecedente familiar #${i + 1}: completa parentesco y antecedente${p === 'Otros' ? ', y especifica el parentesco' : ''} (o elimínalo).` });
      }
    });
  }
  // Textos que el servidor truncaría en silencio.
  const longPaths = [];
  collectLongStrings(data, '', longPaths);
  for (const p of longPaths) {
    const fieldName = String(p).split('.').pop().replace(/_/g, ' ');
    errors.push({ label: `El texto de "${fieldName}" supera los ${TEXT_MAX_LEN} caracteres; acórtalo para no perder información.` });
  }
  return errors;
};
