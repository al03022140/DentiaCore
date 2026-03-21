/**
 * Rutas de Trazabilidad / Auditoría — DentiaCore
 *
 * Solo lectura. Accesible por administrador (wildcard *) y superadmin (audit.read.full).
 * roles.MD §5: "Solo el rol administrador. Los logs son de solo lectura."
 */
const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authorize } = require('../middlewares/authorize');
const { readLimiter } = require('../middlewares/rateLimiter');

// Todos los endpoints requieren permiso de auditoría
router.get('/', readLimiter, authorize(['audit.read.full']), auditController.getLogs);
router.get('/users', readLimiter, authorize(['audit.read.full']), auditController.getUsers);
router.get('/patients', readLimiter, authorize(['audit.read.full']), auditController.searchPatients);

// Verificación de integridad de un documento
router.get('/verify/:resourceType/:resourceId', readLimiter, authorize(['audit.read.full']), auditController.verifyIntegrity);

// Timeline de auditoría por paciente
router.get('/timeline/:patientId', readLimiter, authorize(['audit.read.full']), auditController.getTimeline);

module.exports = router;
