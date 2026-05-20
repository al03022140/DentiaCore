import API from './axios-instance.js';
import { ADVANCED_LOGGING_CONFIG } from '../../features/periodontogram/utils/config.js';

// Configuración de timeouts
const UPLOAD_TIMEOUT = 15000; // 15 segundos para subidas
const DEFAULT_TIMEOUT = 10000; // 10 segundos para otras peticiones

/**
 * @typedef {Object} PeriodontogramResponse
 * @property {boolean} exists - Indica si existe un periodontograma
 * @property {Object} data - Datos del periodontograma
 * @property {Object} statistics - Estadísticas del periodontograma
 */



/**
 * @typedef {Object} PeriodontogramVersionsResponse
 * @property {Array} versions - Lista de versiones disponibles
 * @property {Object} latest - Última versión
 */

// Helper para manejar errores de API
const buildApiError = (message, { status, code } = {}, originalError = null) => {
  const apiError = new Error(message);
  if (status !== undefined) {
    apiError.status = status;
  }
  if (code !== undefined) {
    apiError.code = code;
  }
  if (originalError) {
    apiError.originalError = originalError;
  }
  return apiError;
};

const handleApiError = (error) => {
  if (error.code === 'ECONNABORTED') {
    throw buildApiError('La operación tardó demasiado. Por favor, intente nuevamente.', { code: error.code }, error);
  }
  
  if (error.response) {
    const { status, data } = error.response;
    let message;

    switch (status) {
      case 400:
        message = data?.details || data?.error || 'Error de validación en los datos';
        break;
      case 413:
        message = 'El archivo es demasiado grande. El tamaño máximo permitido es 5MB';
        break;
      case 415:
        message = 'Tipo de contenido no permitido. Se requieren datos JSON válidos';
        break;
      case 404:
        message = 'Periodontograma no encontrado';
        break;
      case 500:
        message = 'Error interno del servidor. Por favor, intente más tarde';
        break;
      default:
        message = data?.error || 'Error en la operación';
        break;
    }

    throw buildApiError(message, { status, code: error.code }, error);
  }
  
  if (error.request) {
    throw buildApiError('Error de conexión. Por favor, verifique su conexión a internet', { code: error.code }, error);
  }
  
  throw buildApiError('Error al configurar la petición', { code: error.code }, error);
};

// Normalizador de compatibilidad para datos legacy (claves en inglés y caras)
const normalizeLegacyTeethData = (data) => {
  try {
    if (!data || typeof data !== 'object') return data;
    const { teeth } = data;
    if (teeth && typeof teeth === 'object') {
      Object.values(teeth).forEach((tooth) => {
        if (!tooth || typeof tooth !== 'object') return;
        // Compatibilidad de cara: alias palatino cuando solo existe lingualPalatino
        if (tooth.lingualPalatino && !tooth.palatino) {
          tooth.palatino = tooth.lingualPalatino;
        }
        // Normalizar claves inglesas a españolas dentro de cada cara
        ['vestibular', 'palatino', 'lingualPalatino'].forEach((faceKey) => {
          const face = tooth[faceKey];
          if (face && typeof face === 'object') {
            if (face.plaque !== undefined && face.placa === undefined) {
              face.placa = face.plaque;
            }
            if (face.suppuration !== undefined && face.supuracion === undefined) {
              face.supuracion = face.suppuration;
            }
          }
        });
      });
    }
    return data;
  } catch {
    return data;
  }
};

/**
 * Servicio para operaciones del periodontograma
 */
class PeriodontogramService {
  /**
   * Obtiene el periodontograma de un paciente
   * @param {string} patientId - ID del paciente
   * @returns {Promise<PeriodontogramResponse>}
   */
  static async getPeriodontogram(patientId) {
    try {
      console.log('🔍 Obteniendo periodontograma para paciente:', patientId);
      
      const response = await API.get(`/patients/${patientId}/periodontogram`, {
        timeout: DEFAULT_TIMEOUT
      });
      
      console.log('✅ Periodontograma obtenido exitosamente');
      return response.data;
    } catch (error) {
      console.error('❌ Error obteniendo periodontograma:', error);
      handleApiError(error);
    }
  }

