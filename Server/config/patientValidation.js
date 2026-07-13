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
     * Normaliza texto de entrada: sólo trim.
     *
     * Ya NO se escapan ' " & < > a entidades HTML. Ese escape-en-entrada
     * corrompía los datos visibles (un paciente "O'Brien" se guardaba y se
     * mostraba como "O&#x27;Brien"): React escapa SIEMPRE en salida, no hay
     * dangerouslySetInnerHTML en el cliente ni render de HTML server-side, y
     * la CSP cubre el resto. El escape correcto vive en la capa de salida.
     * Los datos ya guardados con entidades los decodifica la migración
     * 0005-decodificar-entidades-html-pacientes.
     */
    sanitizeText: (text) => {
        if (!text || typeof text !== 'string') return text;
        return text.trim();
    },
};

module.exports = {
    LIMITS,
    SANITIZERS
};