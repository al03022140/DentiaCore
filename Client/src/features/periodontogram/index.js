/**
 * Índice de exportaciones para el módulo Periodontograma
 * Centraliza las exportaciones de componentes activamente usados
 * Versión limpia - Solo componentes utilizados en patient-detail
 * Optimizado para rendimiento y mantenibilidad
 */

// Componentes principales - SOLO LOS USADOS
export { default as PeriodontogramDesign } from './periodontogram-design';
export { default as StatisticsPanel } from './statistics-panel';

// Configuración
export { default as PeriodontogramConfig } from './utils/config';

// Utilidades centralizadas - FUENTE ÚNICA DE VERDAD
export { default as PeriodontogramUtils } from './utils/periodontogram-utils';
export {
  TOOTH_ZONES,
  TOOTH_TYPES,
  TOOTH_SECTIONS,
  MOBILITY_LEVELS,
  FURCATION_LEVELS as FURCA_LEVELS,
  getToothPosition,
  getToothImagePath,
  getToothBackgroundImagePath,
  isValidToothNumber,
  getToothName,
  getToothQuadrant,
  getColorByValue,
  getInterpretation,
  canHaveFurca,
  needsDoubleFurca,
  calculateAverageProbingDepth,
  getBleedingColor,
  getPlaqueColor,
  getProbingDepthColor,
  getBleedingInterpretation,
  getPlaqueInterpretation,
  calculatePeriodontalSeverity,
  getUpperTeeth,
  getLowerTeeth
} from './utils/periodontogram-utils';

// Constantes adicionales para compatibilidad
export const PROGNOSIS_TYPES = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
  HOPELESS: 'hopeless'
};