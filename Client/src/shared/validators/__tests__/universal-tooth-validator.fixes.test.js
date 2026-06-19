import { UniversalToothValidator } from '../universal-tooth-validator';

describe('UniversalToothValidator — fixes de correctitud', () => {
  test('validateMeasurement clampa PS/MG al rango del schema (-9..9), no a 15/-10', () => {
    expect(UniversalToothValidator.validateMeasurement(12, 'PROBING_DEPTH')).toBe(9);
    expect(UniversalToothValidator.validateMeasurement(-10, 'GINGIVAL_MARGIN')).toBe(-9);
  });

  test('generateDataHash: datos distintos → claves distintas (sin colisión), independiente del orden de claves', () => {
    const a = UniversalToothValidator.generateDataHash({ teeth: { 11: { profundidadSondaje: [3, 3, 3] } } });
    const b = UniversalToothValidator.generateDataHash({ teeth: { 11: { profundidadSondaje: [4, 4, 4] } } });
    expect(a).not.toBe(b);

    const k1 = UniversalToothValidator.generateDataHash({ a: 1, b: 2 });
    const k2 = UniversalToothValidator.generateDataHash({ b: 2, a: 1 });
    expect(k1).toBe(k2);
  });

  test('normalizeDataForHash sobrevive objetos circulares (no desborda la pila)', () => {
    const cyclic = { teeth: {} };
    cyclic.self = cyclic;
    expect(() => UniversalToothValidator.normalizeDataForHash(cyclic)).not.toThrow();
    expect(JSON.stringify(UniversalToothValidator.normalizeDataForHash(cyclic))).toContain('[Circular]');
  });
});
