const Exam = require('../models/exam.js');
const Patient = require('../models/patient.js');
const Doctor = require('../models/users.js');
const { hasPermission, getEffectivePermissions, isAdminRole } = require('../utils/permissions');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');

// 📌 Obtener todos los exámenes
exports.getAllExams = async (req, res) => {
    try {
        const exams = await Exam.find({ deletedAt: null }).populate('paciente_id', 'primer_nombre apellido_paterno apellido_materno')
                                       .populate('doctor_id', 'nombre email');
        if (!exams.length) return res.status(200).json([]);
        res.status(200).json(exams);
    } catch (_error) {
        res.status(500).json({ message: 'Error al obtener los exámenes' });
    }
};

// 📌 Obtener un examen por ID
exports.getExamById = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id)
            .populate('paciente_id', 'primer_nombre apellido_paterno apellido_materno')
            .populate('doctor_id', 'nombre email');
        
        if (!exam || exam.deletedAt) return res.status(404).json({ message: 'Examen no encontrado' });

        res.status(200).json(exam);
    } catch (_error) {
        res.status(500).json({ message: 'Error al obtener el examen' });
    }
};

// 📌 Obtener exámenes de un paciente específico
exports.getExamsByPatient = async (req, res) => {
    try {
        const { paciente_id } = req.params;

        // Buscar exámenes con el paciente_id y poblar información del doctor
        const exams = await Exam.find({ paciente_id, deletedAt: null })
            .populate('doctor_id', 'nombre email');

        if (!exams.length) {
            return res.status(404).json({ message: "No se encontraron exámenes para este paciente" });
        }

        res.status(200).json(exams);
    } catch (_error) {
        res.status(500).json({ message: 'Error al obtener los exámenes' });
    }
};


// 📌 Crear un nuevo examen
exports.createExam = async (req, res) => {
    try {

        // Verificar si el paciente y el doctor existen antes de crear el examen
        const paciente = await Patient.findById(req.body.paciente_id);
        if (!paciente) return res.status(404).json({ message: "Paciente no encontrado" });

        const doctor = await Doctor.findById(req.body.doctor_id);
        if (!doctor) return res.status(404).json({ message: "Doctor no encontrado" });

        // Determinar estadoRegistro según permisos del usuario (asistente → BORRADOR)
        const userPerms = getEffectivePermissions(req.user);
        let estadoRegistro = 'OFICIAL';
        if (!hasPermission(userPerms, ['exams.create']) && hasPermission(userPerms, ['exams.write.draft'])) {
            estadoRegistro = 'BORRADOR';
        }

        // Crear y guardar el examen (whitelist para prevenir inyección de deletedAt, modificadoPor, etc.)
        const { paciente_id, doctor_id, tipo_examen, observaciones, archivo, tipo_archivo, appointmentId } = req.body;
        // Valida pertenencia de la cita al paciente — evita cross-linking.
        const validatedAppointmentId = await resolvePatientAppointmentId(appointmentId, paciente_id);
        const newExam = new Exam({
            paciente_id,
            doctor_id,
            tipo_examen,
            observaciones,
            archivo,
            tipo_archivo,
            appointmentId: validatedAppointmentId,
            creadoPor: req.user?.id || null,
            estadoRegistro
        });

        // Inyectar captura extemporánea si fue detectada por el middleware
        if (req.body._capturaExtemporanea) {
            newExam.capturaExtemporanea = req.body._capturaExtemporanea;
        }

        await newExam.save();

        res.status(201).json({
            message: "Examen creado correctamente",
            exam: newExam
        });

    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ message: 'Error al crear el examen', error: error.message });
        }
        res.status(500).json({ message: 'Error interno al crear el examen' });
    }
};

