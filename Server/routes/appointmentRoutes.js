const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authorize, filterPatientFields, requireClinicalRole } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Rutas de citas — con autorización por permisos.
// SEC-02: `filterPatientFields` marca `req.filterClinicalData` cuando el actor
// sólo tiene acceso básico (recepción); los controladores de lectura recortan
// entonces `motivo`/`observaciones`/`items` (PHI clínico) con
// `sanitizeAppointmentForBasicRead`. La actividad clínica completa de una cita
// (notas, planes, exámenes) es sólo para personal clínico (NOM-004 Art. 5.7).
router.get('/today', readLimiter, authorize(['appointments.read']), filterPatientFields, appointmentController.getTodayAppointments);
router.get('/', readLimiter, authorize(['appointments.read']), filterPatientFields, appointmentController.getAllAppointments);
router.get('/:id', readLimiter, authorize(['appointments.read']), filterPatientFields, appointmentController.getAppointmentById);
router.get('/:id/activity', readLimiter, authorize(['appointments.read']), requireClinicalRole, appointmentController.getAppointmentActivity);
router.post('/', writeLimiter, authorize(['appointments.create']), appointmentController.createAppointment);
router.put('/:id', writeLimiter, authorize(['appointments.update']), appointmentController.updateAppointment);
router.patch('/:id/status', writeLimiter, authorize(['appointments.update']), appointmentController.updateAppointmentStatus);
router.delete('/:id', writeLimiter, authorize(['appointments.delete']), appointmentController.deleteAppointment);

module.exports = router;
