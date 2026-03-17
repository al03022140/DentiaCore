const express = require('express');
const settingsController = require('../controllers/settingsController');
const authorize = require('../middlewares/authorize');
const uploadFirma = require('../middlewares/uploadFirma');
const uploadLogo = require('../middlewares/uploadLogo');

const router = express.Router();

// ── Clinic Settings ──────────────────────────────────────────
router.get('/', settingsController.getSettings);
router.patch('/', authorize(['settings.update']), settingsController.updateSettings);

// ── Clinic Logo ──────────────────────────────────────────────
router.post('/logo', authorize(['settings.update']), uploadLogo.single('logo'), settingsController.uploadLogo);
router.delete('/logo', authorize(['settings.update']), settingsController.deleteLogo);
router.get('/logo', settingsController.getLogo);

// ── Role Permissions ─────────────────────────────────────────
router.get('/role-permissions', settingsController.getRolePermissions);
router.patch('/role-permissions/:role', authorize(['settings.update']), settingsController.updateRolePermissions);

// ── User Permission Overrides ────────────────────────────────
router.patch('/user-permissions/:userId', authorize(['settings.update']), settingsController.updateUserPermissions);

// ── Current User Routes ──────────────────────────────────────
router.patch('/me/profile', settingsController.updateMyProfile);
router.patch('/me/preferences', settingsController.updateMyPreferences);
router.patch('/me/password', settingsController.changeMyPassword);
router.patch('/me/pin', settingsController.changeMyPin);
router.patch('/me/professional-profile', settingsController.updateProfessionalProfile);
router.post('/me/firma', uploadFirma.single('firma'), settingsController.uploadFirma);
router.delete('/me/firma', settingsController.deleteFirma);

// ── Get firma of a specific user (admin / clinical docs) ─────
router.get('/users/:userId/firma', settingsController.getFirma);

module.exports = router;
