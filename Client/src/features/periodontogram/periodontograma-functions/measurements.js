/**
 * Measurements.js
 * Módulo consolidado para mediciones periodontales
 * Combina: ProbingDepthFunction.js y funciones de medición relacionadas
 * 
 * Funcionalidades:
 * - Profundidad de sondaje
 * - Margen gingival
 * - Ancho de encía queratinizada
 * - Cálculos estadísticos
 * - Clasificación de severidad
 * - Interpretación clínica
 */

// PeriodontogramData ahora se maneja completamente en el backend
// import PeriodontogramLogger from '../logger';
import { clonePeriodontogramData, getToothData, getAllTeethData } from '../utils/periodontogram-utils';

// ============================================================================
// FUNCIONES DE PROFUNDIDAD DE SONDAJE
// ============================================================================

/**
 * Actualiza la profundidad de sondaje en una zona específica del diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {number} zoneIndex - Índice de la zona (0: mesial, 1: central, 2: distal)
 * @param {number} depth - Profundidad en milímetros (0-15)
 * @returns {PeriodontogramData} Nueva instancia con la profundidad actualizada
 */
export const updateProbingDepth = (periodontogramData, toothNumber, zoneIndex, depth) => {
  try {
    const newData = clonePeriodontogramData(periodontogramData);
    const currentTooth = getToothData(newData, toothNumber);
    const probingDepth = currentTooth.probingDepth || [0, 0, 0];
    
    // Validar y limitar la profundidad
    const clampedDepth = Math.max(-9, Math.min(15, Number(depth) || 0));
    probingDepth[zoneIndex] = clampedDepth;
    
    newData.updateTooth(toothNumber, {
      probingDepth: [...probingDepth]
    });
    
    // Profundidad de sondaje actualizada
    return newData;
  } catch (error) {
    console.error('Error al actualizar profundidad de sondaje:', error);
    return periodontogramData;
  }
};

/**
 * Obtiene las profundidades de sondaje de un diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @returns {Array} Array con las profundidades [mesial, central, distal]
 */
export const getToothProbingDepths = (periodontogramData, toothNumber) => {
  try {
    const toothData = getToothData(periodontogramData, toothNumber);
    return toothData.probingDepth || [0, 0, 0];
  } catch (error) {
    console.error('Error al obtener profundidades de sondaje:', error);
    return [0, 0, 0];
  }
};

/**
 * Calcula la profundidad promedio de un diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @returns {number} Profundidad promedio en milímetros
 */
export const calculateToothAverageDepth = (periodontogramData, toothNumber) => {
  try {
    const depths = getToothProbingDepths(periodontogramData, toothNumber);
    const validDepths = depths.filter(depth => depth > 0);
    
    if (validDepths.length === 0) return 0;
    
    const average = validDepths.reduce((sum, depth) => sum + depth, 0) / validDepths.length;
    return Math.round(average * 10) / 10; // Redondear a 1 decimal
  } catch (error) {
    console.error('Error al calcular profundidad promedio del diente:', error);
    return 0;
  }
};

/**
 * Calcula la profundidad promedio global
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {number} Profundidad promedio global en milímetros
 */
export const calculateGlobalAverageDepth = (periodontogramData) => {
  try {
    // Importar lista de dientes permanentes
    const PERMANENT_TEETH_LIST = [
      11, 12, 13, 14, 15, 16, 17, 18,
      21, 22, 23, 24, 25, 26, 27, 28,
      31, 32, 33, 34, 35, 36, 37, 38,
      41, 42, 43, 44, 45, 46, 47, 48
    ];
    
    // Fórmula modificada: Media PS = ∑profundidades / número total de sitios de dientes presentes
    const data = getAllTeethData(periodontogramData);
    let totalDepth = 0;
    let totalMeasurements = 0;
    
    // Iterar sobre TODOS los dientes permanentes posibles
    PERMANENT_TEETH_LIST.forEach(toothNumber => {
      const toothData = data[toothNumber];
      
      // Solo contar dientes presentes (no ausentes)
      if (toothData && !toothData.absent) {
        // Cada diente tiene 6 sitios de profundidad (3 vestibular + 3 palatino/lingual)
        const sitesPerTooth = 6;
        totalMeasurements += sitesPerTooth;
        
        if (Array.isArray(toothData.probingDepth)) {
          // Incluir TODOS los sitios, incluso los que tienen valor 0
          toothData.probingDepth.forEach(depth => {
            const depthValue = depth || 0; // Tratar valores null/undefined como 0
            totalDepth += depthValue;
          });
        } else {
          // Si no hay datos de profundidad, asumir 0 para todos los sitios
          // No se suma nada a totalDepth (equivale a sumar 0 * sitesPerTooth)
        }
      }
    });
    
    return totalMeasurements > 0 ? Math.round((totalDepth / totalMeasurements) * 100) / 100 : 0;
  } catch (error) {
    console.error('Error al calcular profundidad promedio global:', error);
    return 0;
  }
};