  /**
   * Crea un nuevo periodontograma para un paciente
   * @param {string} patientId - ID del paciente
   * @param {Object} initialData - Datos iniciales del periodontograma
   * @returns {Promise<PeriodontogramResponse>}
   */
  static async createPeriodontogram(patientId, initialData = {}) {
    try {
      console.log('🚀 Creando periodontograma para paciente:', patientId);
      
      const response = await API.post(`/patients/${patientId}/periodontogram`, {
        initialData
      }, {
        timeout: DEFAULT_TIMEOUT
      });
      
      console.log('✅ Periodontograma creado exitosamente');
      return response.data;
    } catch (error) {
      if (error.response?.status === 409) {
        console.info('ℹ️ Periodontograma ya existe. Obteniendo el registro actual.');
        return await this.getPeriodontogram(patientId);
      }
      console.error('❌ Error creando periodontograma:', error);
      handleApiError(error);
    }
  }

  /**
   * Actualiza los datos del periodontograma
   * @deprecated Use saveData para usar el endpoint unificado /periodontogram/data
   * @param {string} patientId - ID del paciente
   * @param {Object} data - Datos del periodontograma a actualizar
   * @returns {Promise<PeriodontogramResponse>}
   */
  static async updatePeriodontogram(patientId, data) {
    try {
      console.warn('⚠️ updatePeriodontogram está deprecado. Redirigiendo a saveData para usar el endpoint unificado /periodontogram/data');
      // Delegar al flujo unificado que valida con el esquema y no rechaza claves canónicas
      return await this.saveData(patientId, data);
    } catch (error) {
      console.error('❌ Error actualizando periodontograma (delegado a saveData):', error);
      handleApiError(error);
    }
  }

  // Funciones de imágenes eliminadas tras migración a JSON puro

  /**
   * Verifica si existe un periodontograma para el paciente intentando obtener los datos
   * @param {string} patientId - ID del paciente
   * @returns {Promise<boolean>}
   */
  static async exists(patientId) {
    try {
      console.log('🔍 Verificando existencia de periodontograma para paciente:', patientId);
      
      const data = await this.getData(patientId);
      console.log('✅ Periodontograma existe');
      return !!data;
    } catch (error) {
      console.log('📝 Periodontograma no existe o error al obtener datos');
      // Si hay error 404 o cualquier otro error, asumimos que no existe
      return false;
    }
  }

