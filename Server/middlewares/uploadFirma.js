const multer = require('multer');
const path = require('path');
const fsExtra = require('fs-extra');
const { resolveUploadsPath } = require('../utils/uploads');

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
    const ext = path.extname(file.originalname).toLowerCase();
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
