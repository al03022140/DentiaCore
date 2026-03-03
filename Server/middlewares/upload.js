const multer = require('multer');
const path = require('path');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');

/** 🔹 Configurar almacenamiento dinámico con `multer` */
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const patientId = req.body.paciente_id || req.params.id; // Obtener el ID del paciente

        if (!patientId) {
            return cb(new Error("No se proporcionó `paciente_id` en la solicitud"));
        }

        // Validar que patientId sea un ObjectId válido para prevenir path traversal
        if (!/^[a-f\d]{24}$/i.test(patientId)) {
            return cb(new Error("ID de paciente inválido"));
        }

        // 📂 Crear carpeta dinámica para el paciente
        const patientFolder = resolveUploadsPath('pacientes', patientId);
        try {
            await ensureUploadsPath('pacientes', patientId); // Crea la carpeta si no existe
            cb(null, patientFolder);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExt}`;
        cb(null, fileName);
    }
});

/** 🔹 Configuración de `multer` */
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 📌 Limitar tamaño de archivo a 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Formato de archivo no permitido"));
        }
    }
});

module.exports = upload;
