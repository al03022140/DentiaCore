const mongoose = require('mongoose');

const treatmentSchema = new mongoose.Schema({
  paciente_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient', // Referencia al modelo de pacientes
    required: true
  },
  tratamientos: [
    {
      fecha: {
        type: Date,
        required: true
      },
      descripcion: {
        type: String,
        required: true,
        trim: true
      },
      doctor_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario', // Referencia al modelo de usuarios (doctores)
        required: true
      },
      costo: {
        type: Number,
        min: 0, // No puede ser negativo
        default: 0
      },
      estado: {
        type: String,
        enum: ["Pendiente", "En proceso", "Finalizado"],
        default: "Pendiente"
      },
      notas: {
        type: String,
        trim: true
      }
    }
  ],
  // ── Campos de auditoría y estado (roles.MD §5) ──────────────
  estadoRegistro: {
    type: String,
    enum: ['BORRADOR', 'OFICIAL', 'ARCHIVADO'],
    default: 'OFICIAL'
  },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  modificadoEn: { type: Date, default: null },
  firmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  firmadoEn: { type: Date, default: null },
  contentHash: { type: String, default: null },
  firmaDesactualizada: { type: Boolean, default: false },
  integrityHash: { type: String, default: null },
  autorizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deleteReason: { type: String, default: null },
  capturaExtemporanea: {
    esExtemporanea: { type: Boolean, default: false },
    motivo: { type: String, default: null },
    fechaNota: { type: Date, default: null },
    fechaCaptura: { type: Date, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model('Tratamiento', treatmentSchema);
