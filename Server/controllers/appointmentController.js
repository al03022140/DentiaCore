const Appointment = require('../models/appointment.js');
const PatientCharge = require('../models/patientCharge.js');
const ClinicSettings = require('../models/clinicSettings.js');
const Patient = require('../models/patient.js');
const Odontograma = require('../models/odontograma.js');
const PeriodontogramHistory = require('../models/periodontogramHistory.js');
const Exam = require('../models/exam.js');
const CashMovement = require('../models/cashMovement.js');
const mongoose = require('mongoose');

// ───────── Constantes ─────────
const PATIENT_FIELDS = 'primer_nombre otros_nombres apellido_paterno apellido_materno photoURL fecha_nacimiento sexo';
const DOCTOR_FIELDS = 'nombre';
const ESTADOS_VIVOS = ['Pendiente', 'Confirmada', 'EnCurso'];
const ESTADOS_CERRADOS = ['Pasada', 'NoShow', 'Cancelada'];
const ESTADOS_VALIDOS = [...ESTADOS_VIVOS, ...ESTADOS_CERRADOS];

// Transiciones permitidas: clave = origen, valor = destinos válidos.
const TRANSITION_MATRIX = {
    Pendiente:  ['Confirmada', 'EnCurso', 'Cancelada', 'NoShow', 'Pasada'],
    Confirmada: ['EnCurso', 'Pasada', 'NoShow', 'Cancelada'],
    EnCurso:    ['Pasada', 'Cancelada'],
    Pasada:     [],
    NoShow:     [],
    Cancelada:  []
};

let defaultDurationCache = { value: 30, ts: 0 };
const DEFAULT_DURATION_TTL = 5 * 60 * 1000;

async function getDefaultDuration() {
    const now = Date.now();
    if (defaultDurationCache.ts && now - defaultDurationCache.ts < DEFAULT_DURATION_TTL) {
        return defaultDurationCache.value;
    }
    try {
        const settings = await ClinicSettings.findOne().lean();
        const val = Number(settings?.defaultAppointmentDuration) || 30;
        defaultDurationCache = { value: val, ts: now };
        return val;
    } catch {
        return 30;
    }
}

// Detección de conflictos: misma doctor, ventana solapada, no cancelada/eliminada.
// Devuelve la cita en conflicto si existe, o null si está libre.
async function findConflict({ doctorId, fecha, duracion, excludeId = null }) {
    if (!doctorId || !fecha || !duracion) return null;
    const start = new Date(fecha);
    const end = new Date(start.getTime() + duracion * 60_000);

    // Solapa si: existing.start < newEnd  AND  existing.end > newStart.
    // Conservador: ventana de búsqueda = [start - 8h, end] para limitar el scan.
    const searchFrom = new Date(start.getTime() - 8 * 60 * 60_000);
    // Excluir Cancelada, NoShow y Pasada — citas ya cerradas liberan su slot
    // (especialmente útil cuando el doctor termina la consulta antes de la
    // hora programada y quiere reusar el lapso restante).
    const candidates = await Appointment.find({
        _id: excludeId ? { $ne: excludeId } : { $exists: true },
        doctor_id: doctorId,
        deletedAt: null,
        estado: { $nin: ['Cancelada', 'NoShow', 'Pasada'] },
        fecha_hora: { $gte: searchFrom, $lt: end }
    }).select('fecha_hora duracion paciente_id motivo estado').lean();

    for (const c of candidates) {
        const cStart = new Date(c.fecha_hora).getTime();
        const cEnd = cStart + ((c.duracion || 30) * 60_000);
        if (cStart < end.getTime() && cEnd > start.getTime()) {
            return c;
        }
    }
    return null;
}

