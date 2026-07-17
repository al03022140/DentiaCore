const mongoose = require('mongoose');
const InventoryItem = require('../models/inventoryItem');
const { InventoryStockHelpers } = require('../models/inventoryItem');
const InventoryMovement = require('../models/inventoryMovement');
const InventoryKit = require('../models/inventoryKit');
const Appointment = require('../models/appointment');
const logger = require('../utils/logger');
const { isAdminRole, isClinicalRole } = require('../utils/permissions');

/**
 * inventoryController — módulo de Inventario.
 * Diseño: docs-locales/DISENO_MODULO_INVENTARIO_2026-07-16.md
 *
 * Reglas clave:
 * - Catálogo ≠ stock: el ítem persiste con stock 0 (reponer = agregar lote).
 * - FEFO: el consumo descuenta primero el lote que caduca antes.
 * - Kardex append-only (InventoryMovement) para TODA variación de stock.
 * - Concurrencia sin transacciones: optimistic concurrency sobre __v con
 *   reintentos (mongod standalone — no hay multi-document transactions).
 * - Stock insuficiente NO bloquea el consumo: se descuenta lo disponible y
 *   se reporta `faltante` (el material ya se usó en el procedimiento;
 *   bloquear produciría inventario ficticio).
 */

const MAX_RETRIES = 5;
const MAX_CANTIDAD = 1000000;

const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseCantidad = (value, { min = 0.001 } = {}) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > MAX_CANTIDAD) return null;
    // Redondear a 3 decimales — permite unidades fraccionarias (ml, g)
    // sin acumular ruido de flotantes.
    return Math.round(n * 1000) / 1000;
};

/**
 * `new Date("YYYY-MM-DD")` interpreta la fecha como medianoche UTC, no
 * medianoche LOCAL de la clínica (mismo bug ya corregido en statsController.js
 * vía REPORT_TZ) — un lote capturado como "caduca hoy" podía aparecer ya
 * caducado varias horas antes de la medianoche local real. Si el valor es
 * fecha-sin-hora (la forma que manda <input type="date">), se ancla a
 * medianoche LOCAL agregando un componente de hora sin sufijo de zona.
 */
const parseFechaLocal = (value) => {
    const raw = (value || '').toString().trim();
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    return new Date(soloFecha ? `${raw}T00:00:00` : raw);
};

/** Flags de alerta derivados de un ítem (mismo criterio que getAlerts). */
const buildItemView = (item, warnDate, now = new Date()) => {
    const lotesVivos = (item.lotes || []).filter(l => (l.cantidadActual || 0) > 0);
    const caducidades = lotesVivos.filter(l => l.caducidad).map(l => new Date(l.caducidad));
    const proximaCaducidad = caducidades.length
        ? new Date(Math.min(...caducidades.map(d => d.getTime())))
        : null;
    const tieneCaducados = caducidades.some(d => d < now);
    const tienePorCaducar = caducidades.some(d => d >= now && d <= warnDate);
    return {
        _id: item._id,
        nombre: item.nombre,
        categoria: item.categoria,
        unidad: item.unidad,
        descripcion: item.descripcion,
        stockMinimo: item.stockMinimo,
        stockTotal: item.stockTotal,
        activo: item.activo,
        lotes: lotesVivos,
        proximaCaducidad,
        alertas: {
            caducado: tieneCaducados,
            porCaducar: tienePorCaducar,
            sinStock: (item.stockTotal || 0) === 0,
            stockBajo: (item.stockMinimo || 0) > 0 && item.stockTotal > 0 && item.stockTotal <= item.stockMinimo
        },
        updatedAt: item.updatedAt,
        createdAt: item.createdAt
    };
};

/**
 * Aplica una mutación de lotes con optimistic concurrency (__v) y reintentos.
 * `mutate(item)` recibe el doc fresco y devuelve el array de lotes nuevo
 * (o null para abortar). Devuelve { item, lotes } tras aplicar, o lanza.
 */
async function applyLotesUpdate(itemId, mutate) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const item = await InventoryItem.findOne({ _id: itemId, deletedAt: null });
        if (!item) {
            const err = new Error('Ítem de inventario no encontrado');
            err.statusCode = 404;
            throw err;
        }
        const result = mutate(item);
        if (!result) return { item, aborted: true };
        const { lotes, extra = {} } = result;
        const stockTotal = lotes.reduce((sum, l) => sum + (l.cantidadActual || 0), 0);
        const updated = await InventoryItem.findOneAndUpdate(
            { _id: itemId, __v: item.__v },
            { $set: { lotes, stockTotal, ...extra }, $inc: { __v: 1 } },
            { new: true }
        );
        if (updated) return { item: updated, planContext: result.planContext };
        // Conflicto de concurrencia: otro proceso tocó el ítem — reintentar.
    }
    const err = new Error('Conflicto de concurrencia al actualizar el stock. Intente de nuevo.');
    err.statusCode = 409;
    throw err;
}