/**
 * Clasifica la profundidad de sondaje según severidad
 * @param {number} depth - Profundidad en milímetros
 * @returns {Object} Clasificación de la profundidad
 */
export const classifyProbingDepth = (depth) => {
  if (depth <= 3) {
    return {
      category: 'normal',
      severity: 'saludable',
      color: '#4CAF50',
      description: 'Profundidad normal'
    };
  } else if (depth <= 4) {
    return {
      category: 'mild',
      severity: 'leve',
      color: '#8BC34A',
      description: 'Gingivitis leve'
    };
  } else if (depth <= 6) {
    return {
      category: 'moderate',
      severity: 'moderada',
      color: '#FF9800',
      description: 'Periodontitis moderada'
    };
  } else {
    return {
      category: 'severe',
      severity: 'severa',
      color: '#F44336',
      description: 'Periodontitis severa'
    };
  }
};

/**
 * Obtiene estadísticas de profundidad de sondaje
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {Object} Estadísticas detalladas
 */
export const getProbingDepthStatistics = (periodontogramData) => {
  try {
    // Importar lista de dientes permanentes
    const PERMANENT_TEETH_LIST = [
      11, 12, 13, 14, 15, 16, 17, 18,
      21, 22, 23, 24, 25, 26, 27, 28,
      31, 32, 33, 34, 35, 36, 37, 38,
      41, 42, 43, 44, 45, 46, 47, 48
    ];
    
    const data = getAllTeethData(periodontogramData);
    const stats = {
      normal: 0,      // <= 3mm
      mild: 0,        // 4mm
      moderate: 0,    // 5-6mm
      severe: 0       // >= 7mm
    };
    
    let totalMeasurements = 0;
    let totalDepth = 0;
    let maxDepth = 0;
    
    // Iterar sobre TODOS los dientes permanentes posibles
    PERMANENT_TEETH_LIST.forEach(toothNumber => {
      const toothData = data[toothNumber];
      
      // Solo contar dientes presentes (no ausentes)
      if (toothData && !toothData.absent) {
        // Cada diente tiene 6 sitios de profundidad (3 vestibular + 3 palatino/lingual)
        const sitesPerTooth = 6;
        totalMeasurements += sitesPerTooth;
        
        if (Array.isArray(toothData.probingDepth)) {
          // Incluir TODOS los sitios, incluso los que tienen valor 0
          toothData.probingDepth.forEach(depth => {
            const depthValue = depth || 0; // Tratar valores null/undefined como 0
            totalDepth += depthValue;
            maxDepth = Math.max(maxDepth, depthValue);
            
            const classification = classifyProbingDepth(depthValue);
            stats[classification.category]++;
          });
        } else {
          // Si no hay datos de profundidad, asumir 0 para todos los sitios
          for (let i = 0; i < sitesPerTooth; i++) {
            const classification = classifyProbingDepth(0);
            stats[classification.category]++;
          }
          // totalDepth no se incrementa (equivale a sumar 0 * sitesPerTooth)
        }
      }
    });
    
    const averageDepth = totalMeasurements > 0 ? Math.round((totalDepth / totalMeasurements) * 10) / 10 : 0;
    
    return {
      distribution: stats,
      totalMeasurements,
      averageDepth,
      maxDepth,
      percentageSevere: totalMeasurements > 0 ? Math.round((stats.severe / totalMeasurements) * 100) : 0,
      percentageHealthy: totalMeasurements > 0 ? Math.round((stats.normal / totalMeasurements) * 100) : 0
    };
  } catch (error) {
    console.error('Error al calcular estadísticas de profundidad:', error);
    return {
      distribution: { normal: 0, mild: 0, moderate: 0, severe: 0 },
      totalMeasurements: 0,
      averageDepth: 0,
      maxDepth: 0,
      percentageSevere: 0,
      percentageHealthy: 0
    };
  }
};

