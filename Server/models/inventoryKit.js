const mongoose = require('mongoose');

/**
 * InventoryKit — plantilla de materiales por procedimiento.
 *
 * Cuando una cita tiene procedimientos (`appointment.items[].nombre`, que salen
 * de clinicSettings.serviceCatalog), el modal de consumo busca kits cuyo
 * `servicioNombre` coincida (case-insensitive) y PRELLENA los materiales.
 * Decisión del dueño (2026-07-16): el kit SUGIERE, nunca descuenta solo —
 * el usuario confirma/ajusta antes de guardar.
 */

const inventoryKitSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    // Nombre del servicio del catálogo al que sugiere asociarse (opcional:
    // un kit puede ser genérico y elegirse a mano). Se guarda el nombre, no
    // un ref, porque serviceCatalog es un array embebido en clinicSettings
    // sin _ids estables expuestos a la UI.
    servicioNombre: {
        type: String,
        trim: true,
        maxlength: 80,
        default: null
    },
    materiales: [{
        item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InventoryItem',
            required: true
        },
        cantidad: { type: Number, required: true, min: 1 }
    }],
    activo: { type: Boolean, default: true },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null }
}, {
    timestamps: true,
    collection: 'inventory_kits'
});

inventoryKitSchema.index({ servicioNombre: 1, deletedAt: 1 });

const InventoryKit = mongoose.model('InventoryKit', inventoryKitSchema);

module.exports = InventoryKit;
