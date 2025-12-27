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
        ref: 'Doctor', // Referencia al modelo de doctores
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
  ]
}, { timestamps: true });

module.exports = mongoose.model('Tratamiento', treatmentSchema);
