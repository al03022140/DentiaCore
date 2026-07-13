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
const crypto = require('crypto');
const { RESOURCE_MODEL_MAP: ALL_RESOURCE_MODELS } = require('./resourceModelMap');

// ── Mapa resourceType → modelo Mongoose name (firma electrónica) ──
// Subconjunto del mapa canónico (./resourceModelMap): sólo los modelos que
// tienen controller/rutas CRUD reales. `tratamiento`, `receta` y `cita` están
// en el mapa canónico (los usa auditoría) pero NO tienen endpoint para
// crear/editar el documento — exponer un endpoint de firma sobre docs
// imposibles era superficie muerta. Si en el futuro se implementa CRUD para
// ellos, sumarlos a SIGNABLE_RESOURCE_TYPES.
const SIGNABLE_RESOURCE_TYPES = ['patient', 'examen', 'periodontograma', 'odontograma'];
const RESOURCE_MODEL_MAP = Object.fromEntries(
  SIGNABLE_RESOURCE_TYPES.map((key) => [key, ALL_RESOURCE_MODELS[key]])
);

/**
 * Hash determinístico del contenido clínico de una nota de evolución (subdoc
 * de Patient). Se usa como snapshot al firmar (paciente y doctor) para
 * detectar modificaciones posteriores (NOM-024 / NOM-004 Art. 5.10).
 *
 * Vive aquí (y no en un controller) para que TODOS los caminos de firma de
 * notas — addEvolutionNote, signExistingEvolutionNote, draftController.signDraft
 * y batchSign — calculen el mismo hash. Antes draftController firmaba notas
 * sin recomputar el hash, dejando notas OFICIAL con contentHash=null.
 *
 * @param {object} note - Subdocumento de nota (Mongoose o plano)
 * @returns {string} SHA-256 hex
 */
function computeEvolutionNoteHash(note) {
  const payload = JSON.stringify({
    procedimiento: note.procedimiento || '',
    observaciones: note.observaciones || '',
    correcciones: note.correcciones || '',
    fecha: note.fecha instanceof Date ? note.fecha.toISOString() : String(note.fecha || ''),
    numero_procedimiento: note.numero_procedimiento ?? null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
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
  computeEvolutionNoteHash,
  getModelName,
};
