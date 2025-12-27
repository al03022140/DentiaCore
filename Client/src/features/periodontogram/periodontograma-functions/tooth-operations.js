/**
 * ToothOperations.js
 * Módulo consolidado para operaciones básicas de dientes
 * Combina: ToothFunction.js, CoordinateFunction.js, DataUtilityFunction.js
 * 
 * Funcionalidades:
 * - Presencia/ausencia de dientes
 * - Implantes
 * - Validaciones FDI
 * - Coordenadas y posicionamiento
 * - Utilidades de datos
 */

// PeriodontogramData ahora se maneja completamente en el backend
import { clonePeriodontogramData, getToothData, updateToothData } from '../utils/periodontogram-utils';
import { isValidToothNumber, getToothPosition, getToothSection } from '../utils/periodontogram-utils';
// import PeriodontogramLogger from '../logger';

// ============================================================================
// OPERACIONES BÁSICAS DE DIENTES
// ============================================================================

/**
 * Alterna el estado de ausencia/presencia de un diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @returns {PeriodontogramData} Nueva instancia con el diente actualizado
 */
// FUNCIÓN toggleToothAbsent ELIMINADA - No se manejan datos de dientes individuales

/**
 * Marca un diente como implante
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {boolean} isImplant - Si es implante o no
 * @returns {PeriodontogramData} Nueva instancia con el diente actualizado
 */
export const toggleToothImplant = (periodontogramData, toothNumber, isImplant = true) => {
  try {
    const newData = clonePeriodontogramData(periodontogramData);
    
    const updatedData = updateToothData(newData, toothNumber, {
      isImplant: isImplant,
      absent: false
    });
    
    console.log(`Diente ${toothNumber} marcado como ${isImplant ? 'implante' : 'diente natural'}`);
    return updatedData;
  } catch (error) {
    console.error('Error al marcar implante:', error);
    return periodontogramData;
  }
};

/**
 * Resetea todos los datos clínicos de un diente
 * @param {PeriodontogramData} periodontogramData - Instancia de datos del periodontograma
 * @param {number} toothNumber - Número del diente (FDI)
 * @returns {PeriodontogramData} Nueva instancia con el diente reseteado
 */
// FUNCIÓN resetToothClinicalData ELIMINADA - No se manejan datos de dientes individuales

// ============================================================================
// VALIDACIONES Y UTILIDADES FDI
// ============================================================================

// Función isValidToothNumber eliminada - usar la implementación de PeriodontogramUtils.js

/**
 * Obtiene el cuadrante de un diente
 * @param {number} toothNumber - Número del diente
 * @returns {number} Número del cuadrante (1-4)
 */
export const getToothQuadrant = (toothNumber) => {
  return Math.floor(toothNumber / 10);
};

// Función getToothPosition eliminada - usar la implementación de PeriodontogramUtils.js

// Función getToothSection eliminada - usar la implementación de PeriodontogramUtils.js

/**
 * Determina si un diente es molar
 * @param {number} toothNumber - Número del diente
 * @returns {boolean} True si es molar
 */
export const isMolar = (toothNumber) => {
  const position = getToothPosition(toothNumber);
  return position >= 6; // Molares son posiciones 6, 7, 8
};

/**
 * Determina si un diente es premolar
 * @param {number} toothNumber - Número del diente
 * @returns {boolean} True si es premolar
 */
export const isPremolar = (toothNumber) => {
  const position = getToothPosition(toothNumber);
  return position === 4 || position === 5;
};

// ============================================================================
// COORDENADAS Y POSICIONAMIENTO
// ============================================================================

/**
 * Calcula las coordenadas base de un diente en el canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} canvasConfig - Configuración del canvas
 * @returns {Object} Coordenadas {x, y}
 */
export const getToothBaseCoordinates = (toothNumber, canvasConfig) => {
  const quadrant = getToothQuadrant(toothNumber);
  const position = getToothPosition(toothNumber);
  
  const {
    width = 800,
    height = 600,
    toothWidth = 40,
    toothHeight = 60,
    marginX = 50,
    marginY = 50
  } = canvasConfig;
  
  // Calcular posición base según cuadrante
  let baseX, baseY;
  
  switch (quadrant) {
    case 1: // Superior derecho
      baseX = width / 2 - (position * toothWidth);
      baseY = marginY;
      break;
    case 2: // Superior izquierdo
      baseX = width / 2 + ((position - 1) * toothWidth);
      baseY = marginY;
      break;
    case 3: // Inferior izquierdo
      baseX = width / 2 + ((position - 1) * toothWidth);
      baseY = height - marginY - toothHeight;
      break;
    case 4: // Inferior derecho
      baseX = width / 2 - (position * toothWidth);
      baseY = height - marginY - toothHeight;
      break;
    default:
      baseX = 0;
      baseY = 0;
  }
  
  return { x: baseX, y: baseY };
};