/**
 * Revierte (compensa) un cambio de lotes ya aplicado cuando un paso
 * posterior (crear el InventoryMovement, o el $push/$pull en Appointment)
 * falla — evita que el stock quede desincronizado del kardex/la cita.
 * `direccion` es el signo que se aplicó al stock (1 = sumó, -1 = restó);
 * se revierte con el signo contrario. Nunca lanza: si la compensación
 * misma falla, se registra y el llamador sigue propagando el error original.
 */
async function compensateLotes(itemId, lotesAfectados, direccion) {
    const sign = direccion === 1 ? -1 : 1;
    try {
        await applyLotesUpdate(itemId, (doc) => {
            const lotes = doc.lotes.map(l => l.toObject());
            for (const p of lotesAfectados) {
                const target = lotes.find(l => l._id.toString() === (p.loteId || '').toString());
                if (target) target.cantidadActual = Math.max(0, Math.round((target.cantidadActual + sign * p.cantidad) * 1000) / 1000);
            }
            return { lotes };
        });
    } catch (compErr) {
        logger.error('Compensación de stock falló (item %s): %s', itemId, compErr.message);
    }
}

// ─────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────

exports.getItems = async (req, res) => {
    try {
        const { q, categoria, estado, includeInactive } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const warnDays = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

        const filter = { deletedAt: null };
        if (includeInactive !== 'true') filter.activo = true;
        if (q && typeof q === 'string' && q.trim()) {
            filter.nombre = { $regex: escapeRegex(q.trim()), $options: 'i' };
        }
        if (categoria && typeof categoria === 'string' && categoria.trim()) {
            filter.categoria = categoria.trim();
        }

        const [items, total] = await Promise.all([
            InventoryItem.find(filter).sort({ nombre: 1 }).skip(offset).limit(limit).lean(),
            InventoryItem.countDocuments(filter)
        ]);

        const now = new Date();
        const warnDate = new Date(now.getTime() + warnDays * 24 * 60 * 60 * 1000);
        let views = items.map(i => buildItemView(i, warnDate, now));

        if (estado && typeof estado === 'string') {
            const key = estado.trim();
            const byEstado = {
                caducado: v => v.alertas.caducado,
                porCaducar: v => v.alertas.porCaducar,
                stockBajo: v => v.alertas.stockBajo,
                sinStock: v => v.alertas.sinStock,
                ok: v => !v.alertas.caducado && !v.alertas.porCaducar && !v.alertas.stockBajo && !v.alertas.sinStock
            };
            if (byEstado[key]) views = views.filter(byEstado[key]);
        }

        return res.json({ items: views, total, limit, offset });
    } catch (error) {
        logger.error('Error al listar inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al obtener el inventario' });
    }
};

exports.getCategories = async (req, res) => {
    try {
        const { CATEGORIAS_SUGERIDAS } = require('../models/inventoryItem');
        const usadas = await InventoryItem.distinct('categoria', { deletedAt: null });
        const categorias = [...new Set([...CATEGORIAS_SUGERIDAS, ...usadas.filter(Boolean)])];
        return res.json({ categorias });
    } catch (error) {
        logger.error('Error al listar categorías de inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al obtener categorías' });
    }
};

