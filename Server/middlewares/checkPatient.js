const mongoose = require('mongoose');
const Patient = require('../models/patient');

module.exports = async function checkPatient(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID de paciente inválido' });
    }

    const patient = await Patient.findById(req.params.id);

    if (!patient) return res.status(404).json({ success: false, error: 'Paciente no encontrado' });
    req.patient = patient;
    next();
  } catch (err) {
    next(err);
  }
};