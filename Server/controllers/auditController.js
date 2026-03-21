/**
 * Controlador de Trazabilidad / Auditoría — DentiaCore
 *
 * Endpoint de solo lectura para consultar el registro de auditoría.
 * Accesible únicamente por administrador y superadmin (audit.read.full / wildcard).
 *
 * Soporta búsqueda por usuario, por fecha (día) y por paciente,
 * con descripciones legibles en español.
 */
const AuditLog = require('../models/auditLog');
const Patient = require('../models/patient');
const Usuario = require('../models/users');
const mongoose = require('mongoose');
const { computeIntegrityHash, computeEntryHash } = require('../utils/integrity');

// ── Etiquetas legibles por evento ───────────────────────────────
const EVENTO_LABELS = {
  login_exitoso:          'Inició sesión',
  login_fallido:          'Intento de inicio de sesión fallido',
  logout:                 'Cerró sesión',
  acceso_expediente:      'Accedió al expediente',
  creacion_registro:      'Creó registro',
  modificacion_registro:  'Modificó registro',
  addendum:               'Agregó addendum',
  borrador_creado:        'Creó borrador',
  borrador_aprobado:      'Firmó borrador',
  borrador_rechazado:     'Rechazó borrador',
  firma_lote:             'Firmó registros en lote',
  exportacion:            'Exportó documento',
  impresion:              'Imprimió documento',
  soft_delete:            'Eliminó registro',
  cambio_contraseña:      'Cambió su contraseña',
  cambio_pin:             'Cambió su PIN',
  creacion_usuario:       'Creó un usuario',
  modificacion_usuario:   'Modificó un usuario',
  desactivacion_usuario:  'Desactivó un usuario',
  pantalla_bloqueada:     'Bloqueó la pantalla',
  pantalla_desbloqueada:  'Desbloqueó la pantalla',
  pin_fallo:              'Falló verificación de PIN',
  plantilla_usada:        'Usó plantilla de nota',
  captura_extemporanea:   'Realizó captura extemporánea',
  firma_electronica:      'Firmó electrónicamente',
  operacion_superadmin:   'Ejecutó operación de superadmin',
};

// ── Etiquetas legibles por resourceType ─────────────────────────
const RESOURCE_LABELS = {
  patient:          'paciente',
  odontograma:      'odontograma',
  periodontograma:  'periodontograma',
  consulta:         'consulta',
  examen:           'examen',
  receta:           'receta',
  tratamiento:      'tratamiento',
  plan_tratamiento: 'plan de tratamiento',
  nota_evolucion:   'nota de evolución',
  cita:             'cita',
  caja:             'movimiento de caja',
  cargo:            'cargo de tratamiento',
  usuario:          'usuario',
  plantilla:        'plantilla',
  configuracion:    'configuración del sistema',
  session:          'sesión',
};

/**
 * Construir una descripción legible a partir de un log de auditoría.
 */
function buildDescripcion(log) {
  const base = EVENTO_LABELS[log.evento] || log.evento;
  const recurso = log.resourceType ? RESOURCE_LABELS[log.resourceType] || log.resourceType : null;

  let desc = base;

  // Agregar tipo de recurso cuando es relevante
  if (recurso && !['login_exitoso', 'login_fallido', 'logout', 'cambio_contraseña', 'cambio_pin',
    'pantalla_bloqueada', 'pantalla_desbloqueada', 'pin_fallo'].includes(log.evento)) {
    desc += ` de ${recurso}`;
  }

  // Agregar nombre del paciente si se pobló
  if (log.patientId && typeof log.patientId === 'object' && log.patientId.primer_nombre) {
    const p = log.patientId;
    const nombrePaciente = [p.primer_nombre, p.apellido_paterno].filter(Boolean).join(' ');
    desc += ` del paciente ${nombrePaciente}`;
  }

  // Agregar campos editados si existen
  if (log.camposEditados && log.camposEditados.length > 0) {
    desc += ` (campos: ${log.camposEditados.join(', ')})`;
  }

  // Firma en lote: detalles
  if (log.evento === 'firma_lote' && log.totalRegistros) {
    const aprobados = log.registrosAprobados ? log.registrosAprobados.length : 0;
    desc += ` — ${aprobados}/${log.totalRegistros} aprobados`;
  }

  // Plantilla usada
  if (log.evento === 'plantilla_usada' && log.templateNombre) {
    desc += `: "${log.templateNombre}"`;
  }

  // Captura extemporánea: motivo
  if (log.evento === 'captura_extemporanea' && log.motivo) {
    desc += ` — motivo: ${log.motivo}`;
  }

  // Modo Cortina: trigger
  if ((log.evento === 'pantalla_bloqueada') && log.trigger) {
    desc += ` (${log.trigger === 'auto' ? 'automático' : 'manual'})`;
  }

  return desc;
}

