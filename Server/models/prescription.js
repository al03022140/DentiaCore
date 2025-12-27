const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  paciente_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Paciente', // Referencia al modelo de pacientes
    required: true
  },
  doctor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor', // Referencia al modelo de doctores
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
  }
}, { timestamps: true });

module.exports = mongoose.model('Receta', prescriptionSchema);
