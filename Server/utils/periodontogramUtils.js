// Sistema de logging eliminado

const { PERIODONTOGRAM_CONFIG } = require('../config/periodontogram-config');
const { UniversalToothValidator } = require('./UniversalToothValidator');

/**
 * Utilidades centralizadas para el manejo de datos del periodontograma
 * Elimina duplicación de código y centraliza lógica común
 */
class PeriodontogramDataUtils {
  
  /**
   * Convierte datos de estructura face a array de 6 elementos
   * Soporta: arrays existentes y estructura face simple (vestibular, palatino)
   * @param {Object|Array} faceData - Datos en cualquier formato
   * @param {*} defaultValue - Valor por defecto para elementos faltantes
   * @returns {Array} Array de 6 elementos [vest1, vest2, vest3, pal1, pal2, pal3]
   */
  static convertFaceDataToArray(faceData, defaultValue = false) {
    // Si ya es un array de 6 elementos, devolverlo tal como está
    if (Array.isArray(faceData) && faceData.length === 6) {
      return faceData;
    }
    
    // Si es un array de otra longitud, ajustarlo a 6 elementos
    if (Array.isArray(faceData)) {
      const result = [...faceData];
      while (result.length < 6) {
        result.push(defaultValue);
      }
      return result.slice(0, 6);
    }
    
    if (!faceData || typeof faceData !== 'object') {
      return new Array(6).fill(defaultValue);
    }

    // Manejar estructura face simple (vestibular, palatino)
    const vestibular = Array.isArray(faceData.vestibular) ? faceData.vestibular : [];
    const palatino = Array.isArray(faceData.palatino) ? faceData.palatino : [];

    return [
      vestibular[0] !== undefined ? vestibular[0] : defaultValue,
      vestibular[1] !== undefined ? vestibular[1] : defaultValue,
      vestibular[2] !== undefined ? vestibular[2] : defaultValue,
      palatino[0] !== undefined ? palatino[0] : defaultValue,
      palatino[1] !== undefined ? palatino[1] : defaultValue,
      palatino[2] !== undefined ? palatino[2] : defaultValue
    ];
  }

  /**
   * Convierte datos de estructura face a array de números con validación de rango
   * @param {Object} faceData - Datos con estructura face
   * @param {number} defaultValue - Valor por defecto numérico
   * @param {number} min - Valor mínimo permitido
   * @param {number} max - Valor máximo permitido
   * @returns {Array} Array de 6 números validados
   */
  static convertFaceDataToNumberArray(faceData, defaultValue = 0, min = 0, max = 15) {
    const baseArray = this.convertFaceDataToArray(faceData, defaultValue);
    
    return baseArray.map(value => {
      const numValue = Number(value);
      if (isNaN(numValue)) return defaultValue;
      return Math.max(min, Math.min(max, numValue));
    });
  }

  /**
   * Sanitiza un array de datos de diente asegurando longitud y validación
   * @param {Array} array - Array a sanitizar
   * @param {number} expectedLength - Longitud esperada del array
   * @param {*} defaultValue - Valor por defecto para elementos faltantes
   * @param {Function} validator - Función de validación opcional
   * @returns {Array} Array sanitizado
   */
  static sanitizeToothArray(array, expectedLength = 6, defaultValue = false, validator = null) {
    if (!Array.isArray(array)) {
      return new Array(expectedLength).fill(defaultValue);
    }

    const sanitized = array.slice(0, expectedLength);
    
    // Completar con valores por defecto si es necesario
    while (sanitized.length < expectedLength) {
      sanitized.push(defaultValue);
    }

    // Aplicar validador si se proporciona
    if (validator && typeof validator === 'function') {
      return sanitized.map(value => validator(value) ? value : defaultValue);
    }

    return sanitized;
  }

  /**
   * Sanitiza datos booleanos de un diente (bleeding, suppuration, plaque)
   * @param {*} data - Datos a sanitizar (puede ser face data o array)
   * @returns {Array} Array de 6 booleanos
   */
  static sanitizeBooleanToothData(data) {
    // Si es estructura face, convertir primero
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      data = this.convertFaceDataToArray(data, false);
    }

