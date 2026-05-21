const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const PatientCharge = require('../models/patientCharge');
const Patient = require('../models/patient');

const round2 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const safeNum = (n) => (Number.isFinite(n) ? n : 0);

// Resume un set de movimientos en buckets (income/expense × cash/digital + neto)
const summarizeMovements = (movements, initialAmount = 0) => {
  let cashIncome = 0;
  let cashExpense = 0;
  let digitalIncome = 0;
  let digitalExpense = 0;

  for (const m of movements) {
    const amt = safeNum(m.amount);
    if (m.type === 'INCOME') {
      if (m.paymentMethod === 'CASH') cashIncome += amt;
      else digitalIncome += amt;
    } else {
      if (m.paymentMethod === 'CASH') cashExpense += amt;
      else digitalExpense += amt;
    }
  }

  const cashNet = cashIncome - cashExpense;
  const digitalNet = digitalIncome - digitalExpense;
  const initial = safeNum(initialAmount);

  return {
    cashIncome: round2(cashIncome),
    cashExpense: round2(cashExpense),
    digitalIncome: round2(digitalIncome),
    digitalExpense: round2(digitalExpense),
    cashNet: round2(cashNet),
    digitalNet: round2(digitalNet),
    totalIncome: round2(cashIncome + digitalIncome),
    totalExpense: round2(cashExpense + digitalExpense),
    net: round2(cashNet + digitalNet),
    // Efectivo físico disponible: monto inicial + flujo neto de efectivo
    cashOnHand: round2(initial + cashNet),
    movementCount: movements.length
  };
};

// GET /cash/balance/monthly
// Excluye movimientos de sesiones huérfanas (OPEN > 48 h) — un olvido
// de cierre no debe contaminar reportes mensuales subsecuentes.
exports.getMonthlyBalance = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const movements = await CashMovement.find({
      date: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('boxSessionId', 'status startTime');

    const HOURS_48 = 48 * 60 * 60 * 1000;
    const valid = movements.filter((m) => {
      if (!m.boxSessionId) return true; // movimientos legacy sin sesión
      if (m.boxSessionId.status === 'CLOSED') return true;
      // Sesión OPEN o CLOSING: sólo si lleva menos de 48 h abierta
      const opened = m.boxSessionId.startTime?.getTime?.() ?? Date.now();
      return Date.now() - opened < HOURS_48;
    });

    const summary = summarizeMovements(valid);

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

// GET /cash/sessions — historial de sesiones (cortes pasados). Paginado.
// ?from=YYYY-MM-DD&to=YYYY-MM-DD opcional. Devuelve siempre orden desc por
// fecha de cierre. Útil para auditoría de cortes históricos.
exports.getSessionHistory = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 200);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);

    const filter = { status: 'CLOSED' };
    if (req.query.from || req.query.to) {
      filter.endTime = {};
      if (req.query.from) {
        const d = new Date(req.query.from);
        if (!isNaN(d)) filter.endTime.$gte = d;
      }
      if (req.query.to) {
        const d = new Date(req.query.to);
        if (!isNaN(d)) filter.endTime.$lte = d;
      }
    }

    const [sessions, total] = await Promise.all([
      BoxSession.find(filter)
        .sort({ endTime: -1 })
        .skip(skip)
        .limit(limit)
        .populate('openedBy', 'nombre')
        .populate('closedBy', 'nombre')
        .lean(),
      BoxSession.countDocuments(filter)
    ]);

    res.json({ sessions, total, limit, skip });
  } catch (error) {
    console.error('Error getting session history:', error);
    res.status(500).json({ message: 'Error al obtener historial de sesiones' });
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

// POST /cash/session/open
// El índice único parcial sobre {status: 'OPEN'} (boxSession.js) garantiza
// que sólo una caja puede estar abierta a la vez. Si dos requests intentan
// abrir simultáneamente, Mongo rechaza el segundo con E11000.
exports.openBox = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido para abrir caja' });
    }

    const { initialAmount } = req.body;
    const amount = Number(initialAmount) || 0;
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
      return res.status(400).json({ message: 'Monto inicial inválido' });
    }

    const newSession = new BoxSession({
      initialAmount: amount,
      status: 'OPEN',
      startTime: new Date(),
      openedBy: req.user.id
    });

    try {
      await newSession.save();
    } catch (err) {
      // E11000: índice único parcial — ya hay una caja abierta
      if (err?.code === 11000) {
        return res.status(400).json({ message: 'Ya existe una caja abierta' });
      }
      throw err;
    }

    res.status(201).json(newSession);
  } catch (error) {
    console.error('Error opening box:', error);
    res.status(500).json({ message: 'Error al abrir la caja' });
  }
};

