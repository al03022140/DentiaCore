const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const { resolveUploadsPath } = require('../utils/uploads');
const attachmentCtrl = require('../controllers/attachmentController');
const checkPatient = require('../middlewares/checkPatient');
const { authorize } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

const validateId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'ID de paciente inválido' }
    });
  }
  next();
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

const safeObjectIdString = (value) => {
  if (typeof value !== 'string') return null;
  return mongoose.Types.ObjectId.isValid(value) && /^[a-fA-F0-9]{24}$/.test(value)
    ? value
    : null;
};

const uploadAttachment = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const patientId = safeObjectIdString(req.params?.id);
        if (!patientId) {
          return cb(new Error('ID de paciente inválido'));
        }
        const dir = resolveUploadsPath('pacientes', patientId, 'adjuntos');
        fs.ensureDirSync(dir);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      // Sanitiza la extensión: solo conserva la del archivo original, en minúsculas.
      const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
      cb(null, `adjunto-${suffix}${ext}`);
    }
  }),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Tipo de archivo no permitido. Solo se aceptan PDF e imágenes (JPG, PNG, WEBP, GIF).');
      err.code = 'UNSUPPORTED_MEDIA_TYPE';
      cb(err);
    }
  }
});

const handleMulterError = (err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'El archivo excede el tamaño máximo (15MB)' });
    }
    return res.status(400).json({ message: 'Error al subir el archivo' });
  }
  if (err?.code === 'UNSUPPORTED_MEDIA_TYPE') {
    return res.status(415).json({ message: err.message });
  }
  return res.status(500).json({ message: err?.message || 'Error al subir el adjunto' });
};

router
  .route('/:id/attachments')
  .all(validateId, checkPatient)
  .get(
    readLimiter,
    authorize(['patients.read', 'patients.read.basic']),
    attachmentCtrl.listAttachments
  )
  .post(
    writeLimiter,
    authorize(['patients.update', 'patients.update.basic']),
    uploadAttachment.single('file'),
    handleMulterError,
    attachmentCtrl.createAttachment
  );

router
  .route('/:id/attachments/:attachmentId')
  .all(validateId, checkPatient)
  .delete(
    writeLimiter,
    authorize(['patients.update', 'patients.update.basic']),
    attachmentCtrl.deleteAttachment
  );

module.exports = router;
