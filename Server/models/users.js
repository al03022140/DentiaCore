const mongoose = require('mongoose');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (_e) {
  // Fallback a bcryptjs si bcrypt n está disponible (evita compilaciones nativas en Windows)
  bcrypt = require('bcryptjs');
}

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
    enum: ["superadmin", "doctor", "recepcionista", "administrador", "asistente"],
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
  refreshToken: {
    type: String,
    default: null
  },
  refreshTokenExpiresAt: {
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
  // ── Cédula profesional (NOM-004 Art. 5.10) ────────────────
  cedulaProfesional: {
    type: String,
    default: null,
    trim: true
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
    const salt = await bcrypt.genSalt(10);
    this.contraseña = await bcrypt.hash(this.contraseña, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// **Método para comparar contraseñas en autenticación**
userSchema.methods.compararContraseña = async function(contraseñaIngresada) {
  return await bcrypt.compare(contraseñaIngresada, this.contraseña);
};

// **Método para establecer el PIN de 4 dígitos** (roles.MD §9.1)
userSchema.methods.setPin = async function(pin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('El PIN debe ser exactamente 4 dígitos numéricos');
  }
  const salt = await bcrypt.genSalt(12);
  this.pinHash = await bcrypt.hash(pin, salt);
  this.pinFailedAttempts = 0;
};

// **Método para verificar el PIN** (Modo Cortina + firma digital)
userSchema.methods.verificarPin = async function(pinIngresado) {
  if (!this.pinHash) return false;
  return await bcrypt.compare(pinIngresado, this.pinHash);
};

module.exports = mongoose.model('Usuario', userSchema);
