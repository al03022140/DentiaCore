const mongoose = require('mongoose');

// Audit trail de ediciones. `changes` guarda únicamente los campos modificados
// con la forma { field: { from, to } } — al reproducir la cadena se reconstruye
// el estado original (la "from" de la primera edición es el valor inicial).
const cashMovementEditSchema = new mongoose.Schema({
  editedAt: { type: Date, default: Date.now, required: true },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  // BUG-B5: cap a 500 chars
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
  changes: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: true });

const cashMovementSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0.01,
    max: 100_000_000
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
    required: true,
    trim: true,
    maxlength: 200
  },
  date: {
    type: Date,
    default: Date.now
  },
  // Campos opcionales
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  // boxSessionId NO se marca required a nivel schema para no bloquear
  // updates sobre movimientos legacy sin sesión (Mongoose valida todo el
  // doc en save()). La invariante "todo movimiento nuevo debe tener
  // sesión" se garantiza en addMovement (cashController) y se preserva
  // legacy-tolerance en getMonthlyBalance.
  boxSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BoxSession'
  },
  // Back-reference al cobro del paciente. Cuando viene de PatientCharge.addPayment
  // queda ligado para impedir ediciones que rompan la integridad del cobro.
  linkedChargeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PatientCharge',
    default: null
  },
  // Historial de ediciones — sólo se anexa, nunca se modifica
  edits: { type: [cashMovementEditSchema], default: [] },
  // Usuario que registró el movimiento
  creadoPor: {
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

// Índices para las queries calientes: balance/sesión, listado y por paciente
cashMovementSchema.index({ boxSessionId: 1 });
cashMovementSchema.index({ date: -1 });
cashMovementSchema.index({ patientId: 1, date: -1 });

// Redondea amount a 2 decimales para evitar centavos fraccionarios IEEE-754
cashMovementSchema.pre('save', function (next) {
  if (typeof this.amount === 'number') {
    this.amount = Math.round(this.amount * 100) / 100;
  }
  next();
});

module.exports = mongoose.model('CashMovement', cashMovementSchema);
