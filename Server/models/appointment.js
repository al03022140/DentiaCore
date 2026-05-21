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

// Índice único parcial: previene crear dos citas activas para el mismo doctor
// en exactamente el mismo `fecha_hora`. Es defensa en profundidad — la
// detección de solapamiento sigue siendo a nivel app (no la cubre el índice
// porque MongoDB no tiene unique-overlap nativo). Si la app pierde el race
// TOCTOU entre validar conflicto y guardar, este índice atrapa al menos el
// caso de minuto-exacto y devuelve E11000 que el controller convierte a 409.
appointmentSchema.index(
    { doctor_id: 1, fecha_hora: 1 },
    {
        unique: true,
        partialFilterExpression: {
            deletedAt: null,
            estado: { $in: ['Pendiente', 'Confirmada', 'EnCurso'] }
        },
        name: 'doctor_slot_unique_active'
    }
);

// 🔹 Middleware para actualizar automáticamente el estado de la cita si ya pasó
appointmentSchema.pre('save', function (next) {
    // No cambiar estado si se está eliminando (soft-delete)
    if (this.isModified('deletedAt') && this.deletedAt) return next();
    const estadosVivos = ['Pendiente', 'Confirmada'];
    if (this.fecha_hora < new Date() && estadosVivos.includes(this.estado)) {
        const desde = this.estado;
        this.estado = 'Pasada';
        // Mantener la bitácora consistente: la auto-transición también deja
        // huella. Sin esto, `estadoHistorial` deja de reflejar todas las
        // transiciones (rompe reportes NOM-024).
        if (Array.isArray(this.estadoHistorial)) {
            this.estadoHistorial.push({
                desde,
                hacia: 'Pasada',
                cambiadoEn: new Date(),
                cambiadoPor: null,
                motivo: 'Auto-transición por fecha vencida (pre-save)'
            });
        }
    }
    next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);
