/**
 * Reglas del consentimiento de historia clínica.
 *
 * Cuando el paciente firma el consentimiento (NOM-004 §4.5 + LFPDPPP §16),
 * los campos del expediente quedan inmutables hasta que el doctor revoque
 * el consentimiento con motivo justificado.
 *
 * Datos administrativos (contacto, email, contactos de emergencia,
 * sociodemográficos, ARCO) SIGUEN siendo editables — esos no forman parte
 * de la atestación clínica.
 */

// Campos que quedan congelados cuando hay consentimiento activo.
// Incluye: secciones clínicas + datos de identidad del paciente firmado.
const LOCKED_PATIENT_FIELDS = new Set([
  // Identidad firmada
  'primer_nombre',
  'otros_nombres',
  'apellido_paterno',
  'apellido_materno',
  'fecha_nacimiento',
  'sexo',
  'documento',
  // Secciones clínicas
  'antecedentes_heredo_familiares',
  'encuesta_medica',
  'informacion_femenina',
  'habitos_higiene',
  'evaluacion_dental_oclusal',
]);

/** ¿Hay un consentimiento firmado y NO revocado? */
function isHCConsentActive(patient) {
  const c = patient && patient.consentimientoHC;
  return !!(c && c.firmadoEn && !c.revocadoEn);
}

/** Devuelve los campos del payload que están protegidos. */
function findLockedFieldsInPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload).filter(k => LOCKED_PATIENT_FIELDS.has(k));
}

module.exports = {
  LOCKED_PATIENT_FIELDS,
  isHCConsentActive,
  findLockedFieldsInPayload,
};
