import API from './axios-instance';

// Cache para citas del día (1 min) — evita duplicados Home vs Consultas
const TODAY_CACHE_TTL_MS = 60 * 1000;
let todayCache = { data: null, ts: 0 };

export const getTodayAppointments = async (options = {}) => {
  const { skipCache = false } = options;
  const now = Date.now();
  if (!skipCache && todayCache.data !== null && now - todayCache.ts < TODAY_CACHE_TTL_MS) {
    return todayCache.data;
  }
  const { data } = await API.get('/appointments/today');
  todayCache = { data, ts: now };
  return data;
};

export const invalidateTodayAppointmentsCache = () => {
  todayCache = { data: null, ts: 0 };
};

export const getAllAppointments = async () => {
  const { data } = await API.get('/appointments');
  return data;
};

export const createAppointment = async (appointmentData) => {
  const { data } = await API.post('/appointments', appointmentData);
  invalidateTodayAppointmentsCache();
  return data;
};

export const updateAppointment = async (id, appointmentData) => {
  const { data } = await API.put(`/appointments/${encodeURIComponent(id)}`, appointmentData);
  invalidateTodayAppointmentsCache();
  return data;
};

export const deleteAppointment = async (id, motivo) => {
  const { data } = await API.delete(`/appointments/${encodeURIComponent(id)}`, { data: { motivo } });
  invalidateTodayAppointmentsCache();
  return data;
};
