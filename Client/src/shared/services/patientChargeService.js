import API from './axios-instance';

// El backend devuelve { charges, total, limit, skip }; este wrapper preserva el
// meta (total) para indicadores de paginación.
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
