const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authorize } = require('../middlewares/authorize');

// Rutas de citas — con autorización por permisos
router.get('/today', authorize(['appointments.read']), appointmentController.getTodayAppointments);
router.get('/', authorize(['appointments.read']), appointmentController.getAllAppointments);
router.get('/:id', authorize(['appointments.read']), appointmentController.getAppointmentById);
router.post('/', authorize(['appointments.create']), appointmentController.createAppointment);
router.put('/:id', authorize(['appointments.update']), appointmentController.updateAppointment);
router.delete('/:id', authorize(['appointments.delete']), appointmentController.deleteAppointment);

module.exports = router;
