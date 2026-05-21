/**
 * Pruebas del flujo de CAJA — DentiaCore
 *
 * Cubre los puntos críticos detectados en la auditoría:
 *  - BUG-1: apertura concurrente bloqueada por índice único parcial
 *  - BUG-2: validación de fondos en retiro CASH
 *  - BUG-3: closeBox transición OPEN → CLOSING → CLOSED
 *  - BUG-4: pagos a cobros cancelados rechazados
 *  - BUG-5: saga compensatoria en addPayment (rollback si falla charge.save)
 *  - BUG-6: recalculo de finalAmount al editar movimiento de sesión cerrada
 *  - BUG-9: redondeo a 2 decimales en montos
 *  - BUG-10: defensa contra NaN en summarizeMovements
 *  - BUG-14: openedBy requerido para trazabilidad
 *  - Inmutabilidad de pagos en PatientCharge (pre-save)
 *  - Bloqueo de edición de movimiento ligado a cobro activo
 *  - Cancelación de cobro (BUG-8)
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const cashController = require('../controllers/cashController');
const patientChargeController = require('../controllers/patientChargeController');
const BoxSession = require('../models/boxSession');
const CashMovement = require('../models/cashMovement');
const PatientCharge = require('../models/patientCharge');
// Pre-cargar modelos referenciados por populate (sino MissingSchemaError)
require('../models/users');
require('../models/patient');
require('../models/appointment');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // Garantiza creación de índices (sobre todo el único parcial de BoxSession)
  await BoxSession.init();
  await CashMovement.init();
  await PatientCharge.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await BoxSession.deleteMany({});
  await CashMovement.deleteMany({});
  await PatientCharge.deleteMany({});
});

const mkReq = (overrides = {}) => ({
  user: { id: new mongoose.Types.ObjectId().toString() },
  body: {},
  params: {},
  query: {},
  ...overrides
});

const mkRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = jest.fn(function (code) { this.statusCode = code; return this; });
  res.json = jest.fn(function (body) { this.body = body; return this; });
  return res;
};

const openCajaWith = async (initialAmount = 1000) => {
  const userId = new mongoose.Types.ObjectId().toString();
  const req = mkReq({ user: { id: userId }, body: { initialAmount } });
  const res = mkRes();
  await cashController.openBox(req, res);
  return { userId, res };
};

describe('BUG-1 · openBox — bloqueo de doble apertura', () => {
  test('crea sesión válida', async () => {
    const { res } = await openCajaWith(500);
    expect(res.statusCode).toBe(201);
    expect(await BoxSession.countDocuments({ status: 'OPEN' })).toBe(1);
  });

  test('rechaza segunda apertura mientras hay OPEN', async () => {
    await openCajaWith(500);
    const second = await openCajaWith(200);
    expect(second.res.statusCode).toBe(400);
    expect(second.res.body.message).toMatch(/abierta/i);
    expect(await BoxSession.countDocuments({ status: 'OPEN' })).toBe(1);
  });

  test('rechaza apertura sin usuario autenticado', async () => {
    const req = mkReq({ user: null, body: { initialAmount: 100 } });
    const res = mkRes();
    await cashController.openBox(req, res);
    expect(res.statusCode).toBe(401);
  });

  test('rechaza monto inicial fuera de rango', async () => {
    const req = mkReq({ body: { initialAmount: -50 } });
    const res = mkRes();
    await cashController.openBox(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('BUG-2 · addMovement — validación de fondos', () => {
  let userId;
  beforeEach(async () => {
    const opened = await openCajaWith(1000);
    userId = opened.userId;
  });

  test('rechaza retiro CASH si excede cashOnHand', async () => {
    const req = mkReq({
      user: { id: userId },
      body: { amount: 5000, type: 'EXPENSE', paymentMethod: 'CASH', concept: 'compra' }
    });
    const res = mkRes();
    await cashController.addMovement(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/insuficientes/i);
    expect(await CashMovement.countDocuments()).toBe(0);
  });

  test('acepta retiro CASH dentro del límite', async () => {
    const req = mkReq({
      user: { id: userId },
      body: { amount: 500, type: 'EXPENSE', paymentMethod: 'CASH', concept: 'compra' }
    });
    const res = mkRes();
    await cashController.addMovement(req, res);
    expect(res.statusCode).toBe(201);
    expect(await CashMovement.countDocuments()).toBe(1);
  });

  test('acepta INCOME aunque no haya fondos', async () => {
    const req = mkReq({
      user: { id: userId },
      body: { amount: 500, type: 'INCOME', paymentMethod: 'CASH', concept: 'consulta' }
    });
    const res = mkRes();
    await cashController.addMovement(req, res);
    expect(res.statusCode).toBe(201);
  });

  test('rechaza movimiento sin sesión abierta', async () => {
    await BoxSession.updateMany({}, { status: 'CLOSED', endTime: new Date() });
    const req = mkReq({
      body: { amount: 100, type: 'INCOME', paymentMethod: 'CASH', concept: 'x' }
    });
    const res = mkRes();
    await cashController.addMovement(req, res);
    expect(res.statusCode).toBe(400);
  });

  test('rechaza monto inválido (negativo o cero)', async () => {
    for (const bad of [-1, 0, 'abc', null, undefined]) {
      const res = mkRes();
      await cashController.addMovement(mkReq({
        user: { id: userId },
        body: { amount: bad, type: 'INCOME', paymentMethod: 'CASH', concept: 'x' }
      }), res);
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('BUG-3 · closeBox — atómico con CLOSING', () => {
  let userId;
  beforeEach(async () => {
    const opened = await openCajaWith(1000);
    userId = opened.userId;
  });

  test('cierra y calcula finalAmount correctamente', async () => {
    // INCOME CASH 500 + EXPENSE CASH 200 = +300 sobre initialAmount 1000 → 1300
    await cashController.addMovement(mkReq({
      user: { id: userId },
      body: { amount: 500, type: 'INCOME', paymentMethod: 'CASH', concept: 'consulta' }
    }), mkRes());
    await cashController.addMovement(mkReq({
      user: { id: userId },
      body: { amount: 200, type: 'EXPENSE', paymentMethod: 'CASH', concept: 'insumos' }
    }), mkRes());

    const res = mkRes();
    await cashController.closeBox(mkReq({ user: { id: userId } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.summary.finalCashAmount).toBe(1300);
    expect(res.body.summary.totalIncome).toBe(500);
    expect(res.body.summary.totalExpense).toBe(200);

    const session = await BoxSession.findOne({ status: 'CLOSED' });
    expect(session).toBeTruthy();
    expect(session.finalAmount).toBe(1300);
    expect(session.closedBy.toString()).toBe(userId);
  });

  test('rechaza segundo close cuando no hay sesión abierta', async () => {
    await cashController.closeBox(mkReq({ user: { id: userId } }), mkRes());
    const res = mkRes();
    await cashController.closeBox(mkReq({ user: { id: userId } }), res);
    expect(res.statusCode).toBe(400);
  });

  test('movimientos digitales no afectan finalCashAmount', async () => {
    await cashController.addMovement(mkReq({
      user: { id: userId },
      body: { amount: 800, type: 'INCOME', paymentMethod: 'DIGITAL', concept: 'transferencia' }
    }), mkRes());

    const res = mkRes();
    await cashController.closeBox(mkReq({ user: { id: userId } }), res);
    expect(res.body.summary.finalCashAmount).toBe(1000);
    expect(res.body.summary.digitalIncome).toBe(800);
    expect(res.body.summary.net).toBe(800);
  });
});

describe('Inmutabilidad de pagos en PatientCharge', () => {
  test('pre-save bloquea eliminación de pagos existentes', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const charge = await PatientCharge.create({
      patientId,
      fecha: new Date(),
      items: [{ nombre: 'Limpieza', cantidad: 1, precioUnitario: 500, subtotal: 500 }],
      total: 500,
      confirmado: true,
      pagos: [{
        monto: 200,
        fecha: new Date(),
        paymentMethod: 'CASH'
      }]
    });

    charge.pagos = [];
    await expect(charge.save()).rejects.toThrow(/eliminar pagos/i);
  });

  test('pre-save bloquea modificación de monto de pago existente', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const charge = await PatientCharge.create({
      patientId,
      fecha: new Date(),
      items: [{ nombre: 'Limpieza', cantidad: 1, precioUnitario: 500, subtotal: 500 }],
      total: 500,
      confirmado: true,
      pagos: [{ monto: 200, fecha: new Date(), paymentMethod: 'CASH' }]
    });

    charge.pagos[0].monto = 9999;
    await expect(charge.save()).rejects.toThrow(/modificar.*monto/i);
  });

  test('permite agregar pago nuevo (push)', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const charge = await PatientCharge.create({
      patientId,
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
      total: 1000,
      confirmado: true,
      pagos: [{ monto: 400, fecha: new Date(), paymentMethod: 'CASH' }]
    });

    charge.pagos.push({ monto: 200, fecha: new Date(), paymentMethod: 'DIGITAL' });
    await charge.save();

    expect(charge.totalPagado).toBe(600);
    expect(charge.saldoPendiente).toBe(400);
  });
});

describe('BUG-4 · addPayment rechaza cobro cancelado', () => {
  let userId;
  beforeEach(async () => {
    const opened = await openCajaWith(1000);
    userId = opened.userId;
  });

  test('addPayment falla si charge.cancelado === true', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const charge = await PatientCharge.create({
      patientId,
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 100, subtotal: 100 }],
      total: 100,
      confirmado: true,
      cancelado: true,
      canceladoEn: new Date(),
      canceladoMotivo: 'duplicado'
    });

    const res = mkRes();
    await patientChargeController.addPayment(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { monto: 50, paymentMethod: 'CASH', confirmacion: 'CONFIRMO' }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cancelado/i);
    expect(await CashMovement.countDocuments()).toBe(0);
  });
});

describe('BUG-5 · addPayment saga compensatoria', () => {
  let userId;
  beforeEach(async () => {
    const opened = await openCajaWith(1000);
    userId = opened.userId;
  });

  test('crea CashMovement + actualiza saldoPendiente atómicamente', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const charge = await PatientCharge.create({
      patientId,
      fecha: new Date(),
      items: [{ nombre: 'Limpieza', cantidad: 1, precioUnitario: 500, subtotal: 500 }],
      total: 500,
      confirmado: true
    });

    const res = mkRes();
    await patientChargeController.addPayment(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { monto: 200, paymentMethod: 'CASH', confirmacion: 'CONFIRMO' }
    }), res);

    expect(res.statusCode).toBe(200);
    const updated = await PatientCharge.findById(charge._id);
    expect(updated.totalPagado).toBe(200);
    expect(updated.saldoPendiente).toBe(300);

    const movements = await CashMovement.find({ linkedChargeId: charge._id });
    expect(movements).toHaveLength(1);
    expect(movements[0].amount).toBe(200);
    expect(movements[0].type).toBe('INCOME');
  });

  test('rollback: si charge.save falla, CashMovement se borra', async () => {
    const patientId = new mongoose.Types.ObjectId();
    const charge = await PatientCharge.create({
      patientId,
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 500, subtotal: 500 }],
      total: 500,
      confirmado: true,
      pagos: [{ monto: 300, fecha: new Date(), paymentMethod: 'CASH' }]
    });

    // Mock para forzar fallo en charge.save() — simulamos un error de DB
    // tras crear el CashMovement. La saga debe limpiar el movement.
    const origSave = PatientCharge.prototype.save;
    PatientCharge.prototype.save = function () {
      return Promise.reject(new Error('Simulated DB error'));
    };

    try {
      const res = mkRes();
      await patientChargeController.addPayment(mkReq({
        user: { id: userId },
        params: { chargeId: charge._id.toString() },
        body: { monto: 100, paymentMethod: 'CASH', confirmacion: 'CONFIRMO' }
      }), res);

      expect(res.statusCode).toBe(500);
      // No debe quedar movement huérfano
      const movements = await CashMovement.find({ linkedChargeId: charge._id });
      expect(movements).toHaveLength(0);
    } finally {
      PatientCharge.prototype.save = origSave;
    }
  });

  test('rechaza pago sin caja abierta', async () => {
    await BoxSession.updateMany({}, { status: 'CLOSED', endTime: new Date() });

    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 500, subtotal: 500 }],
      total: 500,
      confirmado: true
    });

    const res = mkRes();
    await patientChargeController.addPayment(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { monto: 100, paymentMethod: 'CASH', confirmacion: 'CONFIRMO' }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/caja/i);
  });

  test('rechaza monto superior al saldoPendiente', async () => {
    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 100, subtotal: 100 }],
      total: 100,
      confirmado: true
    });

    const res = mkRes();
    await patientChargeController.addPayment(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { monto: 500, paymentMethod: 'CASH', confirmacion: 'CONFIRMO' }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/excede/i);
  });
});

describe('BUG-6 · updateMovement recalcula finalAmount de sesión cerrada', () => {
  test('al editar amount de movimiento en sesión CLOSED, finalAmount se recalcula', async () => {
    const { userId } = await openCajaWith(1000);

    // Registra un INCOME CASH 500
    const addRes = mkRes();
    await cashController.addMovement(mkReq({
      user: { id: userId },
      body: { amount: 500, type: 'INCOME', paymentMethod: 'CASH', concept: 'orig' }
    }), addRes);
    const movementId = addRes.body._id;

    // Cierra caja → finalAmount = 1500
    await cashController.closeBox(mkReq({ user: { id: userId } }), mkRes());
    let session = await BoxSession.findOne({ status: 'CLOSED' });
    expect(session.finalAmount).toBe(1500);

    // Edita el movimiento: amount 500 → 700
    const updRes = mkRes();
    await cashController.updateMovement(mkReq({
      user: { id: userId },
      params: { id: movementId.toString() },
      body: { amount: 700, reason: 'corrección de cobro' }
    }), updRes);
    expect(updRes.statusCode).toBe(200);

    // El finalAmount de la sesión cerrada debe haberse actualizado
    session = await BoxSession.findOne({ status: 'CLOSED' });
    expect(session.finalAmount).toBe(1700);
  });

  test('bloquea edición de movimiento ligado a cobro activo', async () => {
    const { userId } = await openCajaWith(1000);

    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 300, subtotal: 300 }],
      total: 300,
      confirmado: true
    });

    await patientChargeController.addPayment(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { monto: 100, paymentMethod: 'CASH', confirmacion: 'CONFIRMO' }
    }), mkRes());

    const movement = await CashMovement.findOne({ linkedChargeId: charge._id });

    const res = mkRes();
    await cashController.updateMovement(mkReq({
      user: { id: userId },
      params: { id: movement._id.toString() },
      body: { amount: 50, reason: 'intento de edición' }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cobro/i);
  });
});

describe('BUG-8 · cancelCharge', () => {
  let userId;
  beforeEach(async () => {
    const opened = await openCajaWith(1000);
    userId = opened.userId;
  });

  test('marca cobro como cancelado con motivo y usuario', async () => {
    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 100, subtotal: 100 }],
      total: 100,
      confirmado: true
    });

    const res = mkRes();
    await patientChargeController.cancelCharge(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { motivo: 'duplicado, paciente avisó', confirmacion: 'CONFIRMO' }
    }), res);

    expect(res.statusCode).toBe(200);
    const updated = await PatientCharge.findById(charge._id);
    expect(updated.cancelado).toBe(true);
    expect(updated.canceladoMotivo).toBe('duplicado, paciente avisó');
    expect(updated.canceladoPor.toString()).toBe(userId);
  });

  test('rechaza doble cancelación', async () => {
    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 100, subtotal: 100 }],
      total: 100,
      confirmado: true,
      cancelado: true,
      canceladoEn: new Date()
    });

    const res = mkRes();
    await patientChargeController.cancelCharge(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { motivo: 'otro motivo', confirmacion: 'CONFIRMO' }
    }), res);

    expect(res.statusCode).toBe(400);
  });

  test('rechaza sin CONFIRMO', async () => {
    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 1, precioUnitario: 100, subtotal: 100 }],
      total: 100,
      confirmado: true
    });

    const res = mkRes();
    await patientChargeController.cancelCharge(mkReq({
      user: { id: userId },
      params: { chargeId: charge._id.toString() },
      body: { motivo: 'duplicado', confirmacion: '' }
    }), res);

    expect(res.statusCode).toBe(400);
  });
});

describe('BUG-9 · redondeo a 2 decimales', () => {
  test('CashMovement pre-save redondea amount', async () => {
    const mov = await CashMovement.create({
      amount: 100.999999,
      type: 'INCOME',
      paymentMethod: 'CASH',
      concept: 'test'
    });
    expect(mov.amount).toBe(101); // 100.999999 → 101.00
  });

  test('PatientCharge pre-save redondea total, subtotal y pagos', async () => {
    const charge = await PatientCharge.create({
      patientId: new mongoose.Types.ObjectId(),
      fecha: new Date(),
      items: [{ nombre: 'X', cantidad: 3, precioUnitario: 33.333, subtotal: 99.999 }],
      total: 99.999,
      confirmado: true,
      pagos: [{ monto: 50.555, fecha: new Date(), paymentMethod: 'CASH' }]
    });

    expect(charge.total).toBe(100);
    expect(charge.items[0].subtotal).toBe(100);
    expect(charge.items[0].precioUnitario).toBe(33.33);
    expect(charge.totalPagado).toBe(50.56);
    expect(charge.saldoPendiente).toBe(49.44);
  });
});

describe('BUG-14 · openedBy requerido', () => {
  test('BoxSession sin openedBy lanza ValidationError', async () => {
    const s = new BoxSession({ initialAmount: 100, status: 'OPEN' });
    await expect(s.save()).rejects.toThrow();
  });
});

describe('summarizeMovements vía endpoints — defensa NaN', () => {
  test('movement con amount NaN no contamina el resumen', async () => {
    const { userId } = await openCajaWith(1000);

    // Insertar directamente saltándose validaciones (simula data corrupta legacy)
    const sess = await BoxSession.findOne({ status: 'OPEN' });
    await CashMovement.collection.insertOne({
      amount: NaN,
      type: 'INCOME',
      paymentMethod: 'CASH',
      concept: 'corrupted',
      date: new Date(),
      boxSessionId: sess._id,
      creadoPor: new mongoose.Types.ObjectId()
    });

    const res = mkRes();
    await cashController.getSessionBalance(mkReq({ user: { id: userId } }), res);
    expect(res.statusCode).toBe(200);
    expect(Number.isFinite(res.body.summary.cashOnHand)).toBe(true);
    // El movimiento NaN contribuye 0 → cashOnHand sigue siendo 1000
    expect(res.body.summary.cashOnHand).toBe(1000);
  });
});

describe('getSessionHistory', () => {
  test('lista solo sesiones CLOSED ordenadas desc', async () => {
    const u1 = new mongoose.Types.ObjectId();
    const u2 = new mongoose.Types.ObjectId();

    await BoxSession.create({
      initialAmount: 100, status: 'CLOSED',
      startTime: new Date(Date.now() - 86400000),
      endTime: new Date(Date.now() - 80000000),
      openedBy: u1, closedBy: u1
    });
    await BoxSession.create({
      initialAmount: 200, status: 'CLOSED',
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(),
      openedBy: u2, closedBy: u2
    });
    await BoxSession.create({
      initialAmount: 300, status: 'OPEN',
      startTime: new Date(),
      openedBy: u1
    });

    const res = mkRes();
    await cashController.getSessionHistory(mkReq({}), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions[0].initialAmount).toBe(200); // más reciente primero
  });
});
