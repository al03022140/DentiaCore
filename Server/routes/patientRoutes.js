const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const periodontogramRoutes = require('./periodontogramRoutes');
const { getUploadsBase, resolveUploadsPath } = require('../utils/uploads');
const uploadsBase = getUploadsBase();

const resolveUploadTarget = (req) => {
  if (req.params?.id) {
    req.uploadTargetId = req.params.id;
    return req.uploadTargetId;
  }

  if (req.body) {
    const { patientId, _id, paciente_id } = req.body;
    if (patientId) {
      req.uploadTargetId = patientId;
      return req.uploadTargetId;
    }
    if (_id) {
      req.uploadTargetId = _id;
      return req.uploadTargetId;
    }
    if (paciente_id) {
      req.uploadTargetId = paciente_id;
      return req.uploadTargetId;
    }
  }

  if (!req.generatedPatientId) {
    req.generatedPatientId = new mongoose.Types.ObjectId().toString();
    if (!req.body) {
      req.body = {};
    }
    req.body._id = req.generatedPatientId;
  }

  req.uploadTargetId = req.generatedPatientId;
  return req.uploadTargetId;
};
const {
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError
} = require('../helpers/odontograma');
const {
  verificarOdontogramaInicial,
  guardarOdontogramaInicial,
  obtenerHistorialInicial,
  agregarHistorialInicial,
  manejarError,
  getClinicalHistory,
  saveClinicalHistoryEntries,
  deleteClinicalHistoryEntry,
  getOdontogramaById
} = require('../controllers/odontogramaController');
const patientCtrl = require('../controllers/patientsController');
const checkPatient = require('../middlewares/checkPatient');

// Middleware de validación de ID
const validateId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ 
      success: false, 
      error: { 
        code: 'INVALID_ID', 
        message: 'ID de paciente inválido' 
      } 
    });
  }
  next();
};

