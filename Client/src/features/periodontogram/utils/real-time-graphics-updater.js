/**
 * RealTimeGraphicsUpdater.js
 * Sistema de actualización en tiempo real para gráficas del periodontograma
 * Implementa feedback visual instantáneo para líneas de margen gingival y profundidad de sondaje
 * 
 * MEJORA CRÍTICA #1: Actualización instantánea de gráficas
 * - Escucha eventos 'input' para actualización inmediata
 * - Renderizado selectivo por regiones para optimizar performance
 * - Validación en tiempo real con feedback visual
 */

// import PeriodontogramLogger from './logger.js';

class RealTimeGraphicsUpdater {
  constructor(canvas, engine, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d');
    this.engine = engine;
    this.options = {
      // Configuración de colores
      gingivalMarginColor: '#0066CC',
      probingDepthColor: '#CC0000',
      validationErrorColor: '#FF6B6B',
      
      // Configuración de líneas
      gingivalLineWidth: 2,
      probingLineWidth: 3,
      measurementScale: 5,
      
      // Configuración de validación
      enableRealTimeValidation: true,
      showValidationErrors: true,
      
      // Configuración de performance
      debounceDelay: 16, // ~60 FPS
      enableDirtyRegions: true,
      
      ...options
    };
    
    // Estado interno
    this.dirtyRegions = new Set();
    this.animationFrameId = null;
    this.lastUpdateTime = 0;
    this.inputListeners = new Map();
    
    // Inicializar sistema
    this.initialize();
  }
  
  /**
   * Inicializa el sistema de actualización en tiempo real
   */
  initialize() {
    if (!this.canvas || !this.ctx) {
      console.error('Canvas no disponible para RealTimeGraphicsUpdater');
      return;
    }
    
    this.setupRealTimeEventListeners();
    console.log('RealTimeGraphicsUpdater inicializado');
  }
  
  /**
   * Configura los event listeners para actualización en tiempo real
   */
  setupRealTimeEventListeners() {
    // Listener principal para inputs de mediciones
    const inputHandler = this.createDebouncedInputHandler();
    
    // Escuchar eventos en el documento para capturar todos los inputs
    document.addEventListener('input', inputHandler);
    document.addEventListener('change', inputHandler);
    
    // Guardar referencia para cleanup
    this.inputListeners.set('input', inputHandler);
    this.inputListeners.set('change', inputHandler);
    
    console.log('Event listeners configurados para actualización en tiempo real');
  }
  
  /**
   * Crea un handler debounced para optimizar performance
   */
  createDebouncedInputHandler() {
    return (event) => {
      const target = event.target;
      
      // Verificar si es un input de mediciones periodontales
      if (!this.isPeriodontalMeasurementInput(target)) {
        return;
      }
      
      // Debounce para optimizar performance
      const now = Date.now();
      if (now - this.lastUpdateTime < this.options.debounceDelay) {
        return;
      }
      this.lastUpdateTime = now;
      
      // Procesar actualización
      this.handleMeasurementInputChange(target);
    };
  }
  
  /**
   * Verifica si un input es de mediciones periodontales
   */
  isPeriodontalMeasurementInput(element) {
    if (!element || !element.classList) return false;
    
    return element.classList.contains('gingivalMargin-input') ||
           element.classList.contains('probingDepth-input') ||
           element.classList.contains('gingival-margin-input') ||
           element.classList.contains('measurement-input');
  }
  
