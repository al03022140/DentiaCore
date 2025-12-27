const PeriodontogramDataUtils = require('../utils/periodontogramUtils');
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
        .custom((value, { req }) => {
          console.log('🔍 DEBUG validatePatientIdAsId:');
          console.log('  - req.params:', req.params);
          console.log('  - req.params.id:', req.params.id);
          console.log('  - value:', value);
          console.log('  - req.url:', req.url);
          console.log('  - req.originalUrl:', req.originalUrl);
          return true;
        })
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
   * VALIDADOR validateFullPeriodontogramUpdate ELIMINADO
   * No se validan datos de dientes individuales - solo imágenes y estadísticas
   */

  /**
   * VALIDADOR validateToothUpdate ELIMINADO
   * No se validan datos de dientes individuales - solo imágenes y estadísticas
   */

  /**
   * Validador para entrada de historial
   */
  static validateHistoryEntry() {
    return [
      body('changeType')
        .isIn(['create', 'update', 'delete', 'bulk_update'])
        .withMessage('changeType debe ser: create, update, delete o bulk_update'),
      body('description')
        .optional()
        .isString()
        .isLength({ max: 200 })
        .withMessage('description debe ser una cadena de máximo 200 caracteres'),
      body('changes')
        .optional()
        .custom((changes) => {
          // Validación básica de que changes sea un objeto si se proporciona
          if (changes !== null && changes !== undefined && typeof changes !== 'object') {
            throw new Error('changes debe ser un objeto');
          }
          return true;
        })
    ];
  }

  /**
   * Validador para guardado de imágenes
   */
  static validateImageSave() {
    return [
      ...this.validatePatientIdAsId(), // Usar validatePatientIdAsId en lugar de validatePatientId
      body('section')
        .isIn(['superior', 'inferior'])
        .withMessage('section debe ser superior o inferior'),
      body('statistics')
        .notEmpty()
        .withMessage('Las estadísticas son obligatorias')
        .custom((value) => {
          let parsedStats;
          
          // Si es string, intentar parsear como JSON
          if (typeof value === 'string') {
            try {
              parsedStats = JSON.parse(value);
            } catch (error) {
              throw new Error('Las estadísticas deben ser un JSON válido');
            }
          } else if (typeof value === 'object' && value !== null) {
            parsedStats = value;
          } else {
            throw new Error('Las estadísticas deben ser un objeto o JSON string válido');
          }
          
          // Validar estructura requerida
          if (!parsedStats.sessionId || !parsedStats.timestamp || !parsedStats.generalStats) {
            throw new Error('Las estadísticas deben incluir sessionId, timestamp y generalStats');
          }
          
          // Validar sessionId con regex específico
          const sessionIdRegex = /^session_\d+_[a-z0-9]+$/;
          if (!sessionIdRegex.test(parsedStats.sessionId)) {
            throw new Error('sessionId debe seguir el formato: session_[número]_[identificador]');
          }
          
          return true;
        }),
      body('data')
        .optional()
        .custom((data) => {
          // Si es string, intentar parsear como JSON
          if (typeof data === 'string') {
            try {
              JSON.parse(data);
              return true;
            } catch (error) {
              throw new Error('data debe ser un JSON válido');
            }
          }
          
          // Si es objeto o null/undefined, está bien
          if (data === null || data === undefined || typeof data === 'object') {
            return true;
          }
          
          throw new Error('data debe ser un objeto o JSON string válido');
        })
    ];
  }

  /**
   * Middleware para verificar errores de validación
   */
  static checkValidationErrors() {
    return (req, res, next) => {
      console.log('🔍 DEBUG checkValidationErrors:');
      console.log('  - req.params:', req.params);
      console.log('  - req.body:', req.body);
      console.log('  - req.url:', req.url);
      
      const errors = validationResult(req);
      console.log('  - validation errors:', errors.array());
      
      if (!errors.isEmpty()) {
        console.log('❌ Validation failed, returning 400');
        
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
      
      console.log('✅ Validation passed, calling next()');
      next();
    };
  }

  /**
   * MIDDLEWARES sanitizeToothData y validateAndSanitizeTooth ELIMINADOS
   * No se procesan datos de dientes individuales - solo imágenes y estadísticas
   */

  /**
   * MIDDLEWARE validateAndSanitizePeriodontogram ELIMINADO
   * No se validan datos de dientes individuales - solo imágenes y estadísticas
   */

  /**
   * Validador para guardado atómico de imágenes (superior e inferior)
   */
  static validateAtomicImageSave() {
    return [
      ...this.validatePatientIdAsId(),
      body('sessionId')
        .notEmpty()
        .withMessage('sessionId es obligatorio')
        .custom((value) => {
          const sessionIdRegex = /^session_\d+_[a-z0-9]+$/;
          if (!sessionIdRegex.test(value)) {
            throw new Error('sessionId debe seguir el formato: session_[número]_[identificador]');
          }
          return true;
        }),
      body('superiorStatistics')
        .notEmpty()
        .withMessage('Las estadísticas superiores son obligatorias')
        .custom((value) => {
          let parsedStats;
          
          if (typeof value === 'string') {
            try {
              parsedStats = JSON.parse(value);
            } catch (error) {
              throw new Error('Las estadísticas superiores deben ser un JSON válido');
            }
          } else if (typeof value === 'object' && value !== null) {
            parsedStats = value;
          } else {
            throw new Error('Las estadísticas superiores deben ser un objeto o JSON string válido');
          }
          
          if (!parsedStats.timestamp || !parsedStats.generalStats) {
            throw new Error('Las estadísticas superiores deben incluir timestamp y generalStats');
          }
          
          return true;
        }),
      body('inferiorStatistics')
        .notEmpty()
        .withMessage('Las estadísticas inferiores son obligatorias')
        .custom((value) => {
          let parsedStats;
          
          if (typeof value === 'string') {
            try {
              parsedStats = JSON.parse(value);
            } catch (error) {
              throw new Error('Las estadísticas inferiores deben ser un JSON válido');
            }
          } else if (typeof value === 'object' && value !== null) {
            parsedStats = value;
          } else {
            throw new Error('Las estadísticas inferiores deben ser un objeto o JSON string válido');
          }
          
          if (!parsedStats.timestamp || !parsedStats.generalStats) {
            throw new Error('Las estadísticas inferiores deben incluir timestamp y generalStats');
          }
          
          return true;
        }),
      body('superiorData')
        .optional()
        .custom((data) => {
          if (typeof data === 'string') {
            try {
              JSON.parse(data);
              return true;
            } catch (error) {
              throw new Error('superiorData debe ser un JSON válido');
            }
          }
          
          if (data === null || data === undefined || typeof data === 'object') {
            return true;
          }
          
          throw new Error('superiorData debe ser un objeto o JSON string válido');
        }),
      body('inferiorData')
        .optional()
        .custom((data) => {
          if (typeof data === 'string') {
            try {
              JSON.parse(data);
              return true;
            } catch (error) {
              throw new Error('inferiorData debe ser un JSON válido');
            }
          }
          
          if (data === null || data === undefined || typeof data === 'object') {
            return true;
          }
          
          throw new Error('inferiorData debe ser un objeto o JSON string válido');
        })
    ];
  }
}

module.exports = PeriodontogramValidationMiddleware;