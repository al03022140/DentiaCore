const PatientCharge = require('../models/patientCharge');
const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const mongoose = require('mongoose');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');

const CONFIRM_PHRASE = 'CONFIRMO';
const round2 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// GET /patient-charges  — paginado. ?pendingOnly=true filtra saldoPendiente > 0
exports.getAllCharges = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);

    const query = { cancelado: { $ne: true } };
    if (req.query.pendingOnly === 'true') {
      query.saldoPendiente = { $gt: 0 };
    }

    const [charges, total] = await Promise.all([
      PatientCharge.find(query)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(limit)
        .populate('patientId', 'primer_nombre apellido_paterno otros_nombres apellido_materno photoURL fecha_nacimiento')
        .populate('appointmentId', 'fecha_hora motivo estado deletedAt')
        .populate('creadoPor', 'nombre')
        .lean(),
      PatientCharge.countDocuments(query)
    ]);

    // Filtrar cobros cuyo appointment fue soft-deleted o cancelado y el cobro
    // no está confirmado — son huérfanos que el frontend no debe mostrar.
    const filtered = charges.filter(c => {
      if (!c.appointmentId) return true;
      if (c.confirmado) return true;
      if (c.appointmentId.deletedAt) return false;
      if (c.appointmentId.estado === 'Cancelada') return false;
      return true;
    });

    if (req.query.pendingOnly === 'true') {
      filtered.sort((a, b) => {
        const da = a.appointmentId?.fecha_hora ? new Date(a.appointmentId.fecha_hora).getTime() : Infinity;
        const db = b.appointmentId?.fecha_hora ? new Date(b.appointmentId.fecha_hora).getTime() : Infinity;
        if (da !== db) return da - db;
        return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      });
    }

    res.json({ charges: filtered, total, limit, skip });
  } catch (error) {
    console.error('Error al obtener cobros:', error);
    res.status(500).json({ message: 'Error al obtener cobros' });
  }
};

// GET /patient-charges/:patientId
exports.getChargesByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'ID de paciente inválido' });
    }

    const charges = await PatientCharge.find({ patientId })
      .sort({ fecha: -1 })
      .limit(500)
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('pagos.registradoPor', 'nombre')
      .populate('creadoPor', 'nombre')
      .populate('canceladoPor', 'nombre');

    res.json(charges);
  } catch (error) {
    console.error('Error al obtener cobros:', error);
    res.status(500).json({ message: 'Error al obtener cobros del paciente' });
  }
};

// POST /patient-charges/:patientId
exports.createCharge = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido' });
    }
    const { patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'ID de paciente inválido' });
    }

    const { items, appointmentId, fecha, confirmacion } = req.body;

    if (!confirmacion || confirmacion.trim() !== CONFIRM_PHRASE) {
      return res.status(400).json({ message: 'Debe escribir CONFIRMO para registrar el cobro' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Debe incluir al menos un item' });
    }

    // Validar y calcular subtotales con redondeo a 2 decimales
    const processedItems = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      const precioUnitario = round2(Number(item.precioUnitario));
      if (!item.nombre || !Number.isFinite(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
        return res.status(400).json({ message: `Item inválido: ${item.nombre || 'sin nombre'}` });
      }
      processedItems.push({
        nombre: String(item.nombre).trim(),
        cantidad,
        precioUnitario,
        subtotal: round2(cantidad * precioUnitario)
      });
    }

    const total = round2(processedItems.reduce((sum, item) => sum + item.subtotal, 0));
    if (total > 100_000_000) {
      return res.status(400).json({ message: 'Total del cobro excede el límite permitido' });
    }

    // Valida pertenencia de appointment al paciente — evita cobros
    // vinculados a citas de otro paciente (cross-linking en auditoría).
    const validatedAppointmentId = await resolvePatientAppointmentId(appointmentId, patientId);

    const charge = new PatientCharge({
      patientId,
      appointmentId: validatedAppointmentId,
      fecha: fecha || new Date(),
      items: processedItems,
      total,
      confirmado: true,
      creadoPor: req.user.id
    });

    await charge.save();

    const populated = await PatientCharge.findById(charge._id)
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('creadoPor', 'nombre');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error al crear cobro:', error);
    res.status(400).json({ message: error.message || 'Error al crear cobro' });
  }
};

