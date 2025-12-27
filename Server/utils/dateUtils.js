/**
 * Utilidades para manejo de fechas en el servidor
 * Normaliza todas las fechas al formato día-mes-año separado por /
 */

/**
 * Formatea una fecha al formato estándar día/mes/año
 * @param {Date|string} date - Fecha a formatear (puede ser Date, ISO string, o fecha local)
 * @returns {string} Fecha en formato dd/mm/yyyy
 */
function formatDateToDDMMYYYY(date) {
    let dateObj;
    
    if (!date) {
        dateObj = new Date();
    } else if (date instanceof Date) {
        dateObj = date;
    } else if (typeof date === 'string') {
        // Si es una fecha ISO (contiene 'T' o 'Z')
        if (date.includes('T') || date.includes('Z')) {
            dateObj = new Date(date);
        } else {
            // Si ya está en formato local, intentar parsearlo
            // Primero verificar si ya está en formato DD/MM/YYYY
            const parts = date.split('/');
            if (parts.length === 3) {
                // Asumimos que ya está en formato DD/MM/YYYY
                return date; // Devolver la fecha tal cual
            } else {
                dateObj = new Date(date);
            }
        }
    } else {
        dateObj = new Date();
    }
    
    // Verificar que la fecha es válida
    if (isNaN(dateObj.getTime())) {
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
function getCurrentDateFormatted() {
    return formatDateToDDMMYYYY(new Date());
}

/**
 * Convierte una fecha en formato dd/mm/yyyy a ISO string
 * @param {string} ddmmyyyy - Fecha en formato dd/mm/yyyy
 * @returns {string} Fecha en formato ISO
 */
function convertDDMMYYYYToISO(ddmmyyyy) {
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
function convertISOToDDMMYYYY(isoDate) {
    return formatDateToDDMMYYYY(isoDate);
}

module.exports = {
    formatDateToDDMMYYYY,
    getCurrentDateFormatted,
    convertDDMMYYYYToISO,
    convertISOToDDMMYYYY
};