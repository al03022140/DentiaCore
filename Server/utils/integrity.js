/**
 * Utilidades de Integridad de Datos — DentiaCore
 *
 * NOM-024-SSA3-2012: Los SIRES deben garantizar la integridad de los datos.
 *
 * - computeIntegrityHash:  SHA-256 de campos clínicos canónicos de un documento.
 * - computeEntryHash:      HMAC-SHA256 para proteger entradas de auditoría contra alteración.
 *
 * El hash se calcula sobre una representación JSON canónica (llaves ordenadas,
 * sin campos de auditoría/metadatos) para que sea determinista.
 */
const crypto = require('crypto');

// ── Campos clínicos por tipo de recurso ─────────────────────────
// Solo estos campos participan en el hash de integridad del documento.
const SIGNABLE_FIELDS = {
  patient: [
    'primer_nombre', 'otros_nombres', 'apellido_paterno', 'apellido_materno',
    'fecha_nacimiento', 'sexo', 'tipo_sangre', 'alergias',
    'enfermedades_cronicas', 'medicamentos_actuales',
    'antecedentes_medicos', 'antecedentes_familiares',
    'consultas', 'notas_evolucion',
  ],
  examen: [
    'paciente_id', 'doctor_id', 'tipo_examen', 'estado',
    'fecha_solicitud', 'fecha_resultado', 'observaciones',
  ],
  receta: [
    'paciente_id', 'doctor_id', 'fecha', 'medicamentos', 'estado', 'notas',
  ],
  tratamiento: [
    'paciente_id', 'tratamientos',
  ],
  periodontograma: [
    'patient', 'initial', 'current', 'status',
  ],
  odontograma: [
    'patientId', 'type', 'current',
  ],
  cita: [
    'paciente_id', 'doctor_id', 'fecha_hora', 'duracion_minutos',
    'estado', 'motivo', 'items', 'totalEstimado', 'comentarioProcedimiento',
  ],
};

/**
 * Devuelve la lista de campos firmables para un resourceType dado.
 * @param {string} resourceType
 * @returns {string[]}
 */
function getSignableFields(resourceType) {
  return SIGNABLE_FIELDS[resourceType] || [];
}

/**
 * Serializa un valor de forma canónica (llaves ordenadas recursivamente).
 * Funciones, undefined y Mongoose internos se omiten.
 * @param {*} value
 * @returns {string}
 */
function canonicalize(value) {
  return JSON.stringify(value, (_key, val) => {
    // Convertir ObjectId a string
    if (val && typeof val === 'object' && val._bsontype === 'ObjectID') {
      return val.toString();
    }
    // Convertir Map a objeto plano
    if (val instanceof Map) {
      const obj = {};
      for (const [k, v] of val) obj[k] = v;
      return obj;
    }
    return val;
  }, 0);
}

/**
 * Sortea las llaves de un objeto recursivamente para garantizar orden canónico.
 * @param {*} obj
 * @returns {*}
 */
function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj instanceof Date) return obj;
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/**
 * Calcula el hash de integridad SHA-256 de un documento Mongoose.
 *
 * @param {object} doc    - Documento Mongoose (o .toObject())
 * @param {string} resourceType - Tipo de recurso (clave de SIGNABLE_FIELDS)
 * @returns {string} Hash hex SHA-256
 */
function computeIntegrityHash(doc, resourceType) {
  const fields = getSignableFields(resourceType);
  if (fields.length === 0) return '';

  // Extraer solo los campos clínicos relevantes
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const subset = {};
  for (const field of fields) {
    if (plain[field] !== undefined) {
      subset[field] = plain[field];
    }
  }

  const canonical = canonicalize(sortKeys(subset));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Calcula un HMAC-SHA256 para una entrada de audit log.
 * Requiere la variable de entorno AUDIT_HMAC_SECRET.
 * Si no está configurada en desarrollo, genera un warning y usa un fallback.
 *
 * @param {object} logData - Objeto con los datos del log ANTES de insertar
 * @returns {string} HMAC hex
 */
function computeEntryHash(logData) {
  const secret = getAuditHmacSecret();

  // Campos que participan en el HMAC (los más críticos del entry)
  const payload = {
    userId:       logData.userId?.toString() || null,
    evento:       logData.evento,
    resourceType: logData.resourceType || null,
    resourceId:   logData.resourceId?.toString() || null,
    patientId:    logData.patientId?.toString() || null,
    timestamp:    logData.timestamp ? new Date(logData.timestamp).toISOString() : null,
  };

  const canonical = canonicalize(sortKeys(payload));
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

// ── Secret management ───────────────────────────────────────────
let _auditSecretWarned = false;

function getAuditHmacSecret() {
  const secret = process.env.AUDIT_HMAC_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: AUDIT_HMAC_SECRET must be set (≥32 chars) in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Dev fallback
  if (!_auditSecretWarned) {
    _auditSecretWarned = true;
    console.warn(
      '\n⚠️  WARNING: AUDIT_HMAC_SECRET not set or too short. Using dev fallback.\n' +
      '   Audit log tamper detection will NOT work in production without it.\n'
    );
  }

  return 'dev-audit-hmac-secret-NOT-FOR-PRODUCTION';
}

module.exports = {
  computeIntegrityHash,
  computeEntryHash,
  getSignableFields,
  SIGNABLE_FIELDS,
};