  /**
   * Maneja el cambio en un input de medición
   */
  handleMeasurementInputChange(input) {
    try {
      const toothNumber = Number.parseInt(input.dataset.tooth, 10);
      const position = Number.parseInt(input.dataset.position, 10);
      const measurementType = this.getMeasurementType(input);
      const value = Number.parseFloat(input.value) || 0;
      
      if (Number.isNaN(toothNumber) || Number.isNaN(position) || !measurementType) {
        console.warn('Datos de input incompletos:', { toothNumber, position, measurementType });
        return;
      }
      
      // Validar valor en tiempo real
      const validation = this.validateMeasurementValue(measurementType, value, toothNumber);
      
      if (validation.valid) {
        // Actualizar gráfica inmediatamente
        this.updateMeasurementLineInstantly(toothNumber, position, measurementType, value);
        
        // Limpiar errores de validación
        this.clearValidationError(input);
      } else {
        // Mostrar error de validación
        this.showValidationError(input, validation.error);
        
        // Opcional: usar valor sugerido
        if (validation.suggestion !== undefined) {
          this.updateMeasurementLineInstantly(toothNumber, position, measurementType, validation.suggestion);
        }
      }
      
    } catch (error) {
      console.error('Error procesando cambio de medición:', error);
    }
  }
  
  /**
   * Determina el tipo de medición basado en las clases del input
   */
  getMeasurementType(input) {
    if (input.classList.contains('gingivalMargin-input') || input.classList.contains('gingival-margin-input')) {
      return 'gingivalMargin';
    }
    if (input.classList.contains('probing-depth-input')) {
      return 'probingDepth';
    }
    return input.dataset.measurementType || null;
  }
  
  /**
   * Valida un valor de medición en tiempo real
   */
  validateMeasurementValue(type, value, toothNumber) {
    const rules = {
      gingivalMargin: { min: -9, max: 9, type: 'number' },
      probingDepth: { min: -9, max: 15, type: 'number' }
    };
    
    const rule = rules[type];
    if (!rule) return { valid: true };
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < rule.min || numValue > rule.max) {
      return {
        valid: false,
        error: `Valor debe estar entre ${rule.min} y ${rule.max}mm`,
        suggestion: Math.max(rule.min, Math.min(rule.max, numValue || 0))
      };
    }
    
