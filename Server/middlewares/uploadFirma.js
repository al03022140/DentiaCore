const crypto = require('crypto');
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
    // SEC-03: sufijo aleatorio para que el nombre no sea adivinable a partir
    // del userId + timestamp (defensa en profundidad; el gate real es que
    // /uploads/firmas ahora exige rol clínico en uploadsAuth).
    const rand = crypto.randomBytes(6).toString('hex');
    cb(null, `${userId}_firma_${Date.now()}_${rand}${ext}`);
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

// La firma es legalmente relevante (NOM-004 / firma con PIN): un archivo
// demasiado grande o de tipo inválido debe devolver un error claro (413/400)
// en vez de caer al handler global (500 'Error interno del servidor').
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'La firma supera el tamaño máximo permitido (500 KB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Solo se permite subir un archivo a la vez' });
    }
    return res.status(400).json({ message: err.message || 'Error al subir la firma' });
  }
  if (err) {
    return res.status(400).json({ message: err.message || 'Solo se aceptan imágenes PNG o JPG' });
  }
  next();
};

uploadFirma.handleMulterError = handleMulterError;

module.exports = uploadFirma;
