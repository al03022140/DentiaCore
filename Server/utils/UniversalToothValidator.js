/**
 * 🦷 VALIDADOR UNIVERSAL DE DIENTES - BACKEND CONSOLIDADO
 * 
 * Sistema unificado de validación para datos de periodontograma en el backend.
 * Garantiza consistencia y integridad de datos entre frontend y backend.
 * SINCRONIZADO CON VALIDADOR CONSOLIDADO DEL CLIENTE v4.0.0
 * UTILIZA CONFIGURACIÓN CENTRALIZADA v1.0.0
 * 
 * CARACTERÍSTICAS:
 * ✅ Validación robusta con esquemas unificados
 * ✅ Caché de estadísticas optimizado
 * ✅ Logging centralizado
 * ✅ Manejo de errores mejorado
 * ✅ Soporte para migración de datos legacy
 * ✅ Transformaciones bidireccionales corregidas
 * ✅ Configuración centralizada
 * 
 * @version 4.1.0 - CONFIGURACIÓN CENTRALIZADA BACKEND
 * @author Sistema de Validación Unificada
 */

const { PERIODONTOGRAM_CONFIG } = require('../config/periodontogram-config');
// Caras canónicas reutilizables en validación/estadísticas
const CANON_FACES = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];

/**
 * Esquema de datos de cara (vestibular/lingualPalatino)
 * NORMALIZACIÓN OPCIÓN 1 MEJORADA - 3 MEDICIONES POR CARA
 */
const FACE_DATA_SCHEMA = {
  profundidad: {
    type: 'array',
    elementType: 'number',
    length: 3,
    min: 0,
    max: 15,
    default: [0, 0, 0],
    description: 'Profundidad de sondaje: 3 mediciones por cara'
  },
  
  margen: {
    type: 'array',
    elementType: 'number',
    length: 3,
    min: -10,
    max: 10,
    default: [0, 0, 0],
    description: 'Margen gingival: 3 mediciones por cara'
  },
  
  sangrado: {
    type: 'array',
    elementType: 'number',
    length: 3,
    min: 0,
    max: 3,
    default: [0, 0, 0],
    description: 'Sangrado multiestado: 3 valores por cara'
  },
  
  supuracion: {
    type: 'array',
    elementType: 'number',
    length: 3,
    min: 0,
    max: 1,
    default: [0, 0, 0],
    description: 'Supuración: 3 valores 0/1 por cara'
  },
  
  placa: {
    type: 'array',
    elementType: 'number',
    length: 3,
    min: 0,
    max: 1,
    default: [0, 0, 0],
    description: 'Placa: 3 valores 0/1 por cara'
  }

};

/**
 * Esquema unificado de datos de dientes según normalización Opción 1 MEJORADA
 * UTILIZA CONFIGURACIÓN CENTRALIZADA
 */
const UNIFIED_TOOTH_SCHEMA = {
  // Identificación del diente
  numeroDiente: {
    type: 'number',
    required: true,
    min: 11,
    max: 85,
    validator: (value) => {
      return PERIODONTOGRAM_CONFIG.isValidToothNumber(value);
    }
  },
  
  // Campo arcada para determinar superior/inferior
  arcada: {
    type: 'string',
    enum: ['superior', 'inferior'],
    required: true
  },
  
  // Estados del diente (0/1 en lugar de boolean)
  absent: {
    type: 'boolean',
    default: false
  },

  anchuraEncia: {
    type: 'number',
    min: PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.GUM_WIDTH.min,
    max: PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.GUM_WIDTH.max,
    default: PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.GUM_WIDTH.default
  },
  
  implante: {
    type: 'boolean',
    default: false
  },
  
  pronostico: {
    type: 'string',
    enum: ['bueno', 'regular', 'malo', 'dudoso'],
    default: 'bueno'
  },
  
  movilidad: {
    type: 'number',
    min: PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.MOBILITY.min,
    max: PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.MOBILITY.max,
    default: 0
  },
  
  // Furca mejorada para manejar doble furca
  furca: {
    type: 'object',
    properties: {
      vestibular: { 
        type: 'number', 
        min: 0, 
        max: 3, 
        default: 0
      },
      lingualPalatino: { 
        type: 'number', 
        min: 0, 
        max: 3, 
        default: 0
      },
      // Para molares específicos (18,17,16,14,24,26,27,28)
      doble: {
        type: 'object',
        properties: {
          furca1: { type: 'number', min: 0, max: 3, default: 0 },
          furca2: { type: 'number', min: 0, max: 3, default: 0 }
        },
        default: { furca1: 0, furca2: 0 }
      }
    },
    default: {
      vestibular: 0,
      lingualPalatino: 0,
      doble: { furca1: 0, furca2: 0 }
    },
    validator: (value, toothNumber) => {
      // Validación específica para furca según tipo de diente
      const _needsDoubleFurca = [18, 17, 16, 14, 24, 26, 27, 28].includes(parseInt(toothNumber));
      return true; // Simplificado por ahora
    }
  },
  
  // Datos de caras
  vestibular: {
    type: 'object',
    properties: FACE_DATA_SCHEMA,
    required: true,
    default: {
      profundidad: [0, 0, 0],
      margen: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    }
  },
  
  // Cara lingual/palatino (nombre neutral)
  lingualPalatino: {
    type: 'object',
    properties: FACE_DATA_SCHEMA,
    required: true,
    default: {
      profundidad: [0, 0, 0],
      margen: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    }
  }
};

/**
 * Clase para gestión de caché de estadísticas
 */
class StatisticsCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = PERIODONTOGRAM_CONFIG.CACHE_CONFIG.MAX_SIZE;
    this.ttl = PERIODONTOGRAM_CONFIG.CACHE_CONFIG.TTL;
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

// Sistema de logging eliminado

// Instancia global del caché
const statisticsCache = new StatisticsCache();

/**
 * Validador Universal de Dientes - Versión Consolidada
 * CONFIGURACIÓN CENTRALIZADA - FUENTE ÚNICA DE VERDAD
 * 
 * Centraliza toda la lógica de validación, sanitización y transformación
 * de datos periodontales, eliminando duplicaciones y mejorando el rendimiento.
 */
class UniversalToothValidator {
  /**
   * Valida si un número de diente es válido
   * UTILIZA CONFIGURACIÓN CENTRALIZADA - NO DUPLICAR
   * SINCRONIZADO CON CLIENTE para consistencia
   * @param {number} toothNumber - Número del diente
   * @returns {boolean} True si es válido
   */
  static isValidToothNumber(toothNumber) {
    return PERIODONTOGRAM_CONFIG.isValidToothNumber(toothNumber);
  }
  
