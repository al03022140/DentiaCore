/**
 * 🔧 CONFIGURACIÓN CENTRALIZADA DEL PERIODONTOGRAMA
 * 
 * Archivo único que centraliza TODAS las configuraciones, constantes y parámetros
 * del sistema de periodontograma para eliminar duplicaciones y garantizar consistencia.
 * 
 * CONSOLIDACIÓN CRÍTICA:
 * ✅ Números de dientes unificados
 * ✅ Configuraciones de validación centralizadas
 * ✅ Parámetros de UI consistentes
 * ✅ Configuraciones de guardado optimizadas
 * ✅ Constantes de transformación unificadas
 * 
 * @version 4.0.0 - CONFIGURACIÓN CONSOLIDADA
 * @author Sistema de Normalización Crítica
 */

// ============================================================================
// NÚMEROS DE DIENTES - DEFINICIÓN ÚNICA Y AUTORITATIVA
// ============================================================================

/**
 * Números de dientes permanentes según sistema FDI
 * FUENTE ÚNICA DE VERDAD para toda la aplicación
 * Orden estándar dental: derecha a izquierda del paciente
 */
export const PERMANENT_TEETH = [
  // Cuadrante 1 (Superior derecho) - 18 a 11
  18, 17, 16, 15, 14, 13, 12, 11,
  // Cuadrante 2 (Superior izquierdo) - 21 a 28
  21, 22, 23, 24, 25, 26, 27, 28,
  // Cuadrante 4 (Inferior derecho) - 48 a 41
  48, 47, 46, 45, 44, 43, 42, 41,
  // Cuadrante 3 (Inferior izquierdo) - 31 a 38
  31, 32, 33, 34, 35, 36, 37, 38
];

/**
 * Números de dientes temporales según sistema FDI
 * FUENTE ÚNICA DE VERDAD para toda la aplicación
 */
export const TEMPORARY_TEETH = [
  // Cuadrante 5 (Superior derecho temporal)
  51, 52, 53, 54, 55,
  // Cuadrante 6 (Superior izquierdo temporal)
  61, 62, 63, 64, 65,
  // Cuadrante 7 (Inferior izquierdo temporal)
  71, 72, 73, 74, 75,
  // Cuadrante 8 (Inferior derecho temporal)
  81, 82, 83, 84, 85
];

/**
 * Todos los números de dientes válidos
 * COMBINACIÓN AUTORITATIVA de permanentes y temporales
 */
export const ALL_VALID_TEETH = [...PERMANENT_TEETH, ...TEMPORARY_TEETH];

/**
 * Mapeo de cuadrantes para organización
 * Orden estándar dental: derecha a izquierda del paciente
 */
export const TOOTH_QUADRANTS = {
  1: { name: 'Superior Derecho', teeth: [18, 17, 16, 15, 14, 13, 12, 11], type: 'permanent' },
  2: { name: 'Superior Izquierdo', teeth: [21, 22, 23, 24, 25, 26, 27, 28], type: 'permanent' },
  3: { name: 'Inferior Izquierdo', teeth: [31, 32, 33, 34, 35, 36, 37, 38], type: 'permanent' },
  4: { name: 'Inferior Derecho', teeth: [48, 47, 46, 45, 44, 43, 42, 41], type: 'permanent' },
  5: { name: 'Superior Derecho Temporal', teeth: [51, 52, 53, 54, 55], type: 'temporary' },
  6: { name: 'Superior Izquierdo Temporal', teeth: [61, 62, 63, 64, 65], type: 'temporary' },
  7: { name: 'Inferior Izquierdo Temporal', teeth: [71, 72, 73, 74, 75], type: 'temporary' },
  8: { name: 'Inferior Derecho Temporal', teeth: [81, 82, 83, 84, 85], type: 'temporary' }
};

// ============================================================================
// CONFIGURACIONES DE VALIDACIÓN
// ============================================================================

