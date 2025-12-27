const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    paciente_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient', // 🔹 Relacionado con el paciente
        required: true
    },
    doctor_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor', // 🔹 Relacionado con el doctor que lo solicitó
        required: true
    },
    tipo_examen: {
        type: String,
        enum: ["Radiografía", "Tomografía", "Resonancia", "Ultrasonido", "Análisis de sangre", "Otro"],
        required: true
    },
    estado: {
        type: String,
        enum: ["Pendiente", "Realizado", "En revisión", "Entregado"],
        default: "Pendiente"
    },
    fecha_solicitud: {
        type: Date,
        default: Date.now
    },
    fecha_resultado: {
        type: Date
    },
    archivo: {
        type: String, // Ruta del archivo (ej: "/uploads/examen_1234.jpg")
        required: false
    },
    tipo_archivo: {
        type: String, 
        enum: ["JPG", "PNG", "PDF", "DICOM", "Otro"], 
        required: false
    },
    observaciones: {
        type: String, 
        required: false,
        trim: true // Elimina espacios innecesarios
    }
}, {
    timestamps: true // 🔹 Agrega `createdAt` y `updatedAt` automáticamente
});

// 🔹 Exportación correcta del modelo
module.exports = mongoose.model('Examen', examSchema);
