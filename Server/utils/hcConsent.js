/**
 * Reglas del consentimiento de historia clínica.
 *
 * Cuando el paciente firma el consentimiento (NOM-004 §4.5 + LFPDPPP §16),
 * las SECCIONES CLÍNICAS del expediente quedan inmutables hasta que el
 * doctor revoque el consentimiento con motivo justificado.
 *
 * Los DATOS DE IDENTIDAD (nombre, fecha de nacimiento, sexo, documento)
 * son editables SIN revocar, pero exigen `motivo` obligatorio: la
 * corrección de una errata de captura es legítima (NOM-004 exige
 * trazabilidad, no inmutabilidad de un apellido mal tecleado). El diff
 * antes/después + motivo + autor quedan en la cadena de auditoría HMAC
 * (auditLogger + snapshotCapture), que es la garantía de integridad real.
 * La firma del consentimiento conserva su contentHash original: prueba lo
 * que el paciente atestó EN ESE MOMENTO; la corrección posterior queda
 * documentada como evento auditado, no como reescritura silenciosa.
 *
 * Datos administrativos (contacto, email, contactos de emergencia,
 * sociodemográficos, ARCO) SIGUEN siendo editables sin fricción — esos
 * no forman parte de la atestación clínica.
 */

// Datos de identidad del paciente: editables con motivo obligatorio.
const IDENTITY_PATIENT_FIELDS = new Set([
  'primer_nombre',
  'otros_nombres',
  'apellido_paterno',
  'apellido_materno',
  'fecha_nacimiento',
  'sexo',
  'documento',
]);

// Secciones clínicas: congeladas mientras el consentimiento esté activo.
// Para corregirlas hay que revocar el consentimiento (flujo existente).
const CLINICAL_LOCKED_FIELDS = new Set([
  'antecedentes_heredo_familiares',
  'encuesta_medica',
  'informacion_femenina',
  'habitos_higiene',
  'evaluacion_dental_oclusal',
]);

// Compatibilidad: unión histórica (identidad + clínico). Mantener mientras
// exista código que trate ambos grupos como un solo bloqueo.
const LOCKED_PATIENT_FIELDS = new Set([
  ...IDENTITY_PATIENT_FIELDS,
  ...CLINICAL_LOCKED_FIELDS,
]);

/** ¿Hay un consentimiento firmado y NO revocado? */
function isHCConsentActive(patient) {
  const c = patient && patient.consentimientoHC;
  return !!(c && c.firmadoEn && !c.revocadoEn);
}

/** Campos del payload que son secciones clínicas bloqueadas por la firma. */
function findClinicalLockedFieldsInPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload).filter(k => CLINICAL_LOCKED_FIELDS.has(k));
}

/** Campos del payload que son datos de identidad (motivo obligatorio al cambiar). */
function findIdentityFieldsInPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload).filter(k => IDENTITY_PATIENT_FIELDS.has(k));
}

/**
 * @deprecated Usar findClinicalLockedFieldsInPayload / findIdentityFieldsInPayload.
 * Se conserva por compatibilidad con llamadas existentes.
 */
function findLockedFieldsInPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload).filter(k => LOCKED_PATIENT_FIELDS.has(k));
}

module.exports = {
  IDENTITY_PATIENT_FIELDS,
  CLINICAL_LOCKED_FIELDS,
  LOCKED_PATIENT_FIELDS,
  isHCConsentActive,
  findClinicalLockedFieldsInPayload,
  findIdentityFieldsInPayload,
  findLockedFieldsInPayload,
};
