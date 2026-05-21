/**
 * Utilidades para el manejo de datos del odontograma
 */
import { formatDateToDDMMYYYY } from '../../../shared/utils/date-utils';

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
  4: 'Ausente',
  5: 'Fractura',
  6: 'Implante',
  8: 'Diastema',
  9: 'Extrusión',
  11: 'Empaste',
  12: 'Prótesis Rem.',
  13: 'Migración',
  14: 'Rotación',
  15: 'Fusión',
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
    // Para entradas de espacios inter-dentales el identificador viene en
    // `space:`; si no, usamos `tooth/diente`. `formatToothNumber` se
    // encarga de transformar "1817" → "18-17" en ambos casos.
    const rawDiente  = item.space ?? item.diente ?? item.tooth ?? 'N/A';
    const diente     = formatToothNumber(rawDiente);
    const rawTipo    = item.tipo   ?? item.damage ?? '';
    const rawNote    = item.note   ?? item.nota   ?? '';
    // Entrada sólo-nota (sin daño): mostramos la nota como tipo en lugar
    // de "No especificado" para que el clínico vea qué hay en esa pieza.
    const tipo       = rawTipo
                        ? getDamageNameByCode(rawTipo)
                        : (rawNote ? `Nota: ${rawNote}` : 'No especificado');
    const rawSurface = item.superficie ?? item.surface ?? 'O';
    const superficie = getSurfaceNameByCode(rawSurface);
    // La fecha la provee el servidor por entrada (savedAt del momento del guardado).
    // No usamos "hoy" como fallback: mostrar "—" deja claro que el dato falta en BD
    // en vez de inducir al usuario a creer que la entrada se guardó hoy.
    const fechaRaw   = item.fecha;
    const fecha      = fechaRaw ? formatDateToDDMMYYYY(fechaRaw) : '—';
    // Key estable: incluye fecha en vez de idx para no remontar filas en
    // AntD al reordenar la tabla (perdía estado de selección/scroll). El
    // idx queda como fallback únicamente cuando no hay fecha registrada
    // (no debería pasar tras el server pero defendemos por las dudas).
    const fechaKey = fechaRaw ? (fechaRaw instanceof Date ? fechaRaw.toISOString() : String(fechaRaw)) : `idx${idx}`;
    return {
      diente,
      tipo,
      superficie,
      fecha,
      key: `${prefix}-${diente}-${tipo}-${superficie}-${fechaKey}`
    };
  });
};

// Normaliza un texto para matching robusto: sin acentos, minúsculas, espacios colapsados.
const normalizeText = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Tabla maestra: cada código tiene TODAS sus variantes de nombre que el
// sistema haya podido escribir alguna vez. Se construye el mapa nombre→código
// pasando cada string por `normalizeText` (lowercase + sin acentos), para
// matchear contra lo que viene de BD sin importar capitalización ni tildes.
//
// Fuentes incluidas:
//  - Menú del engine (`createMenuButton` en public/js/engine.js).
//  - DAMAGE_NAMES local (nombres "cortos").
//  - getDamageNameByCode (nombres "largos" cuando Constants está disponible).
//  - commonDamageNames en odontogram-clinical-section.jsx.
//  - Auto-formato `key.replace(/_/g,' ').toLowerCase()...` que la sección
//    clínica aplica a constantes — esto genera nombres con los typos
//    preservados de las constantes originales (EDENTULOA_TOTAL → "Edentuloa
//    Total"; DIENTE_DISCR0MICO → "Diente Discr0Mico"; SEMI_IMPACTACI0N →
//    "Semi Impactaci0N").
//  - Variantes razonables con/sin tilde, con/sin punto, plural/singular.
const DAMAGE_ALIASES_BY_CODE = {
  1:  ['Caries'],
  2:  ['Corona', 'Corona Def.', 'Corona Def', 'Corona Definitiva'],
  3:  ['Corona Temp.', 'Corona Temp', 'Corona Temporal', 'Corona (Temp)'],
  4:  ['Ausente', 'Diente Ausente'],
  5:  ['Fractura'],
  6:  ['Implante'],
  8:  ['Diastema'],
  9:  ['Extrusión', 'Extrusion', 'Diente Extruido', 'Extruido'],
  11: ['Empaste', 'Curación', 'Curacion'],
  12: ['Prótesis Rem.', 'Prótesis Rem', 'Protesis Rem', 'Prótesis Removible', 'Protesis Removible'],
  13: ['Migración', 'Migracion'],
  14: ['Rotación', 'Rotacion', 'Giroversión', 'Giroversion'],
  15: ['Fusión', 'Fusion'],
  16: ['Remanente R.', 'Remanente R', 'Remanente Radicular'],
  17: ['Macrodoncia'],
  18: ['Microdoncia'],
  19: ['Impactado', 'Impactación', 'Impactacion'],
  20: ['Intrusión', 'Intrusion', 'Diente Intruido', 'Intruido'],
  21: ['Ectópico', 'Ectopico', 'Diente Ectópico', 'Diente Ectopico'],
  // DISCROMICO en la constante está escrita como DIENTE_DISCR0MICO (con cero),
  // así que el formateo automático produce "Diente Discr0Mico".
  22: ['Discrómico', 'Discromico', 'Diente Discrómico', 'Diente Discromico',
       'Diente Discr0mico', 'Discr0mico'],
  23: ['Endodoncia'],
  24: ['No Erupcionado', 'Diente en Erupción', 'Diente en Erupcion', 'Diente En Erupcion'],
  25: ['Transposición', 'Transposicion', 'Transposición Izquierda',
       'Transposicion Izquierda', 'Transposicion Left'],
  26: ['Transposición Derecha', 'Transposicion Derecha', 'Transposicion Right'],
  27: ['Supernumerario', 'Super Numerario'],
  28: ['Daño Pulpar', 'Dano Pulpar', 'Pulpar'],
  29: ['Carilla'],
  30: ['Poste', 'Perno Muñón', 'Perno Munon'],
  // EDENTULOA_TOTAL (con typo en la constante) → "Edentuloa Total"
  31: ['Edéntulo', 'Edentulo', 'Edéntulismo', 'Edentulismo',
       'Edéntulo Total', 'Edentulo Total', 'Edentuloa Total'],
  32: ['Orto. Fijo', 'Orto Fijo', 'Ortodóntico Fijo', 'Ortodontico Fijo',
       'Ortodóntico Fijo (Extremo)', 'Ortodontico Fijo (Extremo)',
       'Ortodontico Fijo End'],
  33: ['Ortodóntico Fijo (Centro)', 'Ortodontico Fijo (Centro)',
       'Ortodontico Fijo Center'],
  34: ['Prótesis Fija', 'Protesis Fija',
       'Prótesis Fija (Izquierda)', 'Protesis Fija (Izquierda)',
       'Protesis Fija Left'],
  35: ['Prótesis Fija (Centro)', 'Protesis Fija (Centro)', 'Protesis Fija Center'],
  36: ['Prótesis Fija (Derecha)', 'Protesis Fija (Derecha)', 'Protesis Fija Right'],
  37: ['Desgastado', 'Superficie Desgastada'],
  // SEMI_IMPACTACI0N (con cero) → "Semi Impactaci0N"
  38: ['Semi-Impactado', 'Semi Impactado',
       'Semi-Impactación', 'Semi-Impactacion',
       'Semi Impactaci0n', 'Semi-Impactaci0n'],
};

