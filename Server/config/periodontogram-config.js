/**
 * 🦷 CONFIGURACIÓN CENTRALIZADA DEL PERIODONTOGRAMA - BACKEND
 * 
 * Configuración unificada para el sistema de periodontograma en el backend.
 * Garantiza consistencia entre frontend y backend.
 * SINCRONIZADO CON CONFIGURACIÓN DEL CLIENTE v1.0.0
 * 
 * CARACTERÍSTICAS:
 * ✅ Constantes unificadas de dientes
 * ✅ Límites de mediciones estandarizados
 * ✅ Configuración de validación
 * ✅ Configuración de logging
 * ✅ Configuración de caché
 * ✅ Configuración de transformaciones
 * 
 * @version 1.0.0 - CONFIGURACIÓN CENTRALIZADA BACKEND
 * @author Sistema de Configuración Unificada
 */

/**
 * Números de dientes válidos
 */
const TOOTH_NUMBERS = {
  // Dientes permanentes por cuadrante
  PERMANENT: {
    UPPER_RIGHT: [18, 17, 16, 15, 14, 13, 12, 11],
    UPPER_LEFT: [21, 22, 23, 24, 25, 26, 27, 28],
    LOWER_LEFT: [38, 37, 36, 35, 34, 33, 32, 31],
    LOWER_RIGHT: [48, 47, 46, 45, 44, 43, 42, 41]
  },
  
  // Dientes temporales por cuadrante
  TEMPORARY: {
    UPPER_RIGHT: [51, 52, 53, 54, 55],
    UPPER_LEFT: [61, 62, 63, 64, 65],
    LOWER_LEFT: [71, 72, 73, 74, 75],
    LOWER_RIGHT: [81, 82, 83, 84, 85]
  }
};

/**
 * Arrays planos de números de dientes
 */
const PERMANENT_TEETH = [
  ...TOOTH_NUMBERS.PERMANENT.UPPER_RIGHT,
  ...TOOTH_NUMBERS.PERMANENT.UPPER_LEFT,
  ...TOOTH_NUMBERS.PERMANENT.LOWER_LEFT,
  ...TOOTH_NUMBERS.PERMANENT.LOWER_RIGHT
];

const TEMPORARY_TEETH = [
  ...TOOTH_NUMBERS.TEMPORARY.UPPER_RIGHT,
  ...TOOTH_NUMBERS.TEMPORARY.UPPER_LEFT,
  ...TOOTH_NUMBERS.TEMPORARY.LOWER_LEFT,
  ...TOOTH_NUMBERS.TEMPORARY.LOWER_RIGHT
];

const ALL_VALID_TEETH = [...PERMANENT_TEETH, ...TEMPORARY_TEETH];

/**
 * Límites y valores por defecto para mediciones clínicas
 */
const MEASUREMENT_LIMITS = {
  PROBING_DEPTH: { min: -9, max: 9, default: 0 },
  GINGIVAL_MARGIN: { min: -9, max: 9, default: 0 },
  GUM_WIDTH: { min: -99, max: 99, default: 0 },
  MOBILITY: { min: 0, max: 3, default: 0 },
  FURCA: { min: 0, max: 3, default: 0 },
  BLEEDING: { min: 0, max: 3, default: 0 }, // 0-3 valores multistate
  SUPPURATION: { min: 0, max: 1, default: 0 }, // 0/1 numérico
  PLAQUE: { min: 0, max: 1, default: 0 } // 0/1 numérico
};

/**
 * Configuración de arrays de mediciones - NORMALIZADO OPCIÓN 1
 */
const MEASUREMENT_ARRAY_CONFIG = {
  LENGTH: 3,
  FACES: ['Mesial', 'Central', 'Distal'],
  DESCRIPTION: 'Formato normalizado: [Mesial, Central, Distal] - 3 mediciones por cara'
};

/**
 * Configuración de doble furcación
 */
const DOUBLE_FURCA_CONFIG = {
  TEETH: [18, 17, 16, 14, 24, 26, 27, 28],
  FIELDS: ['vestibular', 'lingual', 'mesial'],
  DESCRIPTION: 'Dientes que requieren evaluación de doble furcación'
};