/**
 * GET /api/audit
 *
 * Query params:
 *   userId     — filtrar por usuario específico
 *   patientId  — filtrar por paciente específico
 *   date       — filtrar por día específico (YYYY-MM-DD)
 *   desde      — fecha inicio (ISO / YYYY-MM-DD)
 *   hasta      — fecha fin (ISO / YYYY-MM-DD)
 *   evento     — filtrar por tipo de evento
 *   page       — página (default 1)
 *   limit      — registros por página (default 100, max 500)
 */
const getLogs = async (req, res, next) => {
  try {
    const {
      userId,
      patientId,
      date,
      desde,
      hasta,
      evento,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};

    // Filtro por usuario
    if (userId) {
      filter.userId = userId;
    }

    // Filtro por paciente
    if (patientId) {
      filter.patientId = patientId;
    }

    // Filtro por evento
    if (evento) {
      filter.evento = evento;
    }

    // Filtro por fecha (día específico o rango)
    if (date) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      filter.timestamp = { $gte: dayStart, $lte: dayEnd };
    } else if (desde || hasta) {
      filter.timestamp = {};
      if (desde) filter.timestamp.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = h;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('patientId', 'primer_nombre apellido_paterno paciente_id')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Enriquecer cada log con descripción legible
    const enriched = logs.map((log) => {
      const patientData = log.patientId && typeof log.patientId === 'object'
        ? {
            _id: log.patientId._id,
            nombre: [log.patientId.primer_nombre, log.patientId.apellido_paterno].filter(Boolean).join(' '),
            paciente_id: log.patientId.paciente_id,
          }
        : null;

      return {
        _id: log._id,
        userId: log.userId,
        userName: log.userName || 'Sistema',
        userRole: log.userRole,
        evento: log.evento,
        resourceType: log.resourceType,
        descripcion: buildDescripcion(log),
        paciente: patientData,
        timestamp: log.timestamp,
        ip: log.ip,
      };
    });

    return res.json({
      logs: enriched,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit/users
 * Devuelve lista simplificada de usuarios para el selector del filtro.
 */
const getUsers = async (req, res, next) => {
  try {
    const users = await Usuario.find({ active: { $ne: false } })
      .select('nombre email rol')
      .sort({ nombre: 1 })
      .lean();
    return res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit/patients
 * Búsqueda de pacientes por nombre para el filtro.
 * Query: ?q=texto
 */
const searchPatients = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const patients = await Patient.find({
      $or: [
        { primer_nombre: regex },
        { apellido_paterno: regex },
        { paciente_id: regex },
      ],
    })
      .select('primer_nombre apellido_paterno paciente_id')
      .limit(20)
      .lean();

    const result = patients.map((p) => ({
      _id: p._id,
      nombre: [p.primer_nombre, p.apellido_paterno].filter(Boolean).join(' '),
      paciente_id: p.paciente_id,
    }));

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

// ── Mapa resourceType → modelo Mongoose ─────────────────────────
const RESOURCE_MODEL_MAP = {
  patient:         'Patient',
  examen:          'Examen',
  receta:          'Receta',
  tratamiento:     'Tratamiento',
  periodontograma: 'Periodontogram',
  odontograma:     'Odontograma',
  cita:            'Appointment',
};

/**
 * GET /api/audit/verify/:resourceType/:resourceId
 *
 * Recalcula el hash de integridad del documento actual y lo compara
 * contra el integrityHash almacenado. Detecta alteraciones.
 */
const verifyIntegrity = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({ error: 'resourceId inválido' });
    }

    const modelName = RESOURCE_MODEL_MAP[resourceType];
    if (!modelName) {
      return res.status(400).json({ error: `resourceType "${resourceType}" no soportado` });
    }

    const Model = mongoose.models[modelName];
    if (!Model) {
      return res.status(500).json({ error: `Modelo ${modelName} no encontrado` });
    }

    const doc = await Model.findById(resourceId);
    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const storedHash = doc.integrityHash || doc.contentHash || null;
    const computedHash = computeIntegrityHash(doc, resourceType);

    return res.json({
      ok: storedHash === computedHash,
      computed: computedHash,
      stored: storedHash,
      lastModified: doc.modificadoEn || doc.updatedAt || null,
      modificadoPor: doc.modificadoPor || null,
      firmadoPor: doc.firmadoPor || null,
      firmadoEn: doc.firmadoEn || null,
      firmaDesactualizada: doc.firmaDesactualizada || false,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit/timeline/:patientId
 *
 * Devuelve todos los eventos de auditoría de un paciente,
 * incluyendo sus sub-recursos, ordenados cronológicamente.
 *
 * Query: page, limit
 */
const getTimeline = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: 'patientId inválido' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = { patientId };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const enriched = logs.map((log) => ({
      _id: log._id,
      userId: log.userId,
      userName: log.userName || 'Sistema',
      userRole: log.userRole,
      evento: log.evento,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      descripcion: buildDescripcion(log),
      timestamp: log.timestamp,
      camposEditados: log.camposEditados || [],
      detalles: log.detalles || {},
      ip: log.ip,
    }));

    return res.json({
      timeline: enriched,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLogs, getUsers, searchPatients, verifyIntegrity, getTimeline };
