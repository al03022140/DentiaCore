/**
 * Constantes centralizadas para el módulo Periodontogram
 * Consolida todas las constantes eliminando duplicaciones y normalizando nomenclatura
 * @author Sistema de Periodontograma
 * @version 2.0.0
 */

// ============================================================================
// CONSTANTES DE NÚMEROS DE DIENTES
// ============================================================================

/**
 * Números de dientes permanentes según sistema FDI
 */
export const PERMANENT_TEETH = {
  UPPER_RIGHT: [18, 17, 16, 15, 14, 13, 12, 11],
  UPPER_LEFT: [21, 22, 23, 24, 25, 26, 27, 28],
  LOWER_LEFT: [38, 37, 36, 35, 34, 33, 32, 31],
  LOWER_RIGHT: [48, 47, 46, 45, 44, 43, 42, 41]
};

/**
 * Números de dientes temporales según sistema FDI
 */
export const TEMPORARY_TEETH = {
  UPPER_RIGHT: [51, 52, 53, 54, 55],
  UPPER_LEFT: [61, 62, 63, 64, 65],
  LOWER_LEFT: [71, 72, 73, 74, 75],
  LOWER_RIGHT: [81, 82, 83, 84, 85]
};

/**
 * Todos los números de dientes válidos
 */
export const ALL_TEETH = [
  ...Object.values(PERMANENT_TEETH).flat(),
  ...Object.values(TEMPORARY_TEETH).flat()
];

/**
 * Dientes superiores
 */
export const UPPER_TEETH = [
  ...PERMANENT_TEETH.UPPER_RIGHT,
  ...PERMANENT_TEETH.UPPER_LEFT,
  ...TEMPORARY_TEETH.UPPER_RIGHT,
  ...TEMPORARY_TEETH.UPPER_LEFT
];

/**
 * Dientes inferiores
 */
export const LOWER_TEETH = [
  ...PERMANENT_TEETH.LOWER_LEFT,
  ...PERMANENT_TEETH.LOWER_RIGHT,
  ...TEMPORARY_TEETH.LOWER_LEFT,
  ...TEMPORARY_TEETH.LOWER_RIGHT
];

/**
 * Molares que pueden tener furca
 */
export const MOLARS_WITH_FURCA = [16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48];

/**
 * Molares que necesitan doble furca
 */
export const MOLARS_DOUBLE_FURCA = [16, 17, 18, 26, 27, 28];

// ============================================================================
// RANGOS DE VALIDACIÓN
// ============================================================================

/**
 * Rangos de validación para mediciones clínicas
 */
export const VALIDATION_RANGES = {
  PROBING_DEPTH: { min: -9, max: 9 },
  GINGIVAL_MARGIN: { min: -9, max: 9 },
  ATTACHMENT_LEVEL: { min: -10, max: 25 },
  GUM_WIDTH: { min: 0, max: 10 },
  MOBILITY: { min: 0, max: 3 },
  FURCA: { min: 0, max: 3 },
  BLEEDING: { min: 0, max: 3 },
  PLAQUE: { min: 0, max: 1 },
  SUPPURATION: { min: 0, max: 1 }
};

// ============================================================================
// CONFIGURACIÓN DE ZONAS
// ============================================================================

/**
 * Configuración de arrays de zonas por cara dental
 */
export const ZONE_CONFIG = {
  CLINICAL_INDICATORS: 6, // bleeding, suppuration, plaque
  MEASUREMENTS: 6, // probingDepth, gingivalMargin
  VESTIBULAR_ZONES: 3, // mesial, central, distal
  PALATINE_ZONES: 3, // mesial, central, distal
  LINGUAL_ZONES: 3, // mesial, central, distal
  FACES_PER_TOOTH: 4, // cuatro caras: superior (vestibular, palatino) e inferior (vestibular, lingual)
  ELEMENTS_PER_FACE: 3 // para backend normalizado (3 elementos por cara: mesial, central, distal)
};

// ============================================================================
// CONSTANTES DE NORMALIZACIÓN ESTADÍSTICA (192 SITIOS)
// ============================================================================

/**
 * Constantes para cálculos estadísticos normalizados
 * Base: 192 sitios totales (32 dientes × 6 sitios por diente)
 */
