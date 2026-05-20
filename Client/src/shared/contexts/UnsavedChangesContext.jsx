import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

/**
 * Registro multi-source de cambios sin guardar dentro de un expediente.
 * Cada componente clínico (odontograma inicial, clínico, periodontograma,
 * notas, etc.) llama `markDirty(key)` cuando el usuario edita y
 * `markClean(key)` cuando guarda o descarta.
 *
 * NOTA: la primera versión usaba `useBlocker` de react-router-dom para
 * interceptar navegación SPA, pero `useBlocker` exige data router
 * (`createBrowserRouter`); el app actual usa `BrowserRouter` clásico.
 * Para evitar migrar el router entero, el guard SPA se implementa AHORA
 * dentro de los consumidores (ej. patient-detail compara prev vs new
 * patientId y hace `navigate(-1)` si hay dirty). El beforeunload (tab
 * close/recarga) lo siguen manejando los propios componentes.
 */
const UnsavedChangesContext = createContext({
  markDirty: () => {},
  markClean: () => {},
  hasDirty: () => false,
  clearDirty: () => {}
});

export const useUnsavedChanges = () => useContext(UnsavedChangesContext);

export const UnsavedChangesProvider = ({ children }) => {
  const dirtyKeysRef = useRef(new Set());

  const markDirty = useCallback((key) => {
    if (!key) return;
    dirtyKeysRef.current.add(key);
  }, []);

  const markClean = useCallback((key) => {
    if (!key) return;
    dirtyKeysRef.current.delete(key);
  }, []);

  const hasDirty = useCallback(() => dirtyKeysRef.current.size > 0, []);

  // Limpia todos los registros — para usar cuando el usuario confirma
  // explícitamente que está OK con perder los cambios.
  const clearDirty = useCallback(() => {
    dirtyKeysRef.current.clear();
  }, []);

  const value = useMemo(
    () => ({ markDirty, markClean, hasDirty, clearDirty }),
    [markDirty, markClean, hasDirty, clearDirty]
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
};

export default UnsavedChangesContext;