/**
 * Límites y rangos para validación de mediciones - NORMALIZACIÓN OPCIÓN 1 MEJORADA
 */
export const MEASUREMENT_LIMITS = {
  profundidadSondaje: {
    min: -9,
    max: 9,
    default: 0,
    unit: 'mm',
    description: 'Profundidad de sondaje periodontal'
  },
  margenGingival: {
    min: -9,
    max: 9,
    default: 0,
    unit: 'mm',
    description: 'Margen gingival'
  },
  sangrado: {
    min: 0,
    max: 3,
    default: 0,
    unit: 'multivalor',
    description: 'Presencia de sangrado al sondaje (0-3)'
  },
  supuracion: {
    min: 0,
    max: 1,
    default: 0,
    unit: 'binario',
    description: 'Presencia de supuración (0-1)'
  },
  placa: {
    min: 0,
    max: 1,
    default: 0,
    unit: 'binario',
    description: 'Presencia de placa (0-1)'
  },
  anchuraEncia: {
    min: -99,
    max: 99,
    default: 0,
    unit: 'mm',
    description: 'Anchura de encía queratinizada'
  },
  movilidad: {
    min: 0,
    max: 3,
    default: 0,
    unit: 'grado',
    description: 'Grado de movilidad dental'
  },
  furca: {
    min: 0,
    max: 3,
    default: 0,
    unit: 'grado',
    description: 'Grado de afectación de furca'
  }
};

// ============================================================================
// LEGACY FIELD NAME ALIASES (do not modify above definitions)
// ============================================================================

// Map legacy English identifiers used in validator to Spanish keys
MEASUREMENT_LIMITS.probingDepth = MEASUREMENT_LIMITS.profundidadSondaje;
MEASUREMENT_LIMITS.gingivalMargin = MEASUREMENT_LIMITS.margenGingival;
MEASUREMENT_LIMITS.gumWidth = MEASUREMENT_LIMITS.anchuraEncia;
MEASUREMENT_LIMITS.mobility = MEASUREMENT_LIMITS.movilidad;
// Alias legacy para nombres antiguos
MEASUREMENT_LIMITS.profundidad = MEASUREMENT_LIMITS.profundidadSondaje;
MEASUREMENT_LIMITS.margen = MEASUREMENT_LIMITS.margenGingival;

/**
 * Opciones de campos específicos - NORMALIZACIÓN OPCIÓN 1 MEJORADA
 */
export const FIELD_OPTIONS = {
  pronostico: {
    values: ['Bueno', 'Regular', 'Malo', 'Dudoso'],
    default: 'Bueno',
    description: 'Pronóstico individual del diente'
  },
  arcada: {
    values: ['superior', 'inferior'],
    default: 'superior',
    description: 'Arcada dental'
  },
  ausente: {
    type: 'boolean',
    default: false,
    description: 'Diente ausente (boolean)'
  },
  implante: {
    type: 'boolean',
    default: false,
    description: 'Diente es implante'
  },
  toothType: {
    values: ['permanent', 'temporary'],
    default: 'permanent',
    description: 'Tipo de dentición'
  }
};

// ============================================================================
// LEGACY FIELD NAME ALIASES FOR FIELD_OPTIONS
// ============================================================================
FIELD_OPTIONS.prognosis = FIELD_OPTIONS.pronostico;

// ============================================================================
// CONFIGURACIONES DE ESTRUCTURA DE DATOS
// ============================================================================

/**
 * Configuración de caras de medición - NORMALIZACIÓN SEGÚN ESPECIFICACIÓN MÉDICA
 * ESTRUCTURA: 4 caras por diente con 3 mediciones cada una
 */
export const MEASUREMENT_FACE_CONFIG = {
  faces: ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'],
  positions: [
    { name: 'vestibularSuperior', abbreviation: 'VS', description: 'Cara vestibular superior' },
    { name: 'palatinoSuperior', abbreviation: 'PS', description: 'Cara palatina superior' },
    { name: 'vestibularInferior', abbreviation: 'VI', description: 'Cara vestibular inferior' },
    { name: 'lingualInferior', abbreviation: 'LI', description: 'Cara lingual inferior' }
  ],
  description: 'Configuración de 4 caras por diente con 3 mediciones cada una según especificación médica'
};

