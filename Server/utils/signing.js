/**
 * Utilidades de Firma Electrónica — DentiaCore
 *
 * NOM-024-SSA3-2012 / NOM-004-SSA3-2012 Art. 5.10:
 * Todas las notas deben contener firma (autógrafa, electrónica o digital)
 * de quien las elabora.
 *
 * La firma electrónica en DentiaCore consiste en:
 * 1. Verificación del PIN del usuario (autenticación de doble factor)
 * 2. Cálculo de un hash SHA-256 del contenido clínico al momento de firmar
 * 3. Asociación del hash + userId + timestamp al documento
 *
 * Si el documento se modifica después de la firma, el hash ya no coincide
 * y el campo `firmaDesactualizada` se marca como true.
 */
const { computeIntegrityHash, getSignableFields } = require('./integrity');

// ── Mapa resourceType → modelo Mongoose name ──────────────────
// Sólo se incluyen los modelos que tienen controller/rutas CRUD reales.
// `tratamiento` y `receta` están definidos en /models pero NO tienen
// endpoint para crear/editar el documento — exponer un endpoint de firma
// sobre docs imposibles era superficie muerta. Si en el futuro se
// implementa CRUD para ellos, re-agregar aquí.
const RESOURCE_MODEL_MAP = {
  patient:         'Patient',
  examen:          'Examen',
  periodontograma: 'Periodontogram',
  odontograma:     'Odontograma',
};

/**
 * Calcula el hash del contenido clínico de un documento.
 * Es el mismo que computeIntegrityHash pero semánticamente representa
 * el snapshot al momento de la firma.
 *
 * @param {object} doc - Documento Mongoose
 * @param {string} resourceType - Tipo de recurso
 * @returns {string} SHA-256 hex
 */
function computeContentHash(doc, resourceType) {
  return computeIntegrityHash(doc, resourceType);
}

/**
 * Devuelve el nombre del modelo Mongoose para un resourceType.
 * @param {string} resourceType
 * @returns {string|null}
 */
function getModelName(resourceType) {
  return RESOURCE_MODEL_MAP[resourceType] || null;
}

module.exports = {
  computeContentHash,
  getModelName,
  getSignableFields,
  RESOURCE_MODEL_MAP,
};
