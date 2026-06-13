/**
 * Configuración de validaciones para el modelo Patient
 * Centraliza todas las reglas de validación y configuraciones
 */

// NOTA: REGEX_PATTERNS y VALIDATORS se eliminaron (código muerto). Eran
// validadores de PII (TELEFONO_MEXICANO de 10 dígitos exactos, CURP, RFC) que
// NO se importaban en ninguna ruta y validaban campos inexistentes (el modelo
// Patient no tiene CURP ni RFC). La validación REAL de email/teléfono vive
// ahora a nivel de schema en models/patient.js, con las reglas del front.

// Listas de valores válidos
const VALID_VALUES = {
    GENEROS: ['masculino', 'femenino', 'otro', 'prefiero_no_decir'],
    
    TIPOS_DOCUMENTO: ['ine', 'pasaporte', 'curp', 'cedula_profesional', 'otro'],
    
    ESTADOS_MEXICO: [
        'aguascalientes', 'baja_california', 'baja_california_sur', 'campeche',
        'chiapas', 'chihuahua', 'coahuila', 'colima', 'ciudad_de_mexico',
        'durango', 'guanajuato', 'guerrero', 'hidalgo', 'jalisco', 'mexico',
        'michoacan', 'morelos', 'nayarit', 'nuevo_leon', 'oaxaca', 'puebla',
        'queretaro', 'quintana_roo', 'san_luis_potosi', 'sinaloa', 'sonora',
        'tabasco', 'tamaulipas', 'tlaxcala', 'veracruz', 'yucatan', 'zacatecas'
    ],
    
    NIVELES_ANSIEDAD: ['ninguna', 'leve', 'moderada', 'severa'],
    
    CONSUMO_ALCOHOL: ['nunca', 'ocasional', 'moderado', 'frecuente'],
    
    FRECUENCIA_CEPILLADO: ['nunca', '1_vez_dia', '2_veces_dia', '3_o_mas_veces_dia'],
    
    CONSUMO_AZUCAR: ['bajo', 'moderado', 'alto'],
    
    CONDICIONES_DIENTE: [
        'sano', 'caries', 'obturado', 'corona', 'endodoncia', 'extraccion_indicada',
        'ausente', 'implante', 'protesis', 'fracturado'
    ],
    
    SUPERFICIES_DIENTE: [
        'oclusal', 'mesial', 'distal', 'vestibular', 'lingual', 'palatino',
        'cervical', 'incisal', 'completa'
    ],
    
    TIPOS_DANO: [
        'caries', 'fractura', 'desgaste', 'mancha', 'calculo', 'gingivitis',
        'periodontitis', 'movilidad', 'sensibilidad', 'otro'
    ]
};

// Mensajes de error personalizados
const ERROR_MESSAGES = {
    REQUIRED: 'Este campo es obligatorio',
    INVALID_EMAIL: 'Formato de email inválido',
    INVALID_PHONE: 'Formato de teléfono mexicano inválido (10 dígitos)',
    INVALID_CURP: 'Formato de CURP inválido',
    INVALID_RFC: 'Formato de RFC inválido',
    INVALID_POSTAL_CODE: 'Código postal debe tener 5 dígitos',
    INVALID_NAME: 'Solo se permiten letras y espacios',
    INVALID_DATE: 'Fecha inválida',
    FUTURE_DATE: 'La fecha no puede ser futura',
    INVALID_AGE: 'Edad debe estar entre 0 y 120 años',
    INVALID_TOOTH_NUMBER: 'Número de diente inválido',
    INVALID_ENUM: (field, values) => `${field} debe ser uno de: ${values.join(', ')}`,
    MIN_LENGTH: (field, min) => `${field} debe tener al menos ${min} caracteres`,
    MAX_LENGTH: (field, max) => `${field} no puede exceder ${max} caracteres`,
    DUPLICATE_TOOTH: 'Ya existe un registro para este diente',
    MAX_SNAPSHOTS: 'Máximo 10 instantáneas permitidas',
    INVALID_URL: 'URL de imagen inválida'
};

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
    
    /**
     * Limpia y formatea teléfono
     */
    cleanPhone: (phone) => {
        if (!phone) return phone;
        return phone.replace(/[^\d+]/g, '');
    },
    
    /**
     * Normaliza nombre (primera letra mayúscula)
     */
    normalizeName: (name) => {
        if (!name) return name;
        return name
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .trim();
    },
    
    /**
     * Normaliza email a minúsculas
     */
    normalizeEmail: (email) => {
        if (!email) return email;
        return email.toLowerCase().trim();
    }
};

// Configuración de índices para optimización
// NOTA: Estos índices deben coincidir con los paths reales del schema Patient
const INDEXES = {
    // Índices simples
    SIMPLE: [
        { field: 'paciente_id', options: { unique: true } },
        { field: 'documento.numero', options: { sparse: true } },
        { field: 'email', options: { sparse: true } },
        { field: 'contacto.telefono', options: { sparse: true } },
        { field: 'createdAt', options: {} },
        { field: 'updatedAt', options: {} }
    ],
    
    // Índices compuestos
    COMPOUND: [
        {
            fields: {
                'primer_nombre': 1,
                'apellido_paterno': 1
            },
            options: { name: 'nombre_completo_idx' }
        },
        {
            fields: {
                'fecha_nacimiento': 1,
                'sexo': 1
            },
            options: { name: 'demografia_idx' }
        }
    ],
    
    // Índices de texto
    TEXT: [
        {
            fields: {
                'primer_nombre': 'text',
                'apellido_paterno': 'text',
                'apellido_materno': 'text'
            },
            options: { name: 'busqueda_nombres_idx' }
        }
    ]
};

module.exports = {
    VALID_VALUES,
    ERROR_MESSAGES,
    LIMITS,
    SANITIZERS,
    INDEXES
};