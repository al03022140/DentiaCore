/**
 * Modelo de Log de Auditoría — DentiaCore
 *
 * NOM-024-SSA3-2012: Todo SIRES debe mantener un registro de auditoría
 * inalterable que cubra todas las operaciones sobre registros clínicos.
 *
 * Retención mínima: 5 años (NOM-004 Art. 5.4).
 *
 * Ver roles.MD §5 para la lista completa de eventos.
 */
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // ── Quién ─────────────────────────────────────────────────────
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    index: true
  },
  userName: {
    type: String,
    default: null
  },
  userRole: {
    type: String,
    default: null
  },

  // ── Qué ───────────────────────────────────────────────────────
  evento: {
    type: String,
    required: true,
    index: true,
    enum: [
      // Autenticación
      'login_exitoso',
      'login_fallido',
      'logout',

      // Expediente
      'acceso_expediente',
      'creacion_registro',
      'modificacion_registro',
      'addendum',

      // Borradores (delegación controlada)
      'borrador_creado',
      'borrador_aprobado',
      'borrador_rechazado',
      'firma_lote',

      // Documentos
      'exportacion',
      'impresion',
      'soft_delete',

      // Usuarios
      'cambio_contraseña',
      'cambio_pin',
      'creacion_usuario',
      'modificacion_usuario',
      'desactivacion_usuario',

      // Modo Cortina (roles.MD §9.3)
      'pantalla_bloqueada',
      'pantalla_desbloqueada',
      'pin_fallo',

      // Plantillas (roles.MD §9.2)
      'plantilla_usada',

      // Captura extemporánea (roles.MD §9.5)
      'captura_extemporanea',

      // Superadmin
      'operacion_superadmin',
    ]
  },

  // ── Sobre qué ─────────────────────────────────────────────────
  resourceType: {
    type: String,
    default: null,
    enum: [
      null,
      'patient',
      'odontograma',
      'periodontograma',
      'consulta',
      'examen',
      'receta',
      'tratamiento',
      'cita',
      'caja',
      'usuario',
      'plantilla',
      'session',
    ]
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    default: null,
    index: true
  },

  // ── Datos adicionales ─────────────────────────────────────────
  detalles: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Campos específicos comunes
  motivo: { type: String, default: null },
  camposEditados: { type: [String], default: undefined },
  ip: { type: String, default: null },

  // Firma en lote (roles.MD §9.4)
  registrosAprobados: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
  totalRegistros: { type: Number, default: undefined },

  // Plantilla (roles.MD §9.2)
  templateId: { type: mongoose.Schema.Types.ObjectId, default: null },
  templateNombre: { type: String, default: null },

  // Captura extemporánea (roles.MD §9.5)
  fechaNota: { type: Date, default: null },
  fechaServidor: { type: Date, default: null },

  // Modo Cortina (roles.MD §9.3)
  trigger: {
    type: String,
    enum: [null, 'auto', 'manual'],
    default: null
  },

  // Actor secundario (delegación controlada)
  assistantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  // ── Cuándo ────────────────────────────────────────────────────
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  }
}, {
  timestamps: false,    // Usamos nuestro propio timestamp
  collection: 'audit_logs',
  // Los logs de auditoría son INALTERABLES (NOM-024)
  strict: true,
});

// Índices para consultas de auditoría comunes
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ evento: 1, timestamp: -1 });
auditLogSchema.index({ patientId: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });

// TTL index: retención mínima 5 años (1825 días).
// En producción, esto se configura en MongoDB directamente para mayor control.
// auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 157680000 }); // 5 años

/**
 * Registrar un evento de auditoría.
 * @param {object} data - Datos del evento
 * @returns {Promise<AuditLog>}
 */
auditLogSchema.statics.registrar = function(data) {
  return this.create({
    ...data,
    timestamp: data.timestamp || new Date()
  });
};

/**
 * Buscar logs por usuario.
 */
auditLogSchema.statics.porUsuario = function(userId, opciones = {}) {
  const { limit = 50, skip = 0, desde, hasta } = opciones;
  const query = { userId };
  if (desde || hasta) {
    query.timestamp = {};
    if (desde) query.timestamp.$gte = new Date(desde);
    if (hasta) query.timestamp.$lte = new Date(hasta);
  }
  return this.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit);
};

/**
 * Buscar logs por paciente.
 */
auditLogSchema.statics.porPaciente = function(patientId, opciones = {}) {
  const { limit = 50, skip = 0 } = opciones;
  return this.find({ patientId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