/**
 * Calcula las coordenadas de las zonas de medición de un diente
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} canvasConfig - Configuración del canvas
 * @returns {Array} Array de coordenadas para cada zona
 */
export const getToothZoneCoordinates = (toothNumber, canvasConfig) => {
  const baseCoords = getToothBaseCoordinates(toothNumber, canvasConfig);
  const { toothWidth = 40 } = canvasConfig;
  
  const zoneWidth = toothWidth / 3;
  
  return [
    { x: baseCoords.x, y: baseCoords.y, width: zoneWidth }, // Mesial
    { x: baseCoords.x + zoneWidth, y: baseCoords.y, width: zoneWidth }, // Central
    { x: baseCoords.x + (zoneWidth * 2), y: baseCoords.y, width: zoneWidth } // Distal
  ];
};

// ============================================================================
// UTILIDADES DE DATOS
// ============================================================================

/**
 * Obtiene las propiedades de accesibilidad para el botón del número de diente
 * @param {number} toothNumber - Número del diente
 * @param {boolean} isAbsent - Si el diente está ausente
 * @returns {Object} Propiedades de accesibilidad
 */
export const getToothNumberButtonProps = (toothNumber, isAbsent) => {
  return {
    'aria-pressed': isAbsent,
    'aria-label': `Diente ${toothNumber}, ${isAbsent ? 'ausente' : 'presente'}. Clic para ${isAbsent ? 'marcar como presente' : 'marcar como ausente'}`,
    'role': 'button',
    'tabIndex': 0
  };
};

/**
 * Normaliza los datos de un diente para asegurar estructura consistente
 * @param {Object} toothData - Datos del diente
 * @returns {Object} Datos normalizados
 */
export const normalizeToothData = (toothData) => {
  return {
    absent: Boolean(toothData.absent ?? false),
    isImplant: Boolean(toothData.isImplant ?? false),
    bleeding: (toothData.bleeding && typeof toothData.bleeding === 'object' && !Array.isArray(toothData.bleeding)) 
      ? toothData.bleeding 
      : {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
    plaque: (toothData.plaque && typeof toothData.plaque === 'object' && !Array.isArray(toothData.plaque)) 
      ? toothData.plaque 
      : {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
    probingDepth: Array.isArray(toothData.probingDepth) ? toothData.probingDepth : [0, 0, 0],
    gingivalMargin: Array.isArray(toothData.gingivalMargin) ? toothData.gingivalMargin : [0, 0, 0],
    mobility: Number(toothData.mobility ?? 0),
    furca: {
      vestibular: Number(toothData.furca?.vestibular ?? 0),
      lingual: Number(toothData.furca?.lingual ?? 0),
      mesial: Number(toothData.furca?.mesial ?? 0),
      distal: Number(toothData.furca?.distal ?? 0)
    },
    notes: String(toothData.notes ?? '')
  };
};

// validateToothData eliminada - usar UniversalToothValidator.validateCompleteToothData

// ============================================================================
// EXPORTACIONES AGRUPADAS
// ============================================================================

export const ToothOperations = {
  // Operaciones básicas
  toggleImplant: toggleToothImplant,
  
  // Validaciones
  isValid: isValidToothNumber,
  getQuadrant: getToothQuadrant,
  getPosition: getToothPosition,
  getSection: getToothSection,
  isMolar,
  isPremolar,
  
  // Coordenadas
  getBaseCoordinates: getToothBaseCoordinates,
  getZoneCoordinates: getToothZoneCoordinates,
  
  // Utilidades
  getButtonProps: getToothNumberButtonProps,
  normalize: normalizeToothData,
  // validateData eliminada - usar UniversalToothValidator.validateCompleteToothData
};

// Alias de compatibilidad: algunas capas superiores esperan getToothCoordinates
export const getToothCoordinates = getToothBaseCoordinates;

export default ToothOperations;