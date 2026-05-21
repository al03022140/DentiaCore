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
      const nombre = typeof item.nombre === 'string' ? item.nombre.trim() : '';
      const cantidad = Number(item.cantidad);
      const precioUnitario = round2(Number(item.precioUnitario));
      if (!nombre || nombre.length > 120) {
        return res.status(400).json({ message: `Nombre de item inválido (1-120 caracteres): ${nombre || 'sin nombre'}` });
      }
      if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > 1000) {
        return res.status(400).json({ message: `Cantidad inválida en "${nombre}" (debe ser entre 1 y 1000)` });
      }
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0 || precioUnitario > 100_000_000) {
        return res.status(400).json({ message: `Precio inválido en "${nombre}"` });
      }
      processedItems.push({
        nombre,
        cantidad,
        precioUnitario,
        subtotal: round2(cantidad * precioUnitario)
      });
    }

    const total = round2(processedItems.reduce((sum, item) => sum + item.subtotal, 0));
    if (total <= 0) {
      return res.status(400).json({ message: 'El total del cobro debe ser mayor a $0' });
    }
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

    // Concepto del movimiento. Para 1 item incluimos el nombre; para 2 mostramos
    // ambos; para 3+ resumimos con el primero + "y N más". El sufijo con el
    // ID corto del cobro permite cuadrar contra el cobro de origen.
    const chargeRef = `#${String(charge._id).slice(-6)}`;
    let concept;
    if (charge.items.length === 0) {
      concept = `Pago cobro ${chargeRef}`;
    } else if (charge.items.length === 1) {
      concept = `Pago · ${charge.items[0].nombre} ${chargeRef}`;
    } else if (charge.items.length === 2) {
      concept = `Pago · ${charge.items[0].nombre} + ${charge.items[1].nombre} ${chargeRef}`;
    } else {
      concept = `Pago · ${charge.items[0].nombre} y ${charge.items.length - 1} más ${chargeRef}`;
    }
    // Cap a 200 chars (alineado con cashMovement.concept maxlength).
    if (concept.length > 200) concept = concept.slice(0, 197) + '...';
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
        concept,
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

    // BUG-B2: cerrar race contra closeBox. Entre que leímos la sesión OPEN y
    // creamos el CashMovement, otro request pudo cerrar la caja. Si pasó a
    // CLOSING/CLOSED, el movimiento quedó asignado a una sesión cerrada y no
    // cuenta en el corte. Revertimos.
    const sessionStillOpen = await BoxSession.exists({
      _id: activeSession._id,
      status: 'OPEN'
    });
    if (!sessionStillOpen) {
      try { await CashMovement.deleteOne({ _id: movement._id }); }
      catch (rbErr) { console.error('CRITICAL: rollback CashMovement falló:', { movementId: movement._id, rbErr }); }
      return res.status(409).json({
        message: 'La caja se cerró durante el registro. Reintente cuando la caja esté abierta de nuevo.'
      });
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
// Soft-delete del cobro. Comportamiento sobre los pagos ya registrados:
//   - reversePayments=false (default, legacy): los CashMovement NO se tocan.
//     Los pagos quedan en caja como ingresos reales y los movimientos quedan
//     editables manualmente para que el operador decida.
//   - reversePayments=true: por cada pago se genera un CashMovement EXPENSE
//     compensatorio (mismo amount, mismo paymentMethod) en la caja OPEN
//     actual, dejando trazabilidad de la reversa en el audit trail.
// Idempotencia: usa findOneAndUpdate con condición `cancelado != true` para
// evitar que dos cancelaciones concurrentes sobreescriban canceladoPor/Motivo.
exports.cancelCharge = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido' });
    }
    const { chargeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: 'ID de cobro inválido' });
    }

    const { motivo, confirmacion, reversePayments } = req.body;
    if (!confirmacion || confirmacion.trim() !== CONFIRM_PHRASE) {
      return res.status(400).json({ message: 'Debe escribir CONFIRMO para cancelar el cobro' });
    }
    if (typeof motivo !== 'string' || motivo.trim().length < 3) {
      return res.status(400).json({ message: 'Debe indicar el motivo de cancelación (mínimo 3 caracteres)' });
    }

    const motivoTrim = motivo.trim();
    const wantsReverse = reversePayments === true || reversePayments === 'true';

    // Cancelar de forma idempotente: el doc sólo se modifica si aún no estaba
    // cancelado. Si pierde el race, devuelve null y respondemos 400.
    const charge = await PatientCharge.findOneAndUpdate(
      { _id: chargeId, cancelado: { $ne: true } },
      {
        $set: {
          cancelado: true,
          canceladoEn: new Date(),
          canceladoPor: req.user.id,
          canceladoMotivo: motivoTrim
        }
      },
      { new: true }
    );
    if (!charge) {
      // Diferenciar 404 vs 400 (ya cancelado).
      const existed = await PatientCharge.exists({ _id: chargeId });
      if (!existed) return res.status(404).json({ message: 'Cobro no encontrado' });
      return res.status(400).json({ message: 'El cobro ya está cancelado' });
    }

    // Reverso opcional de los pagos a la caja OPEN actual.
    const reversedMovementIds = [];
    if (wantsReverse && Array.isArray(charge.pagos) && charge.pagos.length > 0) {
      const activeSession = await BoxSession.findOne({ status: 'OPEN' });
      if (!activeSession) {
        // Ya cancelamos el cobro; informamos al operador que el reverso quedó
        // pendiente. No revertimos la cancelación porque eso sería peor UX.
        return res.json({
          charge,
          reverseStatus: 'skipped',
          reverseMessage: 'Cobro cancelado pero los pagos NO se revirtieron a caja (no hay sesión abierta).'
        });
      }

      const chargeRef = `#${String(charge._id).slice(-6)}`;
      for (const pago of charge.pagos) {
        try {
          const expense = await CashMovement.create({
            amount: round2(pago.monto),
            type: 'EXPENSE',
            paymentMethod: pago.paymentMethod,
            concept: `Reverso pago ${chargeRef} · ${motivoTrim}`.slice(0, 200),
            date: new Date(),
            patientId: charge.patientId,
            boxSessionId: activeSession._id,
            linkedChargeId: charge._id,
            creadoPor: req.user.id
          });
          reversedMovementIds.push(expense._id);
        } catch (revErr) {
          // Loguear y continuar — los pagos restantes deben intentar revertirse.
          console.error('[cancelCharge] Error revirtiendo pago:', { chargeId, pagoId: pago._id, revErr });
        }
      }
    }

    const populated = await PatientCharge.findById(charge._id)
      .populate('appointmentId', 'fecha_hora motivo estado')
      .populate('pagos.registradoPor', 'nombre')
      .populate('creadoPor', 'nombre')
      .populate('canceladoPor', 'nombre');

    res.json({
      charge: populated,
      reverseStatus: wantsReverse ? (reversedMovementIds.length > 0 ? 'reversed' : 'not_needed') : 'kept',
      reversedMovementIds
    });
  } catch (error) {
    console.error('Error al cancelar cobro:', error);
    res.status(500).json({ message: 'Error al cancelar el cobro' });
  }
};
