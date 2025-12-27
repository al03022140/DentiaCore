/**
 * Utilidades para el manejo de datos del odontograma
 */
import { formatDateToDDMMYYYY, getCurrentDateFormatted } from '../../../shared/utils/date-utils';

// Mapeo entre código numérico y letra
const NUMERIC_TO_LETTER = {
  '0': 'O', // Oclusal
  '1': 'V', // Vestibular
  '2': 'M', // Mesial
  '3': 'D', // Distal
  '4': 'L'  // Lingual
};

// Las cinco superficies clásicas, usando ya la letra como code
export const SURFACES = [
  { code: 'O', label: 'Oclusal' },
  { code: 'V', label: 'Vestibular' },
  { code: 'M', label: 'Mesial' },
  { code: 'D', label: 'Distal' },
  { code: 'L', label: 'Lingual' }
];

/**
 * Obtiene el nombre de una superficie por su código numérico o letra.
 * @param {string|number} surfaceCode - '0'|'1'|'2'|'3'|'4' ó 'O'|'V'|'M'|'D'|'L'
 * @returns {string}
 */
export const getSurfaceNameByCode = (surfaceCode) => {
  const codeStr = String(surfaceCode).toUpperCase();
  const letter  = NUMERIC_TO_LETTER[codeStr] || codeStr;
  const surface = SURFACES.find(s => s.code === letter);
  return surface ? surface.label : 'No especificada';
};

// Diccionario de nombres de daño para pruebas y uso aislado
export const DAMAGE_NAMES = {
  1: 'Caries',
  2: 'Corona Def.',
  3: 'Corona Temp.',
  4: 'Endodoncia',
  5: 'Fractura',
  6: 'Implante',
  8: 'Diastema',
  9: 'Extrusión',
  11: 'Empaste',
  12: 'Prótesis Rem.',
  13: 'Migración',
  14: 'Rotación',
  15: 'Ausente/Extracción',
  16: 'Remanente R.',
  17: 'Macrodoncia',
  18: 'Microdoncia',
  19: 'Impactado',
  20: 'Intrusión',
  21: 'Ectópico',
  22: 'Discrómico',
  23: 'Endodoncia',
  24: 'No Erupcionado',
  25: 'Transposición',
  27: 'Supernumerario',
  28: 'Daño Pulpar',
  29: 'Carilla',
  30: 'Poste',
  31: 'Edéntulo',
  32: 'Orto. Fijo',
  34: 'Prótesis Fija',
  37: 'Desgastado',
  38: 'Semi-Impactado'
};

/**
 * Convierte un código numérico de daño a su nombre descriptivo
 * @param {number|string} damageCode - Código numérico del daño
 * @returns {string} - Nombre descriptivo del daño
 */
