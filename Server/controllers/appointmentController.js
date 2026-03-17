const Appointment = require('../models/appointment.js');
const PatientCharge = require('../models/patientCharge.js');
const mongoose = require('mongoose');

// 🔹 Obtener todas las citas
exports.getAllAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.find({ deletedAt: null }).populate('paciente_id doctor_id');
        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las citas', error: error.message });
    }
};

// 🔹 Obtener citas de hoy (para agenda y próximo paciente)
exports.getTodayAppointments = async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const appointments = await Appointment.find({
            deletedAt: null,
            fecha_hora: { $gte: startOfDay, $lte: endOfDay }
        })
            .populate('paciente_id', 'nombre apellidos foto fecha_nacimiento sexo')
            .populate('doctor_id', 'nombre apellidos')
            .sort({ fecha_hora: 1 });

        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las citas de hoy', error: error.message });
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
        const { paciente_id, doctor_id, fecha_hora, estado, motivo, observaciones, comentarioProcedimiento, items } = req.body;

        // Procesar items si vienen
        let processedItems = [];
        let totalEstimado = 0;
        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const cantidad = Number(item.cantidad);
                const precioUnitario = Number(item.precioUnitario);
                if (!item.nombre || !Number.isFinite(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
                    return res.status(400).json({ message: `Item inválido: ${item.nombre || 'sin nombre'}` });
                }
                const subtotal = cantidad * precioUnitario;
                processedItems.push({
                    nombre: String(item.nombre).trim(),
                    cantidad,
                    precioUnitario,
                    subtotal
                });
                totalEstimado += subtotal;
            }
        }

        const newAppointment = new Appointment({
            paciente_id,
            doctor_id,
            fecha_hora,
            estado,
            motivo,
            observaciones,
            comentarioProcedimiento,
            items: processedItems,
            totalEstimado,
            creadoPor: req.user?.id || null
        });
        await newAppointment.save();

        // Auto-crear cobro en caja si hay items
        if (processedItems.length > 0) {
            const charge = new PatientCharge({
                patientId: paciente_id,
                appointmentId: newAppointment._id,
                fecha: fecha_hora || new Date(),
                items: processedItems,
                total: totalEstimado,
                confirmado: false,
                creadoPor: req.user?.id || null
            });
            await charge.save();
        }

        const populated = await Appointment.findById(newAppointment._id)
            .populate('paciente_id', 'nombre apellidos foto fecha_nacimiento sexo')
            .populate('doctor_id', 'nombre apellidos');

        res.status(201).json({
            message: "Cita creada correctamente",
            appointment: populated
        });

    } catch (error) {
        res.status(400).json({ message: "Error al crear la cita", error: error.message });
    }
};

// 🔹 Actualizar una cita
exports.updateAppointment = async (req, res) => {
    try {
        // Whitelist de campos permitidos para evitar inyección de campos como deletedAt, creadoPor, etc.
        const { paciente_id, doctor_id, fecha_hora, estado, motivo, observaciones, comentarioProcedimiento, items } = req.body;
        const allowedFields = {};
        if (paciente_id !== undefined) allowedFields.paciente_id = paciente_id;
        if (doctor_id !== undefined) allowedFields.doctor_id = doctor_id;
        if (fecha_hora !== undefined) allowedFields.fecha_hora = fecha_hora;
        if (estado !== undefined) allowedFields.estado = estado;
        if (motivo !== undefined) allowedFields.motivo = motivo;
        if (observaciones !== undefined) allowedFields.observaciones = observaciones;
        if (comentarioProcedimiento !== undefined) allowedFields.comentarioProcedimiento = comentarioProcedimiento;

        // Procesar items si se envían
        if (Array.isArray(items)) {
            // Verificar si el cobro asociado ya fue confirmado
            const existingCharge = await PatientCharge.findOne({
                appointmentId: req.params.id,
                confirmado: true
            });
            if (existingCharge) {
                return res.status(400).json({ message: 'No se pueden modificar items de una cita con cobro confirmado' });
            }

            const processedItems = [];
            let totalEstimado = 0;
            for (const item of items) {
                const cantidad = Number(item.cantidad);
                const precioUnitario = Number(item.precioUnitario);
                if (!item.nombre || !Number.isFinite(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
                    return res.status(400).json({ message: `Item inválido: ${item.nombre || 'sin nombre'}` });
                }
                const subtotal = cantidad * precioUnitario;
                processedItems.push({ nombre: String(item.nombre).trim(), cantidad, precioUnitario, subtotal });
                totalEstimado += subtotal;
            }
            allowedFields.items = processedItems;
            allowedFields.totalEstimado = totalEstimado;

            // Actualizar cobro no confirmado si existe
            await PatientCharge.findOneAndUpdate(
                { appointmentId: req.params.id, confirmado: false },
                { $set: { items: processedItems, total: totalEstimado } }
            );
        }

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