    return { valid: true, value: numValue };
  }
  
  /**
   * Actualiza una línea de medición instantáneamente
   */
  updateMeasurementLineInstantly(toothNumber, position, measurementType, value) {
    if (!this.engine || !this.engine.toothCoordinates) {
      console.warn('Engine o coordenadas no disponibles');
      return;
    }
    
    const toothCoords = this.engine.toothCoordinates[toothNumber];
    if (!toothCoords) {
      console.warn(`Coordenadas no encontradas para diente ${toothNumber}`);
      return;
    }
    
    // Marcar región como sucia para renderizado selectivo
    this.markRegionDirty(toothNumber, measurementType, position);
    
    // Programar renderizado
    this.scheduleRender();
  }
  
  /**
   * Marca una región específica como "sucia" para renderizado selectivo
   */
  markRegionDirty(toothNumber, measurementType, position) {
    const regionKey = `${toothNumber}-${measurementType}-${position}`;
    this.dirtyRegions.add({
      toothNumber,
      measurementType,
      position,
      key: regionKey
    });
  }
  
  /**
   * Programa el renderizado usando requestAnimationFrame
   */
  scheduleRender() {
    if (this.animationFrameId) return;
    
    this.animationFrameId = requestAnimationFrame(() => {
      this.renderDirtyRegions();
      this.animationFrameId = null;
    });
  }
  
  /**
   * Renderiza solo las regiones marcadas como "sucias"
   */
  renderDirtyRegions() {
    if (this.dirtyRegions.size === 0) return;
    
    try {
      this.dirtyRegions.forEach(region => {
        this.renderSpecificMeasurementLine(region);
      });
      
      this.dirtyRegions.clear();
      
    } catch (error) {
      console.error('Error renderizando regiones sucias:', error);
    }
  }
  
  /**
   * Renderiza una línea de medición específica
   */
  renderSpecificMeasurementLine(region) {
    const { toothNumber, measurementType, position } = region;
    const toothCoords = this.engine.toothCoordinates[toothNumber];
    
    if (!toothCoords) return;
    
    // Calcular coordenadas específicas de la zona
    const zoneCoords = this.calculateZoneCoordinates(toothCoords, position);
    
    // Limpiar área específica
    this.clearSpecificMeasurementArea(zoneCoords, measurementType);
    
    // Obtener valor actual del input
    const value = this.getCurrentMeasurementValue(toothNumber, position, measurementType);
    
    // Renderizar línea
    if (value > 0 || (measurementType === 'gingivalMargin' && value !== 0)) {
      this.drawMeasurementLine(zoneCoords, measurementType, value);
    }
  }
  
  /**
   * Calcula las coordenadas de una zona específica
   */
  calculateZoneCoordinates(toothCoords, position) {
    const zoneWidth = toothCoords.width / 3;
    const zoneX = toothCoords.x + (position - 1) * zoneWidth + zoneWidth / 2;
    
    return {
      x: zoneX,
      y: toothCoords.y + toothCoords.height,
      width: zoneWidth,
      height: 100 // Altura máxima para mediciones
    };
  }
  
  /**
   * Limpia el área específica de una medición
   */
  clearSpecificMeasurementArea(coords, measurementType) {
    const clearWidth = 20;
    const clearHeight = measurementType === 'probingDepth' ? 80 : 10;
    
    this.ctx.clearRect(
      coords.x - clearWidth / 2,
      coords.y - (measurementType === 'gingivalMargin' ? 5 : 0),
      clearWidth,
      clearHeight
    );
  }
  
  /**
   * Obtiene el valor actual de una medición desde el input
   */
  getCurrentMeasurementValue(toothNumber, position, measurementType) {
    const selector = `.${measurementType}-input[data-tooth="${toothNumber}"][data-position="${position}"]`;
    const input = document.querySelector(selector);
    return input ? parseFloat(input.value) || 0 : 0;
  }
  
  /**
   * Dibuja una línea de medición
   */
  drawMeasurementLine(coords, measurementType, value) {
    const scale = this.options.measurementScale;
    
    if (measurementType === 'probingDepth') {
      // Línea roja para profundidad de sondaje
      this.ctx.strokeStyle = this.options.probingDepthColor;
      this.ctx.lineWidth = this.options.probingLineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(coords.x, coords.y);
      this.ctx.lineTo(coords.x, coords.y + (value * scale));
      this.ctx.stroke();
      
      // Valor numérico
      this.ctx.fillStyle = this.options.probingDepthColor;
      this.ctx.font = '10px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(
        value.toString(),
        coords.x + 3,
        coords.y + (value * scale) / 2
      );
      
    } else if (measurementType === 'gingivalMargin') {
      // Línea azul para margen gingival
      this.ctx.strokeStyle = this.options.gingivalMarginColor;
      this.ctx.lineWidth = this.options.gingivalLineWidth;
      this.ctx.beginPath();
      const lineY = coords.y + (value * scale);
      this.ctx.moveTo(coords.x - 8, lineY);
      this.ctx.lineTo(coords.x + 8, lineY);
      this.ctx.stroke();
    }
  }
  
  /**
   * Muestra un error de validación en el input
   */
  showValidationError(input, errorMessage) {
    if (!this.options.showValidationErrors) return;
    
    // Agregar clase de error
    input.classList.add('validation-error');
    
    // Crear o actualizar tooltip de error
    let tooltip = input.parentNode.querySelector('.validation-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'validation-tooltip';
      input.parentNode.appendChild(tooltip);
    }
    
    tooltip.textContent = errorMessage;
    tooltip.style.display = 'block';
    
    // Auto-ocultar después de 3 segundos
    setTimeout(() => {
      this.clearValidationError(input);
    }, 3000);
  }
  
  /**
   * Limpia el error de validación de un input
   */
  clearValidationError(input) {
    input.classList.remove('validation-error');
    
    const tooltip = input.parentNode.querySelector('.validation-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }
  
  /**
   * Limpia todos los event listeners
   */
  cleanup() {
    this.inputListeners.forEach((handler, eventType) => {
      document.removeEventListener(eventType, handler);
    });
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.inputListeners.clear();
    this.dirtyRegions.clear();
    
    console.log('RealTimeGraphicsUpdater limpiado');
  }
}

export default RealTimeGraphicsUpdater;