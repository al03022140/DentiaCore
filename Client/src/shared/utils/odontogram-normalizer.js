/**
 * NORMALIZADOR UNIFICADO DE DATOS DEL ODONTOGRAMA
 * 
 * Este archivo contiene todas las funciones necesarias para normalizar
 * y validar datos del odontograma en toda la aplicación.
 * 
 * ESTRUCTURA NORMALIZADA:
 * {
 *   tooth: String,    // ID del diente (ej: "11", "21")
 *   damage: String,   // Tipo de daño/condición
 *   surface: String,  // Superficie afectada ("0" = general)
 *   note: String,     // Notas adicionales
 *   fecha: String     // Formato dd/mm/yyyy
 * }
 */

import { formatDateToDDMMYYYY, getCurrentDateFormatted } from './date-utils';

// CONSTANTES
export const ODONTOGRAM_TYPES = {
    INICIAL: 'inicial',
    CLINICO: 'clinico'
};

export const DEFAULT_SURFACE = '0';
export const SURFACE_NAMES = {
    '0': 'General',
    'O': 'Oclusal',
    'M': 'Mesial',
    'D': 'Distal',
    'V': 'Vestibular',
    'L': 'Lingual',
    'P': 'Palatino'
};

/**
 * Normaliza una entrada de odontograma a la estructura estándar
 * @param {Object} entry - Entrada a normalizar
 * @returns {Object} Entrada normalizada
 */
export function normalizeOdontogramEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        throw new Error('Entry debe ser un objeto válido');
    }

    return {
        tooth: String(entry.tooth || entry.diente || '').trim(),
        damage: String(entry.damage || entry.tipo || entry.condition || '').trim(),
        surface: String(entry.surface || entry.superficie || DEFAULT_SURFACE).trim(),
        note: String(entry.note || entry.nota || entry.notes || '').trim(),
        fecha: formatDateToDDMMYYYY(entry.fecha || entry.date || new Date())
    };
}

/**
 * Valida una entrada normalizada de odontograma
 * @param {Object} entry - Entrada a validar
 * @returns {Object} Entrada validada
 * @throws {Error} Si la entrada no es válida
 */
export function validateOdontogramEntry(entry) {
    const normalized = normalizeOdontogramEntry(entry);
    
    // Validar tooth (requerido)
    if (!normalized.tooth) {
        throw new Error('El campo tooth es requerido');
    }
    
    // Validar que el tooth sea numérico
    if (!/^\d+$/.test(normalized.tooth)) {
        throw new Error(`Tooth debe ser numérico: ${normalized.tooth}`);
    }
    
    // Validar que tenga al menos damage o note
    if (!normalized.damage && !normalized.note) {
        throw new Error('Se requiere al menos damage o note');
    }
    
    // Validar surface
    if (normalized.surface && !Object.keys(SURFACE_NAMES).includes(normalized.surface)) {
        console.warn(`Surface desconocida: ${normalized.surface}, usando default`);
        normalized.surface = DEFAULT_SURFACE;
    }
    
    return normalized;
}

/**
 * Normaliza un array de entradas de odontograma
 * @param {Array} entries - Array de entradas
 * @param {Object} options - Opciones de normalización
 * @returns {Array} Array de entradas normalizadas
 */
export function normalizeOdontogramEntries(entries, options = {}) {
    const {
        filterEmpty = true,
        removeDuplicates = true,
        validateEntries = true
    } = options;
    
    if (!Array.isArray(entries)) {
        console.warn('normalizeOdontogramEntries: entries no es un array');
        return [];
    }
    
    let normalized = [];
    
    for (let i = 0; i < entries.length; i++) {
        try {
            const entry = validateEntries 
                ? validateOdontogramEntry(entries[i])
                : normalizeOdontogramEntry(entries[i]);
            
            // Filtrar entradas vacías si está habilitado
            if (filterEmpty && !entry.tooth) {
                continue;
            }
            
            normalized.push(entry);
        } catch (error) {
            console.warn(`Error normalizando entrada ${i}:`, error.message, entries[i]);
            if (validateEntries) {
                throw new Error(`Entrada ${i}: ${error.message}`);
            }
        }
    }
    
    // Remover duplicados si está habilitado
    if (removeDuplicates) {
        normalized = removeDuplicateEntries(normalized);
    }
    
    return normalized;
}

/**
 * Remueve entradas duplicadas basándose en tooth, damage y surface
 * @param {Array} entries - Array de entradas
 * @returns {Array} Array sin duplicados
 */
export function removeDuplicateEntries(entries) {
    const unique = [];
    const seen = new Set();
    
    for (const entry of entries) {
        const key = `${entry.tooth}-${entry.damage}-${entry.surface}`;
        
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(entry);
        } else {
            console.warn('Entrada duplicada filtrada:', entry);
        }
    }
    
    return unique;
}

/**
 * Convierte entradas normalizadas al formato para la tabla de AntD
 * @param {Array} entries - Entradas normalizadas
 * @param {string} keyPrefix - Prefijo para las keys
 * @returns {Array} Datos formateados para tabla
 */
export function formatEntriesForTable(entries, keyPrefix = 'entry') {
    return entries.map((entry, index) => ({
        key: `${keyPrefix}-${entry.tooth}-${entry.damage}-${entry.surface}-${index}`,
        diente: entry.tooth,
        tipo: combineDamageWithSurface(entry.damage, entry.surface),
        superficie: getSurfaceName(entry.surface),
        nota: entry.note,
        fecha: entry.fecha
    }));
}

/**
 * Combina damage con surface para mostrar en tabla
 * @param {string} damage - Tipo de daño
 * @param {string} surface - Superficie
 * @returns {string} Texto combinado
 */
