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

// PATCH /appointments/:id/status — transición ligera con audit
export const updateAppointmentStatus = async (id, { estado, motivo } = {}) => {
  const { data } = await API.patch(
    `/appointments/${encodeURIComponent(id)}/status`,
    { estado, motivo }
  );
  invalidateTodayAppointmentsCache();
  return data;
};

// GET /appointments con filtros (rango, doctor, estado)
export const getAppointmentsByRange = async ({ from, to, doctorId, estado, limit, offset } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from instanceof Date ? from.toISOString() : from);
  if (to) params.set('to', to instanceof Date ? to.toISOString() : to);
  if (doctorId) params.set('doctor_id', doctorId);
  if (estado) params.set('estado', estado);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  const { data } = await API.get(`/appointments${qs ? `?${qs}` : ''}`);
  return data;
};

// GET /patients/search?q=
export const searchPatients = async (q, { limit = 10 } = {}) => {
  if (!q || q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: String(limit) });
  const { data } = await API.get(`/patients/search?${params}`);
  return data?.patients || [];
};

// GET /appointments/:id/activity — toda la actividad clínica + cobro ligada a una cita
export const getAppointmentActivity = async (appointmentId) => {
  const { data } = await API.get(`/appointments/${encodeURIComponent(appointmentId)}/activity`);
  return data;
};