export const SITES_PER_TOOTH = 6; // 3 vestibulares + 3 palatinos/linguales
export const TOTAL_SITES_PERMANENT = 192; // 32 dientes × 6 sitios
export const TOTAL_PERMANENT_TEETH = 32; // Dientes permanentes completos

// ============================================================================
// DEFINICIONES DE FILAS PARA TABLA
// ============================================================================

/**
 * Definición de filas para cada sección de la tabla
 */
export const ROW_DEFINITIONS = {
  VESTIBULAR: [
    'toothNumber',
    'implant',
    'mobility',
    'prognosis',
    'furca',
    'bleeding',
    'suppuration',
    'plaque',
    'gumWidth',
    'gingivalMargin',
    'probingDepth'
  ],
  PALATINE: [
    'probingDepth',
    'gingivalMargin',
    'bleeding',
    'suppuration',
    'plaque',
    'furca'
  ],
  VESTIBULAR_LOWER: [
    'probingDepth',
    'gingivalMargin',
    'gumWidth',
    'bleeding',
    'suppuration',
    'plaque',
    'furca',
    'prognosis',
    'mobility',
    'implant',
    'toothNumber'
  ],
  LINGUAL: [
    'furca',
    'bleeding',
    'suppuration',
    'plaque',
    'gingivalMargin',
    'probingDepth'
  ]
};

// ============================================================================
// OPCIONES PARA CAMPOS SELECT
// ============================================================================

/**
 * Opciones para campos de selección
 */
export const SELECT_OPTIONS = {
  MOBILITY: [
    { value: 0, label: '0 - Sin movilidad' },
    { value: 1, label: '1 - Movilidad leve' },
    { value: 2, label: '2 - Movilidad moderada' },
    { value: 3, label: '3 - Movilidad severa' }
  ],
  PROGNOSIS: [
    { value: 'bueno', label: 'Bueno' },
    { value: 'dudoso', label: 'Dudoso' },
    { value: 'malo', label: 'Malo' },
    { value: 'imposible', label: 'Imposible' }
  ],
  FURCA: [
    { value: 0, label: '0 - Sin lesión' },
    { value: 1, label: '1 - Lesión grado I' },
    { value: 2, label: '2 - Lesión grado II' },
    { value: 3, label: '3 - Lesión grado III' }
  ]
};

// ============================================================================
// TIPOS DE CAMPOS
// ============================================================================

/**
 * Tipos de campos para validación
 */
export const FIELD_TYPES = {
  CHECKBOX: 'checkbox',
  NUMBER: 'number',
  SELECT: 'select',
  ARRAY_CHECKBOX: 'array_checkbox',
  ARRAY_NUMBER: 'array_number'
};

/**
 * Mapeo de campos a tipos
 */
export const FIELD_TYPE_MAP = {
  implant: FIELD_TYPES.CHECKBOX,
  mobility: FIELD_TYPES.SELECT,
  prognosis: FIELD_TYPES.SELECT,
  furca: FIELD_TYPES.SELECT,
  bleeding: FIELD_TYPES.ARRAY_CHECKBOX,
  suppuration: FIELD_TYPES.ARRAY_CHECKBOX,
  plaque: FIELD_TYPES.ARRAY_CHECKBOX,
  gumWidth: FIELD_TYPES.NUMBER,
  gingivalMargin: FIELD_TYPES.ARRAY_NUMBER,
  probingDepth: FIELD_TYPES.ARRAY_NUMBER
};

/**
 * Etiquetas de campos para la interfaz
 */
export const FIELD_LABELS = {
  toothNumber: 'Número',
  implant: 'Implante',
  mobility: 'Movilidad',
  prognosis: 'Pronóstico',
  furca: 'Furca',
  bleeding: 'Sangrado',
  suppuration: 'Supuración',
  plaque: 'Placa',
  gumWidth: 'Ancho Encía',
  gingivalMargin: 'Margen Gingival',
  probingDepth: 'Profundidad Sondaje'
};

// ============================================================================
// CONFIGURACIÓN DE COLORES
// ============================================================================

/**
 * Colores para interpretación clínica
 */
