const mongoose = require('mongoose');

const boxSessionSchema = new mongoose.Schema({
  initialAmount: {
    type: Number,
    required: true,
    default: 0
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
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN',
    required: true
  },
  // Usuario que abrió la caja
  openedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
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

module.exports = mongoose.model('BoxSession', boxSessionSchema);
