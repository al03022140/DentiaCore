const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const PatientCharge = require('../models/patientCharge');

// Resume un set de movimientos en buckets (income/expense × cash/digital + neto)
const summarizeMovements = (movements, initialAmount = 0) => {
  let cashIncome = 0;
  let cashExpense = 0;
  let digitalIncome = 0;
  let digitalExpense = 0;

  for (const m of movements) {
    if (m.type === 'INCOME') {
      if (m.paymentMethod === 'CASH') cashIncome += m.amount;
      else digitalIncome += m.amount;
    } else {
      if (m.paymentMethod === 'CASH') cashExpense += m.amount;
      else digitalExpense += m.amount;
    }
  }

  const cashNet = cashIncome - cashExpense;
  const digitalNet = digitalIncome - digitalExpense;

  return {
    cashIncome,
    cashExpense,
    digitalIncome,
    digitalExpense,
    cashNet,
    digitalNet,
    totalIncome: cashIncome + digitalIncome,
    totalExpense: cashExpense + digitalExpense,
    net: cashNet + digitalNet,
    // Efectivo físico disponible: monto inicial + flujo neto de efectivo
    cashOnHand: initialAmount + cashNet,
    movementCount: movements.length
  };
};

exports.getMonthlyBalance = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const movements = await CashMovement.find({
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    });

    const summary = summarizeMovements(movements);

    res.json({
      cash: summary.cashNet,
      digital: summary.digitalNet,
      total: summary.net,
      month: now.getMonth() + 1,
      year: now.getFullYear()
    });
  } catch (error) {
    console.error('Error getting monthly balance:', error);
    res.status(500).json({ message: 'Error al obtener el balance mensual' });
  }
};

// Balance de la sesión actualmente abierta — o de la última cerrada si no hay
// ninguna. Devuelve un payload uniforme para el dashboard.
exports.getSessionBalance = async (req, res) => {
  try {
    let session = await BoxSession.findOne({ status: 'OPEN' }).populate('openedBy', 'nombre');
    let isOpen = !!session;

    if (!session) {
      session = await BoxSession.findOne({ status: 'CLOSED' })
        .sort({ endTime: -1 })
        .populate('openedBy', 'nombre')
        .populate('closedBy', 'nombre');
    }

    if (!session) {
      return res.json({
        hasSession: false,
        isOpen: false,
        session: null,
        summary: summarizeMovements([], 0)
      });
    }

    const movements = await CashMovement.find({ boxSessionId: session._id });
    const summary = summarizeMovements(movements, session.initialAmount || 0);

    res.json({
      hasSession: true,
      isOpen,
      session: {
        _id: session._id,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        initialAmount: session.initialAmount,
        finalAmount: session.finalAmount,
        openedBy: session.openedBy,
        closedBy: session.closedBy
      },
      summary
    });
  } catch (error) {
    console.error('Error getting session balance:', error);
    res.status(500).json({ message: 'Error al obtener el balance de la sesión' });
  }
};

