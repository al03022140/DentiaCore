/**
 * P0.3 — Key ring del audit log (R-1).
 *
 * Objetivo de R-1: rotar AUDIT_HMAC_SECRET sin re-sellar la historia.
 * Cubre los 6 criterios de aceptación:
 *  1. cada entrada nueva guarda keyId;
 *  2. la verificación selecciona la clave por keyId;
 *  3. la activa firma, las retiradas solo verifican;
 *  4. rotar no modifica ninguna entrada existente;
 *  5. verifyChain valida una cadena mixta (varias claves);
 *  6. la migración 0008 es idempotente y no altera entryHash.
 */
const mongoose = require('mongoose');
const { withMongoMemoryServer } = require('./helpers/testAuth');
const { getAuditKeyRing, keyFingerprint } = require('../utils/integrity');
const AuditLog = require('../models/auditLog');
const migration0008 = require('../migrations/0008-keyid-audit-log');

const K1 = 'clave-uno-'.padEnd(64, '1');
const K2 = 'clave-dos-'.padEnd(64, '2');

const ENV_KEYS = ['AUDIT_HMAC_SECRET', 'AUDIT_HMAC_RETIRED_SECRETS'];
const envOriginal = {};

function setKeys(active, retired = []) {
  process.env.AUDIT_HMAC_SECRET = active;
  process.env.AUDIT_HMAC_RETIRED_SECRETS = retired.join(',');
}

const lifecycle = withMongoMemoryServer();
beforeAll(async () => {
  for (const k of ENV_KEYS) envOriginal[k] = process.env[k];
  await lifecycle.start();
});
afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (envOriginal[k] === undefined) delete process.env[k];
    else process.env[k] = envOriginal[k];
  }
  await lifecycle.stop();
});
beforeEach(async () => {
  setKeys(K1);
  await AuditLog.deleteMany({});
});

const userId = new mongoose.Types.ObjectId();
const registrar = (extra = {}) => AuditLog.registrar({
  userId,
  userRole: 'doctor',
  evento: 'modificacion_registro',
  resourceType: 'patient',
  ...extra,
});

describe('key ring — construcción y fail-fast', () => {
  test('la activa firma y las retiradas solo verifican (criterio 3)', () => {
    setKeys(K2, [K1]);
    const ring = getAuditKeyRing();
    expect(ring.activeKeyId).toBe(keyFingerprint(K2));
    expect(ring.byId.get(keyFingerprint(K1))).toBe(K1);
    expect(ring.resolve({ keyId: keyFingerprint(K1) })).toBe(K1);
    expect(ring.resolve({ keyId: keyFingerprint(K2) })).toBe(K2);
    expect(ring.resolve({ keyId: 'deadbeef0000' })).toBeNull();
    expect(ring.resolve({})).toBe(K2); // legacy sin keyId → legacySecret
  });

  test('ring ambiguo → fail-fast (clave repetida o retirada igual a la activa)', () => {
    setKeys(K1, [K1]);
    expect(() => getAuditKeyRing()).toThrow(/ambiguo/);
    setKeys(K2, [K1, K1]);
    expect(() => getAuditKeyRing()).toThrow(/ambiguo/);
  });
});

describe('rotación sin re-sellado', () => {
  test('criterios 1, 2, 4 y 5: cadena mixta íntegra y entradas viejas intactas', async () => {
    // Dos entradas selladas con K1
    await registrar({ motivo: 'entrada 1' });
    await registrar({ motivo: 'entrada 2' });
    const antesDeRotar = await AuditLog.find({}).sort({ seq: 1 }).lean();
    expect(antesDeRotar.map(d => d.keyId)).toEqual([keyFingerprint(K1), keyFingerprint(K1)]); // criterio 1

    // Rotación: K1 → retirada, K2 activa. Solo .env, cero escrituras a la BD.
    setKeys(K2, [K1]);
    await registrar({ motivo: 'entrada 3, post-rotación' });

    const despues = await AuditLog.find({}).sort({ seq: 1 }).lean();
    // criterio 4: las entradas viejas no cambiaron ni un byte
    expect(JSON.stringify(despues.slice(0, 2))).toBe(JSON.stringify(antesDeRotar));
    // la nueva quedó sellada con la activa
    expect(despues[2].keyId).toBe(keyFingerprint(K2));

    // criterios 2 y 5: cadena mixta (K1, K1, K2) verifica 100%
    const res = await AuditLog.verifyChain();
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(3);
    expect(res.breaks).toHaveLength(0);
  });

  test('clave retirada eliminada del ring → unknown_key (no hash_mismatch)', async () => {
    await registrar({ motivo: 'sellada con K1' });
    setKeys(K2); // K1 ya no está en el ring
    const entrada = await AuditLog.findOne({}).lean();
    expect(entrada.keyId).toBe(keyFingerprint(K1));

    const res = await AuditLog.verifyChain();
    expect(res.ok).toBe(false);
    expect(res.breaks[0].type).toBe('unknown_key');
    expect(res.breaks[0].keyId).toBe(keyFingerprint(K1));

    // Restaurar la clave al ring lo arregla sin tocar la BD
    setKeys(K2, [K1]);
    expect((await AuditLog.verifyChain()).ok).toBe(true);
  });
});

describe('migración 0008 — backfill de keyId', () => {
  test('criterio 6: idempotente y sin alterar ningún entryHash', async () => {
    // Simular instalación pre-key-ring: entradas selladas pero sin keyId
    await registrar({ motivo: 'legacy 1' });
    await registrar({ motivo: 'legacy 2' });
    await AuditLog.collection.updateMany({}, { $unset: { keyId: '' } });

    // Legacy sin keyId verifica con la activa incluso ANTES de la 0008
    expect((await AuditLog.verifyChain()).ok).toBe(true);

    const hashesAntes = (await AuditLog.find({}).sort({ seq: 1 }).lean()).map(d => d.entryHash);

    await migration0008.up();

    const docs = await AuditLog.find({}).sort({ seq: 1 }).lean();
    expect(docs.map(d => d.keyId)).toEqual([keyFingerprint(K1), keyFingerprint(K1)]);
    expect(docs.map(d => d.entryHash)).toEqual(hashesAntes); // 0 sellos modificados
    expect((await AuditLog.verifyChain()).ok).toBe(true);

    // Idempotencia: segunda corrida no modifica nada
    await migration0008.up();
    const docs2 = await AuditLog.find({}).sort({ seq: 1 }).lean();
    expect(JSON.stringify(docs2)).toBe(JSON.stringify(docs));
  });
});
