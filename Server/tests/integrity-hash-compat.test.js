/**
 * Tests de la capa de compatibilidad de hash NOM-024 (Fase 1 de normalización).
 *
 * Garantías que se verifican:
 *  1. Con los mapas vacíos (estado de HOY), computeIntegrityHash produce un hash
 *     BYTE-IDÉNTICO al algoritmo original → no se invalida ninguna firma existente.
 *  2. Los campos NO firmables no afectan el hash.
 *  3. Un alias de campo (rename) produce el mismo hash que el nombre legacy.
 *  4. Un mapa de valores (enum canonicalizado) produce el mismo hash que el valor legacy.
 */
const crypto = require('crypto');
const {
  computeIntegrityHash,
  getSignableFields,
  HASH_FIELD_ALIASES,
  HASH_VALUE_MAPS,
} = require('../utils/integrity');

// ── Oráculo: réplica EXACTA del algoritmo original (pre-capa de compatibilidad).
function canonicalize(value) {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && val._bsontype === 'ObjectID') return val.toString();
    if (val instanceof Map) {
      const o = {};
      for (const [k, v] of val) o[k] = v;
      return o;
    }
    return val;
  }, 0);
}
function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj instanceof Date) return obj;
  const s = {};
  for (const k of Object.keys(obj).sort()) s[k] = sortKeys(obj[k]);
  return s;
}
function legacyHash(doc, resourceType) {
  const fields = getSignableFields(resourceType);
  if (fields.length === 0) return '';
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const subset = {};
  for (const field of fields) {
    if (plain[field] !== undefined) subset[field] = plain[field];
  }
  return crypto.createHash('sha256').update(canonicalize(sortKeys(subset))).digest('hex');
}

const sampleDocs = {
  periodontograma: {
    patient: '507f1f77bcf86cd799439011',
    initial: { metadata: { version: '1.0.0' }, teeth: {} },
    current: { teeth: { '11': { pd: [3, 2, 3] } }, statistics: { placaTotal: 5 } },
    status: 'draft',
    estadoRegistro: 'OFICIAL', // NO firmable → no debe afectar el hash
    firmadoEn: new Date('2026-01-01'),
  },
  cita: {
    paciente_id: '507f1f77bcf86cd799439011',
    doctor_id: '507f1f77bcf86cd799439012',
    fecha_hora: new Date('2026-02-03T10:00:00Z'),
    duracion_minutos: 30,
    estado: 'Pendiente',
    motivo: 'Revisión',
    items: [{ nombre: 'Limpieza', precio: 500 }],
    totalEstimado: 500,
    comentarioProcedimiento: 'n/a',
    _ruido: 'campo no firmable',
  },
  odontograma: {
    patientId: '507f1f77bcf86cd799439011',
    type: 'initial',
    current: { '11': { estado: 'sano' } },
  },
};

describe('integrity hash — capa de compatibilidad NOM-024', () => {
  let aliasSnapshot;
  let valueSnapshot;
  beforeEach(() => {
    aliasSnapshot = JSON.parse(JSON.stringify(HASH_FIELD_ALIASES));
    valueSnapshot = JSON.parse(JSON.stringify(HASH_VALUE_MAPS));
  });
  afterEach(() => {
    for (const k of Object.keys(HASH_FIELD_ALIASES)) delete HASH_FIELD_ALIASES[k];
    Object.assign(HASH_FIELD_ALIASES, aliasSnapshot);
    for (const k of Object.keys(HASH_VALUE_MAPS)) delete HASH_VALUE_MAPS[k];
    Object.assign(HASH_VALUE_MAPS, valueSnapshot);
  });

  test('HOY (mapas vacíos) el hash es byte-idéntico al algoritmo original', () => {
    for (const [type, doc] of Object.entries(sampleDocs)) {
      expect(computeIntegrityHash(doc, type)).toBe(legacyHash(doc, type));
    }
  });

  test('campos NO firmables no afectan el hash', () => {
    const a = { ...sampleDocs.periodontograma };
    const b = { ...a, estadoRegistro: 'BORRADOR', firmadoEn: null, modificadoEn: new Date() };
    expect(computeIntegrityHash(a, 'periodontograma')).toBe(
      computeIntegrityHash(b, 'periodontograma'),
    );
  });

  test('alias de campo: doc migrado (nombre nuevo) hashea igual que el legacy', () => {
    // Simula migración: odontograma.patientId -> patientRef
    HASH_FIELD_ALIASES.odontograma = { patientId: ['patientRef'] };
    const legacyDoc = { patientId: 'X1', type: 'initial', current: { a: 1 } };
    const migratedDoc = { patientRef: 'X1', type: 'initial', current: { a: 1 } }; // sin patientId
    expect(computeIntegrityHash(migratedDoc, 'odontograma')).toBe(
      legacyHash(legacyDoc, 'odontograma'),
    );
  });

  test('mapa de valores: enum canonicalizado hashea igual que el valor legacy', () => {
    // Simula migración: odontograma.type 'initial' -> 'INITIAL'
    HASH_VALUE_MAPS.odontograma = { type: { INITIAL: 'initial', CLINIC: 'clinic' } };
    const legacyDoc = { patientId: 'X1', type: 'initial', current: { a: 1 } };
    const migratedDoc = { patientId: 'X1', type: 'INITIAL', current: { a: 1 } };
    expect(computeIntegrityHash(migratedDoc, 'odontograma')).toBe(
      legacyHash(legacyDoc, 'odontograma'),
    );
  });

  test('alias + mapa de valores combinados producen el hash legacy', () => {
    HASH_FIELD_ALIASES.odontograma = { patientId: ['patientRef'] };
    HASH_VALUE_MAPS.odontograma = { type: { INITIAL: 'initial' } };
    const legacyDoc = { patientId: 'X1', type: 'initial', current: { a: 1 } };
    const migratedDoc = { patientRef: 'X1', type: 'INITIAL', current: { a: 1 } };
    expect(computeIntegrityHash(migratedDoc, 'odontograma')).toBe(
      legacyHash(legacyDoc, 'odontograma'),
    );
  });
});
