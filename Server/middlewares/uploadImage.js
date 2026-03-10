const multer = require('multer');
const path = require('path');
const fsExtra = require('fs-extra');
// Logger removido

const { resolveUploadsPath } = require('../utils/uploads');

// Errores personalizados
class FileTooLargeError extends Error {
    constructor(message = 'Archivo demasiado grande') {
        super(message);
        this.name = 'FileTooLargeError';
    }
}

class UnsupportedMediaTypeError extends Error {
    constructor(message = 'Tipo de archivo no soportado') {
        super(message);
        this.name = 'UnsupportedMediaTypeError';
    }
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 1) Obtén el ID desde params
    const patientId = req.params.id; // si tu parámetro se llama patientId usa req.params.patientId
    // Configurando directorio de destino
    
    if (!req.uploadDir) {
      console.error('[uploadImage] destination - ERROR: req.uploadDir is not set!');
      return cb(new Error('Upload directory not configured'));
    }
    
    if (!patientId) {
      console.error('[uploadImage] destination - ERROR: patientId is not set!');
      return cb(new Error('Patient ID not found'));
    }

    // Validar que patientId sea un ObjectId válido para prevenir path traversal
    if (!/^[a-f\d]{24}$/i.test(patientId)) {
      console.error('[uploadImage] destination - ERROR: patientId is not a valid ObjectId!');
      return cb(new Error('Patient ID inválido'));
    }

    // 2) Monta la carpeta correcta usando UPLOADS_DIR si está definido
  const uploadPath = resolveUploadsPath('pacientes', patientId, req.uploadDir);
    
    // Ruta de upload configurada
    
    try {
      fsExtra.ensureDirSync(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      console.error('[uploadImage] destination - Error preparing directory:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `odontograma_inicial_${Date.now()}${ext}`);
  }
});

// Configuración de Multer para odontogramas
const uploadMulter = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Información del archivo procesada
    
    // Validar tipo MIME - más flexible para archivos generados desde canvas
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      // Tipo MIME rechazado
      return cb(new UnsupportedMediaTypeError('Solo se aceptan imágenes PNG, JPEG o JPG'));
    }

    // Validar extensión - más flexible
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg'];
    if (!allowedExtensions.includes(ext)) {
      // Extensión rechazada
      return cb(new UnsupportedMediaTypeError('El archivo debe tener extensión .png, .jpg o .jpeg'));
    }

    // Archivo aceptado
    cb(null, true);
  }
});

// Configuración para PNG de odontograma inicial
const uploadPng = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPngMime = file.mimetype === 'image/png';
    const ext = path.extname(file.originalname).toLowerCase();
    const isPngExt = ext === '.png';
    if (!isPngMime || !isPngExt) {
      return cb(new UnsupportedMediaTypeError('Solo se acepta imagen PNG (.png)'));
    }
    cb(null, true);
  }
});

// Configuración específica para periodontograma (memoria)
// Usa memoryStorage para mantener archivos en memoria como buffers
const uploadPeriodontogram = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Información del archivo procesada
    
    // Validar tipo MIME - más flexible para archivos generados desde canvas
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      // Tipo MIME rechazado
      return cb(new UnsupportedMediaTypeError('Solo se aceptan imágenes PNG, JPEG o JPG'));
    }

    // Validar extensión - más flexible
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg'];
    if (!allowedExtensions.includes(ext)) {
      // Extensión rechazada
      return cb(new UnsupportedMediaTypeError('El archivo debe tener extensión .png, .jpg o .jpeg'));
    }

    // Archivo aceptado
    cb(null, true);
  }
});

// Configuración específica para endpoint atómico (2 archivos)
// Usa memoryStorage para mantener archivos en memoria como buffers
const uploadAtomic = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB por archivo
    files: 2 // Permitir 2 archivos para superior e inferior
  },
  fileFilter: (req, file, cb) => {
    // Información del archivo procesada
    
    // Validar tipo MIME - más flexible para archivos generados desde canvas
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      // Tipo MIME rechazado
      return cb(new UnsupportedMediaTypeError('Solo se aceptan imágenes PNG, JPEG o JPG'));
    }

    // Validar extensión - más flexible
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg'];
    if (!allowedExtensions.includes(ext)) {
      // Extensión rechazada
      return cb(new UnsupportedMediaTypeError('El archivo debe tener extensión .png, .jpg o .jpeg'));
    }

    // Archivo aceptado
    cb(null, true);
  }
});

// Middleware para manejar errores de Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new FileTooLargeError());
    }
    return next(err);
  }
  if (err instanceof UnsupportedMediaTypeError) {
    return next(err);
  }
  next(err);
};

// Middleware de error para limpiar archivos temporales cuando falla un paso posterior.
// Usa la firma de 4 argumentos de Express para interceptar errores.
const cleanupOnError = (err, req, res, next) => {
  if (err && req.file && req.file.path) {
    fsExtra.remove(req.file.path).catch((cleanupError) => {
      console.error('❌ Error al limpiar archivo temporal:', {
        originalError: err,
        cleanupError,
        file: req.file.path
      });
    });
  }
  next(err);
};

module.exports = {
  uploadMulter,
  uploadPng,
  uploadPeriodontogram,
  uploadAtomic,
  handleMulterError,
  cleanupOnError,
  FileTooLargeError,
  UnsupportedMediaTypeError
};