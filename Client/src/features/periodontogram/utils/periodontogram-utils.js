/**
 * Utilidades del Periodontograma - Versión Consolidada
 * Elimina duplicaciones y normaliza funciones utilitarias
 * Sigue convenciones de nomenclatura estrictas
 */

import PERIODONTOGRAM_CONFIG from '../../../shared/config/periodontogram-config.js';
import { UniversalToothValidator } from '../../../shared/validators/universal-tooth-validator.js';

/**
 * Constantes consolidadas del periodontograma
 */
export const TOOTH_ZONES = {
  VESTIBULAR: 'vestibular',
  LINGUAL: 'lingual',
  PALATINO: 'palatino'
};

export const TOOTH_TYPES = {
  NORMAL: 'tooth',
  IMPLANT: 'implant', 
  ABSENT: 'cross'
};

export const TOOTH_SECTIONS = {
  UPPER: 'up',
  LOWER: 'down'
};

export const MOBILITY_LEVELS = {
  NONE: 0,
  GRADE_1: 1,
  GRADE_2: 2,
  GRADE_3: 3
};

export const FURCA_LEVELS = {
  NONE: 0,
  GRADE_1: 1,
  GRADE_2: 2,
  GRADE_3: 3
};

/**
 * Cache para optimización de rendimiento
 */
const _cache = {
  toothPositions: new Map(),
  imagePaths: new Map(),
  validationResults: new Map(),
  toothNames: new Map()
};

/**
 * Mapeos de dientes consolidados
 */
const UPPER_TEETH = PERIODONTOGRAM_CONFIG.PERMANENT_TEETH.filter(tooth => 
  Math.floor(tooth / 10) === 1 || Math.floor(tooth / 10) === 2
);

const LOWER_TEETH = PERIODONTOGRAM_CONFIG.PERMANENT_TEETH.filter(tooth => 
  Math.floor(tooth / 10) === 3 || Math.floor(tooth / 10) === 4
);

const UPPER_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17];
const LOWER_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17];

/**
 * Clase principal de utilidades del periodontograma consolidada
 */
export class PeriodontogramUtils {
  
  /**
   * Obtiene la posición del diente para imágenes (1-17, saltándose el 9)
   * Función unificada con memoización
   */
  static getToothPosition(toothNumber) {
    if (_cache.toothPositions.has(toothNumber)) {
      return _cache.toothPositions.get(toothNumber);
    }
    
    let position = 1;
    
    const upperIndex = UPPER_TEETH.indexOf(toothNumber);
    if (upperIndex !== -1) {
      position = UPPER_POSITIONS[upperIndex];
    } else {
      const lowerIndex = LOWER_TEETH.indexOf(toothNumber);
      if (lowerIndex !== -1) {
        position = LOWER_POSITIONS[lowerIndex];
      } else {
        console.warn(`[PeriodontogramUtils] Número de diente inválido: ${toothNumber}`);
      }
    }
    
    _cache.toothPositions.set(toothNumber, position);
    return position;
  }

  /**
   * Obtiene la ruta de imagen del diente con cache optimizado
   */
  static getToothImagePath(toothNumber, type = TOOTH_TYPES.NORMAL, zone = TOOTH_ZONES.VESTIBULAR) {
    const cacheKey = `${toothNumber}-${type}-${zone}`;
    
    if (_cache.imagePaths.has(cacheKey)) {
      return _cache.imagePaths.get(cacheKey);
    }
    
    // Validar usando UniversalToothValidator
    if (!UniversalToothValidator.isValidToothNumber(toothNumber)) {
      console.warn(`[PeriodontogramUtils] Número de diente inválido: ${toothNumber}`);
      const fallbackPath = `/images/Periodontogram/${TOOTH_TYPES.NORMAL}/${TOOTH_SECTIONS.UPPER}1.png`;
      _cache.imagePaths.set(cacheKey, fallbackPath);
      return fallbackPath;
    }

    const section = this.getToothSection(toothNumber);
    const position = this.getToothPosition(toothNumber);
    
    const typeMapping = {
      'tooth': TOOTH_TYPES.NORMAL,
      'teeth': TOOTH_TYPES.NORMAL,
      'normal': TOOTH_TYPES.NORMAL,
      'implant': TOOTH_TYPES.IMPLANT,
      'implants': TOOTH_TYPES.IMPLANT,
      'cross': TOOTH_TYPES.ABSENT,
      'absent': TOOTH_TYPES.ABSENT
    };
    
    const mappedType = typeMapping[type.toLowerCase()] || TOOTH_TYPES.NORMAL;
    const isLingual = this.isLingualZone(toothNumber, zone);
    const suffix = isLingual ? 'b' : '';
    
    const imagePath = `/images/Periodontogram/${mappedType}/${section}${position}${suffix}.png`;
    _cache.imagePaths.set(cacheKey, imagePath);
    
    return imagePath;
  }