/**
 * Obtiene las bolsas severas (>= 7mm)
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {Array} Array de objetos con información de bolsas severas
 */
export const getSeverePockets = (periodontogramData) => {
  try {
    const data = getAllTeethData(periodontogramData);
    const severePockets = [];
    
    Object.entries(data).forEach(([toothNumber, toothData]) => {
      if (!toothData.absent && Array.isArray(toothData.probingDepth)) {
        toothData.probingDepth.forEach((depth, zoneIndex) => {
          if (depth >= 7) {
            severePockets.push({
              toothNumber: parseInt(toothNumber),
              zone: ['mesial', 'central', 'distal'][zoneIndex],
              depth,
              severity: classifyProbingDepth(depth).severity
            });
          }
        });
      }
    });
    
    return severePockets.sort((a, b) => b.depth - a.depth); // Ordenar por profundidad descendente
  } catch (error) {
    console.error('Error al obtener bolsas severas:', error);
    return [];
  }
};

/**
 * Calcula el porcentaje de bolsas severas
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {number} Porcentaje de bolsas severas
 */
export const calculateSeverePocketsPercentage = (periodontogramData) => {
  try {
    const stats = getProbingDepthStatistics(periodontogramData);
    return stats.percentageSevere;
  } catch (error) {
    console.error('Error al calcular porcentaje de bolsas severas:', error);
    return 0;
  }
};

/**
 * Limpia todas las profundidades de sondaje
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @returns {PeriodontogramData} Nueva instancia sin profundidades
 */
export const clearAllProbingDepths = (periodontogramData) => {
  try {
    const newData = clonePeriodontogramData(periodontogramData);
    const allTeeth = getAllTeethData(newData);
    
    Object.keys(allTeeth).forEach(toothNumber => {
      newData.updateTooth(parseInt(toothNumber), {
        probingDepth: [0, 0, 0]
      });
    });
    
    // Profundidades de sondaje limpiadas
    return newData;
  } catch (error) {
    console.error('Error al limpiar profundidades de sondaje:', error);
    return periodontogramData;
  }
};

// ============================================================================
// FUNCIONES DE MARGEN GINGIVAL
// ============================================================================

/**
 * Actualiza el margen gingival en una zona específica del diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {number} zoneIndex - Índice de la zona (0: mesial, 1: central, 2: distal)
 * @param {number} margin - Margen en milímetros (-10 a +10)
 * @returns {PeriodontogramData} Nueva instancia con el margen actualizado
 */
export const updateGingivalMargin = (periodontogramData, toothNumber, zoneIndex, margin) => {
  try {
    const newData = clonePeriodontogramData(periodontogramData);
    const currentTooth = getToothData(newData, toothNumber);
    const gingivalMargin = currentTooth.gingivalMargin || [0, 0, 0];
    
    // Validar y limitar el margen
    const clampedMargin = Math.max(-10, Math.min(10, Number(margin) || 0));
    gingivalMargin[zoneIndex] = clampedMargin;
    
    newData.updateTooth(toothNumber, {
      gingivalMargin: [...gingivalMargin]
    });
    
    // Margen gingival actualizado
    return newData;
  } catch (error) {
    console.error('Error al actualizar margen gingival:', error);
    return periodontogramData;
  }
};

/**
 * Calcula el margen gingival promedio global
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {number} Margen promedio global en milímetros
 */
