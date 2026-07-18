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
const logger = require('../utils/logger');

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
  [/\/api\/inventory/i,                            'inventario'],
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
 * Extraer patientId de params, body, query o (si se pasa) el body de la
 * respuesta. Para sub-rutas de pacientes (/api/patients/:id/...) el id del
 * paciente está en req.params.id.
 *
 * El fallback a `responseBody?.paciente_id` cubre rutas como
 * /api/inventory/consume: el cliente solo manda `cita_id` (nunca el
 * paciente_id directo), así que no hay forma de resolverlo desde el
 * request — el controller lo agrega a su respuesta para que la línea de
 * tiempo de auditoría por paciente (NOM-024) no quede ciega a estos eventos.
 */
function extractPatientId(req, responseBody) {
  return req.params?.patientId
    || req.body?.patientId
    || req.body?.paciente
    || req.query?.patientId
    || (/\/api\/patients\//.test(req.originalUrl) ? req.params?.id : null)
    || responseBody?.paciente_id
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

// Campos técnicos que no cuentan como "editados" (metadatos de transporte).
const NON_EDITABLE_META_FIELDS = new Set([
  '_id', '__v', 'patientId', 'paciente', 'motivo', 'motivoSuperadmin',
  'expectedUpdatedAt', 'patientData',
]);

/**
 * Cuerpo "efectivo" del request para auditoría: las escrituras de paciente
 * viajan como FormData con `patientData` = JSON string (multer). Sin
 * desempaquetarlo, camposEditados era ['patientData'] y el diff después
 * quedaba como un blob de texto — traza NOM-024 inservible para el historial.
 */
function effectiveBody(req) {
  const body = req.body;
  if (!body || typeof body !== 'object') return null;
  if (typeof body.patientData === 'string') {
    try {
      const parsed = JSON.parse(body.patientData);
      if (parsed && typeof parsed === 'object') {
        // motivo/expectedUpdatedAt pueden venir fuera del JSON (campos FormData)
        return { ...parsed, ...body, patientData: undefined };
      }
    } catch (_e) { /* body malformado: se audita como venga */ }
  }
  return body;
}

/**
 * Detectar campos editados a partir del cuerpo efectivo del request.
 */
function detectEditedFields(req) {
  const body = effectiveBody(req);
  if (!body) return undefined;
  const keys = Object.keys(body).filter(k =>
    body[k] !== undefined && !NON_EDITABLE_META_FIELDS.has(k)
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
        const patientId = extractPatientId(req, body);
        const camposEditados = (method === 'PUT' || method === 'PATCH')
          ? detectEditedFields(req)
          : undefined;

        setImmediate(async () => {
          // El snapshot se captura sin bloquear el request (snapshotCapture).
          // Aquí, ya fuera del camino crítico (tras responder), esperamos su
          // promesa para no perder el before-image sin añadir latencia.
          if (req._snapshotPromise) {
            try { await req._snapshotPromise; } catch { /* non-blocking */ }
          }
          // Construir detalles con diff antes/después si hay snapshot
          const detalles = {};
          if (req._snapshotAntes && (method === 'PUT' || method === 'PATCH')) {
            detalles.antes = req._snapshotAntes;
            const bodyEfectivo = effectiveBody(req);
            if (camposEditados && bodyEfectivo) {
              const despues = {};
              for (const campo of camposEditados) {
                if (bodyEfectivo[campo] !== undefined) {
                  despues[campo] = bodyEfectivo[campo];
                }
              }
              if (Object.keys(despues).length > 0) {
                detalles.despues = despues;
              }
            }
          }
          // Detalles adicionales que un controlador quiera anexar a la traza
          // (p.ej. identidadEditadaConHCFirmada en updatePatient).
          if (req._auditDetallesExtra && typeof req._auditDetallesExtra === 'object') {
            Object.assign(detalles, req._auditDetallesExtra);
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
  }).catch((err) => {
    // BE-01 (Crítica): NO silenciar el fallo de auditoría NOM-024. Antes los
    // ~15 call sites hacían `.catch(() => {})` y un fallo transitorio de Mongo
    // (o E11000 de `seq`) dejaba el evento legal sin registrar y sin traza. Al
    // loguear aquí, TODOS los llamadores quedan cubiertos de una sola vez;
    // re-lanzamos para que los que `await` + propagan (signingController) sigan
    // viendo el error, y el `.catch(()=>{})` de los fire-and-forget ya no oculta
    // un fallo — solo evita el unhandledRejection de un error ya registrado.
    logger.error('Fallo al registrar evento de auditoría NOM-024', {
      evento,
      userId: req.user?.id || null,
      error: err?.message || String(err),
    });
    throw err;
  });
};

auditLogger._internal = { extractPatientId, detectResourceType, effectiveBody, detectEditedFields };

module.exports = auditLogger;
