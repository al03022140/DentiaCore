/**
 * 🔄 GESTOR DE ESTADO DE PERIODONTOGRAMA - CONSOLIDADO
 * 
 * Gestor centralizado de estado para el periodontograma.
 * Utiliza configuración centralizada, validador universal y middleware de transformación.
 * 
 * CARACTERÍSTICAS:
 * ✅ Estado centralizado y consistente
 * ✅ Validación robusta con el validador universal
 * ✅ Transformación de datos con middleware consolidado
 * ✅ Debounce optimizado para guardado
 * ✅ Manejo de errores robusto
 * ✅ Logging integrado
 * ✅ Configuración centralizada
 * 
 * @version 4.0.0 - CONSOLIDACIÓN DEFINITIVA
 * @author Sistema de Normalización Crítica
 */

import PERIODONTOGRAM_CONFIG from '../../../shared/config/periodontogram-config.js';

// PeriodontogramData ahora se maneja completamente en el backend
import { getToothData as getToothDataUtil, getAllTeethData } from './periodontogram-utils.js';
import { UniversalToothValidator } from '../../../shared/validators/universal-tooth-validator.js';

// Importar configuración centralizada
const {
  ALL_VALID_TEETH,
  SAVE_CONFIG,
  CACHE_CONFIG,
  LOGGING_CONFIG,
  MEASUREMENT_LIMITS,
  FIELD_OPTIONS
} = PERIODONTOGRAM_CONFIG;

/**
 * Gestor simplificado de estado del periodontograma
 */
export class PeriodontogramStateManager {
  constructor(initialData = {}) {
    // Estado básico
    this.teeth = { teeth: {}, patientId: null, date: new Date().toISOString() };
    this.selectedTooth = null;
    
    // Cargar datos iniciales si se proporcionan
    if (initialData && Object.keys(initialData).length > 0) {
      this.loadData(initialData);
    }
    
    // Cargar desde localStorage si existe
    this.loadFromLocalStorage();
  }

  // ==========================================
  // GESTIÓN BÁSICA DE ESTADO DE DIENTES
  // ==========================================

  /**
   * Obtiene el estado de un diente
   * 
   * @param {number} toothNumber - Número del diente
   * @returns {Object|null} - Estado del diente
   */
  getToothData(toothNumber) {
    try {
      return getToothDataUtil(this.teeth, toothNumber);
    } catch (error) {
      console.warn(`Error obteniendo datos del diente ${toothNumber}:`, error);
      return null;
    }
  }

  /**
   * Actualiza los datos de un diente específico usando configuración centralizada
   * @param {number} toothNumber - Número del diente
   * @param {string} field - Campo a actualizar
   * @param {*} value - Nuevo valor
   * @returns {boolean} - Éxito de la operación
   */
  updateToothData(toothNumber, field, value) {
    try {
      // Validar número de diente usando configuración centralizada
      if (!PERIODONTOGRAM_CONFIG.isValidToothNumber(toothNumber)) {
        if (LOGGING_CONFIG.enabled) {
          console.warn(`Número de diente inválido: ${toothNumber}`);
        }
        return false;
      }
      
      // Obtener datos actuales del diente
      const currentData = this.getToothData(toothNumber) || UniversalToothValidator.getDefaultToothData(toothNumber);
      
      // Crear objeto de actualización
      const updates = { [field]: value };
      
      // Validar y aplicar actualizaciones usando validador consolidado
      const validatedData = UniversalToothValidator.validateCompleteToothData({
        ...currentData,
        ...updates
      });
      
      // Aplicar datos validados al diente
      if (!this.teeth.teeth) {
        this.teeth.teeth = {};
      }
      
      this.teeth.teeth[toothNumber] = validatedData;
      
      // INVALIDAR CACHÉ DE ESTADÍSTICAS EXPLÍCITAMENTE
      UniversalToothValidator.invalidateCache('statistics');
      
      // Guardar cambios
      this.saveToLocalStorage();
      
      if (LOGGING_CONFIG.enabled && LOGGING_CONFIG.level === 'debug') {
        console.log(`Diente ${toothNumber} actualizado - caché invalidado`);
      }
      
      return true;
      
    } catch (error) {
      if (LOGGING_CONFIG.enabled) {
        console.error(`Error actualizando diente ${toothNumber}:`, error);
      }
      return false;
    }
  }