// POST /cash/session/close
// Atómico: marca CLOSING primero (bloquea nuevos movimientos en addMovement),
// recalcula, luego marca CLOSED. Si falla algo entre medias, deja CLOSING
// que es un estado terminal-recuperable (se puede reabrir manualmente).
exports.closeBox = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido para cerrar caja' });
    }

    // Atomic: sólo cerramos si seguimos OPEN. Bloquea closeBox concurrente.
    const closing = await BoxSession.findOneAndUpdate(
      { status: 'OPEN' },
      { $set: { status: 'CLOSING' } },
      { new: true }
    );
    if (!closing) {
      return res.status(400).json({ message: 'No hay caja abierta para cerrar' });
    }

    try {
      const movements = await CashMovement.find({ boxSessionId: closing._id });
      const summary = summarizeMovements(movements, closing.initialAmount);

      closing.status = 'CLOSED';
      closing.endTime = new Date();
      closing.finalAmount = summary.cashOnHand;
      closing.closedBy = req.user.id;
      await closing.save();

      res.json({
        session: closing,
        summary: {
          initialAmount: closing.initialAmount,
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
    } catch (inner) {
      // Si falla el recalculo, intentamos revertir a OPEN para no dejar
      // la caja en CLOSING permanente.
      try {
        await BoxSession.updateOne({ _id: closing._id, status: 'CLOSING' }, { $set: { status: 'OPEN' } });
      } catch (_e) { /* dejar CLOSING si tampoco se puede */ }
      throw inner;
    }
  } catch (error) {
    console.error('Error closing box:', error);
    res.status(500).json({ message: 'Error al cerrar la caja' });
  }
};

// POST /cash/movements
// Mitiga race condition de fondos: crea el movimiento, re-valida cashOnHand
// con TODOS los movimientos (incluido el nuevo). Si quedó negativo, rollback.
exports.addMovement = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido' });
    }

    const { amount, type, paymentMethod, concept, patientId } = req.body;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'El monto debe ser un número positivo' });
    }
    if (amount > 100_000_000) {
      return res.status(400).json({ message: 'Monto excede el límite permitido' });
    }
    if (!['INCOME', 'EXPENSE'].includes(type)) {
      return res.status(400).json({ message: 'El tipo debe ser INCOME o EXPENSE' });
    }
    if (!['CASH', 'DIGITAL'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Método de pago inválido' });
    }

    // Sólo se aceptan movimientos en sesión OPEN — CLOSING bloquea para
    // que el corte de caja no incluya movimientos en vuelo (BUG-3).
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'Debe abrir la caja antes de registrar movimientos' });
    }

    // Si se pasó patientId, verificar que el paciente exista (BUG-12)
    if (patientId) {
      const exists = await Patient.exists({ _id: patientId });
      if (!exists) {
        return res.status(400).json({ message: 'Paciente no encontrado' });
      }
    }

    // Pre-check de fondos para fail-fast (no bloquea race, pero es la
    // experiencia común). El segundo check post-insert sí cierra el race.
    if (type === 'EXPENSE' && paymentMethod === 'CASH') {
      const movements = await CashMovement.find({ boxSessionId: activeSession._id });
      const { cashOnHand } = summarizeMovements(movements, activeSession.initialAmount);
      if (cashOnHand < amount) {
        return res.status(400).json({
          message: `Fondos insuficientes en caja. Disponible: $${cashOnHand}`
        });
      }
    }

    const movement = await CashMovement.create({
      amount: round2(amount),
      type,
      paymentMethod,
      concept,
      patientId: patientId || undefined,
      boxSessionId: activeSession._id,
      date: new Date(),
      creadoPor: req.user.id
    });

    // Saga compensatoria: post-insert recalcula cashOnHand incluyendo este
    // movimiento. Si quedó negativo, otro EXPENSE concurrente metió el
    // retiro antes — revertimos.
    if (type === 'EXPENSE' && paymentMethod === 'CASH') {
      const allMovements = await CashMovement.find({ boxSessionId: activeSession._id });
      const { cashOnHand } = summarizeMovements(allMovements, activeSession.initialAmount);
      if (cashOnHand < 0) {
        await CashMovement.deleteOne({ _id: movement._id });
        return res.status(409).json({
          message: 'Otro retiro concurrente dejó la caja en negativo. Reintente.'
        });
      }
    }

    res.status(201).json(movement);
  } catch (error) {
    console.error('Error adding movement:', error);
    res.status(500).json({ message: 'Error al registrar movimiento' });
  }
};

