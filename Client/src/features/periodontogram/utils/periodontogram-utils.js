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
export const PeriodontogramUtils = {
  
  /**
   * Obtiene la posición del diente para imágenes (1-17, saltándose el 9)
   * Función unificada con memoización
   */
  getToothPosition(toothNumber) {
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
  },

  /**
   * Obtiene la ruta de imagen del diente con cache optimizado
   */
  getToothImagePath(toothNumber, type = TOOTH_TYPES.NORMAL, zone = TOOTH_ZONES.VESTIBULAR) {
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
  },

  /**
   * Determina la sección del diente (superior/inferior)
   */
  getToothSection(toothNumber) {
    // Superior = cuadrantes FDI 1 y 2 (permanentes 11-28) y 5 y 6 (temporales
    // 51-65). Antes solo 11-28 contaba como superior, así que los temporales
    // superiores (51-65) se clasificaban como inferiores → fondo y zona
    // lingual/palatina equivocados. Se decide por el cuadrante (primer dígito).
    const q = Math.floor(Number(toothNumber) / 10);
    return (q === 1 || q === 2 || q === 5 || q === 6) ? TOOTH_SECTIONS.UPPER : TOOTH_SECTIONS.LOWER;
  },

  /**
   * Determina si la zona es lingual/palatina
   */
  isLingualZone(toothNumber, zone) {
    const section = this.getToothSection(toothNumber);
    
    if (section === TOOTH_SECTIONS.UPPER) {
      return zone === TOOTH_ZONES.PALATINO;
    } else {
      return zone === TOOTH_ZONES.LINGUAL;
    }
  },

  /**
   * Valida si un número de diente FDI es válido
   * Delegado al UniversalToothValidator para evitar duplicación
   */
  isValidToothNumber(toothNumber) {
    return UniversalToothValidator.isValidToothNumber(toothNumber);
  },

  /**
   * Obtiene el nombre del diente con cache
   */
  getToothName(toothNumber) {
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
  },

  /**
   * Obtiene el cuadrante del diente
   * Delegado a PERIODONTOGRAM_CONFIG para evitar duplicación
   */
  getToothQuadrant(toothNumber) {
    return PERIODONTOGRAM_CONFIG.getToothQuadrant(toothNumber);
  },

  /**
   * Determina si un diente puede tener furca
   */
  canHaveFurca(toothNumber, isVestibular = true, isPalatine = false) {
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
  },

  /**
   * Determina si un diente palatino necesita doble entrada de furca
   */
  needsDoubleFurca(toothNumber) {
    const doubleFurcaTeeth = [18, 17, 16, 14, 24, 26, 27, 28];
    return doubleFurcaTeeth.includes(toothNumber);
  },

  /**
   * Obtiene los dientes superiores
   */
  getUpperTeeth() {
    return [...UPPER_TEETH];
  },

  /**
   * Obtiene los dientes inferiores
   */
  getLowerTeeth() {
    return [...LOWER_TEETH];
  },

};

/**
 * Clona un objeto de datos del periodontograma de forma optimizada
 */
export const clonePeriodontogramData = (periodontogramData) => {
  if (!periodontogramData) return null;

  try {
    return structuredClone(periodontogramData);
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

// Rescatadas de periodontograma-functions/tooth-operations.js y
// periodontogram-state-manager.js (módulos muertos eliminados): eran sus
// únicos exports con uso vivo (periodontogram-design.jsx).
export const getToothNumberButtonProps = (toothNumber, isAbsent) => {
  return {
    'aria-pressed': isAbsent,
    'aria-label': `Diente ${toothNumber}, ${isAbsent ? 'ausente' : 'presente'}. Clic para ${isAbsent ? 'marcar como presente' : 'marcar como ausente'}`,
    'role': 'button',
    'tabIndex': 0
  };
};

// Convierte el estado 'absent' a la semántica 'disponible/presente'.
export const getToothAvailability = (absent) => !absent;

export default PeriodontogramUtils;