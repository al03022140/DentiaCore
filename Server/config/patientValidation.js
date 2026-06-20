/**
 * Configuración de validaciones para el modelo Patient
 * Centraliza todas las reglas de validación y configuraciones
 */

// NOTA: REGEX_PATTERNS y VALIDATORS se eliminaron (código muerto). Eran
// validadores de PII (TELEFONO_MEXICANO de 10 dígitos exactos, CURP, RFC) que
// NO se importaban en ninguna ruta y validaban campos inexistentes (el modelo
// Patient no tiene CURP ni RFC). La validación REAL de email/teléfono vive
// ahora a nivel de schema en models/patient.js, con las reglas del front.

// Configuraciones de límites
const LIMITS = {
    MAX_SNAPSHOTS: 10,
    MAX_EMERGENCY_CONTACTS: 5,
    MIN_AGE: 0,
    MAX_AGE: 120,
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 50,
    MAX_TEXT_LENGTH: 500,
    MAX_LONG_TEXT_LENGTH: 2000,
    MIN_PHONE_LENGTH: 10,
    MAX_PHONE_LENGTH: 13
};

// Funciones de sanitización
const SANITIZERS = {
    /**
     * Sanitiza texto para prevenir XSS de forma idempotente.
     *
     * El sanitizador anterior re-escapaba las entidades en cada edición:
     * "&amp;" se volvía "&amp;amp;" tras un GET→re-save. Aquí primero
     * decodificamos las entidades reconocidas y luego volvemos a escapar
     * una sola vez, de modo que aplicar la función dos veces produce el
     * mismo resultado que aplicarla una sola vez.
     */
    sanitizeText: (text) => {
        if (!text || typeof text !== 'string') return text;
        const decoded = text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&#39;/g, "'");
        return decoded
            .replace(/&(?!amp;|lt;|gt;|quot;|#x27;|#39;)/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .trim();
    },
};

module.exports = {
    LIMITS,
    SANITIZERS
};