// GET /cash/movements
// Por defecto: últimos 30 SIN filtro de sesión (permite editar movimientos
// antiguos). ?onlyActiveSession=true filtra por sesión abierta. ?patientId
// devuelve TODOS los movimientos del paciente (vista de ficha).
exports.getLastMovements = async (req, res) => {
  try {
    const filter = {};
    if (req.query.onlyActiveSession === 'true') {
      const activeSession = await BoxSession.findOne({ status: 'OPEN' });
      if (!activeSession) return res.json([]);
      filter.boxSessionId = activeSession._id;
    }

    const { patientId } = req.query;
    if (patientId) {
      filter.patientId = patientId;
    }

    let query = CashMovement.find(filter).sort({ date: -1 });
    if (!patientId) {
      query = query.limit(30);
    } else {
      // Hard cap para evitar leak de memoria con pacientes muy antiguos
      query = query.limit(500);
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
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Usuario requerido' });
    }

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
        message: 'Este movimiento corresponde a un pago de cobro y no se puede editar. Anule el cobro desde el expediente del paciente.'
      });
    }

    const changes = {};
    const nextAmount = typeof amount === 'number' && Number.isFinite(amount) ? round2(amount) : null;
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
        // Si está vinculando un paciente nuevo, validar que existe
        if (toId) {
          const exists = await Patient.exists({ _id: toId });
          if (!exists) {
            return res.status(400).json({ message: 'Paciente no encontrado' });
          }
        }
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

    // Validar estructura de changes antes de persistir (BUG-18 guard contra
    // payloads corruptos: solo permitir keys conocidas con {from, to}).
    const ALLOWED_CHANGE_KEYS = ['amount', 'paymentMethod', 'concept', 'patientId'];
    const sanitizedChanges = {};
    for (const key of Object.keys(changes)) {
      if (!ALLOWED_CHANGE_KEYS.includes(key)) continue;
      const c = changes[key];
      if (c && typeof c === 'object' && 'from' in c && 'to' in c) {
        sanitizedChanges[key] = { from: c.from, to: c.to };
      }
    }

    // Aplicar cambios + append al audit trail
    if (changes.amount) movement.amount = nextAmount;
    if (changes.paymentMethod) movement.paymentMethod = nextPaymentMethod;
    if (changes.concept) movement.concept = nextConcept;
    if (changes.patientId) movement.patientId = nextPatientId || null;

    movement.edits.push({
      editedAt: new Date(),
      editedBy: req.user.id,
      reason: reason.trim(),
      changes: sanitizedChanges
    });

    await movement.save();

    // BUG-6: si la sesión del movimiento está CLOSED, recalcular finalAmount
    // para que los reportes históricos sigan cuadrando.
    if (movement.boxSessionId && (changes.amount || changes.paymentMethod)) {
      const sess = await BoxSession.findById(movement.boxSessionId);
      if (sess && sess.status === 'CLOSED') {
        const allMovs = await CashMovement.find({ boxSessionId: sess._id });
        const recalc = summarizeMovements(allMovs, sess.initialAmount);
        sess.finalAmount = recalc.cashOnHand;
        await sess.save();
      }
    }

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