// >>> NUEVO: Molares permanentes (para reglas de furca general)
const MOLAR_TEETH = [16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48];
/**
 * Configuración de validación
 */
const VALIDATION_CONFIG = {
  STRICT_MODE: process.env.NODE_ENV === 'production',
  AUTO_SANITIZE: true,
  LOG_WARNINGS: true,
  LOG_ERRORS: true,
  CACHE_ENABLED: true
};

/**
 * Configuración de caché
 */
const CACHE_CONFIG = {
  MAX_SIZE: 100,
  TTL: 5 * 60 * 1000, // 5 minutos
  ENABLED: true,
  AUTO_CLEANUP: true
};

/**
 * Configuración de logging
 */
const LOGGING_CONFIG = {
  ENABLED: process.env.NODE_ENV !== 'production',
  LEVEL: process.env.LOG_LEVEL || 'info',
  INCLUDE_TIMESTAMP: true,
  INCLUDE_DATA: process.env.NODE_ENV !== 'production'
};

/**
 * Configuración de transformaciones
 */
const TRANSFORMATION_CONFIG = {
  LEGACY_SUPPORT: true,
  AUTO_MIGRATE: true,
  PRESERVE_METADATA: true,
  VALIDATE_ON_TRANSFORM: true
};

/**
 * Datos por defecto para un diente según normalización Opción 1 MEJORADA
 */
const DEFAULT_TOOTH_DATA = {
  numeroDiente: null, // Se asigna dinámicamente
  arcada: null, // Se determina por el número de diente
  ausente: 0, // 0=presente, 1=ausente
  implante: false, // Boolean
  pronostico: 'bueno', // 'bueno', 'dudoso', 'malo', 'imposible'
  movilidad: 0,
  anchuraEncia: MEASUREMENT_LIMITS.GUM_WIDTH.default,
  furca: {
    vestibular: 0,
    lingualPalatino: 0,
    // Para molares específicos (18,17,16,14,24,26,27,28)
    doble: {
      furca1: 0,
      furca2: 0
    }
  },
  vestibular: {
    profundidad: [0, 0, 0], // 3 mediciones por cara
    margen: [0, 0, 0], // 3 mediciones por cara
    sangrado: [0, 0, 0], // 3 valores multistate
    supuracion: [0, 0, 0], // 3 checkboxes (0/1)
    placa: [0, 0, 0], // 3 checkboxes (0/1)
    // anchuraEncia eliminado: valor único a nivel de diente
  },
  lingualPalatino: {
    profundidad: [0, 0, 0], // 3 mediciones por cara
    margen: [0, 0, 0], // 3 mediciones por cara
    sangrado: [0, 0, 0], // 3 valores multistate
    supuracion: [0, 0, 0], // 3 checkboxes (0/1)
    placa: [0, 0, 0], // 3 checkboxes (0/1)
    // anchuraEncia eliminado: valor único a nivel de diente
  }
};

/**
 * Configuración principal del periodontograma
 */
