/**
 * ClinicalIndicators.js
 * Módulo consolidado para indicadores clínicos del periodontograma
 * Combina: BleedingFunction.js, PlaqueFunction.js, MobilityFunction.js, FurcaFunction.js
 * 
 * Funcionalidades:
 * - Sangrado al sondaje
 * - Índice de placa
 * - Movilidad dental
 * - Lesiones de furca
 * - Cálculos estadísticos
 * - Interpretación clínica
 */

// PeriodontogramData ahora se maneja completamente en el backend
import { clonePeriodontogramData, getToothData, getAllTeethData, updateToothData } from '../utils/periodontogram-utils';
// import PeriodontogramLogger from '../logger';

// ============================================================================
// FUNCIONES DE SANGRADO AL SONDAJE
// ============================================================================

/**
 * Obtiene la interpretación clínica del sangrado
 * @param {number} percentage - Porcentaje de sangrado
 * @returns {Object} Interpretación clínica
 */
export const getBleedingInterpretation = (percentage) => {
  if (percentage <= 10) {
    return {
      level: 'excelente',
      color: '#4CAF50',
      description: 'Salud gingival excelente'
    };
  } else if (percentage <= 20) {
    return {
      level: 'bueno',
      color: '#8BC34A',
      description: 'Salud gingival buena'
    };
  } else if (percentage <= 50) {
    return {
      level: 'moderado',
      color: '#FF9800',
      description: 'Inflamación gingival moderada'
    };
  } else {
    return {
      level: 'severo',
      color: '#F44336',
      description: 'Inflamación gingival severa'
    };
  }
};

// ============================================================================
// FUNCIONES DE ÍNDICE DE PLACA
// ============================================================================

/**
 * Obtiene la interpretación clínica de la placa
 * @param {number} percentage - Porcentaje de placa
 * @returns {Object} Interpretación clínica
 */
export const getPlaqueInterpretation = (percentage) => {
  if (percentage <= 15) {
    return {
      level: 'excelente',
      color: '#4CAF50',
      description: 'Control de placa excelente'
    };
  } else if (percentage <= 25) {
    return {
      level: 'bueno',
      color: '#8BC34A',
      description: 'Control de placa bueno'
    };
  } else if (percentage <= 50) {
    return {
      level: 'regular',
      color: '#FF9800',
      description: 'Control de placa regular'
    };
  } else {
    return {
      level: 'deficiente',
      color: '#F44336',
      description: 'Control de placa deficiente'
    };
  }
};

// ============================================================================
// FUNCIONES DE MOVILIDAD DENTAL
// ============================================================================

/**
 * Obtiene información sobre el grado de movilidad
 * @param {number} mobility - Grado de movilidad (0-3)
 * @returns {Object} Información sobre la movilidad
 */
export const getMobilityInfo = (mobility) => {
  const mobilityData = {
    0: { description: 'Sin movilidad', color: '#4CAF50', severity: 'normal' },
    1: { description: 'Movilidad leve', color: '#FF9800', severity: 'leve' },
    2: { description: 'Movilidad moderada', color: '#FF5722', severity: 'moderada' },
    3: { description: 'Movilidad severa', color: '#F44336', severity: 'severa' }
  };
  
  return mobilityData[mobility] || mobilityData[0];
};

/**
 * Obtiene estadísticas de movilidad
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {Object} Estadísticas de movilidad
 */
export const getMobilityStatistics = (periodontogramData) => {
  try {
    const data = getAllTeethData ? getAllTeethData(periodontogramData) : periodontogramData;
    const stats = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let totalTeeth = 0;
    
    Object.entries(data).forEach(([toothNumber, toothData]) => {
      if (!toothData.absent) {
        totalTeeth++;
        const mobility = toothData.mobility || 0;
        stats[mobility]++;
      }
    });
    
    return {
      distribution: stats,
      totalTeeth,
      criticalTeeth: stats[2] + stats[3],
      percentageCritical: totalTeeth > 0 ? Math.round(((stats[2] + stats[3]) / totalTeeth) * 100) : 0
    };
  } catch (error) {
    console.error('Error al calcular estadísticas de movilidad:', error);
    return { distribution: { 0: 0, 1: 0, 2: 0, 3: 0 }, totalTeeth: 0, criticalTeeth: 0, percentageCritical: 0 };
  }
};

// ============================================================================
// FUNCIONES DE LESIONES DE FURCA
// ============================================================================

