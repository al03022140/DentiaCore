const multer = require('multer');
const path = require('path');
const fsExtra = require('fs-extra');
// Logger removido

const { getUploadsBase, resolveUploadsPath } = require('../utils/uploads');

// Añadir base de uploads configurable por entorno
const uploadsBase = getUploadsBase();

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
    
    // 2) Monta la carpeta correcta usando UPLOADS_DIR si está definido
  const uploadPath = resolveUploadsPath(patientId, req.uploadDir);
    
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

// Middleware para limpiar archivos temporales en caso de error
const cleanupOnError = async (req, res, next) => {
  // Guardamos una referencia al archivo subido
  const uploadedFile = req.file;
  
  // Envolvemos el siguiente middleware en un try-catch
  try {
    // Llamamos al siguiente middleware
    await new Promise((resolve, reject) => {
      const nextHandler = next();
      if (nextHandler instanceof Promise) {
        nextHandler.then(resolve).catch(reject);
      } else {
        resolve();
      }
    });
  } catch (error) {
    // Si hay error y existe un archivo subido, lo eliminamos
    if (uploadedFile && uploadedFile.path) {
      try {
        await fsExtra.remove(uploadedFile.path);
        // Archivo temporal eliminado
      } catch (cleanupError) {
        console.error('❌ Error al limpiar archivo temporal:', {
          originalError: error,
          cleanupError,
          file: uploadedFile.path
        });
      }
    }
    // Propagamos el error original
    next(error);
  }
};

// Utilidad para obtener la extensión del archivo
const getExtension = (filename) => {
  const ext = filename.split('.').pop();
  return ext ? `.${ext}` : '';
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