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

// ── Mapa de patrón de ruta → modelo Mongoose ────────────────────
const ROUTE_MODEL_MAP = [
  [/\/api\/patients\/([a-f\d]{24})\/evolution-note/i,   { modelName: 'Patient', paramIndex: 1, subField: 'notas_evolucion' }],
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

      if (config.lookup) {
        // Para sub-recursos buscados por campo (ej. patientId)
        return { model: Model, lookupField: config.lookup, lookupValue: match[1], subField: config.subField };
      }

      return { model: Model, docId, subField: config.subField };
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

  const { model, docId, lookupField, lookupValue, subField } = resolved;

  // Fire-and-forget: no bloquear el request si la captura falla
  const capturePromise = (async () => {
    try {
      let doc;
      if (docId) {
        doc = await model.findById(docId).lean().maxTimeMS(3000);
      } else if (lookupField && lookupValue) {
        doc = await model.findOne({ [lookupField]: lookupValue }).lean().maxTimeMS(3000);
      }

      if (doc) {
        // Si es un sub-campo, extraer solo esa parte
        if (subField && doc[subField]) {
          req._snapshotAntes = { [subField]: doc[subField] };
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

  // Esperamos brevemente pero no bloqueamos indefinidamente
  capturePromise.then(() => next()).catch(() => next());
}

module.exports = snapshotCapture;