exports.createItem = async (req, res) => {
    try {
        const { nombre, categoria, unidad, descripcion, stockMinimo, loteInicial } = req.body;

        if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
            return res.status(400).json({ message: 'El nombre del ítem es obligatorio' });
        }

        const nombreNormalizado = nombre.trim().toLowerCase();
        // Guard app-level (el índice unique parcial puede no existir en prod
        // con autoIndex off — misma lección que documento.numero en pacientes).
        const dup = await InventoryItem.findOne({ nombreNormalizado, deletedAt: null });
        if (dup) {
            return res.status(409).json({
                message: `Ya existe un ítem llamado "${dup.nombre}" en el catálogo`,
                code: 'DUPLICATE_ITEM',
                existingItemId: dup._id
            });
        }

        // Igual que updateItem: si se manda stockMinimo pero no es válido, se
        // rechaza (antes se sustituía por 0 en silencio solo en el alta).
        let stockMinimoFinal = 0;
        if (stockMinimo !== undefined) {
            const sm = parseCantidad(stockMinimo, { min: 0 });
            if (sm === null) return res.status(400).json({ message: 'Stock mínimo inválido' });
            stockMinimoFinal = sm;
        }

        const item = new InventoryItem({
            nombre: nombre.trim(),
            categoria: (categoria || 'Otro').toString().trim() || 'Otro',
            unidad: (unidad || 'pieza').toString().trim() || 'pieza',
            descripcion: (descripcion || '').toString().trim(),
            stockMinimo: stockMinimoFinal,
            creadoPor: req.user?.id || null
        });

        // Lote inicial opcional (alta con stock en un solo paso). Si se manda
        // loteInicial pero la cantidad no es válida, se rechaza (400) en vez
        // de crear el ítem SIN el stock que el usuario pidió, en silencio.
        let movimiento = null;
        if (loteInicial) {
            const cantidad = parseCantidad(loteInicial.cantidad);
            if (cantidad === null) {
                return res.status(400).json({ message: 'Cantidad de stock inicial inválida (debe ser mayor a 0 y hasta 1,000,000)' });
            }
            let caducidad = null;
            if (loteInicial.caducidad) {
                caducidad = parseFechaLocal(loteInicial.caducidad);
                if (Number.isNaN(caducidad.getTime())) {
                    return res.status(400).json({ message: 'Fecha de caducidad inválida' });
                }
            }
            item.lotes.push({
                codigoLote: (loteInicial.codigoLote || '').toString().trim() || null,
                caducidad,
                cantidadInicial: cantidad,
                cantidadActual: cantidad,
                costoUnitario: parseCantidad(loteInicial.costoUnitario, { min: 0 }),
                ingresadoPor: req.user?.id || null
            });
        }

        await item.save();

        if (item.lotes.length) {
            const lote = item.lotes[0];
            const lotesAfectados = [{
                loteId: lote._id,
                codigoLote: lote.codigoLote,
                caducidad: lote.caducidad,
                cantidad: lote.cantidadActual
            }];
            try {
                movimiento = await InventoryMovement.create({
                    item_id: item._id,
                    itemNombre: item.nombre,
                    tipo: 'entrada',
                    cantidad: lote.cantidadActual,
                    direccion: 1,
                    lotesAfectados,
                    stockResultante: item.stockTotal,
                    usuario_id: req.user?.id || null,
                    motivo: 'Alta de ítem con stock inicial'
                });
            } catch (movErr) {
                // El ítem+lote ya se guardó pero el kardex no — compensar
                // dejando el lote en 0 para no divergir del kardex (que no
                // tendrá registro de esta entrada).
                await compensateLotes(item._id, lotesAfectados, 1);
                throw movErr;
            }
        }

        return res.status(201).json({ item, movimiento });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: 'Ya existe un ítem con ese nombre', code: 'DUPLICATE_ITEM' });
        }
        logger.error('Error al crear ítem de inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al crear el ítem' });
    }
};

exports.updateItem = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const item = await InventoryItem.findOne({ _id: req.params.id, deletedAt: null });
        if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });

        const { nombre, categoria, unidad, descripcion, stockMinimo, activo } = req.body;

        if (nombre !== undefined) {
            if (typeof nombre !== 'string' || !nombre.trim()) {
                return res.status(400).json({ message: 'Nombre inválido' });
            }
            const nombreNormalizado = nombre.trim().toLowerCase();
            if (nombreNormalizado !== item.nombreNormalizado) {
                const dup = await InventoryItem.findOne({ nombreNormalizado, deletedAt: null, _id: { $ne: item._id } });
                if (dup) {
                    return res.status(409).json({ message: `Ya existe un ítem llamado "${dup.nombre}"`, code: 'DUPLICATE_ITEM' });
                }
            }
            item.nombre = nombre.trim();
        }
        if (categoria !== undefined) item.categoria = categoria.toString().trim() || 'Otro';
        if (unidad !== undefined) item.unidad = unidad.toString().trim() || 'pieza';
        if (descripcion !== undefined) item.descripcion = descripcion.toString().trim();
        if (stockMinimo !== undefined) {
            const sm = parseCantidad(stockMinimo, { min: 0 });
            if (sm === null) return res.status(400).json({ message: 'Stock mínimo inválido' });
            item.stockMinimo = sm;
        }
        if (activo !== undefined) item.activo = !!activo;
        item.modificadoPor = req.user?.id || null;

        await item.save();
        return res.json({ item });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: 'Ya existe un ítem con ese nombre', code: 'DUPLICATE_ITEM' });
        }
        logger.error('Error al actualizar ítem de inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al actualizar el ítem' });
    }
};

exports.deleteItem = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const item = await InventoryItem.findOne({ _id: req.params.id, deletedAt: null });
        if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });

        item.deletedAt = new Date();
        item.deletedBy = req.user?.id || null;
        item.deleteReason = (req.body?.motivo || '').toString().trim() || null;
        await item.save();
        return res.json({ message: 'Ítem eliminado del catálogo', itemId: item._id });
    } catch (error) {
        logger.error('Error al eliminar ítem de inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al eliminar el ítem' });
    }
};

// ─────────────────────────────────────────────────────────────
// Stock: entradas y ajustes
// ─────────────────────────────────────────────────────────────

