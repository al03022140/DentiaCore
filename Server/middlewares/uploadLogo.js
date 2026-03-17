const multer = require('multer');
const path = require('path');
const fsExtra = require('fs-extra');
const { resolveUploadsPath } = require('../utils/uploads');

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
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `clinic_logo_${Date.now()}${ext}`);
  }
});

const uploadLogo = multer({
  storage,
  limits: { fileSize: 1024 * 1024, files: 1 }, // 1MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan imágenes PNG, JPG o SVG'));
    }
    cb(null, true);
  }
});

module.exports = uploadLogo;
