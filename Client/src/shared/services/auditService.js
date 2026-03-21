import API from './axios-instance';

/**
 * Obtener logs de auditoría con filtros.
 * @param {object} filters - { userId, patientId, date, desde, hasta, evento, page, limit }
 */
export const getAuditLogs = async (filters = {}) => {
  const params = {};
  if (filters.userId) params.userId = filters.userId;
  if (filters.patientId) params.patientId = filters.patientId;
  if (filters.date) params.date = filters.date;
  if (filters.desde) params.desde = filters.desde;
  if (filters.hasta) params.hasta = filters.hasta;
  if (filters.evento) params.evento = filters.evento;
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;

  const { data } = await API.get('/audit', { params });
  return data;
};

/**
 * Obtener lista de usuarios para el filtro de trazabilidad.
 */
export const getAuditUsers = async () => {
  const { data } = await API.get('/audit/users');
  return data;
};

/**
 * Buscar pacientes por nombre o ID para el filtro de trazabilidad.
 */
export const searchAuditPatients = async (query) => {
  const { data } = await API.get('/audit/patients', { params: { q: query } });
  return data;
};

/**
 * Verificar la integridad de un documento clínico.
 * @param {string} resourceType - Tipo del recurso (patient, examen, receta, etc.)
 * @param {string} resourceId - ID del documento
 */
export const verifyIntegrity = async (resourceType, resourceId) => {
  const { data } = await API.get(`/audit/verify/${resourceType}/${resourceId}`);
  return data;
};

/**
 * Obtener timeline de auditoría de un paciente.
 * @param {string} patientId
 * @param {object} options - { page, limit }
 */
export const getAuditTimeline = async (patientId, options = {}) => {
  const params = {};
  if (options.page) params.page = options.page;
  if (options.limit) params.limit = options.limit;

  const { data } = await API.get(`/audit/timeline/${patientId}`, { params });
  return data;
};
