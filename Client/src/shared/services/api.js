import API from './axios-instance';

// Reusar la instancia `API` (ya configura baseURL, withCredentials y Authorization)
const api = API;

// Interceptor para manejar errores de forma global
api.interceptors.response.use(
    response => response,
    error => {
        const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
        console.error(`❌ Error API: ${errorMessage}`, error);
        
        // Preservar propiedades importantes del error original para manejo de timeouts y cancelaciones
        const enhancedError = {
            message: errorMessage,
            status: error.response?.status,
            name: error.name, // Preservar name (AbortError, CanceledError, etc.)
            code: error.code, // Preservar code (ERR_CANCELED, ECONNABORTED, etc.)
            originalError: error
        };
        
        return Promise.reject(enhancedError);
    }
);

// Funciones de API mejoradas
export const getAllPatients = async () => {
    try {
        const response = await api.get('/patients');
        return response.data;
    } catch (error) {
        console.error("❌ Error al obtener pacientes:", error);
        throw error;
    }
};

export const createPatient = async (patientData) => {
    try {
        const response = await api.post('/patients', patientData);
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
        return response.data;
    } catch (error) {
        console.error(`❌ Error al actualizar paciente con ID ${id}:`, error);
        throw error;
    }
};

export const deletePatient = async (id) => {
    try {
        const response = await api.delete(`/patients/${id}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error al eliminar paciente con ID ${id}:`, error);
        throw error;
    }
};

// Export default de la instancia de axios configurada
export default api;
