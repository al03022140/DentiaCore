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

/**
 * Veredicto de integridad de una nota de evolución a partir de los resultados
 * de comprobación ya calculados (contenido + firmas). Función PURA (sin I/O)
 * para poder testearla aislada.
 *
 * Reglas (NOM-004 Art. 5.10 / NOM-024):
 *  - Cualquier comprobación que dé `false` (hash que no coincide) ⇒ manipulación.
 *  - Una nota OFICIAL DEBE tener, además: contentHash de referencia que coincida
 *    (contenidoOk === true) y firma del doctor presente e íntegra
 *    (firmaDoctorOk === true). Antes, si esas piezas faltaban se reportaban como
 *    "no aplica" (null) y NO afectaban `integro`: una nota OFICIAL sin
 *    contentHash o sin firma del doctor reportaba `integro: true` falsamente.
 *  - La firma del PACIENTE es informativa: el flujo interactivo la captura, pero
 *    la firma en lote (Centro de Firmas) firma sólo con el doctor. Sólo penaliza
 *    si está presente y alterada (ok === false).
 *  - Una nota en BORRADOR no tiene firma de referencia ⇒ evaluación laxa (sólo
 *    falla ante un `false` explícito).
 *
 * @param {object} p
 * @param {string} p.estadoRegistro
 * @param {boolean|null} p.contenidoOk
 * @param {boolean|null} p.firmaPacienteOk
 * @param {boolean|null} p.firmaDoctorOk
 * @returns {{ integro: boolean, motivos: string[] }}
 */
function evaluateNoteIntegrity({ estadoRegistro, contenidoOk, firmaPacienteOk, firmaDoctorOk }) {
  const motivos = [];
  const esOficial = estadoRegistro === 'OFICIAL';

  // Contenido clínico vs hash firmado.
  if (contenidoOk === false) motivos.push('contenido_alterado');
  else if (esOficial && contenidoOk !== true) motivos.push('oficial_sin_hash_contenido');

  // Firma del doctor (obligatoria en OFICIAL).
  if (firmaDoctorOk === false) motivos.push('firma_doctor_alterada');
  else if (esOficial && firmaDoctorOk !== true) motivos.push('oficial_sin_firma_doctor');

  // Firma del paciente: sólo penaliza si está presente y alterada.
  if (firmaPacienteOk === false) motivos.push('firma_paciente_alterada');

  return { integro: motivos.length === 0, motivos };
}

module.exports = {
  computeContentHash,
  computeEvolutionNoteHash,
  evaluateNoteIntegrity,
  getModelName,
  getSignableFields,
  RESOURCE_MODEL_MAP,
};
