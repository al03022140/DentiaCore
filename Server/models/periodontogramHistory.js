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
    ref: 'User'
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

module.exports = mongoose.model('PeriodontogramHistory', PeriodontogramHistorySchema);
