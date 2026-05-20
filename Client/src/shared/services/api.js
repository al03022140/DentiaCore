import API from './axios-instance';

// Reusar la instancia `API` (ya configura baseURL, withCredentials y Authorization)
const api = API;

// Cache para lista de pacientes (2 min TTL) — evita consultas duplicadas
const PATIENTS_CACHE_TTL_MS = 2 * 60 * 1000;
let patientsCache = { data: null, ts: 0 };
export const invalidatePatientsCache = () => {
  patientsCache = { data: null, ts: 0 };
};

// Interceptor para manejar errores de forma global.
// IMPORTANTE: preservamos `response`, `request` y `config` del AxiosError original
// para que los consumidores (LockScreen, etc.) puedan inspeccionar status code y body.
api.interceptors.response.use(
    response => response,
    error => {
        const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
        console.error(`❌ Error API: ${errorMessage}`, error);

        const enhancedError = {
            message: errorMessage,
            status: error.response?.status,
            name: error.name,
            code: error.code,
            response: error.response,
            request: error.request,
            config: error.config,
            isAxiosError: error.isAxiosError,
            originalError: error
        };

        return Promise.reject(enhancedError);
    }
);

// Funciones de API mejoradas
export const getAllPatients = async (options = {}) => {
    const { skipCache = false } = options;
    const now = Date.now();
    if (!skipCache && patientsCache.data !== null && now - patientsCache.ts < PATIENTS_CACHE_TTL_MS) {
        return patientsCache.data;
    }
    try {
        const response = await api.get('/patients');
        const data = response.data;
        patientsCache = { data, ts: now };
        return data;
    } catch (error) {
        console.error("❌ Error al obtener pacientes:", error);
        throw error;
    }
};

export const createPatient = async (patientData) => {
    try {
        const response = await api.post('/patients', patientData);
        invalidatePatientsCache();
        return response.data;
    } catch (error) {
        console.error("❌ Error al crear paciente:", error);
        throw error;
    }
};

export const getPatientById = async (id) => {
    try {
        const response = await api.get(`/patients/${id}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error al obtener paciente con ID ${id}:`, error);
        throw error;
    }
};

export const updatePatient = async (id, patientData) => {
    try {
        const response = await api.put(`/patients/${id}`, patientData);
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
        const response = await api.delete(`/patients/${id}`, {
            data: { deleteReason }
        });
        invalidatePatientsCache();
        return response.data;
    } catch (error) {
        console.error(`❌ Error al eliminar paciente con ID ${id}:`, error);
        throw error;
    }
};

// Export default de la instancia de axios configurada
export default api;
