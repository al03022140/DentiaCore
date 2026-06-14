const Appointment = require('../models/appointment.js');
const PatientCharge = require('../models/patientCharge.js');
const ClinicSettings = require('../models/clinicSettings.js');
const Patient = require('../models/patient.js');
const Usuario = require('../models/users.js');
const Odontograma = require('../models/odontograma.js');
const PeriodontogramHistory = require('../models/periodontogramHistory.js');
const Exam = require('../models/exam.js');
const CashMovement = require('../models/cashMovement.js');
const mongoose = require('mongoose');

// Roles que pueden ser titulares de una cita (atender pacientes). Solo
// 'doctor' y 'doctor_admin' — administrador/superadmin gestionan pero no
// atienden clínicamente. Alineado con GET /users/doctors.
const DOCTOR_ROLES = new Set(['doctor', 'doctor_admin']);

// ───────── Constantes ─────────
// `sexo` se quitó del populate: es PII que NINGÚN consumidor del front usa
// desde las citas (verificado). `fecha_nacimiento` se conserva porque la UI de
// citas calcula la edad con ella (ConsultasPage y el modal en edición), y la
// recepcionista está autorizada a verla por política (BASIC_PATIENT_FIELDS).
const PATIENT_FIELDS = 'primer_nombre otros_nombres apellido_paterno apellido_materno photoURL fecha_nacimiento';
const DOCTOR_FIELDS = 'nombre';
const ESTADOS_VIVOS = ['Pendiente', 'Confirmada', 'EnCurso'];
const ESTADOS_CERRADOS = ['Pasada', 'NoShow', 'Cancelada'];
const ESTADOS_VALIDOS = [...ESTADOS_VIVOS, ...ESTADOS_CERRADOS];
// Tope de agendamiento a futuro — 5 años desde hoy. Sin tope se podía
// crear citas para el año 9999.
const MAX_FUTURE_MS = 5 * 365 * 24 * 60 * 60 * 1000;
// Mínimo de motivo para eliminar — alineado con el cliente (5 chars).
const MIN_DELETE_REASON_LEN = 5;
// Redondeo monetario a 2 decimales. Necesario al recalcular el saldo de un
// cobro vía findOneAndUpdate, donde el hook pre('save') del modelo (que
// normalmente recalcula totalPagado/saldoPendiente) NO se ejecuta.
const round2 = (n) => Math.round((Number.isFinite(Number(n)) ? Number(n) : 0) * 100) / 100;

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

// Detección de conflictos del PACIENTE: un paciente no puede estar en dos
// citas a la vez aunque sean con doctores distintos. Mismo algoritmo de
// solapamiento que findConflict.
async function findPatientConflict({ patientId, fecha, duracion, excludeId = null }) {
    if (!patientId || !fecha || !duracion) return null;
    const start = new Date(fecha);
    const end = new Date(start.getTime() + duracion * 60_000);
    const searchFrom = new Date(start.getTime() - 8 * 60 * 60_000);

    const candidates = await Appointment.find({
        _id: excludeId ? { $ne: excludeId } : { $exists: true },
        paciente_id: patientId,
        deletedAt: null,
        estado: { $nin: ['Cancelada', 'NoShow', 'Pasada'] },
        fecha_hora: { $gte: searchFrom, $lt: end }
    }).select('fecha_hora duracion doctor_id motivo estado').lean();

    for (const c of candidates) {
        const cStart = new Date(c.fecha_hora).getTime();
        const cEnd = cStart + ((c.duracion || 30) * 60_000);
        if (cStart < end.getTime() && cEnd > start.getTime()) {
            return c;
        }
    }
    return null;
}

// Valida que el doctor exista, esté activo y tenga rol que pueda atender
// citas. Devuelve { error: string|null } — null si todo OK.
async function validateDoctor(doctorId) {
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
        return { error: 'doctor_id inválido' };
    }
    const doctor = await Usuario.findById(doctorId).select('rol active').lean();
    if (!doctor) return { error: 'Doctor no encontrado' };
    if (doctor.active === false) return { error: 'El doctor está desactivado' };
    if (!DOCTOR_ROLES.has(doctor.rol)) {
        return { error: 'El usuario seleccionado no puede atender citas' };
    }
    return { error: null };
}

