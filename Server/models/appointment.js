const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    paciente_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient', // 🔹 Relación con el paciente (nombre correcto del modelo)
        required: true
    },
    doctor_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor', // 🔹 Relación con el doctor que atiende
        required: true
    },
    fecha_hora: {
        type: Date,
        required: true,
        validate: {
            validator: function (value) {
                return value > new Date(); // Evita citas en el pasado
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
    }
}, {
    timestamps: true // 🔹 Agrega `createdAt` y `updatedAt` automáticamente
});

// 🔹 Middleware para actualizar automáticamente el estado de la cita si ya pasó
appointmentSchema.pre('save', function (next) {
    if (this.fecha_hora < new Date() && this.estado !== "Cancelada") {
        this.estado = "Pasada"; // Cambia automáticamente a "Pasada" si la fecha es anterior a hoy
    }
    next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);
