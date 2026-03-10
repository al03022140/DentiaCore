const multer = require('multer');
const path = require('path');
const { v4: uuid } = require('uuid');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const patientId = req.params.id;
      const uploadDir = req.uploadDir || 'documentos';
  const patientFolder = resolveUploadsPath('pacientes', patientId, uploadDir);

  await ensureUploadsPath('pacientes', patientId, uploadDir);
      cb(null, patientFolder);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    // Sanitizar nombre de archivo
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Generar nombre único
    const uniqueName = `${name}_${uuid()}${ext}`;
    cb(null, uniqueName);
  }
});

// Configuración de filtros
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF, Word o Excel'), false);
  }
};

// Configuración de límites
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB
  files: 1
};

// Crear instancia de multer
const upload = multer({
  storage,
  fileFilter,
  limits
});

// Middleware para manejar errores específicos de multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'El archivo excede el tamaño máximo permitido (10MB)'
        }
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          message: 'Solo se permite subir un archivo a la vez'
        }
      });
    }
  }
  
  if (err?.message?.includes('Solo se permiten archivos')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: err.message
      }
    });
  }
  
  next(err);
};

module.exports = {
  upload,
  handleMulterError
}; 