exports.getSessionStatus = async (req, res) => {
  try {
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    res.json({
      isOpen: !!activeSession,
      session: activeSession
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error checking session status' });
  }
};

exports.openBox = async (req, res) => {
  try {
    const { initialAmount } = req.body;

    const existingSession = await BoxSession.findOne({ status: 'OPEN' });
    if (existingSession) {
      return res.status(400).json({ message: 'Ya existe una caja abierta' });
    }

    const newSession = new BoxSession({
      initialAmount: Number(initialAmount) || 0,
      status: 'OPEN',
      startTime: new Date(),
      openedBy: req.user?.id || null
    });

    await newSession.save();
    res.status(201).json(newSession);
  } catch (_error) {
    res.status(500).json({ message: 'Error opening box' });
  }
};

exports.closeBox = async (req, res) => {
  try {
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'No hay caja abierta para cerrar' });
    }

    const movements = await CashMovement.find({ boxSessionId: activeSession._id });
    const summary = summarizeMovements(movements, activeSession.initialAmount);

    activeSession.status = 'CLOSED';
    activeSession.endTime = new Date();
    activeSession.finalAmount = summary.cashOnHand;
    activeSession.closedBy = req.user?.id || null;

    await activeSession.save();
    res.json({
      session: activeSession,
      summary: {
        initialAmount: activeSession.initialAmount,
        finalCashAmount: summary.cashOnHand,
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        cashIncome: summary.cashIncome,
        digitalIncome: summary.digitalIncome,
        cashExpense: summary.cashExpense,
        digitalExpense: summary.digitalExpense,
        movementCount: summary.movementCount,
        net: summary.net
      }
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error closing box' });
  }
};

exports.addMovement = async (req, res) => {
  try {
    const { amount, type, paymentMethod, concept, patientId } = req.body;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'El monto debe ser un número positivo' });
    }
    if (!['INCOME', 'EXPENSE'].includes(type)) {
      return res.status(400).json({ message: 'El tipo debe ser INCOME o EXPENSE' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ message: 'El método de pago es requerido' });
    }

    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'Debe abrir la caja antes de registrar movimientos' });
    }

    // Validar que no se retire más efectivo del disponible
    if (type === 'EXPENSE' && paymentMethod === 'CASH') {
      const movements = await CashMovement.find({ boxSessionId: activeSession._id });
      const { cashOnHand } = summarizeMovements(movements, activeSession.initialAmount);

      if (cashOnHand < amount) {
        return res.status(400).json({
          message: `Fondos insuficientes en caja. Disponible: $${cashOnHand}`
        });
      }
    }

    const movement = new CashMovement({
      amount,
      type,
      paymentMethod,
      concept,
      patientId,
      boxSessionId: activeSession._id,
      date: new Date(),
      creadoPor: req.user?.id || null
    });

    await movement.save();
    res.status(201).json(movement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error adding movement' });
  }
};

exports.getLastMovements = async (req, res) => {
  try {
    const filter = {};
    // Por defecto traemos los últimos 30 sin filtrar por sesión (permite editar
    // movimientos antiguos). Pasar ?onlyActiveSession=true para restringir.
    if (req.query.onlyActiveSession === 'true') {
      const activeSession = await BoxSession.findOne({ status: 'OPEN' });
      if (!activeSession) return res.json([]);
      filter.boxSessionId = activeSession._id;
    }

    // ?patientId=...: devuelve TODOS los movimientos del paciente
    // (sin limit) para la vista de ficha. Validado como ObjectId arriba
    // en la ruta. Cuando se filtra por paciente no aplicamos el cap de
    // 30 porque queremos un historial completo, no la "última actividad".
    const { patientId } = req.query;
    if (patientId) {
      filter.patientId = patientId;
    }

    let query = CashMovement.find(filter).sort({ date: -1 });
    if (!patientId) {
      query = query.limit(30);
    }
    const movements = await query
      .populate('patientId', 'primer_nombre apellido_paterno photoURL')
      .populate('creadoPor', 'nombre')
      .populate('edits.editedBy', 'nombre')
      .lean();

    res.json(movements);
  } catch (_error) {
    res.status(500).json({ message: 'Error fetching movements' });
  }
};