  /**
   * Valida un valor según su esquema
   * @param {any} value - Valor a validar
   * @param {Object} schema - Esquema de validación
   * @param {string} fieldName - Nombre del campo (para logging)
   * @returns {Object} - Resultado de validación
   */
  static validateValue(value, schema, fieldName = 'unknown') {
    const errors = [];
    const warnings = [];
    
    try {
      // Validar tipo
      if (schema.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`${fieldName} debe ser un array`);
          return { isValid: false, errors, warnings, sanitizedValue: schema.default };
        }
        
        // Validar longitud del array
        if (schema.length && value.length !== schema.length) {
          warnings.push(`${fieldName} debe tener ${schema.length} elementos, se encontraron ${value.length}`);
          // Ajustar longitud
          const adjustedArray = [...value];
          while (adjustedArray.length < schema.length) {
            adjustedArray.push(schema.elementType === 'boolean' ? false : 0);
          }
          value = adjustedArray.slice(0, schema.length);
        }
        
        // Validar elementos del array
        value = value.map((element, index) => {
          if (schema.elementType === 'boolean') {
            return Boolean(element);
          } else if (schema.elementType === 'number') {
            const num = Number(element);
            if (isNaN(num)) {
              warnings.push(`${fieldName}[${index}] no es un número válido`);
              return 0;
            }
            // Aplicar límites
            if (schema.min !== undefined && num < schema.min) {
              warnings.push(`${fieldName}[${index}] está por debajo del mínimo (${schema.min})`);
              return schema.min;
            }
            if (schema.max !== undefined && num > schema.max) {
              warnings.push(`${fieldName}[${index}] está por encima del máximo (${schema.max})`);
              return schema.max;
            }
            return num;
          }
          return element;
        });
        
      } else if (schema.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${fieldName} debe ser un número`);
          return { isValid: false, errors, warnings, sanitizedValue: schema.default || 0 };
        }
        
        // Aplicar límites
        if (schema.min !== undefined && num < schema.min) {
          warnings.push(`${fieldName} está por debajo del mínimo (${schema.min})`);
          value = schema.min;
        }
        if (schema.max !== undefined && num > schema.max) {
          warnings.push(`${fieldName} está por encima del máximo (${schema.max})`);
          value = schema.max;
        } else {
          value = num;
        }
        
      } else if (schema.type === 'boolean') {
        value = Boolean(value);
        
      } else if (schema.type === 'string') {
        value = String(value || '');
        
        // Validar enum
        if (schema.enum && !schema.enum.includes(value)) {
          warnings.push(`${fieldName} debe ser uno de: ${schema.enum.join(', ')}`);
          value = schema.default || schema.enum[0];
        }
        
        // Validar longitud máxima
        if (schema.maxLength && value.length > schema.maxLength) {
          warnings.push(`${fieldName} excede la longitud máxima (${schema.maxLength})`);
          value = value.substring(0, schema.maxLength);
        }
        
      } else if (schema.type === 'object') {
        if (typeof value !== 'object' || value === null) {
          warnings.push(`${fieldName} debe ser un objeto`);
          value = schema.default || {};
        } else {
          // Validar propiedades del objeto
          const validatedObject = {};
          if (schema.properties) {
            Object.keys(schema.properties).forEach(prop => {
              const propSchema = schema.properties[prop];
              const propResult = this.validateValue(value[prop], propSchema, `${fieldName}.${prop}`);
              validatedObject[prop] = propResult.sanitizedValue;
              errors.push(...propResult.errors);
              warnings.push(...propResult.warnings);
            });
          }
          value = validatedObject;
        }
      }
      
      // Validador personalizado
      if (schema.validator && typeof schema.validator === 'function') {
        if (!schema.validator(value)) {
          errors.push(`${fieldName} no pasa la validación personalizada`);
          return { isValid: false, errors, warnings, sanitizedValue: schema.default };
        }
      }
      
    } catch (_error) {
      errors.push(`Error interno validando ${fieldName}`);
      return { isValid: false, errors, warnings, sanitizedValue: schema.default };
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: value
    };
  }
  
  /**
   * Sanitiza un valor según su esquema (sin validación estricta)
   * @param {any} value - Valor a sanitizar
   * @param {Object} schema - Esquema de sanitización
   * @returns {any} - Valor sanitizado
   */
  static sanitizeValue(value, schema) {
    const result = this.validateValue(value, schema);
    return result.sanitizedValue;
  }
  
  /**
   * Valida y sanitiza datos completos de un diente
   * @param {Object} toothData - Datos del diente
   * @returns {Object} - Datos validados y sanitizados
   */
  static validateCompleteToothData(toothData) {
    if (!toothData || typeof toothData !== 'object') {
      return this.getDefaultToothData();
    }
    
    const validatedData = {};
    const allErrors = [];
    const allWarnings = [];
    
    // Validar cada campo según el esquema
    Object.keys(UNIFIED_TOOTH_SCHEMA).forEach(fieldName => {
      const schema = UNIFIED_TOOTH_SCHEMA[fieldName];
      const fieldValue = toothData[fieldName];
      
      // Si el campo no existe, usar valor por defecto
      const valueToValidate = fieldValue !== undefined ? fieldValue : schema.default;
      
      const result = this.validateValue(valueToValidate, schema, fieldName);
      validatedData[fieldName] = result.sanitizedValue;
      
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    });
    
    // Advertencias y errores procesados
    
    return validatedData;
  }
  
  /**
   * Obtiene datos por defecto para un diente
   * SINCRONIZADO CON CLIENTE
   * UTILIZA CONFIGURACIÓN CENTRALIZADA
   * @param {number} toothNumber - Número del diente (opcional)
   * @returns {Object} - Datos por defecto
   */
  static getDefaultToothData(toothNumber = 11) {
    return PERIODONTOGRAM_CONFIG.getDefaultToothData(toothNumber);
  }
  

  
  /**
   * Valida los datos completos del periodontograma (método de compatibilidad)
   * @param {Object} data - Datos completos { teeth, statistics }
   * @returns {Object} - Resultado de validación
   */
  static validatePeriodontogramData(data) {
    try {
      if (!data || typeof data !== 'object') {
        return {
          isValid: false,
          errors: ['Los datos deben ser un objeto válido']
        };
      }

      const { teeth, statistics } = data;
      
      if (!teeth || typeof teeth !== 'object') {
        return {
          isValid: false,
          errors: ['Campo "teeth" requerido y debe ser objeto']
        };
      }

      if (!statistics || typeof statistics !== 'object') {
        return {
          isValid: false,
          errors: ['Campo "statistics" requerido y debe ser objeto']
        };
      }

      // Usar la validación de estructura existente
      return this.validatePeriodontogramStructure({ teeth, statistics });
    } catch (error) {
      return {
        isValid: false,
        errors: [`Error en validación: ${error.message}`]
      };
    }
  }

  /**
   * Valida la estructura completa del periodontograma
   * @param {Object} periodontogramData - Datos del periodontograma
   * @returns {Object} - Resultado de validación
   */
  static validatePeriodontogramStructure(periodontogramData) {
    if (!periodontogramData || typeof periodontogramData !== 'object') {
      return {
        isValid: false,
        errors: ['Los datos del periodontograma deben ser un objeto'],
        validatedData: {}
      };
    }

    // Generar hash para caché según datos completos recibidos
    const dataHash = this.generateDataHash(periodontogramData);
    const cacheKey = 'periodontogram_validation';

    // Verificar caché
    const cached = statisticsCache.get(cacheKey, dataHash);
    if (cached) {
      return cached;
    }

    const errors = [];
    const validatedData = {};

    // Se espera objeto { teeth, statistics? } y teeth como mapa FDI
    const teethData = periodontogramData.teeth && typeof periodontogramData.teeth === 'object'
      ? periodontogramData.teeth
      : (typeof periodontogramData === 'object' ? periodontogramData : null);

    if (!teethData || typeof teethData !== 'object') {
      errors.push('Campo "teeth" requerido y debe ser objeto');
    } else {
      // Normalizar alias en inglés a claves canónicas en español a nivel de diente y bloques de medición
      const CANON_FACES = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];
      const EN_TO_ES_ALIAS = {
        plaque: 'placa',
        suppuration: 'supuracion',
        bleeding: 'sangrado',
        gingivalMargin: 'margenGingival',
        probingDepth: 'profundidadSondaje',
        absent: 'ausente',
        implant: 'implante',
        gumWidth: 'anchuraEncia',
        mobility: 'movilidad',
        prognosis: 'pronostico'
      };
      const MEASURE_KEYS = ['placa', 'supuracion', 'sangrado', 'margenGingival', 'profundidadSondaje'];
      const FORBIDDEN_LEGACY_KEYS = new Set(['plaque','bleeding','suppuration','gingivalMargin','probingDepth']);

      // Crear una vista normalizada de teethData con claves en español
      const normalizedTeeth = {};
      for (const [tKey, tVal] of Object.entries(teethData)) {
        if (!tVal || typeof tVal !== 'object') { normalizedTeeth[tKey] = tVal; continue; }
        const nTooth = { ...tVal };
        // Campos a nivel de diente
        for (const [k, v] of Object.entries(tVal)) {
          if (EN_TO_ES_ALIAS[k]) {
            if (!(EN_TO_ES_ALIAS[k] in nTooth)) {
              nTooth[EN_TO_ES_ALIAS[k]] = v;
            }
            delete nTooth[k]; // eliminar siempre alias en inglés para evitar claves legacy residuales
          }
        }
        // Bloques de medición
        for (const [en, es] of Object.entries({ plaque:'placa', suppuration:'supuracion', bleeding:'sangrado', gingivalMargin:'margenGingival', probingDepth:'profundidadSondaje' })) {
          if (nTooth[en]) {
            if (!nTooth[es]) {
              nTooth[es] = nTooth[en];
            }
            delete nTooth[en]; // eliminar siempre el alias en inglés si está presente
          }
        }
        normalizedTeeth[tKey] = nTooth;
      }

      // Detección de estructura canónica por presencia de 4 caras en alguna medición (ya normalizado)
      let detectedCanonical = false;
      for (const [, tooth] of Object.entries(normalizedTeeth)) {
        if (tooth && typeof tooth === 'object') {
          const placa = tooth.placa;
          if (placa && typeof placa === 'object' && CANON_FACES.every(f => Array.isArray(placa[f]))) {
            detectedCanonical = true;
            break;
          }
        }
      }

      if (!detectedCanonical) {
        errors.push('Estructura canónica no detectada: se requieren 4 caras (vestibularSuperior, palatinoSuperior, vestibularInferior, lingualInferior) con tripletas por medición');
      }

      // Validación por diente en formato canónico (con claves en español)
      Object.entries(normalizedTeeth).forEach(([toothKey, toothData]) => {
        // Enforce lista blanca en mapa de dientes: sólo claves FDI válidas
        if (toothKey === 'metadata' || toothKey === 'statistics') {
          errors.push(`Clave no permitida en mapa de dientes: ${toothKey}`);
          return;
        }

        const numericToothNumber = parseInt(toothKey);
        if (isNaN(numericToothNumber) || !PERIODONTOGRAM_CONFIG.isValidToothNumber(numericToothNumber)) {
          errors.push(`Número de diente inválido: ${toothKey}`);
          return;
        }

        if (!toothData || typeof toothData !== 'object') {
          errors.push(`Datos de diente inválidos para ${toothKey}`);
          return;
        }

        // Rechazar claves legacy (inglés) dentro del diente y aplicar lista blanca
        for (const k of Object.keys(toothData)) {
          if (FORBIDDEN_LEGACY_KEYS.has(k)) {
            errors.push(`Clave legacy no permitida en diente ${toothKey}: ${k}`);
          }
        }
        const allowedToothKeys = new Set(['ausente','anchuraEncia','implante','movilidad','pronostico','placa','supuracion','sangrado','margenGingival','profundidadSondaje','numeroDiente','arcada']);
        for (const k of Object.keys(toothData)) {
          if (FORBIDDEN_LEGACY_KEYS.has(k)) continue; // evitar duplicación de errores
          if (!allowedToothKeys.has(k)) {
            errors.push(`Clave no permitida en diente ${toothKey}: ${k}`);
          }
        }

        // ausente requerido (booleano)
        if (typeof toothData.ausente !== 'boolean') {
          errors.push(`Campo "ausente" requerido y booleano en diente ${toothKey}`);
        }

        // implante opcional pero si viene debe ser booleano
        if (toothData.implante !== undefined && typeof toothData.implante !== 'boolean') {
          errors.push(`Campo "implante" debe ser booleano en diente ${toothKey}`);
        }

        // anchuraEncia número en rango permitido si viene (nivel diente)
        if (toothData.anchuraEncia !== undefined) {
          const n = Number(toothData.anchuraEncia);
          const min = PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.GUM_WIDTH.min;
          const max = PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.GUM_WIDTH.max;
          if (!Number.isFinite(n) || n < min || n > max) {
            errors.push(`Campo "anchuraEncia" fuera de rango [${min}..${max}] en diente ${toothKey}`);
          }
        }

        // Validar medidas por cara
        const limits = PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS;

        // Helper local para validar arrays de 3
        const validateTriplet = (arr, min, max, label) => {
          if (!Array.isArray(arr) || arr.length !== 3) return `${label} debe ser array de longitud 3`;
          for (let i = 0; i < 3; i++) {
            const v = Number(arr[i]);
            if (!Number.isFinite(v) || v < min || v > max) {
              return `${label}[${i}] fuera de rango [${min}..${max}]`;
            }
          }
          return null;
        };

        // Validar que existan los 5 bloques de mediciones
        MEASURE_KEYS.forEach((key) => {
          if (toothData[key] === undefined) {
            errors.push(`Falta bloque de medición "${key}" en diente ${toothKey}`);
          }
        });

        // Si faltan bloques, no continuar con validación por caras en este diente
        if (MEASURE_KEYS.some(k => toothData[k] === undefined)) return;

        // Validar 4 caras para cada bloque y aplicar additionalProperties: false por bloque
        for (const mKey of MEASURE_KEYS) {
          const block = toothData[mKey];
          if (!block || typeof block !== 'object') {
            errors.push(`Bloque "${mKey}" inválido en diente ${toothKey}`);
            continue;
          }

          // Enforce lista blanca de caras por bloque
          for (const k of Object.keys(block)) {
            if (!CANON_FACES.includes(k)) {
              errors.push(`Cara desconocida "${k}" en "${mKey}" del diente ${toothKey}`);
            }
          }

          for (const face of CANON_FACES) {
            if (!(face in block)) {
              errors.push(`Falta cara "${face}" en "${mKey}" del diente ${toothKey}`);
              continue;
            }

            let min = 0, max = 0;
            switch (mKey) {
              case 'placa':
              case 'supuracion':
                min = limits.PLAQUE.min; // ambos 0/1
                max = limits.PLAQUE.max;
                break;
              case 'sangrado':
                min = limits.BLEEDING.min;
                max = limits.BLEEDING.max;
                break;
              case 'margenGingival':
                min = limits.GINGIVAL_MARGIN.min;
                max = limits.GINGIVAL_MARGIN.max;
                break;
              case 'profundidadSondaje':
                min = limits.PROBING_DEPTH.min;
                max = limits.PROBING_DEPTH.max;
                break;
              default:
                min = 0; max = 0; // no debería ocurrir
            }

            const err = validateTriplet(block[face], min, max, `${mKey}.${face}`);
            if (err) errors.push(`${err} (diente ${toothKey})`);
          }
        }

        // Si todo ok para este diente, agregamos la clave validada mínima (opcional)
        validatedData[toothKey] = true;
      });
    }

    const result = {
      isValid: errors.length === 0,
      errors,
      validatedData,
      totalTeeth: Object.keys(validatedData).length
    };

    // Guardar en caché
    statisticsCache.set(cacheKey, result, dataHash);

    return result;
  }
  
  /**
   * Calcula estadísticas del periodontograma con caché inteligente
   * @param {Object} periodontogramData - Datos del periodontograma
   * @returns {Object} - Estadísticas calculadas
   */
  /**
   * Calcula estadísticas unificadas del periodontograma
   * FUNCIÓN UNIFICADA - Compatible con ambas estructuras de datos (cliente y servidor)
   * @param {Object} periodontogramData - Datos del periodontograma
   * @returns {Object} Estadísticas calculadas
   */
  static calculateStatistics(periodontogramData) {
    if (!periodontogramData || !periodontogramData.teeth) {
      return this.getDefaultStatistics();
    }
    
    // Generar hash para caché
    const dataHash = this.generateDataHash(periodontogramData);
    const cacheKey = 'periodontogram_statistics';
    
    // Verificar caché
    const cached = statisticsCache.get(cacheKey, dataHash);
    if (cached) {
      return cached;
    }
    
    const teeth = periodontogramData.teeth;
    const faceKeysEs = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];
    const measurementKeysEs = ['sangrado', 'placa', 'supuracion', 'margenGingival', 'profundidadSondaje'];
    const toFiniteNumber = (value, fallback = 0) => {
      if (value === true) return 1;
      if (value === false) return 0;
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const forEachTriple = (candidate, handler) => {
      if (!Array.isArray(candidate)) return;
      const limit = Math.min(3, candidate.length);
      for (let i = 0; i < limit; i++) {
        handler(candidate[i], i);
      }
    };
    let presentTeeth = 0;
    let bleedingCount = 0;
    let plaqueCount = 0;
    let totalDepth = 0;
    let depthCount = 0;
    let totalAttachmentLevel = 0;
    let attachmentLevelCount = 0;
    
    // Iterar sobre los 32 dientes permanentes estándar
    PERIODONTOGRAM_CONFIG.PERMANENT_TEETH.forEach(toothNumber => {
  const toothData = teeth[toothNumber];
      
  // Verificar si el diente está presente
  const isAbsentFlag = toothData && ((toothData.present === false) || (toothData.absent === true) || (toothData.ausente === true));
  const isPresent = toothData && !isAbsentFlag;
      
      if (isPresent) {
        presentTeeth++;
        
        // Procesar datos de sangrado y placa por caras (estructura legacy por caras)
        const processToothFaces = (tooth) => {
          const faces = ['vestibular', 'palatino'];
          
          faces.forEach(face => {
            const faceData = tooth[face];
            if (faceData) {
              // Sangrado: contar cada casilla del array (3 elementos por cara)
              if (Array.isArray(faceData.sangrado)) {
                faceData.sangrado.forEach(value => {
                  if (typeof value === 'number' && value > 0) bleedingCount++;
                  else if (value === true || value === 1) bleedingCount++;
                });
              } else if (faceData.sangrado > 0) {
                bleedingCount++;
              }
              
              // Placa: contar cada casilla del array (3 elementos por cara)
              if (Array.isArray(faceData.placa)) {
                faceData.placa.forEach(value => {
                  if (typeof value === 'number' && value > 0) plaqueCount++;
                  else if (value === true || value === 1) plaqueCount++;
                });
              } else if (faceData.placa > 0) {
                plaqueCount++;
              }
              
              // Profundidad de sondaje: procesar array de 3 elementos
              if (Array.isArray(faceData.profundidadSondaje)) {
                faceData.profundidadSondaje.forEach((depth, index) => {
                  const numDepth = parseFloat(depth);
                  if (!isNaN(numDepth) && numDepth !== 999) {
                    // Nivel de inserción clínica (NIC) = PS - MG (margen positivo reduce, margen negativo aumenta)
                    const marginArray = faceData.margenGingival || faceData.margen;
                    const margin = Array.isArray(marginArray) ? parseFloat(marginArray[index]) || 0 : parseFloat(faceData.margenGingival) || 0;
                    const attachmentLevel = numDepth - margin;
                    totalAttachmentLevel += attachmentLevel;
                    attachmentLevelCount++;
                    // Acumular profundidad para media global
                    totalDepth += numDepth;
                    depthCount++;
                  }
                });
              } else {
                // Compatibilidad con valores únicos
                const depth = parseFloat(faceData.profundidadSondaje);
                if (!isNaN(depth) && depth > 0) {
                  totalDepth += depth;
                  depthCount++;
                  
                  // Nivel de inserción clínica (NIC) = PS - MG (margen positivo reduce, margen negativo aumenta)
                  const margin = parseFloat(faceData.margenGingival) || 0;
                  const attachmentLevel = depth - margin;
                  totalAttachmentLevel += attachmentLevel;
                  attachmentLevelCount++;
                }
              }
            }
          });
          
          // Compatibilidad con estructura legacy adicional
          if (tooth.lingual) {
            const faceData = tooth.lingual;
            if (faceData.sangrado > 0) bleedingCount++;
            if (faceData.placa > 0) plaqueCount++;
            
            const depth = parseFloat(faceData.profundidadSondaje);
            if (!isNaN(depth) && depth > 0) {
              totalDepth += depth;
              depthCount++;
              
              const margin = parseFloat(faceData.margenGingival) || 0;
              const attachmentLevel = depth - margin;
              totalAttachmentLevel += attachmentLevel;
              attachmentLevelCount++;
            }
          }
        };

        // Detectar estructura canónica (bloques con caras canónicas de tripletas)
        const hasCanonical = (() => {
          const keys = ['bleeding', 'plaque', 'suppuration', 'probingDepth', 'gingivalMargin'];
          return keys.some(k => {
            const block = toothData && toothData[k];
            return block && typeof block === 'object' && CANON_FACES.some(f => Array.isArray(block[f]));
          });
        })();

        const hasSpanishCanonicalFaces = faceKeysEs.some(faceKey => {
          const face = toothData && toothData[faceKey];
          if (!face || typeof face !== 'object') return false;
          return measurementKeysEs.some(mKey => Array.isArray(face[mKey]));
        });

        if (hasCanonical) {
          // Procesar formato canónico: 5 bloques x 4 caras x tripletas
          for (const face of CANON_FACES) {
            // Conteos de sangrado
            const bleedArr = toothData.bleeding && toothData.bleeding[face];
            if (Array.isArray(bleedArr)) {
              bleedArr.forEach(v => {
                if (typeof v === 'number' && v > 0) bleedingCount++; else if (v === true || v === 1) bleedingCount++;
              });
            }
            // Conteos de placa
            const plaqueArr = toothData.plaque && toothData.plaque[face];
            if (Array.isArray(plaqueArr)) {
              plaqueArr.forEach(v => {
                if (typeof v === 'number' && v > 0) plaqueCount++; else if (v === true || v === 1) plaqueCount++;
              });
            }
            // Profundidad y NIC
            const depthArr = toothData.probingDepth && toothData.probingDepth[face];
            const marginArr = toothData.gingivalMargin && toothData.gingivalMargin[face];
            if (Array.isArray(depthArr)) {
              for (let i = 0; i < depthArr.length; i++) {
                const depth = parseFloat(depthArr[i]);
                // Excluir solo valores centinela (999) - incluir 0 como medición válida
                if (!isNaN(depth) && depth !== 999) {
                  const rawMargin = Array.isArray(marginArr) ? parseFloat(marginArr[i]) : (typeof marginArr === 'number' ? marginArr : 0);
                  const margin = isNaN(rawMargin) ? 0 : rawMargin;
                  totalDepth += depth; depthCount++;
                  totalAttachmentLevel += (depth - margin); attachmentLevelCount++;
                }
              }
            }
          }
        } else if (hasSpanishCanonicalFaces) {
          // Procesar formato canónico con claves en español dentro de cada cara
          const inferredArcade = (() => {
            if (typeof toothData === 'object' && typeof toothData.arcada === 'string') {
              return toothData.arcada.toLowerCase();
            }
            const n = Number(toothNumber);
            if (Number.isFinite(n)) {
              return (n >= 11 && n <= 28) ? 'superior' : 'inferior';
            }
            return null;
          })();

          let facesToProcess = faceKeysEs.filter(faceKey => {
            const face = toothData && toothData[faceKey];
            if (!face || typeof face !== 'object') return false;
            return measurementKeysEs.some(mKey => Array.isArray(face[mKey]));
          });

          if (facesToProcess.length > 2) {
            const preferred = inferredArcade === 'superior'
              ? ['vestibularSuperior', 'palatinoSuperior']
              : ['vestibularInferior', 'lingualInferior'];
            const filtered = preferred.filter(face => facesToProcess.includes(face));
            if (filtered.length > 0) {
              facesToProcess = filtered;
            } else {
              facesToProcess = facesToProcess.slice(0, 2);
            }
          }

          facesToProcess.forEach(faceKey => {
            const face = toothData[faceKey];
            if (!face || typeof face !== 'object') {
              return;
            }

            // Sangrado
            forEachTriple(face.sangrado ?? face.bleeding, (value) => {
              const bleedValue = toFiniteNumber(value);
              if (bleedValue > 0) {
                bleedingCount++;
              }
            });

            // Placa
            forEachTriple(face.placa ?? face.plaque, (value) => {
              const plaqueValue = toFiniteNumber(value);
              if (plaqueValue > 0) {
                plaqueCount++;
              }
            });

            // Profundidad y NIC
            const depthArray = face.profundidadSondaje ?? face.probingDepth;
            const marginArray = face.margenGingival ?? face.gingivalMargin;
            forEachTriple(depthArray, (depthValue, index) => {
              const depth = toFiniteNumber(depthValue, 0);
              if (!Number.isFinite(depth) || depth === 999) {
                return;
              }
              const margin = Array.isArray(marginArray)
                ? toFiniteNumber(marginArray[index], 0)
                : toFiniteNumber(marginArray, 0);
              totalDepth += depth;
              depthCount++;
              totalAttachmentLevel += (depth - margin);
              attachmentLevelCount++;
            });
          });
        } else {
          // Flujo legacy existente
          processToothFaces(toothData);
          
          // Compatibilidad con estructura legacy (arrays simples de 6 elementos)
          const legacyProbingDepth = toothData.probingDepth;
          const legacyGingivalMargin = toothData.gingivalMargin;
          
          if (legacyProbingDepth && legacyGingivalMargin && 
              Array.isArray(legacyProbingDepth) && Array.isArray(legacyGingivalMargin)) {
            
            // Procesar hasta 6 sitios (3 vestibular + 3 palatino/lingual)
            for (let i = 0; i < Math.min(6, legacyProbingDepth.length, legacyGingivalMargin.length); i++) {
              const depth = parseFloat(legacyProbingDepth[i]);
              const margin = parseFloat(legacyGingivalMargin[i]);
              
              if (!isNaN(depth) && !isNaN(margin) && depth !== 999 && margin !== 999) {
                // Acumular profundidad
                totalDepth += depth;
                depthCount++;
                
                // Calcular nivel de inserción clínica (NIC = PS - MG)
                const attachmentLevel = depth - margin;
                totalAttachmentLevel += attachmentLevel;
                attachmentLevelCount++;
              }
            }
          }
        }
      }
    });
    
    // Calcular estadísticas según fórmulas específicas por el usuario
    const absentTeeth = 32 - presentTeeth;
    
    // 🦷 Fórmulas de estadísticas periodontales (usando base de 192 sitios)
    // Base: 32 dientes * 6 casillas (3 vestibular + 3 palatino/lingual) = 192 sitios. Si hay ausentes: presentTeeth * 6
    const totalCasillasPosibles = presentTeeth * 6;
    
    const statistics = {
      totalTeeth: 32, // Siempre 32 dientes permanentes
      presentTeeth,
      absentTeeth,
      
      // Conteos de sitios
      bleedingCount,
      plaqueCount,
      
      // 3. % de sangrado: (numeroDeCasillasConSangrado / totalCasillasPosibles) * 100
      bleedingPercentage: totalCasillasPosibles > 0 ? Math.round((bleedingCount / totalCasillasPosibles) * 100) : 0,
      
      // 4. % de placa: (numeroDeCasillasConPlaca / totalCasillasPosibles) * 100
      plaquePercentage: totalCasillasPosibles > 0 ? Math.round((plaqueCount / totalCasillasPosibles) * 100) : 0,
      
      // 1. Media de profundidad de sondaje: sumaDeTodasLasProfundidades / numeroDeCasillasConValor
      averageProbingDepth: depthCount > 0 ? Math.round((totalDepth / depthCount) * 100) / 100 : 0,
      
      // 2. Media de nivel de inserción clínica: nivelInsercion = profundidadSondaje - margenGingival
      averageAttachmentLevel: attachmentLevelCount > 0 ? Math.round((totalAttachmentLevel / attachmentLevelCount) * 100) / 100 : 0,
      
      lastCalculated: new Date().toISOString()
    };
    
    // Guardar en caché
    statisticsCache.set(cacheKey, statistics, dataHash);
    
    console.log('[VALIDATION] Estadísticas calculadas exitosamente según especificaciones SEPA', {
      presentTeeth: statistics.presentTeeth,
      totalCasillasPosibles,
      bleedingCount,
      bleedingPercentage: statistics.bleedingPercentage
    });
    
    return statistics;
  }
  
  /**
   * Genera un hash simple para los datos (para caché)
   * @param {Object} data - Datos a hashear
   * @returns {string} - Hash de los datos
   */
  /**
   * Normaliza datos para generar hash consistente
   */
  static normalizeDataForHash(data, visited = new WeakSet()) {
    if (data === null || data === undefined) {
      return null;
    }
    
    // Para tipos primitivos, retornar directamente
    if (typeof data !== 'object') {
      return data;
    }
    
    // Detectar referencias circulares
    if (visited.has(data)) {
      return '[Circular]';
    }
    
    // Marcar como visitado
    visited.add(data);
    
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeDataForHash(item, visited));
    }
    
    // Objetos regulares
    const normalized = {};
    // Ordenar claves alfabéticamente para consistencia
    Object.keys(data).sort().forEach(key => {
      normalized[key] = this.normalizeDataForHash(data[key], visited);
    });
    return normalized;
  }
  
  /**
   * Genera hash de datos para caché de forma determinística
   */
  static generateDataHash(data) {
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
      console.error('Error generando hash de datos:', error);
      return Date.now().toString();
    }
  }
  
  /**
   * Valida una medición individual según su tipo
   * UTILIZA CONFIGURACIÓN CENTRALIZADA
   * @param {any} value - Valor a validar
   * @param {string} measurementType - Tipo de medición
   * @returns {number} - Valor validado
   */
  static validateMeasurement(value, measurementType) {
    return PERIODONTOGRAM_CONFIG.validateMeasurement(value, measurementType);
  }
  
  /**
   * Invalida caché de estadísticas
   * @param {string} key - Clave específica a invalidar (opcional)
   */
  static invalidateCache(key = null) {
    if (key) {
      statisticsCache.invalidate(key);
    } else {
      statisticsCache.clear();
    }
  }
  
  /**
   * Obtiene estadísticas del caché
   * @returns {Object} - Estadísticas del caché
   */
  static getCacheStats() {
    return statisticsCache.getStats();
  }
  
  /**
   * Estadísticas por defecto
   * @returns {Object} - Objeto con estadísticas inicializadas a cero
   */
  static getDefaultStatistics() {
    return {
      totalTeeth: 0,
      presentTeeth: 0,
      bleedingPercentage: 0,
      plaquePercentage: 0,
      averageProbingDepth: 0,
      averageGingivalMargin: 0,
      averageAttachmentLevel: 0,
      standard: 'UNIFIED_CALCULATION',
      calculatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Alias para getDefaultStatistics para mantener compatibilidad con código existente
   * @returns {Object} - Objeto con estadísticas inicializadas a cero
   */
  static getEmptyStatistics() {
    return this.getDefaultStatistics();
  }
  
  /**
   * Valida datos de un diente según el esquema normalizado Opción 1
   * @param {Object} toothData - Datos del diente a validar
   * @param {number} toothNumber - Número del diente
   * @returns {Object} - { isValid: boolean, errors: string[], normalizedData: Object }
   */
  static validateToothData(toothData, toothNumber) {
    const errors = [];
    const normalizedData = {};
    
    try {
      // Validar número de diente
      if (!PERIODONTOGRAM_CONFIG.isValidToothNumber(toothNumber)) {
        errors.push(`Número de diente inválido: ${toothNumber}`);
        return { isValid: false, errors, normalizedData: null };
      }
      
      // Determinar arcada automáticamente
      const arcada = this.determineArcada(toothNumber);
      normalizedData.numero = toothNumber;
      normalizedData.arcada = arcada;
      
      // Validar cada campo según el esquema
      for (const [fieldName, fieldSchema] of Object.entries(UNIFIED_TOOTH_SCHEMA)) {
        if (fieldName === 'numero' || fieldName === 'arcada') continue; // Ya procesados
        
        const fieldValue = toothData[fieldName];
        const validationResult = this.validateValue(fieldValue, fieldSchema, fieldName);
        
        if (!validationResult.isValid) {
          errors.push(...validationResult.errors);
        } else {
          normalizedData[fieldName] = validationResult.sanitizedValue;
        }
      }
      
      // Validaciones específicas adicionales
      this.performSpecificValidations(normalizedData, toothNumber, errors);
      
      return {
        isValid: errors.length === 0,
        errors,
        normalizedData: errors.length === 0 ? normalizedData : null
      };
      
    } catch (error) {
      console.error('Error en validación de diente:', error);
      return {
        isValid: false,
        errors: [`Error interno de validación: ${error.message}`],
        normalizedData: null
      };
    }
  }
  
  /**
   * Determina la arcada basada en el número de diente
   * @param {number} toothNumber - Número del diente
   * @returns {string} - 'superior' o 'inferior'
   */
  static determineArcada(toothNumber) {
    const firstDigit = Math.floor(toothNumber / 10);
    return (firstDigit === 1 || firstDigit === 2 || firstDigit === 5 || firstDigit === 6) ? 'superior' : 'inferior';
  }
  
  /**
   * Realiza validaciones específicas adicionales para normalización Opción 1
   * @param {Object} normalizedData - Datos normalizados
   * @param {number} toothNumber - Número del diente
   * @param {Array} errors - Array de errores
   */
  static performSpecificValidations(normalizedData, toothNumber, errors) {
    // Validar coherencia entre absent e implante
    if (normalizedData.absent === true && normalizedData.implante === true) {
      errors.push('Un diente no puede estar ausente y ser implante al mismo tiempo');
    }
    
    // Validación de furca condicionada por configuración
    const isMolar = PERIODONTOGRAM_CONFIG.isMolar(toothNumber);
    const needsDouble = PERIODONTOGRAM_CONFIG.needsDoubleFurca(toothNumber);
    const f = normalizedData.furca || {};

    const anyFurcaSimple = (
      (typeof f.vestibular === 'number' && f.vestibular > 0) ||
      (typeof f.lingualPalatino === 'number' && f.lingualPalatino > 0)
    );
    const anyFurcaDouble = (
      f.doble && (
        (typeof f.doble.furca1 === 'number' && f.doble.furca1 > 0) ||
        (typeof f.doble.furca2 === 'number' && f.doble.furca2 > 0)
      )
    );

    if (!isMolar && (anyFurcaSimple || anyFurcaDouble)) {
      errors.push('Solo los molares pueden tener datos de furca');
    }

    if (isMolar) {
      // Si el diente no requiere doble furcación, no debe aportar valores en doble
      if (!needsDouble && anyFurcaDouble) {
        errors.push(`El diente ${toothNumber} no requiere doble furcación`);
      }

      // Rango de furca para simples y dobles
      const { min, max } = PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS.FURCA;
      ['vestibular', 'lingualPalatino'].forEach(k => {
        if (typeof f[k] === 'number') {
          if (f[k] < min || f[k] > max) {
            errors.push(`furca.${k} fuera de rango [${min}..${max}] en diente ${toothNumber}`);
          }
        }
      });
      if (f.doble) {
        if (typeof f.doble.furca1 === 'number' && (f.doble.furca1 < min || f.doble.furca1 > max)) {
          errors.push(`furca.doble.furca1 fuera de rango [${min}..${max}] en diente ${toothNumber}`);
        }
        if (typeof f.doble.furca2 === 'number' && (f.doble.furca2 < min || f.doble.furca2 > max)) {
          errors.push(`furca.doble.furca2 fuera de rango [${min}..${max}] en diente ${toothNumber}`);
        }
      }
    }
    
    // Validar arrays de medición en caras
    const faceFields = ['vestibular', 'lingualPalatino'];
    faceFields.forEach(face => {
      if (normalizedData[face]) {
        Object.keys(FACE_DATA_SCHEMA).forEach(measurement => {
          const array = normalizedData[face][measurement];
          if (array && array.length !== PERIODONTOGRAM_CONFIG.MEASUREMENT_ARRAY_CONFIG.LENGTH) {
            errors.push(`${face}.${measurement} debe tener exactamente ${PERIODONTOGRAM_CONFIG.MEASUREMENT_ARRAY_CONFIG.LENGTH} elementos`);
          }
        });
      }
    });

    // Validar que la arcada sea consistente con el número de diente
    const expectedArcada = this.determineArcada(toothNumber);
    if (normalizedData.arcada !== expectedArcada) {
      errors.push(`La arcada ${normalizedData.arcada} no es consistente con el número de diente ${toothNumber}`);
    }
  }
  
  /**
   * Transforma datos del frontend al formato backend normalizado Opción 1
   * @param {Object} frontendData - Datos del frontend
   * @param {number} toothNumber - Número del diente
   * @returns {Object} - Datos transformados para backend
   */
  static transformToBackend(frontendData, toothNumber) {
    try {
      const arcada = this.determineArcada(toothNumber);
      const needsDouble = PERIODONTOGRAM_CONFIG.needsDoubleFurca(toothNumber);

      // Procesar furca según reglas: número -> lingualPalatino; [n1,n2] -> doble (solo molares con doble)
      const furcaInput = frontendData?.furca;
      let furcaOut = { vestibular: 0, lingualPalatino: 0, doble: { furca1: 0, furca2: 0 } };
      if (Array.isArray(furcaInput)) {
        if (needsDouble && furcaInput.length >= 2) {
          furcaOut.doble.furca1 = Number(furcaInput[0]) || 0;
          furcaOut.doble.furca2 = Number(furcaInput[1]) || 0;
        }
        // Si no aplica doble furca, se ignora el array (queda en 0)
      } else if (typeof furcaInput === 'number' || typeof furcaInput === 'string') {
        const v = Number(furcaInput) || 0;
        furcaOut.lingualPalatino = v; // Palatino en superiores, lingual en inferiores (campo neutral)
      }

      const backendData = {
        numero: toothNumber,
        arcada,

        // Estados del diente: usar present (API nueva) y persistir absent = !present
        absent: typeof frontendData.present === 'boolean' ? !frontendData.present : Boolean(frontendData.absent),
        implante: Boolean(frontendData.implante),

        pronostico: String(frontendData.pronostico || 'bueno'),
        movilidad: Number(frontendData.movilidad) || 0,

        // Valor único de anchura de encía a nivel de diente
        anchuraEncia: Number.isFinite(Number(frontendData.anchuraEncia))
          ? Math.min(
              UNIFIED_TOOTH_SCHEMA.anchuraEncia.max,
              Math.max(UNIFIED_TOOTH_SCHEMA.anchuraEncia.min, Number(frontendData.anchuraEncia))
            )
          : UNIFIED_TOOTH_SCHEMA.anchuraEncia.default,

        // Objeto furca normalizado
        furca: furcaOut,

        // Caras del diente (sin anchuraEncia por cara)
        vestibular: this.transformFaceData(frontendData.vestibular),
        lingualPalatino: this.transformFaceData(frontendData.lingualPalatino || frontendData.palatino || frontendData.lingual)
      };

      return backendData;

    } catch (error) {
      console.error('Error transformando datos a backend:', error);
      return null;
    }
  }
  
  /**
   * Transforma datos de una cara del diente
   * @param {Object} faceData - Datos de la cara
   * @returns {Object} - Datos de cara transformados
   */
  static transformFaceData(faceData) {
    if (!faceData) {
      return {
        profundidadSondaje: this.ensureArray3(null, 0),
        margenGingival: this.ensureArray3(null, 0),
        sangrado: this.ensureArray3(null, 0),
        supuracion: this.ensureArray3(null, 0),
        placa: this.ensureArray3(null, 0)
      };
    }
    
    return {
      profundidadSondaje: this.ensureArray3(faceData.profundidadSondaje || faceData.profundidad, 0),
      margenGingival: this.ensureArray3(faceData.margenGingival || faceData.margen, 0),
      sangrado: this.ensureArray3(faceData.sangrado, 0),
      supuracion: this.ensureArray3(faceData.supuracion, 0),
      placa: this.ensureArray3(faceData.placa, 0)
    };
  }
  
  /**
   * Asegura que un valor sea un array de 3 elementos
   * @param {*} value - Valor a convertir
   * @param {*} defaultValue - Valor por defecto para elementos faltantes
   * @returns {Array} - Array de 3 elementos
   */
  static ensureArray3(value, defaultValue) {
    if (!Array.isArray(value)) {
      return new Array(3).fill(defaultValue);
    }
    
    const result = [...value];
    while (result.length < 3) {
      result.push(defaultValue);
    }
    
    return result.slice(0, 3);
  }

  // Compatibilidad legacy de periodontograma eliminada: ensureArray6, transformToBackendLegacy,
  // convertFourFaceToSixElement, convertSixElementToFourFace y transformToFrontendLegacy han sido retiradas.
  // Se mantiene únicamente el contrato canónico basado en arrays de 3 por cara y claves canónicas.
  
  /**
   * Genera JSON Schemas (draft-07) a partir del esquema interno unificado
   * - Evita duplicación de definiciones
   * - No introduce dependencias externas
   * @returns {{ toothSchema: Object, periodontogramSchema: Object }}
   */
  static getJsonSchemas() {
    // Helpers locales para evitar duplicación y mantener el cambio acotado
    const array3 = (min, max, isInteger = false, def = [0, 0, 0]) => ({
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: isInteger ? 'integer' : 'number',
        ...(min !== undefined ? { minimum: min } : {}),
        ...(max !== undefined ? { maximum: max } : {})
      },
      default: Array.isArray(def) ? def.slice() : def
    });

    const array3FromFace = (faceKey, isInteger = false) => array3(
      FACE_DATA_SCHEMA?.[faceKey]?.min,
      FACE_DATA_SCHEMA?.[faceKey]?.max,
      isInteger,
      FACE_DATA_SCHEMA?.[faceKey]?.default ?? [0, 0, 0]
    );

    const fourFacesObject = (itemsSchema) => ({
      type: 'object',
      additionalProperties: false,
      properties: {
        vestibularSuperior: itemsSchema,
        palatinoSuperior: itemsSchema,
        vestibularInferior: itemsSchema,
        lingualInferior: itemsSchema
      },
      required: ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior']
    });

    // Mapear propiedades clínicas y técnicas al canónico de Front
    const toothProperties = {
      // Técnicas/estado
      absent: { type: 'boolean', default: !!(UNIFIED_TOOTH_SCHEMA.absent && UNIFIED_TOOTH_SCHEMA.absent.default) },
      gumWidth: {
        type: 'number',
        ...(UNIFIED_TOOTH_SCHEMA.anchuraEncia?.min !== undefined ? { minimum: UNIFIED_TOOTH_SCHEMA.anchuraEncia.min } : {}),
        ...(UNIFIED_TOOTH_SCHEMA.anchuraEncia?.max !== undefined ? { maximum: UNIFIED_TOOTH_SCHEMA.anchuraEncia.max } : {}),
        default: UNIFIED_TOOTH_SCHEMA.anchuraEncia?.default ?? 0
      },
      implant: { type: 'boolean', default: !!(UNIFIED_TOOTH_SCHEMA.implante && UNIFIED_TOOTH_SCHEMA.implante.default) },
      mobility: {
        type: 'number',
        ...(UNIFIED_TOOTH_SCHEMA.movilidad?.min !== undefined ? { minimum: UNIFIED_TOOTH_SCHEMA.movilidad.min } : {}),
        ...(UNIFIED_TOOTH_SCHEMA.movilidad?.max !== undefined ? { maximum: UNIFIED_TOOTH_SCHEMA.movilidad.max } : {}),
        default: UNIFIED_TOOTH_SCHEMA.movilidad?.default ?? 0
      },
      prognosis: {
        type: 'string',
        ...(Array.isArray(UNIFIED_TOOTH_SCHEMA.pronostico?.enum) ? { enum: UNIFIED_TOOTH_SCHEMA.pronostico.enum.slice() } : {}),
        ...(UNIFIED_TOOTH_SCHEMA.pronostico?.default !== undefined ? { default: UNIFIED_TOOTH_SCHEMA.pronostico.default } : {})
      },

      // Medidas por cara (4-caras, arrays de 3)
      plaque: fourFacesObject(array3FromFace('placa', true)),
      suppuration: fourFacesObject(array3FromFace('supuracion', true)),
      bleeding: fourFacesObject(array3FromFace('sangrado', true)),
      // Decisión del usuario: canónico [-9..9] para ambos
      gingivalMargin: fourFacesObject(array3(-9, 9, false, [0, 0, 0])),
      probingDepth: fourFacesObject(array3(-9, 9, false, [0, 0, 0]))
    };

    const toothSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'dent.periodontogram.tooth.schema.json',
      type: 'object',
      additionalProperties: false,
      properties: toothProperties,
      required: ['absent']
    };

    // Objeto de dientes indexado por clave FDI (estricto según decisión del usuario)
    const teethObjectSchema = {
      type: 'object',
      patternProperties: {
        '^(1[1-8]|2[1-8]|3[1-8]|4[1-8])$': toothSchema
      },
      additionalProperties: false
    };

    const periodontogramSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'dent.periodontogram.schema.json',
      oneOf: [
        {
          type: 'object',
          properties: {
            teeth: teethObjectSchema,
            statistics: { type: 'object' }
          },
          required: ['teeth'],
          additionalProperties: false
        },
        teethObjectSchema
      ]
    };

    return { toothSchema, periodontogramSchema };
  }
  
  /**
   * @deprecated Esta función está obsoleta - el frontend ahora maneja arrays de 6 elementos directamente
   * Convierte array de 6-elementos a estructura 4-caras
   * @param {Array} sixElementArray - Array de 6 elementos
   * @param {*} defaultValue - Valor por defecto
   * @returns {Object} - Estructura de 4-caras
   */

  /**
   * Transforma datos del backend al formato del frontend (versión legacy)
   * @param {Object} backendData - Datos en formato backend
   * @param {boolean} useLegacyFormat - Si usar formato legacy de 4-caras
   * @returns {Object} - Datos en formato frontend
   */
}

module.exports = {
  UniversalToothValidator,
  UNIFIED_TOOTH_SCHEMA,
  StatisticsCache
};