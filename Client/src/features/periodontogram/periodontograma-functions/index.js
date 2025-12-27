/**
 * index.js
 * Punto de entrada principal para todas las funciones del periodontograma
 * Nueva estructura consolidada con 4 módulos principales
 */

// Importaciones de los módulos consolidados
import * as ToothOperations from './tooth-operations';
import * as ClinicalIndicators from './clinical-indicators';
import * as Measurements from './measurements';
import * as Rendering from './rendering';
import { isValidToothNumber, getToothPosition, getToothSection } from '../utils/periodontogram-utils';
import { UniversalToothValidator } from '../../../shared/validators/universal-tooth-validator.js';

// Exportaciones de módulos consolidados
export { ToothOperations };
export { ClinicalIndicators };
export { Measurements };
export { Rendering };

// ============================================================================
// EXPORTACIONES ORGANIZADAS POR FUNCIONALIDAD
// ============================================================================

// Operaciones de dientes (desde ToothOperations.js)
export const Tooth = {
  // Funciones de estado del diente
  // toggleAbsent: función eliminada - usar PeriodontogramStateManager.toggleToothAbsent
  toggleImplant: ToothOperations.toggleToothImplant,
  // reset: función eliminada - usar PeriodontogramStateManager.resetToothClinicalData
  
  // Funciones de validación y utilidad
  isValid: isValidToothNumber,
  getQuadrant: ToothOperations.getToothQuadrant,
  getPosition: getToothPosition,
  getSection: getToothSection,
  isMolar: ToothOperations.isMolar,
  isPremolar: ToothOperations.isPremolar,
  
  // Funciones de coordenadas
  getCoordinates: ToothOperations.getToothCoordinates,
  
  // Funciones de datos
  normalize: ToothOperations.normalizeToothData,
  validate: (toothData) => UniversalToothValidator.validateCompleteToothData(toothData)
};

// Exportaciones individuales para compatibilidad
// toggleToothAbsent eliminado - usar PeriodontogramStateManager.toggleToothAbsent
export const { getToothNumberButtonProps } = ToothOperations;

// Exportaciones individuales eliminadas - usar las organizadas por funcionalidad

// Operaciones de indicadores clínicos (desde ClinicalIndicators.js)
export const Clinical = {
  // Sangrado
  bleeding: {
    // update: función eliminada - no se manejan datos individuales
    // setAll: función eliminada - no se manejan datos individuales
    // calculatePercentage eliminado - Usar UniversalToothValidator.calculateStatistics().bleedingPercentage
    interpretLevel: ClinicalIndicators.getBleedingInterpretation,
    // clear: función eliminada - no se manejan datos individuales
  },
  
  // Placa
  plaque: {
    // update: función eliminada - no se manejan datos individuales
    // setAll: función eliminada - no se manejan datos individuales
    // calculatePercentage eliminado - Usar UniversalToothValidator.calculateStatistics().plaquePercentage
    interpretLevel: ClinicalIndicators.getPlaqueInterpretation,
    // clear: función eliminada - no se manejan datos individuales
  },
  
  // Movilidad
  mobility: {
    // update: función eliminada - no se manejan datos individuales
    // increment: función eliminada - no se manejan datos individuales
    // decrement: función eliminada - no se manejan datos individuales
    getStatistics: ClinicalIndicators.getMobilityStatistics,
    // clear: función eliminada - no se manejan datos individuales
  },
  
// Lesiones de furca
  furca: {
    // update: función eliminada - no se manejan datos individuales
    canHave: ClinicalIndicators.canHaveFurca,
    needsDouble: ClinicalIndicators.needsDoubleFurca,
    getInfo: ClinicalIndicators.getFurcaInfo,
    getStatistics: ClinicalIndicators.getFurcaStatistics,
    // clear: función eliminada - no se manejan datos individuales
  }
};