exports.addLot = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });

        const cantidad = parseCantidad(req.body?.cantidad);
        if (cantidad === null) return res.status(400).json({ message: 'Cantidad inválida (debe ser mayor a 0)' });

        let caducidad = null;
        if (req.body?.caducidad) {
            caducidad = parseFechaLocal(req.body.caducidad);
            if (Number.isNaN(caducidad.getTime())) {
                return res.status(400).json({ message: 'Fecha de caducidad inválida' });
            }
        }

        const loteId = new mongoose.Types.ObjectId();
        const nuevoLote = {
            _id: loteId,
            codigoLote: (req.body?.codigoLote || '').toString().trim() || null,
            caducidad,
            cantidadInicial: cantidad,
            cantidadActual: cantidad,
            costoUnitario: parseCantidad(req.body?.costoUnitario, { min: 0 }),
            ingresadoEn: new Date(),
            ingresadoPor: req.user?.id || null
        };

        const { item } = await applyLotesUpdate(req.params.id, (doc) => ({
            lotes: [...doc.lotes.map(l => l.toObject()), nuevoLote],
            extra: { modificadoPor: req.user?.id || null }
        }));

        const lotesAfectados = [{
            loteId,
            codigoLote: nuevoLote.codigoLote,
            caducidad: nuevoLote.caducidad,
            cantidad
        }];
        let movimiento;
        try {
            movimiento = await InventoryMovement.create({
                item_id: item._id,
                itemNombre: item.nombre,
                tipo: 'entrada',
                cantidad,
                direccion: 1,
                lotesAfectados,
                stockResultante: item.stockTotal,
                usuario_id: req.user?.id || null,
                motivo: (req.body?.motivo || '').toString().trim() || 'Entrada de stock'
            });
        } catch (movErr) {
            await compensateLotes(item._id, lotesAfectados, 1);
            throw movErr;
        }

        return res.status(201).json({ item, movimiento });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status === 500) logger.error('Error en entrada de inventario: %s', error.message);
        return res.status(status).json({ message: status === 500 ? 'Error al registrar la entrada' : error.message });
    }
};

exports.adjustStock = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });

        const cantidad = parseCantidad(req.body?.cantidad);
        if (cantidad === null) return res.status(400).json({ message: 'Cantidad inválida (debe ser mayor a 0)' });

        const tipoRaw = req.body?.tipo;
        if (tipoRaw !== undefined && !['ajuste', 'merma', 'caducidad'].includes(tipoRaw)) {
            return res.status(400).json({ message: 'Tipo de ajuste inválido (ajuste, merma o caducidad)' });
        }
        const tipo = tipoRaw || 'ajuste';
        // merma/caducidad SIEMPRE restan; ajuste puede sumar o restar.
        const direccion = tipo === 'ajuste' ? (Number(req.body?.direccion) === 1 ? 1 : -1) : -1;

        const motivo = (req.body?.motivo || '').toString().trim();
        if (motivo.length < 3) {
            return res.status(400).json({ message: 'El motivo es obligatorio para ajustes de inventario (≥3 caracteres)' });
        }

        const loteIdParam = req.body?.loteId && isValidId(req.body.loteId) ? req.body.loteId.toString() : null;

        let lotesAfectados = [];
        let faltante = 0;
        const { item } = await applyLotesUpdate(req.params.id, (doc) => {
            const lotes = doc.lotes.map(l => l.toObject());
            lotesAfectados = [];
            faltante = 0;

            if (direccion === 1) {
                // Sumar: al lote indicado, o lote nuevo de ajuste (sin caducidad).
                const target = loteIdParam ? lotes.find(l => l._id.toString() === loteIdParam) : null;
                if (target) {
                    target.cantidadActual = Math.round((target.cantidadActual + cantidad) * 1000) / 1000;
                    lotesAfectados.push({ loteId: target._id, codigoLote: target.codigoLote, caducidad: target.caducidad, cantidad });
                } else {
                    const nuevo = {
                        _id: new mongoose.Types.ObjectId(),
                        codigoLote: 'AJUSTE',
                        caducidad: null,
                        cantidadInicial: cantidad,
                        cantidadActual: cantidad,
                        costoUnitario: null,
                        ingresadoEn: new Date(),
                        ingresadoPor: req.user?.id || null
                    };
                    lotes.push(nuevo);
                    lotesAfectados.push({ loteId: nuevo._id, codigoLote: 'AJUSTE', caducidad: null, cantidad });
                }
                return { lotes, extra: { modificadoPor: req.user?.id || null } };
            }

            // Restar: de un lote específico, o FEFO.
            if (loteIdParam) {
                const target = lotes.find(l => l._id.toString() === loteIdParam);
                if (!target) {
                    const err = new Error('Lote no encontrado');
                    err.statusCode = 404;
                    throw err;
                }
                const tomar = Math.min(target.cantidadActual, cantidad);
                target.cantidadActual = Math.round((target.cantidadActual - tomar) * 1000) / 1000;
                faltante = Math.round((cantidad - tomar) * 1000) / 1000;
                lotesAfectados.push({ loteId: target._id, codigoLote: target.codigoLote, caducidad: target.caducidad, cantidad: tomar });
            } else {
                const { plan, faltante: planFaltante } = InventoryStockHelpers.planConsumo(lotes, cantidad);
                for (const p of plan) {
                    const target = lotes.find(l => l._id.toString() === p.loteId.toString());
                    target.cantidadActual = Math.round((target.cantidadActual - p.cantidad) * 1000) / 1000;
                    lotesAfectados.push(p);
                }
                faltante = planFaltante;
            }
            if (lotesAfectados.length === 0 || lotesAfectados.every(l => l.cantidad === 0)) {
                const err = new Error('No hay stock que restar en este ítem/lote');
                err.statusCode = 409;
                throw err;
            }
            return { lotes, extra: { modificadoPor: req.user?.id || null } };
        });

        const cantidadReal = lotesAfectados.reduce((s, l) => s + l.cantidad, 0);
        // Igual que consume(): si no alcanzó el stock, se aplica lo disponible
        // y se reporta el faltante — antes se descartaba en silencio y el
        // cliente no tenía forma de saber que el ajuste quedó incompleto.
        const motivoFinal = faltante > 0
            ? `${motivo} — stock insuficiente, faltaron ${faltante} ${item.unidad}`
            : motivo;
        let movimiento;
        try {
            movimiento = await InventoryMovement.create({
                item_id: item._id,
                itemNombre: item.nombre,
                tipo,
                cantidad: cantidadReal,
                direccion,
                lotesAfectados,
                stockResultante: item.stockTotal,
                usuario_id: req.user?.id || null,
                motivo: motivoFinal
            });
        } catch (movErr) {
            await compensateLotes(item._id, lotesAfectados, direccion);
            throw movErr;
        }

        return res.status(201).json({ item, movimiento, faltante });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status === 500) logger.error('Error en ajuste de inventario: %s', error.message);
        return res.status(status).json({ message: status === 500 ? 'Error al registrar el ajuste' : error.message });
    }
};

