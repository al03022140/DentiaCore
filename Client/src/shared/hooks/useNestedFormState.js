import { useCallback } from 'react';
import { setIn } from '../utils/object-path';

/**
 * useNestedFormState — devuelve un setter `(path, value)` que actualiza de
 * forma inmutable un estado de formulario anidado.
 *
 * Reemplaza el patrón repetido y propenso a errores de:
 *
 *   setFormData(prev => ({
 *     ...prev,
 *     encuesta_medica: {
 *       ...prev.encuesta_medica,
 *       informacion_general: {
 *         ...prev.encuesta_medica.informacion_general,
 *         se_cansa_facilmente: value
 *       }
 *     }
 *   }));
 *
 * por:
 *
 *   const setField = useNestedFormState(setFormData);
 *   setField(['encuesta_medica', 'informacion_general', 'se_cansa_facilmente'], value);
 *
 * @param {Function} setState  el setter de useState del formulario
 * @returns {(path: Array<string>, value: *) => void}
 */
export function useNestedFormState(setState) {
  return useCallback(
    (path, value) => setState((prev) => setIn(prev, path, value)),
    [setState]
  );
}

export default useNestedFormState;
