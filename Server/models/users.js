const mongoose = require('mongoose');
const { validatePasswordStrength } = require('../utils/crypto');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (_e) {
  // Fallback a bcryptjs si bcrypt nativo no está disponible (evita compilaciones nativas en Windows)
  bcrypt = require('bcryptjs');
}

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // Expresión regular para validar email
  },
  contraseña: {
    type: String,
    required: true,
    minlength: 8
  },
  rol: {
    type: String,
    enum: ["superadmin", "doctor_admin", "doctor", "recepcionista", "administrador", "asistente"],
    default: "recepcionista"
  },
  permissions: {
    type: [String],
    default: []
  },
  active: {
    type: Boolean,
    default: true
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  lastPasswordChangeAt: {
    type: Date,
    default: null
  },
  refreshTokenHash: {
    type: String,
    default: null
  },
  // Guarda el hash inmediatamente anterior para tolerar refresh concurrente
  // (multi-tab) sin que el segundo request crea que es reutilización maliciosa.
  // Sólo se acepta como válido el actual o este previo.
  previousRefreshTokenHash: {
    type: String,
    default: null
  },
  refreshTokenExpiresAt: {
    type: Date,
    default: null
  },
  // ── Password reset ─────────────────────────────────────────
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  // ── PIN de 4 dígitos (roles.MD §9.1) ──────────────────────
  // Usado para: Modo Cortina (todos), firma digital (doctor),
  // aprobación de acciones críticas (admin/superadmin).
  pinHash: {
    type: String,
    default: null
  },
  pinFailedAttempts: {
    type: Number,
    default: 0
  },
  // Lockout temporal del PIN tras N intentos fallidos. signingController
  // verifica este timestamp antes de comparar el hash para evitar brute-
  // force trivial (4 dígitos = 10 000 combinaciones).
  pinLockedUntil: {
    type: Date,
    default: null
  },
  // ── Cédula profesional (NOM-004 Art. 5.10) ────────────────
  cedulaProfesional: {
    type: String,
    default: null,
    trim: true
  },
  // ── Perfil profesional (Pantalla Configuración) ────────────
  firmaDigitalUrl: { type: String, default: null },
  especialidad: { type: String, default: null, trim: true },
  universidad: { type: String, default: null, trim: true },
  registroSSA: { type: String, default: null, trim: true },
  // ── Preferencias de usuario ────────────────────────────────
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    defaultAppointmentDuration: { type: Number, default: 30 },
    prescriptionDefaults: {
      header: { type: String, default: '' },
      footer: { type: String, default: '' }
    },
    reminders: {
      pendingDrafts: { type: Boolean, default: true },
      upcomingAppointments: { type: Boolean, default: true },
      endOfDay: { type: Boolean, default: false }
    },
    // Dispositivo preferido para capturar firmas. Cambia el comportamiento
    // del pad de firma: en 'tablet' se aplica scroll-lock, pointer-capture
    // y canvas a ancho completo; en 'touch' se optimiza para tap rápido.
    signatureInput: { type: String, enum: ['mouse', 'tablet', 'touch'], default: 'mouse' }
  },
  fecha_registro: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// **Middleware para hashear la contraseña antes de guardar**
userSchema.pre('save', async function(next) {
  if (!this.isModified('contraseña')) return next();
  try {
    // Enforce password complexity on plaintext passwords (skip if already hashed)
    const isAlreadyHashed = /^\$2[aby]\$/.test(this.contraseña);
    if (!isAlreadyHashed) {
      const strength = validatePasswordStrength(this.contraseña);
      if (!strength.valid) {
        return next(new Error(strength.message));
      }
    }
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.contraseña = await bcrypt.hash(this.contraseña, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// **Validación condicional: cédula obligatoria para doctores (NOM-004 Art. 5.10)**
// Aplica tanto a `doctor` puro como a `doctor_admin` (doctor + director clínico).
userSchema.path('cedulaProfesional').validate(function(v) {
  if (this.rol === 'doctor' || this.rol === 'doctor_admin') {
    return !!v && v.trim().length > 0;
  }
  return true;
}, 'La cédula profesional es obligatoria para doctores');

// **Método para comparar contraseñas en autenticación**
userSchema.methods.compararContraseña = async function(contraseñaIngresada) {
  return await bcrypt.compare(contraseñaIngresada, this.contraseña);
};

// **Método para establecer el PIN de 4 dígitos** (roles.MD §9.1)
userSchema.methods.setPin = async function(pin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('El PIN debe ser exactamente 4 dígitos numéricos');
  }
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.pinHash = await bcrypt.hash(pin, salt);
  this.pinFailedAttempts = 0;
};

// Lockout del PIN: 5 intentos fallidos → 15 min de bloqueo. Sin esto,
// 4 dígitos = 10 000 combinaciones tras una sesión válida — brute-force
// trivial. Mantener `verificarPin` retornando boolean por compatibilidad
// con los callers existentes; quien necesite detalles consulta
// `pinLockedUntil` o usa `verificarPinDetallado`.
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;

// **Método para verificar el PIN** (Modo Cortina + firma digital).
// Devuelve boolean para compatibilidad con código existente.
userSchema.methods.verificarPin = async function(pinIngresado) {
  const result = await this.verificarPinDetallado(pinIngresado);
  return result.ok;
};

// Versión rica: { ok, locked, remainingMs, attemptsLeft, reason }.
// signingController la usa para devolver al cliente cuánto falta del
// lockout y cuántos intentos quedan.
userSchema.methods.verificarPinDetallado = async function(pinIngresado) {
  if (!this.pinHash) {
    return { ok: false, locked: false, attemptsLeft: PIN_MAX_ATTEMPTS, remainingMs: 0, reason: 'no_pin' };
  }

  // Lockout activo: rechazar sin gastar intento ni revelar match/miss.
  if (this.pinLockedUntil && this.pinLockedUntil > new Date()) {
    return {
      ok: false,
      locked: true,
      remainingMs: this.pinLockedUntil.getTime() - Date.now(),
      attemptsLeft: 0,
      reason: 'locked'
    };
  }

  const ok = await bcrypt.compare(pinIngresado, this.pinHash);

  if (ok) {
    if (this.pinFailedAttempts !== 0 || this.pinLockedUntil) {
      this.pinFailedAttempts = 0;
      this.pinLockedUntil = null;
      await this.save({ validateBeforeSave: false });
    }
    return { ok: true, locked: false, attemptsLeft: PIN_MAX_ATTEMPTS, remainingMs: 0 };
  }

  this.pinFailedAttempts = (this.pinFailedAttempts || 0) + 1;
  let locked = false;
  let remainingMs = 0;
  if (this.pinFailedAttempts >= PIN_MAX_ATTEMPTS) {
    this.pinLockedUntil = new Date(Date.now() + PIN_LOCKOUT_MS);
    locked = true;
    remainingMs = PIN_LOCKOUT_MS;
  }
  await this.save({ validateBeforeSave: false });

  return {
    ok: false,
    locked,
    remainingMs,
    attemptsLeft: Math.max(0, PIN_MAX_ATTEMPTS - this.pinFailedAttempts),
    reason: locked ? 'locked' : 'wrong'
  };
};

module.exports = mongoose.model('Usuario', userSchema);