// Operaciones de mediciones (desde Measurements.js)
export const Clinical_Measurements = {
  // Profundidad de sondaje
  probingDepth: {
    update: Measurements.updateProbingDepth,
    get: Measurements.getToothProbingDepths,
    getAverage: Measurements.calculateToothAverageDepth,
    getGlobalAverage: Measurements.calculateGlobalAverageDepth,
    classify: Measurements.classifyProbingDepth,
    getStatistics: Measurements.getProbingDepthStatistics,
    getSeverePockets: Measurements.getSeverePockets
  },
  
  // Margen gingival
  gingivalMargin: {
    update: Measurements.updateGingivalMargin,
    calculate: Measurements.calculateGlobalAverageMargin
  },
  
  // Ancho de encía
  gumWidth: {
    update: Measurements.updateGumWidth,
    calculate: Measurements.calculateGlobalAverageGumWidth
  },
  
  // Análisis integrado
  analysis: {
    getAttachmentLevel: Measurements.calculateClinicalAttachmentLevel,
    getComprehensiveStats: Measurements.getComprehensiveMeasurementStats
  }
};

// Operaciones de renderizado (desde Rendering.js)
export const Render = {
  // Canvas base
  canvas: {
    clear: Rendering.clearCanvas,
    ensureContext: Rendering.ensureCanvasContext,
    renderBackground: Rendering.renderBackground,
    renderGrid: Rendering.renderReferenceGrid,
    renderSeparators: Rendering.renderSectionSeparators
  },
  
  // Renderizado de dientes
  tooth: {
    render: Rendering.renderTooth,
    renderZones: Rendering.renderToothZones,
    renderMobility: Rendering.renderMobilityIndicator,
    renderFurca: Rendering.renderFurcaIndicators,
    renderComplete: Rendering.renderCompleteTooth
  },
  
  // Renderizado de mediciones
  measurements: {
    renderProbingDepths: Rendering.renderProbingDepths,
    renderGingivalMargins: Rendering.renderGingivalMargins,
    renderGumWidth: Rendering.renderGumWidth
  },
  
  // Renderizado completo
  complete: {
    renderPeriodontogram: Rendering.renderCompletePeriodontogram,
    calculatePosition: Rendering.calculateToothPosition,
    optimizedRender: Rendering.optimizedRender,
    cancelRender: Rendering.cancelOptimizedRender
  }
};

// UtilityFunctions eliminado - funciones duplicadas ya disponibles en Tooth

// StatisticalFunctions eliminado - funciones duplicadas ya disponibles en Clinical y Clinical_Measurements

// ============================================================================
// FUNCIONES DE LIMPIEZA
// ============================================================================

export const CleanupFunctions = {
  // clearAllBleeding: función eliminada - no se manejan datos individuales
  // clearAllPlaque: función eliminada - no se manejan datos individuales
  // clearAllMobility: función eliminada - no se manejan datos individuales
  // clearAllFurca: función eliminada - no se manejan datos individuales
  
  // Función consolidada para limpiar todos los datos clínicos
  clearAllClinicalData: (periodontogramData) => {
    // Implementación simplificada - usar PeriodontogramStateManager para operaciones complejas
    console.log('Limpieza de datos clínicos - usar PeriodontogramStateManager');
    return periodontogramData;
  }
};

// ============================================================================
// AGRUPACIÓN PRINCIPAL DE FUNCIONES
// ============================================================================

// Agrupación principal que incluye todas las operaciones consolidadas
export const PeriodontogramFunctions = {
  Tooth,
  Clinical,
  Clinical_Measurements,
  Render,
  Cleanup: CleanupFunctions
};

// ============================================================================
// EXPORTACIÓN POR DEFECTO
// ============================================================================

// Exportación por defecto que incluye todas las funciones organizadas
export default PeriodontogramFunctions;

// Constantes útiles - CORREGIDAS para usar módulos existentes
export const CONSTANTS = {
  MOBILITY_LEVELS: {
    NONE: 0,
    GRADE_1: 1,
    GRADE_2: 2,
    GRADE_3: 3
  },
  FURCATION_LEVELS: {
    NONE: 0,
    GRADE_1: 1,
    GRADE_2: 2,
    GRADE_3: 3
  },
  PROBING_DEPTH_CLASSIFICATION: {
    HEALTHY: { min: 0, max: 3, color: '#27ae60', description: 'Saludable' },
    MODERATE: { min: 4, max: 5, color: '#f39c12', description: 'Moderado' },
    SEVERE: { min: 6, max: Infinity, color: '#e74c3c', description: 'Severo' }
  }
};

