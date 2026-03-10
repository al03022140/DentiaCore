/**
 * 🔧 ESQUEMA UNIFICADO DE PERIODONTOGRAMA - BACKEND
 * 
 * Esquema único que define la estructura de datos que usarán tanto frontend como backend,
 * eliminando la necesidad de transformaciones y garantizando consistencia total.
 * 
 * PRINCIPIOS:
 * ✅ Un solo formato de datos para todo el sistema
 * ✅ Sin transformaciones entre frontend y backend
 * ✅ Estructura vestibular/palatino nativa
 * ✅ Validación centralizada
 * ✅ Compatibilidad con especificación médica
 * 
 * @version 1.0.0 - ESQUEMA UNIFICADO SIN TRANSFORMACIONES
 * @author Sistema de Normalización
 */

const mongoose = require('mongoose');
const { MEASUREMENT_LIMITS } = require('../config/periodontogram-config');

// ============================================================================
// ESQUEMA DE CARA DENTAL - ESTRUCTURA VESTIBULAR/PALATINO NATIVA
// ============================================================================

/**
 * Esquema para una cara dental - ESTRUCTURA CANÓNICA DE 4 CARAS
 * Estructura: 3 mediciones por cara [mesial, central, distal]
 * 
 * Rangos de valores según documentación:
 * - profundidadSondaje: 0 a 15mm
 * - margenGingival: -10 a 10mm
 * - sangrado: 0 a 2 (multistate)
 * - supuracion: 0 a 1 (binario)
 * - placa: 0 a 1 (binario)
 */
const FaceSchema = new mongoose.Schema({
  profundidadSondaje: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return Array.isArray(arr) && arr.length === 3 &&
               arr.every(val => val >= MEASUREMENT_LIMITS.PROBING_DEPTH.min && val <= MEASUREMENT_LIMITS.PROBING_DEPTH.max);
      },
      message: `profundidadSondaje debe ser un array de 3 elementos con valores ${MEASUREMENT_LIMITS.PROBING_DEPTH.min}-${MEASUREMENT_LIMITS.PROBING_DEPTH.max}`
    },
    default: [0, 0, 0]
  },
  margenGingival: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return Array.isArray(arr) && arr.length === 3 &&
               arr.every(val => val >= MEASUREMENT_LIMITS.GINGIVAL_MARGIN.min && val <= MEASUREMENT_LIMITS.GINGIVAL_MARGIN.max);
      },
      message: `margenGingival debe ser un array de 3 elementos con valores ${MEASUREMENT_LIMITS.GINGIVAL_MARGIN.min} a ${MEASUREMENT_LIMITS.GINGIVAL_MARGIN.max}`
    },
    default: [0, 0, 0]
  },
  sangrado: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return Array.isArray(arr) && arr.length === 3 &&
               arr.every(val => val >= MEASUREMENT_LIMITS.BLEEDING.min && val <= MEASUREMENT_LIMITS.BLEEDING.max);
      },
      message: `sangrado debe ser un array de 3 elementos con valores ${MEASUREMENT_LIMITS.BLEEDING.min}-${MEASUREMENT_LIMITS.BLEEDING.max}`
    },
    default: [0, 0, 0]
  },
  supuracion: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return Array.isArray(arr) && arr.length === 3 &&
               arr.every(val => val >= MEASUREMENT_LIMITS.SUPPURATION.min && val <= MEASUREMENT_LIMITS.SUPPURATION.max);
      },
      message: `supuracion debe ser un array de 3 elementos con valores ${MEASUREMENT_LIMITS.SUPPURATION.min}-${MEASUREMENT_LIMITS.SUPPURATION.max}`
    },
    default: [0, 0, 0]
  },
  placa: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return Array.isArray(arr) && arr.length === 3 &&
               arr.every(val => val >= MEASUREMENT_LIMITS.PLAQUE.min && val <= MEASUREMENT_LIMITS.PLAQUE.max);
      },
      message: `placa debe ser un array de 3 elementos con valores ${MEASUREMENT_LIMITS.PLAQUE.min}-${MEASUREMENT_LIMITS.PLAQUE.max}`
    },
    default: [0, 0, 0]
  }
}, { _id: false });

// ============================================================================
// ESQUEMA DE FURCA - ESTRUCTURA MÉDICA CORRECTA
// ============================================================================

/**
 * Esquema para afectación de furca en molares - ESTRUCTURA CANÓNICA
 * Estructura según documentación del proyecto
 */