/**
 * Determina si un diente puede tener furca
 * @param {number} toothNumber - Número del diente (FDI)
 * @returns {boolean} True si puede tener furca
 */
export const canHaveFurca = (toothNumber) => {
  const position = toothNumber % 10;
  return position >= 6; // Solo molares (posiciones 6, 7, 8)
};

/**
 * Determina si un diente necesita furca doble (mesial y distal)
 * @param {number} toothNumber - Número del diente (FDI)
 * @returns {boolean} True si necesita furca doble
 */
export const needsDoubleFurca = (toothNumber) => {
  const position = toothNumber % 10;
  const quadrant = Math.floor(toothNumber / 10);
  
  // Molares inferiores (cuadrantes 3 y 4) tienen furca vestibular y lingual
  // Molares superiores (cuadrantes 1 y 2) tienen furca mesial, distal y vestibular
  return position >= 6 && (quadrant === 3 || quadrant === 4);
};

/**
 * Obtiene información sobre el grado de furca
 * @param {number} grade - Grado de furca (0-3)
 * @returns {Object} Información sobre la furca
 */
export const getFurcaInfo = (grade) => {
  const furcaData = {
    0: { description: 'Sin lesión de furca', color: '#4CAF50', severity: 'normal' },
    1: { description: 'Furca grado I', color: '#FF9800', severity: 'leve' },
    2: { description: 'Furca grado II', color: '#FF5722', severity: 'moderada' },
    3: { description: 'Furca grado III', color: '#F44336', severity: 'severa' }
  };
  
  return furcaData[grade] || furcaData[0];
};

/**
 * Obtiene estadísticas de furca
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {Object} Estadísticas de furca
 */
export const getFurcaStatistics = (periodontogramData) => {
  try {
    const data = getAllTeethData ? getAllTeethData(periodontogramData) : periodontogramData;
    const stats = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let totalMolars = 0;
    let affectedMolars = 0;
    
    Object.entries(data).forEach(([toothNumber, toothData]) => {
      const toothNum = parseInt(toothNumber);
      if (!toothData.absent && canHaveFurca(toothNum)) {
        totalMolars++;
        const furca = toothData.furca || {};
        const maxGrade = Math.max(
          furca.vestibular || 0,
          furca.lingual || 0,
          furca.mesial || 0,
          furca.distal || 0
        );
        
        stats[maxGrade]++;
        if (maxGrade > 0) affectedMolars++;
      }
    });
    
    return {
      distribution: stats,
      totalMolars,
      affectedMolars,
      percentageAffected: totalMolars > 0 ? Math.round((affectedMolars / totalMolars) * 100) : 0
    };
  } catch (error) {
    console.error('Error al calcular estadísticas de furca:', error);
    return { distribution: { 0: 0, 1: 0, 2: 0, 3: 0 }, totalMolars: 0, affectedMolars: 0, percentageAffected: 0 };
  }
};



// ============================================================================
// EXPORTACIONES AGRUPADAS
// ============================================================================

export const BleedingOperations = {
  // Funciones de actualización de dientes individuales eliminadas
  // calculatePercentage eliminado - Usar UniversalToothValidator.calculateStatistics().bleedingPercentage
  getInterpretation: getBleedingInterpretation
  // clearAll eliminada - no se manejan datos de dientes individuales
};

export const PlaqueOperations = {
  // Funciones de actualización de dientes individuales eliminadas
  // calculatePercentage eliminado - Usar UniversalToothValidator.calculateStatistics().plaquePercentage
  // calculateOLearyIndex eliminada - usar UniversalToothValidator.calculateStatistics().plaquePercentage
  getInterpretation: getPlaqueInterpretation
  // clearAll eliminada - no se manejan datos de dientes individuales
};

export const MobilityOperations = {
  // Funciones de actualización de dientes individuales eliminadas
  getInfo: getMobilityInfo,
  getStatistics: getMobilityStatistics
  // clearAll eliminada - no se manejan datos de dientes individuales
};

export const FurcaOperations = {
  // Función update eliminada - no se manejan datos de dientes individuales
  canHave: canHaveFurca,
  needsDouble: needsDoubleFurca,
  getInfo: getFurcaInfo,
  getStatistics: getFurcaStatistics
  // clearAll eliminada - no se manejan datos de dientes individuales
};

export const ClinicalIndicators = {
  Bleeding: BleedingOperations,
  Plaque: PlaqueOperations,
  Mobility: MobilityOperations,
  Furca: FurcaOperations
};

export default ClinicalIndicators;