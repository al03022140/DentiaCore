import PERIODONTOGRAM_CONFIG from '../config/periodontogram-config.js';
import { logger } from '../utils/logger';
import { computePeriodontalStatistics } from '../stats/periodontal-stats-core.cjs';

// ============================================================================
// IMPORTAR CONFIGURACIÓN CENTRALIZADA
// ============================================================================

// USAR CONFIGURACIÓN CENTRALIZADA en lugar de duplicar constantes
const {
  MEASUREMENT_LIMITS,
  FIELD_OPTIONS
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
// VALIDADOR UNIVERSAL CONSOLIDADO
// ============================================================================

/**
 * VALIDADOR UNIVERSAL CONSOLIDADO - ÚNICO PARA TODO EL SISTEMA
 */
export const UniversalToothValidator = {

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
   * Valida una medición específica
   */
  validateMeasurement(value, measurementType) {
    const constraints = {
      'PROBING_DEPTH': { min: MEASUREMENT_LIMITS.profundidadSondaje.min, max: MEASUREMENT_LIMITS.profundidadSondaje.max, default: MEASUREMENT_LIMITS.profundidadSondaje.default },
      'GINGIVAL_MARGIN': { min: MEASUREMENT_LIMITS.margenGingival.min, max: MEASUREMENT_LIMITS.margenGingival.max, default: MEASUREMENT_LIMITS.margenGingival.default },
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
   * Genera datos por defecto para un diente
   * BASADO EN CONFIGURACIÓN CENTRALIZADA
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

      // Acumuladores desde el núcleo compartido (misma matemática que el servidor).
      const acc = computePeriodontalStatistics(periodontogramData);
      const totalTeeth = 32;
      const totalCasillasPosibles = acc.teethWithClinicalData * 6;

      const statistics = {
        totalTeeth,
        presentTeeth: acc.presentTeeth,
        absentTeeth: Math.max(0, totalTeeth - acc.presentTeeth),
        bleedingPercentage: totalCasillasPosibles > 0 ? Math.round((acc.bleedingCount / totalCasillasPosibles) * 100) : 0,
        plaquePercentage: totalCasillasPosibles > 0 ? Math.round((acc.plaqueCount / totalCasillasPosibles) * 100) : 0,
        averageProbingDepth: acc.depthCount > 0 ? Math.round((acc.totalDepth / acc.depthCount) * 100) / 100 : 0,
        averageAttachmentLevel: acc.attachmentLevelCount > 0 ? Math.round((acc.totalAttachmentLevel / acc.attachmentLevelCount) * 100) / 100 : 0,
        maxProbingDepth: acc.maxProbingDepth,
        lastCalculated: new Date().toISOString()
      };

      statisticsCache.set('statistics', statistics, dataHash);

      ValidationLogger.info('Estadísticas calculadas exitosamente según especificaciones SEPA', {
        presentTeeth: statistics.presentTeeth,
        totalCasillasPosibles,
        bleedingCount: acc.bleedingCount,
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
  normalizeDataForHash(data, visited = new WeakSet()) {
    if (data === null || data === undefined) {
      return null;
    }

    if (typeof data === 'object') {
      if (visited.has(data)) return '[Circular]';
      visited.add(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.normalizeDataForHash(item, visited));
    }

    if (typeof data === 'object') {
      const normalized = {};
      // Ordenar claves alfabéticamente para consistencia
      Object.keys(data).sort().forEach(key => {
        normalized[key] = this.normalizeDataForHash(data[key], visited);
      });
      return normalized;
    }

    return data;
  },
  
  /**
   * Clave de caché determinística = JSON canónico de los datos.
   * ponytail: el JSON normalizado ES la clave (sin colisiones); el DJB2 de
   *   32 bits anterior podía servir stats cacheadas de OTRO paciente. Map en
   *   memoria con maxSize chico → claves largas no importan.
   */
  generateDataHash(data) {
    try {
      return JSON.stringify(this.normalizeDataForHash(data));
    } catch (error) {
      ValidationLogger.error('Error generando clave de caché', error);
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
  
};

// Exportación por defecto
export default UniversalToothValidator;
