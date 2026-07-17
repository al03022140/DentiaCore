const { computeIntegrityHash } = require('./integrity');

describe('computeIntegrityHash — protección contra ciclos', () => {
  it('no revienta el stack con un Map que referencia a su propio padre (forma real de periodontograma)', () => {
    const current = { status: 'ACTIVO' };
    const teeth = new Map();
    teeth.set('11', { medida: 3, parent: current }); // referencia de vuelta al padre
    current.teeth = teeth;

    const doc = { current, patient: 'p1', initial: null, status: 'ACTIVO' };

    expect(() => computeIntegrityHash(doc, 'periodontograma')).not.toThrow();
  });

  it('sigue siendo determinista para documentos normales (sin ciclos)', () => {
    const doc = {
      patient: 'p1',
      initial: { a: 1, b: 2 },
      current: { teeth: new Map([['11', { medida: 3 }]]) },
      status: 'ACTIVO',
    };

    const h1 = computeIntegrityHash(doc, 'periodontograma');
    const h2 = computeIntegrityHash(doc, 'periodontograma');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex
  });
});
