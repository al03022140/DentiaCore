const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  monto: { type: Number, required: true, min: 0.01 },
  fecha: { type: Date, default: Date.now },
  paymentMethod: { type: String, enum: ['CASH', 'DIGITAL'], required: true },
  cashMovementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashMovement' },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, { _id: true });

const chargeItemSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  cantidad: { type: Number, required: true, min: 1 },
  precioUnitario: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const patientChargeSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  },
  fecha: { type: Date, required: true, default: Date.now },
  items: {
    type: [chargeItemSchema],
    validate: [arr => arr.length > 0, 'Debe incluir al menos un item']
  },
  total: { type: Number, required: true, min: 0 },
  pagos: [paymentSchema],
  totalPagado: { type: Number, default: 0, min: 0 },
  saldoPendiente: { type: Number, default: 0, min: 0 },
  confirmado: { type: Boolean, default: false },
  // Cancelación lógica — preserva la fila para auditoría
  cancelado: { type: Boolean, default: false, index: true },
  canceladoEn: { type: Date, default: null },
  canceladoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  canceladoMotivo: { type: String, default: null, trim: true },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, { timestamps: true });

// Acelera el reverse-lookup CashMovement → PatientCharge
patientChargeSchema.index({ 'pagos.cashMovementId': 1 });

// Recalcular totales de pago antes de guardar
patientChargeSchema.pre('save', function (next) {
  if (this.confirmado && this.isModified('items')) {
    return next(new Error('No se pueden modificar items de un cobro confirmado'));
  }
  this.totalPagado = this.pagos.reduce((sum, p) => sum + p.monto, 0);
  this.saldoPendiente = Math.max(0, this.total - this.totalPagado);
  next();
});

module.exports = mongoose.model('PatientCharge', patientChargeSchema);
