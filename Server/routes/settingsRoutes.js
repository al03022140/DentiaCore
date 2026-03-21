const express = require('express');
const rateLimit = require('express-rate-limit');
const settingsController = require('../controllers/settingsController');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
const uploadFirma = require('../middlewares/uploadFirma');
const uploadLogo = require('../middlewares/uploadLogo');

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

// ── Clinic Settings ──────────────────────────────────────────
router.get('/', settingsController.getSettings);
router.patch('/', authorize(['settings.update']), settingsController.updateSettings);

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
