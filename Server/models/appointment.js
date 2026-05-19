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
        required: true
        // NOTA: la validación "no en el pasado" se hace explícitamente en
        // createAppointment. Aquí no se valida porque `findOneAndUpdate` con
        // `runValidators: true` ejecuta el validator con `this` = query, no
        // documento, y bloquearía updates legítimos a citas pasadas
        // (p. ej. marcar como "Cancelada" o "Pasada").
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
    // ── Procedimiento y cobro ──────────────────────────────────
    comentarioProcedimiento: {
        type: String,
        trim: true
    },
    items: [{
        nombre: { type: String, required: true, trim: true },
        cantidad: { type: Number, required: true, min: 1 },
        precioUnitario: { type: Number, required: true, min: 0 },
        subtotal: { type: Number, required: true, min: 0 }
    }],
    totalEstimado: {
        type: Number,
        default: 0,
        min: 0
    },
    // ── Campos de auditoría (roles.MD §5) ──────────────────────
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoEn: { type: Date, default: null },
    integrityHash: { type: String, default: null },
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