// 📌 Actualizar un examen por ID
exports.updateExam = async (req, res) => {
    try {

        // Verificar si el examen existe y no está eliminado
        let exam = await Exam.findById(req.params.id);
        if (!exam || exam.deletedAt) return res.status(404).json({ message: "Examen no encontrado" });

        // NOM-024: Los registros firmados son inmutables — solo se permiten addenda
        if (exam.estadoRegistro === 'OFICIAL') {
            return res.status(403).json({ message: 'No se puede modificar un registro en estado OFICIAL. Use addendum para correcciones.' });
        }

        // BORRADOR only editable by creator, assigned doctor, or admin
        if (exam.estadoRegistro === 'BORRADOR' && !isAdminRole(req.user.role)) {
            const userId = req.user.id;
            const isCreator = exam.creadoPor && exam.creadoPor.toString() === userId;
            const isAssignedDoctor = exam.doctor_id && exam.doctor_id.toString() === userId;
            if (!isCreator && !isAssignedDoctor) {
                return res.status(403).json({ message: 'Solo el creador o el doctor asignado pueden modificar este borrador' });
            }
        }

        // Verificar si el paciente o doctor han sido modificados y existen
        if (req.body.paciente_id) {
            const paciente = await Patient.findById(req.body.paciente_id);
            if (!paciente) return res.status(404).json({ message: "Paciente no encontrado" });
        }

        if (req.body.doctor_id) {
            const doctor = await Doctor.findById(req.body.doctor_id);
            if (!doctor) return res.status(404).json({ message: "Doctor no encontrado" });
        }

        // Whitelist de campos permitidos para evitar inyección de campos internos
        const { paciente_id, doctor_id, tipo_examen, estado, observaciones, fecha_resultado, archivo, tipo_archivo, appointmentId } = req.body;
        const allowedFields = {};
        if (paciente_id !== undefined) allowedFields.paciente_id = paciente_id;
        if (doctor_id !== undefined) allowedFields.doctor_id = doctor_id;
        if (tipo_examen !== undefined) allowedFields.tipo_examen = tipo_examen;
        if (estado !== undefined) allowedFields.estado = estado;
        if (observaciones !== undefined) allowedFields.observaciones = observaciones;
        if (fecha_resultado !== undefined) allowedFields.fecha_resultado = fecha_resultado;
        if (archivo !== undefined) allowedFields.archivo = archivo;
        if (tipo_archivo !== undefined) allowedFields.tipo_archivo = tipo_archivo;
        if (appointmentId !== undefined) {
            // Valida pertenencia (descarta silenciosamente si no pertenece al paciente)
            const targetPaciente = paciente_id || exam.paciente_id;
            allowedFields.appointmentId = await resolvePatientAppointmentId(appointmentId, targetPaciente);
        }

        // Actualizar el examen
        exam = await Exam.findByIdAndUpdate(
            req.params.id,
            { $set: { ...allowedFields, modificadoPor: req.user?.id || null, modificadoEn: new Date() } },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: "Examen actualizado correctamente",
            exam
        });

    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ message: 'Error al actualizar el examen', error: error.message });
        }
        res.status(500).json({ message: 'Error interno al actualizar el examen' });
    }
};

// 📌 Eliminar un examen (soft delete)
exports.deleteExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Examen no encontrado' });

        // OFICIAL records cannot be deleted (NOM-024 immutability)
        if (exam.estadoRegistro === 'OFICIAL') {
            return res.status(403).json({ message: 'No se puede eliminar un registro en estado OFICIAL' });
        }

        // BORRADOR only deletable by creator, assigned doctor, or admin
        if (!isAdminRole(req.user.role)) {
            const userId = req.user.id;
            const isCreator = exam.creadoPor && exam.creadoPor.toString() === userId;
            const isAssignedDoctor = exam.doctor_id && exam.doctor_id.toString() === userId;
            if (!isCreator && !isAssignedDoctor) {
                return res.status(403).json({ message: 'Solo el creador o el doctor asignado pueden eliminar este borrador' });
            }
        }

        exam.deletedAt = new Date();
        exam.deletedBy = req.user?.id || null;
        exam.deleteReason = req.body?.motivo || 'Eliminado por usuario';
        await exam.save();

        res.status(200).json({ message: 'Examen eliminado correctamente' });
    } catch (_error) {
        res.status(500).json({ message: 'Error al eliminar el examen' });
    }
};
