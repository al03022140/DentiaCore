/**
 * P0.2 — Secretos fuera del audit log (hallazgo CRÍTICO 2026-07-31).
 *
 * Criterios de done que este archivo demuestra en miniatura:
 *  1. 0 secretos persistidos en AuditLog (registrar redacta antes de sellar).
 *  2. verifyChain 100% íntegro tras correr la migración 0007 sobre entradas
 *     legacy con secretos en claro.
 */
const mongoose = require('mongoose');
const { withMongoMemoryServer } = require('./helpers/testAuth');
const { redactSecrets, REDACTED } = require('../utils/redact');
const AuditLog = require('../models/auditLog');
const migration0007 = require('../migrations/0007-redactar-secretos-audit-log');

const lifecycle = withMongoMemoryServer();
beforeAll(() => lifecycle.start());
afterAll(() => lifecycle.stop());
beforeEach(() => AuditLog.deleteMany({}));

const userId = new mongoose.Types.ObjectId();

describe('redactSecrets (unidad)', () => {
  test('redacta llaves sensibles en profundidad, conserva las llaves', () => {
    const out = redactSecrets({
      antes: { 'contraseña': '$2b$12$hash', pinHash: 'abc', nombre: 'Ana' },
      despues: { 'contraseña': 'Secreta123!', refreshTokenHash: 'x' },
      lista: [{ passwordResetToken: 't0k3n' }],
    });
    expect(out.antes['contraseña']).toBe(REDACTED);
    expect(out.antes.pinHash).toBe(REDACTED);
    expect(out.antes.nombre).toBe('Ana');
    expect(out.despues['contraseña']).toBe(REDACTED);
    expect(out.despues.refreshTokenHash).toBe(REDACTED);
    expect(out.lista[0].passwordResetToken).toBe(REDACTED);
  });

  test('no muta el original y deja pasar tipos no-planos (Date/ObjectId)', () => {
    const fecha = new Date();
    const oid = new mongoose.Types.ObjectId();
    const original = { despues: { 'contraseña': 'abc' }, fecha, ref: oid };
    const out = redactSecrets(original);
    expect(original.despues['contraseña']).toBe('abc');
    expect(out.fecha).toBe(fecha);
    expect(out.ref).toBe(oid);
  });
});

describe('AuditLog.registrar — redacta antes de sellar', () => {
  test('el reseteo de contraseña por admin no persiste el secreto y la cadena verifica', async () => {
    await AuditLog.registrar({
      userId,
      userRole: 'superadmin',
      evento: 'modificacion_registro',
      resourceType: 'usuario',
      camposEditados: ['contraseña'],
      detalles: {
        antes: { 'contraseña': '$2b$12$viejoHashBcrypt', nombre: 'Dr. Prueba' },
        despues: { 'contraseña': 'NuevaSecreta123!' },
      },
    });

    const guardado = await AuditLog.findOne({}).lean();
    expect(guardado.detalles.antes['contraseña']).toBe(REDACTED);
    expect(guardado.detalles.despues['contraseña']).toBe(REDACTED);
    expect(guardado.detalles.antes.nombre).toBe('Dr. Prueba');
    expect(JSON.stringify(guardado)).not.toContain('NuevaSecreta123!');
    expect(JSON.stringify(guardado)).not.toContain('$2b$12$viejoHashBcrypt');

    // El sello se calculó sobre lo redactado → cadena íntegra.
    const res = await AuditLog.verifyChain();
    expect(res.ok).toBe(true);
    expect(res.breaks).toHaveLength(0);
  });
});

describe('migración 0007 — redacta legacy y re-sella', () => {
  test('entradas legacy con secretos en claro quedan limpias y la cadena 100% íntegra', async () => {
    // Entradas legacy: escritas DIRECTO a la colección (sin registrar, sin
    // redactado, hash basura o ausente — como una instalación vieja).
    const base = {
      userId,
      userRole: 'superadmin',
      evento: 'modificacion_registro',
      resourceType: 'usuario',
      timestamp: new Date('2026-01-15T10:00:00Z'),
    };
    await AuditLog.collection.insertMany([
      { ...base, detalles: { despues: { 'contraseña': 'SecretaEnClaro1!' } }, entryHash: 'sello-viejo-invalido' },
      { ...base, timestamp: new Date('2026-01-15T11:00:00Z'), detalles: { antes: { pinHash: 'hashDelPin' } } },
      { ...base, timestamp: new Date('2026-01-15T12:00:00Z'), detalles: { nota: 'sin secretos' } },
    ]);

    await migration0007.up(mongoose.connection.db);

    const docs = await AuditLog.find({}).sort({ seq: 1 }).lean();
    const todo = JSON.stringify(docs);
    expect(todo).not.toContain('SecretaEnClaro1!');
    expect(todo).not.toContain('hashDelPin');
    expect(docs[0].detalles.despues['contraseña']).toBe(REDACTED);
    expect(docs[1].detalles.antes.pinHash).toBe(REDACTED);
    expect(docs[2].detalles.nota).toBe('sin secretos');

    // Cadena re-sellada: seq 1..N sin huecos y verificación 100% íntegra.
    expect(docs.map(d => d.seq)).toEqual([1, 2, 3]);
    const res = await AuditLog.verifyChain();
    expect(res.ok).toBe(true);
    expect(res.breaks).toHaveLength(0);

    // Idempotencia: segunda corrida no cambia nada.
    await migration0007.up(mongoose.connection.db);
    const docs2 = await AuditLog.find({}).sort({ seq: 1 }).lean();
    expect(JSON.stringify(docs2)).toBe(JSON.stringify(docs));
  });
});
