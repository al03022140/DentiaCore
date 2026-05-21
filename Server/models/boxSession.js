const mongoose = require('mongoose');

const boxSessionSchema = new mongoose.Schema({
  initialAmount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 100_000_000
  },
  finalAmount: {
    type: Number
  },
  startTime: {
    type: Date,
    default: Date.now,
    required: true
  },
  endTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED', 'CLOSING'],
    default: 'OPEN',
    required: true
  },
  // Usuario que abrió la caja — required para trazabilidad (NOM-024)
  openedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  // Usuario que cerró la caja
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },
  // Campo legacy mantenido por compatibilidad
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  }
}, {
  timestamps: true
});

// Garantiza UNA sola sesión OPEN en toda la colección. Bloquea race
// condition de doble apertura: si dos requests intentan crear OPEN al
// mismo tiempo, MongoDB rechaza uno con E11000.
boxSessionSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } }
);

// Redondear initialAmount/finalAmount a 2 decimales — evita errores IEEE-754
boxSessionSchema.pre('save', function (next) {
  if (typeof this.initialAmount === 'number') {
    this.initialAmount = Math.round(this.initialAmount * 100) / 100;
  }
  if (typeof this.finalAmount === 'number') {
    this.finalAmount = Math.round(this.finalAmount * 100) / 100;
  }
  next();
});

module.exports = mongoose.model('BoxSession', boxSessionSchema);
