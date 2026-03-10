/**
 * Modelo de Plantilla de Nota de Evolución — DentiaCore
 *
 * roles.MD §9.2: Plantillas de notas de evolución por tipo de procedimiento.
 * Las plantillas tienen campos preconfigurados para reducir errores y
 * acelerar la captura, pero el doctor siempre puede editar los valores.
 *
 * Eventos de uso se registran en AuditLog como 'plantilla_usada'.
 */
const mongoose = require('mongoose');

const noteTemplateSchema = new mongoose.Schema({
  // ── Identificación ────────────────────────────────────────────
  nombre: {
    type: String,
    required: [true, 'El nombre de la plantilla es obligatorio'],
    trim: true,
    unique: true,
    maxlength: 120
  },

  tipoProcedimiento: {
    type: String,
    required: [true, 'El tipo de procedimiento es obligatorio'],
    trim: true,
    index: true
  },

  descripcion: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },

  // ── Estructura de la plantilla ────────────────────────────────
  // Cada campo tiene nombre, etiqueta, tipo y si es requerido.
  estructura: [{
    campo: {
      type: String,
      required: true,
      trim: true
    },
    etiqueta: {
      type: String,
      required: true,
      trim: true
    },
    tipo: {
      type: String,
      enum: ['text', 'textarea', 'number', 'select', 'checkbox', 'date'],
      default: 'text'
    },
    opciones: {
      type: [String],      // Para campos tipo 'select'
      default: undefined
    },
    valorPorDefecto: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    placeholder: {
      type: String,
      default: '',
      trim: true
    },
    orden: {
      type: Number,
      default: 0
    }
  }],

  // Campos que el doctor DEBE llenar antes de firmar
  camposObligatorios: {
    type: [String],
    default: [],
    validate: {
      validator: function(arr) {
        // Verificar que cada campo obligatorio exista en la estructura
        const camposEnEstructura = (this.estructura || []).map(e => e.campo);
        return arr.every(c => camposEnEstructura.includes(c));
      },
      message: 'Todos los campos obligatorios deben existir en la estructura'
    }
  },

  // ── Secciones NOM-004 ─────────────────────────────────────────
  // Secciones clínicas que esta plantilla cubre
  seccionesClinicas: {
    type: [{
      type: String,
      enum: [
        'signos_vitales',
        'interrogatorio',
        'exploracion_fisica',
        'diagnostico',
        'plan_tratamiento',
        'procedimiento_realizado',
        'indicaciones',
        'pronostico',
        'consentimiento_informado',
      ]
    }],
    default: []
  },

  // ── Metadatos ─────────────────────────────────────────────────
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  modificadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, {
  timestamps: true,
  collection: 'note_templates'
});

// Índice compuesto para búsqueda rápida
noteTemplateSchema.index({ tipoProcedimiento: 1, active: 1 });
noteTemplateSchema.index({ nombre: 'text', tipoProcedimiento: 'text' });

/**
 * Buscar plantillas activas por tipo de procedimiento.
 */
noteTemplateSchema.statics.buscarPorTipo = function(tipo) {
  return this.find({ tipoProcedimiento: tipo, active: true })
    .sort({ nombre: 1 });
};

/**
 * Buscar todas las plantillas activas.
 */
noteTemplateSchema.statics.activas = function() {
  return this.find({ active: true }).sort({ tipoProcedimiento: 1, nombre: 1 });
};

module.exports = mongoose.model('NoteTemplate', noteTemplateSchema);