// Configuración de Multer para fotos de pacientes
const uploadFoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const targetId = resolveUploadTarget(req);
  const dir = resolveUploadsPath('pacientes', targetId, 'profile-pic');
  fs.ensureDirSync(dir);
        cb(null, dir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `foto-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const tipos = ['image/jpeg', 'image/png'];
    if (tipos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new UnsupportedMediaTypeError('Solo se aceptan imágenes JPG o PNG'));
    }
  }
});



// Middleware para manejar errores de Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'El archivo excede el tamaño máximo permitido (5MB)'
        }
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Error al subir el archivo'
      }
    });
  }
  
  // Manejar errores personalizados
  if (err instanceof UnsupportedMediaTypeError) {
    return res.status(415).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: err.message
      }
    });
  }
  
  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message
      }
    });
  }
  
  if (err instanceof FileTooLargeError) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: err.message
      }
    });
  }
  
  // Fallback: errores genéricos del storage (fs, path, permisos, etc.)
  return res.status(503).json({
    success: false,
    error: {
      code: 'UPLOAD_ERROR',
      message: 'Error al subir el archivo (almacenamiento)',
      details: err?.message || String(err)
    }
  });
};

// ── Rutas básicas de pacientes ───────────────────────────────────
router
  .route('/')
  .get(patientCtrl.getAllPatients)
  .post(uploadFoto.single('foto'), handleMulterError, patientCtrl.createPatient)
  .delete(patientCtrl.deleteAllPatients);

router.post('/batch', uploadFoto.array('fotos', 10), handleMulterError, patientCtrl.createPatients);

// ── Rutas de paciente específico ─────────────────────────────────
router
  .route('/:id')
  .all(validateId)
  .get(patientCtrl.getPatientById)
  .put(uploadFoto.single('foto'), handleMulterError, patientCtrl.updatePatient)
  .delete(patientCtrl.deletePatient);

/**
 * @swagger
 * components:
 *   schemas:
 *     OdontogramaEntry:
 *       type: object
 *       required:
 *         - tooth
 *         - condition
 *       properties:
 *         tooth:
 *           type: string
 *           description: Número del diente (ej. "11", "21", etc.)
 *         condition:
 *           type: string
 *           description: Código de condición del diente
 *         notes:
 *           type: string
 *           description: Notas adicionales sobre el diente
 *         date:
 *           type: string
 *           format: date-time
 *           description: Fecha de la entrada
 *     OdontogramaMetadata:
 *       type: object
 *       properties:
 *         originalName:
 *           type: string
 *         size:
 *           type: number
 *         mimeType:
 *           type: string
 *         uploadedAt:
 *           type: string
 *           format: date-time
 *     Odontograma:
 *       type: object
 *       required:
 *         - patientId
 *         - type
 *         - imageUrl
 *         - entries
 *       properties:
 *         patientId:
 *           type: string
 *           format: objectId
 *         type:
 *           type: string
 *           enum: [initial, follow-up]
 *         imageUrl:
 *           type: string
 *         entries:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OdontogramaEntry'
 *         metadata:
 *           $ref: '#/components/schemas/OdontogramaMetadata'
 */

/**
 * @swagger
 * /api/patients/{id}/odontograma-inicial:
 *   get:
 *     summary: Verifica si existe un odontograma inicial
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del paciente
 *     responses:
 *       200:
 *         description: Estado del odontograma inicial
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 exists:
 *                   type: boolean
 *                 imageUrl:
 *                   type: string
 *                 entries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OdontogramaEntry'
 *                 metadata:
 *                   $ref: '#/components/schemas/OdontogramaMetadata'
 *   post:
 *     summary: Sube un odontograma inicial
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del paciente
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               odontograma:
 *                 type: string
 *                 format: binary
 *                 description: Imagen PNG del odontograma
 *               entries:
 *                 type: string
 *                 description: JSON string con las entradas del odontograma
 *     responses:
 *       201:
 *         description: Odontograma creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Odontograma'
 *       413:
 *         description: Archivo demasiado grande
 *       415:
 *         description: Tipo de archivo no soportado
 */
router
  .route('/:id/odontograma-inicial')
  .all(validateId, checkPatient)
  .get(verificarOdontogramaInicial);


// Endpoint para servir la imagen del odontograma inicial
router
  .route('/:id/odontograma-inicial/image')
  .all(validateId, checkPatient)
  .get(async (req, res, next) => {
    try {
      const patientId = req.params.id;
      const OdontogramaModel = require('../models/odontograma');
      
      // Buscar el odontograma inicial del paciente
      const odontograma = await OdontogramaModel.findOne({
        patientId: patientId,
        type: 'initial'
      });
      
      if (!odontograma || !odontograma.current || !odontograma.current.imageUrl) {
        return res.status(404).json({
          success: false,
          error: { code: 'IMAGE_NOT_FOUND', message: 'Imagen del odontograma inicial no encontrada' }
        });
      }
      
      // Construir la ruta del archivo
  const imageUrl = odontograma.current.imageUrl;
      // Remover el prefijo '/uploads' de la URL para obtener la ruta relativa
      const relativePath = imageUrl.replace(/^\/uploads\//, '');
      const imagePath = path.join(uploadsBase, relativePath);
      
      // Verificar que el archivo existe
      const exists = await fs.pathExists(imagePath);
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'Archivo de imagen no encontrado en el sistema' }
        });
      }
      
      // Servir el archivo
      res.sendFile(imagePath);
      
    } catch (error) {
      console.error('Error sirviendo imagen del odontograma inicial:', error);
      next(error);
    }
  });

/**
 * @swagger
 * /api/patients/{id}/odontograma-inicial/history:
 *   get:
 *     summary: Obtiene el historial del odontograma inicial
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del paciente
 *     responses:
 *       200:
 *         description: Historial del odontograma inicial
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Odontograma'
 *   post:
 *     summary: Añade una entrada al historial del odontograma inicial
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del paciente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entries:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OdontogramaEntry'
 *     responses:
 *       201:
 *         description: Entrada añadida al historial
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Odontograma'
 */
router
  .route('/:id/odontograma-inicial/history')
  .all(validateId, checkPatient)
  .get(obtenerHistorialInicial)
  .post(agregarHistorialInicial);

// ── Anidar rutas de odontograma ────────────────────────
const odontogramaRoutes = require('./odontogramaRoutes');
router.use('/:id', validateId, odontogramaRoutes);

// ── Rutas para planes de tratamiento ───────────────────────
router
  .route('/:id/treatment-plan')
  .all(validateId, checkPatient)
  .post(patientCtrl.addTreatmentPlan);

router
  .route('/:id/evolution-note')
  .all(validateId, checkPatient)
  .post(patientCtrl.addEvolutionNote);

// ── Anidar rutas de periodontograma ────────────────────────
router.use('/:id/periodontogram', validateId, checkPatient, periodontogramRoutes);

// ── Manejo de errores centralizado ─────────────────────────
router.use(manejarError);

module.exports = router;
    