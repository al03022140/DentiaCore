import API from '../../../shared/services/axios-instance.js';
import { normalizeEntriesForEngine } from '../utils/odontogram-utils.js';

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

// Helper para manejar errores de API.
// IMPORTANTE: este helper "aplana" el axios error en un Error normal. Antes
// perdía el `code` de negocio del backend (p.ej. ODONTOGRAMA_STALE) porque
// solo conservaba un string de mensaje — y además, cuando el backend responde
// `{ error: { code, message } }` (objeto), `new Error(data.error)` producía
// el texto literal "[object Object]". Ahora preservamos `code`, `status` y un
// mensaje legible para que las capas superiores puedan ramificar.
const handleApiError = (error) => {
  const buildError = (message, code, status) => {
    const e = new Error(message);
    if (code) e.code = code;
    if (status) e.status = status;
    return e;
  };

  if (error.code === 'ECONNABORTED') {
    throw buildError('La operación tardó demasiado. Por favor, intente nuevamente.', 'TIMEOUT');
  }

  if (error.response) {
    const { status, data } = error.response;
    // El backend suele responder { success:false, error:{ code, message } },
    // pero algunos endpoints devuelven { error: "texto" }. Soportamos ambos.
    const apiErr = data?.error;
    const apiCode = apiErr && typeof apiErr === 'object' ? apiErr.code : undefined;
    const apiMsg = apiErr && typeof apiErr === 'object' ? apiErr.message : apiErr;

    switch (status) {
      case 400:
        throw buildError(data?.details || apiMsg || 'Error de validación en los datos', apiCode || 'VALIDATION', status);
      case 403:
        throw buildError(apiMsg || 'No tienes permiso para realizar esta operación', apiCode || 'FORBIDDEN', status);
      case 409:
        throw buildError(apiMsg || 'El registro fue modificado por otro usuario. Recarga antes de guardar.', apiCode || 'CONFLICT', status);
      case 413:
        throw buildError('El archivo es demasiado grande. El tamaño máximo permitido es 5MB', 'FILE_TOO_LARGE', status);
      case 415:
        throw buildError('Tipo de archivo no permitido. Solo se aceptan imágenes PNG, JPG o JPEG', 'UNSUPPORTED_MEDIA_TYPE', status);
      case 404:
        throw buildError('Recurso no encontrado', apiCode || 'NOT_FOUND', status);
      case 500:
        throw buildError(apiMsg || 'Error interno del servidor. Por favor, intente más tarde', apiCode || 'INTERNAL', status);
      default:
        throw buildError(apiMsg || 'Error en la operación', apiCode, status);
    }
  }

  if (error.request) {
    throw buildError('Error de conexión. Por favor, verifique su conexión a internet', 'NETWORK');
  }

  throw buildError('Error al configurar la petición', 'REQUEST_SETUP');
};

// Utilidad para desnormalizar payloads al backend.
// Se usa SÓLO sobre arrays ya pasados por normalizeEntriesForEngine, así que
// `damage` ya es un código numérico en formato string.
function mapToBackend(entry) {
  return {
    tooth: entry.tooth ?? entry.diente ?? '',
    damage: entry.damage ?? entry.tipo ?? '',
    surface: entry.surface ?? entry.superficie ?? '0',
    note: entry.note ?? entry.nota ?? ''
  };
}

// Garantiza que el payload al backend lleve `damage` como código numérico
// (string '5') y NO como nombre localizado ("Caries") o fallback genérico
// ("Daño aplicado"). Sin esto, al recargar el engine no reconoce el daño.
function buildBackendEntries(rawEntries) {
  return normalizeEntriesForEngine(rawEntries).map(mapToBackend);
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
      const normalized = buildBackendEntries(entries);
      const body = { entries: normalized };
      if (options.appointmentId) body.appointmentId = options.appointmentId;
      // Concurrencia optimista: el server compara con su updatedAt actual y
      // responde 409 ODONTOGRAMA_STALE si difieren.
      if (options.expectedUpdatedAt) body.expectedUpdatedAt = options.expectedUpdatedAt;
      const { data } = await API.post(
        `/patients/${patientId}/odontograma-inicial`,
        body,
        // 30s (no 10s): guardado de captura única; en laptop con Mongo local
        // lento, 10s abortaba un guardado que sí completaba (mismo motivo que el
        // odontograma clínico). El backend responde 409 si ya existe, sin duplicar.
        { timeout: 30000 }
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
        { timeout: 30000 } // 30s: escritura; evita abortos por Mongo local lento en laptop
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
      const entries = buildBackendEntries(entryData);
      const body = { entries };
      if (options.appointmentId) body.appointmentId = options.appointmentId;
      // Concurrencia optimista: el server compara con su updatedAt actual y
      // responde 409 ODONTOGRAMA_STALE si difieren.
      if (options.expectedUpdatedAt) body.expectedUpdatedAt = options.expectedUpdatedAt;
      // Timeout extendido: el odontograma clínico es longitudinal y la
      // respuesta incluye TODO el historial; en equipos con Mongo local lento
      // el guardado puede pasar de 10s. Si se aborta a los 10s, el servidor a
      // veces YA persistió el registro → el usuario veía "error" pese a que sí
      // se guardó. 30s reduce esos falsos negativos.
      const { data } = await API.post(
        `/patients/${patientId}/odontograma-clinico`,
        body,
        { timeout: 30000 }
      );
      return {
        exists: data.exists ?? true,
        datos: Array.isArray(data.datos) ? data.datos.map(mapFromBackend) : [],
        history: Array.isArray(data.history) ? data.history : [],
        updatedAt: data.updatedAt || null
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
        history: Array.isArray(data.history) ? data.history : [],
        updatedAt: data.updatedAt || null
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false, datos: [], history: [], updatedAt: null };
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