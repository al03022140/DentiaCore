import API from './axios-instance';

export const getMonthlyBalance = async () => {
  try {
    const response = await API.get('/cash/balance/monthly');
    return response.data;
  } catch (error) {
    console.error('Error fetching monthly balance:', error);
    throw error;
  }
};

export const getSessionBalance = async () => {
  const response = await API.get('/cash/session/balance');
  return response.data;
};

export const getSessionStatus = async () => {
  const response = await API.get('/cash/session/status');
  return response.data;
};

export const openBox = async (initialAmount) => {
  const response = await API.post('/cash/session/open', { initialAmount });
  return response.data;
};

export const closeBox = async () => {
  const response = await API.post('/cash/session/close');
  return response.data;
};

export const addMovement = async (movementData) => {
  const response = await API.post('/cash/movements', movementData);
  return response.data;
};

export const getLastMovements = async () => {
  const response = await API.get('/cash/movements');
  return response.data;
};

export const getMovementsByPatient = async (patientId, options = {}) => {
  const response = await API.get('/cash/movements', {
    params: { patientId },
    signal: options.signal
  });
  return response.data;
};

export const updateMovement = async (movementId, payload) => {
  const response = await API.put(`/cash/movements/${encodeURIComponent(movementId)}`, payload);
  return response.data;
};