  /**
   * Obtiene la ruta de imagen de fondo del diente
   */
  static getToothBackgroundImagePath(toothNumber) {
    const section = this.getToothSection(toothNumber);
    return `/images/Periodontogram/background/${section}.png`;
  }

  /**
   * Determina la sección del diente (superior/inferior)
   */
  static getToothSection(toothNumber) {
    return (toothNumber >= 11 && toothNumber <= 28) ? TOOTH_SECTIONS.UPPER : TOOTH_SECTIONS.LOWER;
  }

  /**
   * Determina si la zona es lingual/palatina
   */
  static isLingualZone(toothNumber, zone) {
    const section = this.getToothSection(toothNumber);
    
    if (section === TOOTH_SECTIONS.UPPER) {
      return zone === TOOTH_ZONES.PALATINO;
    } else {
      return zone === TOOTH_ZONES.LINGUAL;
    }
  }

  /**
   * Valida si un número de diente FDI es válido
   * Delegado al UniversalToothValidator para evitar duplicación
   */
  static isValidToothNumber(toothNumber) {
    return UniversalToothValidator.isValidToothNumber(toothNumber);
  }

  /**
   * Obtiene el nombre del diente con cache
   */
  static getToothName(toothNumber) {
    if (_cache.toothNames.has(toothNumber)) {
      return _cache.toothNames.get(toothNumber);
    }
    
    const names = {
      // Cuadrante 1 (Superior derecho)
      11: 'Incisivo central superior derecho',
      12: 'Incisivo lateral superior derecho',
      13: 'Canino superior derecho',
      14: 'Primer premolar superior derecho',
      15: 'Segundo premolar superior derecho',
      16: 'Primer molar superior derecho',
      17: 'Segundo molar superior derecho',
      18: 'Tercer molar superior derecho',
      
      // Cuadrante 2 (Superior izquierdo)
      21: 'Incisivo central superior izquierdo',
      22: 'Incisivo lateral superior izquierdo',
      23: 'Canino superior izquierdo',
      24: 'Primer premolar superior izquierdo',
      25: 'Segundo premolar superior izquierdo',
      26: 'Primer molar superior izquierdo',
      27: 'Segundo molar superior izquierdo',
      28: 'Tercer molar superior izquierdo',
      
      // Cuadrante 3 (Inferior izquierdo)
      31: 'Incisivo central inferior izquierdo',
      32: 'Incisivo lateral inferior izquierdo',
      33: 'Canino inferior izquierdo',
      34: 'Primer premolar inferior izquierdo',
      35: 'Segundo premolar inferior izquierdo',
      36: 'Primer molar inferior izquierdo',
      37: 'Segundo molar inferior izquierdo',
      38: 'Tercer molar inferior izquierdo',
      
      // Cuadrante 4 (Inferior derecho)
      41: 'Incisivo central inferior derecho',
      42: 'Incisivo lateral inferior derecho',
      43: 'Canino inferior derecho',
      44: 'Primer premolar inferior derecho',
      45: 'Segundo premolar inferior derecho',
      46: 'Primer molar inferior derecho',
      47: 'Segundo molar inferior derecho',
      48: 'Tercer molar inferior derecho'
    };
    
    const name = names[toothNumber] || `Diente ${toothNumber}`;
    _cache.toothNames.set(toothNumber, name);
    return name;
  }

  /**
   * Obtiene el cuadrante del diente
   * Delegado a PERIODONTOGRAM_CONFIG para evitar duplicación
   */
  static getToothQuadrant(toothNumber) {
    return PERIODONTOGRAM_CONFIG.getToothQuadrant(toothNumber);
  }

  /**
   * Determina el color según el valor clínico usando configuración centralizada
   */
  static getColorByValue(value, type = 'depth') {
    const numValue = parseFloat(value);
    
    if (type === 'depth') {
      return PERIODONTOGRAM_CONFIG.getIndicatorColor('probingDepth', numValue);
    }
    
    if (type === 'margin') {
      if (numValue >= 0) return PERIODONTOGRAM_CONFIG.UI_COLORS.gingivalMargin.recession;
      return PERIODONTOGRAM_CONFIG.UI_COLORS.gingivalMargin.inflammation;
    }
    
    return '#000000';
  }