exports.getMovements = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const [movements, total] = await Promise.all([
            InventoryMovement.find({ item_id: req.params.id })
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(limit)
                .populate('usuario_id', 'nombre')
                .populate('paciente_id', 'nombre apellidos')
                .lean(),
            InventoryMovement.countDocuments({ item_id: req.params.id })
        ]);

        // El kardex es visible con solo inventory.read (p. ej. recepción, para
        // avisar reposición) — pero el vínculo paciente/cita de un consumo es
        // dato clínico (NOM-004 Art. 5.7), igual que ya se protege en citas
        // vía BASIC_APPOINTMENT_FIELDS. Se recorta para quien no tenga rol
        // clínico o administrativo, aunque tenga inventory.read.
        const puedeVerVinculoClinico = isAdminRole(req.user.role) || isClinicalRole(req.user.role);
        const view = puedeVerVinculoClinico
            ? movements
            : movements.map(({ paciente_id, cita_id, ...rest }) => rest);

        return res.json({ movements: view, total, limit, offset });
    } catch (error) {
        logger.error('Error al obtener kardex: %s', error.message);
        return res.status(500).json({ message: 'Error al obtener los movimientos' });
    }
};

// ─────────────────────────────────────────────────────────────
// Alertas
// ─────────────────────────────────────────────────────────────

exports.getAlerts = async (req, res) => {
    try {
        const warnDays = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
        const now = new Date();
        const warnDate = new Date(now.getTime() + warnDays * 24 * 60 * 60 * 1000);

        // Universo pequeño (catálogo de una clínica) — un solo find es más
        // simple y suficiente hasta miles de ítems; si algún día duele,
        // se convierte en aggregation pipeline sin tocar la API.
        const items = await InventoryItem.find({ deletedAt: null, activo: true }).lean();

        const caducados = [];
        const porCaducar = [];
        const stockBajo = [];
        const sinStock = [];

        for (const item of items) {
            const view = buildItemView(item, warnDate, now);
            for (const lote of (item.lotes || [])) {
                if ((lote.cantidadActual || 0) <= 0 || !lote.caducidad) continue;
                const cad = new Date(lote.caducidad);
                const entry = {
                    itemId: item._id,
                    nombre: item.nombre,
                    unidad: item.unidad,
                    loteId: lote._id,
                    codigoLote: lote.codigoLote,
                    caducidad: cad,
                    cantidad: lote.cantidadActual
                };
                if (cad < now) caducados.push(entry);
                else if (cad <= warnDate) porCaducar.push(entry);
            }
            if (view.alertas.sinStock) sinStock.push({ itemId: item._id, nombre: item.nombre, unidad: item.unidad, stockMinimo: item.stockMinimo });
            else if (view.alertas.stockBajo) stockBajo.push({ itemId: item._id, nombre: item.nombre, unidad: item.unidad, stockTotal: item.stockTotal, stockMinimo: item.stockMinimo });
        }

        const byCaducidad = (a, b) => new Date(a.caducidad) - new Date(b.caducidad);
        caducados.sort(byCaducidad);
        porCaducar.sort(byCaducidad);

        return res.json({
            days: warnDays,
            caducados,
            porCaducar,
            stockBajo,
            sinStock,
            totalAlertas: caducados.length + porCaducar.length + stockBajo.length
        });
    } catch (error) {
        logger.error('Error al obtener alertas de inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al obtener las alertas' });
    }
};

