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
  // Usuario que abrió la caja (opcional por ahora)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BoxSession', boxSessionSchema);