// Lazy transition: marca como "Pasada" las Pendiente/Confirmada cuya hora
// (+duracion) ya quedó atrás. Se llama desde getTodayAppointments/getAll para
// evitar dependencia de cron. No falla la request si el update falla.
async function transitionPastDue() {
    try {
        const now = new Date();
        // Filtrar primero, computar fin (= fecha_hora + duracion*60s)
        const overdue = await Appointment.find({
            deletedAt: null,
            estado: { $in: ['Pendiente', 'Confirmada'] },
            fecha_hora: { $lt: now }
        }).select('_id fecha_hora duracion estado').lean();

        const ids = [];
        for (const a of overdue) {
            const finMs = new Date(a.fecha_hora).getTime() + ((a.duracion || 30) * 60_000);
            if (finMs <= now.getTime()) ids.push({ id: a._id, from: a.estado });
        }
        if (ids.length === 0) return;

        const bulk = Appointment.collection.initializeUnorderedBulkOp();
        for (const { id, from } of ids) {
            bulk.find({ _id: id }).updateOne({
                $set: { estado: 'Pasada' },
                $push: {
                    estadoHistorial: {
                        desde: from,
                        hacia: 'Pasada',
                        cambiadoEn: new Date(),
                        cambiadoPor: null,
                        motivo: 'Auto-transición por fecha vencida'
                    }
                }
            });
        }
        await bulk.execute();
    } catch (err) {
        console.warn('[appointments] transitionPastDue failed (non-fatal):', err.message);
    }
}

// ───────── Endpoints ─────────

// GET /appointments — soporta ?from=&to=&doctor_id=&estado=&limit=&offset=
exports.getAllAppointments = async (req, res) => {
    try {
        await transitionPastDue();

        const { from, to, doctor_id, estado } = req.query;
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const filter = { deletedAt: null };
        if (from || to) {
            filter.fecha_hora = {};
            if (from) filter.fecha_hora.$gte = new Date(from);
            if (to) filter.fecha_hora.$lte = new Date(to);
        }
        if (doctor_id && mongoose.Types.ObjectId.isValid(doctor_id)) {
            filter.doctor_id = doctor_id;
        }
        if (estado && ESTADOS_VALIDOS.includes(estado)) {
            filter.estado = estado;
        }

        const items = await Appointment.find(filter)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS)
            .sort({ fecha_hora: 1 })
            .skip(offset)
            .limit(limit);

        // Mantenemos shape de array para compat. Para paginación explícita el
        // cliente puede pasar X-Include-Total (header) o ?withTotal=true.
        if (req.query.withTotal === 'true') {
            const total = await Appointment.countDocuments(filter);
            res.set('X-Total-Count', total);
            return res.status(200).json({ items, total, limit, offset });
        }
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las citas', error: error.message });
    }
};

// GET /appointments/today
exports.getTodayAppointments = async (req, res) => {
    try {
        await transitionPastDue();

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const appointments = await Appointment.find({
            deletedAt: null,
            fecha_hora: { $gte: startOfDay, $lte: endOfDay }
        })
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS)
            .sort({ fecha_hora: 1 });

        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las citas de hoy', error: error.message });
    }
};

// GET /appointments/:id
exports.getAppointmentById = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS)
            .populate('estadoHistorial.cambiadoPor', 'nombre');
        if (!appointment || appointment.deletedAt) return res.status(404).json({ message: 'Cita no encontrada' });

        res.status(200).json(appointment);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener la cita', error: error.message });
    }
};