// Valida que el paciente exista y no esté eliminado.
async function validatePatient(patientId) {
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
        return { error: 'paciente_id inválido' };
    }
    const patient = await Patient.findOne({ _id: patientId, deletedAt: null }).select('_id').lean();
    if (!patient) return { error: 'Paciente no encontrado o eliminado' };
    return { error: null };
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
            // Filtro condicional al estado de origen: si dos GET concurrentes
            // disparan transitionPastDue sobre la misma cita, sólo el primero
            // matchea (la deja en 'Pasada') y el segundo no encuentra documento
            // → no se duplica la entrada de auto-transición en estadoHistorial.
            bulk.find({ _id: id, estado: from }).updateOne({
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

        const { from, to, doctor_id, paciente_id, estado } = req.query;
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const filter = { deletedAt: null };
        if (from || to) {
            filter.fecha_hora = {};
            if (from) {
                const f = new Date(from);
                if (Number.isNaN(f.getTime())) return res.status(400).json({ message: "Parámetro 'from' no es una fecha válida" });
                filter.fecha_hora.$gte = f;
            }
            if (to) {
                const t = new Date(to);
                if (Number.isNaN(t.getTime())) return res.status(400).json({ message: "Parámetro 'to' no es una fecha válida" });
                filter.fecha_hora.$lte = t;
            }
        }
        if (doctor_id && mongoose.Types.ObjectId.isValid(doctor_id)) {
            filter.doctor_id = doctor_id;
        }
        // BUG-B7: filtro por paciente (evita traer todas las citas al cliente)
        if (paciente_id && mongoose.Types.ObjectId.isValid(paciente_id)) {
            filter.paciente_id = paciente_id;
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
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'ID de cita inválido' });
        }
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
        if (fecha.getTime() > Date.now() + MAX_FUTURE_MS) {
            return res.status(400).json({ message: 'La fecha está demasiado lejos en el futuro (máx 5 años).' });
        }

        // Validar que paciente y doctor existan, estén activos y el doctor
        // tenga rol válido para atender citas.
        const patientCheck = await validatePatient(paciente_id);
        if (patientCheck.error) return res.status(400).json({ message: patientCheck.error });

        const doctorCheck = await validateDoctor(doctor_id);
        if (doctorCheck.error) return res.status(400).json({ message: doctorCheck.error });

        const defaultDuration = await getDefaultDuration();
        const dur = Number.isFinite(Number(duracion)) && Number(duracion) >= 5
            ? Math.min(Number(duracion), 480)
            : defaultDuration;

        // Detección de conflictos: doctor solapado Y paciente solapado.
        // 'force' salta la del doctor (caso "agendar con conflicto") pero NO
        // la del paciente — no tiene sentido que un paciente esté en dos
        // citas a la vez bajo ninguna circunstancia.
        const patientConflict = await findPatientConflict({
            patientId: paciente_id,
            fecha,
            duracion: dur
        });
        if (patientConflict) {
            return res.status(409).json({
                message: 'El paciente ya tiene una cita en ese horario',
                conflictType: 'patient',
                conflict: {
                    _id: patientConflict._id,
                    fecha_hora: patientConflict.fecha_hora,
                    duracion: patientConflict.duracion || defaultDuration,
                    motivo: patientConflict.motivo
                }
            });
        }

        if (!force) {
            const conflict = await findConflict({ doctorId: doctor_id, fecha, duracion: dur });
            if (conflict) {
                return res.status(409).json({
                    message: 'El doctor ya tiene una cita en ese horario',
                    conflictType: 'doctor',
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
        // E11000 del índice único parcial: el race TOCTOU se materializó.
        // El controller ya hizo las validaciones de conflicto a nivel app,
        // pero dos requests simultáneos pueden haberlas pasado ambas; aquí
        // atrapamos el caso de minuto-exacto y devolvemos 409 consistente.
        if (error?.code === 11000 && /doctor_slot_unique_active/.test(error.message || '')) {
            return res.status(409).json({
                message: 'El doctor ya tiene una cita exactamente a esa hora (índice único).',
                conflictType: 'doctor'
            });
        }
        res.status(400).json({ message: 'Error al crear la cita', error: error.message });
    }
};

// PUT /appointments/:id
exports.updateAppointment = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'ID de cita inválido' });
        }
        const existing = await Appointment.findOne({ _id: req.params.id, deletedAt: null });
        if (!existing) return res.status(404).json({ message: 'Cita no encontrada' });

        const { paciente_id, doctor_id, fecha_hora, estado, motivo, observaciones, comentarioProcedimiento, items, duracion, force } = req.body;

        // Una cita en estado terminal (Pasada/NoShow/Cancelada) no se puede
        // editar: reagendarla al futuro o cambiarle doctor/duración/items la
        // "revive" saltándose TRANSITION_MATRIX (que sólo se consulta cuando el
        // body trae `estado`) y corrompe el historial clínico/NOM-024. Sólo se
        // permite si el ÚNICO cambio es una transición de estado válida — y como
        // los estados cerrados no tienen ninguna en TRANSITION_MATRIX, esto
        // bloquea de facto cualquier edición. Consistente con deleteAppointment.
        if (ESTADOS_CERRADOS.includes(existing.estado)) {
            const soloTransicionValida =
                estado !== undefined && estado !== existing.estado &&
                (TRANSITION_MATRIX[existing.estado] || []).includes(estado) &&
                paciente_id === undefined && doctor_id === undefined &&
                fecha_hora === undefined && duracion === undefined && items === undefined;
            if (!soloTransicionValida) {
                return res.status(409).json({
                    message: 'No se puede editar una cita cerrada (Pasada, No-Show o Cancelada). Cree una nueva cita.'
                });
            }
        }

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
            if (fechaCambia && newFecha.getTime() > Date.now() + MAX_FUTURE_MS) {
                return res.status(400).json({ message: 'La fecha está demasiado lejos en el futuro (máx 5 años).' });
            }
            allowedFields.fecha_hora = newFecha;
        }

        if (duracion !== undefined) {
            const d = Number(duracion);
            if (Number.isFinite(d) && d >= 5 && d <= 480) {
                allowedFields.duracion = d;
            }
        }

        // ── Validar existencia/rol si cambió paciente_id o doctor_id ──
        if (allowedFields.paciente_id !== undefined) {
            const patientCheck = await validatePatient(allowedFields.paciente_id);
            if (patientCheck.error) return res.status(400).json({ message: patientCheck.error });
        }
        if (allowedFields.doctor_id !== undefined) {
            const doctorCheck = await validateDoctor(allowedFields.doctor_id);
            if (doctorCheck.error) return res.status(400).json({ message: doctorCheck.error });
        }

        // ── Validar conflictos si cambió fecha/doctor/paciente/duracion ──
        const checkConflict = (
            allowedFields.fecha_hora !== undefined ||
            allowedFields.doctor_id !== undefined ||
            allowedFields.paciente_id !== undefined ||
            allowedFields.duracion !== undefined
        );
        if (checkConflict) {
            const fechaFinal = allowedFields.fecha_hora || existing.fecha_hora;
            const doctorFinal = allowedFields.doctor_id || existing.doctor_id;
            const patientFinal = allowedFields.paciente_id || existing.paciente_id;
            const duracionFinal = allowedFields.duracion || existing.duracion || (await getDefaultDuration());

            // Conflicto de paciente: SIEMPRE se valida (force no aplica).
            const patientConflict = await findPatientConflict({
                patientId: patientFinal,
                fecha: fechaFinal,
                duracion: duracionFinal,
                excludeId: existing._id
            });
            if (patientConflict) {
                return res.status(409).json({
                    message: 'El paciente ya tiene una cita en ese horario',
                    conflictType: 'patient',
                    conflict: {
                        _id: patientConflict._id,
                        fecha_hora: patientConflict.fecha_hora,
                        duracion: patientConflict.duracion || 30,
                        motivo: patientConflict.motivo
                    }
                });
            }

            // Conflicto de doctor: se puede saltar con force.
            if (!force) {
                const conflict = await findConflict({
                    doctorId: doctorFinal,
                    fecha: fechaFinal,
                    duracion: duracionFinal,
                    excludeId: existing._id
                });
                if (conflict) {
                    return res.status(409).json({
                        message: 'El doctor ya tiene una cita en ese horario',
                        conflictType: 'doctor',
                        conflict: {
                            _id: conflict._id,
                            fecha_hora: conflict.fecha_hora,
                            duracion: conflict.duracion || 30,
                            motivo: conflict.motivo
                        }
                    });
                }
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

        // ── Procesar items (sin mutar PatientCharge aún) ──
        // La sincronización con PatientCharge se hace DESPUÉS del save de la
        // cita para evitar dejar el cobro modificado si el save falla
        // (state transition inválida, validators, etc.). Aquí sólo validamos
        // y armamos los valores que se van a aplicar.
        let chargeOpAfterSave = null; // { type: 'cancel'|'updateItems', payload }
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
                chargeOpAfterSave = { type: 'cancel' };
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
                chargeOpAfterSave = { type: 'updateItems', payload: { items: processedItems, total: totalEstimado } };
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

        // ── Aplicar update + sincronizar PatientCharge de forma ATÓMICA ─────
        // Antes la cita se guardaba y, si la sincronización del cobro fallaba,
        // se respondía 200 con warning dejando el cobro inconsistente (p.ej.
        // cita Cancelada pero cobro vivo con saldo pendiente → cobro indebido).
        // Ahora ambos se envuelven en una transacción. Fallback standalone (sin
        // replica set): se cae a la escritura secuencial degradada con warnings
        // (mismo comportamiento que antes; sin atomicidad real pero sin 500).
        let updatedAppointment = null;
        const chargeWarnings = [];

        // Sincroniza el PatientCharge ligado a la cita. Con `throwOnError` (modo
        // transacción) propaga el error para abortar la tx; sin él (modo
        // degradado) acumula un warning y continúa.
        const syncCharge = async (session, throwOnError) => {
            const opts = session ? { session } : {};
            if (chargeOpAfterSave?.type === 'cancel') {
                try {
                    await PatientCharge.findOneAndUpdate(
                        { appointmentId: req.params.id, confirmado: false, cancelado: { $ne: true } },
                        { $set: { cancelado: true, canceladoEn: new Date(), canceladoPor: req.user?.id || null, canceladoMotivo: 'Items de la cita removidos' } },
                        opts
                    );
                } catch (chargeErr) {
                    if (throwOnError) throw chargeErr;
                    console.error('[updateAppointment] Fallo al cancelar charge:', chargeErr);
                    chargeWarnings.push('Items actualizados pero el cobro asociado no se canceló — reintenta');
                }
            } else if (chargeOpAfterSave?.type === 'updateItems') {
                try {
                    // El hook pre('save') que recalcula totalPagado/saldoPendiente
                    // NO corre en findOneAndUpdate, así que la invariante
                    // saldoPendiente = max(0, total - pagado) se mantiene a mano.
                    const linked = await PatientCharge.findOne(
                        { appointmentId: req.params.id, confirmado: false, cancelado: { $ne: true } }
                    ).select('totalPagado').session(session || null);

                    const totalPagado = round2(linked?.totalPagado || 0);

                    if (totalPagado > 0) {
                        // Cobro con pagos: NO se reescriben los conceptos facturados
                        // (corromperia la contabilidad). Ajuste desde el expediente.
                        chargeWarnings.push('La cita tiene un cobro con pagos registrados; sus conceptos NO se modificaron. Ajusta el cobro desde el expediente del paciente.');
                    } else {
                        const newTotal = round2(chargeOpAfterSave.payload.total);
                        await PatientCharge.findOneAndUpdate(
                            { appointmentId: req.params.id, confirmado: false, cancelado: { $ne: true } },
                            { $set: { items: chargeOpAfterSave.payload.items, total: newTotal, saldoPendiente: round2(Math.max(0, newTotal - totalPagado)) } },
                            { runValidators: true, ...opts }
                        );
                    }
                } catch (chargeErr) {
                    if (throwOnError) throw chargeErr;
                    console.error('[updateAppointment] Fallo al actualizar charge items:', chargeErr);
                    chargeWarnings.push('Items de la cita actualizados pero el cobro asociado no — reintenta');
                }
            }

            // Cancelar cobro si pasó a Cancelada/NoShow
            if (allowedFields.estado === 'Cancelada' || allowedFields.estado === 'NoShow') {
                try {
                    await PatientCharge.findOneAndUpdate(
                        { appointmentId: req.params.id, confirmado: false, cancelado: { $ne: true } },
                        { $set: { cancelado: true, canceladoEn: new Date(), canceladoPor: req.user?.id || null, canceladoMotivo: allowedFields.estado === 'NoShow' ? 'Paciente no se presentó' : 'Cita cancelada' } },
                        opts
                    );
                } catch (chargeErr) {
                    if (throwOnError) throw chargeErr;
                    console.error('[updateAppointment] Fallo al cancelar charge tras transición:', chargeErr);
                    chargeWarnings.push('Cita cancelada pero el cobro asociado quedó vivo — cancélelo manualmente');
                }
            }
        };

        const applyUpdate = async (session) => {
            const opts = session
                ? { new: true, runValidators: true, session }
                : { new: true, runValidators: true };
            updatedAppointment = await Appointment.findOneAndUpdate(
                { _id: req.params.id, deletedAt: null }, update, opts
            );
            if (!updatedAppointment) {
                const notFound = new Error('APPOINTMENT_NOT_FOUND');
                notFound.__notFound = true;
                throw notFound;
            }
            await syncCharge(session, !!session);
        };

        const isStandaloneTxError = (err) => {
            const msg = String(err?.message || '');
            return (
                err?.codeName === 'IllegalOperation' ||
                err?.code === 20 ||
                msg.includes('Transaction numbers are only allowed on a replica set') ||
                msg.includes('Transactions are not supported')
            );
        };

        const session = await mongoose.startSession();
        try {
            try {
                await session.withTransaction(async () => {
                    chargeWarnings.length = 0; // por si la tx reintenta internamente
                    await applyUpdate(session);
                });
            } catch (txErr) {
                if (txErr?.__notFound) {
                    return res.status(404).json({ message: 'Cita no encontrada' });
                }
                if (isStandaloneTxError(txErr)) {
                    // Sin replica set: camino secuencial degradado (charge falla →
                    // warning, no revierte la cita) — igual que el comportamiento previo.
                    chargeWarnings.length = 0;
                    try {
                        await applyUpdate(null);
                    } catch (seqErr) {
                        if (seqErr?.__notFound) {
                            return res.status(404).json({ message: 'Cita no encontrada' });
                        }
                        throw seqErr;
                    }
                } else {
                    throw txErr;
                }
            }
        } finally {
            session.endSession();
        }

        const populated = await Appointment.findById(updatedAppointment._id)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS);

        res.status(200).json({
            message: 'Cita modificada correctamente',
            appointment: populated,
            ...(chargeWarnings.length > 0 ? { warnings: chargeWarnings } : {})
        });

    } catch (error) {
        // E11000 del índice único parcial (doctor_slot_unique_active) — race
        // que escapó la validación de conflicto: respondemos 409, no 400.
        if (error?.code === 11000 && /doctor_slot_unique_active/.test(error.message || '')) {
            return res.status(409).json({
                message: 'El doctor ya tiene una cita exactamente a esa hora (índice único).',
                conflictType: 'doctor'
            });
        }
        res.status(400).json({ message: 'Error al actualizar la cita', error: error.message });
    }
};

