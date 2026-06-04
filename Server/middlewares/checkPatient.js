const Patient = require('../models/patient');

module.exports = async function checkPatient(req, res, next) {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id || '')) {
      return res.status(400).json({ success: false, error: 'ID de paciente inválido' });
    }

    // Excluir soft-deleted: req.patient no debe poblar pacientes dados de baja
    // (defensa en profundidad para rutas que confíen en req.patient).
    const patient = await Patient.findOne({ _id: req.params.id, deletedAt: null });

    if (!patient) return res.status(404).json({ success: false, error: 'Paciente no encontrado' });
    req.patient = patient;
    next();
  } catch (err) {
    next(err);
  }
};