/**
 * Tests de regresión del code review del módulo de INVENTARIO (2026-07-16).
 * Cada bloque reproduce un hallazgo CRÍTICO que fallaba ANTES del fix:
 *
 *  C1 — addLot/adjustStock/createItem aplicaban el cambio de stock y LUEGO
 *       creaban el InventoryMovement, sin compensación si el create fallaba:
 *       el stock quedaba desincronizado del kardex en silencio (y un retry
 *       del usuario duplicaba el stock). `consume` ya compensaba; los otros
 *       tres puntos de escritura no.
 *  C2 — revertConsume leía el material y recién AL FINAL hacía el $pull —
 *       sin guard atómico, dos reversas concurrentes del mismo material_id
 *       (doble clic, dos pestañas, retry de red) acreditaban el stock DOS
 *       veces y dejaban dos entradas "reversa" en el kardex para un solo
 *       consumo.
 *
 * Autocontenido con MongoMemoryServer (sin mongod local ni pila HTTP) —
 * mismo patrón que odontograma-audit-fixes.test.js: llama al controller
 * directo con req/res simulados, sin pasar por Express/supertest/auth.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const InventoryItem = require('../models/inventoryItem');
const InventoryMovement = require('../models/inventoryMovement');
const Appointment = require('../models/appointment');
const inventoryController = require('../controllers/inventoryController');

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }
});

describe('Inventario — fixes críticos del code review (2026-07-16)', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await InventoryItem.deleteMany({});
    // InventoryMovement bloquea deleteMany a nivel app (kardex inmutable) —
    // limpiar vía el driver crudo, saltando los hooks de Mongoose.
    await mongoose.connection.db.collection('inventory_movements').deleteMany({});
    await Appointment.deleteMany({});
  });

  // ── C1: compensación cuando InventoryMovement.create falla ──────────────
  describe('C1 — compensación de stock si el kardex no se puede escribir', () => {
    test('addLot revierte el lote nuevo si InventoryMovement.create falla', async () => {
      const item = await InventoryItem.create({ nombre: 'Gasas' });
      const userId = new mongoose.Types.ObjectId();

      const spy = jest.spyOn(InventoryMovement, 'create').mockRejectedValueOnce(new Error('boom'));
      const req = { params: { id: String(item._id) }, body: { cantidad: 10 }, user: { id: String(userId) } };
      const res = mockRes();
      await inventoryController.addLot(req, res);
      spy.mockRestore();

      expect(res.statusCode).toBe(500);
      const fresh = await InventoryItem.findById(item._id);
      expect(fresh.stockTotal).toBe(0);
      expect(fresh.lotes.every(l => l.cantidadActual === 0)).toBe(true);
    });

    test('adjustStock revierte la merma si InventoryMovement.create falla', async () => {
      const item = await InventoryItem.create({
        nombre: 'Anestesia',
        lotes: [{ cantidadInicial: 20, cantidadActual: 20 }]
      });
      const userId = new mongoose.Types.ObjectId();

      const spy = jest.spyOn(InventoryMovement, 'create').mockRejectedValueOnce(new Error('boom'));
      const req = { params: { id: String(item._id) }, body: { cantidad: 5, tipo: 'merma', motivo: 'Rotura' }, user: { id: String(userId) } };
      const res = mockRes();
      await inventoryController.adjustStock(req, res);
      spy.mockRestore();

      expect(res.statusCode).toBe(500);
      const fresh = await InventoryItem.findById(item._id);
      expect(fresh.stockTotal).toBe(20); // vuelve al valor previo, no se queda en 15
    });

    test('createItem revierte el lote inicial si InventoryMovement.create falla', async () => {
      const userId = new mongoose.Types.ObjectId();

      const spy = jest.spyOn(InventoryMovement, 'create').mockRejectedValueOnce(new Error('boom'));
      const req = {
        body: { nombre: 'Guantes', loteInicial: { cantidad: 100 } },
        user: { id: String(userId) }
      };
      const res = mockRes();
      await inventoryController.createItem(req, res);
      spy.mockRestore();

      expect(res.statusCode).toBe(500);
      const fresh = await InventoryItem.findOne({ nombreNormalizado: 'guantes' });
      expect(fresh).not.toBeNull(); // el ítem SÍ queda creado (decisión del fix: no hay rollback del doc)
      expect(fresh.stockTotal).toBe(0); // pero el stock queda compensado a 0, sin divergir del kardex vacío
    });
  });

  // ── C2: revertConsume — guard atómico contra reversa doble ───────────────
  describe('C2 — revertConsume no permite reversar el mismo material dos veces', () => {
    test('dos reversas concurrentes del mismo material: solo una acredita stock', async () => {
      const item = await InventoryItem.create({
        nombre: 'Jeringas',
        lotes: [{ cantidadInicial: 50, cantidadActual: 40 }] // ya se consumieron 10
      });
      const loteId = item.lotes[0]._id;
      const userId = new mongoose.Types.ObjectId();
      const pacienteId = new mongoose.Types.ObjectId();

      const movimientoConsumo = await InventoryMovement.create({
        item_id: item._id,
        itemNombre: item.nombre,
        tipo: 'consumo',
        cantidad: 10,
        direccion: -1,
        lotesAfectados: [{ loteId, codigoLote: null, caducidad: null, cantidad: 10 }],
        stockResultante: 40,
        usuario_id: userId,
        motivo: 'Consumo en cita'
      });

      const materialId = new mongoose.Types.ObjectId();
      const appointment = await Appointment.create({
        paciente_id: pacienteId,
        doctor_id: userId,
        fecha_hora: new Date(),
        estado: 'Pasada',
        motivo: 'Consulta de prueba',
        materiales: [{
          _id: materialId,
          item_id: item._id,
          nombre: item.nombre,
          unidad: item.unidad,
          cantidad: 10,
          movimiento_id: movimientoConsumo._id,
          registradoPor: userId
        }]
      });

      const buildReq = () => ({
        body: { cita_id: String(appointment._id), material_id: String(materialId) },
        user: { id: String(userId) }
      });

      const res1 = mockRes();
      const res2 = mockRes();
      await Promise.all([
        inventoryController.revertConsume(buildReq(), res1),
        inventoryController.revertConsume(buildReq(), res2)
      ]);

      // Una gana (200), la otra ya no encuentra nada que reclamar (404) —
      // ANTES del fix ambas ganaban y acreditaban stock por separado.
      expect([res1.statusCode, res2.statusCode].sort()).toEqual([200, 404]);

      const fresh = await InventoryItem.findById(item._id);
      expect(fresh.stockTotal).toBe(50); // repuesto UNA sola vez, no 60

      const reversas = await InventoryMovement.find({ item_id: item._id, tipo: 'reversa' });
      expect(reversas.length).toBe(1); // una sola entrada de reversa en el kardex

      const freshAppt = await Appointment.findById(appointment._id);
      expect(freshAppt.materiales.length).toBe(0);
    });
  });
});
