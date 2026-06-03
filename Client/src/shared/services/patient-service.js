/**
 * Servicio de pacientes — CRUD contra /patients sobre la instancia axios
 * compartida (axios-instance). Incluye una cache de 2 min para la lista,
 * que se invalida en cada mutación.
 */
import API from './axios-instance';

// Cache para lista de pacientes (2 min TTL) — evita consultas duplicadas
const PATIENTS_CACHE_TTL_MS = 2 * 60 * 1000;
let patientsCache = { data: null, ts: 0 };
export const invalidatePatientsCache = () => {
  patientsCache = { data: null, ts: 0 };
};

export const getAllPatients = async (options = {}) => {
  const { skipCache = false } = options;
  const now = Date.now();
  if (!skipCache && patientsCache.data !== null && now - patientsCache.ts < PATIENTS_CACHE_TTL_MS) {
    return patientsCache.data;
  }
  try {
    const response = await API.get('/patients');
    const data = response.data;
    patientsCache = { data, ts: now };
    return data;
  } catch (error) {
    console.error('❌ Error al obtener pacientes:', error);
    throw error;
  }
};

export const createPatient = async (patientData) => {
  try {
    const response = await API.post('/patients', patientData);
    invalidatePatientsCache();
    return response.data;
  } catch (error) {
    console.error('❌ Error al crear paciente:', error);
    throw error;
  }
};

export const getPatientById = async (id) => {
  try {
    const response = await API.get(`/patients/${id}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error al obtener paciente con ID ${id}:`, error);
    throw error;
  }
};

export const updatePatient = async (id, patientData) => {
  try {
    const response = await API.put(`/patients/${id}`, patientData);
    invalidatePatientsCache();
    return response.data;
  } catch (error) {
    console.error(`❌ Error al actualizar paciente con ID ${id}:`, error);
    throw error;
  }
};

// El backend exige deleteReason (>=10 chars). axios no serializa body en
// DELETE salvo que se pase { data: ... }, por eso el config va explícito.
export const deletePatient = async (id, deleteReason) => {
  try {
    const response = await API.delete(`/patients/${id}`, {
      data: { deleteReason },
    });
    invalidatePatientsCache();
    return response.data;
  } catch (error) {
    console.error(`❌ Error al eliminar paciente con ID ${id}:`, error);
    throw error;
  }
};
