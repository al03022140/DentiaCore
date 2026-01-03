const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');

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

    let cashBalance = 0;
    let digitalBalance = 0;

    movements.forEach(movement => {
      const amount = movement.type === 'INCOME' ? movement.amount : -movement.amount;
      if (movement.paymentMethod === 'CASH') {
        cashBalance += amount;
      } else {
        digitalBalance += amount;
      }
    });

    res.json({
      cash: cashBalance,
      digital: digitalBalance,
      total: cashBalance + digitalBalance,
      month: now.getMonth() + 1,
      year: now.getFullYear()
    });
  } catch (error) {
    console.error('Error getting monthly balance:', error);
    res.status(500).json({ message: 'Error al obtener el balance mensual' });
  }
};

exports.getSessionStatus = async (req, res) => {
  try {
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    res.json({
      isOpen: !!activeSession,
      session: activeSession
    });
  } catch (error) {
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
      startTime: new Date()
    });

    await newSession.save();
    res.status(201).json(newSession);
  } catch (error) {
    res.status(500).json({ message: 'Error opening box' });
  }
};

exports.closeBox = async (req, res) => {
  try {
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'No hay caja abierta para cerrar' });
    }

    // Calculate final amount
    const movements = await CashMovement.find({ boxSessionId: activeSession._id });
    let cashBalance = activeSession.initialAmount;
    
    movements.forEach(m => {
      if (m.paymentMethod === 'CASH') {
        cashBalance += (m.type === 'INCOME' ? m.amount : -m.amount);
      }
    });

    activeSession.status = 'CLOSED';
    activeSession.endTime = new Date();
    activeSession.finalAmount = cashBalance;
    
    await activeSession.save();
    res.json(activeSession);
  } catch (error) {
    res.status(500).json({ message: 'Error closing box' });
  }
};

exports.addMovement = async (req, res) => {
  try {
    const { amount, type, paymentMethod, concept, patientId } = req.body;
    
    // Find active session
    const activeSession = await BoxSession.findOne({ status: 'OPEN' });
    if (!activeSession) {
      return res.status(400).json({ message: 'Debe abrir la caja antes de registrar movimientos' });
    }

    // Validate cash withdrawal
    if (type === 'EXPENSE' && paymentMethod === 'CASH') {
      const movements = await CashMovement.find({ boxSessionId: activeSession._id });
      let currentCash = activeSession.initialAmount;
      movements.forEach(m => {
        if (m.paymentMethod === 'CASH') {
          currentCash += (m.type === 'INCOME' ? m.amount : -m.amount);
        }
      });

      if (currentCash < amount) {
        return res.status(400).json({ 
          message: `Fondos insuficientes en caja. Disponible: $${currentCash}` 
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
      date: new Date()
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
    const movements = await CashMovement.find()
      .sort({ date: -1 })
      .limit(20)
      .populate('patientId', 'primer_nombre apellido_paterno');
    res.json(movements);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching movements' });
  }
};
