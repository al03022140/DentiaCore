/**
 * Datos de identidad del paciente (política NOM-004/024 de edición por niveles).
 *
 * Espejo cliente de Server/utils/hcConsent.js → IDENTITY_PATIENT_FIELDS.
 * Si cambian de verdad al editar, el backend exige `motivo` obligatorio
 * (422 MOTIVO_REQUERIDO) y el diff antes/después queda en la bitácora.
 * Mantener ambas listas sincronizadas.
 */

export const IDENTITY_FIELDS = [
  'primer_nombre',
  'otros_nombres',
  'apellido_paterno',
  'apellido_materno',
  'fecha_nacimiento',
  'sexo',
  'documento',
];

export const IDENTITY_FIELD_LABELS = {
  primer_nombre: 'Primer nombre',
  otros_nombres: 'Otros nombres',
  apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno',
  fecha_nacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
  documento: 'Documento de identidad',
};

const norm = (v) => (v === undefined || v === null) ? '' : String(v).trim();

/**
 * Compara los campos de identidad del formulario contra el paciente original
 * y devuelve la lista de campos que REALMENTE cambian (el form reenvía todo).
 * Mismo criterio de comparación que el backend (identityValueChanged).
 *
 * @param {object} patientData - datos normalizados del formulario
 * @param {object} original - paciente tal como lo devolvió el backend
 * @returns {string[]} campos de identidad con cambio efectivo
 */
export function detectIdentityChanges(patientData, original) {
  if (!patientData || !original) return [];
  return IDENTITY_FIELDS.filter((field) => {
    const nuevo = patientData[field];
    const actual = original[field];
    if (field === 'fecha_nacimiento') {
      // El form guarda YYYY-MM-DD; el backend devuelve ISO completo.
      const a = norm(actual).slice(0, 10);
      const b = norm(nuevo).slice(0, 10);
      return a !== b;
    }
    if (field === 'documento') {
      const aTipo = norm(actual && actual.tipo);
      const aNum = norm(actual && actual.numero).toUpperCase();
      const bTipo = norm(nuevo && nuevo.tipo);
      const bNum = norm(nuevo && nuevo.numero).toUpperCase();
      return aTipo !== bTipo || aNum !== bNum;
    }
    return norm(actual) !== norm(nuevo);
  });
}
