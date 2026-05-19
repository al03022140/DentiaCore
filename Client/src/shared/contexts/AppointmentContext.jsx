import React, { createContext, useContext, useMemo } from 'react';

/**
 * Contexto del ID de cita en curso.
 *
 * Componentes clínicos (nota de evolución, plan de tratamiento, odontograma,
 * periodontograma, exámenes) pueden leerlo con `useCurrentAppointment()` y
 * adjuntarlo a sus requests de guardado para que el servidor lo ligue al
 * subdocumento correspondiente. Si no hay cita activa, devuelve `null`.
 *
 * El proveedor vive en patient-detail.jsx y lee `?appointmentId=` del query
 * string. Su valor es opcional — toda la app sigue funcionando si está vacío.
 */
const AppointmentContext = createContext({ appointmentId: null });

export const AppointmentProvider = ({ appointmentId, children }) => {
  const value = useMemo(() => ({ appointmentId: appointmentId || null }), [appointmentId]);
  return (
    <AppointmentContext.Provider value={value}>
      {children}
    </AppointmentContext.Provider>
  );
};

export const useCurrentAppointment = () => useContext(AppointmentContext);

export default AppointmentContext;
