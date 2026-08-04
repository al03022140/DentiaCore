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
const config = require('../config/env');

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
 * @param {string} [secretOverride] - Clave a usar (key ring); default: la activa
 * @returns {string} HMAC hex
 */
function computeEntryHash(logData, secretOverride) {
  const secret = secretOverride || getAuditHmacSecret();

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
  const secret = config.security.auditHmacSecret;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (config.isProd) {
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

// ── Key ring (R-1) ──────────────────────────────────────────────
// Rotar AUDIT_HMAC_SECRET ya no invalida la historia: cada entrada guarda el
// `keyId` (huella de la clave que la selló) y la verificación busca esa clave
// en el ring. Rotación = 2 pasos en Server/.env, CERO re-sellado:
//   1. añadir el valor actual de AUDIT_HMAC_SECRET a AUDIT_HMAC_RETIRED_SECRETS
//      (lista separada por comas — solo verifican, nunca firman);
//   2. generar un AUDIT_HMAC_SECRET nuevo y reiniciar.
//
// El keyId se DERIVA de la clave (sha256 truncado), nunca se configura a mano:
// imposible desalinear id↔clave. Va FUERA del payload del HMAC: es metadato de
// enrutamiento, y así backfillearlo (migración 0008) no altera ningún sello.
// Manipular el keyId de una entrada hace que la verificación use otra clave y
// el hash no recompute; recomputar un sello rompe el prevHash del siguiente
// eslabón. Limitación asumida: una clave RETIRADA comprometida permite
// re-sellar la última entrada (sin eslabón siguiente que la delate) — con
// clave única ese mismo compromiso rompía la historia completa.

function keyFingerprint(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

/**
 * Ring de claves del audit log — CONTRATO (interface AuditKeyRing):
 *
 *   activeKeyId    huella de la clave activa — la que llevan las entradas nuevas
 *   activeSecret   la ÚNICA clave que firma
 *   legacySecret   clave para entradas sin keyId (pre-0008). Hoy = la activa;
 *                  si algún día deja de serlo, se cambia SOLO aquí
 *   byId           Map huella → clave (activa + retiradas). Las retiradas
 *                  (AUDIT_HMAC_RETIRED_SECRETS) solo verifican, nunca firman
 *   resolve(entry) única puerta de selección de clave de verificación:
 *                  con keyId → byId; sin keyId → legacySecret; keyId fuera del
 *                  ring → null (verifyChain lo reporta como `unknown_key`:
 *                  "falta una clave histórica en .env", no corrupción)
 *   sign(logData)  HMAC de una entrada con la clave activa
 *
 * Se construye en vivo desde el .env (sin caché: los getters de config/env.js
 * leen process.env y los tests rotan claves). Fail-fast: un ring ambiguo
 * (misma clave dos veces, o colisión de huella) impide arrancar — nunca
 * verificar contra un ring que no sabe qué clave es cuál.
 */
function getAuditKeyRing() {
  const activeSecret = getAuditHmacSecret();
  const activeKeyId = keyFingerprint(activeSecret);
  const retired = (config.security.auditHmacRetiredSecrets || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 32);

  const byId = new Map([[activeKeyId, activeSecret]]);
  for (const s of retired) {
    const id = keyFingerprint(s);
    if (byId.has(id)) {
      throw new Error(
        `FATAL: ring de claves de auditoría ambiguo — la huella ${id} aparece dos veces ` +
        '(clave repetida en AUDIT_HMAC_RETIRED_SECRETS, o retirada igual a la activa). ' +
        'Corrige Server/.env antes de arrancar.'
      );
    }
    byId.set(id, s);
  }

  const legacySecret = activeSecret;
  return {
    activeKeyId,
    activeSecret,
    legacySecret,
    byId,
    resolve(entry) {
      if (!entry?.keyId) return legacySecret;
      return byId.get(entry.keyId) ?? null;
    },
    sign(logData) {
      return computeEntryHash(logData, activeSecret);
    },
  };
}

module.exports = {
  computeIntegrityHash,
  computeEntryHash,
  getSignableFields,
  SIGNABLE_FIELDS,
  // Expuesto para validar al arranque (fail-fast en producción).
  getAuditHmacSecret,
  getAuditKeyRing,
  keyFingerprint,
};