  /**
   * Interpreta el valor clínico
   */
  static getInterpretation(value, type = 'depth') {
    const numValue = parseFloat(value);
    
    if (type === 'depth') {
      if (numValue <= 3) return 'Saludable';
      if (numValue <= 5) return 'Gingivitis/Periodontitis leve';
      return 'Periodontitis moderada a severa';
    }
    
    if (type === 'margin') {
      if (numValue >= 0) return 'Recesión gingival';
      return 'Inflamación/Hiperplasia';
    }
    
    return 'Sin interpretación';
  }

  /**
   * Obtiene todos los dientes de una arcada
   */
  static getArchTeeth(arch) {
    if (arch === 'upper') {
      return [...UPPER_TEETH];
    }
    if (arch === 'lower') {
      return [...LOWER_TEETH];
    }
    return [];
  }

  /**
   * Obtiene todos los dientes válidos
   */
  static getAllTeeth() {
    return [...UPPER_TEETH, ...LOWER_TEETH];
  }

  /**
   * Determina si un diente puede tener furca
   */
  static canHaveFurca(toothNumber, isVestibular = true, isPalatine = false) {
    // Usar configuración centralizada si está disponible
    if (PERIODONTOGRAM_CONFIG.isMolar && PERIODONTOGRAM_CONFIG.isMolar(toothNumber)) {
      return true;
    }
    
    // Fallback a lógica específica
    const upperVestibularFurca = [18, 17, 16, 26, 27, 28];
    const upperPalatineFurca = [18, 17, 16, 14, 24, 26, 27, 28];
    const lowerFurca = [48, 47, 46, 36, 37, 38];
    
    if (UPPER_TEETH.includes(toothNumber)) {
      if (isPalatine) {
        return upperPalatineFurca.includes(toothNumber);
      } else {
        return upperVestibularFurca.includes(toothNumber);
      }
    } else if (LOWER_TEETH.includes(toothNumber)) {
      return lowerFurca.includes(toothNumber);
    }
    return false;
  }

  /**
   * Determina si un diente palatino necesita doble entrada de furca
   */
  static needsDoubleFurca(toothNumber) {
    const doubleFurcaTeeth = [18, 17, 16, 14, 24, 26, 27, 28];
    return doubleFurcaTeeth.includes(toothNumber);
  }

  /**
   * Obtiene los dientes superiores
   */
  static getUpperTeeth() {
    return [...UPPER_TEETH];
  }

  /**
   * Obtiene los dientes inferiores
   */
  static getLowerTeeth() {
    return [...LOWER_TEETH];
  }

  /**
   * Obtiene el color para el valor de placa usando configuración centralizada
   */
  static getPlaqueColor(value) {
    return PERIODONTOGRAM_CONFIG.getIndicatorColor('plaque', value);
  }

  /**
   * Obtiene el color para profundidad de sondaje usando configuración centralizada
   */
  static getProbingDepthColor(value) {
    return PERIODONTOGRAM_CONFIG.getIndicatorColor('probingDepth', value);
  }

  /**
   * Calcula índice de severidad periodontal
   */
  static calculatePeriodontalSeverity(avgDepth, bleedingPercentage, plaquePercentage) {
    let score = 0;
    
    // Profundidad de sondaje
    if (avgDepth > 6) score += 3;
    else if (avgDepth > 4) score += 2;
    else if (avgDepth > 3) score += 1;
    
    // Sangrado
    if (bleedingPercentage > 50) score += 3;
    else if (bleedingPercentage > 25) score += 2;
    else if (bleedingPercentage > 10) score += 1;
    
    // Placa
    if (plaquePercentage > 50) score += 2;
    else if (plaquePercentage > 25) score += 1;
    
    if (score <= 2) return { level: 'mild', text: 'Periodontitis leve' };
    if (score <= 5) return { level: 'moderate', text: 'Periodontitis moderada' };
    return { level: 'severe', text: 'Periodontitis severa' };
  }

  /**
   * Obtiene arrays optimizados de dientes para las 4 caras específicas del periodontograma
   * Orden estándar dental: derecha a izquierda del paciente
   */
  static getOptimizedToothArrays() {
    return {
      upperVestibular: [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28],
      upperPalatine: [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28],
      lowerVestibular: [41, 42, 43, 44, 45, 46, 47, 48, 31, 32, 33, 34, 35, 36, 37, 38],
      lowerLingual: [41, 42, 43, 44, 45, 46, 47, 48, 31, 32, 33, 34, 35, 36, 37, 38]
    };
  }

  /**
   * Obtiene los dientes superiores vestibulares
   */
  static getUpperVestibular() {
    return [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28];
  }

  /**
   * Obtiene los dientes superiores palatinos
   */
  static getUpperPalatine() {
    return [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28];
  }