// POST /appointments
exports.createAppointment = async (req, res) => {
    let newAppointment = null;
    try {
        const { paciente_id, doctor_id, fecha_hora, motivo, observaciones, comentarioProcedimiento, items, duracion, force } = req.body;

        const fecha = new Date(fecha_hora);
        if (Number.isNaN(fecha.getTime())) {
            return res.status(400).json({ message: 'Fecha y hora inválidas.' });
        }
        if (fecha <= new Date()) {
            return res.status(400).json({ message: 'No se pueden programar citas en el pasado.' });
        }

        const defaultDuration = await getDefaultDuration();
        const dur = Number.isFinite(Number(duracion)) && Number(duracion) >= 5
            ? Math.min(Number(duracion), 480)
            : defaultDuration;

        // Conflict detection
        if (!force) {
            const conflict = await findConflict({ doctorId: doctor_id, fecha, duracion: dur });
            if (conflict) {
                return res.status(409).json({
                    message: 'El doctor ya tiene una cita en ese horario',
                    conflict: {
                        _id: conflict._id,
                        fecha_hora: conflict.fecha_hora,
                        duracion: conflict.duracion || defaultDuration,
                        motivo: conflict.motivo
                    }
                });
            }
        }

        // Procesar items
        let processedItems = [];
        let totalEstimado = 0;
        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const cantidad = Number(item.cantidad);
                const precioUnitario = Number(item.precioUnitario);
                if (!item.nombre || !Number.isFinite(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
                    return res.status(400).json({ message: `Item inválido: ${item.nombre || 'sin nombre'}` });
                }
                const subtotal = cantidad * precioUnitario;
                processedItems.push({
                    nombre: String(item.nombre).trim(),
                    cantidad,
                    precioUnitario,
                    subtotal
                });
                totalEstimado += subtotal;
            }
        }

        newAppointment = new Appointment({
            paciente_id,
            doctor_id,
            fecha_hora: fecha,
            duracion: dur,
            motivo,
            observaciones,
            comentarioProcedimiento,
            items: processedItems,
            totalEstimado,
            creadoPor: req.user?.id || null,
            estadoHistorial: [{
                desde: null,
                hacia: 'Pendiente',
                cambiadoEn: new Date(),
                cambiadoPor: req.user?.id || null,
                motivo: 'Creación'
            }]
        });
        await newAppointment.save();

        // Auto-crear cobro en caja si hay items.
        if (processedItems.length > 0) {
            try {
                const charge = new PatientCharge({
                    patientId: paciente_id,
                    appointmentId: newAppointment._id,
                    fecha: fecha,
                    items: processedItems,
                    total: totalEstimado,
                    confirmado: false,
                    creadoPor: req.user?.id || null
                });
                await charge.save();
            } catch (chargeErr) {
                await Appointment.deleteOne({ _id: newAppointment._id });
                throw chargeErr;
            }
        }

        const populated = await Appointment.findById(newAppointment._id)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS);

        res.status(201).json({
            message: 'Cita creada correctamente',
            appointment: populated
        });

    } catch (error) {
        res.status(400).json({ message: 'Error al crear la cita', error: error.message });
    }
};

