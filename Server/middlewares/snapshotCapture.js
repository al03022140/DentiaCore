/**
 * Middleware de Captura de Snapshot — DentiaCore
 *
 * Para operaciones PUT/PATCH, captura el estado del documento ANTES de la
 * modificación y lo almacena en req._snapshotAntes.
 *
 * El auditLogger puede entonces incluir el antes/después en detalles.
 *
 * No bloqueante: si falla la captura, el request sigue normalmente.
 */
const mongoose = require('mongoose');
const { SNAPSHOT_EXCLUDE_PROJECTION } = require('../utils/redact');

// ── Mapa de patrón de ruta → modelo Mongoose ────────────────────
const ROUTE_MODEL_MAP = [
  [/\/api\/patients\/([a-f\d]{24})\/evolution-note(?:\/([a-f\d]{24}))?/i, { modelName: 'Patient', paramIndex: 1, subField: 'notas_evolucion', subIdIndex: 2 }],
  [/\/api\/patients\/([a-f\d]{24})\/odontograma/i,      { modelName: 'Odontograma', lookup: 'patientId' }],
  [/\/api\/patients\/([a-f\d]{24})\/periodontogram/i,   { modelName: 'Periodontogram', lookup: 'patient' }],
  [/\/api\/patients\/([a-f\d]{24})\/treatment-plan/i,   { modelName: 'Patient', paramIndex: 1, subField: 'consultas' }],
  [/\/api\/patients\/([a-f\d]{24})/i,                    { modelName: 'Patient', paramIndex: 1 }],
  [/\/api\/periodontograms\/([a-f\d]{24})/i,             { modelName: 'Periodontogram', paramIndex: 1 }],
  [/\/api\/exams\/([a-f\d]{24})/i,                       { modelName: 'Examen', paramIndex: 1 }],
  [/\/api\/appointments\/([a-f\d]{24})/i,                { modelName: 'Appointment', paramIndex: 1 }],
  [/\/api\/users\/([a-f\d]{24})/i,                       { modelName: 'Usuario', paramIndex: 1 }],
  [/\/api\/patient-charges\/([a-f\d]{24})/i,             { modelName: 'PatientCharge', paramIndex: 1 }],
  [/\/api\/note-templates\/([a-f\d]{24})/i,              { modelName: 'NoteTemplate', paramIndex: 1 }],
];

/**
 * Resuelve el modelo y el docId a partir de la URL.
 * @param {string} url
 * @returns {{ model: Model, docId: string, subField?: string } | null}
 */
function resolveModelAndId(url) {
  for (const [pattern, config] of ROUTE_MODEL_MAP) {
    const match = url.match(pattern);
    if (match) {
      const Model = mongoose.models[config.modelName];
      if (!Model) continue;

      const docId = config.paramIndex ? match[config.paramIndex] : null;
      // ID del subdocumento (p. ej. la nota concreta en
      // /evolution-note/:noteId) para acotar el snapshot a ese elemento.
      const subId = config.subIdIndex ? (match[config.subIdIndex] || null) : null;

      if (config.lookup) {
        // Para sub-recursos buscados por campo (ej. patientId)
        return { model: Model, lookupField: config.lookup, lookupValue: match[1], subField: config.subField, subId };
      }

      return { model: Model, docId, subField: config.subField, subId };
    }
  }
  return null;
}

/**
 * Middleware que captura snapshot del documento antes de un PUT/PATCH.
 */
function snapshotCapture(req, res, next) {
  const method = req.method.toUpperCase();

  // Solo capturar para operaciones de modificación
  if (method !== 'PUT' && method !== 'PATCH') return next();

  const resolved = resolveModelAndId(req.originalUrl);
  if (!resolved) return next();

  const { model, docId, lookupField, lookupValue, subField, subId } = resolved;

  const capturePromise = (async () => {
    try {
      let doc;
      if (docId) {
        // Si es un sub-campo, proyectamos SOLO ese campo (no traemos todo el
        // documento del paciente). Reduce carga y evita arrastrar datos ajenos.
        // Documento completo: excluir secretos (contraseña/pin/tokens de
        // Usuario) — que nunca lleguen al snapshot ni al audit log.
        doc = await model
          .findById(docId, subField ? { [subField]: 1 } : SNAPSHOT_EXCLUDE_PROJECTION)
          .lean()
          .maxTimeMS(3000);
      } else if (lookupField && lookupValue) {
        doc = await model.findOne({ [lookupField]: lookupValue }).lean().maxTimeMS(3000);
      }

      if (doc) {
        if (subField && doc[subField]) {
          let value = doc[subField];
          // Acotar el snapshot al subdocumento concreto que se edita (por _id).
          // Antes se guardaba el array COMPLETO de notas en el audit log →
          // se filtraba en cada edición el contenido clínico de TODAS las notas
          // del paciente (PII innecesaria, LFPDPPP Art. 6 + logs enormes).
          if (subId && Array.isArray(value)) {
            const one = value.find(el => String(el?._id) === String(subId));
            value = one ? [one] : [];
          }
          req._snapshotAntes = { [subField]: value };
          req._snapshotResourceType = subField;
        } else {
          // Excluir campos internos enormes del snapshot
          const { __v, ...snapshot } = doc;
          req._snapshotAntes = snapshot;
        }
      }
    } catch (err) {
      // Silencioso: la auditoría no debe bloquear operaciones
      console.warn('[SnapshotCapture] Error (non-blocking):', err.message);
    }
  })();

  // No bloqueamos el request esperando el snapshot (antes añadía hasta 3 s de
  // latencia por escritura). Guardamos la promesa para que el auditLogger la
  // espere FUERA del camino crítico (en su setImmediate, tras responder), sin
  // perder el before-image.
  req._snapshotPromise = capturePromise;
  return next();
}

module.exports = snapshotCapture;
