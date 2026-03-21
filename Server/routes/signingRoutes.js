/**
 * Rutas de Firma Electrónica — DentiaCore
 *
 * POST /api/sign/:resourceType/:resourceId — Firmar un documento
 * GET  /api/sign/:resourceType/:resourceId/status — Estado de firma
 *
 * Solo roles clínicos (doctor/superadmin) pueden firmar.
 */
const express = require('express');
const router = express.Router();
const signingController = require('../controllers/signingController');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Firmar un documento (requiere rol clínico)
router.post(
  '/:resourceType/:resourceId',
  writeLimiter,
  requireClinicalRole,
  signingController.signRecord
);

// Consultar estado de firma
router.get(
  '/:resourceType/:resourceId/status',
  readLimiter,
  signingController.getSignatureStatus
);

module.exports = router;
