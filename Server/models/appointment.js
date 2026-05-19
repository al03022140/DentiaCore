const mongoose = require('mongoose');

// Bitácora de cambios de estado de la cita.
// Cada transición empuja una entrada con quién/cuándo/por qué.
const estadoHistorialSchema = new mongoose.Schema({
    desde: { type: String, default: null },
    hacia: { type: String, required: true },
    cambiadoEn: { type: Date, default: Date.now, required: true },
    cambiadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    motivo: { type: String, default: null, trim: true }
}, { _id: true });

const appointmentSchema = new mongoose.Schema({
    paciente_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true,
        index: true
    },
    doctor_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
        index: true
    },
    fecha_hora: {
        type: Date,
        required: true,
        index: true
    },
    // Duración en minutos — fallback al default de clinicSettings si no se setea.
    duracion: {
        type: Number,
        min: 5,
        max: 480,
        default: 30
    },
    estado: {
        type: String,
        enum: ["Pendiente", "Confirmada", "EnCurso", "Pasada", "NoShow", "Cancelada"],
        default: "Pendiente",
        index: true
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
    // ── Integración Google Calendar ────────────────────────────
    googleEventId: { type: String, default: null, index: true },
    googleCalendarId: { type: String, default: null },
    // ── Bitácora de estado ─────────────────────────────────────
    estadoHistorial: { type: [estadoHistorialSchema], default: [] },
    // ── Campos de auditoría (roles.MD §5) ──────────────────────
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoEn: { type: Date, default: null },
    integrityHash: { type: String, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    deleteReason: { type: String, default: null }
}, {
    timestamps: true
});

// Índice compuesto para detección de conflictos: doctor + ventana de tiempo
appointmentSchema.index({ doctor_id: 1, fecha_hora: 1, deletedAt: 1 });

// 🔹 Middleware para actualizar automáticamente el estado de la cita si ya pasó
appointmentSchema.pre('save', function (next) {
    // No cambiar estado si se está eliminando (soft-delete)
    if (this.isModified('deletedAt') && this.deletedAt) return next();
    const estadosVivos = ['Pendiente', 'Confirmada'];
    if (this.fecha_hora < new Date() && estadosVivos.includes(this.estado)) {
        this.estado = 'Pasada';
    }
    next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);