// PUT /appointments/:id
exports.updateAppointment = async (req, res) => {
    try {
        const existing = await Appointment.findOne({ _id: req.params.id, deletedAt: null });
        if (!existing) return res.status(404).json({ message: 'Cita no encontrada' });

        const { paciente_id, doctor_id, fecha_hora, estado, motivo, observaciones, comentarioProcedimiento, items, duracion, force } = req.body;
        const allowedFields = {};

        if (paciente_id !== undefined) allowedFields.paciente_id = paciente_id;
        if (doctor_id !== undefined) allowedFields.doctor_id = doctor_id;
        if (motivo !== undefined) allowedFields.motivo = motivo;
        if (observaciones !== undefined) allowedFields.observaciones = observaciones;
        if (comentarioProcedimiento !== undefined) allowedFields.comentarioProcedimiento = comentarioProcedimiento;

        // ── Validar fecha y conflicto si se reagenda ──
        if (fecha_hora !== undefined) {
            const newFecha = new Date(fecha_hora);
            if (Number.isNaN(newFecha.getTime())) {
                return res.status(400).json({ message: 'Fecha y hora inválidas.' });
            }
            const fechaCambia = newFecha.getTime() !== new Date(existing.fecha_hora).getTime();
            if (fechaCambia && newFecha <= new Date()) {
                return res.status(400).json({ message: 'No se puede reagendar a una fecha en el pasado.' });
            }
            allowedFields.fecha_hora = newFecha;
        }

        if (duracion !== undefined) {
            const d = Number(duracion);
            if (Number.isFinite(d) && d >= 5 && d <= 480) {
                allowedFields.duracion = d;
            }
        }

        // ── Validar conflicto si cambió fecha/doctor/duracion ──
        const checkConflict = (
            allowedFields.fecha_hora !== undefined ||
            allowedFields.doctor_id !== undefined ||
            allowedFields.duracion !== undefined
        );
        if (checkConflict && !force) {
            const fechaFinal = allowedFields.fecha_hora || existing.fecha_hora;
            const doctorFinal = allowedFields.doctor_id || existing.doctor_id;
            const duracionFinal = allowedFields.duracion || existing.duracion || (await getDefaultDuration());

            const conflict = await findConflict({
                doctorId: doctorFinal,
                fecha: fechaFinal,
                duracion: duracionFinal,
                excludeId: existing._id
            });
            if (conflict) {
                return res.status(409).json({
                    message: 'El doctor ya tiene una cita en ese horario',
                    conflict: {
                        _id: conflict._id,
                        fecha_hora: conflict.fecha_hora,
                        duracion: conflict.duracion || 30,
                        motivo: conflict.motivo
                    }
                });
            }
        }

        // ── Validar transición de estado si viene ──
        let estadoTransicion = null;
        if (estado !== undefined && estado !== existing.estado) {
            if (!ESTADOS_VALIDOS.includes(estado)) {
                return res.status(400).json({ message: `Estado inválido: ${estado}` });
            }
            const allowed = TRANSITION_MATRIX[existing.estado] || [];
            if (!allowed.includes(estado)) {
                return res.status(400).json({
                    message: `Transición no permitida: ${existing.estado} → ${estado}`
                });
            }
            allowedFields.estado = estado;
            estadoTransicion = { from: existing.estado, to: estado };
        }

        // ── Procesar items ──
        if (Array.isArray(items)) {
            const existingCharge = await PatientCharge.findOne({
                appointmentId: req.params.id,
                confirmado: true,
                cancelado: { $ne: true }
            });
            if (existingCharge) {
                return res.status(400).json({ message: 'No se pueden modificar items de una cita con cobro confirmado' });
            }

            if (items.length === 0) {
                allowedFields.items = [];
                allowedFields.totalEstimado = 0;
                await PatientCharge.findOneAndUpdate(
                    { appointmentId: req.params.id, confirmado: false, cancelado: { $ne: true } },
                    {
                        $set: {
                            cancelado: true,
                            canceladoEn: new Date(),
                            canceladoPor: req.user?.id || null,
                            canceladoMotivo: 'Items de la cita removidos'
                        }
                    }
                );
            } else {
                const processedItems = [];
                let totalEstimado = 0;
                for (const item of items) {
                    const cantidad = Number(item.cantidad);
                    const precioUnitario = Number(item.precioUnitario);
                    if (!item.nombre || !Number.isFinite(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
                        return res.status(400).json({ message: `Item inválido: ${item.nombre || 'sin nombre'}` });
                    }
                    const subtotal = cantidad * precioUnitario;
                    processedItems.push({ nombre: String(item.nombre).trim(), cantidad, precioUnitario, subtotal });
                    totalEstimado += subtotal;
                }
                allowedFields.items = processedItems;
                allowedFields.totalEstimado = totalEstimado;

                await PatientCharge.findOneAndUpdate(
                    { appointmentId: req.params.id, confirmado: false, cancelado: { $ne: true } },
                    { $set: { items: processedItems, total: totalEstimado } },
                    { runValidators: true }
                );
            }
        }

        // ── Aplicar update ──
        const update = {
            $set: { ...allowedFields, modificadoPor: req.user?.id || null, modificadoEn: new Date() }
        };
        if (estadoTransicion) {
            update.$push = {
                estadoHistorial: {
                    desde: estadoTransicion.from,
                    hacia: estadoTransicion.to,
                    cambiadoEn: new Date(),
                    cambiadoPor: req.user?.id || null,
                    motivo: req.body?.motivoCambioEstado || null
                }
            };
        }

        const updatedAppointment = await Appointment.findOneAndUpdate(
            { _id: req.params.id, deletedAt: null },
            update,
            { new: true, runValidators: true }
        );

        if (!updatedAppointment) {
            return res.status(404).json({ message: 'Cita no encontrada' });
        }

        // Cancelar cobro si pasó a Cancelada/NoShow
        if (allowedFields.estado === 'Cancelada' || allowedFields.estado === 'NoShow') {
            await PatientCharge.findOneAndUpdate(
                { appointmentId: updatedAppointment._id, confirmado: false, cancelado: { $ne: true } },
                {
                    $set: {
                        cancelado: true,
                        canceladoEn: new Date(),
                        canceladoPor: req.user?.id || null,
                        canceladoMotivo: allowedFields.estado === 'NoShow' ? 'Paciente no se presentó' : 'Cita cancelada'
                    }
                }
            );
        }

        const populated = await Appointment.findById(updatedAppointment._id)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS);

        res.status(200).json({
            message: 'Cita modificada correctamente',
            appointment: populated
        });

    } catch (error) {
        res.status(400).json({ message: 'Error al actualizar la cita', error: error.message });
    }
};

