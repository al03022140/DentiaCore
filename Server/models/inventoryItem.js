const mongoose = require('mongoose');

/**
 * InventoryItem — catálogo de insumos + stock por lotes.
 *
 * Diseño (ver docs-locales/DISENO_MODULO_INVENTARIO_2026-07-16.md):
 * - El CATÁLOGO persiste aunque el stock llegue a 0: reponer un insumo ya
 *   conocido es agregar un lote, no recrear el ítem.
 * - El stock vive en `lotes[]` (cada lote con su propia caducidad → FEFO).
 *   `stockTotal` es un cache derivado, recalculado en pre('save') y en las
 *   escrituras atómicas del controller; sirve para listados/orden/alertas
 *   sin agregación.
 * - `costoUnitario` por lote queda preparado (decisión del dueño: sin UI en V1).
 * - Concurrencia: el consumo/ajuste usa optimistic concurrency sobre `__v`
 *   (findOneAndUpdate con {_id, __v} + retry) — no hay transacciones en
 *   mongod standalone.
 */

// Categorías sugeridas — el campo es String abierto para no forzar una
// migración de enum cada vez que la clínica necesite una categoría nueva.
const CATEGORIAS_SUGERIDAS = [
    'Anestesia',
    'Restauración',
    'Endodoncia',
    'Cirugía',
    'Prevención',
    'Ortodoncia',
    'Desechables',
    'Limpieza y desinfección',
    'Instrumental',
    'Otro'
];

const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, trim: true, maxlength: 60, default: null },
    // null = el insumo no caduca (p. ej. instrumental)
    caducidad: { type: Date, default: null },
    cantidadInicial: { type: Number, required: true, min: 0 },
    cantidadActual: { type: Number, required: true, min: 0 },
    // Preparado para valuación futura — sin UI en V1 (decisión del dueño)
    costoUnitario: { type: Number, min: 0, default: null },
    ingresadoEn: { type: Date, default: Date.now },
    ingresadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null }
}, { _id: true });

const inventoryItemSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    // Clave de unicidad case/whitespace-insensitive (evita "Anestesia"/"anestesia").
    // Se deriva SIEMPRE de `nombre` en pre('validate') — nunca confiar en el cliente.
    nombreNormalizado: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 120
    },
    categoria: {
        type: String,
        trim: true,
        maxlength: 60,
        default: 'Otro'
    },
    unidad: {
        type: String,
        trim: true,
        maxlength: 30,
        default: 'pieza'
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    stockMinimo: {
        type: Number,
        min: 0,
        default: 0
    },
    lotes: { type: [loteSchema], default: [] },
    // Cache derivado: Σ lotes.cantidadActual (recalculado en pre('save')).
    stockTotal: {
        type: Number,
        min: 0,
        default: 0,
        index: true
    },
    // Ocultar del buscador de consumo sin perder historial/kardex.
    activo: { type: Boolean, default: true },
    // ── Campos de auditoría (mismo perfil que appointment.js) ──
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    deleteReason: { type: String, default: null }
}, {
    timestamps: true
});

// Unicidad del nombre SOLO entre ítems vivos: un ítem soft-borrado no debe
// bloquear la re-creación del mismo insumo.
inventoryItemSchema.index(
    { nombreNormalizado: 1 },
    { unique: true, partialFilterExpression: { deletedAt: null }, name: 'item_nombre_unique_active' }
);
// Alertas de caducidad: barrido por fecha de lote.
inventoryItemSchema.index({ 'lotes.caducidad': 1 });
// Búsqueda por texto en el buscador del módulo.
inventoryItemSchema.index({ nombre: 'text', categoria: 'text' });

inventoryItemSchema.pre('validate', function (next) {
    if (this.nombre) {
        this.nombreNormalizado = this.nombre.trim().toLowerCase();
    }
    next();
});

inventoryItemSchema.pre('save', function (next) {
    // Mantener el cache consistente en TODA escritura vía save().
    // (Las escrituras vía findOneAndUpdate del controller recalculan y setean
    // stockTotal explícitamente en el mismo update.)
    if (Array.isArray(this.lotes)) {
        this.stockTotal = this.lotes.reduce((sum, l) => sum + (l.cantidadActual || 0), 0);
    }
    next();
});

/**
 * Helpers de dominio (objeto plano, no clase estática — lección del audit frontend).
 */
const InventoryStockHelpers = {
    /**
     * Ordena los lotes CON stock para descuento FEFO:
     * primero los que caducan antes; los que no caducan (null) al final.
     */
    lotesFEFO(lotes) {
        return (lotes || [])
            .filter(l => (l.cantidadActual || 0) > 0)
            .slice()
            .sort((a, b) => {
                if (!a.caducidad && !b.caducidad) return 0;
                if (!a.caducidad) return 1;
                if (!b.caducidad) return -1;
                return new Date(a.caducidad) - new Date(b.caducidad);
            });
    },

    /**
     * Calcula el plan de descuento FEFO para `cantidad` unidades.
     * @returns {{ plan: Array<{loteId, codigoLote, caducidad, cantidad}>, faltante: number }}
     */
    planConsumo(lotes, cantidad) {
        const plan = [];
        let restante = cantidad;
        for (const lote of InventoryStockHelpers.lotesFEFO(lotes)) {
            if (restante <= 0) break;
            const tomar = Math.min(lote.cantidadActual, restante);
            plan.push({
                loteId: lote._id,
                codigoLote: lote.codigoLote || null,
                caducidad: lote.caducidad || null,
                cantidad: tomar
            });
            restante -= tomar;
        }
        return { plan, faltante: Math.max(0, restante) };
    }
};

const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema, 'inventory_items');

module.exports = InventoryItem;
module.exports.CATEGORIAS_SUGERIDAS = CATEGORIAS_SUGERIDAS;
module.exports.InventoryStockHelpers = InventoryStockHelpers;
