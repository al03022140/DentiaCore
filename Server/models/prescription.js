const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  paciente_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient', // Referencia al modelo de pacientes
    required: true
  },
  doctor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario', // Referencia al modelo de usuarios (doctores)
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now // Fecha automática al crear la receta
  },
  medicamentos: [
    {
      nombre: {
        type: String,
        required: true,
        trim: true
      },
      dosis: {
        type: String,
        required: true,
        trim: true
      },
      instrucciones: {
        type: String,
        trim: true
      }
    }
  ],
  estado: {
    type: String,
    enum: ["Pendiente", "Entregado", "Cancelado"],
    default: "Pendiente"
  },
  notas: {
    type: String,
    trim: true
  },
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

module.exports = mongoose.model('Receta', prescriptionSchema);
