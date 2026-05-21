import API from './axios-instance';

// El backend devuelve { charges, total, limit, skip } — desempaquetamos `charges`
// para mantener compatibilidad con consumidores que esperan un array.
export const getAllCharges = async (pendingOnly = false, { skip = 0, limit = 100 } = {}) => {
  const params = new URLSearchParams();
  if (pendingOnly) params.set('pendingOnly', 'true');
  if (skip) params.set('skip', String(skip));
  if (limit && limit !== 100) params.set('limit', String(limit));
  const qs = params.toString();
  const { data } = await API.get(`/patient-charges${qs ? `?${qs}` : ''}`);
  return Array.isArray(data) ? data : (data?.charges ?? []);
};

export const getAllChargesWithMeta = async (pendingOnly = false, { skip = 0, limit = 100 } = {}) => {
  const params = new URLSearchParams();
  if (pendingOnly) params.set('pendingOnly', 'true');
  if (skip) params.set('skip', String(skip));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const { data } = await API.get(`/patient-charges${qs ? `?${qs}` : ''}`);
  if (Array.isArray(data)) return { charges: data, total: data.length, limit, skip };
  return data;
};

export const getChargesByPatient = async (patientId) => {
  const { data } = await API.get(`/patient-charges/${encodeURIComponent(patientId)}`);
  return data;
};

export const createCharge = async (patientId, chargeData) => {
  const { data } = await API.post(`/patient-charges/${encodeURIComponent(patientId)}`, chargeData);
  return data;
};

export const addPayment = async (chargeId, paymentData) => {
  const { data } = await API.post(`/patient-charges/${encodeURIComponent(chargeId)}/payment`, paymentData);
  return data;
};

export const cancelCharge = async (chargeId, payload) => {
  const { data } = await API.post(`/patient-charges/${encodeURIComponent(chargeId)}/cancel`, payload);
  return data;
};
