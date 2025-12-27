/**
 * 🔧 ESQUEMA UNIFICADO DE PERIODONTOGRAMA
 * 
 * Esquema único que define la estructura de datos que usarán tanto frontend como backend,
 * eliminando la necesidad de transformaciones y garantizando consistencia total.
 * 
 * PRINCIPIOS:
 * ✅ Un solo formato de datos para todo el sistema
 * ✅ Sin transformaciones entre frontend y backend
 * ✅ Estructura vestibular/palatino nativa
 * ✅ Validación centralizada
 * ✅ Compatibilidad con especificación médica
 * 
 * @version 1.0.0 - ESQUEMA UNIFICADO SIN TRANSFORMACIONES
 * @author Sistema de Normalización
 */

import { MEASUREMENT_LIMITS, FIELD_OPTIONS } from '../config/periodontogram-config.js';

// ============================================================================
// ESQUEMA DE CARA DENTAL - ESTRUCTURA VESTIBULAR/PALATINO NATIVA
// ============================================================================

/**
 * Esquema para una cara dental (vestibular o palatino/lingual)
 * Estructura: 3 mediciones por cara [mesial, central, distal]
 */
export const FACE_SCHEMA = {
  profundidadSondaje: {
    type: 'array',
    length: 3,
    elementType: 'number',
    min: MEASUREMENT_LIMITS.profundidadSondaje.min,
    max: MEASUREMENT_LIMITS.profundidadSondaje.max,
    default: [0, 0, 0],
    description: 'Profundidad de sondaje [mesial, central, distal]'
  },
  margenGingival: {
    type: 'array',
    length: 3,
    elementType: 'number',
    min: MEASUREMENT_LIMITS.margenGingival.min,
    max: MEASUREMENT_LIMITS.margenGingival.max,
    default: [0, 0, 0],
    description: 'Margen gingival [mesial, central, distal]'
  },
  sangrado: {
    type: 'array',
    length: 3,
    elementType: 'number',
    min: MEASUREMENT_LIMITS.sangrado.min,
    max: MEASUREMENT_LIMITS.sangrado.max,
    default: [0, 0, 0],
    description: 'Sangrado al sondaje [mesial, central, distal]'
  },
  supuracion: {
    type: 'array',
    length: 3,
    elementType: 'number',
    min: MEASUREMENT_LIMITS.supuracion.min,
    max: MEASUREMENT_LIMITS.supuracion.max,
    default: [0, 0, 0],
    description: 'Supuración [mesial, central, distal]'
  },
  placa: {
    type: 'array',
    length: 3,
    elementType: 'number',
    min: MEASUREMENT_LIMITS.placa.min,
    max: MEASUREMENT_LIMITS.placa.max,
    default: [0, 0, 0],
    description: 'Placa bacteriana [mesial, central, distal]'
  }
};

export const CANONICAL_FACE_KEYS = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];

const createFaceDefault = () => ({
  profundidadSondaje: [...FACE_SCHEMA.profundidadSondaje.default],
  margenGingival: [...FACE_SCHEMA.margenGingival.default],
  sangrado: [...FACE_SCHEMA.sangrado.default],
  supuracion: [...FACE_SCHEMA.supuracion.default],
  placa: [...FACE_SCHEMA.placa.default]
});