export const CLINICAL_COLORS = {
  PROBING_DEPTH: {
    NORMAL: '#198754',      // 0-3mm
    MILD: '#ffc107',        // 4-5mm
    MODERATE: '#fd7e14',    // 6-7mm
    SEVERE: '#dc3545'       // 8+mm
  },
  BLEEDING: {
    ABSENT: '#198754',
    PRESENT: '#dc3545'
  },
  PLAQUE: {
    ABSENT: '#198754',
    PRESENT: '#ffc107'
  },
  SUPPURATION: {
    ABSENT: '#198754',
    PRESENT: '#dc3545'
  },
  GINGIVAL_MARGIN: {
    NORMAL: '#198754',      // 0 a -2mm
    RECESSION: '#fd7e14',   // -3 a -5mm
    SEVERE_RECESSION: '#dc3545' // -6mm o más
  },
  MOBILITY: {
    NONE: '#198754',
    MILD: '#ffc107',
    MODERATE: '#fd7e14',
    SEVERE: '#dc3545'
  }
};

/**
 * Colores para estadísticas
 */
export const STATISTICS_COLORS = {
  BLEEDING: {
    EXCELLENT: '#198754',   // 0-10%
    GOOD: '#20c997',        // 11-25%
    FAIR: '#ffc107',        // 26-50%
    POOR: '#dc3545'         // 51%+
  },
  PLAQUE: {
    EXCELLENT: '#198754',   // 0-15%
    GOOD: '#20c997',        // 16-30%
    FAIR: '#ffc107',        // 31-50%
    POOR: '#dc3545'         // 51%+
  },
  DEPTH: {
    NORMAL: '#198754',      // Promedio 0-3mm
    MILD: '#ffc107',        // Promedio 4-5mm
    MODERATE: '#fd7e14',    // Promedio 6-7mm
    SEVERE: '#dc3545'       // Promedio 8+mm
  }
};

// ============================================================================
// INTERPRETACIÓN CLÍNICA
// ============================================================================

/**
 * Constantes de interpretación clínica
 */
export const CLINICAL_INTERPRETATION = {
  SEVERITY_LEVELS: {
    HEALTHY: {
      level: 'Saludable',
      color: '#198754',
      description: 'Estado periodontal saludable'
    },
    MILD: {
      level: 'Leve',
      color: '#ffc107',
      description: 'Gingivitis - Mejorar higiene oral'
    },
    MODERATE: {
      level: 'Moderada',
      color: '#fd7e14',
      description: 'Periodontitis moderada - Tratamiento necesario'
    },
    SEVERE: {
      level: 'Severa',
      color: '#dc3545',
      description: 'Periodontitis severa - Requiere tratamiento inmediato'
    }
  },
  THRESHOLDS: {
    SEVERE_POCKETS_PERCENTAGE: 10,
    MODERATE_AVERAGE_DEPTH: 4,
    MODERATE_BLEEDING_PERCENTAGE: 50,
    MILD_BLEEDING_PERCENTAGE: 25,
    MILD_PLAQUE_PERCENTAGE: 30,
    DEEP_POCKET_DEPTH: 4,
    SEVERE_POCKET_DEPTH: 6,
    RECESSION_THRESHOLD: -3,
    SEVERE_RECESSION_THRESHOLD: -6
  },
  COLORS: {
    LOADING: '#6c757d',
    DEFAULT: '#6c757d'
  }
};

// ============================================================================
// CONFIGURACIÓN DE RENDIMIENTO
// ============================================================================

/**
 * Configuración de debounce para actualizaciones
 */
export const DEBOUNCE_CONFIG = {
  REAL_TIME_UPDATE: 300,  // ms
  VALIDATION_DELAY: 150,  // ms
  SAVE_DELAY: 1000,       // ms
  SEARCH_DELAY: 500       // ms
};

/**
 * Configuración de caché
 */
export const CACHE_CONFIG = {
  STATISTICS_DURATION: 5000,    // 5 segundos
  VALIDATION_DURATION: 10000,   // 10 segundos
  IMAGES_DURATION: 300000,      // 5 minutos
  MAX_CACHE_SIZE: 50,
  ENABLE_CACHE: true
};

// ============================================================================
// CONFIGURACIÓN RESPONSIVE
// ============================================================================

