const mongoose = require('mongoose');

/**
 * Esquema para representar daños en dientes del odontograma
 * Separado del modelo principal para mejor modularización
 */
const DamageSchema = new mongoose.Schema({
  toothNumber: {
    type: Number,
    required: [true, 'El número del diente es requerido'],
    min: [1, 'El número del diente debe ser mayor a 0'],
    max: [55, 'El número del diente no puede ser mayor a 55']
  },
  damage: {
    type: String,
    required: [true, 'El tipo de daño es requerido'],
    trim: true,
    maxlength: [100, 'El tipo de daño no puede exceder 100 caracteres']
  },
  surface: {
    type: String,
    trim: true,
    maxlength: [50, 'La superficie no puede exceder 50 caracteres']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Las notas no pueden exceder 500 caracteres']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false // No generar _id automático para subdocumentos
});

// Middleware para actualizar updatedAt
DamageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = DamageSchema;