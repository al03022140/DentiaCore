/**
 * Helper compartido para validar que un appointmentId enviado por el
 * cliente realmente pertenece al paciente del request.
 *
 * Antes, controllers como odontograma/periodontograma/notas-evolución
 * aceptaban cualquier ObjectId válido como `appointmentId` y lo
 * persistían en el snapshot/subdoc — un usuario malicioso podía
 * vincular un odontograma del paciente A con una cita del paciente B
 * (afectaba reportes de auditoría y filtros por cita).
 *
 * Convención:
 *   - Devuelve `appointmentId` (string) si pertenece al paciente.
 *   - Devuelve `null` si no se envió, es inválido, o NO pertenece.
 *   - Nunca lanza — los callers deciden si rechazar o ignorar.
 */
const mongoose = require('mongoose');
const Appointment = require('../models/appointment');

async function resolvePatientAppointmentId(rawAppointmentId, patientId) {
  if (!rawAppointmentId) return null;
  if (!mongoose.Types.ObjectId.isValid(rawAppointmentId)) return null;
  if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) return null;

  const exists = await Appointment.findOne({
    _id: rawAppointmentId,
    paciente_id: patientId,
    deletedAt: null
  }).select('_id').lean();

  return exists ? String(rawAppointmentId) : null;
}

module.exports = { resolvePatientAppointmentId };
