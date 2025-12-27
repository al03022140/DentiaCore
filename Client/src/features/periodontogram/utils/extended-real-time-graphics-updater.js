/**
 * ExtendedRealTimeGraphicsUpdater.js
 * Extensión del sistema de actualización en tiempo real para gráficas lineales
 * 
 * EXTENSIÓN de RealTimeGraphicsUpdater - NO duplicación
 * Integra PeriodontogramLinearGraphics con el sistema de actualización existente
 */

import RealTimeGraphicsUpdater from './real-time-graphics-updater.js';
import { PeriodontogramLinearGraphics } from './periodontogram-linear-graphics.js';
import { UniversalToothValidator } from '../../../shared/validators/universal-tooth-validator.js';
// Logger removido - usando console nativo
import { 
  LINEAR_GRAPHICS_CONFIG,
  ADVANCED_POLYGON_CONFIG,
  ADVANCED_CLINICAL_INDICATORS,
  ADVANCED_PERFORMANCE_CONFIG,
  ADVANCED_HOVER_CONFIG,
  REAL_TIME_FEEDBACK_CONFIG,
  EXTENDED_COLORS,
  QUALITY_METRICS_CONFIG,
  ADVANCED_LOGGING_CONFIG
} from './config.js';
import { getAllTeethData } from './periodontogram-utils.js';

export class ExtendedRealTimeGraphicsUpdater extends RealTimeGraphicsUpdater {
  constructor(canvasMap, engine, options = {}) {
    // Si se pasa un solo canvas, convertirlo a Map para compatibilidad
    if (canvasMap instanceof HTMLCanvasElement) {
      const singleCanvas = canvasMap;
      canvasMap = new Map();
      canvasMap.set('main', singleCanvas);
    }
    
    // Usar el primer canvas para la inicialización del padre
    const firstCanvas = canvasMap instanceof Map ? canvasMap.values().next().value : canvasMap;
    
    super(firstCanvas, engine, {
      ...options,
      enableLinearGraphics: true
    });
    
    // Almacenar mapa de canvas
    this.canvasMap = canvasMap;
    this.linearGraphicsInstances = new Map();
    this.linearGraphicsEnabled = options.enableLinearGraphics !== false;
    this.measurementCache = new Map();
    this.validationErrors = new Map();
    
    // Configuración extendida con nuevas funcionalidades avanzadas
    this.extendedOptions = {
      ...this.options,
      ...LINEAR_GRAPHICS_CONFIG.PERFORMANCE,
      ...ADVANCED_PERFORMANCE_CONFIG,
      enableLinearValidation: true,
      enableHoverEffects: ADVANCED_HOVER_CONFIG.ENABLED,
      enableFillEffects: true,
      enablePolygonMode: ADVANCED_POLYGON_CONFIG.ENABLED,
      enableClinicalIndicators: ADVANCED_CLINICAL_INDICATORS.ENABLED,
      enableRealTimeFeedback: REAL_TIME_FEEDBACK_CONFIG.ENABLED,
      enableQualityMetrics: QUALITY_METRICS_CONFIG.ENABLED
    };
    
    // Cachés avanzados
    this.performanceCache = new Map();
    this.clinicalIndicatorsCache = new Map();
    this.hoverEffectsCache = new Map();
    this.qualityMetricsHistory = [];
    this.feedbackMessages = new Map();
    this.hoverEventHandlers = {};
    
    this.initializeLinearGraphicsSystem();
  }
  
  /**
   * Inicializa el sistema de gráficas lineales
   */
  initializeLinearGraphicsSystem() {
    if (!this.linearGraphicsEnabled || !this.canvasMap) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('Gráficas lineales deshabilitadas');
      return;
    }
    
