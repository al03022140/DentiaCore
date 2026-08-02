/**
 * Redactado de secretos en la traza de auditoría — DentiaCore.
 *
 * Hallazgo CRÍTICO (auditoría seguridad 2026-07-31): un reseteo de contraseña
 * por admin (PUT /api/users/:id) dejaba la contraseña NUEVA en texto plano en
 * `detalles.despues`, y el snapshot "antes" arrastraba bcrypt/pinHash/refresh
 * tokens — todo sellado de forma permanente en la cadena HMAC NOM-024.
 *
 * Se redacta el VALOR conservando la llave: la traza sigue mostrando QUÉ campo
 * se editó, nunca el secreto. El punto de aplicación es AuditLog.registrar
 * (cuello único: middleware, registrarManual y escrituras directas de
 * controladores pasan todos por ahí), ANTES de computeEntryHash.
 */

const REDACTED = '[REDACTED]';

// Comparación en minúsculas (cubre variantes de capitalización).
const SENSITIVE_KEYS = new Set([
  'contraseña',
  'password',
  'pin',
  'pinhash',
  'refreshtokenhash',
  'previousrefreshtokenhash',
  'passwordresettoken',
  'passwordresetexpires',
]);

// Proyección de exclusión para snapshots de documentos completos
// (snapshotCapture): que los secretos ni siquiera salgan de Mongo.
const SNAPSHOT_EXCLUDE_PROJECTION = {
  'contraseña': 0,
  pinHash: 0,
  refreshTokenHash: 0,
  previousRefreshTokenHash: 0,
  passwordResetToken: 0,
  passwordResetExpires: 0,
};

// Solo objetos planos y arrays se recorren; ObjectId/Date/Buffer pasan intactos.
function isPlainObject(v) {
  return v !== null && typeof v === 'object'
    && (v.constructor === Object || v.constructor === undefined);
}

/**
 * Devuelve una copia profunda de `value` con los valores de llaves sensibles
 * sustituidos por '[REDACTED]'. No muta el original.
 */
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = (SENSITIVE_KEYS.has(k.toLowerCase()) && v != null) ? REDACTED : redactSecrets(v);
  }
  return out;
}

module.exports = { redactSecrets, REDACTED, SENSITIVE_KEYS, SNAPSHOT_EXCLUDE_PROJECTION };
