const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const periodontogramController = require('../controllers/periodontogramController');
const PeriodontogramValidationMiddleware = require('../middlewares/periodontogramValidation');

// mergeParams: true permite acceder a req.params.id del padre (el id del paciente)
const router = express.Router({ mergeParams: true });

// Middleware de seguridad
router.use(helmet());

// Middleware temporal para simular usuario autenticado
router.use((req, res, next) => {
  const mongoose = require('mongoose');
  req.user = {
    id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    role: 'dentist',
    permissions: [
      'read_periodontogram',
      'create_periodontogram',
      'update_periodontogram',
      'delete_periodontogram'
    ]
  };
  next();
});

// Rate limiting para operaciones de escritura
const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: 'Demasiadas operaciones de escritura. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET'
});

// Rate limiting para operaciones de lectura
const readRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: 'Demasiadas consultas. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'GET'
});

// Middleware de autorización para verificar permisos
const authorize = (permissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    if (permissions.length > 0) {
      const userPermissions = req.user.permissions || [];
      const hasPermission = permissions.some(permission => 
        userPermissions.includes(permission) || req.user.role === 'admin'
      );
      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Permisos insuficientes para esta operación' });
      }
    }
    next();
  };
};

// RUTAS PRINCIPALES
router.get('/', readRateLimit, periodontogramController.getPeriodontogram);

router.post('/', 
  (req, res, next) => {
    console.log('🔍 DEBUG: POST periodontogram route reached');
    console.log('  - req.params:', req.params);
    console.log('  - req.body:', req.body);
    console.log('  - req.url:', req.url);
    console.log('  - req.originalUrl:', req.originalUrl);
    next();
  },
  writeRateLimit,
  PeriodontogramValidationMiddleware.validatePeriodontogramCreation(),
  PeriodontogramValidationMiddleware.checkValidationErrors(),
  periodontogramController.createInitialPeriodontogram
);

router.put('/', writeRateLimit, periodontogramController.updateFullPeriodontogram);

// Agregar endpoint para exponer los JSON Schemas del periodontograma
router.get('/schemas', readRateLimit, authorize(['read_periodontogram']), periodontogramController.getPeriodontogramSchemas);

// Agregar endpoints para manejo de datos JSON del periodontograma (/data)
router.put('/data', writeRateLimit, periodontogramController.savePeriodontogramData);
router.get('/data', readRateLimit, periodontogramController.getPeriodontogramData);

// Estadísticas del periodontograma (actual o por versión)
router.get('/statistics', readRateLimit, periodontogramController.getPeriodontogramStatistics);
router.get('/statistics/:version', readRateLimit, periodontogramController.getPeriodontogramStatistics);

router.get('/history', readRateLimit, periodontogramController.getPeriodontogramHistory);

router.delete('/', writeRateLimit, periodontogramController.deletePeriodontogram);

// Middleware de manejo de errores específico para periodontograma
router.use((error, req, res, next) => {
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
