const mongoose = require('mongoose');

/**
 * InventoryMovement — kardex append-only del inventario.
 *
 * Cada entrada/consumo/ajuste/merma/caducidad/reversa es un documento
 * INMUTABLE (mismo patrón de bloqueo que odontogramaHistory.js). El stock
 * "vivo" está en InventoryItem.lotes; este modelo es la bitácora que permite
 * reconstruir y auditar cualquier saldo.
 *
 * `lotesAfectados` guarda exactamente de qué lotes salió/entró cada unidad —
 * eso hace posible la reversa exacta (devolver al mismo lote) y la
 * trazabilidad clínica por lote/caducidad.
 */

const TIPOS_MOVIMIENTO = ['entrada', 'consumo', 'ajuste', 'merma', 'caducidad', 'reversa'];

const inventoryMovementSchema = new mongoose.Schema({
    item_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InventoryItem',
        required: true,
        index: true
    },
    // Snapshot del nombre al momento del movimiento (el catálogo puede renombrarse).
    itemNombre: { type: String, required: true, trim: true, maxlength: 120 },
    tipo: {
        type: String,
        enum: TIPOS_MOVIMIENTO,
        required: true,
        index: true
    },
    // Siempre positiva; el signo lo determina `tipo`
    // (entrada/reversa suman; consumo/ajuste-negativo/merma/caducidad restan —
    //  para `ajuste` el signo va en `direccion`).
    cantidad: { type: Number, required: true, min: 0 },
    // Solo relevante para tipo 'ajuste': 1 = suma, -1 = resta.
    direccion: { type: Number, enum: [1, -1], default: -1 },
    lotesAfectados: [{
        loteId: { type: mongoose.Schema.Types.ObjectId, default: null },
        codigoLote: { type: String, default: null },
        caducidad: { type: Date, default: null },
        cantidad: { type: Number, required: true, min: 0 }
    }],
    // Saldo del ítem DESPUÉS de aplicar este movimiento (facilita leer el kardex).
    stockResultante: { type: Number, required: true, min: 0 },
    // Contexto clínico — solo consumo/reversa.
    cita_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        default: null,
        index: true
    },
    paciente_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        default: null,
        index: true
    },
    // Reversa: referencia al movimiento de consumo que anula.
    movimientoRevertido: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InventoryMovement',
        default: null
    },
    usuario_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    motivo: { type: String, trim: true, maxlength: 500, default: null }
}, {
    timestamps: true,
    collection: 'inventory_movements'
});

inventoryMovementSchema.index({ item_id: 1, createdAt: -1 });

// ── Inmutabilidad a nivel app (mismo patrón que odontogramaHistory.js) ──
const blockMutation = function (next) {
    return next(new Error('InventoryMovement es inmutable — el kardex no se modifica ni se borra; usa un movimiento de reversa/ajuste.'));
};
inventoryMovementSchema.pre('updateOne', blockMutation);
inventoryMovementSchema.pre('updateMany', blockMutation);
inventoryMovementSchema.pre('findOneAndUpdate', blockMutation);
inventoryMovementSchema.pre('replaceOne', blockMutation);
inventoryMovementSchema.pre('deleteOne', blockMutation);
inventoryMovementSchema.pre('deleteMany', blockMutation);
inventoryMovementSchema.pre('findOneAndDelete', blockMutation);
inventoryMovementSchema.pre('findOneAndRemove', blockMutation);
inventoryMovementSchema.pre('save', function (next) {
    if (this.isNew) return next();
    return next(new Error('InventoryMovement es inmutable — no se puede re-guardar un movimiento existente.'));
});

const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);

module.exports = InventoryMovement;
module.exports.TIPOS_MOVIMIENTO = TIPOS_MOVIMIENTO;