// ─────────────────────────────────────────────────────────────
// Consumo ligado a citas
// ─────────────────────────────────────────────────────────────

// Estados de cita donde tiene sentido registrar consumo: durante el
// procedimiento o inmediatamente después de atender.
const ESTADOS_CONSUMO = ['EnCurso', 'Pasada'];

exports.consume = async (req, res) => {
    try {
        const { cita_id, materiales } = req.body || {};
        if (!isValidId(cita_id)) return res.status(400).json({ message: 'ID de cita inválido' });
        if (!Array.isArray(materiales) || materiales.length === 0) {
            return res.status(400).json({ message: 'Debe indicar al menos un material' });
        }
        if (materiales.length > 50) {
            return res.status(400).json({ message: 'Máximo 50 materiales por registro' });
        }

        const cita = await Appointment.findOne({ _id: cita_id, deletedAt: null });
        if (!cita) return res.status(404).json({ message: 'Cita no encontrada' });
        if (!ESTADOS_CONSUMO.includes(cita.estado)) {
            return res.status(409).json({
                message: `Solo se puede registrar consumo en citas En curso o Atendidas (estado actual: ${cita.estado})`
            });
        }

        // Validar payload completo ANTES de tocar stock (todo-o-nada en la
        // validación; el descuento sí es por-ítem con compensación).
        const parsed = [];
        for (const m of materiales) {
            if (!isValidId(m?.item_id)) return res.status(400).json({ message: 'item_id inválido en materiales' });
            const cantidad = parseCantidad(m.cantidad);
            if (cantidad === null) return res.status(400).json({ message: 'Cantidad inválida en materiales (debe ser mayor a 0)' });
            parsed.push({ item_id: m.item_id.toString(), cantidad });
        }
        // Consolidar duplicados del mismo ítem en una sola línea.
        const porItem = new Map();
        for (const p of parsed) {
            porItem.set(p.item_id, (porItem.get(p.item_id) || 0) + p.cantidad);
        }

        const registrados = [];
        const errores = [];
        const statusCodes = [];

        for (const [itemId, cantidad] of porItem.entries()) {
            let decremented = null;
            try {
                let planFinal = null;
                let faltanteFinal = 0;
                const { item } = await applyLotesUpdate(itemId, (doc) => {
                    if (!doc.activo) {
                        const err = new Error(`El ítem "${doc.nombre}" está inactivo`);
                        err.statusCode = 409;
                        throw err;
                    }
                    const lotes = doc.lotes.map(l => l.toObject());
                    const { plan, faltante } = InventoryStockHelpers.planConsumo(lotes, cantidad);
                    for (const p of plan) {
                        const target = lotes.find(l => l._id.toString() === p.loteId.toString());
                        target.cantidadActual = Math.round((target.cantidadActual - p.cantidad) * 1000) / 1000;
                    }
                    planFinal = plan;
                    faltanteFinal = faltante;
                    return { lotes, extra: { modificadoPor: req.user?.id || null } };
                });
                decremented = { itemId, plan: planFinal };

                const consumido = cantidad - faltanteFinal;
                const movimiento = await InventoryMovement.create({
                    item_id: item._id,
                    itemNombre: item.nombre,
                    tipo: 'consumo',
                    cantidad: consumido,
                    direccion: -1,
                    lotesAfectados: planFinal,
                    stockResultante: item.stockTotal,
                    cita_id: cita._id,
                    paciente_id: cita.paciente_id,
                    usuario_id: req.user?.id || null,
                    motivo: faltanteFinal > 0
                        ? `Consumo en cita — stock insuficiente, faltaron ${faltanteFinal} ${item.unidad}`
                        : 'Consumo en cita'
                });

                const materialEntry = {
                    item_id: item._id,
                    nombre: item.nombre,
                    unidad: item.unidad,
                    cantidad,
                    faltante: faltanteFinal,
                    movimiento_id: movimiento._id,
                    registradoEn: new Date(),
                    registradoPor: req.user?.id || null
                };
                // updateOne directo (no save()) para no disparar el pre('save')
                // de auto-transición de estado del appointment. Re-chequea el
                // estado en el MISMO filtro atómico: si la cita cambió de
                // estado mientras se procesaban los materiales anteriores
                // (carrera con updateAppointmentStatus), este $push ya no
                // matchea — sin esto el consumo se seguía empujando a una
                // cita recién cerrada/cancelada.
                const pushResult = await Appointment.updateOne(
                    { _id: cita._id, estado: { $in: ESTADOS_CONSUMO } },
                    { $push: { materiales: materialEntry } }
                );
                if (pushResult.matchedCount === 0) {
                    const err = new Error('La cita cambió de estado mientras se registraba el consumo');
                    err.statusCode = 409;
                    throw err;
                }

                registrados.push({ ...materialEntry, stockRestante: item.stockTotal });
            } catch (err) {
                // Compensación: si el descuento se aplicó pero un paso posterior
                // falló, devolver las unidades a los mismos lotes.
                if (decremented) {
                    try {
                        await applyLotesUpdate(itemId, (doc) => {
                            const lotes = doc.lotes.map(l => l.toObject());
                            for (const p of decremented.plan) {
                                const target = lotes.find(l => l._id.toString() === p.loteId.toString());
                                if (target) target.cantidadActual = Math.round((target.cantidadActual + p.cantidad) * 1000) / 1000;
                            }
                            return { lotes };
                        });
                    } catch (compErr) {
                        logger.error('Compensación de consumo falló (item %s): %s', itemId, compErr.message);
                    }
                }
                errores.push({ item_id: itemId, message: err.message });
                statusCodes.push(err.statusCode || 500);
            }
        }

        // Si TODOS los materiales fallaron con el MISMO código clasificado
        // (404/409/...), se propaga tal cual en vez de colapsar a un 500
        // genérico que ocultaba la causa real (p. ej. "ítem inactivo").
        let status = 201;
        if (errores.length && !registrados.length) {
            const unique = new Set(statusCodes);
            status = unique.size === 1 ? statusCodes[0] : 500;
        }
        return res.status(status).json({ registrados, errores, cita_id: cita._id, paciente_id: cita.paciente_id });
    } catch (error) {
        logger.error('Error al registrar consumo de inventario: %s', error.message);
        return res.status(500).json({ message: 'Error al registrar el consumo' });
    }
};