// PATCH /appointments/:id/status — transición de estado ligera con audit
exports.updateAppointmentStatus = async (req, res) => {
    try {
        const { estado, motivo } = req.body || {};
        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ message: `Estado inválido: ${estado}` });
        }

        const existing = await Appointment.findOne({ _id: req.params.id, deletedAt: null });
        if (!existing) return res.status(404).json({ message: 'Cita no encontrada' });

        if (existing.estado === estado) {
            return res.status(200).json({ message: 'Sin cambios', appointment: existing });
        }

        const allowed = TRANSITION_MATRIX[existing.estado] || [];
        if (!allowed.includes(estado)) {
            return res.status(400).json({
                message: `Transición no permitida: ${existing.estado} → ${estado}`
            });
        }

        // Para Cancelada / NoShow exigir motivo
        if ((estado === 'Cancelada' || estado === 'NoShow') && (!motivo || String(motivo).trim().length < 3)) {
            return res.status(400).json({ message: 'Debe indicar el motivo (mínimo 3 caracteres)' });
        }

        const desde = existing.estado;
        existing.estado = estado;
        existing.modificadoPor = req.user?.id || null;
        existing.modificadoEn = new Date();
        existing.estadoHistorial.push({
            desde,
            hacia: estado,
            cambiadoEn: new Date(),
            cambiadoPor: req.user?.id || null,
            motivo: motivo ? String(motivo).trim() : null
        });

        // Al terminar la consulta (→ Pasada), achicar la duración a los
        // minutos reales transcurridos. Sólo encogemos, no extendemos: si la
        // consulta tardó más de lo planeado mantenemos la duración original
        // (la matriz de transición permite Pasada desde Pendiente/Confirmada/
        // EnCurso — en todos los casos aplica el mismo razonamiento).
        if (estado === 'Pasada' && existing.fecha_hora) {
            const now = new Date();
            const elapsedMs = now.getTime() - new Date(existing.fecha_hora).getTime();
            if (elapsedMs > 0) {
                const elapsedMin = Math.max(1, Math.ceil(elapsedMs / 60_000));
                if (!existing.duracion || elapsedMin < existing.duracion) {
                    existing.duracion = elapsedMin;
                }
            }
        }

        await existing.save();

        // Cancelar cobro asociado si cancelado/no-show
        if (estado === 'Cancelada' || estado === 'NoShow') {
            await PatientCharge.findOneAndUpdate(
                { appointmentId: existing._id, confirmado: false, cancelado: { $ne: true } },
                {
                    $set: {
                        cancelado: true,
                        canceladoEn: new Date(),
                        canceladoPor: req.user?.id || null,
                        canceladoMotivo: estado === 'NoShow' ? 'Paciente no se presentó' : (motivo || 'Cita cancelada')
                    }
                }
            );
        }

        const populated = await Appointment.findById(existing._id)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS);

        res.status(200).json({ message: 'Estado actualizado', appointment: populated });
    } catch (error) {
        res.status(400).json({ message: 'Error al cambiar estado', error: error.message });
    }
};

