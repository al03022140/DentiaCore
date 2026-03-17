import API from './axios-instance';

export const getTodayAppointments = async () => {
  const { data } = await API.get('/appointments/today');
  return data;
};

export const getAllAppointments = async () => {
  const { data } = await API.get('/appointments');
  return data;
};

export const createAppointment = async (appointmentData) => {
  const { data } = await API.post('/appointments', appointmentData);
  return data;
};

export const updateAppointment = async (id, appointmentData) => {
  const { data } = await API.put(`/appointments/${encodeURIComponent(id)}`, appointmentData);
  return data;
};

export const deleteAppointment = async (id, motivo) => {
  const { data } = await API.delete(`/appointments/${encodeURIComponent(id)}`, { data: { motivo } });
  return data;
};
