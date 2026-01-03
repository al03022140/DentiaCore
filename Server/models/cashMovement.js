const mongoose = require('mongoose');

const cashMovementSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['INCOME', 'EXPENSE'],
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'DIGITAL'],
    required: true
  },
  concept: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  // Campos opcionales para futuras implementaciones
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  boxSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BoxSession'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CashMovement', cashMovementSchema);
