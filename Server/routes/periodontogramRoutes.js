const express = require('express');
const rateLimit = require('express-rate-limit');
const periodontogramController = require('../controllers/periodontogramController');
const PeriodontogramValidationMiddleware = require('../middlewares/periodontogramValidation');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');

// mergeParams: true permite acceder a req.params.id del padre (el id del paciente)
const router = express.Router({ mergeParams: true });

// helmet() ya se aplica a nivel de app — no duplicar en sub-router


// Bypass total en dev (StrictMode + hot-reload agotan el cap en minutos).
const skipInDev = (req) => process.env.NODE_ENV !== 'production';
const keyByIpAndUser = (req) => {
  const ip = req.ip;
  const userId = req.user?._id || req.user?.id || '';
  return `${ip}_${userId}`;
};

// Rate limiting para operaciones de escritura
const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    message: 'Demasiadas operaciones de escritura. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByIpAndUser,
  skip: (req) => req.method === 'GET' || skipInDev(req)
});

// Rate limiting para operaciones de lectura
const readRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: {
    success: false,
    message: 'Demasiadas consultas. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByIpAndUser,
  skip: (req) => req.method !== 'GET' || skipInDev(req)
});


// RUTAS PRINCIPALES
router.get('/', readRateLimit, authorize(['periodontogram.read']), periodontogramController.getPeriodontogram);

router.post('/', 
  writeRateLimit,
  requireClinicalRole,
  authorize(['periodontogram.create', 'periodontogram.write.draft']),
  PeriodontogramValidationMiddleware.validatePeriodontogramCreation(),
  PeriodontogramValidationMiddleware.checkValidationErrors(),
  periodontogramController.createInitialPeriodontogram
);

router.put('/', writeRateLimit, requireClinicalRole, authorize(['periodontogram.update', 'periodontogram.write.draft']), periodontogramController.updateFullPeriodontogram);

// Agregar endpoint para exponer los JSON Schemas del periodontograma
router.get('/schemas', readRateLimit, authorize(['periodontogram.read']), periodontogramController.getPeriodontogramSchemas);

// Agregar endpoints para manejo de datos JSON del periodontograma (/data)
router.put('/data', writeRateLimit, requireClinicalRole, authorize(['periodontogram.update', 'periodontogram.write.draft']), periodontogramController.savePeriodontogramData);
router.get('/data', readRateLimit, authorize(['periodontogram.read']), periodontogramController.getPeriodontogramData);

// Estadísticas del periodontograma (actual o por versión)
router.get('/statistics', readRateLimit, authorize(['periodontogram.read']), periodontogramController.getPeriodontogramStatistics);
router.get('/statistics/:version', readRateLimit, authorize(['periodontogram.read']), periodontogramController.getPeriodontogramStatistics);

router.get('/history', readRateLimit, authorize(['periodontogram.read']), periodontogramController.getPeriodontogramHistory);

// requireClinicalRole se agrega para alinear con POST/PUT — el resto de
// endpoints exigen rol clínico, no había razón para que DELETE fuera laxo.
router.delete('/', writeRateLimit, requireClinicalRole, authorize(['periodontogram.delete']), periodontogramController.deletePeriodontogram);

// Middleware de manejo de errores específico para periodontograma
router.use((error, req, res, _next) => {
  console.error('Periodontogram route error:', error);
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({ field: err.path, message: err.message }));
    return res.status(400).json({ success: false, message: 'Errores de validación', errors });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'ID de paciente inválido' });
  }
  return res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

module.exports = router;
