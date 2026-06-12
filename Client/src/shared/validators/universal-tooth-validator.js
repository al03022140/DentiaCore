import PERIODONTOGRAM_CONFIG from '../config/periodontogram-config.js';
import { logger } from '../utils/logger';

// ============================================================================
// IMPORTAR CONFIGURACIÓN CENTRALIZADA
// ============================================================================

// USAR CONFIGURACIÓN CENTRALIZADA en lugar de duplicar constantes
const {
  ALL_VALID_TEETH,
  PERMANENT_TEETH,
  TEMPORARY_TEETH,
  MEASUREMENT_LIMITS,
  FIELD_OPTIONS,
  MEASUREMENT_FACE_CONFIG,
  FACE_MAPPING,
  SAVE_CONFIG,
  CACHE_CONFIG,
  TRANSFORMATION_CONFIG,
  LOGGING_CONFIG
} = PERIODONTOGRAM_CONFIG;

// ============================================================================
// ESQUEMA ÚNICO UNIFICADO - BASADO EN CONFIGURACIÓN CENTRALIZADA
// ============================================================================

/**
 * Esquema unificado para datos de dientes (ÚNICO para todo el sistema)
 * FORMATO ESTÁNDAR: Arrays de 3 elementos por cara (mesial, central, distal)
 * BASADO EN CONFIGURACIÓN CENTRALIZADA
 */

class StatisticsCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
    this.ttl = 5 * 60 * 1000; // 5 minutos
  }
  
  generateKey(key, dataHash) {
    return `${key}_${dataHash}`;
  }
  
  get(key, dataHash) {
    const cacheKey = this.generateKey(key, dataHash);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    
    if (cached) {
      this.cache.delete(cacheKey);
    }
    
    return null;
  }
  
  set(key, data, dataHash) {
    const cacheKey = this.generateKey(key, dataHash);
    
    // Limpiar caché si está lleno
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }
  
  invalidate(key) {
    const keysToDelete = [];
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(key)) {
        keysToDelete.push(cacheKey);
      }
    }
    keysToDelete.forEach(k => this.cache.delete(k));
  }
  
  clear() {
    this.cache.clear();
  }
  
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }
}

const statisticsCache = new StatisticsCache();

// ============================================================================
// LOGGING CENTRALIZADO
// ============================================================================

// Namespace de logging (antes clase con métodos estáticos, 0 `new`). Es un objeto
// de funciones: `this` dentro de error/warn/info apunta al objeto en `ValidationLogger.x()`,
// así que `this.log(...)` sigue resolviendo igual que con la clase.
const ValidationLogger = {
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    // Solo mostrar errores críticos en producción
    if (level === 'error') {
      console.error(`[${timestamp}] VALIDATION ERROR: ${message}`, data);
    } else if (level === 'warn' && process.env.NODE_ENV === 'development') {
      console.warn(`[${timestamp}] VALIDATION WARNING: ${message}`, data);
    } else if (level === 'info' && process.env.NODE_ENV === 'development') {
      logger.log(`[${timestamp}] VALIDATION: ${message}`, data);
    }
  },

  error(message, data) { this.log('error', message, data); },
  warn(message, data) { this.log('warn', message, data); },
  info(message, data) { this.log('info', message, data); }
};

// ============================================================================
// MIGRACIÓN DE DATOS LEGACY
// ============================================================================

/**
 * Asegura que un valor sea un array de 3 elementos
 * CORRIGE LA INCONSISTENCIA CRÍTICA - OPCIÓN 1 MEJORADA
 */
function ensureArray3(value, defaultValue = 0) {
  if (Array.isArray(value)) {
    // Si ya es array, tomar solo los primeros 3 elementos o completar con defaultValue
    const result = [defaultValue, defaultValue, defaultValue];
    for (let i = 0; i < Math.min(3, value.length); i++) {
      result[i] = value[i] !== undefined ? value[i] : defaultValue;
    }
    return result;
  }
  
  // Si no es array, crear array de 3 elementos con defaultValue
  return [defaultValue, defaultValue, defaultValue];
}


