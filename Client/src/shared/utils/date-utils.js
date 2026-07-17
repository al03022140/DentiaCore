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
    
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateObj);
}

/**
 * Obtiene la fecha actual en formato dd/mm/yyyy
 * @returns {string} Fecha actual en formato dd/mm/yyyy
 */
export function getCurrentDateFormatted() {
    return formatDateToDDMMYYYY(new Date());
}