/**
 * Configuración de arrays de medición - NORMALIZACIÓN SEGÚN ESPECIFICACIÓN MÉDICA
 * ESTRUCTURA NORMALIZADA: 3 elementos por cara, 4 caras por diente
 * Orden: [mesial, central, distal] para cada cara
 */
export const MEASUREMENT_ARRAY_CONFIG = {
  length: 3,
  structure: [
    { index: 0, position: 'mesial', description: 'Medición mesial' },
    { index: 1, position: 'central', description: 'Medición central' },
    { index: 2, position: 'distal', description: 'Medición distal' }
  ],
  faces: ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'],
  description: 'Configuración normalizada de 3 mediciones por cara, 4 caras según especificación médica'
};

/**
 * Mapeo de caras para compatibilidad - NORMALIZACIÓN SEGÚN ESPECIFICACIÓN MÉDICA
 */
export const FACE_MAPPING = {
  // Caras disponibles en el sistema normalizado según especificación
  availableFaces: ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'],
  // Mapeo de nombres de caras
  faceToFace: {
    vestibularSuperior: 'vestibularSuperior',
    palatinoSuperior: 'palatinoSuperior',
    vestibularInferior: 'vestibularInferior',
    lingualInferior: 'lingualInferior',
    // Compatibilidad legacy
    vestibular: 'vestibularSuperior',
    palatino: 'palatinoSuperior',
    lingual: 'lingualInferior',
    lingualPalatino: 'palatinoSuperior'
  }
};

// ============================================================================
// CONFIGURACIONES DE UI Y VISUALIZACIÓN
// ============================================================================

/**
 * Configuraciones de colores para indicadores clínicos
 */
export const UI_COLORS = {
  bleeding: {
    active: '#dc3545',    // Rojo para sangrado
    inactive: '#6c757d',  // Gris para sin sangrado
    hover: '#c82333'
  },
  suppuration: {
    active: '#ffc107',    // Amarillo para supuración
    inactive: '#6c757d',
    hover: '#e0a800'
  },
  plaque: {
    active: '#17a2b8',    // Azul para placa
    inactive: '#6c757d',
    hover: '#138496'
  },
  probingDepth: {
    normal: '#28a745',    // Verde para normal (0-3mm)
    moderate: '#ffc107',  // Amarillo para moderado (4-5mm)
    severe: '#dc3545'     // Rojo para severo (6+mm)
  },
  mobility: {
    grade0: '#28a745',    // Verde para sin movilidad
    grade1: '#ffc107',    // Amarillo para movilidad grado 1
    grade2: '#fd7e14',    // Naranja para movilidad grado 2
    grade3: '#dc3545'     // Rojo para movilidad grado 3
  }
};

/**
 * Configuraciones de tamaños y espaciado
 */
export const UI_DIMENSIONS = {
  toothSize: {
    width: 40,
    height: 60,
    unit: 'px'
  },
  measurementInput: {
    width: 50,
    height: 30,
    unit: 'px'
  },
  spacing: {
    small: 4,
    medium: 8,
    large: 16,
    unit: 'px'
  }
};

// ============================================================================
// CONFIGURACIONES DE GUARDADO Y SINCRONIZACIÓN
// ============================================================================

/**
 * Configuraciones de debouncing y guardado automático
 */
export const SAVE_CONFIG = {
  debouncing: {
    delay: 1000,          // Delay en ms para debouncing
    maxDelay: 5000,       // Máximo delay antes de forzar guardado
    description: 'Configuración de debouncing para guardado automático'
  },
  retries: {
    maxAttempts: 3,       // Máximo número de reintentos
    backoffDelay: 2000,   // Delay entre reintentos
    exponentialBackoff: true,
    description: 'Configuración de reintentos para guardado'
  },
  validation: {
    validateBeforeSave: true,
    strictMode: false,    // Si es true, falla en cualquier error de validación
    logWarnings: true,
    description: 'Configuración de validación antes del guardado'
  }
};