  /**
   * Obtiene las estadísticas del periodontograma
   * @param {string} patientId - ID del paciente
   * @param {string} version - Versión específica (opcional)
   * @returns {Promise<Object>}
   */
  static async getStatistics(patientId, version = null) {
    try {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('📊 Obteniendo estadísticas del periodontograma:', {
        patientId,
        version
      });
      
      const url = version 
        ? `/patients/${patientId}/periodontogram/statistics/${version}`
        : `/patients/${patientId}/periodontogram/statistics`;
      
      const response = await API.get(url, {
        timeout: DEFAULT_TIMEOUT
      });
      
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('✅ Estadísticas obtenidas exitosamente');
      return response.data;
    } catch (error) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.error('❌ Error obteniendo estadísticas:', error);
      handleApiError(error);
    }
  }

  static async saveData(patientId, periodontogramData, options = {}) {
    try {
      if (ADVANCED_LOGGING_CONFIG.enabled) {
        console.log('💾 Guardando datos JSON del periodontograma:', {
          patientId,
          versionName: periodontogramData?.versionName
        });
      }

      const body = options.appointmentId
        ? { ...periodontogramData, appointmentId: options.appointmentId }
        : periodontogramData;

      const response = await API.put(
        `/patients/${patientId}/periodontogram/data`,
        body,
        {
          timeout: DEFAULT_TIMEOUT,
          signal: options.signal
        }
      );

      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('✅ Datos JSON guardados exitosamente');
      return response.data;
    } catch (error) {
      if (error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
        console.error('❌ Error guardando datos JSON:', error);
      }
      handleApiError(error);
    }
  }

  /**
   * Obtiene los datos JSON de un periodontograma
   * @param {string} patientId - ID del paciente
   * @param {string|null} version - Nombre de versión (opcional). Si es null se devuelve la última.
   * @returns {Promise<Object>} - Objeto con { teeth, statistics, versionName }
   */
  static async getData(patientId, version = null, options = {}) {
    try {
      if (ADVANCED_LOGGING_CONFIG.enabled) {
        console.log('📄 Obteniendo datos JSON del periodontograma:', {
          patientId,
          version
        });
      }

      const url = version
        ? `/patients/${patientId}/periodontogram/data?version=${encodeURIComponent(version)}`
        : `/patients/${patientId}/periodontogram/data`;

      const response = await API.get(url, {
        timeout: DEFAULT_TIMEOUT,
        signal: options.signal
      });

      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('✅ Datos JSON obtenidos exitosamente');
      const result = response.data?.data || response.data;
      return normalizeLegacyTeethData(result);
    } catch (error) {
      if (error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
        console.error('❌ Error obteniendo datos JSON:', error);
      }
      handleApiError(error);
    }
  }

  /**
   * Obtiene la lista de versiones disponibles de datos JSON
   * @param {string} patientId - ID del paciente
   * @returns {Promise<string[]>} - Lista de nombres de versión
   */
  static async getDataVersions(patientId, options = {}) {
    try {
      if (ADVANCED_LOGGING_CONFIG.enabled) {
        console.log('📚 Obteniendo lista de versiones JSON del periodontograma:', patientId);
      }

      const response = await API.get(
        `/patients/${patientId}/periodontogram/data?listVersions=true`,
        {
          timeout: DEFAULT_TIMEOUT,
          signal: options.signal
        }
      );

      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('✅ Lista de versiones obtenida exitosamente');
      const rawVersions = response.data?.versions || [];

      // Solo aceptar versiones con versionName válido (no otros campos como id, name, etc.)
      const mapped = rawVersions
        .map((entry) => {
          if (!entry) return null;
          
          // Si es string directamente, asumimos que es un versionName
          if (typeof entry === 'string') {
            return entry.trim();
          }
          
          // Si es objeto, SOLO aceptar la propiedad 'versionName'
          // No aceptar 'name', 'version', 'id' u otras propiedades
          if (typeof entry === 'object' && entry.versionName) {
            return String(entry.versionName).trim();
          }
          
          return null;
        });

      // Filtrar inválidos y excluir ObjectIds de Mongo
      const filtered = mapped.filter((versionName) => {
          // Filtrar solo strings válidos que representen versiones del periodontograma
          if (typeof versionName !== 'string' || versionName.trim().length === 0) {
            return false;
          }
          
          // Excluir IDs de MongoDB u otros valores que no sean fechas/versiones
          // Los versionName válidos deberían tener formato de fecha o timestamp
          const isMongoId = /^[a-f0-9]{24}$/i.test(versionName);
          
          return !isMongoId;
        });

      // Eliminar duplicados preservando el orden (el backend ya viene ordenado por fecha desc)
      const seen = new Set();
      const deduped = [];
      for (const v of filtered) {
        if (!seen.has(v)) {
          seen.add(v);
          deduped.push(v);
        }
      }

      return deduped;
    } catch (error) {
      if (error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
        console.error('❌ Error obteniendo lista de versiones JSON:', error);
      }
      handleApiError(error);
    }
  }

  static async deletePeriodontogram(patientId) {
    try {
      console.log('🗑️ Eliminando periodontograma para paciente:', patientId);
      await API.delete(`/patients/${patientId}/periodontogram`, {
        timeout: DEFAULT_TIMEOUT
      });
      console.log('✅ Periodontograma eliminado correctamente');
    } catch (error) {
      console.error('❌ Error eliminando periodontograma:', error);
      handleApiError(error);
    }
  }
}

export default PeriodontogramService;

// Exportaciones adicionales para compatibilidad
export {
  PeriodontogramService,
  handleApiError,
  UPLOAD_TIMEOUT,
  DEFAULT_TIMEOUT
};