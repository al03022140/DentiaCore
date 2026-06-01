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

module.exports = uploadLogo;
