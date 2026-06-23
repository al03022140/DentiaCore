// Guard singleton de "cambios sin guardar" para las secciones de Configuración.
//
// El botón "← Volver" vive en SettingsSection, FUERA de la sección activa, así
// que no puede ver el estado `dirty` interno de la sección (p. ej. CashSection).
// La sección registra su estado vía `setSectionDirty(true/false)` y
// SettingsSection consulta `confirmLeaveSection()` antes de navegar; si hay
// cambios pendientes, pide confirmación al usuario.
//
// NOTA: el app usa BrowserRouter clásico, donde `useBlocker` de react-router no
// está disponible (mismo motivo documentado en UnsavedChangesContext). Por eso
// el guard se implementa como un consultor sincrónico simple. El aviso
// `beforeunload` (cerrar/recargar pestaña) lo mantiene cada sección por su lado.
let dirty = false;

export const setSectionDirty = (value) => {
  dirty = !!value;
};

// Devuelve true si es seguro salir (no hay cambios, o el usuario confirmó
// descartarlos). Cuando el usuario acepta salir, limpia el flag para no volver
// a preguntar en navegaciones encadenadas.
export const confirmLeaveSection = (
  msg = 'Tienes cambios sin guardar en esta sección. ¿Salir y descartarlos?'
) => {
  if (!dirty) return true;
  const ok = window.confirm(msg);
  if (ok) dirty = false;
  return ok;
};