export const getDamageNameByCode = (damageCode) => {
  if (!damageCode || damageCode === "" || damageCode === "0") {
    return "No especificado";
  }
  const code = parseInt(damageCode, 10);
  if (isNaN(code)) {
    return damageCode;
  }
  const constants = window.Constants ? new window.Constants() : null;
  if (!constants) {
    return DAMAGE_NAMES[code] || damageCode;
  }
  // Asegúrate de que los nombres de las constantes coincidan con el motor
  const damageNames = {
    [constants.CARIES]:                 "Caries",
    [constants.CORONA_DEFINITIVA]:      "Corona Definitiva",
    [constants.CORONA_TEMPORAL]:        "Corona Temporal",
    [constants.DIENTE_AUSENTE]:         "Diente Ausente",
    [constants.FRACTURA]:               "Fractura",
    [constants.IMPLANTE]:               "Implante",
    [constants.DIASTEMA]:               "Diastema",
    [constants.DIENTE_EXTRUIDO]:        "Diente Extruido",
    [constants.POSTE]:                  "Poste",
    [constants.CURACION]:               "Curación",
    [constants.PROTESIS_REMOVIBLE]:     "Prótesis Removible",
    [constants.MIGRACION]:              "Migración",
    [constants.GIROVERSION]:            "Giroversión",
    [constants.FUSION]:                 "Fusión",
    [constants.REMANENTE_RADICULAR]:    "Remanente Radicular",
    [constants.MACRODONCIA]:            "Macrodoncia",
    [constants.MICRODONCIA]:            "Microdoncia",
    [constants.IMPACTACION]:            "Impactación",
    [constants.DIENTE_INTRUIDO]:        "Diente Intruido",
    [constants.DIENTE_ECTOPICO]:        "Diente Ectópico",
    [constants.DIENTE_DISCR0MICO]:      "Diente Discrómico",
    [constants.ENDODONCIA]:             "Endodoncia",
    [constants.DIENTE_EN_ERUPCION]:     "Diente en Erupción",
    [constants.TRANSPOSICION_LEFT]:     "Transposición Izquierda",
    [constants.TRANSPOSICION_RIGHT]:    "Transposición Derecha",
    [constants.SUPER_NUMERARIO]:        "Supernumerario",
    [constants.PULPAR]:                 "Pulpar",
    [constants.CARILLA]:                "Carilla",
    [constants.PERNO_MUNON]:            "Perno Muñón",
    [constants.EDENTULOA_TOTAL]:        "Edéntulo Total",
    [constants.ORTODONTICO_FIJO_END]:   "Ortodóntico Fijo (Extremo)",
    [constants.ORTODONTICO_FIJO_CENTER]:"Ortodóntico Fijo (Centro)",
    [constants.PROTESIS_FIJA_LEFT]:     "Prótesis Fija (Izquierda)",
    [constants.PROTESIS_FIJA_CENTER]:   "Prótesis Fija (Centro)",
    [constants.PROTESIS_FIJA_RIGHT]:    "Prótesis Fija (Derecha)",
    [constants.SUPERFICIE_DESGASTADA]:  "Superficie Desgastada",
    [constants.SEMI_IMPACTACI0N]:       "Semi-Impactación"
  };
  return damageNames[code] || DAMAGE_NAMES[code] || `Código ${damageCode}`;
};

/**
 * Normaliza y prepara el dataSource para la tabla AntD
 * @param {Array} data - Array de objetos (pueden venir de engine o de tu API)
 * @param {string} prefix - Prefijo para la key (p. ej. 'inicial' o 'clinico')
 * @returns {Array} Array con { diente, tipo, superficie, fecha, key }
 */
/**
 * Formatea el número de diente para mostrar múltiples dientes con guión
 * @param {string|number} toothNumber - Número del diente
 * @returns {string} - Número formateado (ej: '1121' -> '11-21')
 */
const formatToothNumber = (toothNumber) => {
  const toothStr = String(toothNumber);
  
  // Si el número tiene 4 dígitos y parece ser dos dientes concatenados
  if (toothStr.length === 4 && /^\d{4}$/.test(toothStr)) {
    const firstTooth = toothStr.substring(0, 2);
    const secondTooth = toothStr.substring(2, 4);
    
    // Verificar que ambos números sean válidos (entre 11-18, 21-28, 31-38, 41-48, 51-55, 61-65, 71-75, 81-85)
    const isValidTooth = (tooth) => {
      const num = parseInt(tooth);
      return (
        (num >= 11 && num <= 18) || // Cuadrante superior derecho permanente
        (num >= 21 && num <= 28) || // Cuadrante superior izquierdo permanente
        (num >= 31 && num <= 38) || // Cuadrante inferior izquierdo permanente
        (num >= 41 && num <= 48) || // Cuadrante inferior derecho permanente
        (num >= 51 && num <= 55) || // Cuadrante superior derecho temporal
        (num >= 61 && num <= 65) || // Cuadrante superior izquierdo temporal
        (num >= 71 && num <= 75) || // Cuadrante inferior izquierdo temporal
        (num >= 81 && num <= 85)    // Cuadrante inferior derecho temporal
      );
    };
    
    if (isValidTooth(firstTooth) && isValidTooth(secondTooth)) {
      return `${firstTooth}-${secondTooth}`;
    }
  }
  
  return toothStr;
};