/**
 * Configuraciones de caché
 */
export const CACHE_CONFIG = {
  statistics: {
    ttl: 300000,          // 5 minutos en ms
    maxSize: 100,         // Máximo número de entradas
    description: 'Configuración de caché para estadísticas'
  },
  validation: {
    ttl: 600000,          // 10 minutos en ms
    maxSize: 50,
    description: 'Configuración de caché para validaciones'
  }
};

// ============================================================================
// CONFIGURACIONES DE TRANSFORMACIÓN DE DATOS
// ============================================================================

/**
 * Configuraciones para transformaciones entre frontend y backend
 */
export const TRANSFORMATION_CONFIG = {
  dataFormat: {
    frontend: 'fourFace',     // Formato de 4 caras (superior: vestibular/palatino, inferior: vestibular/lingual)
    backend: 'threeElement',  // Formato de 3 elementos por cara (mesial, central, distal)
    description: 'Formatos de datos para transformaciones'
  },
  migration: {
    enableLegacySupport: true,
    autoMigrate: true,
    logMigrations: true,
    description: 'Configuración de migración de datos legacy'
  },
  validation: {
    strictTransformation: false,
    preserveUnknownFields: true,
    logTransformations: true,
    description: 'Configuración de validación durante transformaciones'
  }
};

// ============================================================================
// CONFIGURACIONES DE LOGGING
// ============================================================================

/**
 * Configuraciones de logging y debugging
 */
export const LOGGING_CONFIG = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  },
  currentLevel: 2,        // info por defecto
  enableConsoleOutput: true,
  enableFileOutput: false,
  maxLogEntries: 1000,
  description: 'Configuración de sistema de logging'
};

// ============================================================================
// CONFIGURACIONES DE DESARROLLO Y TESTING
// ============================================================================

/**
 * Configuraciones específicas para desarrollo
 */
export const DEV_CONFIG = {
  enableDebugMode: process.env.NODE_ENV === 'development',
  enablePerformanceMonitoring: true,
  enableDetailedLogging: process.env.NODE_ENV === 'development',
  mockDataEnabled: false,
  description: 'Configuraciones específicas para desarrollo'
};

/**
 * Datos de prueba para testing
 */
export const TEST_DATA = {
  sampleToothData: {
    numeroDiente: 11,
    arcada: 'superior',
    ausente: 0,
    implante: false,
    movilidad: 1,
    pronostico: 'Bueno',
    furca: {
      vestibular: 0,
      lingualPalatino: 0,
      doble: { furca1: 0, furca2: 0 }
    },
    vestibular: {
      profundidad: [2, 4, 3],
      margen: [0, -1, 0],
      sangrado: [0, 1, 0],
      supuracion: [false, false, false],
      placa: [true, true, false]
    },
    lingualPalatino: {
      profundidad: [2, 3, 5],
      margen: [0, 0, -2],
      sangrado: [0, 0, 1],
      supuracion: [false, false, false],
      placa: [false, true, false]
    },
    anchuraEncia: 0,
    notes: 'Diente de prueba para testing - estructura normalizada'
  },
  description: 'Datos de prueba para testing y desarrollo - Normalización Opción 1 Mejorada'
};

// ============================================================================
// UTILIDADES DE CONFIGURACIÓN
// ============================================================================

/**
 * Obtiene una configuración específica con fallback
 * @param {string} path - Ruta de la configuración (ej: 'SAVE_CONFIG.debouncing.delay')
 * @param {*} defaultValue - Valor por defecto si no se encuentra
 * @returns {*} Valor de configuración
 */
