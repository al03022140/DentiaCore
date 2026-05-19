import API from '../../../shared/services/axios-instance.js';

// Configuración de timeouts
const DEFAULT_TIMEOUT = 10000;

/**
 * @typedef {Object} InitialOdontogramResponse
 * @property {boolean} exists - Indica si existe un odontograma inicial
 * @property {string} imageUrl - URL de la imagen del odontograma
 * @property {Array} datos - Datos del odontograma
 * @property {Array} history - Historial del odontograma
 */

/**
 * @typedef {Object} HistoryResponse
 * @property {Array} data - Datos del historial
 * @property {Object} meta - Metadatos de paginación
 * @property {number} meta.total - Total de registros
 * @property {number} meta.page - Página actual
 * @property {number} meta.limit - Límite por página
 * @property {number} meta.pages - Total de páginas
 * @property {string} meta.sortOrder - Orden de clasificación
 */

// Helper para manejar errores de API
const handleApiError = (error) => {
  if (error.code === 'ECONNABORTED') {
    throw new Error('La operación tardó demasiado. Por favor, intente nuevamente.');
  }
  
  if (error.response) {
    const { status, data } = error.response;
    
    // Si el backend devuelve errores de validación ricos, puedes extender aquí:
    // if (data.validationErrors) { ... }
    switch (status) {
      case 400:
        throw new Error(data.details || data.error || 'Error de validación en los datos');
      case 413:
        throw new Error('El archivo es demasiado grande. El tamaño máximo permitido es 5MB');
      case 415:
        throw new Error('Tipo de archivo no permitido. Solo se aceptan imágenes PNG, JPG o JPEG');
      case 404:
        throw new Error('Recurso no encontrado');
      case 500:
        throw new Error('Error interno del servidor. Por favor, intente más tarde');
      default:
        throw new Error(data.error || 'Error en la operación');
    }
  }
  
  if (error.request) {
    throw new Error('Error de conexión. Por favor, verifique su conexión a internet');
  }
  
  throw new Error('Error al configurar la petición');
};

// Utilidad para desnormalizar payloads al backend
function mapToBackend(entry) {
  return {
    tooth: entry.tooth ?? entry.diente ?? '',
    damage: entry.damage ?? entry.tipo ?? '',
    surface: entry.surface ?? entry.superficie ?? '0',
    note: entry.note ?? entry.nota ?? ''
  };
}

// Utilidad para normalizar payloads del backend al frontend
function mapFromBackend(entry) {
  const toothValue = entry.tooth ?? entry.diente ?? '';
  return {
    tooth: toothValue,
    damage: entry.damage ?? entry.tipo ?? '',
    surface: entry.surface ?? entry.superficie ?? '0',
    note: entry.note ?? entry.nota ?? '',
    engineTeeth: entry.engineTeeth ?? entry.teeth ?? (toothValue ? [toothValue] : []),
    fecha: entry.fecha ?? entry.date ?? ''
  };
}

/**
 * Servicio para centralizar las operaciones relacionadas con el Odontograma
 */
