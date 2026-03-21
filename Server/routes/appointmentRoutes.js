const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authorize } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Rutas de citas — con autorización por permisos
router.get('/today', readLimiter, authorize(['appointments.read']), appointmentController.getTodayAppointments);
router.get('/', readLimiter, authorize(['appointments.read']), appointmentController.getAllAppointments);
router.get('/:id', readLimiter, authorize(['appointments.read']), appointmentController.getAppointmentById);
router.post('/', writeLimiter, authorize(['appointments.create']), appointmentController.createAppointment);
router.put('/:id', writeLimiter, authorize(['appointments.update']), appointmentController.updateAppointment);
router.delete('/:id', writeLimiter, authorize(['appointments.delete']), appointmentController.deleteAppointment);

module.exports = router;
