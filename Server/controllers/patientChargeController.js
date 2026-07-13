const PatientCharge = require('../models/patientCharge');
const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const mongoose = require('mongoose');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');
const logger = require('../utils/logger');

const CONFIRM_PHRASE = 'CONFIRMO';
const round2 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// Efectivo físico disponible en una sesión = inicial + (ingresos − egresos) en
// EFECTIVO. Se recalcula desde la BD para reflejar movimientos concurrentes.
// (Misma fórmula que summarizeMovements.cashOnHand en cashController.)
async function getCashOnHand(sessionId, initialAmount) {
  const movements = await CashMovement.find({ boxSessionId: sessionId });
  let cashNet = 0;
  for (const m of movements) {
    if (m.paymentMethod !== 'CASH') continue;
    cashNet += (m.type === 'INCOME' ? 1 : -1) * (Number.isFinite(m.amount) ? m.amount : 0);
  }
  return round2((Number.isFinite(initialAmount) ? initialAmount : 0) + cashNet);
}

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

    // M-7: validar la fecha del cobro. La fecha alimenta toda agregación de
    // estadísticas/ingresos; una fecha futura o muy antigua (accidental o
    // maliciosa) sesga los reportes y evade los controles de captura
    // extemporánea. Sin `fecha` → ahora. Con `fecha` → debe ser válida, no
    // futura (con 5 min de tolerancia de reloj) y no anterior a 2 años.
    let chargeDate = new Date();
    if (fecha !== undefined && fecha !== null && fecha !== '') {
      chargeDate = new Date(fecha);
      if (Number.isNaN(chargeDate.getTime())) {
        return res.status(400).json({ message: 'La fecha del cobro no es válida' });
      }
      const nowTs = Date.now();
      if (chargeDate.getTime() > nowTs + 5 * 60 * 1000) {
        return res.status(400).json({ message: 'La fecha del cobro no puede ser futura' });
      }
      if (chargeDate.getTime() < nowTs - 2 * 365 * 24 * 60 * 60 * 1000) {
        return res.status(400).json({ message: 'La fecha del cobro es demasiado antigua' });
      }
    }

    const charge = new PatientCharge({
      patientId,
      appointmentId: validatedAppointmentId,
      fecha: chargeDate,
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
      catch (rbErr) { logger.error('CRITICAL: rollback CashMovement falló (movimiento huérfano)', { movementId: movement._id, error: rbErr?.message || String(rbErr) }); }
      return res.status(409).json({
        message: 'La caja se cerró durante el registro. Reintente cuando la caja esté abierta de nuevo.'
      });
    }

    // A-6: aplicar el pago de forma ATÓMICA con guarda de saldo. El filtro
    // `saldoPendiente >= amount` garantiza que dos pagos concurrentes sobre el
    // mismo cobro no puedan sobre-cobrar: solo uno gana la carrera; el otro
    // recibe null y se revierte. Recalculamos totalPagado/saldoPendiente con
    // $round DENTRO del mismo update (las pre-save hooks no corren en
    // findOneAndUpdate, por eso el cálculo se hace explícito aquí). El $push se
    // hace vía $concatArrays, por lo que los pagos existentes nunca se alteran.
    let updatedCharge = null;
    try {
      const nuevoPago = {
        _id: new mongoose.Types.ObjectId(),
        monto: amount,
        fecha: now,
        paymentMethod,
        cashMovementId: movement._id,
        registradoPor: new mongoose.Types.ObjectId(req.user.id)
      };
      updatedCharge = await PatientCharge.findOneAndUpdate(
        { _id: charge._id, cancelado: { $ne: true }, saldoPendiente: { $gte: amount } },
        [
          {
            $set: {
              pagos: { $concatArrays: ['$pagos', [nuevoPago]] },
              totalPagado: { $round: [{ $add: ['$totalPagado', amount] }, 2] },
              saldoPendiente: {
                $round: [
                  { $max: [0, { $subtract: ['$total', { $add: ['$totalPagado', amount] }] }] },
                  2
                ]
              }
            }
          }
        ],
        { new: true }
      );
    } catch (chargeErr) {
      console.error('Error guardando cobro tras pago:', chargeErr);
      updatedCharge = null;
    }

    if (!updatedCharge) {
      // Perdió la carrera (saldo cambió / cobro cancelado) o falló el update.
      // Revertir el CashMovement ya creado para no inflar la caja.
      try {
        await CashMovement.deleteOne({ _id: movement._id });
      } catch (rollbackErr) {
        // Si esto falla, queda un CashMovement huérfano. Loguear para
        // reconciliación manual.
        logger.error('CRITICAL: Rollback de CashMovement falló (movimiento huérfano)', {
          movementId: movement._id,
          error: rollbackErr?.message || String(rollbackErr)
        });
      }
      return res.status(409).json({
        message: 'No se pudo registrar el pago: el saldo cambió o el cobro fue cancelado. Reintente.'
      });
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

    // Populate ÚNICO aquí: todos los returns de abajo (completo, parcial,
    // omitido) devuelven la misma forma de `charge`. Antes los caminos
    // parciales devolvían el doc sin populate y el frontend recibía payloads
    // distintos según el resultado del reverso.
    await charge.populate([
      { path: 'appointmentId', select: 'fecha_hora motivo estado' },
      { path: 'pagos.registradoPor', select: 'nombre' },
      { path: 'creadoPor', select: 'nombre' },
      { path: 'canceladoPor', select: 'nombre' }
    ]);

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
      let reverseInterrupted = false;
      let skippedInsufficientFunds = 0;
      let skippedOtherSession = 0;
      for (const pago of charge.pagos) {
        const monto = round2(pago.monto);
        const esEfectivo = pago.paymentMethod === 'CASH';

        // El reverso debe afectar la MISMA caja donde entró el pago. Si el
        // ingreso original pertenece a otra sesión (p.ej. una caja ya cerrada
        // de otro día), crear el EXPENSE en la caja actual descuadra AMBOS
        // cortes (el viejo conserva el INCOME, el nuevo recibe un EXPENSE sin
        // INCOME correspondiente). Antes esto sólo se evitaba para CASH (vía
        // chequeo de fondos) y NUNCA para DIGITAL. Ahora, para ambos métodos,
        // si la sesión original no es la caja OPEN actual, NO se revierte
        // automáticamente: se marca para ajuste manual. También cubre pagos sin
        // cashMovementId (no se puede determinar su sesión de origen).
        let originalSessionId = null;
        if (pago.cashMovementId) {
          const origMov = await CashMovement.findById(pago.cashMovementId).select('boxSessionId');
          originalSessionId = origMov?.boxSessionId ? String(origMov.boxSessionId) : null;
        }
        if (!originalSessionId || originalSessionId !== String(activeSession._id)) {
          skippedOtherSession++;
          continue;
        }

        // A-2: validar fondos ANTES de crear un EXPENSE en EFECTIVO. Si el
        // dinero ya no está en la caja actual (p.ej. el pago original fue en
        // una sesión anterior ya cerrada, o el efectivo se retiró), revertirlo
        // dejaría cashOnHand —y el corte— en negativo (efectivo físico
        // imposible). Los reversos DIGITALES no tocan el efectivo, así que no
        // necesitan este chequeo. El pago no revertido se informa para reverso
        // manual (ajuste explícito) en vez de corromper el balance.
        if (esEfectivo) {
          const cashOnHand = await getCashOnHand(activeSession._id, activeSession.initialAmount);
          if (cashOnHand < monto) {
            skippedInsufficientFunds++;
            continue;
          }
        }

        try {
          const expense = await CashMovement.create({
            amount: monto,
            type: 'EXPENSE',
            paymentMethod: pago.paymentMethod,
            concept: `Reverso pago ${chargeRef} · ${motivoTrim}`.slice(0, 200),
            date: new Date(),
            patientId: charge.patientId,
            boxSessionId: activeSession._id,
            linkedChargeId: charge._id,
            creadoPor: req.user.id
          });

          // A-7: cerrar el race contra closeBox. Entre la lectura de la sesión
          // OPEN y este create, otro request pudo cerrar la caja; el EXPENSE
          // quedaría atado a una sesión cerrada y no contaría en el corte,
          // corrompiendo el balance. Si pasó a CLOSING/CLOSED, revertimos este
          // movimiento y detenemos el reverso (los pagos restantes quedan
          // pendientes de reversión manual).
          const stillOpen = await BoxSession.exists({ _id: activeSession._id, status: 'OPEN' });
          if (!stillOpen) {
            try { await CashMovement.deleteOne({ _id: expense._id }); }
            catch (rbErr) { logger.error('CRITICAL: rollback reverso falló (movimiento huérfano)', { movementId: expense._id, error: rbErr?.message || String(rbErr) }); }
            reverseInterrupted = true;
            break;
          }

          // A-2 (post-insert): cerrar el race de retiros concurrentes en
          // efectivo. Si tras este EXPENSE el efectivo quedó negativo, otro
          // movimiento se intercaló — revertimos este y lo marcamos pendiente.
          if (esEfectivo) {
            const cashOnHandAfter = await getCashOnHand(activeSession._id, activeSession.initialAmount);
            if (cashOnHandAfter < 0) {
              try { await CashMovement.deleteOne({ _id: expense._id }); }
              catch (rbErr) { logger.error('CRITICAL: rollback reverso (fondos) falló (movimiento huérfano)', { movementId: expense._id, error: rbErr?.message || String(rbErr) }); }
              skippedInsufficientFunds++;
              continue;
            }
          }

          reversedMovementIds.push(expense._id);
        } catch (revErr) {
          // Loguear y continuar — los pagos restantes deben intentar revertirse.
          console.error('[cancelCharge] Error revirtiendo pago:', { chargeId, pagoId: pago._id, revErr });
        }
      }

      if (reverseInterrupted) {
        return res.json({
          charge,
          reverseStatus: 'partial',
          reverseMessage: 'Cobro cancelado. La caja se cerró durante el reverso: algunos pagos NO se revirtieron a caja. Complete el reverso manualmente con la caja abierta.',
          reversedMovementIds
        });
      }

      const skippedTotal = skippedInsufficientFunds + skippedOtherSession;
      if (skippedTotal > 0) {
        const parts = [];
        if (skippedInsufficientFunds > 0) parts.push(`${skippedInsufficientFunds} en efectivo por fondos insuficientes en la caja actual`);
        if (skippedOtherSession > 0) parts.push(`${skippedOtherSession} de una caja distinta o ya cerrada`);
        return res.json({
          charge,
          reverseStatus: 'partial',
          reverseMessage: `Cobro cancelado. ${skippedTotal} pago(s) NO se revirtieron a caja (${parts.join('; ')}). Regístrelos como ajuste manual en la caja correspondiente.`,
          reversedMovementIds
        });
      }
    }

    res.json({
      charge,
      reverseStatus: wantsReverse ? (reversedMovementIds.length > 0 ? 'reversed' : 'not_needed') : 'kept',
      reversedMovementIds
    });
  } catch (error) {
    console.error('Error al cancelar cobro:', error);
    res.status(500).json({ message: 'Error al cancelar el cobro' });
  }
};
