/**
 * Tests de regresión de la tercera ronda de fixes del módulo de Inventario
 * (2026-07-16 — hallazgos medios/bajos de la auditoría de edge cases).
 *
 *  M1 — getItems: `limit` negativo bypaseaba el tope de 500 (solo tenía
 *       cota superior, a diferencia de offset/warnDays).
 *  M2 — adjustStock: un `tipo` inválido/typo caía en silencio a 'ajuste'
 *       genérico en vez de rechazar la petición.
 *  M3 — consume(): la cita cambiaba de estado a mitad de procesar los
 *       materiales (carrera con updateAppointmentStatus) y el consumo se
 *       seguía empujando a una cita ya cerrada.
 *  M4 — createItem: stockMinimo inválido se sustituía por 0 en silencio
 *       (updateItem ya lo rechazaba con 400; ahora ambos son consistentes).
 *  M5 — clinicSettings: el dedup de serviceCatalog no normalizaba acentos
 *       ("Extracción"/"Extraccion" convivían como servicios "distintos").
 *  M6 — getAppointmentActivity no incluía los materiales de inventario
 *       consumidos en la cita.
 *
 * Autocontenido con MongoMemoryServer — mismo patrón que los dos archivos
 * de fixes anteriores.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const InventoryItem = require('../models/inventoryItem');
const InventoryMovement = require('../models/inventoryMovement');
const Appointment = require('../models/appointment');
const ClinicSettings = require('../models/clinicSettings');
const inventoryController = require('../controllers/inventoryController');
const appointmentController = require('../controllers/appointmentController');

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }
});

describe('Inventario — fixes medios/bajos (2026-07-16, tercera ronda)', () => {
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
    await mongoose.connection.db.collection('inventory_movements').deleteMany({});
    await Appointment.deleteMany({});
    await ClinicSettings.deleteMany({});
  });

  // ── M1 ───────────────────────────────────────────────────────────────
  describe('M1 — getItems clampa limit por ambos lados', () => {
    test('limit negativo no bypasea el tope de 500', async () => {
      const res = mockRes();
      await inventoryController.getItems({ query: { limit: '-999999' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.limit).toBeGreaterThanOrEqual(1);
      expect(res.body.limit).toBeLessThanOrEqual(500);
    });
  });

  // ── M2 ───────────────────────────────────────────────────────────────
  describe('M2 — adjustStock rechaza un tipo inválido en vez de degradar a "ajuste"', () => {
    test('tipo="MERMA" (typo de mayúsculas) → 400', async () => {
      const item = await InventoryItem.create({ nombre: 'Item M2' });
      const res = mockRes();
      await inventoryController.adjustStock(
        { params: { id: String(item._id) }, body: { cantidad: 1, tipo: 'MERMA', motivo: 'prueba' }, user: { id: String(new mongoose.Types.ObjectId()) } },
        res
      );
      expect(res.statusCode).toBe(400);
    });

    test('tipo omitido sigue funcionando como "ajuste" (no rompe el default)', async () => {
      const item = await InventoryItem.create({ nombre: 'Item M2b', lotes: [{ cantidadInicial: 5, cantidadActual: 5 }] });
      const res = mockRes();
      await inventoryController.adjustStock(
        { params: { id: String(item._id) }, body: { cantidad: 2, motivo: 'conteo físico' }, user: { id: String(new mongoose.Types.ObjectId()) } },
        res
      );
      expect(res.statusCode).toBe(201);
      expect(res.body.movimiento.tipo).toBe('ajuste');
    });
  });

  // ── M3 ───────────────────────────────────────────────────────────────
  describe('M3 — consume() re-valida el estado de la cita de forma atómica', () => {
    test('si la cita se cancela a mitad del registro, el material no se agrega y el stock se compensa', async () => {
      const item = await InventoryItem.create({ nombre: 'Item M3', lotes: [{ cantidadInicial: 10, cantidadActual: 10 }] });
      const pacienteId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const appointment = await Appointment.create({
        paciente_id: pacienteId, doctor_id: doctorId, fecha_hora: new Date(),
        estado: 'EnCurso', motivo: 'Consulta de prueba'
      });

      // Simula la carrera: justo cuando se crea el InventoryMovement (ya se
      // descontó el stock, falta el $push a la cita), otra petición cierra
      // la cita — mismo punto exacto que antes no se re-validaba.
      const originalCreate = InventoryMovement.create.bind(InventoryMovement);
      const spy = jest.spyOn(InventoryMovement, 'create').mockImplementationOnce(async (doc) => {
        await Appointment.updateOne({ _id: appointment._id }, { $set: { estado: 'Cancelada' } });
        return originalCreate(doc);
      });

      const res = mockRes();
      await inventoryController.consume(
        {
          body: { cita_id: String(appointment._id), materiales: [{ item_id: String(item._id), cantidad: 3 }] },
          user: { id: String(doctorId) }
        },
        res
      );
      spy.mockRestore();

      expect(res.statusCode).toBe(409);
      expect(res.body.registrados).toEqual([]);
      expect(res.body.errores.length).toBe(1);

      const freshItem = await InventoryItem.findById(item._id);
      expect(freshItem.stockTotal).toBe(10); // compensado, no se quedó en 7

      const freshAppt = await Appointment.findById(appointment._id);
      expect(freshAppt.materiales.length).toBe(0); // el $push nunca aplicó
    });
  });

  // ── M4 ───────────────────────────────────────────────────────────────
  describe('M4 — createItem rechaza stockMinimo inválido en vez de sustituirlo por 0', () => {
    test('stockMinimo no numérico → 400, ítem no se crea', async () => {
      const res = mockRes();
      await inventoryController.createItem(
        { body: { nombre: 'Item M4', stockMinimo: 'no-es-numero' }, user: { id: String(new mongoose.Types.ObjectId()) } },
        res
      );
      expect(res.statusCode).toBe(400);
      const fresh = await InventoryItem.findOne({ nombreNormalizado: 'item m4' });
      expect(fresh).toBeNull();
    });
  });

  // ── M5 ───────────────────────────────────────────────────────────────
  describe('M5 — clinicSettings deduplica serviceCatalog ignorando acentos', () => {
    test('"Extracción" y "Extraccion" colapsan a un solo servicio', async () => {
      const settings = new ClinicSettings({
        serviceCatalog: [
          { nombre: 'Extracción', precioDefault: 500 },
          { nombre: 'Extraccion', precioDefault: 600 }
        ]
      });
      await settings.save();
      expect(settings.serviceCatalog.length).toBe(1);
      expect(settings.serviceCatalog[0].nombre).toBe('Extracción');
    });
  });

  // ── M6 ───────────────────────────────────────────────────────────────
  describe('M6 — getAppointmentActivity incluye los materiales consumidos', () => {
    test('materiales viaja en la respuesta y en counts', async () => {
      const pacienteId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const itemId = new mongoose.Types.ObjectId();
      const appointment = await Appointment.create({
        paciente_id: pacienteId, doctor_id: doctorId, fecha_hora: new Date(),
        estado: 'Pasada', motivo: 'Consulta de prueba',
        materiales: [{ item_id: itemId, nombre: 'Gasas', cantidad: 2, registradoPor: doctorId }]
      });

      const res = mockRes();
      await appointmentController.getAppointmentActivity(
        { params: { id: String(appointment._id) } },
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.materiales.length).toBe(1);
      expect(res.body.materiales[0].nombre).toBe('Gasas');
      expect(res.body.counts.materiales).toBe(1);
    });
  });
});
