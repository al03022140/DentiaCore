/**
 * setIn — set inmutable de un valor en una ruta anidada de objetos.
 *
 * Devuelve una copia de `obj` con `value` colocado en `path` (array de claves),
 * clonando SOLO los nodos del camino. No muta `obj`. Crea los objetos
 * intermedios que falten — equivale al patrón escrito a mano:
 *
 *   setState(prev => ({
 *     ...prev,
 *     a: { ...prev.a, b: { ...prev.a?.b, c: value } }
 *   }));
 *
 * Pensado para objetos planos de formulario (no índices de array intermedios).
 * El valor hoja puede ser cualquier cosa, incluido un array ya calculado.
 *
 * @param {Object} obj   objeto base (no se muta)
 * @param {Array<string>} path  ruta de claves, p. ej. ['a','b','c']
 * @param {*} value  valor a colocar en la hoja
 * @returns {Object} copia con el camino actualizado
 */
export function setIn(obj, path, value) {
  if (!Array.isArray(path) || path.length === 0) return value;
  const [key, ...rest] = path;
  const base = obj && typeof obj === 'object' ? obj : {};
  return {
    ...base,
    [key]: rest.length === 0 ? value : setIn(base[key], rest, value),
  };
}

export default setIn;
