/**
 * Configuración de validaciones para el modelo Patient
 * Centraliza todas las reglas de validación y configuraciones
 */

// Expresiones regulares para validaciones
const REGEX_PATTERNS = {
    // Teléfono mexicano (10 dígitos, puede empezar con +52)
    TELEFONO_MEXICANO: /^(\+52)?[1-9]\d{9}$/,
    
    // CURP mexicano
    CURP: /^[A-Z]{1}[AEIOU]{1}[A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|1[0-9]|2[0-9]|3[0-1])[HM]{1}(AS|BC|BS|CC|CS|CH|CL|CM|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]{1}$/,
    
    // RFC mexicano
    RFC: /^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$/,
    
    // Email
    EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    
    // Código postal mexicano
    CODIGO_POSTAL: /^[0-9]{5}$/,
    
    // Solo letras y espacios (para nombres)
    SOLO_LETRAS: /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/,
    
    // Números de diente válidos (1-32 para adultos, 51-85 para niños)
    NUMERO_DIENTE: /^(([1-9]|[12][0-9]|3[0-2])|([5-8][1-9]|[5-8][0-5]))$/
};

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

// Funciones de validación personalizadas
const VALIDATORS = {
    /**
     * Valida que la fecha no sea futura
     */
    notFutureDate: (date) => {
        if (!date) return true;
        return new Date(date) <= new Date();
    },
    
    /**
     * Valida edad calculada
     */
    validAge: (birthDate) => {
        if (!birthDate) return true;
        const age = Math.floor((new Date() - new Date(birthDate)) / (365.25 * 24 * 60 * 60 * 1000));
        return age >= LIMITS.MIN_AGE && age <= LIMITS.MAX_AGE;
    },
    
    /**
     * Valida teléfono mexicano
     */
    mexicanPhone: (phone) => {
        if (!phone) return true;
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
        return REGEX_PATTERNS.TELEFONO_MEXICANO.test(cleanPhone);
    },
    
    /**
     * Valida CURP mexicano
     */
    validCURP: (curp) => {
        if (!curp) return true;
        return REGEX_PATTERNS.CURP.test(curp.toUpperCase());
    },
    
    /**
     * Valida RFC mexicano
     */
    validRFC: (rfc) => {
        if (!rfc) return true;
        return REGEX_PATTERNS.RFC.test(rfc.toUpperCase());
    },
    
    /**
     * Valida número de diente
     */
    validToothNumber: (toothNumber) => {
        if (!toothNumber) return true;
        return REGEX_PATTERNS.NUMERO_DIENTE.test(toothNumber.toString());
    },
    
    /**
     * Valida URL de imagen
     */
    validImageUrl: (url) => {
        if (!url) return true;
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    }
};

// Funciones de sanitización
const SANITIZERS = {
    /**
     * Sanitiza texto para prevenir XSS
     */
    sanitizeText: (text) => {
        if (!text || typeof text !== 'string') return text;
        return text
            .replace(/[<>"'&]/g, (match) => {
                const entities = {
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#x27;',
                    '&': '&amp;'
                };
                return entities[match];
            })
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
const INDEXES = {
    // Índices simples
    SIMPLE: [
        { field: 'paciente_id', options: { unique: true } },
        { field: 'informacion_personal.documento.numero', options: { sparse: true } },
        { field: 'informacion_personal.email', options: { sparse: true } },
        { field: 'informacion_personal.telefono', options: { sparse: true } },
        { field: 'createdAt', options: {} },
        { field: 'updatedAt', options: {} }
    ],
    
    // Índices compuestos
    COMPOUND: [
        {
            fields: {
                'informacion_personal.primer_nombre': 1,
                'informacion_personal.apellido_paterno': 1
            },
            options: { name: 'nombre_completo_idx' }
        },
        {
            fields: {
                'informacion_personal.fecha_nacimiento': 1,
                'informacion_personal.genero': 1
            },
            options: { name: 'demografia_idx' }
        }
    ],
    
    // Índices de texto
    TEXT: [
        {
            fields: {
                'informacion_personal.primer_nombre': 'text',
                'informacion_personal.apellido_paterno': 'text',
                'informacion_personal.apellido_materno': 'text'
            },
            options: { name: 'busqueda_nombres_idx' }
        }
    ]
};

module.exports = {
    REGEX_PATTERNS,
    VALID_VALUES,
    ERROR_MESSAGES,
    LIMITS,
    VALIDATORS,
    SANITIZERS,
    INDEXES
};