/**
 * Breakpoints para diseño responsive
 */
export const RESPONSIVE_CONFIG = {
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,
  DESKTOP_BREAKPOINT: 1200,
  LARGE_DESKTOP_BREAKPOINT: 1400
};

// ============================================================================
// CONFIGURACIÓN DE CANVAS
// ============================================================================

/**
 * Configuración del canvas
 */
export const CANVAS_CONFIG = {
  DEFAULT_WIDTH: 1200,
  DEFAULT_HEIGHT: 800,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,
  MAX_WIDTH: 2400,
  MAX_HEIGHT: 1600
};

// ============================================================================
// CONFIGURACIÓN DE CONTROLES
// ============================================================================

/**
 * Configuración de controles del periodontograma
 */
export const CONTROLS_CONFIG = {
  MODES: {
    COMPLETE: 'complete',
    TABLE_ONLY: 'table-only',
    CANVAS_ONLY: 'canvas-only'
  },
  EDIT_MODES: {
    BLEEDING: 'bleeding',
    SUPPURATION: 'suppuration',
    PLAQUE: 'plaque',
    PROBING_DEPTH: 'probingDepth',
    GINGIVAL_MARGIN: 'gingivalMargin',
    MOBILITY: 'mobility',
    FURCA: 'furca'
  },
  ZOOM_LIMITS: {
    MIN: 0.5,
    MAX: 2.0,
    DEFAULT: 1.0,
    STEP: 0.1
  },
  KEYBOARD_SHORTCUTS: {
    UNDO: 'Ctrl+Z',
    REDO: 'Ctrl+Y',
    SAVE: 'Ctrl+S',
    ZOOM_IN: 'Ctrl++',
    ZOOM_OUT: 'Ctrl+-',
    RESET_ZOOM: 'Ctrl+0'
  }
};

// ============================================================================
// CONFIGURACIÓN DE ACCESIBILIDAD
// ============================================================================

/**
 * Configuración de accesibilidad
 */
export const ACCESSIBILITY_CONFIG = {
  ARIA_LABELS: {
    UNDO_BUTTON: 'Deshacer último cambio',
    REDO_BUTTON: 'Rehacer último cambio',
    ZOOM_IN: 'Aumentar zoom',
    ZOOM_OUT: 'Disminuir zoom',
    RESET_ZOOM: 'Restablecer zoom',
    SAVE_BUTTON: 'Guardar cambios',
    MODE_SELECTOR: 'Seleccionar modo de edición'
  },
  KEYBOARD_NAVIGATION: {
    TAB_INDEX_START: 0,
    FOCUS_TRAP: true,
    SKIP_LINKS: true
  },
  SCREEN_READER: {
    LIVE_REGION: 'polite',
    ANNOUNCEMENTS: true,
    DESCRIPTIONS: true
  }
};

// ============================================================================
// CONFIGURACIÓN DE FEEDBACK VISUAL
// ============================================================================

/**
 * Configuración de feedback visual
 */
export const VISUAL_FEEDBACK_CONFIG = {
  LOADING_STATES: {
    SPINNER_SIZE: 'medium',
    OVERLAY_OPACITY: 0.7,
    ANIMATION_DURATION: 300
  },
  STATUS_INDICATORS: {
    DIRTY: {
      COLOR: '#ffc107',
      ICON: '●',
      TEXT: 'Sin guardar'
    },
    LOADING: {
      COLOR: '#6c757d',
      ICON: '⟳',
      TEXT: 'Cargando...'
    },
    SAVED: {
      COLOR: '#198754',
      ICON: '✓',
      TEXT: 'Guardado'
    },
    ERROR: {
      COLOR: '#dc3545',
      ICON: '⚠️',
      TEXT: 'Error'
    }
  },
  TRANSITIONS: {
    FAST: '150ms',
    NORMAL: '300ms',
    SLOW: '500ms'
  }
};

// ============================================================================
// CONFIGURACIÓN DE PRESETS
// ============================================================================

/**
 * Configuraciones predefinidas
 */
