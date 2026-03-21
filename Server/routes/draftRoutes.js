/**
 * Rutas de Borradores (Drafts) — DentiaCore
 *
 * roles.MD §8: Delegación controlada — Flujo BORRADOR → OFICIAL.
 * roles.MD §9.4: Firma en lote.
 *
 * Todas las rutas requieren autenticación (authenticate) previamente.
 */
const express = require('express');
const router = express.Router();
const { authorize } = require('../middlewares/authorize');
const draftController = require('../controllers/draftController');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Listar borradores pendientes — doctor o admin
router.get('/', readLimiter, authorize(['draft.approve']), draftController.listDrafts);

// Firma en lote — solo doctores con permiso de firma
router.post('/batch-sign', writeLimiter, authorize(['drafts.batch_sign']), draftController.batchSign);

// Firmar borrador individual
router.patch('/:id/sign', writeLimiter, authorize(['draft.approve']), draftController.signDraft);

// Rechazar borrador
router.patch('/:id/reject', writeLimiter, authorize(['draft.approve']), draftController.rejectDraft);

module.exports = router;
