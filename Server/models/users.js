const mongoose = require('mongoose');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
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
    enum: ["doctor", "recepcionista", "administrador", "asistente"],
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

module.exports = mongoose.model('Usuario', userSchema);