export function getConfig(path, defaultValue = null) {
  try {
    const parts = path.split('.');
    let current = globalThis;
    
    for (const part of parts) {
      if (current[part] === undefined) {
        return defaultValue;
      }
      current = current[part];
    }
    
    return current;
  } catch (error) {
    console.warn(`Error obteniendo configuración ${path}:`, error);
    return defaultValue;
  }
}

/**
 * Valida si un número de diente es válido usando la configuración centralizada
 * @param {number} toothNumber - Número del diente
 * @returns {boolean} True si es válido
 */
export function isValidToothNumber(toothNumber) {
  return ALL_VALID_TEETH.includes(toothNumber);
}

/**
 * Obtiene el cuadrante de un diente
 * @param {number} toothNumber - Número del diente
 * @returns {Object|null} Información del cuadrante
 */
export function getToothQuadrant(toothNumber) {
  const quadrantNumber = Math.floor(toothNumber / 10);
  return TOOTH_QUADRANTS[quadrantNumber] || null;
}

/**
 * Obtiene el tipo de diente (permanente o temporal)
 * @param {number} toothNumber - Número del diente
 * @returns {string} 'permanent' o 'temporary'
 */
export function getToothType(toothNumber) {
  if (PERMANENT_TEETH.includes(toothNumber)) {
    return 'permanent';
  } else if (TEMPORARY_TEETH.includes(toothNumber)) {
    return 'temporary';
  }
  return 'unknown';
}

/**
 * Obtiene límites de medición para un campo específico
 * @param {string} fieldName - Nombre del campo
 * @returns {Object|null} Límites de medición
 */
export function getMeasurementLimits(fieldName) {
  return MEASUREMENT_LIMITS[fieldName] || null;
}

/**
 * Obtiene configuración de color para un indicador
 * @param {string} indicator - Nombre del indicador
 * @param {string} state - Estado del indicador ('active', 'inactive', 'hover')
 * @returns {string} Color hexadecimal
 */
export function getIndicatorColor(indicator, state = 'active') {
  return UI_COLORS[indicator]?.[state] || '#6c757d';
}

// ============================================================================
// EXPORTACIÓN POR DEFECTO
// ============================================================================

/**
 * Configuración consolidada completa
 */
const PERIODONTOGRAM_CONFIG = {
  // Datos de dientes
  PERMANENT_TEETH,
  TEMPORARY_TEETH,
  ALL_VALID_TEETH,
  TOOTH_QUADRANTS,
  
  // Validación
  MEASUREMENT_LIMITS,
  FIELD_OPTIONS,
  
  // Estructura de datos
  MEASUREMENT_FACE_CONFIG,
  MEASUREMENT_ARRAY_CONFIG,
  FACE_MAPPING,
  
  // UI
  UI_COLORS,
  UI_DIMENSIONS,
  
  // Guardado
  SAVE_CONFIG,
  CACHE_CONFIG,
  
  // Transformación
  TRANSFORMATION_CONFIG,
  
  // Logging
  LOGGING_CONFIG,
  
  // Desarrollo
  DEV_CONFIG,
  TEST_DATA,
  
  // Utilidades
  getConfig,
  isValidToothNumber,
  getToothQuadrant,
  getToothType,
  getMeasurementLimits,
  getIndicatorColor
};

export default PERIODONTOGRAM_CONFIG;

// ============================================================================
// VALIDACIÓN DE CONFIGURACIÓN
// ============================================================================

// Validar que todas las configuraciones estén correctamente definidas
if (typeof window !== 'undefined' && DEV_CONFIG.enableDebugMode) {
  console.log('🔧 Configuración del periodontograma cargada:', {
    permanentTeeth: PERMANENT_TEETH.length,
    temporaryTeeth: TEMPORARY_TEETH.length,
    totalValidTeeth: ALL_VALID_TEETH.length,
    quadrants: Object.keys(TOOTH_QUADRANTS).length,
    measurementLimits: Object.keys(MEASUREMENT_LIMITS).length,
    version: '4.0.0'
  });
}