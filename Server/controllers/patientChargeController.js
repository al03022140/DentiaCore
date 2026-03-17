const PatientCharge = require('../models/patientCharge');
const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const mongoose = require('mongoose');

const CONFIRM_PHRASE = 'CONFIRMO';

// GET /patient-charges  — todos los cobros (filtrable por pendingOnly)
exports.getAllCharges = async (req, res) => {
  try {
    const query = {};
    if (req.query.pendingOnly === 'true') {
      query.saldoPendiente = { $gt: 0 };
    }
    const charges = await PatientCharge.find(query)
      .sort({ fecha: -1 })
      .limit(100)
      .populate('patientId', 'nombre apellidos foto fecha_nacimiento')
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('creadoPor', 'nombre');
    res.json(charges);
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

    const charge = new PatientCharge({
      patientId,
      appointmentId: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : null,
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

    // Crear CashMovement
    const conceptItems = charge.items.map(i => i.nombre).join(', ');
    const movement = new CashMovement({
      amount,
      type: 'INCOME',
      paymentMethod,
      concept: `Pago cobro paciente — ${conceptItems}`,
      date: new Date(),
      patientId: charge.patientId,
      boxSessionId: activeSession._id,
      creadoPor: req.user?.id || null
    });
    await movement.save();

    // Agregar pago al cobro
    charge.pagos.push({
      monto: amount,
      fecha: new Date(),
      paymentMethod,
      cashMovementId: movement._id,
      registradoPor: req.user?.id || null
    });
    await charge.save();

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