  /**
   * Alterna la ausencia de un diente
   * 
   * @param {number} toothNumber - Número del diente
   * @returns {boolean} - Éxito de la operación
   */
  toggleToothAbsent(toothNumber) {
    try {
      // Obtener datos actuales del diente
      const currentData = this.getToothData(toothNumber) || UniversalToothValidator.getDefaultToothData(toothNumber);

      // Alternar el estado de ausencia
      const newAbsentValue = !currentData.absent;
      // Actualizar solo el campo moderno
      const absentUpdated = this.updateToothData(toothNumber, 'absent', newAbsentValue);

      const success = absentUpdated;

      if (LOGGING_CONFIG.enabled && LOGGING_CONFIG.level === 'debug') {
        console.log(`Diente ${toothNumber} ${newAbsentValue ? 'marcado como ausente' : 'marcado como presente'} - caché invalidado`);
      }

      return success;
    } catch (error) {
      console.error(`Error alternando ausencia del diente ${toothNumber}:`, error);
      return false;
    }
  }

  /**
   * Resetea los datos clínicos de un diente
   * 
   * @param {number} toothNumber - Número del diente
   * @returns {boolean} - Éxito de la operación
   */
  resetToothClinicalData(toothNumber) {
    try {
      // Obtener datos actuales del diente
      const currentData = this.getToothData(toothNumber);
      if (!currentData) {
        return false;
      }
      
      // Crear datos reseteados manteniendo la disponibilidad
      const resetData = {
        ...UniversalToothValidator.getDefaultToothData(toothNumber),
        absent: currentData.absent // Mantener estado de ausencia
      };
      
      // Aplicar datos reseteados
      if (!this.teeth.teeth) {
        this.teeth.teeth = {};
      }
      
      this.teeth.teeth[toothNumber] = resetData;
      
      // INVALIDAR CACHÉ DE ESTADÍSTICAS EXPLÍCITAMENTE
      UniversalToothValidator.invalidateCache('statistics');
      
      this.saveToLocalStorage();
      
      if (LOGGING_CONFIG.enabled && LOGGING_CONFIG.level === 'debug') {
        console.log(`Datos clínicos del diente ${toothNumber} reseteados - caché invalidado`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error reseteando datos clínicos del diente ${toothNumber}:`, error);
      return false;
    }
  }

  // ==========================================
  // GESTIÓN DE SELECCIÓN
  // ==========================================

  /**
   * Selecciona un diente
   * 
   * @param {number} toothNumber - Número del diente
   */
  selectTooth(toothNumber) {
    this.selectedTooth = toothNumber;
  }

  /**
   * Obtiene el diente seleccionado
   * 
   * @returns {number|null} - Número del diente seleccionado
   */
  getSelectedTooth() {
    return this.selectedTooth;
  }

  /**
   * Deselecciona el diente actual
   */
  clearSelection() {
    this.selectedTooth = null;
  }

  // ==========================================
  // OPERACIONES BÁSICAS DE DATOS
  // ==========================================

  /**
   * Obtiene los datos del periodontograma en formato crudo
   * 
   * @returns {Object} - Datos crudos almacenados internamente
   */
  getData() {
    return this.teeth;
  }

  /**
   * Obtiene todos los datos del periodontograma
   * 
   * @returns {Object} - Datos completos
   */
  getAllData() {
    return {
      teeth: getAllTeethData(this.teeth),
      selectedTooth: this.selectedTooth
    };
  }

  /**
   * Carga datos en el gestor
   * 
   * @param {Object} data - Datos a cargar
   */
  loadData(data) {
    try {
      if (data.teeth) {
        // Cargar datos de dientes validando estructura completa
        Object.entries(data.teeth).forEach(([toothNumber, toothData]) => {
          const numericToothNumber = parseInt(toothNumber);
          // Completar y validar datos usando el validador universal
          const validatedData = UniversalToothValidator.validateCompleteToothData(
            {
              ...toothData,
              toothNumber: numericToothNumber
            },
            numericToothNumber
          );

          if (!this.teeth.teeth) {
            this.teeth.teeth = {};
          }

          this.teeth.teeth[numericToothNumber] = validatedData;
        });
      }

      if (data.selectedTooth) {
        this.selectedTooth = data.selectedTooth;
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  }

  /**
   * Obtiene dientes disponibles
   * 
   * @returns {Array} - Lista de números de dientes disponibles
   */
  getAvailableTeeth() {
    const availableTeeth = [];

    for (let toothNumber of [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48]) {
      const toothData = getToothDataUtil(this.teeth, toothNumber);
      if (toothData && !toothData.absent) {
        availableTeeth.push(toothNumber);
      }
    }

    return availableTeeth;
  }

  /**
   * Obtiene dientes ausentes
   * 
   * @returns {Array} - Lista de números de dientes ausentes
   */
  getAbsentTeeth() {
    const absentTeeth = [];
    
    for (let toothNumber of [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48]) {
      const toothData = getToothDataUtil(this.teeth, toothNumber);
      if (toothData && toothData.absent) {
        absentTeeth.push(toothNumber);
      }
    }
    
    return absentTeeth;
  }

  // ==========================================
  // PERSISTENCIA LOCAL BÁSICA
  // ==========================================

  /**
   * Guarda el estado en localStorage usando configuración centralizada
   */
  saveToLocalStorage() {
    try {
      const dataToSave = {
        teeth: getAllTeethData(this.teeth),
        selectedTooth: this.selectedTooth,
        timestamp: new Date().toISOString()
      };
      
      // Guardar directamente en formato frontend (sin transformar)
      localStorage.setItem('periodontogram_state', JSON.stringify(dataToSave));
      
      if (LOGGING_CONFIG.enabled && LOGGING_CONFIG.level === 'debug') {
        console.log('Datos guardados en localStorage');
      }
      
    } catch (error) {
      if (LOGGING_CONFIG.enabled) {
        console.error('Error guardando en localStorage:', error);
      }
    }
  }

  /**
   * Carga el estado desde localStorage
   */
  loadFromLocalStorage() {
    try {
      const savedData = localStorage.getItem('periodontogram_state');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        this.loadData(parsedData);
      }
    } catch (error) {
      console.error('Error cargando desde localStorage:', error);
    }
  }

  /**
   * Limpia los datos guardados en localStorage
   */
  clearLocalStorage() {
    try {
      localStorage.removeItem('periodontogram_state');
    } catch (error) {
      console.error('Error limpiando localStorage:', error);
    }
  }

  // ==========================================
  // UTILIDADES BÁSICAS
  // ==========================================

  /**
   * Resetea todo el estado a valores por defecto
   */
  reset() {
    this.teeth = { teeth: {}, patientId: null, date: new Date().toISOString() };
    this.selectedTooth = null;
    this.clearLocalStorage();
  }

  /**
   * Obtiene estadísticas básicas
   * 
   * @returns {Object} - Estadísticas básicas
   */
  /**
   * Obtiene estadísticas básicas del periodontograma usando configuración centralizada
   * @returns {Object} Estadísticas básicas
   */
  getBasicStatistics() {
    try {
      // Preparar datos en formato esperado por calculateStatistics
      const periodontogramData = {
        teeth: this.teeth.teeth || this.teeth
      };
      
      const stats = UniversalToothValidator.calculateStatistics(periodontogramData);
      
      if (LOGGING_CONFIG.enabled && LOGGING_CONFIG.level === 'debug') {
        console.log('Estadísticas calculadas:', stats);
      }
      
      return stats;
    } catch (error) {
      if (LOGGING_CONFIG.enabled) {
        console.error('Error calculando estadísticas:', error);
      }
      return {
        totalTeeth: 0,
        availableTeeth: 0,
        absentTeeth: 0,
        teethWithBleeding: 0,
        teethWithSuppuration: 0,
        teethWithPlaque: 0,
        averageProbingDepth: 0,
        maxProbingDepth: 0
      };
    }
  }
}

// ==========================================
// FUNCIONES DE COMPATIBILIDAD LEGACY
// ==========================================

// Instancia global para compatibilidad
let globalStateManager = null;

/**
 * Obtiene el gestor de estado global
 */
export const getGlobalStateManager = () => {
  if (!globalStateManager) {
    globalStateManager = new PeriodontogramStateManager();
  }
  return globalStateManager;
};

/**
 * Helper central para obtener disponibilidad de diente
 * Convierte el estado 'absent' a la semántica 'disponible/presente'
 * 
 * @param {boolean} absent - Estado de ausencia del diente
 * @returns {boolean} - true si el diente está presente/disponible, false si está ausente
 */
export const getToothAvailability = (absent) => {
  return !absent;
};

/**
 * Funciones legacy para compatibilidad hacia atrás
 */
export const toggleToothAbsent = (toothNumber) => {
  const manager = getGlobalStateManager();
  return manager.toggleToothAbsent(toothNumber);
};

export const resetToothClinicalData = (toothNumber) => {
  const manager = getGlobalStateManager();
  return manager.resetToothClinicalData(toothNumber);
};

export const getAvailableTeeth = () => {
  const manager = getGlobalStateManager();
  return manager.getAvailableTeeth();
};

export const getAbsentTeeth = () => {
  const manager = getGlobalStateManager();
  return manager.getAbsentTeeth();
};

// Exportación por defecto
export default PeriodontogramStateManager;