const mongoose = require('mongoose');

const statisticsSchema = new mongoose.Schema({
  placaTotal: { type: Number, default: 0 },
  sangradoTotal: { type: Number, default: 0 },
  supuracionTotal: { type: Number, default: 0 },
  totalTeeth: { type: Number, default: 32 },
  presentTeeth: { type: Number, default: 0 },
  bleedingPercentage: { type: Number, default: 0, min: 0, max: 100 },
  plaquePercentage: { type: Number, default: 0, min: 0, max: 100 },
  averageProbingDepth: { type: Number, default: 0 },
  averageGingivalMargin: { type: Number, default: 0 }
}, { _id: false });

const PeriodontogramHistorySchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  periodontogram: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Periodontogram',
    required: true,
    index: true
  },
  // Cita en la que se generó esta versión (opcional, auditoría / línea de tiempo)
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null,
    index: true
  },
  versionName: {
    type: String,
    required: true,
    default: 'Inicial'
  },
  teeth: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  statistics: {
    type: statisticsSchema,
    default: () => ({})
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  }
}, {
  timestamps: true,
  collection: 'periodontogram_history'
});

PeriodontogramHistorySchema.index({ patient: 1, createdAt: -1 });
PeriodontogramHistorySchema.index({ periodontogram: 1, createdAt: -1 });
// Garantizar que no existan dos versiones con el mismo nombre por paciente
// Nota: antes de activar en producción, ejecutar script de limpieza si ya hay duplicados.
PeriodontogramHistorySchema.index({ patient: 1, versionName: 1 }, { unique: true });

// ── Inmutabilidad a nivel app (NOM-024) ───────────────────────────────
// El historial NO se puede modificar ni borrar una vez creado. Sólo
// inserts vía .create() están permitidos. Los hooks bloquean rutas
// internas de Mongoose; un admin con acceso directo a la BD aún puede
// alterar, pero al menos no por la API.
const blockMutation = function (next) {
  return next(new Error('PeriodontogramHistory es inmutable — no se permite modificar ni borrar versiones del historial.'));
};
PeriodontogramHistorySchema.pre('updateOne',        blockMutation);
PeriodontogramHistorySchema.pre('updateMany',       blockMutation);
PeriodontogramHistorySchema.pre('findOneAndUpdate', blockMutation);
PeriodontogramHistorySchema.pre('replaceOne',       blockMutation);
PeriodontogramHistorySchema.pre('deleteOne',        blockMutation);
PeriodontogramHistorySchema.pre('deleteMany',       blockMutation);
PeriodontogramHistorySchema.pre('findOneAndDelete', blockMutation);
PeriodontogramHistorySchema.pre('findOneAndRemove', blockMutation);
// pre('save') aplica a .save() de un doc ya existente — bloqueamos sólo si
// no es nuevo. Permite .create() (que emite save con isNew=true).
PeriodontogramHistorySchema.pre('save', function (next) {
  if (this.isNew) return next();
  return next(new Error('PeriodontogramHistory es inmutable — no se puede re-guardar una versión existente.'));
});

module.exports = mongoose.model('PeriodontogramHistory', PeriodontogramHistorySchema);
