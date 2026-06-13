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
 * Normaliza un valor a una forma JSON-serializable y determinista en UNA sola
 * pasada: ordena llaves recursivamente Y convierte los tipos especiales de
 * BSON/Mongoose (Map, ObjectId, Date, Buffer, Decimal128) a su representación
 * estable.
 *
 * CRÍTICO (NOM-024): esta normalización DEBE ocurrir en la misma pasada que el
 * ordenamiento de llaves. La versión anterior ordenaba primero con
 * `Object.keys()` — que sobre un Map o un ObjectId devuelve `[]` — reduciendo
 * `current.teeth` (mediciones del periodontograma) y todos los ObjectId
 * (`patientId`, `doctor_id`) a `{}` ANTES de que el replacer de JSON.stringify
 * pudiera convertirlos. Resultado: el hash de integridad era ciego a las
 * mediciones clínicas y al paciente. Ver utils/integrity.test.js.
 *
 * @param {*} value
 * @returns {*} valor normalizado, listo para JSON.stringify determinista
 */
function normalizeForHash(value) {
  if (value === null || value === undefined) return value;

  // Primitivos
  if (typeof value !== 'object') return value;

  // Tipos especiales (antes de tratar como objeto plano)
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  // ObjectId / Decimal128 / Long y demás tipos BSON: tienen _bsontype y un
  // toString() estable. (El bug original comparaba contra 'ObjectID' con D
  // mayúscula; bson actual usa 'ObjectId'. Pato-tipado lo cubre sin acoplar.)
  if (value._bsontype) return value.toString();
  if (typeof value.toHexString === 'function') return value.toHexString();

  // Map → objeto plano con llaves ordenadas
  if (value instanceof Map) {
    const out = {};
    for (const key of [...value.keys()].sort()) {
      out[key] = normalizeForHash(value.get(key));
    }
    return out;
  }

  // Array → normaliza cada elemento (preserva orden, NO se reordena)
  if (Array.isArray(value)) return value.map(normalizeForHash);

  // Objeto plano → llaves ordenadas
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = normalizeForHash(value[key]);
  }
  return out;
}

/**
 * Serializa un valor de forma canónica (llaves ordenadas, tipos BSON
 * normalizados). Determinista para el mismo contenido lógico.
 * @param {*} value
 * @returns {string}
 */
function canonicalize(value) {
  return JSON.stringify(normalizeForHash(value));
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

  const canonical = canonicalize(subset);
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

  // El HMAC cubre TODA la evidencia sensible, no solo los 6 campos básicos.
  // Antes quedaban fuera `detalles` (diff antes/después), `motivo`,
  // `camposEditados`, `ip` y `userRole` → podían editarse sin invalidar el
  // sello. Además incluye `seq` y `prevHash` para encadenar la bitácora:
  // borrar o truncar entradas rompe la cadena y es detectable (ver
  // verifyAuditChain). canonicalize normaliza ObjectId/Map/Date dentro de
  // `detalles`.
  const payload = {
    userId:         logData.userId?.toString() || null,
    userRole:       logData.userRole || null,
    evento:         logData.evento,
    resourceType:   logData.resourceType || null,
    resourceId:     logData.resourceId?.toString() || null,
    patientId:      logData.patientId?.toString() || null,
    motivo:         logData.motivo ?? null,
    camposEditados: logData.camposEditados ?? null,
    detalles:       logData.detalles ?? null,
    ip:             logData.ip ?? null,
    seq:            logData.seq ?? null,
    prevHash:       logData.prevHash ?? null,
    timestamp:      logData.timestamp ? new Date(logData.timestamp).toISOString() : null,
  };

  const canonical = canonicalize(payload);
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
  // Expuesto para validar al arranque (fail-fast en producción).
  getAuditHmacSecret,
};
