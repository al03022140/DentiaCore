const crypto = require('crypto');

/**
 * Hash a token using SHA-256 for secure storage (e.g., refresh tokens, reset tokens).
 * Much faster than bcrypt — appropriate for random tokens that don't need brute-force resistance.
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate a cryptographically secure random token (URL-safe, hex-encoded).
 */
const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Enforce a valid JWT_SECRET. In production, refuse to start without one.
 * In development, generate a per-process ephemeral secret and warn loudly.
 */
let _ephemeralSecret = null;

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (secret && secret !== 'dev-secret' && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: JWT_SECRET must be set to a strong value (≥32 chars) in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }

  // Development only: generate ephemeral secret per process and warn
  if (!_ephemeralSecret) {
    _ephemeralSecret = crypto.randomBytes(64).toString('hex');
    console.warn(
      '\n⚠️  WARNING: JWT_SECRET not set or insecure. Using ephemeral secret for this session.\n' +
      '   All tokens will be invalidated on server restart.\n' +
      '   Set JWT_SECRET in Server/.env to a strong random value (≥32 chars).\n' +
      '   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n'
    );
  }

  return _ephemeralSecret;
};

/**
 * Validate password complexity.
 * Requires: ≥8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character.
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/\\`~])[A-Za-z\d!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/\\`~]{8,}$/;

const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'La contraseña es requerida' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'La contraseña debe tener al menos 8 caracteres' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos una letra minúscula' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos una letra mayúscula' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos un número' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/\\`~]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos un carácter especial (!@#$%^&*...)' };
  }
  return { valid: true };
};

module.exports = {
  hashToken,
  generateSecureToken,
  getJwtSecret,
  validatePasswordStrength,
  PASSWORD_REGEX
};
