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

// Inmutabilidad de pagos existentes: una vez registrado un pago, no se
// puede alterar su monto/método/fecha. Sólo se permite $push de pagos
// nuevos (o cancelar el cobro completo vía `cancelado`). Esto protege
// la integridad de saldoPendiente y previene fraude contable silencioso.
patientChargeSchema.pre('save', async function (next) {
  try {
    if (this.isNew) return next();
    if (!this.isModified('pagos')) return next();

    const original = await this.constructor.findById(this._id).select('pagos').lean();
    if (!original) return next();

    const oldPagos = Array.isArray(original.pagos) ? original.pagos : [];
    const newPagos = Array.isArray(this.pagos) ? this.pagos : [];

    if (newPagos.length < oldPagos.length) {
      return next(new Error('No se pueden eliminar pagos registrados de un cobro.'));
    }

    const fieldsToCheck = ['monto', 'fecha', 'paymentMethod', 'cashMovementId', 'registradoPor'];
    for (const oldP of oldPagos) {
      const oldId = oldP._id?.toString();
      if (!oldId) continue;
      const newP = newPagos.find(p => p._id?.toString() === oldId);
      if (!newP) {
        return next(new Error('No se puede eliminar un pago ya registrado.'));
      }
      for (const f of fieldsToCheck) {
        const oldVal = oldP[f] != null ? (oldP[f] instanceof Date ? new Date(oldP[f]).toISOString() : String(oldP[f])) : '';
        const newVal = newP[f] != null ? (newP[f] instanceof Date ? new Date(newP[f]).toISOString() : String(newP[f])) : '';
        if (oldVal !== newVal) {
          return next(new Error(`No se puede modificar el campo "${f}" de un pago ya registrado.`));
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

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
