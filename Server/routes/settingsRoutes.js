const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const settingsController = require('../controllers/settingsController');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
const uploadFirma = require('../middlewares/uploadFirma');
const uploadLogo = require('../middlewares/uploadLogo');
const ClinicSettings = require('../models/clinicSettings');

const router = express.Router();

const sensitiveActionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 'Demasiadas solicitudes. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const withValidation = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }
    next();
  }
];

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const settingsValidationRules = [
  body('clinicName').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('address').optional().isString().trim().isLength({ max: 300 }),
  body('phone').optional().isString().trim().isLength({ max: 40 }),
  body('inactivityTimeout').optional().isInt({ min: 1, max: 120 }).toInt(),
  body('maxLoginAttempts').optional().isInt({ min: 1, max: 20 }).toInt(),
  body('lockDuration').optional().isInt({ min: 1, max: 1440 }).toInt(),
  body('defaultAppointmentDuration').optional().isIn([15, 20, 30, 45, 60]),
  body('businessHours').optional().custom((v) => {
    if (typeof v !== 'object' || v === null) throw new Error('businessHours debe ser objeto {start,end}');
    if (v.start && !TIME_REGEX.test(v.start)) throw new Error('businessHours.start debe ser HH:MM');
    if (v.end && !TIME_REGEX.test(v.end)) throw new Error('businessHours.end debe ser HH:MM');
    return true;
  }),
  body('workDays').optional().isArray({ max: 7 }).withMessage('workDays debe ser un array de 0-6'),
  body('workDays.*').optional().isInt({ min: 0, max: 6 }),
  body('cashCategories').optional().isArray({ max: 50 }).withMessage('cashCategories debe ser un array (máx 50)'),
  body('cashCategories.*').optional().isString().trim().isLength({ min: 1, max: 60 }),
  body('currency').optional().isString().trim().isIn(ClinicSettings.SUPPORTED_CURRENCIES)
    .withMessage(`currency debe ser una de: ${ClinicSettings.SUPPORTED_CURRENCIES.join(', ')}`),
  body('serviceCatalog').optional().isArray({ max: 200 }).withMessage('serviceCatalog debe ser un array (máx 200)'),
  body('serviceCatalog.*.nombre').optional().isString().trim().isLength({ min: 1, max: 80 })
    .withMessage('nombre de servicio requerido (máx 80 caracteres)'),
  body('serviceCatalog.*.precioDefault').optional()
    .isFloat({ min: 0, max: ClinicSettings.MAX_SERVICE_PRICE })
    .withMessage(`precio entre 0 y ${ClinicSettings.MAX_SERVICE_PRICE}`)
    .toFloat()
];

// ── Clinic Settings ──────────────────────────────────────────
router.get('/', settingsController.getSettings);
router.patch(
  '/',
  authorize(['settings.update']),
  withValidation(settingsValidationRules),
  settingsController.updateSettings
);

// ── Clinic Logo ──────────────────────────────────────────────
router.post('/logo', authorize(['settings.update']), uploadLogo.single('logo'), settingsController.uploadLogo);
router.delete('/logo', authorize(['settings.update']), settingsController.deleteLogo);
router.get('/logo', settingsController.getLogo);

// ── Role Permissions ─────────────────────────────────────────
router.get('/role-permissions', authorize(['settings.read', 'settings.update']), settingsController.getRolePermissions);
router.patch('/role-permissions/:role', authorize(['settings.update']), settingsController.updateRolePermissions);

// ── User Permission Overrides ────────────────────────────────
router.patch('/user-permissions/:userId', authorize(['settings.update']), settingsController.updateUserPermissions);

// ── Current User Routes ──────────────────────────────────────
router.patch('/me/profile', settingsController.updateMyProfile);
router.patch('/me/preferences', settingsController.updateMyPreferences);
router.patch('/me/password', sensitiveActionRateLimit, settingsController.changeMyPassword);
router.patch('/me/pin', sensitiveActionRateLimit, settingsController.changeMyPin);
router.patch('/me/professional-profile', requireClinicalRole, settingsController.updateProfessionalProfile);
router.post('/me/firma', requireClinicalRole, uploadFirma.single('firma'), settingsController.uploadFirma);
router.delete('/me/firma', requireClinicalRole, settingsController.deleteFirma);

// ── Get firma of a specific user (requires clinical or admin role) ─
router.get('/users/:userId/firma', requireClinicalRole, settingsController.getFirma);

module.exports = router;
