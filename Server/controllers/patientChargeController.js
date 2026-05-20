const PatientCharge = require('../models/patientCharge');
const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const mongoose = require('mongoose');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');

const CONFIRM_PHRASE = 'CONFIRMO';

// GET /patient-charges  — todos los cobros (filtrable por pendingOnly)
exports.getAllCharges = async (req, res) => {
  try {
    const query = { cancelado: { $ne: true } };
    if (req.query.pendingOnly === 'true') {
      query.saldoPendiente = { $gt: 0 };
    }
    const charges = await PatientCharge.find(query)
      .sort({ fecha: -1 })
      .limit(100)
      .populate('patientId', 'primer_nombre apellido_paterno otros_nombres apellido_materno photoURL fecha_nacimiento')
      .populate('appointmentId', 'fecha_hora motivo estado deletedAt')
      .populate('creadoPor', 'nombre')
      .lean();

    // Filtrar cobros cuyo appointment fue soft-deleted o cancelado y el cobro
    // no está confirmado — son huérfanos que el frontend no debe mostrar.
    const filtered = charges.filter(c => {
      if (!c.appointmentId) return true;
      if (c.confirmado) return true;
      if (c.appointmentId.deletedAt) return false;
      if (c.appointmentId.estado === 'Cancelada') return false;
      return true;
    });

    // Si pidieron pendingOnly, priorizar por fecha de la cita asc (más antiguo
    // primero) y luego por fecha de creación. Sin cita → al final.
    if (req.query.pendingOnly === 'true') {
      filtered.sort((a, b) => {
        const da = a.appointmentId?.fecha_hora ? new Date(a.appointmentId.fecha_hora).getTime() : Infinity;
        const db = b.appointmentId?.fecha_hora ? new Date(b.appointmentId.fecha_hora).getTime() : Infinity;
        if (da !== db) return da - db;
        return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      });
    }

    res.json(filtered);
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
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('pagos.registradoPor', 'nombre')
      .populate('creadoPor', 'nombre');

    res.json(charges);
  } catch (error) {
    console.error('Error al obtener cobros:', error);
    res.status(500).json({ message: 'Error al obtener cobros del paciente' });
  }
};

// POST /patient-charges/:patientId
exports.createCharge = async (req, res) => {
  try {
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

    // Validar y calcular subtotales
    const processedItems = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      const precioUnitario = Number(item.precioUnitario);
      if (!item.nombre || !Number.isFinite(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
        return res.status(400).json({ message: `Item inválido: ${item.nombre || 'sin nombre'}` });
      }
      processedItems.push({
        nombre: String(item.nombre).trim(),
        cantidad,
        precioUnitario,
        subtotal: cantidad * precioUnitario
      });
    }

    const total = processedItems.reduce((sum, item) => sum + item.subtotal, 0);

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
      creadoPor: req.user?.id || null
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
exports.addPayment = async (req, res) => {
  try {
    const { chargeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: 'ID de cobro inválido' });
    }

    const { monto, paymentMethod, confirmacion } = req.body;

    if (!confirmacion || confirmacion.trim() !== CONFIRM_PHRASE) {
      return res.status(400).json({ message: 'Debe escribir CONFIRMO para registrar el pago' });
    }

    const amount = Number(monto);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'El monto debe ser un número positivo' });
    }

    if (!['CASH', 'DIGITAL'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Método de pago inválido' });
    }

    const charge = await PatientCharge.findById(chargeId);
    if (!charge) {
      return res.status(404).json({ message: 'Cobro no encontrado' });
    }

    if (amount > charge.saldoPendiente) {
      return res.status(400).json({
        message: `El monto excede el saldo pendiente ($${charge.saldoPendiente.toFixed(2)})`
      });
    }

    // Verificar sesión de caja abierta
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'Debe abrir la caja antes de registrar pagos' });
    }

    // Concepto compacto: primer ítem + " +N" si hay más. El detalle completo
    // queda en el cobro mismo.
    const firstItem = charge.items[0]?.nombre || 'Servicios';
    const extra = charge.items.length > 1 ? ` +${charge.items.length - 1}` : '';
    const now = new Date();

    // Transacción: CashMovement + charge.save deben ser atómicos. Antes,
    // si charge.save fallaba, el CashMovement ya estaba persistido sin
    // reflejo en saldoPendiente — la caja del día quedaba inflada con un
    // INCOME huérfano.
    const session = await mongoose.startSession();
    let savedMovementId = null;
    try {
      await session.withTransaction(async () => {
        const [movement] = await CashMovement.create([{
          amount,
          type: 'INCOME',
          paymentMethod,
          concept: `Pago cobro · ${firstItem}${extra}`,
          date: now,
          patientId: charge.patientId,
          boxSessionId: activeSession._id,
          linkedChargeId: charge._id,
          creadoPor: req.user?.id || null
        }], { session });
        savedMovementId = movement._id;

        charge.pagos.push({
          monto: amount,
          fecha: now,
          paymentMethod,
          cashMovementId: movement._id,
          registradoPor: req.user?.id || null
        });
        await charge.save({ session });
      });
    } catch (txError) {
      console.error('Error en transacción de pago:', txError);
      return res.status(500).json({ message: 'Error al registrar pago: la operación se revirtió.' });
    } finally {
      session.endSession();
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