// PATCH /appointments/:id/status — transición de estado ligera con audit
exports.updateAppointmentStatus = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'ID de cita inválido' });
        }
        const { estado, motivo } = req.body || {};
        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ message: `Estado inválido: ${estado}` });
        }

        const existing = await Appointment.findOne({ _id: req.params.id, deletedAt: null });
        if (!existing) return res.status(404).json({ message: 'Cita no encontrada' });

        if (existing.estado === estado) {
            return res.status(200).json({ message: 'Sin cambios', appointment: existing });
        }

        const desde = existing.estado;
        const allowed = TRANSITION_MATRIX[desde] || [];
        if (!allowed.includes(estado)) {
            return res.status(400).json({
                message: `Transición no permitida: ${desde} → ${estado}`
            });
        }

        // Para Cancelada / NoShow exigir motivo
        if ((estado === 'Cancelada' || estado === 'NoShow') && (!motivo || String(motivo).trim().length < 3)) {
            return res.status(400).json({ message: 'Debe indicar el motivo (mínimo 3 caracteres)' });
        }

        // Entrada de bitácora de la transición.
        const historyEntry = {
            desde,
            hacia: estado,
            cambiadoEn: new Date(),
            cambiadoPor: req.user?.id || null,
            motivo: motivo ? String(motivo).trim() : null
        };

        // Al terminar la consulta (→ Pasada), achicar la duración a los minutos
        // reales transcurridos. Sólo encogemos, no extendemos; respetamos el
        // piso `duracion.min = 5` del schema (si terminó en <5 min, no se toca).
        const setFields = { estado, modificadoPor: req.user?.id || null, modificadoEn: new Date() };
        if (estado === 'Pasada' && existing.fecha_hora) {
            const elapsedMs = Date.now() - new Date(existing.fecha_hora).getTime();
            if (elapsedMs > 0) {
                const elapsedMin = Math.ceil(elapsedMs / 60_000);
                if (elapsedMin >= 5 && (!existing.duracion || elapsedMin < existing.duracion)) {
                    const note = `Duración ajustada de ${existing.duracion} a ${elapsedMin} min (consulta terminada antes)`;
                    historyEntry.motivo = historyEntry.motivo ? `${historyEntry.motivo} — ${note}` : note;
                    setFields.duracion = elapsedMin;
                }
            }
        }

        // Transición ATÓMICA condicionada al estado de origen: si dos requests
        // concurrentes intentan la misma transición (doble click), sólo UNA
        // matchea `estado: desde`; la otra recibe null y se trata como "Sin
        // cambios", evitando entradas duplicadas en estadoHistorial (NOM-024).
        // Antes era findOne → existing.save(), no atómico: ambos $push aplicaban.
        const updated = await Appointment.findOneAndUpdate(
            { _id: req.params.id, deletedAt: null, estado: desde },
            { $set: setFields, $push: { estadoHistorial: historyEntry } },
            { new: true, runValidators: true }
        );
        if (!updated) {
            const fresh = await Appointment.findOne({ _id: req.params.id, deletedAt: null });
            return res.status(200).json({ message: 'Sin cambios', appointment: fresh });
        }

        // Cancelar cobro asociado si cancelado/no-show
        if (estado === 'Cancelada' || estado === 'NoShow') {
            await PatientCharge.findOneAndUpdate(
                { appointmentId: updated._id, confirmado: false, cancelado: { $ne: true } },
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

        const populated = await Appointment.findById(updated._id)
            .populate('paciente_id', PATIENT_FIELDS)
            .populate('doctor_id', DOCTOR_FIELDS);

        res.status(200).json({ message: 'Estado actualizado', appointment: populated });
    } catch (error) {
        console.error('Error en updateAppointmentStatus:', error);
        // Devolvemos error.message en `message` para que el cliente lo vea.
        // ValidationError de mongoose, errores de save(), etc. quedan visibles.
        res.status(400).json({
            message: error?.message || 'Error al cambiar estado',
            error: error?.message
        });
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
        //    y caigan en el DÍA de la cita. Sólo informativo.
        // M-10: antes la ventana era [hora_cita, hora_cita+24h), lo que dejaba
        // fuera un pago hecho minutos antes de la cita y atribuía movimientos
        // del día siguiente. Usamos los límites del día calendario (local) de la
        // cita, que es lo que el reporte pretende mostrar.
        const aptDay = new Date(apt.fecha_hora);
        const dayStart = new Date(aptDay.getFullYear(), aptDay.getMonth(), aptDay.getDate(), 0, 0, 0, 0);
        const dayEnd = new Date(aptDay.getFullYear(), aptDay.getMonth(), aptDay.getDate(), 23, 59, 59, 999);
        const directMovements = await CashMovement.find({
            patientId: apt.paciente_id,
            linkedChargeId: null,
            date: { $gte: dayStart, $lte: dayEnd }
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
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'ID de cita inválido' });
        }
        const motivoRaw = req.body?.motivo;
        // Alineado con cliente: motivo obligatorio, mínimo 5 caracteres.
        if (typeof motivoRaw !== 'string' || motivoRaw.trim().length < MIN_DELETE_REASON_LEN) {
            return res.status(400).json({
                message: `Debe indicar el motivo de eliminación (mínimo ${MIN_DELETE_REASON_LEN} caracteres)`
            });
        }
        const motivo = motivoRaw.trim();

        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
        if (appointment.deletedAt) return res.status(404).json({ message: 'Cita no encontrada' });

        // Bloquea eliminar citas cerradas que tengan cobro CONFIRMADO — la
        // contabilidad ya quedó consolidada y borrar la cita dejaría el cobro
        // apuntando a un appointment huérfano (envenena auditoría). Para
        // estos casos hay que cancelar el cobro primero.
        if (ESTADOS_CERRADOS.includes(appointment.estado)) {
            const confirmedCharge = await PatientCharge.findOne({
                appointmentId: appointment._id,
                confirmado: true,
                cancelado: { $ne: true }
            }).select('_id').lean();
            if (confirmedCharge) {
                return res.status(409).json({
                    message: 'No se puede eliminar una cita cerrada con cobro confirmado. Cancela el cobro antes.'
                });
            }
        }

        appointment.deletedAt = new Date();
        appointment.deletedBy = req.user?.id || null;
        appointment.deleteReason = motivo;
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