const odontogramaService = {
  /**
   * Verifica el estado del odontograma inicial
   * @param {string} patientId - ID del paciente
   * @returns {Promise<InitialOdontogramResponse>}
   */
  async checkInitialOdontogram(patientId) {
    try {
      const { data } = await API.get(`/patients/${patientId}/odontograma-inicial`, {
        timeout: DEFAULT_TIMEOUT
      });
      return data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false, imageUrl: null, datos: [], history: [] };
      }
      throw handleApiError(error);
    }
  },

  /**
   * Guarda el odontograma inicial. Sólo persiste las entradas (datos por diente).
   * Ya NO sube imagen — la vista read-only se renderiza desde los datos.
   * Esta operación sólo se permite UNA vez por paciente (NOM-024). El servidor
   * responde 409 si ya existe un odontograma inicial OFICIAL.
   * @param {string} patientId - ID del paciente
   * @param {Array} entries - Array de entradas { tooth, damage, surface, note }
   * @returns {Promise<{exists: boolean, datos: Array, history: Array}>}
   */
  async saveInitialOdontogram(patientId, entries, options = {}) {
    try {
      const normalized = Array.isArray(entries) ? entries.map(mapToBackend) : [];
      const body = { entries: normalized };
      if (options.appointmentId) body.appointmentId = options.appointmentId;
      const { data } = await API.post(
        `/patients/${patientId}/odontograma-inicial`,
        body,
        { timeout: DEFAULT_TIMEOUT }
      );
      return data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene la URL de la imagen del odontograma inicial
   * @param {string} patientId - ID del paciente
   * @returns {string} - URL relativa de la imagen (sin /api)
   */
  getInitialOdontogramImageUrl(patientId) {
    return `/patients/${patientId}/odontograma-inicial/image`;
  },

  // NOTA: no existe `deleteInitialOdontogram`. El odontograma inicial es de
  // captura única e inmutable por paciente — no se puede archivar ni borrar.

  /**
   * Obtiene el historial del odontograma inicial
   * @param {string} patientId - ID del paciente
   * @returns {Promise<Array>} Array de entradas del historial
   */
  async getInitialOdontogramHistory(patientId) {
    try {
      const { data } = await API.get(`/patients/${patientId}/odontograma-inicial/history`, { 
        timeout: DEFAULT_TIMEOUT 
      });
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      throw handleApiError(error);
    }
  },

  /**
   * Añade entradas al historial del odontograma inicial
   * @param {string} patientId - ID del paciente
   * @param {Array} entries - Entradas a añadir
   * @returns {Promise<{message: string, total_historial: number}>}
   */
  async addInitialOdontogramHistory(patientId, entries, options = {}) {
    try {
      if (!Array.isArray(entries)) {
        throw new Error('Se esperaba un array de entradas para el historial');
      }
      if (entries.length === 0) {
        console.warn('Se intentó guardar un historial vacío');
        return { message: 'No hay entradas para guardar', entradas_añadidas: 0 };
      }
      // Desnormaliza usando mapToBackend
      // Normalizar entries para asegurar que sea un array
      const normalizedEntries = Array.isArray(entries) ? entries : [];
      const payload = normalizedEntries.map(mapToBackend);
      const body = { entries: payload };
      if (options.appointmentId) body.appointmentId = options.appointmentId;
      const { data } = await API.post(
        `/patients/${patientId}/odontograma-inicial/history`,
        body,
        { timeout: DEFAULT_TIMEOUT }
      );
      return data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // ── Odontograma Clínico ─────────────────────────────────────────
  /**
   * Guarda el estado actual del odontograma clínico (instantánea)
   * @param {string} patientId - ID del paciente
   * @param {Array} entryData - Array de entradas del estado actual
   * @returns {Promise<{exists: boolean, datos: Array, history: Array}>}
   */
  async saveClinicalOdontogramState(patientId, entryData, options = {}) {
    try {
      // Normalizar entryData para asegurar que sea un array
      const normalizedEntryData = Array.isArray(entryData) ? entryData : [];
      const entries = normalizedEntryData.map(mapToBackend);
      const body = { entries };
      if (options.appointmentId) body.appointmentId = options.appointmentId;
      const { data } = await API.post(
        `/patients/${patientId}/odontograma-clinico`,
        body,
        { timeout: DEFAULT_TIMEOUT }
      );
      return {
        exists: data.exists ?? true,
        datos: Array.isArray(data.datos) ? data.datos.map(mapFromBackend) : [],
        history: Array.isArray(data.history) ? data.history : []
      };
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene el estado actual y historial del odontograma clínico
   * @param {string} patientId - ID del paciente
   * @returns {Promise<{exists: boolean, datos: Array, history: Array}>} Estado actual y historial
   */
  async getClinicalOdontogramState(patientId) {
    try {
      const { data } = await API.get(
        `/patients/${patientId}/odontograma-clinico`,
        { timeout: DEFAULT_TIMEOUT }
      );
      return {
        exists: data.exists || false,
        datos: Array.isArray(data.datos) ? data.datos.map(mapFromBackend) : [],
        history: Array.isArray(data.history) ? data.history : []
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false, datos: [], history: [] };
      }
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene el historial del odontograma clínico
   * @param {string} patientId - ID del paciente
   * @returns {Promise<Array>} Array de entradas del historial
   */
  async getClinicalOdontogramHistory(patientId) {
    try {
      const { data } = await API.get(
        `/patients/${patientId}/odontograma-clinico/history`,
        { timeout: DEFAULT_TIMEOUT }
      );
      return Array.isArray(data.history) ? data.history : [];
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      throw handleApiError(error);
    }
  },

  /**
   * Elimina una entrada del historial del odontograma clínico
   * @param {string} patientId - ID del paciente
   * @param {string} entryId - ID de la entrada a eliminar
   * @returns {Promise<{message: string}>}
   */
  async deleteClinicalOdontogramEntry(patientId, entryId) {
    try {
      const { data } = await API.delete(
        `/patients/${patientId}/odontograma-clinico/history/${entryId}`,
        { timeout: DEFAULT_TIMEOUT }
      );
      return data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Elimina completamente el estado del odontograma clínico
   * @param {string} patientId - ID del paciente
   * @returns {Promise<{message: string}>}
   */
  async deleteClinicalOdontogramState(patientId) {
    try {
      const { data } = await API.delete(
        `/patients/${patientId}/odontograma-clinico`,
        { timeout: DEFAULT_TIMEOUT }
      );
      return data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
};

export default odontogramaService;