const mongoose = require('mongoose');

const patientAttachmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  // Nombre tal como llegó del cliente. Se conserva para mostrar en UI;
  // el nombre guardado en disco es distinto (random) para evitar colisiones.
  originalName: { type: String, required: true, trim: true, maxlength: 255 },
  // Nombre real del archivo en disco, dentro de uploads/pacientes/{id}/adjuntos/
  filename: { type: String, required: true, trim: true },
  // URL relativa servida por el static middleware (/uploads/pacientes/.../...)
  url: { type: String, required: true, trim: true },
  mimeType: { type: String, required: true, trim: true },
  size: { type: Number, required: true, min: 0 },
  // Categoría libre (radiografia, receta, identificacion, otro). Opcional.
  categoria: { type: String, trim: true, default: 'otro', maxlength: 50 },
  descripcion: { type: String, trim: true, default: '', maxlength: 500 },
  subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  // Soft-delete: cascadeado al borrar paciente para alinearse con LFPDPPP
  // (derecho de cancelación). Antes los adjuntos quedaban activos y la
  // URL pública seguía sirviendo el archivo aunque el paciente estuviera
  // dado de baja.
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deleteReason: { type: String, default: null }
}, { timestamps: true });

patientAttachmentSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('PatientAttachment', patientAttachmentSchema);
