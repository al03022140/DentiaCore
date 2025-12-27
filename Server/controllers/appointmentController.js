const Appointment = require('../models/appointment.js');

// 🔹 Obtener todas las citas
exports.getAllAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.find().populate('paciente_id doctor_id');
        res.status(200).json(appointments);
    } catch (error) {
        console.error("❌ Error al obtener las citas:", error);
        res.status(500).json({ message: 'Error al obtener las citas', error: error.message });
    }
};

// 🔹 Obtener una cita por ID
exports.getAppointmentById = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id).populate('paciente_id doctor_id');
        if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });

        res.status(200).json(appointment);
    } catch (error) {
        console.error("❌ Error al obtener la cita:", error);
        res.status(500).json({ message: 'Error al obtener la cita', error: error.message });
    }
};

// 🔹 Crear una nueva cita
exports.createAppointment = async (req, res) => {
    try {
        const newAppointment = new Appointment(req.body);
        await newAppointment.save();

        res.status(201).json({
            message: "Cita creada correctamente",
            appointment: newAppointment
        });

    } catch (error) {
        console.error("❌ Error al crear la cita:", error);
        res.status(400).json({ message: "Error al crear la cita", error: error.message });
    }
};

// 🔹 Actualizar una cita
exports.updateAppointment = async (req, res) => {
    try {
        const updatedAppointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!updatedAppointment) {
            return res.status(404).json({ message: "Cita no encontrada" });
        }

        res.status(200).json({
            message: "Cita modificada correctamente",
            appointment: updatedAppointment
        });

    } catch (error) {
        console.error("❌ Error al actualizar la cita:", error);
        res.status(400).json({ message: "Error al actualizar la cita", error: error.message });
    }
};

// 🔹 Eliminar una cita
exports.deleteAppointment = async (req, res) => {
    try {
        const deletedAppointment = await Appointment.findByIdAndDelete(req.params.id);
        if (!deletedAppointment) return res.status(404).json({ message: 'Cita no encontrada' });

        res.status(200).json({ message: 'Cita eliminada correctamente' });
    } catch (error) {
        console.error("❌ Error al eliminar la cita:", error);
        res.status(500).json({ message: 'Error al eliminar la cita', error: error.message });
    }
};