const DAMAGE_NAME_TO_CODE = (() => {
  const map = {};
  Object.entries(DAMAGE_ALIASES_BY_CODE).forEach(([code, names]) => {
    names.forEach(name => {
      const key = normalizeText(name);
      if (key) map[key] = Number(code);
    });
  });
  return map;
})();

/**
 * Convierte un valor de daño (código numérico o nombre localizado) al código numérico
 * que entiende el engine. Devuelve null si no se puede mapear.
 * @param {string|number} rawDamage
 * @returns {number|null}
 */
export const damageToCode = (rawDamage) => {
  if (rawDamage == null || rawDamage === '') return null;
  const asString = String(rawDamage).trim();
  if (!asString) return null;
  // Ya es código numérico (o string que es número puro)
  if (/^-?\d+$/.test(asString)) {
    const n = parseInt(asString, 10);
    return Number.isNaN(n) ? null : n;
  }
  // Buscar por nombre normalizado
  const fromName = DAMAGE_NAME_TO_CODE[normalizeText(asString)];
  return typeof fromName === 'number' ? fromName : null;
};

/**
 * Normaliza un conjunto de entradas para alimentar `engine.loadOdontogramaData`:
 *  - Acepta diente/tooth y daño/damage en código o nombre localizado.
 *  - Soporta también el campo `space:` para daños inter-dentales (IDs de
 *    4 dígitos como "1817" que el engine resuelve por `getSpaceById`).
 *  - Conserva entradas sólo-nota (con `note` no vacío aunque `damage` sea
 *    vacío o irreconocible): el engine las usa para repoblar el textBox
 *    del diente.
 *  - Filtra entradas que no tengan ni diente/espacio ni nada que aplicar
 *    (sin daño, sin superficie y sin nota).
 *  - Deduplica por (diente|espacio, código de daño, superficie, nota).
 *  - La fecha es opcional: si no viene, se omite y el engine usará la fecha actual.
 *
 * @param {Array} entries - Datos crudos (e.g. response del servidor, tabla UI, import).
 * @returns {Array<{tooth?:string, space?:string, damage:string, surface:string, note:string, fecha?:string}>}
 */
export const normalizeEntriesForEngine = (entries) => {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const out = [];
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const rawSpace = String(item.space ?? '').trim();
    const rawTooth = String(item.tooth ?? item.diente ?? '').trim();
    // Una entrada debe identificar un objetivo: diente o espacio.
    if (!rawSpace && !rawTooth) continue;
    const damageCode = damageToCode(item.damage ?? item.tipo);
    const note = String(item.note ?? item.nota ?? '');
    const surface = String(item.surface ?? item.superficie ?? '0').trim() || '0';
    // Si no hay daño identificable y tampoco nota, no hay nada que aplicar.
    if (damageCode == null && !note) continue;
    const damageStr = damageCode == null ? '' : String(damageCode);
    const targetKey = rawSpace ? `s:${rawSpace}` : `t:${rawTooth}`;
    const dedupKey = `${targetKey}|${damageStr}|${surface}|${note}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const normalized = {
      damage: damageStr,
      surface,
      note,
    };
    if (rawSpace) {
      normalized.space = rawSpace;
    } else {
      normalized.tooth = rawTooth;
    }
    const fecha = item.fecha ?? item.date;
    if (fecha) normalized.fecha = fecha;
    out.push(normalized);
  }
  return out;
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
  damageToCode,
  normalizeEntriesForEngine,
  disableInitialCheckPolling,
  patchEnginePrototype
};

export default utils;