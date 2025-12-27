/**
 * Modelo para [ENTIDAD]
 * Sigue las convenciones de nomenclatura del proyecto
 * 
 * Convenciones:
 * - Propiedades: snake_case (español)
 * - Props técnicas: camelCase (inglés)
 * - Referencias: snake_case + "_id"
 * - Enumeraciones: strings en español
 * - Métodos: camelCase (español)
 */

const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const { Schema } = mongoose;

// Función para generar ID único de 4 dígitos
function generate4Digits() {
    const n = Math.floor(Math.random() * 10000);
    return n.toString().padStart(4, '0');
}

// Subesquema para [sub_entidad] (si aplica)
const [SubEntidad]Schema = new Schema({
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '', trim: true },
    activo: { type: Boolean, default: true },
    fecha_creacion: { type: Date, default: Date.now }
}, { _id: false });

// Esquema principal de [Entidad]
const [Entidad]Schema = new Schema({
    // ID único personalizado
    [entidad]_id: {
        type: String,
        unique: true,
        index: true
    },

    // Información básica
    nombre: { 
        type: String, 
        required: [true, 'El nombre es obligatorio'], 
        trim: true,
        maxlength: [100, 'El nombre no puede exceder 100 caracteres']
    },
    
    descripcion: { 
        type: String, 
        default: '', 
        trim: true,
        maxlength: [500, 'La descripción no puede exceder 500 caracteres']
    },

    // Estado y configuración
    estado: {
        type: String,
        enum: {
            values: ['Activo', 'Inactivo', 'Pendiente', 'Completado'],
            message: 'Estado debe ser: Activo, Inactivo, Pendiente o Completado'
        },
        default: 'Activo'
    },

    // Propiedades específicas de la entidad
    propiedades_especificas: {
        campo_texto: { type: String, default: '', trim: true },
        campo_numero: { 
            type: Number, 
            min: [0, 'El valor debe ser positivo'],
            max: [1000, 'El valor no puede exceder 1000']
        },
        campo_booleano: { type: Boolean, default: false },
        campo_fecha: { type: Date },
        campo_enum: {
            type: String,
            enum: {
                values: ['Opcion1', 'Opcion2', 'Opcion3'],
                message: 'Valor inválido para campo_enum'
            },
            default: 'Opcion1'
        }
    },

    // Configuración compleja
    configuracion: {
        parametro_1: { type: String, default: '' },
        parametro_2: { type: Number, default: 0 },
        opciones_avanzadas: {
            opcion_a: { type: Boolean, default: false },
            opcion_b: { type: Boolean, default: false },
            valor_personalizado: { type: String, default: '' }
        }
    },

    // Array de subesquemas
    elementos_relacionados: {
        type: [SubEntidadSchema],
        default: []
    },

    // Referencias a otros modelos
    usuario_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Usuario',
        required: [true, 'El usuario es obligatorio']
    },
    
    entidades_relacionadas: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: '[EntidadRelacionada]' 
    }],

    // Metadatos del sistema
    metadata: {
        version: { type: String, default: '1.0.0' },
        tags: [{ type: String, trim: true }],
        notas_internas: { type: String, default: '', trim: true }
    },

    // Campos de auditoría
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, {
    timestamps: true, // Actualiza automáticamente createdAt y updatedAt
    versionKey: false // Elimina el campo __v
});

// Middleware pre-save para generar ID único
[Entidad]Schema.pre('save', function(next) {
    if (!this.[entidad]_id) {
        this.[entidad]_id = `[ENT]-${generate4Digits()}`;
    }
    next();
});

// Middleware pre-update para actualizar updatedAt
[Entidad]Schema.pre(['updateOne', 'findOneAndUpdate'], function() {
    this.set({ updatedAt: new Date() });
});

// Índices para optimizar consultas
[Entidad]Schema.index({ nombre: 1 });
[Entidad]Schema.index({ estado: 1 });
[Entidad]Schema.index({ createdAt: -1 });
[Entidad]Schema.index({ usuario_id: 1, estado: 1 });

// Métodos de instancia
[Entidad]Schema.methods.activar = function() {
    this.estado = 'Activo';
    this.updatedAt = new Date();
    return this.save();
};

[Entidad]Schema.methods.desactivar = function() {
    this.estado = 'Inactivo';
    this.updatedAt = new Date();
    return this.save();
};

[Entidad]Schema.methods.obtenerResumen = function() {
    return {
        id: this._id,
        [entidad]_id: this.[entidad]_id,
        nombre: this.nombre,
        estado: this.estado,
        fecha_creacion: this.createdAt
    };
};

// Métodos estáticos
[Entidad]Schema.statics.buscarPorEstado = function(estado) {
    return this.find({ estado }).sort({ createdAt: -1 });
};

[Entidad]Schema.statics.buscarActivos = function() {
    return this.find({ estado: 'Activo' }).sort({ nombre: 1 });
};

[Entidad]Schema.statics.contarPorEstado = function() {
    return this.aggregate([
        {
            $group: {
                _id: '$estado',
                total: { $sum: 1 }
            }
        },
        {
            $sort: { _id: 1 }
        }
    ]);
};

// Validaciones personalizadas
[Entidad]Schema.path('nombre').validate(function(value) {
    return value && value.length >= 2;
}, 'El nombre debe tener al menos 2 caracteres');

// Virtual para nombre completo (ejemplo)
[Entidad]Schema.virtual('nombre_completo').get(function() {
    return `${this.nombre} (${this.[entidad]_id})`;
});

// Configurar virtuals en JSON
[Entidad]Schema.set('toJSON', { virtuals: true });
[Entidad]Schema.set('toObject', { virtuals: true });

// Plugin para validación única
[Entidad]Schema.plugin(uniqueValidator, {
    message: 'El {PATH} ya existe en el sistema'
});

// Exportar el modelo
module.exports = mongoose.model('[Entidad]', [Entidad]Schema);

/**
 * INSTRUCCIONES DE USO:
 * 
 * 1. Reemplazar [ENTIDAD] con el nombre de la entidad en mayúsculas
 * 2. Reemplazar [Entidad] con el nombre de la entidad en PascalCase
 * 3. Reemplazar [entidad] con el nombre de la entidad en camelCase
 * 4. Reemplazar [SubEntidad] con el nombre del subesquema en PascalCase
 * 5. Reemplazar [sub_entidad] con el nombre del subesquema en snake_case
 * 6. Reemplazar [EntidadRelacionada] con el nombre de la entidad relacionada
 * 7. Reemplazar [ENT] con las iniciales de la entidad para el ID
 * 8. Adaptar los campos específicos según las necesidades
 * 9. Ajustar las validaciones según los requisitos
 * 10. Configurar los índices según los patrones de consulta
 * 
 * Ejemplo para "Tratamiento":
 * - [ENTIDAD] → TRATAMIENTO
 * - [Entidad] → Tratamiento
 * - [entidad] → tratamiento
 * - [SubEntidad] → ProcedimientoTratamiento
 * - [sub_entidad] → procedimiento_tratamiento
 * - [EntidadRelacionada] → Paciente
 * - [ENT] → TRT
 * 
 * NOTAS IMPORTANTES:
 * - Mantener propiedades en snake_case (español)
 * - Props técnicas en camelCase (inglés)
 * - Enumeraciones en strings descriptivos en español
 * - Métodos en camelCase con nombres descriptivos
 * - Validaciones claras y mensajes en español
 */