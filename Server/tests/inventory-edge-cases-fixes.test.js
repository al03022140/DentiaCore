/**
 * Tests de regresión de la auditoría de EDGE CASES del módulo de Inventario
 * (2026-07-16, segunda ronda — tras la de bugs críticos de concurrencia).
 * Cada bloque reproduce un hallazgo que fallaba ANTES del fix:
 *
 *  E1 — getMovements exponía paciente_id/cita_id a cualquier rol con
 *       inventory.read (p. ej. recepcionista), aunque el módulo de citas
 *       oculta esos mismos datos a propósito (BASIC_APPOINTMENT_FIELDS,
 *       NOM-004 Art. 5.7).
 *  E2 — deleteAppointment no bloqueaba borrar una cita con materiales de
 *       inventario consumidos sin revertir (quedaban huérfanos e
 *       irreversibles: revertConsume exige deletedAt:null).
 *  E3 — getKits poblaba ítems soft-eliminados como si estuvieran vivos
 *       (populate sin match no respeta deletedAt).
 *  E4 — auditLogger no reconocía /api/inventory ni podía resolver
 *       patientId para /consume (el cliente solo manda cita_id, nunca
 *       paciente_id directo) → timeline de auditoría por paciente ciega
 *       a estos eventos.
 *  E5 — adjustStock aplicaba una resta parcial y la reportaba como éxito
 *       total, sin exponer el faltante (a diferencia de consume()).
 *  E6 — createItem creaba el ítem SIN el lote inicial si la cantidad
 *       excedía MAX_CANTIDAD, en vez de rechazar la petición completa.
 *  E7 — caducidad se parseaba como medianoche UTC en vez de local (mismo
 *       bug ya corregido en statsController.js vía REPORT_TZ).
 *
 * Autocontenido con MongoMemoryServer — mismo patrón que
 * inventory-audit-fixes.test.js: controllers llamados directo con req/res
 * simulados, sin pasar por Express/supertest/auth.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const InventoryItem = require('../models/inventoryItem');
const InventoryMovement = require('../models/inventoryMovement');
const InventoryKit = require('../models/inventoryKit');
const Appointment = require('../models/appointment');
const inventoryController = require('../controllers/inventoryController');
const appointmentController = require('../controllers/appointmentController');
const auditLogger = require('../middlewares/auditLogger');

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }
});

describe('Inventario — fixes de edge cases (2026-07-16, segunda ronda)', () => {
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
    await InventoryKit.deleteMany({});
    await Appointment.deleteMany({});
  });

  // ── E1 ───────────────────────────────────────────────────────────────
  describe('E1 — Kardex no expone vínculo paciente/cita a roles no clínicos', () => {
    test('recepcionista no ve paciente_id/cita_id; doctor sí', async () => {
      const item = await InventoryItem.create({ nombre: 'Lidocaína' });
      const userId = new mongoose.Types.ObjectId();
      const pacienteId = new mongoose.Types.ObjectId();
      const citaId = new mongoose.Types.ObjectId();

      await InventoryMovement.create({
        item_id: item._id,
        itemNombre: item.nombre,
        tipo: 'consumo',
        cantidad: 2,
        direccion: -1,
        lotesAfectados: [],
        stockResultante: 0,
        cita_id: citaId,
        paciente_id: pacienteId,
        usuario_id: userId,
        motivo: 'Consumo en cita'
      });

      const resRecepcion = mockRes();
      await inventoryController.getMovements(
        { params: { id: String(item._id) }, query: {}, user: { id: String(userId), role: 'recepcionista' } },
        resRecepcion
      );
      expect(resRecepcion.body.movements[0].paciente_id).toBeUndefined();
      expect(resRecepcion.body.movements[0].cita_id).toBeUndefined();

      const resDoctor = mockRes();
      await inventoryController.getMovements(
        { params: { id: String(item._id) }, query: {}, user: { id: String(userId), role: 'doctor' } },
        resDoctor
      );
      expect(resDoctor.body.movements[0].paciente_id).toBeDefined();
      expect(resDoctor.body.movements[0].cita_id).toBeDefined();
    });
  });

  // ── E2 ───────────────────────────────────────────────────────────────
  describe('E2 — no se puede eliminar una cita con materiales consumidos', () => {
    test('409 si materiales.length > 0; 200 si está vacío', async () => {
      const pacienteId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const itemId = new mongoose.Types.ObjectId();

      const conMaterial = await Appointment.create({
        paciente_id: pacienteId, doctor_id: doctorId, fecha_hora: new Date(),
        estado: 'EnCurso', motivo: 'Consulta de prueba',
        materiales: [{ item_id: itemId, nombre: 'Gasas', cantidad: 2, registradoPor: doctorId }]
      });
      const sinMaterial = await Appointment.create({
        paciente_id: pacienteId, doctor_id: doctorId, fecha_hora: new Date(),
        estado: 'EnCurso', motivo: 'Consulta de prueba'
      });

      const res1 = mockRes();
      await appointmentController.deleteAppointment(
        { params: { id: String(conMaterial._id) }, body: { motivo: 'motivo de prueba' }, user: { id: String(doctorId) } },
        res1
      );
      expect(res1.statusCode).toBe(409);
      const freshConMaterial = await Appointment.findById(conMaterial._id);
      expect(freshConMaterial.deletedAt).toBeNull();

      const res2 = mockRes();
      await appointmentController.deleteAppointment(
        { params: { id: String(sinMaterial._id) }, body: { motivo: 'motivo de prueba' }, user: { id: String(doctorId) } },
        res2
      );
      expect(res2.statusCode).toBe(200);
    });
  });

  // ── E3 ───────────────────────────────────────────────────────────────
  describe('E3 — un kit no sugiere un ítem eliminado del catálogo como si viviera', () => {
    test('item_id queda null tras soft-delete del ítem', async () => {
      const item = await InventoryItem.create({ nombre: 'Algodón' });
      await InventoryKit.create({
        nombre: 'Kit prueba',
        materiales: [{ item_id: item._id, cantidad: 1 }]
      });

      const resAntes = mockRes();
      await inventoryController.getKits({ query: {} }, resAntes);
      expect(resAntes.body.kits[0].materiales[0].item_id?.nombre).toBe('Algodón');

      item.deletedAt = new Date();
      await item.save();

      const resDespues = mockRes();
      await inventoryController.getKits({ query: {} }, resDespues);
      expect(resDespues.body.kits[0].materiales[0].item_id).toBeNull();
    });
  });

  // ── E4 ───────────────────────────────────────────────────────────────
  describe('E4 — auditLogger reconoce inventario y resuelve patientId desde la respuesta', () => {
    test('detectResourceType clasifica /api/inventory/consume', () => {
      expect(auditLogger._internal.detectResourceType('/api/inventory/consume')).toBe('inventario');
    });
    test('extractPatientId usa paciente_id del body de respuesta cuando el request no lo trae', () => {
      const req = { params: {}, body: { cita_id: 'abc' }, query: {}, originalUrl: '/api/inventory/consume' };
      const responseBody = { registrados: [], errores: [], paciente_id: 'paciente123' };
      expect(auditLogger._internal.extractPatientId(req, responseBody)).toBe('paciente123');
    });
  });

  // ── E5 ───────────────────────────────────────────────────────────────
  describe('E5 — adjustStock expone el faltante cuando no alcanza el stock', () => {
    test('merma de 8 con solo 3 disponibles: aplica 3, reporta faltante 5', async () => {
      const item = await InventoryItem.create({
        nombre: 'Anestesia',
        lotes: [{ cantidadInicial: 3, cantidadActual: 3 }]
      });
      const userId = new mongoose.Types.ObjectId();

      const res = mockRes();
      await inventoryController.adjustStock(
        { params: { id: String(item._id) }, body: { cantidad: 8, tipo: 'merma', motivo: 'Rotura' }, user: { id: String(userId) } },
        res
      );

      expect(res.statusCode).toBe(201);
      expect(res.body.faltante).toBe(5);
      const fresh = await InventoryItem.findById(item._id);
      expect(fresh.stockTotal).toBe(0);
      expect(res.body.movimiento.motivo).toMatch(/faltaron 5/);
    });
  });

  // ── E6 ───────────────────────────────────────────────────────────────
  describe('E6 — alta con lote inicial inválido se rechaza, no se descarta en silencio', () => {
    test('cantidad > MAX_CANTIDAD → 400, el ítem NO se crea', async () => {
      const userId = new mongoose.Types.ObjectId();
      const res = mockRes();
      await inventoryController.createItem(
        { body: { nombre: 'Guantes XL', loteInicial: { cantidad: 99999999 } }, user: { id: String(userId) } },
        res
      );
      expect(res.statusCode).toBe(400);
      const fresh = await InventoryItem.findOne({ nombreNormalizado: 'guantes xl' });
      expect(fresh).toBeNull();
    });
  });

  // ── E7 ───────────────────────────────────────────────────────────────
  describe('E7 — caducidad de fecha-sin-hora no se corre a UTC', () => {
    test('addLot: "YYYY-MM-DD" conserva el día calendario en hora local', async () => {
      const item = await InventoryItem.create({ nombre: 'Guantes' });
      const userId = new mongoose.Types.ObjectId();
      const fechaStr = '2026-07-16';

      const res = mockRes();
      await inventoryController.addLot(
        { params: { id: String(item._id) }, body: { cantidad: 10, caducidad: fechaStr }, user: { id: String(userId) } },
        res
      );

      expect(res.statusCode).toBe(201);
      const caducidad = new Date(res.body.movimiento.lotesAfectados[0].caducidad);
      expect(caducidad.getFullYear()).toBe(2026);
      expect(caducidad.getMonth()).toBe(6); // julio = índice 6
      expect(caducidad.getDate()).toBe(16);
      expect(caducidad.getHours()).toBe(0);
    });
  });
});
