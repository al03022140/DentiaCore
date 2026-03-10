const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    paciente_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient', // 🔹 Relación con el paciente (nombre correcto del modelo)
        required: true
    },
    doctor_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario', // 🔹 Relación con el doctor que atiende
        required: true
    },
    fecha_hora: {
        type: Date,
        required: true,
        validate: {
            validator: function (value) {
                // Solo validar en documentos nuevos o cuando fecha_hora es modificada
                if (!this.isNew && !this.isModified('fecha_hora')) return true;
                return value > new Date();
            },
            message: "No se pueden programar citas en el pasado."
        }
    },
    estado: {
        type: String,
        enum: ["Pendiente", "Confirmada", "Cancelada", "Pasada"],
        default: "Pendiente"
    },
    motivo: {
        type: String,
        required: true,
        trim: true
    },
    observaciones: {
        type: String,
        trim: true
    },
    // ── Campos de auditoría (roles.MD §5) ──────────────────────
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoEn: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    deleteReason: { type: String, default: null }
}, {
    timestamps: true // 🔹 Agrega `createdAt` y `updatedAt` automáticamente
});

// 🔹 Middleware para actualizar automáticamente el estado de la cita si ya pasó
appointmentSchema.pre('save', function (next) {
    // No cambiar estado si se está eliminando (soft-delete)
    if (this.isModified('deletedAt') && this.deletedAt) return next();
    if (this.fecha_hora < new Date() && this.estado !== "Cancelada") {
        this.estado = "Pasada";
    }
    next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);
