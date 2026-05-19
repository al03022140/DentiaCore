/**
 * Rutas de Firma Electrónica — DentiaCore
 *
 * POST /api/sign/:resourceType/:resourceId — Firmar un documento
 * GET  /api/sign/:resourceType/:resourceId/status — Estado de firma
 *
 * Sólo el `doctor` puede firmar (NOM-013: exclusividad del dentista
 * para registros clínicos oficiales; NOM-004 Art. 5.10: la firma debe
 * ser del profesional responsable). `superadmin` puede vía bypass pero
 * exigiendo `motivo`.
 */
const express = require('express');
const router = express.Router();
const signingController = require('../controllers/signingController');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Firmar un documento — sólo doctor (única role con `draft.approve`).
// Antes la ruta sólo aplicaba `requireClinicalRole`, lo cual permitía
// también al `asistente` firmar (rompía NOM-004 Art. 5.10) y al
// `administrador` (rompía NOM-013).
router.post(
  '/:resourceType/:resourceId',
  writeLimiter,
  requireClinicalRole,
  authorize(['draft.approve']),
  signingController.signRecord
);

// Consultar estado de firma — restringido a roles con acceso a contenido
// clínico (admin + doctor + asistente). El recepcionista no necesita
// saber quién firmó qué (LFPDPPP Art. 6: proporcionalidad).
router.get(
  '/:resourceType/:resourceId/status',
  readLimiter,
  requireClinicalRole,
  signingController.getSignatureStatus
);

module.exports = router;
