/**
 * Pruebas unitarias: normalización y mapeo de caras
 *
 * Cubrimos:
 *  - toTriple: asegura arrays [a,b,c]
 *  - pickFaceTriplesFromFourFaces: mapea estructura de 4 caras (UI)
 *    a pares vestibular/palatino según si es diente superior o inferior.
 */

import { toTriple, pickFaceTriplesFromFourFaces } from '../shared/utils/periodontogram-helpers.js';

describe('toTriple', () => {
  test('devuelve [0,0,0] si no es array', () => {
    expect(toTriple(null)).toEqual([0, 0, 0]);
    expect(toTriple(undefined)).toEqual([0, 0, 0]);
    expect(toTriple({})).toEqual([0, 0, 0]);
  });

  test('toma los primeros 3 valores', () => {
    expect(toTriple([1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3]);
  });

  test('rellena con ceros hasta 3', () => {
    expect(toTriple([5])).toEqual([5, 0, 0]);
    expect(toTriple([0, 7])).toEqual([0, 7, 0]);
  });

  test('coacciona a número y usa 0 en inválidos', () => {
    expect(toTriple(['2', 'x', 3])).toEqual([2, 0, 3]);
  });
});

describe('pickFaceTriplesFromFourFaces', () => {
  const metric = {
    vestibularSuperior: [1, 2, 3],
    palatinoSuperior: [4, 5, 6],
    vestibularInferior: [7, 8, 9],
    lingualInferior: [10, 11, 12]
  };

  test('para diente superior usa VS/PS', () => {
    const r = pickFaceTriplesFromFourFaces(metric, true);
    expect(r).toEqual({ vestibular: [1, 2, 3], palatino: [4, 5, 6] });
  });

  test('para diente inferior usa VI/LI', () => {
    const r = pickFaceTriplesFromFourFaces(metric, false);
    expect(r).toEqual({ vestibular: [7, 8, 9], palatino: [10, 11, 12] });
  });

  test('con input inválido devuelve ceros', () => {
    expect(pickFaceTriplesFromFourFaces(null, true)).toEqual({ vestibular: [0, 0, 0], palatino: [0, 0, 0] });
  });
});