export const PRESET_CONFIGS = {
  CLINICAL_BASIC: {
    name: 'Clínico Básico',
    showCanvas: false,
    showStatistics: true,
    mode: 'table-only',
    editModes: ['bleeding', 'plaque', 'probingDepth']
  },
  CLINICAL_ADVANCED: {
    name: 'Clínico Avanzado',
    showCanvas: true,
    showStatistics: true,
    mode: 'complete',
    editModes: ['bleeding', 'suppuration', 'plaque', 'probingDepth', 'gingivalMargin', 'mobility', 'furca']
  },
  RESEARCH: {
    name: 'Investigación',
    showCanvas: true,
    showStatistics: true,
    mode: 'complete',
    editModes: ['bleeding', 'suppuration', 'plaque', 'probingDepth', 'gingivalMargin', 'mobility', 'furca'],
    enableExport: true,
    detailedStats: true
  },
  STUDENT: {
    name: 'Estudiante',
    showCanvas: true,
    showStatistics: true,
    mode: 'complete',
    editModes: ['bleeding', 'plaque', 'probingDepth'],
    showHelp: true,
    guidedMode: true
  }
};

// ============================================================================
// CONFIGURACIÓN DE VALIDACIÓN DE CONTROLES
// ============================================================================

/**
 * Configuración de validación de controles
 */
export const CONTROLS_VALIDATION = {
  REQUIRED_PROPS: ['patientId', 'onDataChange'],
  OPTIONAL_PROPS: ['initialData', 'readOnly', 'showCanvas', 'showStatistics', 'mode', 'className', 'options'],
  PROP_TYPES: {
    patientId: ['string', 'number'],
    initialData: 'object',
    onDataChange: 'function',
    readOnly: 'boolean',
    showCanvas: 'boolean',
    showStatistics: 'boolean',
    mode: ['complete', 'table-only', 'canvas-only'],
    className: 'string',
    options: 'object'
  }
};

// ============================================================================
// UTILIDADES DE CONSTANTES
// ============================================================================

/**
 * Clase utilitaria para acceso a constantes
 */
export class PeriodontogramConstants {
  /**
   * Verifica si un número de diente es válido
   */
  static isValidToothNumber(toothNumber) {
    return ALL_TEETH.includes(parseInt(toothNumber));
  }

  /**
   * Obtiene el cuadrante de un diente
   */
  static getToothQuadrant(toothNumber) {
    const tooth = parseInt(toothNumber);
    const firstDigit = Math.floor(tooth / 10);
    
    switch (firstDigit) {
      case 1: case 5: return 'upper-right';
      case 2: case 6: return 'upper-left';
      case 3: case 7: return 'lower-left';
      case 4: case 8: return 'lower-right';
      default: return null;
    }
  }

  /**
   * Verifica si un diente es molar
   */
  static isMolar(toothNumber) {
    const tooth = parseInt(toothNumber);
    const lastDigit = tooth % 10;
    return lastDigit >= 6 && lastDigit <= 8;
  }

  /**
   * Verifica si un diente puede tener furca
   */
  static canHaveFurca(toothNumber) {
    return MOLARS_WITH_FURCA.includes(parseInt(toothNumber));
  }

  /**
   * Obtiene el color según el valor clínico
   */
  static getColorByValue(type, value) {
    const colors = CLINICAL_COLORS[type.toUpperCase()];
    if (!colors) return CLINICAL_COLORS.DEFAULT;

    switch (type.toLowerCase()) {
      case 'probingdepth':
        if (value <= 3) return colors.NORMAL;
        if (value <= 5) return colors.MILD;
        if (value <= 7) return colors.MODERATE;
        return colors.SEVERE;
      
      case 'gingivalmargin':
        if (value >= -2) return colors.NORMAL;
        if (value >= -5) return colors.RECESSION;
        return colors.SEVERE_RECESSION;
      
      case 'mobility':
        return colors[Object.keys(colors)[value]] || colors.NONE;
      
      default:
        return value > 0 ? colors.PRESENT : colors.ABSENT;
    }
  }

  /**
   * Obtiene los rangos de validación para un campo
   */
  static getValidationRange(fieldName) {
    return VALIDATION_RANGES[fieldName.toUpperCase()] || { min: 0, max: 10 };
  }
}

// Exportación por defecto
export default PeriodontogramConstants;