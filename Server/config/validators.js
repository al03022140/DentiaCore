const { body, param, query, validationResult } = require('express-validator');

// Middleware para validar resultados
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Error de validación',
      details: errors.array() 
    });
  }
  next();
};

// Validadores para pacientes
const patientValidators = {
  create: [
    body('nombre').trim().notEmpty().withMessage('El nombre es requerido'),
    body('apellido').trim().notEmpty().withMessage('El apellido es requerido'),
    body('documento.tipo').isIn(['Licencia', 'Pasaporte', 'INE', 'Otro']).withMessage('Tipo de documento inválido'),
    body('documento.numero').trim().notEmpty().withMessage('Número de documento requerido'),
    body('fecha_nacimiento').isISO8601().withMessage('Fecha de nacimiento inválida'),
    validate
  ],
  
  update: [
    param('id').isMongoId().withMessage('ID de paciente inválido'),
    body('nombre').optional().trim().notEmpty(),
    body('apellido').optional().trim().notEmpty(),
    body('documento.tipo').optional().isIn(['Licencia', 'Pasaporte', 'INE', 'Otro']),
    body('documento.numero').optional().trim().notEmpty(),
    body('fecha_nacimiento').optional().isISO8601(),
    validate
  ],
  
  getById: [
    param('id').isMongoId().withMessage('ID de paciente inválido'),
    validate
  ]
};

// Validadores para odontograma
const odontogramValidators = {
  saveInitial: [
    param('id').isMongoId().withMessage('ID de paciente inválido'),
    body('entries').isJSON().withMessage('Entries debe ser un JSON válido'),
    validate
  ],
  
  saveClinical: [
    param('id').isMongoId().withMessage('ID de paciente inválido'),
    body('data').isArray().withMessage('Data debe ser un array'),
    validate
  ],
  
  getHistory: [
    param('id').isMongoId().withMessage('ID de paciente inválido'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sort').optional().isIn(['asc', 'desc']),
    validate
  ]
};

// Validadores para citas
const appointmentValidators = {
  create: [
    body('paciente_id').isMongoId().withMessage('ID de paciente inválido'),
    body('fecha_hora').isISO8601().withMessage('Fecha inválida'),
    body('motivo').trim().notEmpty().withMessage('Motivo es requerido'),
    body('estado').optional().isIn(['Pendiente', 'Confirmada', 'Cancelada', 'Pasada']).withMessage('Estado inválido'),
    validate
  ],
  
  update: [
    param('id').isMongoId().withMessage('ID de cita inválido'),
    body('fecha_hora').optional().isISO8601(),
    body('motivo').optional().trim().notEmpty(),
    body('estado').optional().isIn(['Pendiente', 'Confirmada', 'Cancelada', 'Pasada']),
    validate
  ]
};

module.exports = {
  patientValidators,
  odontogramValidators,
  appointmentValidators
};