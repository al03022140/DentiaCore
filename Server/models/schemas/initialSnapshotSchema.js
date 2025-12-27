const mongoose = require('mongoose');

/**
 * Esquema para representar instantáneas iniciales del odontograma
 * Separado del modelo principal para mejor modularización
 */
const InitialSnapshotSchema = new mongoose.Schema({
  toothNumber: {
    type: Number,
    required: [true, 'El número del diente es requerido'],
    min: [1, 'El número del diente debe ser mayor a 0'],
    max: [55, 'El número del diente no puede ser mayor a 55']
  },
  condition: {
    type: String,
    required: [true, 'La condición del diente es requerida'],
    trim: true,
    maxlength: [100, 'La condición no puede exceder 100 caracteres']
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
  capturedAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  _id: false // No generar _id automático para subdocumentos
});

// Validación personalizada para condición
InitialSnapshotSchema.path('condition').validate(function(value) {
  const validConditions = [
    'sano', 'cariado', 'obturado', 'corona', 'ausente', 
    'implante', 'fracturado', 'endodoncia', 'extraccion_indicada'
  ];
  return validConditions.includes(value.toLowerCase());
}, 'Condición del diente no válida');

module.exports = InitialSnapshotSchema;