// POST /patient-charges/:chargeId/payment
// Saga compensatoria (NO usa Mongo transactions — instalación standalone
// no soporta replica set). Crea el CashMovement, lo agrega al cobro y, si
// falla la persistencia del cobro, elimina el movimiento ya creado.
exports.addPayment = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido' });
    }

    const { chargeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: 'ID de cobro inválido' });
    }

    const { monto, paymentMethod, confirmacion } = req.body;

    if (!confirmacion || confirmacion.trim() !== CONFIRM_PHRASE) {
      return res.status(400).json({ message: 'Debe escribir CONFIRMO para registrar el pago' });
    }

    const amount = round2(Number(monto));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'El monto debe ser un número positivo' });
    }
    if (amount > 100_000_000) {
      return res.status(400).json({ message: 'Monto excede el límite permitido' });
    }

    if (!['CASH', 'DIGITAL'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Método de pago inválido' });
    }

    const charge = await PatientCharge.findById(chargeId);
    if (!charge) {
      return res.status(404).json({ message: 'Cobro no encontrado' });
    }

    // BUG-4: no aceptar pagos a cobros cancelados
    if (charge.cancelado) {
      return res.status(400).json({ message: 'Cobro cancelado: no se aceptan pagos' });
    }

    if (amount > charge.saldoPendiente) {
      return res.status(400).json({
        message: `El monto excede el saldo pendiente ($${charge.saldoPendiente.toFixed(2)})`
      });
    }

    // Sólo permitir pagos con caja OPEN (no CLOSING/CLOSED)
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'Debe abrir la caja antes de registrar pagos' });
    }

    const firstItem = charge.items[0]?.nombre || 'Servicios';
    const extra = charge.items.length > 1 ? ` +${charge.items.length - 1}` : '';
    const now = new Date();

    // Saga compensatoria (BUG-5: no usamos Mongo tx porque la instalación
    // standalone no tiene replica set). Si charge.save() falla, borramos
    // el CashMovement para evitar caja inflada con INCOME huérfano.
    let movement;
    try {
      movement = await CashMovement.create({
        amount,
        type: 'INCOME',
        paymentMethod,
        concept: `Pago cobro · ${firstItem}${extra}`,
        date: now,
        patientId: charge.patientId,
        boxSessionId: activeSession._id,
        linkedChargeId: charge._id,
        creadoPor: req.user.id
      });
    } catch (movErr) {
      console.error('Error creando CashMovement de pago:', movErr);
      return res.status(500).json({ message: 'Error al registrar pago (movimiento)' });
    }

    try {
      charge.pagos.push({
        monto: amount,
        fecha: now,
        paymentMethod,
        cashMovementId: movement._id,
        registradoPor: req.user.id
      });
      await charge.save();
    } catch (chargeErr) {
      // Rollback: borrar el CashMovement ya creado.
      try {
        await CashMovement.deleteOne({ _id: movement._id });
      } catch (rollbackErr) {
        // Si esto falla, queda un CashMovement huérfano. Loguear para
        // reconciliación manual.
        console.error('CRITICAL: Rollback de CashMovement falló:', {
          movementId: movement._id,
          rollbackErr
        });
      }
      console.error('Error guardando cobro tras pago:', chargeErr);
      return res.status(500).json({ message: 'Error al registrar pago: la operación se revirtió.' });
    }

    const populated = await PatientCharge.findById(charge._id)
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('pagos.registradoPor', 'nombre')
      .populate('creadoPor', 'nombre');

    res.json(populated);
  } catch (error) {
    console.error('Error al registrar pago:', error);
    res.status(500).json({ message: error.message || 'Error al registrar pago' });
  }
};

// POST /patient-charges/:chargeId/cancel
// Soft-delete: marca el cobro como cancelado preservando los pagos ya
// registrados (los CashMovement no se tocan — fueron operaciones reales
// que entraron a la caja). Después de cancelado:
//  - El cobro deja de aparecer en getAllCharges (cancelado != true)
//  - Los pagos asociados quedan editables (updateMovement)
//  - addPayment rechaza nuevos pagos
exports.cancelCharge = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido' });
    }
    const { chargeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: 'ID de cobro inválido' });
    }

    const { motivo, confirmacion } = req.body;
    if (!confirmacion || confirmacion.trim() !== CONFIRM_PHRASE) {
      return res.status(400).json({ message: 'Debe escribir CONFIRMO para cancelar el cobro' });
    }
    if (typeof motivo !== 'string' || motivo.trim().length < 3) {
      return res.status(400).json({ message: 'Debe indicar el motivo de cancelación (mínimo 3 caracteres)' });
    }

    const charge = await PatientCharge.findById(chargeId);
    if (!charge) {
      return res.status(404).json({ message: 'Cobro no encontrado' });
    }
    if (charge.cancelado) {
      return res.status(400).json({ message: 'El cobro ya está cancelado' });
    }

    charge.cancelado = true;
    charge.canceladoEn = new Date();
    charge.canceladoPor = req.user.id;
    charge.canceladoMotivo = motivo.trim();
    await charge.save();

    const populated = await PatientCharge.findById(charge._id)
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('pagos.registradoPor', 'nombre')
      .populate('creadoPor', 'nombre')
      .populate('canceladoPor', 'nombre');

    res.json(populated);
  } catch (error) {
    console.error('Error al cancelar cobro:', error);
    res.status(500).json({ message: 'Error al cancelar el cobro' });
  }
};