/**
 * Función de conveniencia para obtener todas las operaciones de un tipo específico
 * @param {string} type - Tipo de operación ('tooth', 'clinical', 'measurements', 'rendering')
 * @returns {Object} Objeto con todas las operaciones del tipo especificado
 */
export const getOperationsByType = (type) => {
  const operations = {
    tooth: ToothOperations,
    clinical: ClinicalIndicators,
    measurements: Measurements,
    rendering: Rendering
  };
  
  return operations[type.toLowerCase()] || null;
};

/**
 * Función de conveniencia para obtener todas las funciones de limpieza
 * @returns {Object} Objeto con todas las funciones de limpieza
 */
export const getAllCleanupFunctions = () => CleanupFunctions;

// Exportaciones simplificadas para renderizado - CORREGIDAS
export const CanvasOperations = {
  // Funciones principales de canvas desde Rendering
  clear: Rendering.clearCanvas,
  ensureContext: Rendering.ensureCanvasContext,
  renderBackground: Rendering.renderBackground,
  renderGrid: Rendering.renderReferenceGrid,
  renderSeparators: Rendering.renderSectionSeparators
};

export const CoordinateOperations = {
  // Funciones principales de coordenadas desde ToothOperations
  getCoordinates: ToothOperations.getToothCoordinates,
  calculatePosition: Rendering.calculateToothPosition
};

export const MeasurementRenderingOperations = {
  // Funciones principales de renderizado de mediciones desde Rendering
  renderProbingDepths: Rendering.renderProbingDepths,
  renderGingivalMargins: Rendering.renderGingivalMargins,
  renderGumWidth: Rendering.renderGumWidth
};

export const ClinicalIndicatorOperations = {
  // Funciones principales de indicadores clínicos desde Rendering
  renderMobility: Rendering.renderMobilityIndicator,
  renderFurca: Rendering.renderFurcaIndicators
};

export const ToothRenderingOperations = {
  // Funciones principales de renderizado de dientes desde Rendering
  render: Rendering.renderTooth,
  renderZones: Rendering.renderToothZones,
  renderComplete: Rendering.renderCompleteTooth
};

export const DataUtilityOperations = {
  // Funciones principales de utilidades de datos desde ToothOperations
  normalize: ToothOperations.normalizeToothData,
  validate: (toothData) => UniversalToothValidator.validateCompleteToothData(toothData),
  // reset eliminado - usar PeriodontogramStateManager.resetToothClinicalData
};

// Exportación consolidada de todas las operaciones de renderizado - SIMPLIFICADA
export const RenderingOperations = {
  Canvas: CanvasOperations,
  Coordinates: CoordinateOperations,
  Measurements: MeasurementRenderingOperations,
  ClinicalIndicators: ClinicalIndicatorOperations,
  Teeth: ToothRenderingOperations,
  DataUtilities: DataUtilityOperations
};

/**
 * Función de conveniencia para obtener todas las operaciones de renderizado
 * @param {string} type - Tipo de operación de renderizado
 * @returns {Object} Objeto con todas las operaciones del tipo especificado
 */
export const getRenderingOperationsByType = (type) => {
  const operations = {
    canvas: CanvasOperations,
    coordinates: CoordinateOperations,
    measurements: MeasurementRenderingOperations,
    indicators: ClinicalIndicatorOperations,
    teeth: ToothRenderingOperations,
    data: DataUtilityOperations
  };
  
  return operations[type.toLowerCase()] || null;
};

/**
 * Función de conveniencia para obtener todas las funciones estadísticas
 * @returns {Object} Objeto con todas las funciones estadísticas disponibles en Clinical
 */
export const getAllStatisticalFunctions = () => Clinical;

/**
 * Función de conveniencia para obtener todas las funciones de utilidad
 * @returns {Object} Objeto con todas las funciones de utilidad disponibles en Tooth
 */
export const getAllUtilityFunctions = () => Tooth;