export function combineDamageWithSurface(damage, surface) {
    if (!damage) return 'Sin especificar';
    
    if (!surface || surface === DEFAULT_SURFACE) {
        return damage;
    }
    
    const surfaceName = getSurfaceName(surface);
    if (surfaceName && surfaceName !== 'Desconocida') {
        return `${damage} (${surfaceName})`;
    }
    
    return damage;
}

/**
 * Obtiene el nombre de una superficie
 * @param {string} surface - Código de superficie
 * @returns {string} Nombre de la superficie
 */
export function getSurfaceName(surface) {
    return SURFACE_NAMES[surface] || 'Desconocida';
}

/**
 * Convierte datos del engine a formato normalizado
 * @param {Array} engineData - Datos del engine
 * @returns {Array} Entradas normalizadas
 */
export function convertEngineDataToNormalized(engineData) {
    if (!Array.isArray(engineData)) {
        return [];
    }
    
    return engineData.map(item => {
        // Detectar si es formato del engine o del servidor
        const isEngineFormat = item.tooth && !item.engineTeeth;
        
        if (isEngineFormat) {
            // Formato directo del engine
            return normalizeOdontogramEntry(item);
        } else {
            // Formato del servidor con engineTeeth
            const teeth = item.engineTeeth || [item.tooth];
            
            return teeth.map(toothNum => normalizeOdontogramEntry({
                tooth: toothNum,
                damage: item.damage || item.tipo,
                surface: item.surface || item.superficie || DEFAULT_SURFACE,
                note: item.note || item.nota || '',
                fecha: item.fecha || getCurrentDateFormatted()
            }));
        }
    }).flat();
}

/**
 * Prepara datos para enviar al servidor
 * @param {Array} entries - Entradas normalizadas
 * @param {string} type - Tipo de odontograma
 * @param {string} patientId - ID del paciente
 * @returns {Object} Datos preparados para el servidor
 */
export function prepareDataForServer(entries, type, patientId) {
    const normalizedEntries = normalizeOdontogramEntries(entries, {
        filterEmpty: true,
        removeDuplicates: true,
        validateEntries: true
    });
    
    return {
        entries: normalizedEntries,
        type: type,
        patientId: patientId,
        timestamp: new Date().toISOString()
    };
}

/**
 * Valida datos antes de enviar al servidor
 * @param {Object} data - Datos a validar
 * @throws {Error} Si los datos no son válidos
 */
export function validateServerData(data) {
    if (!data.patientId) {
        throw new Error('patientId es requerido');
    }
    
    if (!data.type || !Object.values(ODONTOGRAM_TYPES).includes(data.type)) {
        throw new Error('type debe ser "inicial" o "clinico"');
    }
    
    if (!Array.isArray(data.entries) || data.entries.length === 0) {
        throw new Error('entries debe ser un array no vacío');
    }
    
    // Validar cada entrada
    data.entries.forEach((entry, index) => {
        try {
            validateOdontogramEntry(entry);
        } catch (error) {
            throw new Error(`Entrada ${index}: ${error.message}`);
        }
    });
}

/**
 * Crea una entrada por defecto "Sano" si no hay entradas
 * @param {Array} entries - Entradas existentes
 * @returns {Array} Entradas con al menos una entrada "Sano"
 */
export function ensureMinimumEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [{
            tooth: '0',
            damage: 'Sano',
            surface: DEFAULT_SURFACE,
            note: 'Estado inicial sin patologías detectadas',
            fecha: getCurrentDateFormatted()
        }];
    }
    
    return entries;
}

/**
 * Formatea el número de diente para mostrar múltiples dientes
 * @param {string|number} toothNumber - Número del diente
 * @returns {string} Número formateado
 */
export function formatToothNumber(toothNumber) {
    const toothStr = String(toothNumber);
    
    // Si el número tiene 4 dígitos y parece ser dos dientes concatenados
    if (toothStr.length === 4 && /^\d{4}$/.test(toothStr)) {
        const firstTooth = toothStr.substring(0, 2);
        const secondTooth = toothStr.substring(2, 4);
        return `${firstTooth}-${secondTooth}`;
    }
    
    return toothStr;
}

/**
 * Agrupa entradas por diente
 * @param {Array} entries - Entradas a agrupar
 * @returns {Object} Entradas agrupadas por diente
 */
export function groupEntriesByTooth(entries) {
    const grouped = {};
    
    entries.forEach(entry => {
        const tooth = entry.tooth;
        if (!grouped[tooth]) {
            grouped[tooth] = [];
        }
        grouped[tooth].push(entry);
    });
    
    return grouped;
}

/**
 * Obtiene estadísticas de las entradas
 * @param {Array} entries - Entradas a analizar
 * @returns {Object} Estadísticas
 */
export function getEntriesStatistics(entries) {
    const stats = {
        total: entries.length,
        withDamage: 0,
        withNotes: 0,
        bySurface: {},
        byTooth: {}
    };
    
    entries.forEach(entry => {
        if (entry.damage) stats.withDamage++;
        if (entry.note) stats.withNotes++;
        
        // Por superficie
        const surface = entry.surface || DEFAULT_SURFACE;
        stats.bySurface[surface] = (stats.bySurface[surface] || 0) + 1;
        
        // Por diente
        stats.byTooth[entry.tooth] = (stats.byTooth[entry.tooth] || 0) + 1;
    });
    
    return stats;
}

/**
 * Normaliza el odontograma (DEPRECATED)
 * 
 * Esta función está obsoleta y no debe usarse. Si necesita normalización,
 * utilice los utilitarios específicos de la función en features/odontogram/utils.
 * 
 * @deprecated
 */
export function normalizeOdontogram() {
  throw new Error("shared/utils/odontogram-normalizer.js is deprecated. Use feature-scoped utils instead.");
}

export default null;