export const calculateGlobalAverageMargin = (periodontogramData) => {
  try {
    // Importar lista de dientes permanentes
    const PERMANENT_TEETH_LIST = [
      11, 12, 13, 14, 15, 16, 17, 18,
      21, 22, 23, 24, 25, 26, 27, 28,
      31, 32, 33, 34, 35, 36, 37, 38,
      41, 42, 43, 44, 45, 46, 47, 48
    ];
    
    // Fórmula modificada: Media MG = ∑márgenes / número total de sitios de dientes presentes
    const data = getAllTeethData(periodontogramData);
    let totalMargin = 0;
    let totalMeasurements = 0;
    
    // Iterar sobre TODOS los dientes permanentes posibles
    PERMANENT_TEETH_LIST.forEach(toothNumber => {
      const toothData = data[toothNumber];
      
      // Solo contar dientes presentes (no ausentes)
      if (toothData && !toothData.absent) {
        // Cada diente tiene 6 sitios de margen gingival (3 vestibular + 3 palatino/lingual)
        const sitesPerTooth = 6;
        totalMeasurements += sitesPerTooth;
        
        if (Array.isArray(toothData.gingivalMargin)) {
          // Incluir TODOS los sitios, incluso los que tienen valor 0
          toothData.gingivalMargin.forEach(margin => {
            const marginValue = margin || 0; // Tratar valores null/undefined como 0
            totalMargin += marginValue;
          });
        } else {
          // Si no hay datos de margen, asumir 0 para todos los sitios
          // No se suma nada a totalMargin (equivale a sumar 0 * sitesPerTooth)
        }
      }
    });
    
    return totalMeasurements > 0 ? Math.round((totalMargin / totalMeasurements) * 100) / 100 : 0;
  } catch (error) {
    console.error('Error al calcular margen gingival promedio:', error);
    return 0;
  }
};

// ============================================================================
// FUNCIONES DE ANCHO DE ENCÍA QUERATINIZADA
// ============================================================================

/**
 * Actualiza el ancho de encía queratinizada en una zona específica del diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {number} zoneIndex - Índice de la zona (0: mesial, 1: central, 2: distal)
 * @param {number} width - Ancho en milímetros (-99 a 99)
 * @returns {PeriodontogramData} Nueva instancia con el ancho actualizado
 */
export const updateGumWidth = (periodontogramData, toothNumber, width) => {
  try {
    const newData = clonePeriodontogramData(periodontogramData);
    const clampedWidth = Math.max(-99, Math.min(99, Number(width) || 0));

    newData.updateTooth(toothNumber, {
      anchuraEncia: clampedWidth
    });

    return newData;
  } catch (error) {
    console.error('Error al actualizar ancho de encía:', error);
    return periodontogramData;
  }
};

/**
 * Calcula el ancho de encía promedio global
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {number} Ancho promedio global en milímetros
 */
export const calculateGlobalAverageGumWidth = (periodontogramData) => {
  try {
    const data = getAllTeethData(periodontogramData);
    let totalWidth = 0;
    let totalMeasurements = 0;

    Object.entries(data).forEach(([toothNumber, toothData]) => {
      if (!toothData.absent && typeof toothData.anchuraEncia === 'number') {
        const width = Number(toothData.anchuraEncia) || 0;
        if (width > 0) {
          totalWidth += width;
          totalMeasurements++;
        }
      }
    });

    if (totalMeasurements === 0) return 0;

    const average = totalWidth / totalMeasurements;
    return Math.round(average * 10) / 10; // Redondear a 1 decimal
  } catch (error) {
    console.error('Error al calcular ancho de encía promedio:', error);
    return 0;
  }
};

// ============================================================================
// FUNCIONES DE ANÁLISIS INTEGRADO
// ============================================================================

/**
 * Calcula el nivel de inserción clínica (NIC)
 * @param {number} probingDepth - Profundidad de sondaje
 * @param {number} gingivalMargin - Margen gingival
 * @returns {number} Nivel de inserción clínica
 */
export const calculateClinicalAttachmentLevel = (probingDepth, gingivalMargin) => {
  // NIC = Profundidad de sondaje + Recesión gingival
  // Fórmula clínica estándar: NIC = PS + MG
  // Si el margen es negativo (recesión), se suma la recesión
  // Si el margen es positivo (hiperplasia), se suma la hiperplasia
  return probingDepth + gingivalMargin;
};

/**
 * Calcula el nivel de inserción clínica promedio global
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {number} NIC promedio global en milímetros
 */