  /**
   * Obtiene los dientes inferiores vestibulares
   */
  static getLowerVestibular() {
    return [41, 42, 43, 44, 45, 46, 47, 48, 31, 32, 33, 34, 35, 36, 37, 38];
  }

  /**
   * Obtiene los dientes inferiores linguales
   */
  static getLowerLingual() {
    return [41, 42, 43, 44, 45, 46, 47, 48, 31, 32, 33, 34, 35, 36, 37, 38];
  }

  /**
   * Limpia el cache para optimización de memoria
   */
  static clearCache(type = 'all') {
    switch (type) {
      case 'positions':
        _cache.toothPositions.clear();
        break;
      case 'images':
        _cache.imagePaths.clear();
        break;
      case 'validation':
        _cache.validationResults.clear();
        break;
      case 'names':
        _cache.toothNames.clear();
        break;
      case 'all':
      default:
        Object.values(_cache).forEach(cache => cache.clear());
        break;
    }
  }

  /**
   * Obtiene estadísticas del cache para monitoreo
   */
  static getCacheStats() {
    return {
      positions: _cache.toothPositions.size,
      images: _cache.imagePaths.size,
      validation: _cache.validationResults.size,
      names: _cache.toothNames.size,
      total: Object.values(_cache).reduce((total, cache) => total + cache.size, 0)
    };
  }
}

/**
 * Clona un objeto de datos del periodontograma de forma optimizada
 */
export const clonePeriodontogramData = (periodontogramData) => {
  if (!periodontogramData) return null;
  
  try {
    // Usar JSON para clonación profunda optimizada
    return JSON.parse(JSON.stringify(periodontogramData));
  } catch (error) {
    console.error('[PeriodontogramUtils] Error al clonar datos:', error);
    return null;
  }
};

/**
 * Obtiene datos de un diente específico
 */
export const getToothData = (periodontogramData, toothNumber) => {
  if (!periodontogramData || !UniversalToothValidator.isValidToothNumber(toothNumber)) {
    return null;
  }
  
  try {
    const toothData = periodontogramData.teeth?.[toothNumber];
    if (!toothData) {
      return UniversalToothValidator.getDefaultToothData(toothNumber);
    }

    // Asegurar que la propiedad "absent" exista y sea false por defecto
    const absent = toothData.absent !== undefined ? toothData.absent : false;
    return { ...toothData, absent };
  } catch (error) {
    console.warn(`[PeriodontogramUtils] Error obteniendo datos del diente ${toothNumber}:`, error);
    return null;
  }
};

/**
 * Actualiza datos de un diente usando validación consolidada
 */
export const updateToothData = (periodontogramData, toothNumber, updates) => {
  if (!periodontogramData || !UniversalToothValidator.isValidToothNumber(toothNumber)) {
    return periodontogramData;
  }
  
  // Validar y sanitizar actualizaciones
  const validation = UniversalToothValidator.validateCompleteToothData(
    { ...periodontogramData.teeth?.[toothNumber], ...updates, toothNumber },
    { strict: false, logWarnings: true }
  );
  
  if (!validation.isValid) {
    console.warn(`[PeriodontogramUtils] Validación fallida para diente ${toothNumber}:`, validation.errors);
    return periodontogramData;
  }
  
  const clonedData = clonePeriodontogramData(periodontogramData);
  if (!clonedData.teeth) {
    clonedData.teeth = {};
  }
  
  clonedData.teeth[toothNumber] = validation.sanitizedData;
  return clonedData;
};

/**
 * Obtiene todos los datos de dientes
 */
export const getAllTeethData = (periodontogramData) => {
  if (!periodontogramData?.teeth) {
    return {};
  }
  
  return periodontogramData.teeth;
};

// Exportar funciones de la clase como funciones independientes
export const getToothPosition = (toothNumber) => PeriodontogramUtils.getToothPosition(toothNumber);
export const getToothSection = (toothNumber) => PeriodontogramUtils.getToothSection(toothNumber);
export const isValidToothNumber = (toothNumber) => PeriodontogramUtils.isValidToothNumber(toothNumber);
export const getToothImagePath = (toothNumber, type, zone) => PeriodontogramUtils.getToothImagePath(toothNumber, type, zone);
export const getToothName = (toothNumber) => PeriodontogramUtils.getToothName(toothNumber);
export const createInitialToothData = (toothNumber) => UniversalToothValidator.getDefaultToothData(toothNumber);

// Exportar constantes para compatibilidad
export { UPPER_TEETH, LOWER_TEETH };

// Log de inicialización
console.log('[PeriodontogramUtils] Utilidades consolidadas del periodontograma cargadas correctamente');
export default PeriodontogramUtils;