    return this.sanitizeToothArray(data, 6, false, value => typeof value === 'boolean');
  }

  /**
   * Sanitiza datos numéricos de un diente (probingDepth, gingivalMargin, gumWidth)
   * @param {*} data - Datos a sanitizar
   * @param {number} min - Valor mínimo
   * @param {number} max - Valor máximo
   * @param {number} defaultValue - Valor por defecto
   * @returns {Array} Array de 6 números validados
   */
  static sanitizeNumericToothData(data, min = 0, max = 15, defaultValue = 0) {
    // Si es estructura face, convertir primero
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      data = this.convertFaceDataToNumberArray(data, defaultValue, min, max);
    }

    return this.sanitizeToothArray(
      data, 
      6, 
      defaultValue, 
      value => {
        const num = Number(value);
        return !isNaN(num) && num >= min && num <= max;
      }
    ).map(value => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : Math.max(min, Math.min(max, num));
    });
  }

  /**
   * Sanitiza datos de furca para molares
   * @param {Object} furcaData - Datos de furca
   * @returns {Object} Objeto de furca sanitizado
   */
  static sanitizeFurcaData(furcaData) {
    const defaultFurca = { vestibular: 0, lingual: 0, mesial: 0 };
    
    if (!furcaData || typeof furcaData !== 'object') {
      return defaultFurca;
    }

    const sanitized = { ...defaultFurca };
    
    ['vestibular', 'lingual', 'mesial'].forEach(key => {
      const value = Number(furcaData[key]);
      sanitized[key] = isNaN(value) ? 0 : Math.max(0, Math.min(3, value));
    });

    return sanitized;
  }

  /**
   * Alias de compatibilidad: delega validación de diente a UniversalToothValidator
   * No usar en controladores de producción; mantener solo para scripts internos/tests.
   * @param {Object} toothData
   * @param {number} [toothNumber]
   * @returns {*}
   */
  static validateToothData(toothData, toothNumber) {
    return UniversalToothValidator.validateToothData(toothData, toothNumber);
  }

  /**
   * Determina si un número de diente es válido según FDI
   * @param {number} toothNumber
   * @returns {boolean}
   */
  static isValidToothNumber(toothNumber) {
    return PERIODONTOGRAM_CONFIG.isValidToothNumber(toothNumber);
  }

  /**
   * Determina si un diente es molar
   * @param {number} toothNumber
   * @returns {boolean}
   */
  static isMolar(toothNumber) {
    return PERIODONTOGRAM_CONFIG.MOLAR_TEETH.includes(Number(toothNumber));
  }

  /**
   * Determina si un diente requiere doble entrada de furca (molares superiores)
   * @param {number} toothNumber
   * @returns {boolean}
   */
  static needsDoubleFurca(toothNumber) {
    return PERIODONTOGRAM_CONFIG.DOUBLE_FURCA_CONFIG.TEETH.includes(Number(toothNumber));
  }

  /**
   * Valida datos de furca con el número de diente
   * @param {Object} furcaData
   * @param {number} toothNumber
   * @returns {Object}
   */
  static validateFurcaData(furcaData, toothNumber) {
    const sanitized = this.sanitizeFurcaData(furcaData);
    if (this.needsDoubleFurca(toothNumber)) {
      return sanitized;
    }
    // Para molares inferiores/superiores según reglas, se limita a 2 caras (vestibular/lingual)
    return { vestibular: sanitized.vestibular, lingual: sanitized.lingual };
  }

  /**
   * Interpreta si la cara lingual es palatina según la arcada
   * @param {('superior'|'inferior')} arcada
   * @returns {('palatino'|'lingual')}
   */
  static interpretLingualPalatino(arcada) {
    return arcada === 'superior' ? 'palatino' : 'lingual';
  }

  /**
   * Transforma datos de frontend a backend (normalización canónica)
   * @deprecated Retirado por plan de normalización: no usar en Backend; el Front debe enviar el formato canónico validado.
   * Lanza un error si se intenta utilizar.
   * @param {Object} frontendData
   * @returns {never}
   */
  static transformToBackend(_frontendData) {
    const error = new Error('transformToBackend está deprecado y retirado. El Backend no acepta transformaciones implícitas. Envíe formato canónico (4 caras, tripletas) desde el Front.');
    error.code = 'PERIODONTOGRAM_TRANSFORMER_DEPRECATED';
    throw error;
  }

  /**
   * Transforma estructura de caras (vestibular/palatino) a array de 6 elementos
   * @param {Object|Array} faceData
   * @returns {Array}
   */
  static transformFaceData(faceData) {
    const base = this.convertFaceDataToArray(faceData, 0);
    return base;
  }

  /**
   * Asegura un array de longitud 3 (tripleta por cara)
   * @param {*} value
   * @returns {Array}
   */
  static ensureArray3(value) {
    if (Array.isArray(value) && value.length === 3) {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return [value, value, value];
    }
    return [0, 0, 0];
  }
}

module.exports = PeriodontogramDataUtils;