// GET /appointments/:id/activity — todo lo registrado durante esta cita
// (notas de evolución, planes de tratamiento, odontograma/periodontograma,
// exámenes, cobro y pagos vinculados).
exports.getAppointmentActivity = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de cita inválido' });
        }

        const apt = await Appointment.findOne({ _id: id, deletedAt: null }).select('paciente_id doctor_id fecha_hora estado motivo');
        if (!apt) return res.status(404).json({ message: 'Cita no encontrada' });

        const aptObjectId = new mongoose.Types.ObjectId(id);

        // ── Notas de evolución y planes de tratamiento (subdocumentos en Patient)
        // Buscamos en el paciente dueño de la cita; filtramos sus subdocs por
        // appointmentId. Devolvemos sólo los campos visualizables.
        const patient = await Patient.findOne(
            { _id: apt.paciente_id, deletedAt: null },
            { notas_evolucion: 1, planes_tratamiento: 1 }
        ).lean();

        const evolutionNotes = (patient?.notas_evolucion || [])
            .filter(n => n.appointmentId && String(n.appointmentId) === String(id) && !n.deletedAt)
            .map(n => ({
                _id: n._id,
                numero_procedimiento: n.numero_procedimiento,
                procedimiento: n.procedimiento,
                observaciones: n.observaciones,
                correcciones: n.correcciones,
                fecha: n.fecha,
                fechaFormateada: n.fechaFormateada,
                estadoRegistro: n.estadoRegistro
            }));

        const treatmentPlans = (patient?.planes_tratamiento || [])
            .filter(p => p.appointmentId && String(p.appointmentId) === String(id) && !p.deletedAt)
            .map(p => ({
                _id: p._id,
                texto: p.texto,
                fecha: p.fecha,
                fechaFormateada: p.fechaFormateada,
                estadoRegistro: p.estadoRegistro
            }));

        // ── Snapshots de odontograma con esta cita ──
        // Para cada documento de odontograma del paciente, filtrar history[] que tenga appointmentId == id.
        const odontogramaDocs = await Odontograma.find(
            { patientId: apt.paciente_id, deletedAt: null },
            { type: 1, history: 1, current: 1 }
        ).lean();

        const odontogramaSnapshots = [];
        for (const od of odontogramaDocs) {
            for (const h of (od.history || [])) {
                if (h.appointmentId && String(h.appointmentId) === String(id) && !h.deletedAt) {
                    odontogramaSnapshots.push({
                        _id: h._id,
                        odontogramaId: od._id,
                        type: od.type,
                        datos: h.datos || [],
                        imageUrl: h.imageUrl || '',
                        savedAt: h.savedAt
                    });
                }
            }
        }
        odontogramaSnapshots.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));

        // ── Snapshots de periodontograma ──
        const periodontogramSnapshots = await PeriodontogramHistory.find({
            patient: apt.paciente_id,
            appointmentId: aptObjectId
        })
            .select('versionName statistics createdAt teeth')
            .sort({ createdAt: 1 })
            .lean();

        // ── Exámenes asociados ──
        const exams = await Exam.find({
            paciente_id: apt.paciente_id,
            appointmentId: aptObjectId,
            deletedAt: null
        })
            .select('tipo_examen estado fecha_solicitud fecha_resultado archivo tipo_archivo observaciones createdAt')
            .sort({ createdAt: 1 })
            .lean();

        // ── Cobro y pagos asociados ──
        const charge = await PatientCharge.findOne({
            appointmentId: aptObjectId,
            cancelado: { $ne: true }
        })
            .populate('pagos.registradoPor', 'nombre')
            .populate('creadoPor', 'nombre')
            .lean();

        // ── Movimientos de caja directos (sin cobro) que apunten al paciente
        //    y caigan en la ventana de la cita. Sólo informativo.
        const aptDate = new Date(apt.fecha_hora);
        const aptDateEnd = new Date(aptDate.getTime() + 24 * 60 * 60 * 1000);
        const directMovements = await CashMovement.find({
            patientId: apt.paciente_id,
            linkedChargeId: null,
            date: { $gte: aptDate, $lt: aptDateEnd }
        })
            .select('amount type paymentMethod concept date')
            .sort({ date: 1 })
            .lean();

        res.json({
            appointment: {
                _id: apt._id,
                paciente_id: apt.paciente_id,
                doctor_id: apt.doctor_id,
                fecha_hora: apt.fecha_hora,
                estado: apt.estado,
                motivo: apt.motivo
            },
            counts: {
                evolutionNotes: evolutionNotes.length,
                treatmentPlans: treatmentPlans.length,
                odontogramaSnapshots: odontogramaSnapshots.length,
                periodontogramSnapshots: periodontogramSnapshots.length,
                exams: exams.length,
                charge: charge ? 1 : 0,
                directMovements: directMovements.length
            },
            evolutionNotes,
            treatmentPlans,
            odontogramaSnapshots,
            periodontogramSnapshots,
            exams,
            charge,
            directMovements
        });
    } catch (error) {
        console.error('[appointments] getAppointmentActivity:', error);
        res.status(500).json({ message: 'Error al obtener actividad de la cita', error: error.message });
    }
};

// DELETE /appointments/:id (soft)
exports.deleteAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });

        appointment.deletedAt = new Date();
        appointment.deletedBy = req.user?.id || null;
        appointment.deleteReason = req.body?.motivo || 'Eliminada por usuario';
        await appointment.save({ validateModifiedOnly: true });

        await PatientCharge.findOneAndUpdate(
            { appointmentId: appointment._id, confirmado: false, cancelado: { $ne: true } },
            {
                $set: {
                    cancelado: true,
                    canceladoEn: new Date(),
                    canceladoPor: req.user?.id || null,
                    canceladoMotivo: appointment.deleteReason || 'Cita eliminada'
                }
            }
        );

        res.status(200).json({ message: 'Cita eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar la cita', error: error.message });
    }
};
