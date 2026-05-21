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

export const getLastMovements = async ({ onlyActiveSession = false, boxSessionId, limit } = {}) => {
  const params = new URLSearchParams();
  if (onlyActiveSession) params.set('onlyActiveSession', 'true');
  if (boxSessionId) params.set('boxSessionId', boxSessionId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const response = await API.get(`/cash/movements${qs ? `?${qs}` : ''}`);
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

export const getSessionHistory = async ({ skip = 0, limit = 30, from, to, day } = {}) => {
  const params = new URLSearchParams();
  if (skip) params.set('skip', String(skip));
  if (limit !== 30) params.set('limit', String(limit));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (day) params.set('day', day);
  const qs = params.toString();
  const { data } = await API.get(`/cash/sessions${qs ? `?${qs}` : ''}`);
  return data;
};

// Conveniencia para el visualizador de caja por día — `day` formato YYYY-MM-DD.
export const getSessionsByDay = (day) => getSessionHistory({ day, limit: 50 });

// BUG-B14: detectar sesiones huérfanas (OPEN > 24h, CLOSING > 1h)
export const getStaleSessions = async () => {
  const { data } = await API.get('/cash/sessions/stale');
  return data;
};

// BUG-B3: forzar cierre de sesión colgada
export const forceResolveSession = async (sessionId) => {
  const { data } = await API.post(`/cash/sessions/${encodeURIComponent(sessionId)}/force-resolve`);
  return data;
};