export const calculateGlobalAverageNIC = (periodontogramData) => {
  try {
    // Fórmula clínica estándar: Media NIC = ∑(profundidad + margen) / número de sitios con valor
    // NIC = Profundidad de Sondaje + Margen Gingival (según estándares SEPA)
    const data = getAllTeethData(periodontogramData);
    let totalNIC = 0;
    let totalMeasurements = 0;
    
    Object.entries(data).forEach(([toothNumber, toothData]) => {
      if (!toothData.absent && 
          Array.isArray(toothData.probingDepth) && 
          Array.isArray(toothData.gingivalMargin)) {
        
        toothData.probingDepth.forEach((depth, index) => {
          const margin = toothData.gingivalMargin[index] || 0;
          
          // Solo incluir sitios con valores válidos de profundidad
          if (depth > 0) {
            const nic = calculateClinicalAttachmentLevel(depth, margin);
            totalNIC += nic;
            totalMeasurements++;
          }
        });
      }
    });
    
    return totalMeasurements > 0 ? Math.round((totalNIC / totalMeasurements) * 100) / 100 : 0;
  } catch (error) {
    console.error('Error al calcular NIC promedio global:', error);
    return 0;
  }
};

/**
 * Obtiene estadísticas completas de mediciones
 * @param {PeriodontogramData|Object} periodontogramData - Instancia de datos del periodontograma
 * @returns {Object} Estadísticas completas
 */
export const getComprehensiveMeasurementStats = (periodontogramData) => {
  try {
    const probingStats = getProbingDepthStatistics(periodontogramData);
    const averageMargin = calculateGlobalAverageMargin(periodontogramData);
    const averageGumWidth = calculateGlobalAverageGumWidth(periodontogramData);
    const averageNIC = calculateGlobalAverageNIC(periodontogramData);
    
    return {
      probingDepth: probingStats,
      gingivalMargin: {
        average: averageMargin,
        interpretation: averageMargin < 0 ? 'Recesión predominante' : 
                       averageMargin > 0 ? 'Hiperplasia predominante' : 'Normal'
      },
      gumWidth: {
        average: averageGumWidth,
        interpretation: averageGumWidth < 2 ? 'Encía queratinizada insuficiente' : 'Adecuada'
      },
      clinicalAttachmentLevel: {
        average: averageNIC,
        interpretation: averageNIC <= 3 ? 'Nivel de inserción normal' :
                       averageNIC <= 5 ? 'Pérdida de inserción leve' :
                       averageNIC <= 7 ? 'Pérdida de inserción moderada' : 'Pérdida de inserción severa'
      }
    };
  } catch (error) {
    console.error('Error al calcular estadísticas completas:', error);
    return {
      probingDepth: { distribution: {}, totalMeasurements: 0, averageDepth: 0 },
      gingivalMargin: { average: 0, interpretation: 'Error' },
      gumWidth: { average: 0, interpretation: 'Error' },
      clinicalAttachmentLevel: { average: 0, interpretation: 'Error' }
    };
  }
};

// ============================================================================
// EXPORTACIONES AGRUPADAS
// ============================================================================

export const ProbingDepthOperations = {
  update: updateProbingDepth,
  getToothDepths: getToothProbingDepths,
  calculateToothAverage: calculateToothAverageDepth,
  calculateGlobalAverage: calculateGlobalAverageDepth,
  classify: classifyProbingDepth,
  getStatistics: getProbingDepthStatistics,
  getSeverePockets: getSeverePockets,
  calculateSeverePercentage: calculateSeverePocketsPercentage,
  clearAll: clearAllProbingDepths
};

export const GingivalMarginOperations = {
  update: updateGingivalMargin,
  calculateGlobalAverage: calculateGlobalAverageMargin
};

export const GumWidthOperations = {
  update: updateGumWidth,
  calculateGlobalAverage: calculateGlobalAverageGumWidth
};

export const MeasurementAnalysis = {
  calculateClinicalAttachmentLevel,
  calculateGlobalAverageNIC,
  getComprehensiveStats: getComprehensiveMeasurementStats
};

export const Measurements = {
  ProbingDepth: ProbingDepthOperations,
  GingivalMargin: GingivalMarginOperations,
  GumWidth: GumWidthOperations,
  Analysis: MeasurementAnalysis
};

export default Measurements;