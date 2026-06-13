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
const { computeEntryHash } = require('../utils/integrity');

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
      // Eventos granulares emitidos por los controladores. Antes faltaban en
      // este enum, así que las escrituras de auditoría rechazaban en silencio
      // (traza NOM-024 incompleta) y, sin .catch, podían tumbar el proceso.
      'nota_evolucion_creada',
      'nota_evolucion_editada',
      'plan_tratamiento_creado',

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

      // Firma electrónica (NOM-024 autenticidad)
      'firma_electronica',

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
      'plan_tratamiento',
      'nota_evolucion',
      'cita',
      'caja',
      'cargo',
      'usuario',
      'plantilla',
      'configuracion',
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

  // HMAC-SHA256 de los campos críticos del entry (tamper detection)
  entryHash: {
    type: String,
    default: null
  },

  // ── Encadenamiento (tamper-evidence anti-borrado) ─────────────
  // Secuencia monotónica + hash del eslabón anterior. Borrar o truncar
  // entradas rompe la cadena y lo detecta verifyAuditChain. `seq` único
  // (sparse: los logs legacy sin seq se ignoran hasta re-sellarlos).
  seq: {
    type: Number,
    default: null
  },
  prevHash: {
    type: String,
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
// Secuencia de la cadena: único para serializar inserciones (un E11000 fuerza
// reintento en `registrar`) y para recorrer la bitácora en orden.
auditLogSchema.index({ seq: 1 }, { unique: true, sparse: true });

// NOTA: NO usamos un índice TTL. NOM-004 Art. 5.4 exige conservar el expediente
// (y su auditoría) un MÍNIMO de 5 años — no borrarlo AL cumplir 5 años. Un TTL
// purgaría la bitácora automáticamente y sin rastro (rompiendo además la
// cadena). La depuración, si alguna vez aplica, debe ser una decisión
// administrativa explícita y auditada, no un borrado silencioso del motor.

/**
 * Registrar un evento de auditoría.
 * @param {object} data - Datos del evento
 * @returns {Promise<AuditLog>}
 */
auditLogSchema.statics.registrar = async function(data) {
  const timestamp = data.timestamp || new Date();
  // Reintentos: bajo escritura concurrente dos entradas podrían leer el mismo
  // "último" eslabón; el índice único en `seq` hace fallar a la segunda
  // (E11000) y reintentamos con el nuevo último. Serializa la cadena sin huecos.
  const MAX_RETRIES = 5;
  let lastErr = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const last = await this.findOne({ seq: { $ne: null } })
      .sort({ seq: -1 })
      .select('seq entryHash')
      .lean();
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.entryHash ?? null;
    const entryData = { ...data, timestamp, seq, prevHash };

    let entryHash = null;
    try {
      entryHash = computeEntryHash(entryData);
    } catch (err) {
      console.error('[AuditLog] Error computing entryHash:', err.message);
    }

    try {
      return await this.create({ ...entryData, entryHash });
    } catch (err) {
      if (err && err.code === 11000 && attempt < MAX_RETRIES - 1) {
        lastErr = err;
        continue; // colisión de seq → releer el último y reintentar
      }
      throw err;
    }
  }
  throw lastErr || new Error('No se pudo registrar el audit log tras reintentos');
};

/**
 * Verifica la integridad de la cadena de auditoría:
 *  - cada `entryHash` recomputa correctamente (no se editó ningún campo), y
 *  - `prevHash` de cada eslabón coincide con el `entryHash` del anterior
 *    (no se borraron ni reordenaron entradas).
 * Recorre solo las entradas selladas (seq != null). Devuelve un reporte.
 * @param {object} [opts]
 * @param {number} [opts.limit] - máximo de entradas a verificar (más recientes)
 * @returns {Promise<{ok:boolean, checked:number, breaks:Array}>}
 */
auditLogSchema.statics.verifyChain = async function(opts = {}) {
  const { limit = 0 } = opts;
  let query = this.find({ seq: { $ne: null } }).sort({ seq: 1 });
  if (limit > 0) query = query.limit(limit);
  const entries = await query.lean();

  const breaks = [];
  let prevHash = null;
  let prevSeq = null;

  for (const e of entries) {
    // 1) ¿el entryHash recomputa? (detecta edición de cualquier campo sellado)
    const recomputed = computeEntryHash(e);
    if (recomputed !== e.entryHash) {
      breaks.push({ seq: e.seq, _id: e._id, type: 'hash_mismatch' });
    }
    // 2) ¿encadena con el anterior? (detecta borrado/reordenamiento)
    if (prevSeq !== null) {
      if (e.seq !== prevSeq + 1) {
        breaks.push({ seq: e.seq, _id: e._id, type: 'seq_gap', expected: prevSeq + 1 });
      }
      if (e.prevHash !== prevHash) {
        breaks.push({ seq: e.seq, _id: e._id, type: 'chain_break' });
      }
    }
    prevHash = e.entryHash;
    prevSeq = e.seq;
  }

  return { ok: breaks.length === 0, checked: entries.length, breaks };
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