// PUT /cash/movements/:id — edición con audit trail.
// Permite cambiar amount, paymentMethod, concept y patientId. NO permite cambiar
// type (INCOME ↔ EXPENSE) ni date. Rechaza ediciones de movimientos ligados a
// un PatientCharge para no romper la consistencia del saldoPendiente.
exports.updateMovement = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, concept, patientId, reason } = req.body;

    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ message: 'Debe indicar el motivo de la edición (mínimo 3 caracteres)' });
    }

    const movement = await CashMovement.findById(id);
    if (!movement) {
      return res.status(404).json({ message: 'Movimiento no encontrado' });
    }

    // Bloquear edición si el movimiento está ligado a un cobro de paciente:
    // editar el importe rompería la suma del cobro. Si el cobro fue cancelado,
    // permitimos editar (ya no impacta saldoPendiente).
    let linkedCharge = null;
    if (movement.linkedChargeId) {
      linkedCharge = await PatientCharge.findById(movement.linkedChargeId).select('cancelado');
    } else {
      linkedCharge = await PatientCharge.findOne({ 'pagos.cashMovementId': movement._id }).select('cancelado _id');
    }
    if (linkedCharge && !linkedCharge.cancelado) {
      return res.status(400).json({
        message: 'Este movimiento corresponde a un pago de cobro y no se puede editar. Anule el pago desde el cobro del paciente.'
      });
    }

    const changes = {};
    const nextAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
    const nextPaymentMethod = typeof paymentMethod === 'string' ? paymentMethod : null;
    const nextConcept = typeof concept === 'string' ? concept.trim() : null;
    const nextPatientId = patientId === null ? null : (typeof patientId === 'string' && patientId ? patientId : undefined);

    if (nextAmount !== null && nextAmount > 0 && nextAmount !== movement.amount) {
      changes.amount = { from: movement.amount, to: nextAmount };
    }
    if (nextPaymentMethod && ['CASH', 'DIGITAL'].includes(nextPaymentMethod) && nextPaymentMethod !== movement.paymentMethod) {
      changes.paymentMethod = { from: movement.paymentMethod, to: nextPaymentMethod };
    }
    if (nextConcept && nextConcept !== movement.concept) {
      changes.concept = { from: movement.concept, to: nextConcept };
    }
    if (nextPatientId !== undefined) {
      const fromId = movement.patientId ? String(movement.patientId) : null;
      const toId = nextPatientId ? String(nextPatientId) : null;
      if (fromId !== toId) {
        changes.patientId = { from: fromId, to: toId };
      }
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ message: 'No hay cambios que aplicar' });
    }

    // Si la edición afecta el flujo de efectivo en la sesión, validar fondos.
    if (changes.amount || changes.paymentMethod) {
      const targetAmount = nextAmount ?? movement.amount;
      const targetPaymentMethod = nextPaymentMethod ?? movement.paymentMethod;

      if (movement.type === 'EXPENSE' && targetPaymentMethod === 'CASH' && movement.boxSessionId) {
        const session = await BoxSession.findById(movement.boxSessionId);
        if (session) {
          // Recomputar el efectivo disponible excluyendo este movimiento, luego
          // restar el monto nuevo.
          const others = await CashMovement.find({
            boxSessionId: session._id,
            _id: { $ne: movement._id }
          });
          const { cashOnHand } = summarizeMovements(others, session.initialAmount);
          if (cashOnHand < targetAmount) {
            return res.status(400).json({
              message: `Fondos insuficientes para esta edición. Disponible (sin este movimiento): $${cashOnHand}`
            });
          }
        }
      }
    }

    // Aplicar cambios + apend al audit trail
    if (changes.amount) movement.amount = nextAmount;
    if (changes.paymentMethod) movement.paymentMethod = nextPaymentMethod;
    if (changes.concept) movement.concept = nextConcept;
    if (changes.patientId) movement.patientId = nextPatientId || null;

    movement.edits.push({
      editedAt: new Date(),
      editedBy: req.user?.id || null,
      reason: reason.trim(),
      changes
    });

    await movement.save();

    const populated = await CashMovement.findById(movement._id)
      .populate('patientId', 'primer_nombre apellido_paterno photoURL')
      .populate('creadoPor', 'nombre')
      .populate('edits.editedBy', 'nombre')
      .lean();

    res.json(populated);
  } catch (error) {
    console.error('Error updating movement:', error);
    res.status(500).json({ message: 'Error al editar el movimiento' });
  }
};
