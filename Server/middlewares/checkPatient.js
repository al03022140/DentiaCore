const Patient = require('../models/patient');

module.exports = async function checkPatient(req, res, next) {
  try {
    console.log('🔍 DEBUG: checkPatient middleware');
    console.log('  - req.params.id:', req.params.id);
    console.log('  - req.url:', req.url);
    console.log('  - req.originalUrl:', req.originalUrl);
    
    const patient = await Patient.findById(req.params.id);
    console.log('  - patient found:', !!patient);
    
    if (!patient) return res.status(404).json({ success: false, error: 'Paciente no encontrado' });
    req.patient = patient;
    console.log('  - checkPatient: SUCCESS, proceeding to next middleware');
    next();
  } catch (err) {
    console.log('  - checkPatient ERROR:', err.message);
    next(err);
  }
};