    try {
      // Crear instancias de gráficas lineales para cada canvas
      this.canvasMap.forEach((canvas, canvasKey) => {
        if (canvas instanceof HTMLCanvasElement) {
          // Extraer toothNumber y surface de la clave
          const [toothNumber, surface] = canvasKey.includes('-') ? canvasKey.split('-') : [canvasKey, 'vestibular'];
          
          const linearGraphics = new PeriodontogramLinearGraphics(canvas, {
            enableDirtyRegions: this.extendedOptions.enableDirtyRegions,
            debugMode: this.extendedOptions.debugMode || false
          }, parseInt(toothNumber), surface);
          
          this.linearGraphicsInstances.set(canvasKey, linearGraphics);
        } else {
          if (ADVANCED_LOGGING_CONFIG.enabled) console.warn(`⚠️ [ExtendedRealTimeGraphicsUpdater] Canvas para ${canvasKey} no es HTMLCanvasElement`);
        }
      });
      
      // Extender event listeners para incluir gráficas lineales
      this.setupExtendedEventListeners();
      
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`ExtendedRealTimeGraphicsUpdater inicializado con ${this.linearGraphicsInstances.size} instancias de gráficas lineales`);
    } catch (error) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.error('Error inicializando sistema de gráficas lineales:', error);
      this.linearGraphicsEnabled = false;
    }
  }
  
  /**
   * Configura event listeners extendidos para gráficas lineales
   */
  setupExtendedEventListeners() {
    // Extender el handler de input existente
    const originalHandler = this.createDebouncedInputHandler();
    
    const extendedHandler = (event) => {
      // Llamar handler original
      originalHandler(event);
      
      // Procesar gráficas lineales si es aplicable
      if (this.isLinearGraphicsInput(event.target)) {
        this.handleLinearGraphicsInput(event.target);
      }
    };
    
    // Reemplazar listeners con versión extendida
    document.removeEventListener('input', this.inputListeners.get('input'));
    document.removeEventListener('change', this.inputListeners.get('change'));
    
    document.addEventListener('input', extendedHandler);
    document.addEventListener('change', extendedHandler);
    
    // Actualizar referencias
    this.inputListeners.set('input', extendedHandler);
    this.inputListeners.set('change', extendedHandler);
    
    // Agregar listeners para efectos hover
    if (this.extendedOptions.enableHoverEffects) {
      this.setupHoverEffectListeners();
    }
  }
  
  /**
   * Verifica si un input es para gráficas lineales
   */
  isLinearGraphicsInput(element) {
    if (!element || !element.classList) return false;
    
    return element.classList.contains('gingivalMargin-input') ||
           element.classList.contains('probingDepth-input') ||
           element.classList.contains('gingival-margin-input') ||
           (element.classList.contains('measurement-input') && 
            (element.dataset.field === 'gingivalMargin' || element.dataset.field === 'probingDepth'));
  }
  
  /**
   * Maneja input para gráficas lineales con funcionalidades avanzadas
   */
  handleLinearGraphicsInput(input) {
    if (this.linearGraphicsInstances.size === 0) return;
    
    const startTime = performance.now();
    
    try {
      const toothNumber = this.extractToothNumber(input);
      const position = this.extractPosition(input);
      const field = this.extractField(input);
      const surface = this.extractSurface(input); // NUEVA: Detectar superficie específica
      const value = input.value === '' ? null : parseFloat(input.value);
      
      if (!toothNumber || position === null || !field || !surface) {
        this.logAdvanced('warn', 'Datos de input incompletos para gráficas lineales', {
          toothNumber, position, field, surface
        });
        return;
      }
      
      console.log(`🎯 [handleLinearGraphicsInput] Diente ${toothNumber} - Superficie: ${surface} - Campo: ${field} - Posición: ${position} - Valor: ${value}`);
      
      // Si el valor es null o vacío, solo actualizar el cache pero no renderizar elementos visuales
      if (value === null || value === undefined || isNaN(value)) {
      this.updateMeasurementCache(toothNumber, position, field, null, surface);
        // Limpiar cualquier elemento visual previo para esta posición específica
        this.clearVisualElementsForSpecificSurface(toothNumber, position, field, surface);
        return;
      }
      
      // Actualizar cache de mediciones con información de superficie
      this.updateMeasurementCache(toothNumber, position, field, value, surface);
      
      // Validación avanzada en tiempo real
      let validationResult = null;
      if (this.extendedOptions.enableLinearValidation) {
        validationResult = this.validateAdvancedLinearGraphicsInput(input, toothNumber, position, field, value);
      }
      
      // Detectar indicadores clínicos avanzados
      if (this.extendedOptions.enableClinicalIndicators) {
        this.detectAndShowClinicalIndicators(toothNumber, position, field, value);
      }
      
      // Feedback en tiempo real
      if (this.extendedOptions.enableRealTimeFeedback && validationResult) {
        this.showAdvancedRealTimeFeedback(input, validationResult, toothNumber, position);
      }
      
      // Obtener datos completos del diente para esa superficie específica
      const toothData = this.getCompleteToothMeasurements(toothNumber, surface);
      
      // CORREGIDO: Actualizar solo la superficie específica
      this.updateSpecificSurfaceLinearGraphics(toothNumber, toothData, field, position, value, surface);
      
      // Métricas de rendimiento
      if (this.extendedOptions.enableQualityMetrics) {
        this.recordPerformanceMetrics('handleLinearGraphicsInput', startTime, {
          toothNumber,
          field,
          surface,
          hasValidation: !!validationResult,
          instancesCount: this.linearGraphicsInstances.size
        });
      }
      
    } catch (error) {
      console.error('Error procesando input de gráficas lineales:', error);
    }
  }
  
  /**
   * Actualiza todas las gráficas lineales con nuevos datos
   */
  updateAllLinearGraphics(periodontogramData) {
    if (this.linearGraphicsInstances.size === 0 || !periodontogramData) return;
    
    try {
      this.linearGraphicsInstances.forEach((linearGraphics, canvasKey) => {
        // Extraer toothNumber de la clave del canvas
        const [toothNumber, surface] = canvasKey.includes('-') ? canvasKey.split('-') : [canvasKey, 'vestibular'];
        
        const allTeethData = getAllTeethData(periodontogramData) || periodontogramData;
        if (allTeethData && allTeethData[toothNumber]) {
          const toothData = allTeethData[toothNumber];
          const processedData = linearGraphics.processToothMeasurementData(parseInt(toothNumber), toothData);
          linearGraphics.updateToothLinearGraphics(parseInt(toothNumber), processedData);
        }
      });
    } catch (error) {
      console.error('Error actualizando todas las gráficas lineales:', error);
    }
  }
  
  /**
   * Extrae número de diente del input
   */
  extractToothNumber(input) {
    // Buscar en data attributes
    if (input.dataset.tooth) {
      return parseInt(input.dataset.tooth);
    }
    
    // Buscar en el contexto del DOM
    const cell = input.closest('.data-cell');
    if (cell) {
      const row = cell.closest('.data-row');
      if (row) {
        const cells = row.querySelectorAll('.data-cell');
        const cellIndex = Array.from(cells).indexOf(cell);
        
        // Mapear índice a número de diente
        return this.mapCellIndexToToothNumber(cellIndex, row);
      }
    }
    
    return null;
  }
  
  /**
   * Extrae posición (mesial, central, distal) del input
   */
  extractPosition(input) {
    if (input.dataset.position !== undefined) {
      return parseInt(input.dataset.position);
    }
    
    // Buscar en el contexto del input dentro de la celda
    const cell = input.closest('.data-cell');
    if (cell) {
      const inputs = cell.querySelectorAll('input[type="number"]');
      return Array.from(inputs).indexOf(input);
    }
    
    return null;
  }
  
  /**
   * Extrae el campo (gingivalMargin o probingDepth) del input
   */
  extractField(input) {
    if (input.dataset.field) {
      return input.dataset.field;
    }
    
    if (input.classList.contains('gingival-margin-input')) {
      return 'gingivalMargin';
    }
    
    if (input.classList.contains('probing-depth-input')) {
      return 'probingDepth';
    }
    
    // Buscar en el contexto de la fila
    const row = input.closest('.data-row');
    if (row) {
      const rowLabel = row.querySelector('.row-label');
      if (rowLabel) {
        const labelText = rowLabel.textContent.toLowerCase();
        if (labelText.includes('margen') || labelText.includes('gingival')) {
          return 'gingivalMargin';
        }
        if (labelText.includes('profundidad') || labelText.includes('sondaje')) {
          return 'probingDepth';
        }
      }
    }
    
    return null;
  }

  /**
   * Extrae la superficie específica del input (vestibular, palatine, lingual)
   */
  extractSurface(input) {
    // Buscar la sección padre que contiene información de superficie
    const vestibularSection = input.closest('.vestibular-section, .vestibular-table, .vestibular-images, .vestibular-superior, .vestibular-inferior');
    const palatineSection = input.closest('.palatine-section, .palatine-table, .palatine-images');
    const lingualSection = input.closest('.lingual-section, .lingual-table, .lingual-images');
    
    if (palatineSection) {
      return 'palatine';
    } else if (lingualSection) {
      return 'lingual';
    } else if (vestibularSection) {
      return 'vestibular';
    }
    
    // Fallback: buscar en el contexto más amplio por clases de tabla
    const tableSection = input.closest('.table-section');
    if (tableSection) {
      if (tableSection.classList.contains('palatine-section')) {
        return 'palatine';
      }
      if (tableSection.classList.contains('lingual-section')) {
        return 'lingual';
      }
      if (tableSection.classList.contains('vestibular-section')) {
        return 'vestibular';
      }
    }
    
    // Default a vestibular si no se puede determinar
    return 'vestibular';
  }
  
  /**
   * Mapea índice de celda a número de diente
   */
  mapCellIndexToToothNumber(cellIndex, row) {
    const isUpper = row.closest('.arch-section.superior') !== null;
    const isLower = row.closest('.arch-section.inferior') !== null;
    
    if (isUpper) {
      // Arcada superior: 18-11, 21-28
      if (cellIndex < 8) {
        return 18 - cellIndex;
      } else {
        return 21 + (cellIndex - 8);
      }
    } else if (isLower) {
      // Arcada inferior: 48-41, 31-38
      if (cellIndex < 8) {
        return 48 - cellIndex;
      } else {
        return 31 + (cellIndex - 8);
      }
    }
    
    return null;
  }
  
  /**
   * ACTUALIZADA: Ahora maneja caché por superficie específica
   */
  updateMeasurementCache(toothNumber, position, field, value, surface = null) {
    // Crear estructura de caché por superficie si se proporciona
    const cacheKey = surface ? `${toothNumber}-${surface}` : toothNumber;
    
    if (!this.measurementCache.has(cacheKey)) {
      this.measurementCache.set(cacheKey, {
        gingivalMargin: [null, null, null],
        probingDepth: [null, null, null]
      });
    }
    
    const toothData = this.measurementCache.get(cacheKey);
    if (toothData[field]) {
      toothData[field][position] = value;
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`📝 [updateMeasurementCache] ${surface ? `Superficie ${surface} - ` : ''}Diente ${toothNumber} - ${field}[${position}] = ${value}`);
    }
  }
  
  /**
   * Obtiene mediciones completas de un diente
   */
  /**
   * ACTUALIZADA: Obtiene mediciones completas, con soporte para superficie específica
   */
  getCompleteToothMeasurements(toothNumber, surface = null) {
    const cacheKey = surface ? `${toothNumber}-${surface}` : toothNumber;
    
    return this.measurementCache.get(cacheKey) || {
      gingivalMargin: [null, null, null],
      probingDepth: [null, null, null]
    };
  }

  /**
   * NUEVA: Limpia elementos visuales para una superficie específica
   */
  clearVisualElementsForSpecificSurface(toothNumber, position, field, surface) {
    const canvasKey = `${toothNumber}-${surface}`;
    const linearGraphics = this.linearGraphicsInstances.get(canvasKey);
    
    if (linearGraphics && typeof linearGraphics.clearSpecificPosition === 'function') {
      linearGraphics.clearSpecificPosition(toothNumber, position, field);
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🧹 [clearVisualElementsForSpecificSurface] Limpiada posición ${position} del campo ${field} en superficie ${surface} del diente ${toothNumber}`);
    } else if (linearGraphics && typeof linearGraphics.clearToothVisualElements === 'function') {
      // Fallback: limpiar todos los elementos visuales del diente
      linearGraphics.clearToothVisualElements(toothNumber);
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🧹 [clearVisualElementsForSpecificSurface] Limpiados todos los elementos visuales de superficie ${surface} del diente ${toothNumber}`);
    }
  }
  
  /**
   * Valida input de gráficas lineales en tiempo real
   */
  validateLinearGraphicsInput(input, toothNumber, position, field, value) {
    try {
      // Usar UniversalToothValidator para validación consolidada
      const validation = UniversalToothValidator.validateMeasurement(value, field.toUpperCase());
      
      // Crear estructura de respuesta compatible
      const validationResult = {
        isValid: validation.isValid,
        error: validation.errors?.[0] || null,
        warning: validation.warnings?.[0] || null,
        value: validation.sanitizedValue || value
      };
      
      // Aplicar feedback visual
      if (!validationResult.isValid) {
        this.showValidationError(input, validationResult.error || validationResult.warning, toothNumber, position);
      } else {
        this.clearValidationError(input, toothNumber, position);
        
        // Mostrar advertencias clínicas si existen
        if (validationResult.warning) {
          this.showValidationWarning(input, validationResult.warning, toothNumber, position);
        }
      }
      
      return validationResult;
      
    } catch (error) {
      console.error('Error en validación de gráficas lineales:', error);
      return {
        isValid: false,
        error: 'Error interno de validación'
      };
    }
  }
  
  /**
   * Muestra error de validación
   */
  showValidationError(input, message, toothNumber, position) {
    const errorKey = `${toothNumber}-${position}`;
    
    // Guardar error en cache
    this.validationErrors.set(errorKey, {
      message,
      timestamp: Date.now()
    });
    
    // Aplicar estilos de error
    input.classList.add('validation-error');
    input.style.borderColor = LINEAR_GRAPHICS_CONFIG.COLORS.VALIDATION_ERROR;
    
    // Mostrar tooltip o mensaje
    input.title = message;
    
    // Opcional: mostrar indicador visual en la gráfica
    if (this.linearGraphics) {
      // Aquí se podría agregar un indicador visual de error en la gráfica
    }
  }
  
  /**
   * Limpia error de validación
   */
  clearValidationError(input, toothNumber, position) {
    const errorKey = `${toothNumber}-${position}`;
    
    // Remover error del cache
    this.validationErrors.delete(errorKey);
    
    // Remover estilos de error
    input.classList.remove('validation-error', 'validation-warning');
    input.style.borderColor = '';
    input.title = '';
  }
  
  /**
   * Muestra advertencia de validación
   */
  showValidationWarning(input, message, toothNumber, position) {
    const warningKey = `${toothNumber}-${position}-warning`;
    
    // Aplicar estilos de advertencia
    input.classList.add('validation-warning');
    input.style.borderColor = LINEAR_GRAPHICS_CONFIG.COLORS.VALIDATION_WARNING || '#ffa500';
    
    // Mostrar tooltip
    input.title = message;
  }
  
  /**
   * Configura listeners para efectos hover avanzados
   */
  setupHoverEffectListeners() {
    const enterHandler = (event) => {
      if (this.isLinearGraphicsInput(event.target)) {
        this.handleAdvancedHoverEnter(event.target);
      }
    };
    const leaveHandler = (event) => {
      if (this.isLinearGraphicsInput(event.target)) {
        this.handleAdvancedHoverLeave(event.target);
      }
    };
    document.addEventListener('mouseenter', enterHandler, true);
    document.addEventListener('mouseleave', leaveHandler, true);
    this.hoverEventHandlers.mouseenter = enterHandler;
    this.hoverEventHandlers.mouseleave = leaveHandler;
    if (ADVANCED_HOVER_CONFIG.TOOLTIP.ENABLED) {
      const moveHandler = (event) => {
        if (this.isLinearGraphicsInput(event.target)) {
          this.updateHoverTooltipPosition(event);
        }
      };
      document.addEventListener('mousemove', moveHandler);
      this.hoverEventHandlers.mousemove = moveHandler;
    }
  }
  
  removeHoverEffectListeners() {
    const h = this.hoverEventHandlers || {};
    if (h.mouseenter) {
      document.removeEventListener('mouseenter', h.mouseenter, true);
    }
    if (h.mouseleave) {
      document.removeEventListener('mouseleave', h.mouseleave, true);
    }
    if (h.mousemove) {
      document.removeEventListener('mousemove', h.mousemove);
    }
    this.hoverEventHandlers = {};
  }
  
  /**
   * Actualiza todas las gráficas lineales
   */
  updateAllLinearGraphics(periodontogramData) {
    // Corrección: manejar múltiples instancias de gráficas lineales (una por superficie)
    if (!this.linearGraphicsInstances || this.linearGraphicsInstances.size === 0 || !periodontogramData) return;
    
    try {
      // Recorrer todas las instancias de gráficas lineales (una por superficie)
      this.linearGraphicsInstances.forEach((linearGraphics, canvasKey) => {
        const [toothNumber] = canvasKey.split('-');
        const allTeethData = getAllTeethData(periodontogramData) || periodontogramData;
        const toothData = allTeethData?.[toothNumber];
        if (toothData && (toothData.gingivalMargin || toothData.probingDepth)) {
          // Actualizar caché global (opcional)
          this.measurementCache.set(parseInt(toothNumber), {
            gingivalMargin: toothData.gingivalMargin || [null, null, null],
            probingDepth: toothData.probingDepth || [null, null, null]
          });

          // Delegar actualización a la instancia correspondiente
          linearGraphics.updateToothLinearGraphics(parseInt(toothNumber), toothData);
        }
      });
      
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('Todas las gráficas lineales actualizadas');
    } catch (error) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.error('Error actualizando todas las gráficas lineales:', error);
    }
  }
  
  /**
   * Validación avanzada de input de gráficas lineales
   */
  validateAdvancedLinearGraphicsInput(input, toothNumber, position, field, value) {
    try {
      // Usar UniversalToothValidator para validación consolidada
      const validation = UniversalToothValidator.validateMeasurement(value, field.toUpperCase());
      
      // Crear estructura de respuesta compatible
      const validationResult = {
        isValid: validation !== null && !isNaN(validation),
        value: validation,
        error: validation === null || isNaN(validation) ? `Valor inválido para ${field}` : null,
        clinicalIndicators: [],
        qualityScore: validation !== null && !isNaN(validation) ? 100 : 0,
        recommendations: []
      };
      
      // Aplicar feedback visual avanzado
      if (!validation.isValid) {
        this.showAdvancedValidationError(input, validation, toothNumber, position);
      } else {
        this.clearAdvancedValidationError(input, toothNumber, position);
        
        // Mostrar indicadores clínicos si existen
        if (validation.clinicalIndicators && validation.clinicalIndicators.length > 0) {
          this.showClinicalIndicators(input, validation.clinicalIndicators, toothNumber, position);
        }
      }
      
      return validation;
      
    } catch (error) {
      this.logAdvanced('error', 'Error en validación avanzada de gráficas lineales:', error);
      return {
        isValid: false,
        error: 'Error interno de validación avanzada',
        clinicalIndicators: [],
        qualityScore: 0,
        recommendations: []
      };
    }
  }
  
  /**
   * Detecta y muestra indicadores clínicos avanzados
   */
  detectAndShowClinicalIndicators(toothNumber, position, field, value) {
    if (!ADVANCED_CLINICAL_INDICATORS.ENABLED || value === null) return;
    
    const indicators = [];
    const toothData = this.getCompleteToothMeasurements(toothNumber);
    
    // Detectar bolsas patológicas
    if (field === 'probingDepth' && value >= ADVANCED_CLINICAL_INDICATORS.PATHOLOGICAL_POCKETS.THRESHOLD) {
      indicators.push({
        type: 'pathological_pocket',
        severity: value >= ADVANCED_CLINICAL_INDICATORS.PATHOLOGICAL_POCKETS.SEVERE_THRESHOLD ? 'severe' : 'moderate',
        message: `Bolsa patológica detectada: ${value}mm`,
        color: ADVANCED_CLINICAL_INDICATORS.PATHOLOGICAL_POCKETS.COLOR,
        position
      });
    }
    
    // Detectar recesión severa
    if (field === 'gingivalMargin' && value >= ADVANCED_CLINICAL_INDICATORS.SEVERE_RECESSION.THRESHOLD) {
      indicators.push({
        type: 'severe_recession',
        severity: value >= ADVANCED_CLINICAL_INDICATORS.SEVERE_RECESSION.SEVERE_THRESHOLD ? 'severe' : 'moderate',
        message: `Recesión severa detectada: ${value}mm`,
        color: ADVANCED_CLINICAL_INDICATORS.SEVERE_RECESSION.COLOR,
        position
      });
    }
    
    // Calcular pérdida de inserción si tenemos ambos valores
    if (toothData.gingivalMargin[position] !== null && toothData.probingDepth[position] !== null) {
      const attachmentLoss = toothData.gingivalMargin[position] + toothData.probingDepth[position];
      if (attachmentLoss >= ADVANCED_CLINICAL_INDICATORS.ATTACHMENT_LOSS.THRESHOLD) {
        indicators.push({
          type: 'attachment_loss',
          severity: attachmentLoss >= ADVANCED_CLINICAL_INDICATORS.ATTACHMENT_LOSS.SEVERE_THRESHOLD ? 'severe' : 'moderate',
          message: `Pérdida de inserción: ${attachmentLoss}mm`,
          color: ADVANCED_CLINICAL_INDICATORS.ATTACHMENT_LOSS.COLOR,
          position
        });
      }
    }
    
    // Cachear indicadores
    if (indicators.length > 0) {
      this.clinicalIndicatorsCache.set(`${toothNumber}-${position}`, {
        indicators,
        timestamp: Date.now()
      });
      
      // Mostrar animaciones si están habilitadas
      if (ADVANCED_CLINICAL_INDICATORS.ANIMATIONS.ENABLED) {
        this.animateClinicalIndicators(toothNumber, position, indicators);
      }
    }
  }
  
  /**
   * Muestra feedback en tiempo real avanzado
   */
  showAdvancedRealTimeFeedback(input, validationResult, toothNumber, position) {
    if (!REAL_TIME_FEEDBACK_CONFIG.ENABLED) return;
    
    const feedbackKey = `${toothNumber}-${position}`;
    
    // Limpiar feedback anterior
    this.clearRealTimeFeedback(feedbackKey);
    
    // Mostrar indicadores de validación
    if (REAL_TIME_FEEDBACK_CONFIG.VALIDATION_INDICATORS.ENABLED) {
      this.showValidationIndicator(input, validationResult, toothNumber, position);
    }
    
    // Mostrar progreso de calidad
    if (REAL_TIME_FEEDBACK_CONFIG.PROGRESS_INDICATORS.ENABLED && validationResult.qualityScore !== undefined) {
      this.showQualityProgress(input, validationResult.qualityScore, toothNumber, position);
    }
    
    // Mostrar recomendaciones
    if (validationResult.recommendations && validationResult.recommendations.length > 0) {
      this.showRecommendations(input, validationResult.recommendations, toothNumber, position);
    }
  }
  
  /**
   * Actualiza gráficas lineales con modo avanzado
   */
  /**
   * NUEVA FUNCIÓN: Actualiza solo la superficie específica donde se está ingresando el dato
   */
  updateSpecificSurfaceLinearGraphics(toothNumber, toothData, field, position, value, surface) {
    const canvasKey = `${toothNumber}-${surface}`;
    const linearGraphics = this.linearGraphicsInstances.get(canvasKey);
    
    console.log(`🎯 [updateSpecificSurfaceLinearGraphics] Actualizando solo: ${canvasKey} - Encontrado: ${!!linearGraphics}`);
    
    if (!linearGraphics) {
      console.warn(`⚠️ No se encontró instancia de gráficas lineales para ${canvasKey}`);
      return;
    }
    
    // Verificar si hay datos válidos para renderizar
    const hasValidData = toothData && (
      (toothData.gingivalMargin && toothData.gingivalMargin.some(val => val !== null && !isNaN(val))) ||
      (toothData.probingDepth && toothData.probingDepth.some(val => val !== null && !isNaN(val)))
    );
    
    if (hasValidData) {
      // Solo actualizar si hay datos válidos
      if (this.extendedOptions.enablePolygonMode && ADVANCED_POLYGON_CONFIG.ENABLED) {
        linearGraphics.updateToothLinearGraphicsAdvanced(toothNumber, toothData, {
          polygonMode: true,
          smoothing: ADVANCED_POLYGON_CONFIG.SMOOTHING,
          interpolation: ADVANCED_POLYGON_CONFIG.INTERPOLATION
        });
      } else {
        linearGraphics.updateToothLinearGraphics(toothNumber, toothData);
      }
      console.log(`✅ [updateSpecificSurfaceLinearGraphics] Actualizada superficie ${surface} del diente ${toothNumber}`);
    } else {
      // Si no hay datos válidos, limpiar elementos visuales
      linearGraphics.clearToothVisualElements(toothNumber);
      console.log(`🧹 [updateSpecificSurfaceLinearGraphics] Limpiada superficie ${surface} del diente ${toothNumber}`);
    }
  }

  /**
   * FUNCIÓN ORIGINAL: Actualiza todas las superficies (mantener para compatibilidad)
   */
  updateAdvancedLinearGraphics(toothNumber, toothData, field, position, value) {
    // Determinar superficies disponibles según el tipo de diente
    const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
    const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
    
    console.log(`🦷 [DEBUG] Diente ${toothNumber} - Tipo: ${isUpperTooth ? 'Superior' : 'Inferior'} - Superficies: [${surfaces.join(', ')}]`);
    
    let instancesUpdated = 0;
    
    // Verificar si hay datos válidos para renderizar
    const hasValidData = toothData && (
      (toothData.gingivalMargin && toothData.gingivalMargin.some(val => val !== null && !isNaN(val))) ||
      (toothData.probingDepth && toothData.probingDepth.some(val => val !== null && !isNaN(val)))
    );
    
    surfaces.forEach(surface => {
      const canvasKey = `${toothNumber}-${surface}`;
      const linearGraphics = this.linearGraphicsInstances.get(canvasKey);
      
      console.log(`🎨 [DEBUG] Buscando canvas: ${canvasKey} - Encontrado: ${!!linearGraphics}`);
      
      if (linearGraphics) {
        if (hasValidData) {
          // Solo actualizar si hay datos válidos
          if (this.extendedOptions.enablePolygonMode && ADVANCED_POLYGON_CONFIG.ENABLED) {
            linearGraphics.updateToothLinearGraphicsAdvanced(toothNumber, toothData, {
              polygonMode: true,
              smoothing: ADVANCED_POLYGON_CONFIG.SMOOTHING,
              interpolation: ADVANCED_POLYGON_CONFIG.INTERPOLATION
            });
          } else {
            linearGraphics.updateToothLinearGraphics(toothNumber, toothData);
          }
        } else {
          // Si no hay datos válidos, limpiar elementos visuales
          linearGraphics.clearToothVisualElements(toothNumber);
        }
        instancesUpdated++;
      }
    });
    
    console.log(`📊 [DEBUG] Diente ${toothNumber} - Instancias actualizadas: ${instancesUpdated}/${surfaces.length}`);
    
    if (instancesUpdated === 0) {
      this.logAdvanced('warn', `No se encontraron instancias de gráficas lineales para diente ${toothNumber}`);
    }
  }
  
  /**
   * Maneja entrada de hover avanzado
   */
  handleAdvancedHoverEnter(input) {
    if (!ADVANCED_HOVER_CONFIG.ENABLED) return;
    
    const toothNumber = this.extractToothNumber(input);
    const position = this.extractPosition(input);
    const field = this.extractField(input);
    
    if (!toothNumber || position === null || !field) return;
    
    const hoverKey = `${toothNumber}-${position}`;
    
    // Aplicar efectos de resaltado
    if (ADVANCED_HOVER_CONFIG.HIGHLIGHT.ENABLED) {
      this.applyAdvancedHoverHighlight(input, toothNumber, position);
    }
    
    // Mostrar tooltip avanzado
    if (ADVANCED_HOVER_CONFIG.TOOLTIP.ENABLED) {
      this.showAdvancedTooltip(input, toothNumber, position, field);
    }
    
    // Previsualización de mediciones
    if (ADVANCED_HOVER_CONFIG.MEASUREMENT_PREVIEW.ENABLED) {
      this.showMeasurementPreview(input, toothNumber, position, field);
    }
    
    // Cachear estado de hover
    this.hoverEffectsCache.set(hoverKey, {
      input,
      toothNumber,
      position,
      field,
      timestamp: Date.now()
    });
  }
  
  /**
   * Maneja salida de hover avanzado
   */
  handleAdvancedHoverLeave(input) {
    if (!ADVANCED_HOVER_CONFIG.ENABLED) return;
    
    const toothNumber = this.extractToothNumber(input);
    const position = this.extractPosition(input);
    
    if (!toothNumber || position === null) return;
    
    const hoverKey = `${toothNumber}-${position}`;
    
    // Remover efectos de hover
    this.removeAdvancedHoverEffects(input, toothNumber, position);
    
    // Limpiar cache
    this.hoverEffectsCache.delete(hoverKey);
  }
  
  applyAdvancedHoverHighlight(input, toothNumber, position) {
    const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
    const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
    surfaces.forEach(surface => {
      const canvasKey = `${toothNumber}-${surface}`;
      const linearGraphics = this.linearGraphicsInstances.get(canvasKey);
      if (linearGraphics && typeof linearGraphics.addHoverEffect === 'function') {
        linearGraphics.addHoverEffect(toothNumber, position);
      }
    });
    input.classList.add('measurement-hover-active');
  }
  
  removeAdvancedHoverEffects(input, toothNumber, position) {
    const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
    const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
    surfaces.forEach(surface => {
      const canvasKey = `${toothNumber}-${surface}`;
      const linearGraphics = this.linearGraphicsInstances.get(canvasKey);
      if (linearGraphics && typeof linearGraphics.removeHoverEffect === 'function') {
        linearGraphics.removeHoverEffect(toothNumber, position);
      }
    });
    input.classList.remove('measurement-hover-active');
    const tooltip = document.getElementById('advanced-periodontogram-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }
  
  showAdvancedTooltip(input, toothNumber, position, field) {
    const config = ADVANCED_HOVER_CONFIG.TOOLTIP || {};
    let tooltip = document.getElementById('advanced-periodontogram-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'advanced-periodontogram-tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.zIndex = '10000';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.background = '#222';
      tooltip.style.color = '#fff';
      tooltip.style.padding = '6px 8px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.fontSize = '12px';
      tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      document.body.appendChild(tooltip);
    }
    const text = `${field} · ${toothNumber} · ${position}`;
    tooltip.textContent = text;
    const rect = input.getBoundingClientRect();
    const left = rect.left + window.scrollX + rect.width + 8;
    const top = rect.top + window.scrollY - 4;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.opacity = '1';
  }
  
  updateHoverTooltipPosition(event) {
    const tooltip = document.getElementById('advanced-periodontogram-tooltip');
    if (!tooltip) return;
    const left = event.pageX + 12;
    const top = event.pageY + 12;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  
  /**
   * Registra métricas de rendimiento
   */
  recordPerformanceMetrics(operation, startTime, metadata = {}) {
    if (!QUALITY_METRICS_CONFIG.ENABLED) return;
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    const metric = {
      operation,
      duration,
      timestamp: Date.now(),
      metadata
    };
    
    // Añadir a historial
    this.qualityMetricsHistory.push(metric);
    
    // Mantener solo las últimas métricas
    if (this.qualityMetricsHistory.length > QUALITY_METRICS_CONFIG.PERFORMANCE.MAX_HISTORY) {
      this.qualityMetricsHistory.shift();
    }
    
    // Log si excede umbral
    if (duration > QUALITY_METRICS_CONFIG.PERFORMANCE.SLOW_OPERATION_THRESHOLD) {
      this.logAdvanced('warn', `Operación lenta detectada: ${operation} tomó ${duration.toFixed(2)}ms`, metadata);
    }
  }
  
  /**
   * Logging avanzado
   */
  logAdvanced(level, message, data = null) {
    if (!ADVANCED_LOGGING_CONFIG.ENABLED) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      component: 'ExtendedRealTimeGraphicsUpdater',
      message,
      data
    };
    
    // Log según configuración
    if (ADVANCED_LOGGING_CONFIG.CONSOLE.ENABLED) {
      console[level](`[${logEntry.component}] ${message}`, data || '');
    }
    
    // Log usando console nativo
    if (console && console[level]) {
      console[level](message, data);
    }
  }
  
  /**
   * Limpia elementos visuales para una posición específica
   */
  clearVisualElementsForPosition(toothNumber, position, field) {
    // Determinar superficies disponibles según el tipo de diente
    const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
    const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
    
    surfaces.forEach(surface => {
      const canvasKey = `${toothNumber}-${surface}`;
      const linearGraphics = this.linearGraphicsInstances.get(canvasKey);
      
      if (linearGraphics && linearGraphics.clearPositionVisualElements) {
        linearGraphics.clearPositionVisualElements(toothNumber, position, field);
      }
    });
  }
  
  /**
   * Limpia recursos extendidos
   */
  cleanup() {
    // Limpiar gráficas lineales
    if (this.linearGraphics) {
      this.linearGraphics.cleanup();
      this.linearGraphics = null;
    }
    
    // Limpiar instancias de gráficas lineales
    this.linearGraphicsInstances.forEach(instance => {
      if (instance && instance.cleanup) {
        instance.cleanup();
      }
    });
    this.linearGraphicsInstances.clear();
    
    // Limpiar caches avanzados
    this.measurementCache.clear();
    this.validationErrors.clear();
    this.performanceCache.clear();
    this.clinicalIndicatorsCache.clear();
    this.hoverEffectsCache.clear();
    this.feedbackMessages.clear();
    this.qualityMetricsHistory.length = 0;
    
    this.removeHoverEffectListeners();
    
    // Llamar cleanup del padre
    super.cleanup();
    
    if (ADVANCED_LOGGING_CONFIG.enabled) this.logAdvanced('info', 'ExtendedRealTimeGraphicsUpdater limpiado correctamente');
  }
  
  /**
   * Obtiene métricas de performance extendidas
   */
  getExtendedPerformanceMetrics() {
    const baseMetrics = this.getPerformanceMetrics ? this.getPerformanceMetrics() : {};
    
    // Calcular métricas de rendimiento
    const avgDuration = this.qualityMetricsHistory.length > 0 
      ? this.qualityMetricsHistory.reduce((sum, m) => sum + m.duration, 0) / this.qualityMetricsHistory.length
      : 0;
    
    const slowOperations = this.qualityMetricsHistory.filter(
      m => m.duration > QUALITY_METRICS_CONFIG.PERFORMANCE.SLOW_OPERATION_THRESHOLD
    ).length;
    
    return {
      ...baseMetrics,
      linearGraphics: {
        enabled: this.linearGraphicsEnabled,
        cachedMeasurements: this.measurementCache.size,
        validationErrors: this.validationErrors.size,
        instances: this.linearGraphicsInstances.size,
        lastUpdate: this.linearGraphics ? Date.now() : null
      },
      advanced: {
        polygonMode: this.extendedOptions.enablePolygonMode,
        clinicalIndicators: {
          enabled: this.extendedOptions.enableClinicalIndicators,
          cached: this.clinicalIndicatorsCache.size
        },
        hoverEffects: {
          enabled: this.extendedOptions.enableHoverEffects,
          active: this.hoverEffectsCache.size
        },
        realTimeFeedback: {
          enabled: this.extendedOptions.enableRealTimeFeedback,
          messages: this.feedbackMessages.size
        },
        performance: {
          avgDuration: Math.round(avgDuration * 100) / 100,
          slowOperations,
          totalOperations: this.qualityMetricsHistory.length,
          cacheHitRate: this.calculateCacheHitRate()
        }
      }
    };
  }
  
  /**
   * Calcula la tasa de aciertos del cache
   */
  calculateCacheHitRate() {
    const totalRequests = this.performanceCache.size + this.measurementCache.size;
    if (totalRequests === 0) return 0;
    
    const hits = Array.from(this.performanceCache.values()).filter(entry => entry.hit).length;
    return Math.round((hits / totalRequests) * 100);
  }
}

export default ExtendedRealTimeGraphicsUpdater;