exports.revertConsume = async (req, res) => {
    try {
        const { cita_id, material_id } = req.body || {};
        if (!isValidId(cita_id) || !isValidId(material_id)) {
            return res.status(400).json({ message: 'IDs inválidos' });
        }

        // Claim atómico: el filtro exige 'materiales._id' presente, así que
        // solo UNA petición concurrente (doble clic, dos pestañas, retry de
        // red) encuentra y remueve el material — la otra recibe null y 404
        // limpio, en vez de que ambas acrediten el mismo stock dos veces.
        const citaAntes = await Appointment.findOneAndUpdate(
            { _id: cita_id, deletedAt: null, 'materiales._id': material_id },
            { $pull: { materiales: { _id: material_id } } },
            { new: false }
        );
        if (!citaAntes) {
            const citaExiste = await Appointment.exists({ _id: cita_id, deletedAt: null });
            return res.status(404).json({
                message: citaExiste ? 'Material no encontrado en la cita (¿ya fue revertido?)' : 'Cita no encontrada'
            });
        }
        const material = citaAntes.materiales.find(m => m._id.toString() === material_id.toString());

        const movimientoOriginal = material.movimiento_id
            ? await InventoryMovement.findById(material.movimiento_id).lean()
            : null;

        // Reponer a los MISMOS lotes de donde salió (trazabilidad exacta).
        let repuesto = 0;
        try {
            if (movimientoOriginal && Array.isArray(movimientoOriginal.lotesAfectados) && movimientoOriginal.lotesAfectados.length) {
                const { item } = await applyLotesUpdate(material.item_id, (doc) => {
                    const lotes = doc.lotes.map(l => l.toObject());
                    for (const p of movimientoOriginal.lotesAfectados) {
                        const target = lotes.find(l => l._id.toString() === (p.loteId || '').toString());
                        if (target) {
                            target.cantidadActual = Math.round((target.cantidadActual + p.cantidad) * 1000) / 1000;
                            repuesto += p.cantidad;
                        }
                    }
                    return { lotes, extra: { modificadoPor: req.user?.id || null } };
                });

                await InventoryMovement.create({
                    item_id: material.item_id,
                    itemNombre: material.nombre,
                    tipo: 'reversa',
                    cantidad: repuesto,
                    direccion: 1,
                    lotesAfectados: movimientoOriginal.lotesAfectados,
                    stockResultante: item.stockTotal,
                    cita_id: citaAntes._id,
                    paciente_id: citaAntes.paciente_id,
                    movimientoRevertido: movimientoOriginal._id,
                    usuario_id: req.user?.id || null,
                    motivo: (req.body?.motivo || '').toString().trim() || 'Reversa de consumo en cita'
                });
            }
        } catch (err) {
            // El material ya se reclamó (quitado de la cita) pero el
            // stock/kardex no se completó — devolverlo a la cita para que el
            // estado quede consistente y la reversa se pueda reintentar.
            await Appointment.updateOne({ _id: citaAntes._id }, { $push: { materiales: material.toObject() } })
                .catch(pushErr => {
                    logger.error('No se pudo restaurar el material tras fallo de reversa (cita %s, material %s): %s', cita_id, material_id, pushErr.message);
                });
            throw err;
        }

        return res.json({ message: 'Consumo revertido', repuesto, material_id, cita_id: citaAntes._id, paciente_id: citaAntes.paciente_id });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status === 500) logger.error('Error al revertir consumo: %s', error.message);
        return res.status(status).json({ message: status === 500 ? 'Error al revertir el consumo' : error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// Kits (plantillas de materiales por procedimiento)
// ─────────────────────────────────────────────────────────────

const validateKitMateriales = async (materiales) => {
    if (!Array.isArray(materiales) || materiales.length === 0) {
        return { error: 'El kit debe tener al menos un material' };
    }
    if (materiales.length > 50) return { error: 'Máximo 50 materiales por kit' };
    const cleaned = [];
    for (const m of materiales) {
        if (!isValidId(m?.item_id)) return { error: 'item_id inválido en materiales del kit' };
        const cantidad = parseCantidad(m.cantidad);
        if (cantidad === null) return { error: 'Cantidad inválida en materiales del kit' };
        cleaned.push({ item_id: m.item_id, cantidad });
    }
    const ids = cleaned.map(m => m.item_id);
    const count = await InventoryItem.countDocuments({ _id: { $in: ids }, deletedAt: null });
    if (count !== new Set(ids.map(String)).size) {
        return { error: 'Uno o más materiales del kit no existen en el catálogo' };
    }
    return { materiales: cleaned };
};

exports.getKits = async (req, res) => {
    try {
        const filter = { deletedAt: null };
        if (req.query.servicio && typeof req.query.servicio === 'string' && req.query.servicio.trim()) {
            filter.servicioNombre = { $regex: `^${escapeRegex(req.query.servicio.trim())}$`, $options: 'i' };
        }
        if (req.query.includeInactive !== 'true') filter.activo = true;
        const kits = await InventoryKit.find(filter)
            .sort({ nombre: 1 })
            // match excluye ítems soft-eliminados del populate (Mongoose no lo
            // hace por defecto) — sin esto, un ítem borrado del catálogo se
            // seguía poblando con sus datos como si estuviera vivo, y el kit
            // lo sugería en consumo indefinidamente. Con match, item_id queda
            // null y el frontend ya sabe mostrar "Ítem eliminado".
            .populate({ path: 'materiales.item_id', select: 'nombre unidad stockTotal activo', match: { deletedAt: null } })
            .lean();
        return res.json({ kits });
    } catch (error) {
        logger.error('Error al listar kits: %s', error.message);
        return res.status(500).json({ message: 'Error al obtener los kits' });
    }
};

exports.createKit = async (req, res) => {
    try {
        const { nombre, servicioNombre, materiales } = req.body || {};
        if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
            return res.status(400).json({ message: 'El nombre del kit es obligatorio' });
        }
        const check = await validateKitMateriales(materiales);
        if (check.error) return res.status(400).json({ message: check.error });

        const kit = await InventoryKit.create({
            nombre: nombre.trim(),
            servicioNombre: (servicioNombre || '').toString().trim() || null,
            materiales: check.materiales,
            creadoPor: req.user?.id || null
        });
        return res.status(201).json({ kit });
    } catch (error) {
        logger.error('Error al crear kit: %s', error.message);
        return res.status(500).json({ message: 'Error al crear el kit' });
    }
};

exports.updateKit = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const kit = await InventoryKit.findOne({ _id: req.params.id, deletedAt: null });
        if (!kit) return res.status(404).json({ message: 'Kit no encontrado' });

        const { nombre, servicioNombre, materiales, activo } = req.body || {};
        if (nombre !== undefined) {
            if (typeof nombre !== 'string' || !nombre.trim()) return res.status(400).json({ message: 'Nombre inválido' });
            kit.nombre = nombre.trim();
        }
        if (servicioNombre !== undefined) {
            kit.servicioNombre = (servicioNombre || '').toString().trim() || null;
        }
        if (materiales !== undefined) {
            const check = await validateKitMateriales(materiales);
            if (check.error) return res.status(400).json({ message: check.error });
            kit.materiales = check.materiales;
        }
        if (activo !== undefined) kit.activo = !!activo;
        kit.modificadoPor = req.user?.id || null;
        await kit.save();
        return res.json({ kit });
    } catch (error) {
        logger.error('Error al actualizar kit: %s', error.message);
        return res.status(500).json({ message: 'Error al actualizar el kit' });
    }
};

exports.deleteKit = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const kit = await InventoryKit.findOne({ _id: req.params.id, deletedAt: null });
        if (!kit) return res.status(404).json({ message: 'Kit no encontrado' });
        kit.deletedAt = new Date();
        kit.deletedBy = req.user?.id || null;
        await kit.save();
        return res.json({ message: 'Kit eliminado', kitId: kit._id });
    } catch (error) {
        logger.error('Error al eliminar kit: %s', error.message);
        return res.status(500).json({ message: 'Error al eliminar el kit' });
    }
};
