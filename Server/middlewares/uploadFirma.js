const multer = require('multer');
const fsExtra = require('fs-extra');
const { resolveUploadsPath } = require('../utils/uploads');

// M-6: la extensión almacenada se deriva del MIME validado, no del nombre
// que envía el cliente.
const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = resolveUploadsPath('firmas');
    try {
      fsExtra.ensureDirSync(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return cb(new Error('Usuario no autenticado'));
    const ext = MIME_TO_EXT[file.mimetype] || '.png';
    cb(null, `${userId}_firma_${Date.now()}${ext}`);
  }
});

const uploadFirma = multer({
  storage,
  limits: { fileSize: 500 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan imágenes PNG o JPG'));
    }
    cb(null, true);
  }
});

module.exports = uploadFirma;
