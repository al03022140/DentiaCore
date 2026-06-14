const multer = require('multer');
const fsExtra = require('fs-extra');
const { resolveUploadsPath } = require('../utils/uploads');

// M-6: la extensión almacenada se deriva del MIME validado, NO del nombre que
// envía el cliente (que podría ser .svg/.html/.php y habilitar XSS o ejecución).
const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = resolveUploadsPath('logos');
    try {
      fsExtra.ensureDirSync(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.png';
    cb(null, `clinic_logo_${Date.now()}${ext}`);
  }
});

const uploadLogo = multer({
  storage,
  limits: { fileSize: 1024 * 1024, files: 1 }, // 1MB
  fileFilter: (req, file, cb) => {
    // M-6: se elimina image/svg+xml — un SVG puede contener <script> y el logo
    // se renderiza en el navegador (XSS almacenado).
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan imágenes PNG o JPG'));
    }
    cb(null, true);
  }
});

// Sin este middleware, un logo demasiado grande o de tipo inválido cae al
// handler global (500 'Error interno del servidor'). Lo traducimos a un 413/400
// con mensaje accionable que el cliente ya sabe mostrar (err.response.data.message).
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'El logo supera el tamaño máximo permitido (1MB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Solo se permite subir un archivo a la vez' });
    }
    return res.status(400).json({ message: err.message || 'Error al subir el logo' });
  }
  if (err) {
    return res.status(400).json({ message: err.message || 'Solo se aceptan imágenes PNG o JPG' });
  }
  next();
};

uploadLogo.handleMulterError = handleMulterError;

module.exports = uploadLogo;
