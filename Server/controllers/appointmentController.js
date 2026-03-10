const Appointment = require('../models/appointment.js');

// 🔹 Obtener todas las citas
exports.getAllAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.find({ deletedAt: null }).populate('paciente_id doctor_id');
        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las citas', error: error.message });
    }
};

// 🔹 Obtener una cita por ID
exports.getAppointmentById = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id).populate('paciente_id doctor_id');
        if (!appointment || appointment.deletedAt) return res.status(404).json({ message: 'Cita no encontrada' });

        res.status(200).json(appointment);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener la cita', error: error.message });
    }
};

// 🔹 Crear una nueva cita
exports.createAppointment = async (req, res) => {
    try {
        const newAppointment = new Appointment({
            ...req.body,
            creadoPor: req.user?.id || null
        });
        await newAppointment.save();

        res.status(201).json({
            message: "Cita creada correctamente",
            appointment: newAppointment
        });

    } catch (error) {
        res.status(400).json({ message: "Error al crear la cita", error: error.message });
    }
};

// 🔹 Actualizar una cita
exports.updateAppointment = async (req, res) => {
    try {
        // Whitelist de campos permitidos para evitar inyección de campos como deletedAt, creadoPor, etc.
        const { paciente_id, doctor_id, fecha_hora, estado, motivo, observaciones } = req.body;
        const allowedFields = {};
        if (paciente_id !== undefined) allowedFields.paciente_id = paciente_id;
        if (doctor_id !== undefined) allowedFields.doctor_id = doctor_id;
        if (fecha_hora !== undefined) allowedFields.fecha_hora = fecha_hora;
        if (estado !== undefined) allowedFields.estado = estado;
        if (motivo !== undefined) allowedFields.motivo = motivo;
        if (observaciones !== undefined) allowedFields.observaciones = observaciones;

        const updatedAppointment = await Appointment.findOneAndUpdate(
            { _id: req.params.id, deletedAt: null },
            { $set: { ...allowedFields, modificadoPor: req.user?.id || null, modificadoEn: new Date() } },
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
        res.status(400).json({ message: "Error al actualizar la cita", error: error.message });
    }
};

// 🔹 Eliminar una cita (soft delete)
exports.deleteAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });

        appointment.deletedAt = new Date();
        appointment.deletedBy = req.user?.id || null;
        appointment.deleteReason = req.body?.motivo || 'Eliminada por usuario';
        await appointment.save({ validateModifiedOnly: true });

        res.status(200).json({ message: 'Cita eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar la cita', error: error.message });
    }
};
