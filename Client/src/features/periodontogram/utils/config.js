/**
 * Configuración para gráficas lineales del periodontograma
 * Centraliza todas las configuraciones relacionadas con LINEAR_GRAPHICS_CONFIG
 * @author Sistema de Periodontograma
 * @version 1.0.0
 */

// ============================================================================
// CONFIGURACIÓN PRINCIPAL DE GRÁFICAS LINEALES
// ============================================================================

/**
 * Configuración principal para gráficas lineales del periodontograma
 */
export const LINEAR_GRAPHICS_CONFIG = {
  // Configuración del canvas
  CANVAS: {
    Z_INDEX: 10,
    OPACITY: 1,
    POINTER_EVENTS: 'none'
  },
  
  // Dimensiones del canvas
  DIMENSIONS: {
    TOOTH_CANVAS_WIDTH: 60,
    TOOTH_CANVAS_HEIGHT: 135,
    CONTAINER_WIDTH: 65,
    CONTAINER_HEIGHT: 150,
    SCALE_FACTOR: 8
  },
  
  // Posiciones de las líneas dentro del contenedor del diente
  POSITIONS: {
    MESIAL: 8,
    CENTRAL: 30,
    DISTAL: 52
  },
  
  // Configuración de rendimiento
  PERFORMANCE: {
    DEBOUNCE_DELAY: 16,
    ENABLE_CACHE: true,
    MAX_CACHE_SIZE: 1000,
    CLEANUP_INTERVAL: 30000
  },
  
  // Colores para validación y estados
  COLORS: {
    VALIDATION_ERROR: '#FF6B6B',
    VALIDATION_WARNING: '#FFA500',
    VALIDATION_SUCCESS: '#28a745',
  GINGIVAL_MARGIN: '#dc3545',
  PROBING_DEPTH: '#007bff',
    BACKGROUND: 'rgba(255, 255, 255, 0.1)',
    FILL: {
      GINGIVAL_MARGIN_FILL: '#FF0B55',    // Rojo consistente con la línea de margen gingival
      PROBING_DEPTH_FILL: '#4E71FF'      // Azul consistente con la línea de profundidad
    }
  },
  
  // Estilos de líneas
  LINE_STYLES: {
    GINGIVAL_MARGIN: {
      width: 2,
      style: 'solid'
    },
    PROBING_DEPTH: {
      width: 2,
      style: 'solid'
    }
  },
  
  // Efectos visuales
  EFFECTS: {
    LINE: {
      opacity: 0.8
    },
    FILL: {
      enabled: true,  // Habilitar relleno de polígonos
      opacity: 0.4    // Transparencia del 40% para relleno
    }
  },
  
  // Validación de rangos
  VALIDATION: {
    GINGIVAL_MARGIN: {
      min: -10,
      max: 10
    },
    PROBING_DEPTH: {
      min: 0,
      max: 15
    }
  },
  
  // Configuración de líneas
  LINES: {
    WIDTH: 2,
    STYLE: 'solid',
    OPACITY: 0.8
  },
  
  // Configuración de animaciones
  ANIMATIONS: {
    ENABLED: true,
    DURATION: 200,
    EASING: 'ease-in-out'
  },
  
  // Configuración de hover
  HOVER: {
    ENABLED: true,
    HIGHLIGHT_COLOR: '#007bff',
    OPACITY_CHANGE: 0.2
  },
  
  // Configuración de debug
  DEBUG: {
    ENABLED: false,
    SHOW_COORDINATES: false,
    CONSOLE_LOGS: false
  }
};

// ============================================================================
// CONFIGURACIONES AVANZADAS
// ============================================================================

/**
 * Configuración avanzada para polígonos continuos
 */
export const ADVANCED_POLYGON_CONFIG = {
  enabled: false,
  smoothing: true,
  fillOpacity: 0.3,
  strokeWidth: 2,
  interpolation: 'linear'
};

/**
 * Configuración de indicadores clínicos avanzados
 */
export const ADVANCED_CLINICAL_INDICATORS = {
  ENABLED: true,
  PATHOLOGICAL_POCKETS: {
    THRESHOLD: 4,
    SEVERE_THRESHOLD: 7,
    COLOR: '#dc3545'
  },
  SEVERE_RECESSION: {
    THRESHOLD: 3,
    SEVERE_THRESHOLD: 5,
    COLOR: '#fd7e14'
  },
  ATTACHMENT_LOSS: {
    THRESHOLD: 3,
    SEVERE_THRESHOLD: 5,
    COLOR: '#6f42c1'
  },
  ANIMATIONS: {
    ENABLED: true,
    DURATION: 300
  }
};

/**
 * Configuración de rendimiento avanzado
 */
export const ADVANCED_PERFORMANCE_CONFIG = {
  enableVirtualization: false,
  batchUpdates: true,
  maxConcurrentUpdates: 5,
  memoryOptimization: true
};

/**
 * Configuración de hover avanzado
 */
export const ADVANCED_HOVER_CONFIG = {
  TOOLTIP: {
    ENABLED: true,
    DELAY: 500,
    POSITION: 'auto'
  },
  HIGHLIGHT: {
    ENABLED: true,
    COLOR: '#007bff',
    OPACITY: 0.3
  }
};

/**
 * Configuración de feedback en tiempo real
 */
export const REAL_TIME_FEEDBACK_CONFIG = {
  enabled: true,
  validationDelay: 300,
  visualFeedback: true,
  audioFeedback: false
};

/**
 * Colores extendidos
 */
export const EXTENDED_COLORS = {
  primary: '#007bff',
  secondary: '#6c757d',
  success: '#28a745',
  danger: '#dc3545',
  warning: '#ffc107',
  info: '#17a2b8',
  light: '#f8f9fa',
  dark: '#343a40'
};

/**
 * Configuración de métricas de calidad
 */
export const QUALITY_METRICS_CONFIG = {
  enabled: false,
  trackAccuracy: true,
  trackPerformance: true,
  reportInterval: 60000
};

/**
 * Configuración de logging avanzado
 */
export const ADVANCED_LOGGING_CONFIG = {
  enabled: false,
  level: 'info',
  includeTimestamp: true,
  includeStackTrace: false
};

// ============================================================================
// EXPORTACIÓN POR DEFECTO
// ============================================================================

export default {
  LINEAR_GRAPHICS_CONFIG,
  ADVANCED_POLYGON_CONFIG,
  ADVANCED_CLINICAL_INDICATORS,
  ADVANCED_PERFORMANCE_CONFIG,
  ADVANCED_HOVER_CONFIG,
  REAL_TIME_FEEDBACK_CONFIG,
  EXTENDED_COLORS,
  QUALITY_METRICS_CONFIG,
  ADVANCED_LOGGING_CONFIG
};