// ============================================================================
// VALIDADOR UNIVERSAL CONSOLIDADO
// ============================================================================

/**
 * VALIDADOR UNIVERSAL CONSOLIDADO - ÚNICO PARA TODO EL SISTEMA
 */
export const UniversalToothValidator = {
  
  
  
  // ==========================================================================
  // VALIDACIÓN Y SANITIZACIÓN ROBUSTAS
  // ==========================================================================
  
  /**
   * Valida un valor según su esquema
   */
  validateValue(value, schema, fieldName = 'unknown') {
    try {
      if (value === undefined || value === null) {
        return schema.default !== undefined ? schema.default : null;
      }
      
      switch (schema.type) {
        case 'boolean':
          return Boolean(value);
          
        case 'number':
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            ValidationLogger.warn(`Valor numérico inválido para ${fieldName}: ${value}`);
            return schema.default || 0;
          }
          
          // Aplicar límites
          if (schema.min !== undefined && numValue < schema.min) {
            return schema.min;
          }
          if (schema.max !== undefined && numValue > schema.max) {
            return schema.max;
          }
          
          return numValue;
          
        case 'string':
          const strValue = String(value);
          if (schema.enum && !schema.enum.includes(strValue)) {
            ValidationLogger.warn(`Valor de enum inválido para ${fieldName}: ${strValue}`);
            return schema.default || schema.enum[0];
          }
          if (schema.maxLength && strValue.length > schema.maxLength) {
            return strValue.substring(0, schema.maxLength);
          }
          return strValue;
          
        case 'array':
          if (!Array.isArray(value)) {
            ValidationLogger.warn(`Se esperaba array para ${fieldName}, recibido: ${typeof value}`);
            return schema.default || [];
          }
          
          // Ajustar longitud si es necesario
          let adjustedArray = [...value];
          if (schema.length) {
            while (adjustedArray.length < schema.length) {
              adjustedArray.push(schema.elementType === 'boolean' ? false : 0);
            }
            adjustedArray = adjustedArray.slice(0, schema.length);
          }
          
          // Validar elementos
          return adjustedArray.map((element, index) => {
            if (schema.elementType === 'boolean') {
              return Boolean(element);
            } else if (schema.elementType === 'number') {
              const num = parseFloat(element);
              if (isNaN(num)) {
                return 0;
              }
              
              // Aplicar límites a elementos del array
              if (schema.min !== undefined && num < schema.min) {
                return schema.min;
              }
              if (schema.max !== undefined && num > schema.max) {
                return schema.max;
              }
              
              return num;
            }
            return element;
          });
          
        case 'object':
          if (typeof value !== 'object' || value === null) {
            ValidationLogger.warn(`Se esperaba objeto para ${fieldName}, recibido: ${typeof value}`);
            return schema.default || {};
          }
          
          // Validar propiedades del objeto si están definidas
          if (schema.properties) {
            const validatedObject = {};
            Object.entries(schema.properties).forEach(([propKey, propSchema]) => {
              validatedObject[propKey] = this.validateValue(value[propKey], propSchema, `${fieldName}.${propKey}`);
            });
            return validatedObject;
          }
          
          return value;
          
        default:
          ValidationLogger.warn(`Tipo de esquema desconocido: ${schema.type}`);
          return value;
      }
    } catch (error) {
      ValidationLogger.error(`Error validando ${fieldName}:`, error);
      return schema.default !== undefined ? schema.default : null;
    }
  },
  
  /**
   * Sanitiza un valor aplicando límites y correcciones
   */
  sanitizeValue(value, schema, fieldName = 'unknown') {
    return this.validateValue(value, schema, fieldName);
  },
  
  // ==========================================================================
  // VALIDACIÓN COMPLETA DE DATOS DE DIENTES
  // ==========================================================================
  
  /**
   * Valida y sanitiza datos completos de un diente
   */
  validateCompleteToothData(toothData, toothNumber = null) {
    if (!toothData || typeof toothData !== 'object') {
      ValidationLogger.warn('Datos de diente inválidos, usando valores por defecto');
      return this.getDefaultToothData(toothNumber);
    }
    
    const validatedData = {};
    const allErrors = [];
    const allWarnings = [];
    
    // Asegurar que toothNumber esté disponible
    const effectiveToothNumber = toothData.toothNumber || toothNumber || 'desconocido';
    
    // Validar cada campo según el esquema
    Object.entries(UNIFIED_TOOTH_SCHEMA).forEach(([fieldName, schema]) => {
      try {
        const fieldValue = toothData[fieldName];
        const valueToValidate = fieldValue !== undefined ? fieldValue : schema.default;
        
        validatedData[fieldName] = this.validateValue(valueToValidate, schema, fieldName);
      } catch (error) {
        allErrors.push(`Error en campo ${fieldName}: ${error.message}`);
        validatedData[fieldName] = schema.default;
      }
    });
    
    // Log de advertencias y errores
    if (allWarnings.length > 0) {
      ValidationLogger.warn(`Advertencias en diente ${effectiveToothNumber}`, allWarnings);
    }
    if (allErrors.length > 0) {
      ValidationLogger.error(`Errores en diente ${effectiveToothNumber}`, allErrors);
    }
    
    return validatedData;
  },
  
  // ==========================================================================
  // UTILIDADES DE VALIDACIÓN
  // ==========================================================================
  
  /**
   * Valida si un número de diente es válido
   * DELEGADO A CONFIGURACIÓN CENTRALIZADA
   */
  isValidToothNumber(toothNumber) {
    return PERIODONTOGRAM_CONFIG.isValidToothNumber(toothNumber);
  },
  
  /**
   * Valida si un diente es permanente
   */
  isValidPermanentTooth(toothNumber) {
    const permanentTeeth = [
      11, 12, 13, 14, 15, 16, 17, 18,
      21, 22, 23, 24, 25, 26, 27, 28,
      31, 32, 33, 34, 35, 36, 37, 38,
      41, 42, 43, 44, 45, 46, 47, 48
    ];
    return permanentTeeth.includes(parseInt(toothNumber));
  },
  
  /**
   * Valida una medición específica
   */
  validateMeasurement(value, measurementType) {
    const constraints = {
      'PROBING_DEPTH': { min: -9, max: 15, default: 0 },
      'GINGIVAL_MARGIN': { min: -10, max: 10, default: 0 },
      'GUM_WIDTH': { min: MEASUREMENT_LIMITS.anchuraEncia.min, max: MEASUREMENT_LIMITS.anchuraEncia.max, default: MEASUREMENT_LIMITS.anchuraEncia.default },
      'MOBILITY': { min: 0, max: 3, default: 0 },
      'FURCA': { min: 0, max: 3, default: 0 }
    };
    
    const upperType = measurementType.toUpperCase();
    const constraint = constraints[upperType];
    
    if (!constraint) {
      ValidationLogger.warn(`Tipo de medición desconocido: ${measurementType}`);
      return 0;
    }
    
    if (value === null || value === undefined || value === '') {
      return constraint.default;
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      ValidationLogger.warn(`Valor numérico inválido para ${measurementType}: ${value}`);
      return constraint.default;
    }
    
    return Math.max(constraint.min, Math.min(constraint.max, numValue));
  },
  
  // ==========================================================================
  // DATOS POR DEFECTO E INICIALIZACIÓN
  // ==========================================================================
  
  /**
   * Inicializa datos completos del periodontograma
   * Crea estructura con todos los dientes permanentes
   */
  initializePeriodontogramData(initialData = {}) {
    try {
      const periodontogramData = {
        teeth: {},
        statistics: this.getDefaultStatistics(),
        metadata: {
          version: '4.0.0',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          ...initialData.metadata
        },
        ...initialData
      };
      
      // Inicializar todos los dientes permanentes
      PERMANENT_TEETH.forEach(toothNumber => {
        if (!periodontogramData.teeth[toothNumber]) {
          periodontogramData.teeth[toothNumber] = this.getDefaultToothData(toothNumber);
        } else {
          // Validar y completar datos existentes
          periodontogramData.teeth[toothNumber] = this.validateCompleteToothData(
            periodontogramData.teeth[toothNumber], 
            toothNumber
          );
        }
      });
      
      // Recalcular estadísticas
      periodontogramData.statistics = this.calculateStatistics(periodontogramData);
      
      ValidationLogger.info('Periodontograma inicializado correctamente', {
        totalTeeth: Object.keys(periodontogramData.teeth).length,
        hasStatistics: !!periodontogramData.statistics
      });
      
      return periodontogramData;
    } catch (error) {
      ValidationLogger.error('Error inicializando periodontograma', error);
      return {
        teeth: {},
        statistics: this.getDefaultStatistics(),
        metadata: {
          version: '4.0.0',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        }
      };
    }
  },
  
  /**
   * Genera datos por defecto para un diente
   * BASADO EN CONFIGURACIÓN CENTRALIZADA
   * ESTRUCTURA COMPATIBLE CON UNIFIED_TOOTH_SCHEMA
   */
  getDefaultToothData(toothNumber = null) {
    const defaultData = {
      toothNumber: toothNumber ? parseInt(toothNumber) : null,
      present: true,
      available: true,
      absent: false,
      implant: false,
      anchuraEncia: 0,
      
      // Estructura de 4 caras según especificación médica
      vestibularSuperior: {
        placa: [0, 0, 0],
        sangrado: [0, 0, 0],
        supuracion: [0, 0, 0],
        margenGingival: [0, 0, 0],
        profundidadSondaje: [0, 0, 0]
      },
      palatinoSuperior: {
        placa: [0, 0, 0],
        sangrado: [0, 0, 0],
        supuracion: [0, 0, 0],
        margenGingival: [0, 0, 0],
        profundidadSondaje: [0, 0, 0]
      },
      vestibularInferior: {
        placa: [0, 0, 0],
        sangrado: [0, 0, 0],
        supuracion: [0, 0, 0],
        margenGingival: [0, 0, 0],
        profundidadSondaje: [0, 0, 0]
      },
      lingualInferior: {
        placa: [0, 0, 0],
        sangrado: [0, 0, 0],
        supuracion: [0, 0, 0],
        margenGingival: [0, 0, 0],
        profundidadSondaje: [0, 0, 0]
      },
      
      mobility: MEASUREMENT_LIMITS.movilidad.default,
      furca: {
        vestibular: MEASUREMENT_LIMITS.furca.default,
        lingualPalatino: MEASUREMENT_LIMITS.furca.default,
        doble: {
          furca1: MEASUREMENT_LIMITS.furca.default,
          furca2: MEASUREMENT_LIMITS.furca.default
        }
      },
      prognosis: FIELD_OPTIONS.prognosis.default,
      notes: ''
    };
    
    return defaultData;
  },
  
  // ==========================================================================
  // ESTADÍSTICAS CON CACHÉ OPTIMIZADO
  // ==========================================================================
  
  /**
   * Calcula estadísticas del periodontograma según especificaciones SEPA
   * Cada diente presente aporta 3 casillas por tipo de indicador clínico
   * @param {Object} periodontogramData - Datos del periodontograma
   * @returns {Object} - Estadísticas calculadas
   */
  calculateStatistics(periodontogramData) {
    try {
      if (!periodontogramData || typeof periodontogramData !== 'object') {
        return this.getDefaultStatistics();
      }

      const dataHash = this.generateDataHash(periodontogramData);
      const cached = statisticsCache.get('statistics', dataHash);
      if (cached) {
        ValidationLogger.info('Estadísticas obtenidas del caché');
        return cached;
      }

      const PERMANENT_TEETH_LIST = [
        11, 12, 13, 14, 15, 16, 17, 18,
        21, 22, 23, 24, 25, 26, 27, 28,
        31, 32, 33, 34, 35, 36, 37, 38,
        41, 42, 43, 44, 45, 46, 47, 48
      ];

      const teethData = periodontogramData.teeth || {};

      let presentTeethDisplay = 0;
      let teethWithClinicalData = 0;
      let bleedingCount = 0;
      let plaqueCount = 0;
      let totalDepth = 0;
      let depthCount = 0;
      let totalAttachmentLevel = 0;
      let attachmentLevelCount = 0;
      let maxProbingDepth = 0;

      const parseBoolean = (value) => {
        if (value === undefined || value === null) return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
          if (['false', '0', 'no'].includes(normalized)) return false;
        }
        return null;
      };

      const faceKeys = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];

      // Convención compartida con la capa de gráficas (normalizeZeroTriples):
      // una cara con [0,0,0] se considera NO medida — el esquema rellena 0 por
      // defecto en los sitios sin captura, y contarlos como "0 mm" reales
      // subestimaba los promedios de PS y NIC (un diente sondeado sólo por
      // vestibular aportaba 3 sitios fantasma de la otra cara).
      const isUnmeasuredTriple = (arr) => Array.isArray(arr) && arr.every((value) => {
        const n = parseFloat(value);
        return isNaN(n) || n === 0;
      });

      PERMANENT_TEETH_LIST.forEach(toothNumber => {
        const toothData = teethData[toothNumber];
        const hasToothData = toothData && typeof toothData === 'object';

        const absentValue = hasToothData ? parseBoolean(toothData.absent ?? toothData.ausente) : null;
        const presentValue = hasToothData ? parseBoolean(toothData.present ?? toothData.presente) : null;
        const availableValue = hasToothData ? parseBoolean(toothData.available ?? toothData.disponible) : null;

        const isMarkedAbsent = absentValue === true;
        const isExplicitPresentFalse = presentValue === false;
        const isExplicitUnavailable = availableValue === false;

        const isToothPresent = !(isMarkedAbsent || isExplicitPresentFalse || isExplicitUnavailable);

        if (!isToothPresent) {
          return;
        }

        presentTeethDisplay++;

        if (!hasToothData) {
          return;
        }

        teethWithClinicalData++;

        // P2: contar solo las 2 caras de la arcada del diente, para que el
        // numerador (sitios con sangrado/placa) y el denominador
        // (teethWithClinicalData*6 = 2 caras × 3 sitios) usen el mismo nº de
        // sitios. Antes recorría las 4 caras; con datos en las 4 el % podía
        // pasar de 100%. Las caras vacías valen [0,0,0] y no inflaban el conteo.
        const arcadaEn = (typeof toothData.arcada === 'string')
          ? toothData.arcada.toLowerCase()
          : (Number(toothNumber) >= 11 && Number(toothNumber) <= 28 ? 'superior' : 'inferior');
        const facesForTooth = arcadaEn === 'superior'
          ? faceKeys.filter(f => f.endsWith('Superior'))
          : faceKeys.filter(f => f.endsWith('Inferior'));

        const bleeding = toothData.bleeding;
        if (bleeding && typeof bleeding === 'object' && !Array.isArray(bleeding)) {
          facesForTooth.forEach(faceKey => {
            const faceData = bleeding[faceKey];
            if (Array.isArray(faceData)) {
              faceData.forEach(value => {
                if (typeof value === 'number' && value > 0) {
                  bleedingCount++;
                } else if (value === true || value === 1) {
                  bleedingCount++;
                }
              });
            }
          });
        }

        const plaque = toothData.plaque;
        if (plaque && typeof plaque === 'object' && !Array.isArray(plaque)) {
          facesForTooth.forEach(faceKey => {
            const faceData = plaque[faceKey];
            if (Array.isArray(faceData)) {
              faceData.forEach(value => {
                if (typeof value === 'number' && value > 0) {
                  plaqueCount++;
                } else if (value === true || value === 1) {
                  plaqueCount++;
                }
              });
            }
          });
        }

        const probingDepth = toothData.probingDepth || toothData.profundidadSondaje;
        if (probingDepth && typeof probingDepth === 'object' && !Array.isArray(probingDepth)) {
          facesForTooth.forEach(faceKey => {
            const faceData = probingDepth[faceKey];
            if (Array.isArray(faceData) && !isUnmeasuredTriple(faceData)) {
              faceData.forEach(depth => {
                const numDepth = parseFloat(depth);
                if (!isNaN(numDepth) && numDepth !== 999) {
                  totalDepth += numDepth;
                  depthCount++;
                  if (numDepth > maxProbingDepth) {
                    maxProbingDepth = numDepth;
                  }
                }
              });
            }
          });
        }

        const gingivalMargin = toothData.gingivalMargin || toothData.margenGingival;
        if (probingDepth && gingivalMargin &&
            typeof probingDepth === 'object' && !Array.isArray(probingDepth) &&
            typeof gingivalMargin === 'object' && !Array.isArray(gingivalMargin)) {
          facesForTooth.forEach(faceKey => {
            const depthData = probingDepth[faceKey];
            const marginData = gingivalMargin[faceKey];
            // NIC sólo sobre caras con PS medido; un margen 0 sí es válido
            // (margen en la unión amelocementaria) cuando hay sondaje real.
            if (Array.isArray(depthData) && Array.isArray(marginData) && !isUnmeasuredTriple(depthData)) {
              for (let i = 0; i < Math.min(depthData.length, marginData.length); i++) {
                const depth = parseFloat(depthData[i]);
                const margin = parseFloat(marginData[i]);
                if (!isNaN(depth) && !isNaN(margin) && depth !== 999 && margin !== 999) {
                  const attachmentLevel = depth - margin; // NIC = PS − MG (margen firmado: recesión negativa)
                  totalAttachmentLevel += attachmentLevel;
                  attachmentLevelCount++;
                }
              }
            }
          });
        }
      });

      const totalTeeth = PERMANENT_TEETH_LIST.length;
      const absentTeeth = Math.max(0, totalTeeth - presentTeethDisplay);
      const totalCasillasPosibles = teethWithClinicalData * 6;

      const statistics = {
        totalTeeth,
        presentTeeth: presentTeethDisplay,
        absentTeeth,
        bleedingPercentage: totalCasillasPosibles > 0 ? Math.round((bleedingCount / totalCasillasPosibles) * 100) : 0,
        plaquePercentage: totalCasillasPosibles > 0 ? Math.round((plaqueCount / totalCasillasPosibles) * 100) : 0,
        averageProbingDepth: depthCount > 0 ? Math.round((totalDepth / depthCount) * 100) / 100 : 0,
        averageAttachmentLevel: attachmentLevelCount > 0 ? Math.round((totalAttachmentLevel / attachmentLevelCount) * 100) / 100 : 0,
        maxProbingDepth,
        lastCalculated: new Date().toISOString()
      };

      statisticsCache.set('statistics', statistics, dataHash);

      ValidationLogger.info('Estadísticas calculadas exitosamente según especificaciones SEPA', {
        presentTeeth: statistics.presentTeeth,
        totalCasillasPosibles,
        bleedingCount,
        bleedingPercentage: statistics.bleedingPercentage
      });

      return statistics;
    } catch (error) {
      ValidationLogger.error('Error calculando estadísticas', error);
      return this.getDefaultStatistics();
    }
  },
  
  /**
   * Normaliza datos para generar hash consistente
   */
  normalizeDataForHash(data) {
    if (data === null || data === undefined) {
      return null;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeDataForHash(item));
    }
    
    if (typeof data === 'object') {
      const normalized = {};
      // Ordenar claves alfabéticamente para consistencia
      Object.keys(data).sort().forEach(key => {
        normalized[key] = this.normalizeDataForHash(data[key]);
      });
      return normalized;
    }
    
    return data;
  },
  
  /**
   * Genera hash de datos para caché de forma determinística
   */
  generateDataHash(data) {
    try {
      // Normalizar datos antes de generar hash
      const normalizedData = this.normalizeDataForHash(data);
      const jsonString = JSON.stringify(normalizedData);
      
      // Generar hash más robusto
      let hash = 0;
      for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convertir a 32bit integer
      }
      
      return Math.abs(hash).toString(36);
    } catch (error) {
      ValidationLogger.error('Error generando hash de datos', error);
      return Date.now().toString();
    }
  },
  
  /**
   * Invalida caché de estadísticas
   */
  invalidateCache(key = null) {
    if (key) {
      statisticsCache.invalidate(key);
    } else {
      statisticsCache.clear();
    }
  },
  
  /**
   * Obtiene estadísticas del caché
   */
  getCacheStats() {
    return statisticsCache.getStats();
  },
  
  /**
   * Estadísticas por defecto - muestra 32/32 dientes inicialmente
   */
  getDefaultStatistics() {
    return {
      totalTeeth: 32,
      presentTeeth: 32, // Inicialmente todos los dientes están presentes
      bleedingPercentage: 0,
      plaquePercentage: 0,
      averageProbingDepth: 0,
      averageAttachmentLevel: 0,
      maxProbingDepth: 0,
      lastCalculated: new Date().toISOString()
    };
  },
  
  /**
   * Alias para getDefaultStatistics para mantener compatibilidad con código existente
   */
  getEmptyStatistics() {
    return this.getDefaultStatistics();
  },
  
  // ==========================================================================
  // VALIDACIÓN DE ESTRUCTURA COMPLETA
  // ==========================================================================
  
  /**
   * Valida estructura completa del periodontograma
   */
  validatePeriodontogramStructure(periodontogramData) {
    if (!periodontogramData || typeof periodontogramData !== 'object') {
      return {
        isValid: false,
        errors: ['Los datos del periodontograma deben ser un objeto'],
        validatedData: {}
      };
    }
    
    const errors = [];
    const validatedData = {};
    
    // Extraer datos de dientes
    const teethData = periodontogramData.teeth || periodontogramData;
    
    if (!teethData || typeof teethData !== 'object') {
      errors.push('No se encontraron datos válidos de dientes');
    } else {
      Object.entries(teethData).forEach(([toothNumber, toothData]) => {
        try {
          const numericToothNumber = parseInt(toothNumber);
          
          // Ignorar metadatos
          if (isNaN(numericToothNumber) || ['teeth', 'metadata', 'statistics'].includes(toothNumber)) {
            return;
          }
          
          // Validar solo números de dientes válidos
          if (this.isValidToothNumber(numericToothNumber)) {
            validatedData[toothNumber] = this.validateCompleteToothData(toothData, numericToothNumber);
          } else {
            errors.push(`Número de diente inválido: ${toothNumber}`);
          }
        } catch (error) {
          errors.push(`Error validando diente ${toothNumber}: ${error.message}`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      validatedData,
      totalTeeth: Object.keys(validatedData).length
    };
  },
};

// ============================================================================
// EXPORTACIONES PARA COMPATIBILIDAD
// ============================================================================

// Funciones de compatibilidad
export const isValidToothNumber = (toothNumber) => {
  return UniversalToothValidator.isValidToothNumber(toothNumber);
};

export const validateToothData = (toothData) => {
  return UniversalToothValidator.validateCompleteToothData(toothData);
};

export const calculateStatistics = (periodontogramData) => {
  return UniversalToothValidator.calculateStatistics(periodontogramData);
};

// Exportación por defecto
export default UniversalToothValidator;

export const UNIFIED_TOOTH_SCHEMA = {
  // Identificación del diente
  toothNumber: { 
    type: 'number', 
    required: true,
    min: 11, max: 48 
  },
  
  presente: { type: 'boolean', default: true },
  disponible: { type: 'boolean', default: true },
  ausente: { type: 'boolean', default: false },
  implante: { type: 'boolean', default: false },
  
  // Nuevo: valor único de anchura de encía a nivel de diente
  anchuraEncia: { type: 'number', min: MEASUREMENT_LIMITS.anchuraEncia.min, max: MEASUREMENT_LIMITS.anchuraEncia.max, default: MEASUREMENT_LIMITS.anchuraEncia.default },
  
  vestibularSuperior: {
    type: 'object',
    properties: {
      placa: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      sangrado: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: 0, max: 3, 
         default: [0, 0, 0] 
       },
      supuracion: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      margenGingival: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: -9, max: 9,
         default: [0, 0, 0] 
       },
      profundidadSondaje: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: -9, max: 9,
         default: [0, 0, 0] 
       }
    },
    default: {
      placa: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      margenGingival: [0, 0, 0],
      profundidadSondaje: [0, 0, 0]
    }
  },
  palatinoSuperior: {
    type: 'object',
    properties: {
      placa: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      sangrado: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 3, 
        default: [0, 0, 0] 
      },
      supuracion: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      margenGingival: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: -9, max: 9,
        default: [0, 0, 0] 
      },
      profundidadSondaje: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: -9, max: 9,
        default: [0, 0, 0] 
      }
    },
    default: {
      placa: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      margenGingival: [0, 0, 0],
      profundidadSondaje: [0, 0, 0]
    }
  },
  vestibularInferior: {
    type: 'object',
    properties: {
      placa: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      sangrado: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: 0, max: 3, 
         default: [0, 0, 0] 
       },
      supuracion: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      margenGingival: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: -9, max: 9,
         default: [0, 0, 0] 
       },
      profundidadSondaje: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: -9, max: 9,
         default: [0, 0, 0] 
       }
    },
    default: {
      placa: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      margenGingival: [0, 0, 0],
      profundidadSondaje: [0, 0, 0]
    }
  },
  lingualInferior: {
    type: 'object',
    properties: {
      placa: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      sangrado: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: 0, max: 3, 
         default: [0, 0, 0] 
       },
      supuracion: { 
        type: 'array', 
        length: 3, 
        elementType: 'number', 
        min: 0, max: 1, 
        default: [0, 0, 0] 
      },
      margenGingival: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: -9, max: 9,
         default: [0, 0, 0] 
       },
      profundidadSondaje: { 
         type: 'array', 
         length: 3, 
         elementType: 'number', 
         min: -9, max: 9,
         default: [0, 0, 0] 
       }
    },
    default: {
      placa: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      margenGingival: [0, 0, 0],
      profundidadSondaje: [0, 0, 0]
    }
  },

  movilidad: { 
    type: 'number', 
    min: MEASUREMENT_LIMITS.movilidad.min, 
    max: MEASUREMENT_LIMITS.movilidad.max, 
    default: MEASUREMENT_LIMITS.movilidad.default 
  },

  furca: {
    type: 'object',
    properties: {
      vestibular: { type: 'number', min: MEASUREMENT_LIMITS.furca.min, max: MEASUREMENT_LIMITS.furca.max, default: MEASUREMENT_LIMITS.furca.default },
      lingualPalatino: { type: 'number', min: MEASUREMENT_LIMITS.furca.min, max: MEASUREMENT_LIMITS.furca.max, default: MEASUREMENT_LIMITS.furca.default },
      doble: {
        type: 'object',
        properties: {
          furca1: { type: 'number', min: MEASUREMENT_LIMITS.furca.min, max: MEASUREMENT_LIMITS.furca.max, default: MEASUREMENT_LIMITS.furca.default },
          furca2: { type: 'number', min: MEASUREMENT_LIMITS.furca.min, max: MEASUREMENT_LIMITS.furca.max, default: MEASUREMENT_LIMITS.furca.default }
        },
        default: { furca1: MEASUREMENT_LIMITS.furca.default, furca2: MEASUREMENT_LIMITS.furca.default }
      }
    },
    default: { 
      vestibular: MEASUREMENT_LIMITS.furca.default, 
      lingualPalatino: MEASUREMENT_LIMITS.furca.default,
      doble: { furca1: MEASUREMENT_LIMITS.furca.default, furca2: MEASUREMENT_LIMITS.furca.default }
    }
  },

  pronostico: { 
    type: 'string', 
    enum: FIELD_OPTIONS.pronostico.values, 
    default: FIELD_OPTIONS.pronostico.default 
  },
  notas: { type: 'string', maxLength: 500, default: '' }
};