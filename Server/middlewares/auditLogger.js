/**
 * Middleware de Auditoría Automática — DentiaCore
 *
 * Se coloca DESPUÉS de authenticate en el pipeline.
 * Intercepta las respuestas exitosas de escrituras (POST, PUT, PATCH, DELETE)
 * y genera AuditLog automáticamente.
 *
 * Para eventos especiales (firma lote, captura extemporánea, etc.) los
 * controladores escriben directamente al modelo AuditLog.
 *
 * Ver roles.MD §5.
 */
const AuditLog = require('../models/auditLog');

// ── Mapa de método HTTP → evento de auditoría ──────────────────
const METHOD_EVENT_MAP = {
  POST:   'creacion_registro',
  PUT:    'modificacion_registro',
  PATCH:  'modificacion_registro',
  DELETE: 'soft_delete',
};

// ── Patrones de ruta → resourceType (orden: más específico primero) ─
// Se usan regex para detectar correctamente sub-rutas de pacientes.
const ROUTE_RESOURCE_PATTERNS = [
  [/\/api\/patients\/[^/]+\/odontograma/i,       'odontograma'],
  [/\/api\/patients\/[^/]+\/periodontogram/i,     'periodontograma'],
  [/\/api\/patients\/[^/]+\/treatment-plan/i,     'plan_tratamiento'],
  [/\/api\/patients\/[^/]+\/evolution-note/i,     'nota_evolucion'],
  [/\/api\/patients/i,                             'patient'],
  [/\/api\/periodontograms/i,                      'periodontograma'],
  [/\/api\/exams/i,                                'examen'],
  [/\/api\/appointments/i,                         'cita'],
  [/\/api\/cash/i,                                 'caja'],
  [/\/api\/users/i,                                'usuario'],
  [/\/api\/drafts/i,                               'session'],
  [/\/api\/patient-charges/i,                      'cargo'],
  [/\/api\/note-templates/i,                       'plantilla'],
  [/\/api\/settings/i,                             'configuracion'],
];

/**
 * Detectar resourceType a partir de la URL (usando patrones ordenados).
 */
function detectResourceType(url) {
  for (const [pattern, type] of ROUTE_RESOURCE_PATTERNS) {
    if (pattern.test(url)) return type;
  }
  return null;
}

/**
 * Extraer patientId de params, body o query.
 * Para sub-rutas de pacientes (/api/patients/:id/...) el id del paciente
 * está en req.params.id.
 */
function extractPatientId(req) {
  return req.params?.patientId
    || req.body?.patientId
    || req.body?.paciente
    || req.query?.patientId
    || (/\/api\/patients\//.test(req.originalUrl) ? req.params?.id : null)
    || null;
}

/**
 * Extraer resourceId de la respuesta o de params.
 */
function extractResourceId(req, responseBody) {
  // Primero buscar en params
  const paramId = req.params?.id || req.params?.examId || req.params?.odontogramaId;
  if (paramId) return paramId;

  // Luego en la respuesta del controller
  if (responseBody) {
    if (responseBody._id) return responseBody._id;
    if (responseBody.data?._id) return responseBody.data._id;
  }
  return null;
}

/**
 * Detectar campos editados comparando body vs operación
 */
function detectEditedFields(req) {
  if (!req.body || typeof req.body !== 'object') return undefined;
  const keys = Object.keys(req.body).filter(k =>
    !['_id', '__v', 'patientId', 'paciente'].includes(k)
  );
  return keys.length > 0 ? keys : undefined;
}

/**
 * Crea el middleware de auditoría.
 *
 * @param {object} [opciones]
 * @param {boolean} [opciones.logReads=false]  — Si true, también registra GETs
 *                                               (usar sólo en rutas clínicas sensibles)
 * @returns {Function} middleware Express
 */
function auditLogger(opciones = {}) {
  const { logReads = false } = opciones;

  return (req, res, next) => {
    // Solo auditar si hay usuario autenticado
    if (!req.user) return next();

    const method = req.method.toUpperCase();

    // Saltar GETs a menos que logReads esté activo
    if (method === 'GET' && !logReads) return next();

    // Para GETs clínicos, logueamos acceso_expediente
    if (method === 'GET' && logReads) {
      const resourceType = detectResourceType(req.originalUrl);
      const patientId = extractPatientId(req);

      // Fire-and-forget para no bloquear la respuesta
      setImmediate(() => {
        AuditLog.registrar({
          userId:       req.user.id,
          userName:     req.user.nombre || null,
          userRole:     req.user.role,
          evento:       'acceso_expediente',
          resourceType,
          patientId,
          ip:           req.ip || req.connection?.remoteAddress,
        }).catch(err => console.error('[AuditLogger] Error al registrar acceso:', err.message));
      });

      return next();
    }

    // ── Escrituras: interceptar la respuesta ────────────────────
    const originalJson = res.json.bind(res);

    res.json = function(body) {
      // Registrar solo si la respuesta es exitosa (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const evento = METHOD_EVENT_MAP[method] || 'modificacion_registro';
        const resourceType = detectResourceType(req.originalUrl);
        const resourceId = extractResourceId(req, body);
        const patientId = extractPatientId(req);
        const camposEditados = (method === 'PUT' || method === 'PATCH')
          ? detectEditedFields(req)
          : undefined;

        setImmediate(() => {
          // Construir detalles con diff antes/después si hay snapshot
          const detalles = {};
          if (req._snapshotAntes && (method === 'PUT' || method === 'PATCH')) {
            detalles.antes = req._snapshotAntes;
            if (camposEditados && req.body) {
              const despues = {};
              for (const campo of camposEditados) {
                if (req.body[campo] !== undefined) {
                  despues[campo] = req.body[campo];
                }
              }
              if (Object.keys(despues).length > 0) {
                detalles.despues = despues;
              }
            }
          }

          AuditLog.registrar({
            userId:       req.user.id,
            userName:     req.user.nombre || null,
            userRole:     req.user.role,
            evento,
            resourceType,
            resourceId,
            patientId,
            camposEditados,
            detalles:     Object.keys(detalles).length > 0 ? detalles : undefined,
            motivo:       req.body?.motivo || req.body?.motivoSuperadmin || null,
            ip:           req.ip || req.connection?.remoteAddress,
          }).catch(err => console.error('[AuditLogger] Error al registrar:', err.message));
        });
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Versión que registra lecturas de expedientes clínicos.
 * Usar sólo en rutas clínicamente sensibles (NOM-024 §5.1.3).
 */
auditLogger.conLecturas = auditLogger({ logReads: true });

/**
 * Registrar evento manualmente desde un controlador.
 * Útil para eventos especiales (firma lote, PIN, captura extemporánea).
 *
 * @param {import('express').Request} req - Request con req.user
 * @param {string} evento - Tipo de evento
 * @param {object} datos - Datos adicionales
 * @returns {Promise<AuditLog>}
 */
auditLogger.registrarManual = function(req, evento, datos = {}) {
  return AuditLog.registrar({
    userId:   req.user?.id,
    userName: req.user?.nombre || null,
    userRole: req.user?.role,
    evento,
    ip:       req.ip || req.connection?.remoteAddress,
    ...datos,
  });
};

module.exports = auditLogger;