const FurcaSchema = new mongoose.Schema({
  vestibular: {
    type: Number,
    min: MEASUREMENT_LIMITS.FURCA.min,
    max: MEASUREMENT_LIMITS.FURCA.max,
    default: MEASUREMENT_LIMITS.FURCA.default
  },
  lingualPalatino: {
    type: Number,
    min: MEASUREMENT_LIMITS.FURCA.min,
    max: MEASUREMENT_LIMITS.FURCA.max,
    default: MEASUREMENT_LIMITS.FURCA.default
  },
  doble: {
    furca1: {
      type: Number,
      min: MEASUREMENT_LIMITS.FURCA.min,
      max: MEASUREMENT_LIMITS.FURCA.max,
      default: MEASUREMENT_LIMITS.FURCA.default
    },
    furca2: {
      type: Number,
      min: MEASUREMENT_LIMITS.FURCA.min,
      max: MEASUREMENT_LIMITS.FURCA.max,
      default: MEASUREMENT_LIMITS.FURCA.default
    }
  }
}, { _id: false });

// ============================================================================
// ESQUEMA UNIFICADO DE DIENTE - FORMATO ÚNICO PARA TODO EL SISTEMA
// ============================================================================

/**
 * Esquema unificado de diente que usarán tanto frontend como backend
 * SIN NECESIDAD DE TRANSFORMACIONES
 */
const UnifiedToothSchema = new mongoose.Schema({
  // Identificación del diente
  numeroDiente: {
    type: Number,
    required: true,
    validate: {
      validator: function(num) {
        return num >= 11 && num <= 85;
      },
      message: 'Número de diente inválido'
    }
  },
  
  // Información básica
  arcada: {
    type: String,
    enum: ['superior', 'inferior'],
    default: 'superior'
  },
  
  // Estado del diente
  ausente: {
    type: Boolean,
    default: false
  },
  
  implante: {
    type: Boolean,
    default: false
  },
  
  // Mediciones por caras - ESTRUCTURA CANÓNICA DE 4 CARAS
  vestibularSuperior: {
    type: FaceSchema,
    default: () => ({
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    })
  },
  
  palatinoSuperior: {
    type: FaceSchema,
    default: () => ({
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    })
  },
  
  vestibularInferior: {
    type: FaceSchema,
    default: () => ({
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    })
  },
  
  lingualInferior: {
    type: FaceSchema,
    default: () => ({
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    })
  },
  
  // Mediciones individuales del diente
  movilidad: {
    type: Number,
    min: MEASUREMENT_LIMITS.MOBILITY.min,
    max: MEASUREMENT_LIMITS.MOBILITY.max,
    default: MEASUREMENT_LIMITS.MOBILITY.default
  },
  
  anchuraEncia: {
    type: Number,
    min: MEASUREMENT_LIMITS.GUM_WIDTH.min,
    max: MEASUREMENT_LIMITS.GUM_WIDTH.max,
    default: MEASUREMENT_LIMITS.GUM_WIDTH.default
  },
  
  furca: {
    type: FurcaSchema,
    default: () => ({
      vestibular: MEASUREMENT_LIMITS.FURCA.default,
      lingualPalatino: MEASUREMENT_LIMITS.FURCA.default,
      doble: { furca1: MEASUREMENT_LIMITS.FURCA.default, furca2: MEASUREMENT_LIMITS.FURCA.default }
    })
  },
  
  pronostico: {
    type: String,
    enum: ['Bueno', 'Regular', 'Malo', 'Dudoso'],
    default: 'Bueno'
  },
  
  // Metadatos
  fechaUltimaModificacion: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// ============================================================================
// ESQUEMA COMPLETO DE PERIODONTOGRAMA
// ============================================================================

/**
 * Esquema completo del periodontograma unificado
 */
const UnifiedPeriodontogramSchema = new mongoose.Schema({
  pacienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  
  teeth: {
    type: Map,
    of: UnifiedToothSchema,
    default: new Map()
  },
  
  statistics: {
    totalTeeth: { type: Number, default: 0 },
    presentTeeth: { type: Number, default: 0 },
    absentTeeth: { type: Number, default: 0 },
    implants: { type: Number, default: 0 },
    averageProbingDepth: { type: Number, default: 0 },
    bleedingPercentage: { type: Number, default: 0 },
    plaquePercentage: { type: Number, default: 0 }
  },
  
  version: {
    type: String,
    default: () => new Date().toISOString().replace(/[:.-]/g, '')
  },
  
  fechaCreacion: {
    type: Date,
    default: Date.now
  },
  
  fechaModificacion: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'periodontograms'
});

// ============================================================================
// FUNCIONES DE VALIDACIÓN UNIFICADAS
// ============================================================================

/**
 * Normaliza un valor a número manejando cadenas booleanas y vacías.
 */
function normalizeNumericValue(rawValue, options = {}) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return options.default !== undefined ? options.default : 0;
  }

  if (typeof rawValue === 'boolean') {
    return rawValue ? 1 : 0;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim().toLowerCase();
    if (trimmed === 'true' || trimmed === 'on' || trimmed === 'si') {
      return 1;
    }
    if (trimmed === 'false' || trimmed === 'off' || trimmed === 'no') {
      return 0;
    }
  }

  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsed = Number.parseFloat(rawValue);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return options.default !== undefined ? options.default : 0;
}