export const prepareDataSource = (data, prefix = 'ds') => {
  if (!Array.isArray(data)) {
    console.warn('prepareDataSource recibió datos no válidos:', data);
    return [];
  }
  return data.map((item, idx) => {
    const rawDiente  = item.diente ?? item.tooth ?? 'N/A';
    const diente     = formatToothNumber(rawDiente);
    const rawTipo    = item.tipo   ?? item.damage ?? '';
    const tipo       = rawTipo
                        ? getDamageNameByCode(rawTipo)
                        : 'No especificado';
    const rawSurface = item.superficie ?? item.surface ?? 'O';
    const superficie = getSurfaceNameByCode(rawSurface);
    const fechaRaw   = item.fecha ?? getCurrentDateFormatted();
    const fecha      = formatDateToDDMMYYYY(fechaRaw);
    return {
      diente,
      tipo,
      superficie,
      fecha,
      key: `${prefix}-${diente}-${tipo}-${superficie}-${idx}`
    };
  });
};

/**
 * Verifica si un array contiene un elemento (por diente, tipo y superficie)
 * @param {Array} array - Array a verificar
 * @param {Object} element - Elemento a buscar
 * @param {Array} props - Propiedades a comparar
 * @returns {boolean} - true si el elemento existe, false en caso contrario
 */
export const includesEntry = (array, element, props = ['diente','tipo','superficie']) => {
  if (!Array.isArray(array) || typeof element !== 'object' || element == null) {
    return false;
  }
  return array.some(item =>
    props.every(prop => item?.[prop] === element?.[prop])
  );
};

// Alias para compatibilidad con tu componente
export const arrayContainsElement = includesEntry;

/**
 * Combina dos arrays sin duplicados, comparando ciertas props
 * @param {Array} a1 - Primer array
 * @param {Array} a2 - Segundo array
 * @param {Array} props - Propiedades a comparar
 * @returns {Array} - Array combinado sin duplicados
 */
export const mergeEntries = (a1, a2, props = ['diente','tipo','superficie']) => {
  const arr1 = Array.isArray(a1) ? a1 : [];
  const arr2 = Array.isArray(a2) ? a2 : [];
  return [
    ...arr1,
    ...arr2.filter(el => !includesEntry(arr1, el, props))
  ];
};

/**
 * Parchea el Engine para evitar polling infinito de checkInitialOdontogramStatus
 * Útil para tests o desarrollo local.
 */
export function disableInitialCheckPolling() {
  if (window.Engine && !window.Engine.prototype._patchedCheck) {
    window.Engine.prototype._patchedCheck = true;
    window.Engine.prototype._originalCheckInitialOdontogramStatus = window.Engine.prototype.checkInitialOdontogramStatus;
    window.Engine.prototype.checkInitialOdontogramStatus = () => Promise.resolve({ hasSaved: false });
  }
}

export function patchEnginePrototype() {
  if (window.Engine) {
    if (!window.Engine.prototype._originalCheckInitialOdontogramStatus) {
      window.Engine.prototype._originalCheckInitialOdontogramStatus = window.Engine.prototype.checkInitialOdontogramStatus;
      window.Engine.prototype.checkInitialOdontogramStatus = function() {
        this.hasSavedInitialOdontogram = false;
        return Promise.resolve({ hasSaved: false });
      };
    }
    // Aquí puedes añadir otros parches si los necesitas
    return true;
  } else {
    console.warn('Engine no disponible para aplicar parche.');
    return false;
  }
}

// Export por defecto para compatibilidad legacy
const utils = {
  SURFACES,
  getSurfaceNameByCode,
  getDamageNameByCode,
  DAMAGE_NAMES,
  prepareDataSource,
  includesEntry,
  mergeEntries,
  disableInitialCheckPolling,
  patchEnginePrototype
};

export default utils;