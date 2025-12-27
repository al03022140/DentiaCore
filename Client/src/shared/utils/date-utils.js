/**
 * Utilidades para manejo de fechas en React
 * Normaliza todas las fechas al formato día-mes-año separado por /
 */

/**
 * Formatea una fecha al formato estándar día/mes/año
 * @param {Date|string} date - Fecha a formatear (puede ser Date, ISO string, o fecha local)
 * @returns {string} Fecha en formato dd/mm/yyyy
 */
export function formatDateToDDMMYYYY(date) {
    let dateObj;
    
    if (!date) {
        dateObj = new Date();
    } else if (date instanceof Date) {
        dateObj = date;
    } else if (typeof date === 'string') {
        // Si es una fecha ISO (contiene 'T' o 'Z')
        if (date.includes('T') || date.includes('Z')) {
            dateObj = new Date(date);
        } else if (date.includes('/')) {
            // Si contiene '/', verificar si está en formato DD/MM/YYYY o MM/DD/YYYY
            const parts = date.split('/');
            if (parts.length === 3) {
                // Verificar si ya está en formato DD/MM/YYYY
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const year = parseInt(parts[2], 10);
                
                // Validar que sea una fecha válida en formato DD/MM/YYYY
                if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year > 1900) {
                    return date; // Devolver la fecha tal cual si es válida
                } else {
                    // Si no es válida, crear un objeto Date
                    dateObj = new Date(year, month - 1, day);
                }
            } else {
                // Si no tiene 3 partes, intentar parsear normalmente
                dateObj = new Date(date);
            }
        } else {
            // Cualquier otro formato de string
            dateObj = new Date(date);
        }
    } else {
        dateObj = new Date();
    }
    
    // Verificar que la fecha es válida
    if (isNaN(dateObj.getTime())) {
        console.warn("Fecha inválida detectada en formatDateToDDMMYYYY:", date);
        dateObj = new Date();
    }
    
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    
    return `${day}/${month}/${year}`;
}

/**
 * Obtiene la fecha actual en formato dd/mm/yyyy
 * @returns {string} Fecha actual en formato dd/mm/yyyy
 */
export function getCurrentDateFormatted() {
    return formatDateToDDMMYYYY(new Date());
}

/**
 * Convierte una fecha en formato dd/mm/yyyy a ISO string para el backend
 * @param {string} ddmmyyyy - Fecha en formato dd/mm/yyyy
 * @returns {string} Fecha en formato ISO
 */
export function convertDDMMYYYYToISO(ddmmyyyy) {
    if (!ddmmyyyy || typeof ddmmyyyy !== 'string') {
        return new Date().toISOString();
    }
    
    const parts = ddmmyyyy.split('/');
    if (parts.length !== 3) {
        return new Date().toISOString();
    }
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Los meses en JS son 0-indexados
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    return date.toISOString();
}

/**
 * Convierte una fecha ISO a formato dd/mm/yyyy
 * @param {string} isoDate - Fecha en formato ISO
 * @returns {string} Fecha en formato dd/mm/yyyy
 */
export function convertISOToDDMMYYYY(isoDate) {
    return formatDateToDDMMYYYY(isoDate);
}