function clampNumericValue(value, options = {}) {
  let result = value;
  if (typeof options.min === 'number' && result < options.min) {
    result = options.min;
  }
  if (typeof options.max === 'number' && result > options.max) {
    result = options.max;
  }
  return result;
}

/**
 * Valida un valor según su tipo y límites
 */
function validateValue(value, type, options = {}) {
  try {
    if (value === undefined || value === null) {
      return options.default !== undefined ? options.default : null;
    }
    
    switch (type) {
      case 'boolean':
        return Boolean(value);
        
      case 'number': {
        const normalized = normalizeNumericValue(value, options);
        return clampNumericValue(normalized, options);
      }
        
      case 'string':
        const strValue = String(value);
        if (options.enum && !options.enum.includes(strValue)) {
          console.warn(`Valor de enum inválido: ${strValue}`);
          return options.default || options.enum[0];
        }
        return strValue;
        
      case 'array':
        if (!Array.isArray(value)) {
          console.warn(`Se esperaba array, recibido: ${typeof value}`);
          if (Array.isArray(options.default)) {
            return [...options.default];
          }
          return options.default !== undefined ? options.default : [];
        }
        
        // Ajustar longitud si es necesario
        let adjustedArray = [...value];
        if (options.length) {
          while (adjustedArray.length < options.length) {
            adjustedArray.push(0);
          }
          adjustedArray = adjustedArray.slice(0, options.length);
        }
        
        // Validar elementos
        return adjustedArray.map(element => {
          const normalized = normalizeNumericValue(element, options);
          return clampNumericValue(normalized, options);
        });
        
      default:
        return value;
    }
  } catch (error) {
    console.error(`Error validando valor:`, error);
    return options.default !== undefined ? options.default : null;
  }
}

/**
 * Valida datos completos de un diente según el esquema unificado
 */