const createFurcaDefault = () => ({
  vestibular: MEASUREMENT_LIMITS.furca.default,
  lingualPalatino: MEASUREMENT_LIMITS.furca.default,
  doble: {
    furca1: MEASUREMENT_LIMITS.furca.default,
    furca2: MEASUREMENT_LIMITS.furca.default
  }
});

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = cloneValue(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const resolveDefaultValue = (schema) => {
  if (!schema || schema.default === undefined) {
    return null;
  }
  const { default: defaultValue } = schema;
  if (typeof defaultValue === 'function') {
    return defaultValue();
  }
  return cloneValue(defaultValue);
};

const inferArcadaFromNumber = (numeroDiente) => {
  if (!Number.isFinite(numeroDiente)) {
    return FIELD_OPTIONS.arcada.default;
  }
  const firstDigit = Math.floor(numeroDiente / 10);
  if ([1, 2, 5, 6].includes(firstDigit)) {
    return 'superior';
  }
  return 'inferior';
};

// ============================================================================
// ESQUEMA DE FURCA - ESTRUCTURA MÉDICA CORRECTA
// ============================================================================

/**
 * Esquema para afectación de furca en molares
 * Estructura según especificación médica
 */
export const FURCA_SCHEMA = {
  type: 'object',
  properties: {
    vestibular: {
      type: 'number',
      min: MEASUREMENT_LIMITS.furca.min,
      max: MEASUREMENT_LIMITS.furca.max,
      default: MEASUREMENT_LIMITS.furca.default,
      description: 'Grado de afectación vestibular'
    },
    lingualPalatino: {
      type: 'number',
      min: MEASUREMENT_LIMITS.furca.min,
      max: MEASUREMENT_LIMITS.furca.max,
      default: MEASUREMENT_LIMITS.furca.default,
      description: 'Grado de afectación lingual/palatino'
    },
    doble: {
      type: 'object',
      properties: {
        furca1: {
          type: 'number',
          min: MEASUREMENT_LIMITS.furca.min,
          max: MEASUREMENT_LIMITS.furca.max,
          default: MEASUREMENT_LIMITS.furca.default,
          description: 'Furca adicional 1'
        },
        furca2: {
          type: 'number',
          min: MEASUREMENT_LIMITS.furca.min,
          max: MEASUREMENT_LIMITS.furca.max,
          default: MEASUREMENT_LIMITS.furca.default,
          description: 'Furca adicional 2'
        }
      },
      default: () => ({
        furca1: MEASUREMENT_LIMITS.furca.default,
        furca2: MEASUREMENT_LIMITS.furca.default
      })
    }
  },
  default: () => createFurcaDefault()
};

// ============================================================================
// ESQUEMA UNIFICADO DE DIENTE - FORMATO ÚNICO PARA TODO EL SISTEMA
// ============================================================================

/**
 * Esquema unificado de diente que usarán tanto frontend como backend
 * SIN NECESIDAD DE TRANSFORMACIONES
 */
export const UNIFIED_TOOTH_SCHEMA = {
  numeroDiente: {
    type: 'number',
    required: true,
    default: null,
    description: 'Número del diente según sistema FDI'
  },
  arcada: {
    type: 'string',
    enum: FIELD_OPTIONS.arcada.values,
    default: FIELD_OPTIONS.arcada.default,
    description: 'Arcada dental (superior/inferior)'
  },
  ausente: {
    type: 'boolean',
    default: false,
    description: 'Diente ausente (true) o presente (false)'
  },
  implante: {
    type: 'boolean',
    default: false,
    description: 'Es implante dental'
  },
  movilidad: {
    type: 'number',
    min: MEASUREMENT_LIMITS.movilidad.min,
    max: MEASUREMENT_LIMITS.movilidad.max,
    default: MEASUREMENT_LIMITS.movilidad.default,
    description: 'Grado de movilidad dental'
  },
  anchuraEncia: {
    type: 'number',
    min: MEASUREMENT_LIMITS.anchuraEncia.min,
    max: MEASUREMENT_LIMITS.anchuraEncia.max,
    default: MEASUREMENT_LIMITS.anchuraEncia.default,
    description: 'Anchura de encía queratinizada'
  },
  furca: {
    type: FURCA_SCHEMA.type,
    properties: FURCA_SCHEMA.properties,
    default: FURCA_SCHEMA.default,
    description: 'Gradientes de furca por diente'
  },
  pronostico: {
    type: 'string',
    enum: FIELD_OPTIONS.pronostico.values,
    default: FIELD_OPTIONS.pronostico.default,
    description: 'Pronóstico del diente'
  },
  fechaUltimaModificacion: {
    type: 'string',
    format: 'date-time',
    default: () => new Date().toISOString(),
    description: 'Fecha de última modificación'
  }
};

CANONICAL_FACE_KEYS.forEach((faceKey) => {
  UNIFIED_TOOTH_SCHEMA[faceKey] = {
    type: 'object',
    properties: FACE_SCHEMA,
    default: () => createFaceDefault(),
    description: `Mediciones canónicas para la cara ${faceKey}`
  };
});

// ============================================================================
// ESQUEMA COMPLETO DE PERIODONTOGRAMA
// ============================================================================

/**
 * Esquema completo del periodontograma unificado
 */
export const UNIFIED_PERIODONTOGRAM_SCHEMA = {
  pacienteId: {
    type: 'string',
    required: true,
    description: 'ID del paciente'
  },
  
  teeth: {
    type: 'object',
    description: 'Datos de todos los dientes',
    patternProperties: {
      '^[0-9]+$': UNIFIED_TOOTH_SCHEMA
    },
    default: () => ({})
  },
  
  statistics: {
    type: 'object',
    properties: {
      totalTeeth: { type: 'number', default: 0 },
      presentTeeth: { type: 'number', default: 0 },
      absentTeeth: { type: 'number', default: 0 },
      implants: { type: 'number', default: 0 },
      averageProbingDepth: { type: 'number', default: 0 },
      bleedingPercentage: { type: 'number', default: 0 },
      plaquePercentage: { type: 'number', default: 0 }
    },
    description: 'Estadísticas calculadas del periodontograma',
    default: () => ({
      totalTeeth: 0,
      presentTeeth: 0,
      absentTeeth: 0,
      implants: 0,
      averageProbingDepth: 0,
      bleedingPercentage: 0,
      plaquePercentage: 0
    })
  },
  
  version: {
    type: 'string',
    description: 'Versión del periodontograma'
  },
  
  fechaCreacion: {
    type: 'string',
    format: 'date-time',
    description: 'Fecha de creación'
  },
  
  fechaModificacion: {
    type: 'string',
    format: 'date-time',
    description: 'Fecha de última modificación'
  }
};

// ============================================================================
// FUNCIONES DE VALIDACIÓN UNIFICADAS
// ============================================================================

const FACE_FIELD_ALIASES = {
  profundidadSondaje: ['profundidadSondaje', 'probingDepth'],
  margenGingival: ['margenGingival', 'gingivalMargin'],
  sangrado: ['sangrado', 'bleeding'],
  supuracion: ['supuracion', 'suppuration'],
  placa: ['placa', 'plaque']
};

const getFaceArrayValue = (faceData, key) => {
  const aliases = FACE_FIELD_ALIASES[key] || [key];
  for (const alias of aliases) {
    const value = faceData?.[alias];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return faceData?.[aliases[0]];
};

export const normalizeFaceData = (faceData) => {
  const fallback = resolveDefaultValue({ default: () => createFaceDefault() });
  if (!faceData || typeof faceData !== 'object') {
    return fallback;
  }

  const normalizeNumericArray = (inputArray, schemaKey) => {
    const schema = FACE_SCHEMA[schemaKey];
    const defaults = Array.isArray(fallback[schemaKey]) ? [...fallback[schemaKey]] : [0, 0, 0];
    const length = schema?.length ?? defaults.length ?? 3;
    const source = Array.isArray(inputArray) ? inputArray : [];

    const result = new Array(length);
    for (let index = 0; index < length; index += 1) {
      let candidate = source[index];

      if (candidate === '' || candidate === null || candidate === undefined) {
        result[index] = defaults[index] ?? defaults[0] ?? 0;
        continue;
      }

      let numericValue = Number(candidate);
      if (!Number.isFinite(numericValue)) {
        // Manejar cadenas no numéricas y booleanos explícitamente
        if (typeof candidate === 'string') {
          const trimmed = candidate.trim().toLowerCase();
          if (trimmed === 'true') {
            numericValue = 1;
          } else if (trimmed === 'false') {
            numericValue = 0;
          } else if (trimmed === 'on') {
            numericValue = 1;
          } else {
            numericValue = Number.parseFloat(candidate);
          }
        }
      }

      if (!Number.isFinite(numericValue)) {
        numericValue = defaults[index] ?? defaults[0] ?? 0;
      }

      if (typeof schema?.min === 'number' && numericValue < schema.min) {
        numericValue = schema.min;
      }
      if (typeof schema?.max === 'number' && numericValue > schema.max) {
        numericValue = schema.max;
      }

      result[index] = numericValue;
    }

    return result;
  };

  return {
    profundidadSondaje: normalizeNumericArray(getFaceArrayValue(faceData, 'profundidadSondaje'), 'profundidadSondaje'),
    margenGingival: normalizeNumericArray(getFaceArrayValue(faceData, 'margenGingival'), 'margenGingival'),
    sangrado: normalizeNumericArray(getFaceArrayValue(faceData, 'sangrado'), 'sangrado'),
    supuracion: normalizeNumericArray(getFaceArrayValue(faceData, 'supuracion'), 'supuracion'),
    placa: normalizeNumericArray(getFaceArrayValue(faceData, 'placa'), 'placa')
  };
};

const normalizeFurcaData = (furcaData) => {
  const fallback = resolveDefaultValue(FURCA_SCHEMA);
  if (!furcaData || typeof furcaData !== 'object') {
    return fallback;
  }

  const normalizeNumber = (value) => {
    const numericValue = Number.parseFloat(value);
    if (Number.isNaN(numericValue)) {
      return MEASUREMENT_LIMITS.furca.default;
    }
    return Math.min(Math.max(numericValue, MEASUREMENT_LIMITS.furca.min), MEASUREMENT_LIMITS.furca.max);
  };

  return {
    vestibular: normalizeNumber(furcaData.vestibular ?? furcaData.vest ?? furcaData.v),
    lingualPalatino: normalizeNumber(furcaData.lingualPalatino ?? furcaData.lingual ?? furcaData.palatino ?? furcaData.l),
    doble: {
      furca1: normalizeNumber(furcaData?.doble?.furca1 ?? furcaData?.doble?.furcaSuperior ?? furcaData?.doble?.furcaVestibular),
      furca2: normalizeNumber(furcaData?.doble?.furca2 ?? furcaData?.doble?.furcaInferior ?? furcaData?.doble?.furcaLingual)
    }
  };
};

export function validateValue(value, schema, fieldName = 'unknown') {
  try {
    if (value === undefined || value === null) {
      return resolveDefaultValue(schema);
    }

    switch (schema.type) {
      case 'boolean':
        return Boolean(value);

      case 'number': {
        const numericValue = Number.parseFloat(value);
        if (Number.isNaN(numericValue)) {
          return resolveDefaultValue(schema);
        }
        if (schema.min !== undefined && numericValue < schema.min) {
          return schema.min;
        }
        if (schema.max !== undefined && numericValue > schema.max) {
          return schema.max;
        }
        return numericValue;
      }

      case 'string': {
        const stringValue = String(value);
        if (schema.enum && !schema.enum.includes(stringValue)) {
          return resolveDefaultValue(schema) || schema.enum[0];
        }
        return stringValue;
      }

      case 'array': {
        if (!Array.isArray(value)) {
          return resolveDefaultValue(schema);
        }

        const { length, elementType } = schema;
        let result = [...value];
        if (length) {
          while (result.length < length) {
            const defaults = resolveDefaultValue(schema) || [];
            result.push(defaults[result.length] ?? (elementType === 'boolean' ? false : 0));
          }
          result = result.slice(0, length);
        }

        return result.map((item, index) => {
          if (elementType === 'boolean') {
            return Boolean(item);
          }
          if (elementType === 'number') {
            const numericItem = Number.parseFloat(item);
            if (Number.isNaN(numericItem)) {
              const defaults = resolveDefaultValue(schema) || [];
              return defaults[index] ?? 0;
            }
            if (schema.min !== undefined && numericItem < schema.min) {
              return schema.min;
            }
            if (schema.max !== undefined && numericItem > schema.max) {
              return schema.max;
            }
            return numericItem;
          }
          return item;
        });
      }

      case 'object': {
        if (typeof value !== 'object' || value === null) {
          return resolveDefaultValue(schema);
        }
        if (schema.properties) {
          const validatedObject = {};
          Object.entries(schema.properties).forEach(([propKey, propSchema]) => {
            validatedObject[propKey] = validateValue(value[propKey], propSchema, `${fieldName}.${propKey}`);
          });
          return validatedObject;
        }
        return value;
      }

      default:
        return value;
    }
  } catch (error) {
    console.error(`Error validando ${fieldName}:`, error);
    return resolveDefaultValue(schema);
  }
}

export function validateToothData(toothData, toothNumber = null) {
  if (!toothData || typeof toothData !== 'object') {
    return getDefaultToothData(toothNumber);
  }

  const rawToothNumber = toothData.numeroDiente ?? toothData.toothNumber ?? toothNumber;
  const parsedToothNumber = rawToothNumber !== undefined ? Number.parseInt(rawToothNumber, 10) : null;

  const validatedData = {};
  const numeroDiente = validateValue(parsedToothNumber, UNIFIED_TOOTH_SCHEMA.numeroDiente, 'numeroDiente');
  validatedData.numeroDiente = numeroDiente !== null ? numeroDiente : (parsedToothNumber || null);

  const inferredArcada = toothData.arcada || inferArcadaFromNumber(validatedData.numeroDiente);
  validatedData.arcada = validateValue(inferredArcada, UNIFIED_TOOTH_SCHEMA.arcada, 'arcada');

  validatedData.ausente = validateValue(toothData.ausente, UNIFIED_TOOTH_SCHEMA.ausente, 'ausente');
  validatedData.implante = validateValue(toothData.implante, UNIFIED_TOOTH_SCHEMA.implante, 'implante');
  validatedData.movilidad = validateValue(toothData.movilidad, UNIFIED_TOOTH_SCHEMA.movilidad, 'movilidad');
  validatedData.anchuraEncia = validateValue(toothData.anchuraEncia, UNIFIED_TOOTH_SCHEMA.anchuraEncia, 'anchuraEncia');
  validatedData.pronostico = validateValue(toothData.pronostico, UNIFIED_TOOTH_SCHEMA.pronostico, 'pronostico');

  const faceSourceMap = {
    vestibularSuperior: [toothData.vestibularSuperior, toothData.vestibularSuperficie, toothData.vestibular],
    palatinoSuperior: [toothData.palatinoSuperior, toothData.palatino, toothData.lingualPalatino, toothData.lingual],
    vestibularInferior: [toothData.vestibularInferior, toothData.vestibular],
    lingualInferior: [toothData.lingualInferior, toothData.lingual, toothData.palatino, toothData.lingualPalatino]
  };

  CANONICAL_FACE_KEYS.forEach((faceKey) => {
    const candidates = faceSourceMap[faceKey] || [];
    const faceData = candidates.find((candidate) => candidate && typeof candidate === 'object') || toothData[faceKey];
    validatedData[faceKey] = normalizeFaceData(faceData);
  });

  const furcaCandidates = toothData.furca || toothData.furcacion || toothData.furcation;
  validatedData.furca = validateValue(normalizeFurcaData(furcaCandidates), UNIFIED_TOOTH_SCHEMA.furca, 'furca');

  const fechaUltimaModificacion = toothData.fechaUltimaModificacion || toothData.lastUpdated || new Date().toISOString();
  validatedData.fechaUltimaModificacion = validateValue(
    fechaUltimaModificacion,
    UNIFIED_TOOTH_SCHEMA.fechaUltimaModificacion,
    'fechaUltimaModificacion'
  );

  return validatedData;
}

export function getDefaultToothData(toothNumber = null) {
  const parsedToothNumber = toothNumber !== null ? Number.parseInt(toothNumber, 10) : null;
  const base = {
    numeroDiente: Number.isNaN(parsedToothNumber) ? null : parsedToothNumber,
    arcada: inferArcadaFromNumber(parsedToothNumber),
    ausente: false,
    implante: false,
    movilidad: MEASUREMENT_LIMITS.movilidad.default,
    anchuraEncia: MEASUREMENT_LIMITS.anchuraEncia.default,
    furca: createFurcaDefault(),
    pronostico: FIELD_OPTIONS.pronostico.default,
    fechaUltimaModificacion: new Date().toISOString()
  };

  CANONICAL_FACE_KEYS.forEach((faceKey) => {
    base[faceKey] = createFaceDefault();
  });

  return base;
}

export function validatePeriodontogramData(periodontogramData) {
  if (!periodontogramData || typeof periodontogramData !== 'object') {
    throw new Error('Datos de periodontograma inválidos');
  }

  const validatedData = {
    pacienteId: periodontogramData.pacienteId,
    teeth: {},
    statistics: validateValue(
      periodontogramData.statistics,
      UNIFIED_PERIODONTOGRAM_SCHEMA.statistics,
      'statistics'
    ) || resolveDefaultValue(UNIFIED_PERIODONTOGRAM_SCHEMA.statistics),
    version: periodontogramData.version
      || periodontogramData.versionName
      || new Date().toISOString().replace(/[:.-]/g, ''),
    fechaCreacion: validateValue(
      periodontogramData.fechaCreacion || periodontogramData.createdAt,
      UNIFIED_PERIODONTOGRAM_SCHEMA.fechaCreacion,
      'fechaCreacion'
    ) || new Date().toISOString(),
    fechaModificacion: new Date().toISOString()
  };

  if (!periodontogramData.teeth || typeof periodontogramData.teeth !== 'object') {
    throw new Error('Datos de dientes faltantes o inválidos');
  }

  Object.entries(periodontogramData.teeth).forEach(([toothNumber, toothData]) => {
    validatedData.teeth[toothNumber] = validateToothData(toothData, toothNumber);
  });

  return validatedData;
}

export default {
  FACE_SCHEMA,
  FURCA_SCHEMA,
  UNIFIED_TOOTH_SCHEMA,
  UNIFIED_PERIODONTOGRAM_SCHEMA,
  validateValue,
  validateToothData,
  getDefaultToothData,
  validatePeriodontogramData
};