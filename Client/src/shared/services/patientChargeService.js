import API from './axios-instance';

export const getAllCharges = async (pendingOnly = false) => {
  const { data } = await API.get(`/patient-charges${pendingOnly ? '?pendingOnly=true' : ''}`);
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