function validateToothData(toothData, toothNumber = null) {
  if (!toothData || typeof toothData !== 'object') {
    console.warn('Datos de diente inválidos, usando valores por defecto');
    return getDefaultToothData(toothNumber);
  }
  
  const validatedData = {
    numeroDiente: validateValue(toothData.numeroDiente || toothNumber, 'number', { min: 11, max: 85 }),
    arcada: validateValue(toothData.arcada, 'string', { enum: ['superior', 'inferior'], default: 'superior' }),
    ausente: validateValue(toothData.ausente, 'boolean', { default: false }),
    implante: validateValue(toothData.implante, 'boolean', { default: false }),
    
    // ESTRUCTURA CANÓNICA DE 4 CARAS
    vestibularSuperior: {
      profundidadSondaje: validateValue(toothData.vestibularSuperior?.profundidadSondaje, 'array', { length: 3, min: MEASUREMENT_LIMITS.PROBING_DEPTH.min, max: MEASUREMENT_LIMITS.PROBING_DEPTH.max, default: [0, 0, 0] }),
      margenGingival: validateValue(toothData.vestibularSuperior?.margenGingival, 'array', { length: 3, min: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.min, max: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.max, default: [0, 0, 0] }),
      sangrado: validateValue(toothData.vestibularSuperior?.sangrado, 'array', { length: 3, min: MEASUREMENT_LIMITS.BLEEDING.min, max: MEASUREMENT_LIMITS.BLEEDING.max, default: [0, 0, 0] }),
      supuracion: validateValue(toothData.vestibularSuperior?.supuracion, 'array', { length: 3, min: MEASUREMENT_LIMITS.SUPPURATION.min, max: MEASUREMENT_LIMITS.SUPPURATION.max, default: [0, 0, 0] }),
      placa: validateValue(toothData.vestibularSuperior?.placa, 'array', { length: 3, min: MEASUREMENT_LIMITS.PLAQUE.min, max: MEASUREMENT_LIMITS.PLAQUE.max, default: [0, 0, 0] })
    },
    
    palatinoSuperior: {
      profundidadSondaje: validateValue(toothData.palatinoSuperior?.profundidadSondaje, 'array', { length: 3, min: MEASUREMENT_LIMITS.PROBING_DEPTH.min, max: MEASUREMENT_LIMITS.PROBING_DEPTH.max, default: [0, 0, 0] }),
      margenGingival: validateValue(toothData.palatinoSuperior?.margenGingival, 'array', { length: 3, min: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.min, max: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.max, default: [0, 0, 0] }),
      sangrado: validateValue(toothData.palatinoSuperior?.sangrado, 'array', { length: 3, min: MEASUREMENT_LIMITS.BLEEDING.min, max: MEASUREMENT_LIMITS.BLEEDING.max, default: [0, 0, 0] }),
      supuracion: validateValue(toothData.palatinoSuperior?.supuracion, 'array', { length: 3, min: MEASUREMENT_LIMITS.SUPPURATION.min, max: MEASUREMENT_LIMITS.SUPPURATION.max, default: [0, 0, 0] }),
      placa: validateValue(toothData.palatinoSuperior?.placa, 'array', { length: 3, min: MEASUREMENT_LIMITS.PLAQUE.min, max: MEASUREMENT_LIMITS.PLAQUE.max, default: [0, 0, 0] })
    },
    
    vestibularInferior: {
      profundidadSondaje: validateValue(toothData.vestibularInferior?.profundidadSondaje, 'array', { length: 3, min: MEASUREMENT_LIMITS.PROBING_DEPTH.min, max: MEASUREMENT_LIMITS.PROBING_DEPTH.max, default: [0, 0, 0] }),
      margenGingival: validateValue(toothData.vestibularInferior?.margenGingival, 'array', { length: 3, min: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.min, max: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.max, default: [0, 0, 0] }),
      sangrado: validateValue(toothData.vestibularInferior?.sangrado, 'array', { length: 3, min: MEASUREMENT_LIMITS.BLEEDING.min, max: MEASUREMENT_LIMITS.BLEEDING.max, default: [0, 0, 0] }),
      supuracion: validateValue(toothData.vestibularInferior?.supuracion, 'array', { length: 3, min: MEASUREMENT_LIMITS.SUPPURATION.min, max: MEASUREMENT_LIMITS.SUPPURATION.max, default: [0, 0, 0] }),
      placa: validateValue(toothData.vestibularInferior?.placa, 'array', { length: 3, min: MEASUREMENT_LIMITS.PLAQUE.min, max: MEASUREMENT_LIMITS.PLAQUE.max, default: [0, 0, 0] })
    },
    
    lingualInferior: {
      profundidadSondaje: validateValue(toothData.lingualInferior?.profundidadSondaje, 'array', { length: 3, min: MEASUREMENT_LIMITS.PROBING_DEPTH.min, max: MEASUREMENT_LIMITS.PROBING_DEPTH.max, default: [0, 0, 0] }),
      margenGingival: validateValue(toothData.lingualInferior?.margenGingival, 'array', { length: 3, min: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.min, max: MEASUREMENT_LIMITS.GINGIVAL_MARGIN.max, default: [0, 0, 0] }),
      sangrado: validateValue(toothData.lingualInferior?.sangrado, 'array', { length: 3, min: MEASUREMENT_LIMITS.BLEEDING.min, max: MEASUREMENT_LIMITS.BLEEDING.max, default: [0, 0, 0] }),
      supuracion: validateValue(toothData.lingualInferior?.supuracion, 'array', { length: 3, min: MEASUREMENT_LIMITS.SUPPURATION.min, max: MEASUREMENT_LIMITS.SUPPURATION.max, default: [0, 0, 0] }),
      placa: validateValue(toothData.lingualInferior?.placa, 'array', { length: 3, min: MEASUREMENT_LIMITS.PLAQUE.min, max: MEASUREMENT_LIMITS.PLAQUE.max, default: [0, 0, 0] })
    },
    
  movilidad: validateValue(toothData.movilidad, 'number', { min: MEASUREMENT_LIMITS.MOBILITY.min, max: MEASUREMENT_LIMITS.MOBILITY.max, default: MEASUREMENT_LIMITS.MOBILITY.default }),
  anchuraEncia: validateValue(toothData.anchuraEncia, 'number', { min: MEASUREMENT_LIMITS.GUM_WIDTH.min, max: MEASUREMENT_LIMITS.GUM_WIDTH.max, default: MEASUREMENT_LIMITS.GUM_WIDTH.default }),
    
    furca: {
      vestibular: validateValue(toothData.furca?.vestibular, 'number', { min: MEASUREMENT_LIMITS.FURCA.min, max: MEASUREMENT_LIMITS.FURCA.max, default: MEASUREMENT_LIMITS.FURCA.default }),
      lingualPalatino: validateValue(toothData.furca?.lingualPalatino, 'number', { min: MEASUREMENT_LIMITS.FURCA.min, max: MEASUREMENT_LIMITS.FURCA.max, default: MEASUREMENT_LIMITS.FURCA.default }),
      doble: {
        furca1: validateValue(toothData.furca?.doble?.furca1, 'number', { min: MEASUREMENT_LIMITS.FURCA.min, max: MEASUREMENT_LIMITS.FURCA.max, default: MEASUREMENT_LIMITS.FURCA.default }),
        furca2: validateValue(toothData.furca?.doble?.furca2, 'number', { min: MEASUREMENT_LIMITS.FURCA.min, max: MEASUREMENT_LIMITS.FURCA.max, default: MEASUREMENT_LIMITS.FURCA.default })
      }
    },
    
    // Normaliza a minúsculas antes de validar para evitar warnings por capitalización
    pronostico: (() => {
      const rawPronostico = typeof toothData.pronostico === 'string' ? toothData.pronostico.toLowerCase() : toothData.pronostico;
      const pronosticoValue = validateValue(rawPronostico, 'string', { enum: ['bueno', 'regular', 'malo', 'dudoso'], default: 'bueno' });
      return pronosticoValue.charAt(0).toUpperCase() + pronosticoValue.slice(1);
    })(),
    fechaUltimaModificacion: new Date()
  };
  
  return validatedData;
}

