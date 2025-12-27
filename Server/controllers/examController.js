const Exam = require('../models/exam.js');
const Patient = require('../models/patient.js');
const Doctor = require('../models/users.js'); // Suponiendo que los doctores están en el modelo 'users'

// 📌 Obtener todos los exámenes
exports.getAllExams = async (req, res) => {
    try {
        console.log("📡 Solicitando todos los exámenes...");
        const exams = await Exam.find().populate('paciente_id', 'nombre apellido_paterno apellido_materno')
                                       .populate('doctor_id', 'nombre email');
        if (!exams.length) console.log("⚠️ No hay exámenes en la base de datos.");
        res.status(200).json(exams);
    } catch (error) {
        console.error("❌ Error al obtener los exámenes:", error);
        res.status(500).json({ message: 'Error al obtener los exámenes', error });
    }
};

// 📌 Obtener un examen por ID
exports.getExamById = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id)
            .populate('paciente_id', 'nombre apellido_paterno apellido_materno')
            .populate('doctor_id', 'nombre email');
        
        if (!exam) return res.status(404).json({ message: 'Examen no encontrado' });

        res.status(200).json(exam);
    } catch (error) {
        console.error("❌ Error al obtener el examen:", error);
        res.status(500).json({ message: 'Error al obtener el examen', error });
    }
};

// 📌 Obtener exámenes de un paciente específico
exports.getExamsByPatient = async (req, res) => {
    try {
        const { paciente_id } = req.params;

        console.log(`📡 Buscando exámenes del paciente con ID: ${paciente_id}`);

        // Buscar exámenes con el paciente_id y poblar información del doctor
        const exams = await Exam.find({ paciente_id })
            .populate('doctor_id', 'nombre email');

        if (!exams.length) {
            return res.status(404).json({ message: "No se encontraron exámenes para este paciente" });
        }

        res.status(200).json(exams);
    } catch (error) {
        console.error("❌ Error al obtener los exámenes del paciente:", error);
        res.status(500).json({ message: 'Error al obtener los exámenes', error });
    }
};


// 📌 Crear un nuevo examen
exports.createExam = async (req, res) => {
    try {
        console.log("📥 Recibiendo datos para crear un examen:", req.body);

        // Verificar si el paciente y el doctor existen antes de crear el examen
        const paciente = await Patient.findById(req.body.paciente_id);
        if (!paciente) return res.status(404).json({ message: "Paciente no encontrado" });

        const doctor = await Doctor.findById(req.body.doctor_id);
        if (!doctor) return res.status(404).json({ message: "Doctor no encontrado" });

        // Crear y guardar el examen
        const newExam = new Exam(req.body);
        await newExam.save();

        res.status(201).json({
            message: "Examen creado correctamente",
            exam: newExam
        });

    } catch (error) {
        console.error("❌ Error al crear el examen:", error);
        res.status(400).json({ message: "Error al crear el examen", error });
    }
};

// 📌 Actualizar un examen por ID
exports.updateExam = async (req, res) => {
    try {
        console.log("🔄 Actualizando examen:", req.body);

        // Verificar si el examen existe
        let exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Examen no encontrado" });

        // Verificar si el paciente o doctor han sido modificados y existen
        if (req.body.paciente_id) {
            const paciente = await Patient.findById(req.body.paciente_id);
            if (!paciente) return res.status(404).json({ message: "Paciente no encontrado" });
        }

        if (req.body.doctor_id) {
            const doctor = await Doctor.findById(req.body.doctor_id);
            if (!doctor) return res.status(404).json({ message: "Doctor no encontrado" });
        }

        // Actualizar el examen
        exam = await Exam.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: "Examen actualizado correctamente",
            exam
        });

    } catch (error) {
        console.error("❌ Error al actualizar el examen:", error);
        res.status(400).json({ message: "Error al actualizar el examen", error });
    }
};

// 📌 Eliminar un examen
exports.deleteExam = async (req, res) => {
    try {
        const deletedExam = await Exam.findByIdAndDelete(req.params.id);
        if (!deletedExam) return res.status(404).json({ message: 'Examen no encontrado' });

        res.status(200).json({ message: 'Examen eliminado correctamente' });
    } catch (error) {
        console.error("❌ Error al eliminar el examen:", error);
        res.status(500).json({ message: 'Error al eliminar el examen', error });
    }
};
