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

// ── Capa de compatibilidad de hash (Fase 1 de normalización) ─────────────
//
// PROBLEMA NOM-024: el contentHash de un documento firmado se calcula sobre los
// NOMBRES y VALORES actuales de los campos en SIGNABLE_FIELDS. Si la migración
// renombra un campo (apellido_paterno -> lastNamePaternal) o canonicaliza un
// enum ('Pendiente' -> 'PENDING'), el hash recalculado dejaría de coincidir y
// TODAS las firmas existentes se marcarían como alteradas (firmaDesactualizada).
//
// SOLUCIÓN: el hash se calcula SIEMPRE sobre la representación "legacy canónica"
// (los nombres/valores originales). A medida que se migre un campo, se registra
// aquí su alias (nombre nuevo) y/o su mapa de valores (nuevo -> legacy), de modo
// que un documento ya migrado produzca EXACTAMENTE el mismo hash que antes.
//
// IMPORTANTE: las claves de SIGNABLE_FIELDS son la base de hash CONGELADA y NO
// deben cambiar (quitar o renombrar una clave invalida firmas; eso requeriría
// versionar el hash). Aquí solo se AGREGAN aliases y mapas de valores.
//
// Hoy ambos mapas están vacíos => el hash es byte-idéntico al de antes de esta
// capa (ver Server/tests/integrity-hash-compat.test.js).

// resourceType -> { campoLegacy: [nombresFisicosAdicionales...] }. El nombre
// legacy se intenta primero (implícito). Agregar el nombre nuevo al migrar.
//   Ej. futuro: patient: { apellido_paterno: ['lastNamePaternal'] }
const HASH_FIELD_ALIASES = {};

// resourceType -> { campoLegacy: { valorNuevo: valorLegacy } } para enums
// escalares que se canonicalicen.
//   Ej. futuro: cita: { estado: { PENDING: 'Pendiente', CONFIRMED: 'Confirmada' } }
const HASH_VALUE_MAPS = {};

/**
 * Resuelve el valor físico de un campo firmable tolerando que el documento use
 * el nombre legacy o un nombre nuevo (alias). Devuelve el primero definido.
 */
function resolveSignableValue(plain, legacyField, aliasesForType) {
  const candidates = [legacyField, ...(aliasesForType[legacyField] || [])];
  for (const name of candidates) {
    if (plain[name] !== undefined) return plain[name];
  }
  return undefined;
}

/**
 * Normaliza un valor escalar nuevo a su forma legacy para hashear. Solo afecta
 * strings presentes en el mapa; arrays/objetos se devuelven sin cambio (la
 * migración de valores anidados se maneja por separado cuando aplique).
 */
function toLegacyHashValue(val, valueMapForField) {
  if (
    valueMapForField &&
    typeof val === 'string' &&
    Object.prototype.hasOwnProperty.call(valueMapForField, val)
  ) {
    return valueMapForField[val];
  }
  return val;
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
function normalizeForHash(value, visited = new WeakSet()) {
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

  // Ciclos: un Map de subdocumentos Mongoose puede traer una referencia
  // interna de vuelta al padre (p.ej. current.teeth en periodontograma), y
  // la recursión sin guarda revienta el stack (confirmado: RangeError al
  // re-sellar periodontogramas reales en migración 0001). Mismo fix que el
  // normalizeDataForHash del cliente (universal-tooth-validator.js).
  if (visited.has(value)) return '[Circular]';
  visited.add(value);

  // Map → objeto plano con llaves ordenadas
  if (value instanceof Map) {
    const out = {};
    for (const key of [...value.keys()].sort()) {
      out[key] = normalizeForHash(value.get(key), visited);
    }
    return out;
  }

  // Array → normaliza cada elemento (preserva orden, NO se reordena)
  if (Array.isArray(value)) return value.map((v) => normalizeForHash(v, visited));

  // Objeto plano → llaves ordenadas
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = normalizeForHash(value[key], visited);
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
 * El hash se computa sobre la representación "legacy canónica" (ver la capa de
 * compatibilidad arriba): aunque el documento use nombres/valores migrados al
 * inglés, se mapean a su forma original antes de hashear, de modo que las
 * firmas NOM-024 emitidas antes de la migración sigan verificando.
 *
 * @param {object} doc    - Documento Mongoose (o .toObject())
 * @param {string} resourceType - Tipo de recurso (clave de SIGNABLE_FIELDS)
 * @returns {string} Hash hex SHA-256
 */
function computeIntegrityHash(doc, resourceType) {
  const fields = getSignableFields(resourceType);
  if (fields.length === 0) return '';

  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const aliasesForType = HASH_FIELD_ALIASES[resourceType] || {};
  const valueMapsForType = HASH_VALUE_MAPS[resourceType] || {};

  // Extraer solo los campos clínicos relevantes, en su forma legacy canónica.
  const subset = {};
  for (const field of fields) {
    const value = resolveSignableValue(plain, field, aliasesForType);
    if (value === undefined) continue;
    subset[field] = toLegacyHashValue(value, valueMapsForType[field]);
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
  // Capa de compatibilidad de hash (poblar al migrar campos firmables):
  HASH_FIELD_ALIASES,
  HASH_VALUE_MAPS,
  resolveSignableValue,
  toLegacyHashValue,
};
