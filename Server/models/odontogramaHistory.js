const mongoose = require('mongoose');

/**
 * Historial de versiones del ODONTOGRAMA CLÍNICO — espejo de
 * periodontogramHistory.js. Colección separada, append-only e inmutable: una
 * fila por versión (un snapshot completo de `datos`), identificada por
 * `versionName` único por paciente.
 *
 * A diferencia del periodontograma, NO guarda estadísticas (el odontograma
 * clínico son entradas de daños, no mediciones agregadas). `datos` se almacena
 * como Mixed (igual que `teeth` en el perio) porque las entradas ya vienen
 * validadas por `validarEntradasOdontograma`/`normalizeEntry` antes de llegar
 * aquí, y así conservamos exactamente la misma forma que `current.datos` del
 * documento principal para que la lectura sea homogénea.
 */
const OdontogramaHistorySchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  odontograma: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Odontograma',
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
    default: 'Inicial',
    // Backstop de la cota del controller (400 antes de llegar aquí). Sólo
    // aplica al create — la colección es append-only, legacy no se re-valida.
    maxlength: 200
  },
  // Snapshot completo de entradas: [{ tooth, space, damage, surface, note, fecha }]
  datos: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  }
}, {
  timestamps: true,
  collection: 'odontograma_history'
});

OdontogramaHistorySchema.index({ patient: 1, createdAt: -1 });
OdontogramaHistorySchema.index({ odontograma: 1, createdAt: -1 });
// Garantizar que no existan dos versiones con el mismo nombre por paciente.
// Nota: antes de activar en producción, correr la migración 0004 que rellena
// versiones legacy con versionName determinístico (sin colisiones).
OdontogramaHistorySchema.index({ patient: 1, versionName: 1 }, { unique: true });

// ── Inmutabilidad a nivel app (NOM-024) ───────────────────────────────
// El historial NO se puede modificar ni borrar una vez creado. Sólo inserts
// vía .create() están permitidos. Los hooks bloquean rutas internas de
// Mongoose; un admin con acceso directo a la BD aún puede alterar, pero al
// menos no por la API.
const blockMutation = function (next) {
  return next(new Error('OdontogramaHistory es inmutable — no se permite modificar ni borrar versiones del historial.'));
};
OdontogramaHistorySchema.pre('updateOne',        blockMutation);
OdontogramaHistorySchema.pre('updateMany',       blockMutation);
OdontogramaHistorySchema.pre('findOneAndUpdate', blockMutation);
OdontogramaHistorySchema.pre('replaceOne',       blockMutation);
OdontogramaHistorySchema.pre('deleteOne',        blockMutation);
OdontogramaHistorySchema.pre('deleteMany',       blockMutation);
OdontogramaHistorySchema.pre('findOneAndDelete', blockMutation);
OdontogramaHistorySchema.pre('findOneAndRemove', blockMutation);
// pre('save') aplica a .save() de un doc ya existente — bloqueamos sólo si no
// es nuevo. Permite .create() (que emite save con isNew=true).
OdontogramaHistorySchema.pre('save', function (next) {
  if (this.isNew) return next();
  return next(new Error('OdontogramaHistory es inmutable — no se puede re-guardar una versión existente.'));
});

module.exports = mongoose.model('OdontogramaHistory', OdontogramaHistorySchema);