const PERIODONTOGRAM_CONFIG = {
  // Constantes de dientes
  TOOTH_NUMBERS,
  PERMANENT_TEETH,
  TEMPORARY_TEETH,
  ALL_VALID_TEETH,
  
  // Configuración de mediciones
  MEASUREMENT_LIMITS,
  MEASUREMENT_ARRAY_CONFIG,
  DOUBLE_FURCA_CONFIG,
  DEFAULT_TOOTH_DATA,
  
  // Configuración del sistema
  VALIDATION_CONFIG,
  CACHE_CONFIG,
  LOGGING_CONFIG,
  TRANSFORMATION_CONFIG,
  
  // Exponer lista de molares y utilidades
  MOLAR_TEETH,
  
  // Métodos de utilidad
  isValidToothNumber: (toothNumber) => {
    return ALL_VALID_TEETH.includes(parseInt(toothNumber));
  },
  
  isPermanentTooth: (toothNumber) => {
    return PERMANENT_TEETH.includes(parseInt(toothNumber));
  },
  
  isTemporaryTooth: (toothNumber) => {
    return TEMPORARY_TEETH.includes(parseInt(toothNumber));
  },
  
  // >>> NUEVO: Determina si es molar (permanente)
  isMolar: (toothNumber) => {
    return MOLAR_TEETH.includes(parseInt(toothNumber));
  },
  
  // >>> NUEVO: Determina si el diente puede tener cualquier dato de furca
  canHaveFurca: (toothNumber) => {
    const n = parseInt(toothNumber);
    return MOLAR_TEETH.includes(n) || DOUBLE_FURCA_CONFIG.TEETH.includes(n);
  },
  
  needsDoubleFurca: (toothNumber) => {
    return DOUBLE_FURCA_CONFIG.TEETH.includes(parseInt(toothNumber));
  },
  
  getToothArcada: (toothNumber) => {
    const firstDigit = Math.floor(parseInt(toothNumber) / 10);
    return [1, 2, 5, 6].includes(firstDigit) ? 'superior' : 'inferior';
  },
  
  getToothQuadrant: (toothNumber) => {
    const num = parseInt(toothNumber);
    if (num >= 11 && num <= 18) return 'UPPER_RIGHT';
    if (num >= 21 && num <= 28) return 'UPPER_LEFT';
    if (num >= 31 && num <= 38) return 'LOWER_LEFT';
    if (num >= 41 && num <= 48) return 'LOWER_RIGHT';
    if (num >= 51 && num <= 55) return 'UPPER_RIGHT_TEMP';
    if (num >= 61 && num <= 65) return 'UPPER_LEFT_TEMP';
    if (num >= 71 && num <= 75) return 'LOWER_LEFT_TEMP';
    if (num >= 81 && num <= 85) return 'LOWER_RIGHT_TEMP';
    return 'UNKNOWN';
  },
  
  getDefaultToothData: (toothNumber) => {
    const data = { ...DEFAULT_TOOTH_DATA };
    data.numero = parseInt(toothNumber);
    data.arcada = PERIODONTOGRAM_CONFIG.getToothArcada(toothNumber);
    return data;
  },
  
  validateMeasurement: (value, measurementType) => {
    const typeMapping = {
      'PROBINGDEPTH': 'PROBING_DEPTH',
      'GINGIVALMARGIN': 'GINGIVAL_MARGIN',
      'GUMWIDTH': 'GUM_WIDTH',
      'MOBILITY': 'MOBILITY',
      'FURCA': 'FURCA',
      'FURCATION': 'FURCA',
      'BLEEDING': 'BLEEDING',
      'SUPPURATION': 'SUPPURATION',
      'PLAQUE': 'PLAQUE'
    };
    
    const upperType = measurementType.toUpperCase();
    const mappedType = typeMapping[upperType] || upperType;
    const constraint = MEASUREMENT_LIMITS[mappedType];
    
    if (!constraint) {
      return {
        isValid: false,
        error: `Tipo de medición desconocido: ${measurementType}`,
        correctedValue: 0
      };
    }
    
    if (value === null || value === undefined || value === '') {
      return {
        isValid: true,
        error: null,
        correctedValue: constraint.default
      };
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return {
        isValid: false,
        error: `Valor no numérico: ${value}`,
        correctedValue: constraint.default
      };
    }
    
    if (numValue < constraint.min || numValue > constraint.max) {
      return {
        isValid: false,
        error: `Valor fuera de rango [${constraint.min}-${constraint.max}]: ${numValue}`,
        correctedValue: Math.max(constraint.min, Math.min(constraint.max, numValue))
      };
    }
    
    return {
      isValid: true,
      error: null,
      correctedValue: numValue
    };
  }
};

module.exports = {
  PERIODONTOGRAM_CONFIG,
  TOOTH_NUMBERS,
  PERMANENT_TEETH,
  TEMPORARY_TEETH,
  ALL_VALID_TEETH,
  MEASUREMENT_LIMITS,
  MEASUREMENT_ARRAY_CONFIG,
  DOUBLE_FURCA_CONFIG,
  MOLAR_TEETH,
  DEFAULT_TOOTH_DATA,
  VALIDATION_CONFIG,
  CACHE_CONFIG,
  LOGGING_CONFIG,
  TRANSFORMATION_CONFIG
};