/**
 * Genera datos por defecto para un diente
 */
function getDefaultToothData(toothNumber = null) {
  const defaultData = {
    numeroDiente: toothNumber ? parseInt(toothNumber) : 11,
    arcada: 'superior',
    ausente: false,
    implante: false,
    // ESTRUCTURA CANÓNICA DE 4 CARAS
    vestibularSuperior: {
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    },
    palatinoSuperior: {
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    },
    vestibularInferior: {
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    },
    lingualInferior: {
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    },
    movilidad: 0,
    anchuraEncia: 0,
    furca: {
      vestibular: 0,
      lingualPalatino: 0,
      doble: {
        furca1: 0,
        furca2: 0
      }
    },
    pronostico: 'Bueno',
    fechaUltimaModificacion: new Date()
  };
  
  if (toothNumber) {
    // Determinar arcada según cuadrante (primer dígito del número de diente)
    const firstDigit = Math.floor(parseInt(toothNumber) / 10);
    defaultData.arcada = [1, 2, 5, 6].includes(firstDigit) ? 'superior' : 'inferior';
  }
  
  return defaultData;
}

/**
 * Valida datos completos del periodontograma
 */
function validatePeriodontogramData(periodontogramData) {
  if (!periodontogramData || typeof periodontogramData !== 'object') {
    throw new Error('Datos de periodontograma inválidos');
  }
  
  const validatedData = {
    pacienteId: periodontogramData.pacienteId,
    teeth: {},
    statistics: periodontogramData.statistics || {
      totalTeeth: 0,
      presentTeeth: 0,
      absentTeeth: 0,
      implants: 0,
      averageProbingDepth: 0,
      bleedingPercentage: 0,
      plaquePercentage: 0
    },
    version: periodontogramData.version || new Date().toISOString().replace(/[:.-]/g, ''),
    fechaCreacion: periodontogramData.fechaCreacion || new Date(),
    fechaModificacion: new Date()
  };
  
  // Validar cada diente
  if (periodontogramData.teeth) {
    Object.entries(periodontogramData.teeth).forEach(([toothNumber, toothData]) => {
      validatedData.teeth[toothNumber] = validateToothData(toothData, toothNumber);
    });
  }
  
  return validatedData;
}

module.exports = {
  FaceSchema,
  FurcaSchema,
  UnifiedToothSchema,
  UnifiedPeriodontogramSchema,
  validateValue,
  validateToothData,
  getDefaultToothData,
  validatePeriodontogramData
};