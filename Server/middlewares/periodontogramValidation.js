const { validationResult, body, param } = require('express-validator');

/**
 * Middleware unificado de validación para periodontograma
 * Consolida toda la lógica de validación duplicada
 */
class PeriodontogramValidationMiddleware {

  /**
   * Validador de ID de paciente
   */
  static validatePatientId() {
    return [
      param('patientId')
        .isMongoId()
        .withMessage('ID de paciente debe ser un ObjectId válido')
        .notEmpty()
        .withMessage('ID de paciente es requerido')
    ];
  }

  /**
   * Validador de ID de paciente para rutas que usan 'id' como parámetro
   */
  static validatePatientIdAsId() {
    return [
      param('id')
        .isMongoId()
        .withMessage('ID de paciente debe ser un ObjectId válido')
        .notEmpty()
        .withMessage('ID de paciente es requerido')
    ];
  }

  /**
   * Validador para datos de creación de periodontograma
   */
  static validatePeriodontogramCreation() {
    return [
      ...this.validatePatientIdAsId(),
      body('teeth')
        .optional()
        .isObject()
        .withMessage('Los datos de dientes deben ser un objeto'),
      body('metadata')
        .optional()
        .isObject()
        .withMessage('Los metadatos deben ser un objeto'),
      body('metadata.createdBy')
        .optional()
        .isMongoId()
        .withMessage('createdBy debe ser un ObjectId válido')
    ];
  }

  /**
   * Middleware para verificar errores de validación
   */
  static checkValidationErrors() {
    return (req, res, next) => {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array().map(error => ({
            field: error.param,
            message: error.msg,
            value: error.value
          }))
        });
      }
      
      next();
    };
  }
}

module.exports = PeriodontogramValidationMiddleware;