import { setIn } from '../object-path';

describe('setIn (set inmutable por ruta)', () => {
  it('coloca el valor en una ruta profunda sin mutar el original', () => {
    const orig = { a: { b: { c: 1 }, x: 9 }, y: 2 };
    const next = setIn(orig, ['a', 'b', 'c'], 42);

    expect(next.a.b.c).toBe(42);
    expect(orig.a.b.c).toBe(1); // no muta el original
    expect(next.a.x).toBe(9); // preserva hermanos
    expect(next.y).toBe(2);
  });

  it('clona solo los nodos del camino (referencias nuevas en la ruta)', () => {
    const orig = { a: { b: { c: 1 } } };
    const next = setIn(orig, ['a', 'b', 'c'], 2);

    expect(next).not.toBe(orig);
    expect(next.a).not.toBe(orig.a);
    expect(next.a.b).not.toBe(orig.a.b);
  });

  it('crea los objetos intermedios que falten', () => {
    const next = setIn(
      {},
      ['encuesta_medica', 'informacion_general', 'ultimo_examen_medico', 'estado'],
      true
    );
    expect(next.encuesta_medica.informacion_general.ultimo_examen_medico.estado).toBe(true);
  });

  it('reemplaza la hoja con cualquier valor, incluido un array', () => {
    const orig = { encuesta_medica: { cirugias_previas: ['a'] } };
    const next = setIn(orig, ['encuesta_medica', 'cirugias_previas'], ['a', 'b']);

    expect(next.encuesta_medica.cirugias_previas).toEqual(['a', 'b']);
    expect(orig.encuesta_medica.cirugias_previas).toEqual(['a']); // no muta
  });

  it('trata un nodo intermedio no-objeto como objeto nuevo', () => {
    const next = setIn({ a: 5 }, ['a', 'b'], 1);
    expect(next.a.b).toBe(1);
  });

  it('soporta rutas de 6 niveles (caso enfermedad_grave_adicional)', () => {
    const path = [
      'encuesta_medica',
      'informacion_general',
      'enfermedad_grave_adicional',
      'enfermedades_seleccionadas',
      'diabetes',
      'checked',
    ];
    const next = setIn({}, path, true);
    expect(
      next.encuesta_medica.informacion_general.enfermedad_grave_adicional
        .enfermedades_seleccionadas.diabetes.checked
    ).toBe(true);
  });
});
