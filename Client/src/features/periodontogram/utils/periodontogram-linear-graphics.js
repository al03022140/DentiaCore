/**
 * PeriodontogramLinearGraphics.js
 * Módulo de extensión para gráficas lineales del periodontograma
 * 
 * EXTENSIÓN de OptimizedCanvasRenderer - NO duplicación
 * Implementa gráficas lineales de margen gingival y profundidad de sondaje
 * sobre contenedores tooth-image-container existentes
 */

import OptimizedCanvasRenderer from './optimized-canvas-renderer.js';
// Logger removido - usando console nativo
import { LINEAR_GRAPHICS_CONFIG } from './config.js';
import { VALIDATION_RANGES } from '../constants/periodontogram-constants.js';

export class PeriodontogramLinearGraphics extends OptimizedCanvasRenderer {
  constructor(canvas, options = {}, toothNumber = null, surface = 'vestibular') {
    super(canvas, {
      ...options,
      enableLinearGraphics: true
    });
    
    // Cachés usados por clearToothVisualElements / clearPositionVisualElements
    this.polygonCache = new Map();
    this.coordinateCache = new Map();
    this.dirtyRegions = new Set();
    this._updateTimeout = null;

    // Configuración específica de gráficas lineales
    this.linearConfig = LINEAR_GRAPHICS_CONFIG;
    this.toothContainers = new Map();
    this.hoverEffects = new Map();
    
    // Estado de gráficas lineales
    this.linearGraphicsData = new Map();
    this.dirtyToothRegions = new Set();
    
    // Información específica del diente y superficie
    this.toothNumber = toothNumber;
    this.surface = surface;
    
    // NO llamar this.initialize() del renderer base: configura el pipeline de
    // capas (setupToothRegions + setupLayerCache) que esta subclase nunca
    // invoca, y su layerCache creaba 5 canvases offscreen POR INSTANCIA
    // (×64 instancias ≈ 320 canvases sin uso). Esta clase sólo necesita el
    // ctx del constructor base y su propia capa 'linearGraphics'.
    this.initializeLinearGraphics();
  }
  
  /**
   * Inicializa el sistema de gráficas lineales
   */
  initializeLinearGraphics() {
    try {
      this.setupToothContainerMapping();
      this.setupLinearGraphicsLayer();
    } catch (error) {
      console.error(`[PeriodontogramLinearGraphics] Error en inicialización:`, error);
      console.error('Error inicializando gráficas lineales:', error);
      throw error;
    }
  }
  
  /**
   * Mapea contenedores tooth-image-container del DOM
   * Optimizado para mapear solo el contenedor específico del diente y superficie asignados
   */
  setupToothContainerMapping() {
    // Si tenemos información específica del diente y superficie, buscar solo ese contenedor
    if (this.toothNumber && this.surface) {
      // Buscar en la sección específica de la superficie
      const surfaceSelector = `.${this.surface}-images`;
      // Buscar TODAS las secciones que coinciden (por ejemplo vestibular-superior e inferior)
      const surfaceSections = document.querySelectorAll(surfaceSelector);
      let container = null;
      
      // Iterar por cada sección hasta encontrar el contenedor correcto
      surfaceSections.forEach(section => {
        if (!container) {
          const found = section.querySelector(`.tooth-image-container[data-tooth=\"${this.toothNumber}\"]`);
          if (found) {
            container = found;
          }
        }
      });
      
      if (container) {
        
        if (container) {
          const rect = container.getBoundingClientRect();
          const canvasRect = this.canvas.getBoundingClientRect();
          
          const containerData = {
            element: container,
            surface: this.surface,
            rect: {
              x: rect.left - canvasRect.left,
              y: rect.top - canvasRect.top,
              width: this.linearConfig.DIMENSIONS.CONTAINER_WIDTH,
              height: this.linearConfig.DIMENSIONS.CONTAINER_HEIGHT
            },
            positions: this.calculateLinePositions(rect.left - canvasRect.left)
          };
          
          this.toothContainers.set(this.toothNumber, containerData);
          return;
        }
      }
      
      if (!container) {
        // Mensajes de advertencia conservados para depuración
        console.warn(`[PeriodontogramLinearGraphics] No se encontró .tooth-image-container[data-tooth=\"${this.toothNumber}\"] en ninguna sección que coincida con ${surfaceSelector}`);
        console.warn(`[PeriodontogramLinearGraphics] No se encontró contenedor específico para diente ${this.toothNumber}, superficie ${this.surface}`);
      }
    }
    
    // Fallback: mapear todos los contenedores (comportamiento original)
    const containers = document.querySelectorAll('.tooth-image-container');
    
    containers.forEach((container, index) => {
      // Extraer número de diente del contexto
      const toothNumber = this.extractToothNumberFromContainer(container, index);
      
      if (toothNumber) {
        const rect = container.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Detectar la superficie basándose en la sección padre
        const surface = this.detectSurfaceFromContainer(container);
        
        const containerData = {
          element: container,
          surface: surface, // Agregar información de superficie
          rect: {
            x: rect.left - canvasRect.left,
            y: rect.top - canvasRect.top,
            width: this.linearConfig.DIMENSIONS.CONTAINER_WIDTH,
            height: this.linearConfig.DIMENSIONS.CONTAINER_HEIGHT
          },
          positions: this.calculateLinePositions(rect.left - canvasRect.left)
        };
        
        this.toothContainers.set(toothNumber, containerData);
      }
    });
  }
  
  /**
   * Detecta la superficie del contenedor basándose en su sección padre
   */
  detectSurfaceFromContainer(container) {
    // Buscar la sección padre que contiene información de superficie
    const vestibularSection = container.closest('.vestibular-images');
    const palatineSection = container.closest('.palatine-images');
    const lingualSection = container.closest('.lingual-images');
    
    if (vestibularSection) {
      return 'vestibular';
    } else if (palatineSection) {
      return 'palatine';
    } else if (lingualSection) {
      return 'lingual';
    }
    
    // Fallback: intentar detectar por clase de la sección
    const imagesSection = container.closest('.images-section');
    if (imagesSection) {
      if (imagesSection.classList.contains('vestibular-images')) {
        return 'vestibular';
      } else if (imagesSection.classList.contains('palatine-images')) {
        return 'palatine';
      } else if (imagesSection.classList.contains('lingual-images')) {
        return 'lingual';
      }
    }
    
    console.warn(`[PeriodontogramLinearGraphics] No se pudo detectar la superficie para el contenedor`);
    return 'vestibular'; // Fallback por defecto
  }
  
  /**
   * Extrae el número de diente del contenedor
   */
  extractToothNumberFromContainer(container, index) {
    // Buscar en atributos data-*
    const dataAttrs = ['data-tooth']; // Normalizado: solo usar data-tooth
    for (const attr of dataAttrs) {
      const value = container.getAttribute(attr);
      if (value) return parseInt(value);
    }
    
    // Buscar en elementos padre/hijo
    const parentRow = container.closest('.data-row, .images-row');
    if (parentRow) {
      const cells = parentRow.querySelectorAll('.data-cell, .image-cell');
      const cellIndex = Array.from(cells).indexOf(container.closest('.data-cell, .image-cell'));
      
      if (cellIndex >= 0) {
        // Mapear índice a número de diente según la estructura del periodontograma
        return this.mapIndexToToothNumber(cellIndex, parentRow);
      }
    }
    
    return null;
  }
  
  /**
   * Mapea índice de celda a número de diente
   */
  mapIndexToToothNumber(cellIndex, row) {
    // Determinar si es arcada superior o inferior
    const isUpper = row.closest('.arch-section.superior') !== null;
    const isLower = row.closest('.arch-section.inferior') !== null;
    
    if (isUpper) {
      // Arcada superior: 18-11, 21-28
      if (cellIndex < 8) {
        return 18 - cellIndex; // 18, 17, 16, 15, 14, 13, 12, 11
      } else {
        return 21 + (cellIndex - 8); // 21, 22, 23, 24, 25, 26, 27, 28
      }
    } else if (isLower) {
      // Arcada inferior: 48-41, 31-38
      if (cellIndex < 8) {
        return 48 - cellIndex; // 48, 47, 46, 45, 44, 43, 42, 41
      } else {
        return 31 + (cellIndex - 8); // 31, 32, 33, 34, 35, 36, 37, 38
      }
    }
    
    return null;
  }
  
  /**
   * Calcula las posiciones de las líneas dentro del contenedor
   */
  calculateLinePositions(containerX) {
    // CORREGIDO: Usar las posiciones definidas en la configuración
    const positions = this.linearConfig.POSITIONS;
    
    return {
      mesial: containerX + positions.MESIAL,
      central: containerX + positions.CENTRAL,
      distal: containerX + positions.DISTAL
    };
  }
  
  /**
   * Configura la capa de gráficas lineales
   */
  setupLinearGraphicsLayer() {
    // Extender el sistema de capas existente
    this.layers.linearGraphics = {
      dirty: true,
      priority: 6,
      transparent: true
    };
    
    // Crear canvas de capa para gráficas lineales
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = this.canvas.width;
    layerCanvas.height = this.canvas.height;
    
    const layerCtx = layerCanvas.getContext('2d');
    
    this.layerCache.set('linearGraphics', {
      canvas: layerCanvas,
      ctx: layerCtx,
      dirty: true,
      lastUpdate: 0
    });
    
    // MEJORA: Renderizar línea de referencia inmediatamente al inicializar
    this._renderReferenceRedLine(layerCtx);
    this._renderReferenceRedLine(this.ctx);
    
    // Copiar la capa inicial al canvas principal
    this.ctx.drawImage(layerCanvas, 0, 0);
  }
  
  /**
   * Actualiza gráficas lineales para un diente específico
   */
  updateToothLinearGraphics(toothNumber, measurementData) {
    if (!this.toothContainers.has(toothNumber)) {
      console.error(`[PeriodontogramLinearGraphics] Contenedor no encontrado para diente ${toothNumber}`);
      console.warn(`Contenedor no encontrado para diente ${toothNumber}`);
      return;
    }
    
    // Procesar datos según la nueva estructura con caras específicas
    const processedData = this.processToothMeasurementData(toothNumber, measurementData);
    
    // Validar datos de entrada
    const validatedData = this.validateMeasurementData(processedData);
    
    if (!validatedData.valid) {
      console.error(`[PeriodontogramLinearGraphics] Datos inválidos para diente ${toothNumber}:`, validatedData.errors);
      console.warn(`Datos inválidos para diente ${toothNumber}:`, validatedData.errors);
      // No retornar aquí - continuar con el renderizado pero marcar los datos como inválidos
    }
    
    // Actualizar cache de datos siempre, incluso si hay errores de validación
    // Esto permite que el renderizado funcione y muestre lo que sea válido
    this.linearGraphicsData.set(toothNumber, {
      ...processedData,
      validationErrors: validatedData.errors
    });
    
    // Marcar región como sucia para re-renderizado
    this.dirtyToothRegions.add(toothNumber);
    
    // Programar actualización
    this.scheduleLinearGraphicsUpdate();
  }
  
  /**
   * Procesa los datos de medición del diente según la nueva estructura con caras específicas
   * @param {number} toothNumber - Número del diente
   * @param {Object} measurementData - Datos de medición del diente
   * @returns {Object} Datos procesados en formato compatible con las gráficas
   */
  processToothMeasurementData(toothNumber, measurementData) {
    const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
    const container = this.toothContainers.get(toothNumber);
    
    if (!container || !container.surface) {
      console.warn(`[PeriodontogramLinearGraphics] No se pudo determinar la superficie para diente ${toothNumber}`);
      // Fallback: intentar determinar superficie por contexto
      if (Array.isArray(measurementData.gingivalMargin) || Array.isArray(measurementData.probingDepth)) {
        return measurementData; // Datos en formato antiguo, usar tal como están
      }
      return measurementData; // Fallback a datos originales
    }
    
    const surface = container.surface; // 'vestibular', 'palatine', 'lingual'
    
    // Determinar la clave de la cara según la superficie y el tipo de diente
    let faceKey;
    if (isUpperTooth) {
      faceKey = surface === 'palatine' ? 'palatinoSuperior' : 'vestibularSuperior';
    } else {
      faceKey = surface === 'lingual' ? 'lingualInferior' : 'vestibularInferior';
    }
    
    const processedData = { ...measurementData };
    
    // Procesar gingivalMargin
    if (measurementData.gingivalMargin) {
      if (typeof measurementData.gingivalMargin === 'object' && !Array.isArray(measurementData.gingivalMargin)) {
        // Nueva estructura con caras específicas
        processedData.gingivalMargin = measurementData.gingivalMargin[faceKey] || [0, 0, 0];
      } else if (Array.isArray(measurementData.gingivalMargin)) {
        // Estructura antigua (array directo) - mantener como está
        processedData.gingivalMargin = measurementData.gingivalMargin;
      }
    }
    
    // Procesar probingDepth
    if (measurementData.probingDepth) {
      if (typeof measurementData.probingDepth === 'object' && !Array.isArray(measurementData.probingDepth)) {
        // Nueva estructura con caras específicas
        processedData.probingDepth = measurementData.probingDepth[faceKey] || [0, 0, 0];
      } else if (Array.isArray(measurementData.probingDepth)) {
        // Estructura antigua (array directo) - mantener como está
        processedData.probingDepth = measurementData.probingDepth;
      }
    }
    
    return processedData;
  }
  
  /**
   * Valida datos de medición
   */
  validateMeasurementData(data) {
    const errors = [];
    const validation = this.linearConfig.VALIDATION;
    
    // Validar margen gingival
    if (data.gingivalMargin) {
      data.gingivalMargin.forEach((value, index) => {
        if (value !== null && value !== undefined) {
          const numValue = parseFloat(value);
          if (isNaN(numValue) || numValue < validation.GINGIVAL_MARGIN.min || numValue > validation.GINGIVAL_MARGIN.max) {
            errors.push(`Margen gingival posición ${index}: valor fuera de rango`);
          }
        }
      });
    }
    
    // Validar profundidad de sondaje
    if (data.probingDepth) {
      data.probingDepth.forEach((value, index) => {
        if (value !== null && value !== undefined) {
          const numValue = parseFloat(value);
          if (isNaN(numValue) || numValue < validation.PROBING_DEPTH.min || numValue > validation.PROBING_DEPTH.max) {
            errors.push(`Profundidad de sondaje posición ${index}: valor fuera de rango`);
          }
        }
      });
    }
    
    // Validación de coherencia eliminada - permitir cualquier relación entre margen gingival y profundidad de sondaje
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Programa actualización de gráficas lineales
   */
  scheduleLinearGraphicsUpdate() {
    if (this.animationFrameId) {
      return; // Ya hay una actualización programada
    }
    
    this.animationFrameId = requestAnimationFrame(() => {
      this.renderLinearGraphics();
      this.animationFrameId = null;
    });
  }
  
  /**
   * Renderiza las gráficas lineales
   */
  renderLinearGraphics() {
    const startTime = performance.now();
    
    try {
      const layer = this.layerCache.get('linearGraphics');
      if (!layer) {
        return;
      }
      
      const ctx = layer.ctx;
      
      // Limpiar solo las regiones sucias
      this.clearDirtyLinearRegions(ctx);
      
      // Limpiar el canvas principal ANTES de copiar la capa lineal
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Renderizar línea roja de referencia muy delgada y transparente en la capa
      this._renderReferenceRedLine(ctx);
      
      // Renderizar cada diente con datos actualizados
      this.dirtyToothRegions.forEach(toothNumber => {
        this.renderToothLinearGraphics(ctx, toothNumber);
      });
      
      // Copiar capa al canvas principal
      this.ctx.drawImage(layer.canvas, 0, 0);
      
      // Renderizar línea roja de referencia FINAL en el canvas principal (será lo último visible)
      this._renderReferenceRedLine(this.ctx);
      
      // Limpiar regiones sucias
      this.dirtyToothRegions.clear();
      
      const renderTime = performance.now() - startTime;
      
      if (renderTime > this.linearConfig.PERFORMANCE.MAX_RENDER_TIME) {
        console.warn(`Renderizado lento de gráficas lineales: ${renderTime.toFixed(2)}ms`);
      }
      
    } catch (error) {
      console.error('Error renderizando gráficas lineales:', error);
    }
  }
  
  /**
   * Renderiza línea roja de referencia muy delgada y transparente
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   */
  _renderReferenceRedLine(ctx) {
    // Obtener la línea de referencia específica según la superficie
    const redLineReference = this._getReferenceLine(this.toothNumber);
    const canvasWidth = this.canvas.width;
    
    ctx.save();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    
    ctx.beginPath();
    ctx.moveTo(0, redLineReference);
    ctx.lineTo(canvasWidth, redLineReference);
    ctx.stroke();
    
    ctx.restore();
  }
  
  /**
   * Limpia regiones sucias de gráficas lineales
   */
  clearDirtyLinearRegions(ctx) {
    this.dirtyToothRegions.forEach(toothNumber => {
      const container = this.toothContainers.get(toothNumber);
      if (container) {
        const config = this.linearConfig;
        // Limpiar toda el área del contenedor, extendiendo márgenes generosamente
        const clearX = container.rect.x - 60;
        const clearY = container.rect.y - container.rect.height - 120;
        const clearWidth = container.rect.width + 120;
        const clearHeight = container.rect.height * 2 + 240;
        ctx.clearRect(clearX, clearY, clearWidth, clearHeight);
      }
    });
  }
  
  /**
   * Obtiene la posición exacta según las coordenadas especificadas
   * @param {Object} positions - Objeto de posiciones del contenedor
   * @param {number} index - Índice de la posición (0=mesial, 1=central, 2=distal)
   * @returns {number} Coordenada X exacta
   */
  getExactPosition(positions, index) {
    // CORREGIDO: Usar las posiciones reales del contenedor en lugar de coordenadas fijas
    const positionKeys = ['mesial', 'central', 'distal'];
    const positionKey = positionKeys[index];
    
    if (positions && positions[positionKey] !== undefined) {
      return positions[positionKey];
    }
    
    // Fallback: usar configuración por defecto si no hay posiciones específicas
    const configPositions = Object.values(this.linearConfig.POSITIONS);
    const baseX = positions?.mesial || 0;
    return baseX + (configPositions[index] || configPositions[1]);
  }

  /**
   * Renderiza gráficas lineales para un diente específico
   */
  renderToothLinearGraphics(ctx, toothNumber) {
    const container = this.toothContainers.get(toothNumber);
    const data = this.linearGraphicsData.get(toothNumber);
    
    if (!container || !data) {
      return;
    }
    
    const { rect, positions } = container;
    // Determinar si el diente es superior o inferior
    const isUpperTooth = (toothNumber >= 11 && toothNumber <= 28);
    
    // Calcular baseline según la línea roja de referencia en el píxel 99 de la imagen de fondo
    let baseline;
    if (isUpperTooth) {
      // Dientes superiores: línea roja en píxel 99 desde arriba
      baseline = rect.y + 99;
    } else {
      // Dientes inferiores: línea roja en píxel 99 desde abajo
      baseline = rect.y + rect.height - 99;
    }
    
    // Obtener errores de validación si existen
    const validationErrors = data.validationErrors || [];
    
    // Renderizar líneas de margen gingival
    if (data.gingivalMargin) {
      this.renderGingivalMarginLines(ctx, positions, baseline, data.gingivalMargin, rect, validationErrors, toothNumber);
    }
    
    // Renderizar líneas de profundidad de sondaje
    if (data.probingDepth) {
      this.renderProbingDepthLines(ctx, positions, baseline, data.probingDepth, rect, data.gingivalMargin, validationErrors, toothNumber);
    }
    
    // Renderizar rellenos si están habilitados
    if (this.linearConfig.EFFECTS.FILL.enabled) {
      this.renderLinearGraphicsFills(ctx, positions, baseline, data, rect, toothNumber);
    }
  }
  
  /**
   * Renderiza líneas de margen gingival como gráfica lineal conectada
   */
  renderGingivalMarginLines(ctx, positions, baseline, values, rect, validationErrors = [], toothNumber = null) {
    const config = this.linearConfig;
    const lineStyle = config.LINE_STYLES.GINGIVAL_MARGIN;
    
    ctx.strokeStyle = config.COLORS.GINGIVAL_MARGIN;
    ctx.lineWidth = lineStyle.width;
    ctx.globalAlpha = config.EFFECTS.LINE.opacity;
    
    const validPoints = [];
    
    values.forEach((value, index) => {
      const hasValidationError = validationErrors.some(error => 
        error.includes(`Margen gingival posición ${index}`) || 
        error.includes(`Posición ${index}: margen gingival`)
      );
      
      if (hasValidationError) return;
      
      if (value !== null && value !== undefined && !isNaN(parseFloat(value))) {
        const numValue = parseFloat(value);
        const x = this.getExactPosition(positions, index);
        const y = this._calculateYPosition(numValue, 'gingivalMargin', toothNumber);
        
        validPoints.push({ x, y, value: numValue, index });
      }
    });
    
    // CORREGIDO: Dibujar línea que conecte los puntos reales en sus posiciones Y específicas
    if (validPoints.length >= 1) {
      ctx.beginPath();
      
      if (validPoints.length === 1) {
        // Con un solo punto, dibujar punto circular
        const singlePoint = validPoints[0];
        ctx.beginPath();
        ctx.arc(singlePoint.x, singlePoint.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = config.COLORS.GINGIVAL_MARGIN;
        ctx.fill();
      } else {
        // Con múltiples puntos, conectar los puntos reales
        // Ordenar puntos por posición X para conectarlos correctamente
        validPoints.sort((a, b) => a.x - b.x);
        
        ctx.moveTo(validPoints[0].x, validPoints[0].y);
        for (let i = 1; i < validPoints.length; i++) {
          ctx.lineTo(validPoints[i].x, validPoints[i].y);
        }
        
        ctx.stroke();
        
        // Dibujar puntos en cada posición
        validPoints.forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
          ctx.fillStyle = config.COLORS.GINGIVAL_MARGIN;
          ctx.fill();
        });
      }
    }
    
    ctx.globalAlpha = 1.0;
  }
  
  /**
   * Renderiza líneas de profundidad de sondaje como gráfica lineal conectada
   */
  renderProbingDepthLines(ctx, positions, baseline, values, rect, gingivalMarginValues = null, validationErrors = [], toothNumber = null) {
    
    const config = this.linearConfig;
    const lineStyle = config.LINE_STYLES.PROBING_DEPTH;
    ctx.strokeStyle = config.COLORS.PROBING_DEPTH;
    ctx.lineWidth = lineStyle.width;
    ctx.globalAlpha = config.EFFECTS.LINE.opacity;
    const validSegments = [];
    values.forEach((value, index) => {
      const hasValidationError = validationErrors.some(error => 
        error.includes(`Profundidad de sondaje posición ${index}`) || 
        error.includes(`Posición ${index}: margen gingival no puede ser mayor`)
      );
      if (hasValidationError) return;
      if (value !== null && value !== undefined && !isNaN(parseFloat(value))) {
        const numValue = parseFloat(value);
        const x = this.getExactPosition(positions, index);
        
        // Calcular Y inicial desde margen gingival si existe, si no desde línea roja de referencia
        let yStart = this._getReferenceLine(toothNumber); // Línea roja de referencia
        if (gingivalMarginValues && gingivalMarginValues[index] !== null && gingivalMarginValues[index] !== undefined && !isNaN(parseFloat(gingivalMarginValues[index]))) {
          const marginValue = parseFloat(gingivalMarginValues[index]);
          yStart = this._calculateYPosition(marginValue, 'gingivalMargin', toothNumber);
        }
        
        // MODIFICADO: Usar función centralizada para calcular Y final de profundidad
        // Obtener el valor del margen gingival correspondiente para este índice
        const marginValue = gingivalMarginValues && gingivalMarginValues[index] ? gingivalMarginValues[index] : null;
        const yEnd = this._calculateYPosition(numValue, 'probingDepth', toothNumber, marginValue);
        
        validSegments.push({ x, yStart, yEnd, value: numValue, index });
      }
    });
    // ELIMINADO: Líneas verticales del eje Y y puntos según solicitud del usuario
    // validSegments.forEach((seg) => {
    //   ctx.beginPath();
    //   ctx.moveTo(seg.x, seg.yStart);
    //   ctx.lineTo(seg.x, seg.yEnd);
    //   ctx.stroke();
    //   // Punto final
    //   ctx.beginPath();
    //   ctx.arc(seg.x, seg.yEnd, 2, 0, 2 * Math.PI);
    //   ctx.fillStyle = this.linearConfig.COLORS.PROBING_DEPTH;
    //   ctx.fill();
    // });
    
    // MODIFICADO: Dibujar línea siempre que haya al menos 1 punto válido
    if (validSegments.length >= 1) {
      ctx.beginPath();
      
      if (validSegments.length === 1) {
        // Con un solo punto, dibujar línea desde yStart hasta yEnd
        ctx.moveTo(validSegments[0].x, validSegments[0].yStart);
        ctx.lineTo(validSegments[0].x, validSegments[0].yEnd);
      } else {
        // Con múltiples puntos, conectar todos los puntos finales
        ctx.moveTo(validSegments[0].x, validSegments[0].yEnd);
        for (let i = 1; i < validSegments.length; i++) {
          ctx.lineTo(validSegments[i].x, validSegments[i].yEnd);
        }
      }
      
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }
  
  /**
   * Renderiza rellenos de gráficas lineales - MEJORADO según imagen de referencia
   */
  renderLinearGraphicsFills(ctx, positions, baseline, data, rect, toothNumber = null) {
    const config = this.linearConfig;
    // Relleno de margen gingival (rojo) como polígono cerrado
    if (data.gingivalMargin) {
      const validPoints = [];
      data.gingivalMargin.forEach((marginValue, index) => {
        if (marginValue !== null && marginValue !== undefined && !isNaN(parseFloat(marginValue))) {
          const margin = parseFloat(marginValue);
          const x = this.getExactPosition(positions, index);
          
          // Usar el método centralizado para calcular posición Y
          const marginY = this._calculateYPosition(margin, 'gingivalMargin', toothNumber);
          
          validPoints.push({ x, y: marginY });
        }
      });
      if (validPoints.length === 3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(validPoints[0].x, validPoints[0].y);
        ctx.lineTo(validPoints[1].x, validPoints[1].y);
        ctx.lineTo(validPoints[2].x, validPoints[2].y);
        // Bajar hasta línea roja de referencia por distal
        const redLineReference = this._getReferenceLine(toothNumber);
        ctx.lineTo(validPoints[2].x, redLineReference);
        // Unir línea roja de referencia hasta mesial
        ctx.lineTo(validPoints[0].x, redLineReference);
        ctx.closePath();
        ctx.fillStyle = config.COLORS.FILL.GINGIVAL_MARGIN_FILL;
        ctx.globalAlpha = config.EFFECTS.FILL.opacity;
        ctx.fill();
        ctx.restore();
      }
    }
    
    // Renderizar relleno de profundidad de sondaje (azul) si existe
    // Renderizar relleno de profundidad de sondaje (azul) como polígono cerrado
    if (data.probingDepth) {
      const validDepthPoints = [];
      
      // Verificar si hay valores reales de profundidad (no solo ceros por defecto)
      const hasRealDepthValues = data.probingDepth.some(depthValue => {
        const depth = parseFloat(depthValue);
        return !isNaN(depth) && depth > 0;
      });
      
      // Solo procesar si hay valores reales de profundidad
      if (hasRealDepthValues) {
        data.probingDepth.forEach((depthValue, index) => {
          if (depthValue !== null && depthValue !== undefined && !isNaN(parseFloat(depthValue))) {
            const depth = parseFloat(depthValue);
            const x = this.getExactPosition(positions, index);
            
            // Calcular Y inicial desde margen gingival si existe, si no desde línea roja de referencia
            let yStart = this._getReferenceLine(toothNumber); // Línea roja de referencia
            if (data.gingivalMargin && data.gingivalMargin[index] !== null && data.gingivalMargin[index] !== undefined && !isNaN(parseFloat(data.gingivalMargin[index]))) {
              const marginValue = parseFloat(data.gingivalMargin[index]);
              yStart = this._calculateYPosition(marginValue, 'gingivalMargin', toothNumber);
            }
            
            // MODIFICADO: Usar función centralizada para calcular Y final de profundidad
            // Obtener el valor del margen gingival correspondiente para este índice
            const marginValue = data.gingivalMargin && data.gingivalMargin[index] ? data.gingivalMargin[index] : null;
            const yEnd = this._calculateYPosition(depth, 'probingDepth', toothNumber, marginValue);
            validDepthPoints.push({ x, yStart, yEnd });
          }
        });
        
        if (validDepthPoints.length === 3) {
          ctx.save();
          ctx.beginPath();
          // Conectar los puntos finales (extremos de profundidad)
          ctx.moveTo(validDepthPoints[0].x, validDepthPoints[0].yEnd);
          ctx.lineTo(validDepthPoints[1].x, validDepthPoints[1].yEnd);
          ctx.lineTo(validDepthPoints[2].x, validDepthPoints[2].yEnd);
          // Bajar hasta los puntos iniciales por distal
          ctx.lineTo(validDepthPoints[2].x, validDepthPoints[2].yStart);
          // Conectar los puntos iniciales
          ctx.lineTo(validDepthPoints[1].x, validDepthPoints[1].yStart);
          ctx.lineTo(validDepthPoints[0].x, validDepthPoints[0].yStart);
          ctx.closePath();
          ctx.fillStyle = config.COLORS.FILL.PROBING_DEPTH_FILL;
          ctx.globalAlpha = config.EFFECTS.FILL.opacity;
          ctx.fill();
          ctx.restore();
        }
      }
    }
    
    ctx.globalAlpha = 1.0;
  }
  
  /**
   * Agrega efecto hover a una posición específica
   */
  addHoverEffect(toothNumber, position) {
    if (!this.linearConfig.HOVER.ENABLED) return;
    
    this.hoverEffects.set(`${toothNumber}-${position}`, {
      toothNumber,
      position,
      timestamp: Date.now()
    });
    
    this.dirtyToothRegions.add(toothNumber);
    this.scheduleLinearGraphicsUpdate();
  }
  
  /**
   * Remueve efecto hover
   */
  removeHoverEffect(toothNumber, position) {
    const key = position !== undefined ? `${toothNumber}-${position}` : toothNumber;
    
    if (position !== undefined) {
      this.hoverEffects.delete(key);
    } else {
      // Remover todos los efectos hover del diente
      for (let i = 0; i < 3; i++) {
        this.hoverEffects.delete(`${toothNumber}-${i}`);
      }
    }
    
    this.dirtyToothRegions.add(toothNumber);
    this.scheduleLinearGraphicsUpdate();
  }
  
  /**
   * Limpia todos los recursos de gráficas lineales
   */
  cleanup() {
    // Limpiar animaciones pendientes
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Limpiar timeout de actualización
    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
      this._updateTimeout = null;
    }
    
    // Limpiar caches
    this.linearGraphicsData.clear();
    this.toothContainers.clear();
    this.hoverEffects.clear();
    this.dirtyToothRegions.clear();

    // Limpiar cachés de polígonos
    this.polygonCache.clear();
    this.coordinateCache.clear();
    this.dirtyRegions.clear();

    // Llamar cleanup del padre
    if (super.cleanup) {
      super.cleanup();
    }
  }
  /**
   * Calcula posición Y de la medición basándose en la línea roja de referencia del background
   * @param {number} value - Valor de la medición
   * @param {string} measurementType - Tipo de medición
   * @param {number} toothNumber - Número del diente para determinar superior/inferior
   * @returns {number} Coordenada Y
   */
  _calculateYPosition(value, measurementType, toothNumber = null, marginValue = null) {
    const scaleFactor = this.linearConfig.DIMENSIONS.SCALE_FACTOR;
    
    // Determinar si el diente es superior o inferior
    let isUpperTooth = true;
    if (toothNumber) {
      isUpperTooth = (toothNumber >= 11 && toothNumber <= 28);
    }
    
    // Determinar si el diente está volteado (imagen invertida)
    // Palatino superior y vestibular inferior tienen la imagen volteada
    const isFlipped = (isUpperTooth && this.surface === 'palatine') || 
                      (!isUpperTooth && this.surface === 'vestibular');
    
    // Obtener la línea de referencia específica según la superficie
    const redLineReference = this._getReferenceLine(toothNumber);
    
    let result;
    
    if (measurementType === 'gingivalMargin') {
      // MARGEN GINGIVAL: Dirección depende de si el diente está volteado
      if (value === 0) {
        // Cuando el valor es 0, desplazar ligeramente para que sea visible
        result = isFlipped ? (redLineReference - 2) : (redLineReference + 2);
      } else {
        // Si está volteado (palatino superior o vestibular inferior), invertir dirección
        result = isFlipped ? 
          (redLineReference - (value * scaleFactor)) : 
          (redLineReference + (value * scaleFactor));
      }
      
    } else if (measurementType === 'probingDepth') {
      // PROFUNDIDAD DE SONDAJE: Dirección depende de si el diente está volteado
      let startPoint = redLineReference;
      
      // Si hay margen gingival, iniciar desde ese punto
      if (marginValue !== null && marginValue !== undefined && !isNaN(parseFloat(marginValue))) {
        const margin = parseFloat(marginValue);
        if (margin === 0) {
          startPoint = isFlipped ? (redLineReference - 2) : (redLineReference + 2);
        } else {
          startPoint = isFlipped ? 
            (redLineReference - (margin * scaleFactor)) : 
            (redLineReference + (margin * scaleFactor));
        }
      }
      
      // La profundidad se extiende en dirección opuesta al margen
      // Si está volteado, la profundidad va hacia arriba; si no, hacia abajo
      result = isFlipped ? 
        (startPoint + (value * scaleFactor)) : 
        (startPoint - (value * scaleFactor));
      
    } else {
      result = redLineReference;
    }
    
    return result;
  }
  
  /**
   * Obtiene la línea de referencia específica según la superficie dental
   * @param {number} toothNumber - Número del diente
   * @returns {number} Posición Y de la línea de referencia
   */
  _getReferenceLine(toothNumber = null) {
    // Determinar si el diente es superior o inferior
    let isUpperTooth = true;
    if (toothNumber) {
      isUpperTooth = (toothNumber >= 11 && toothNumber <= 28);
    }
    
    let referenceLine;
    
    if (isUpperTooth) {
      // Dientes superiores (11-28): coordenadas simétricas
      if (this.surface === 'palatine') {
        // Palatino superior: píxel 82 desde abajo (simétrico con vestibular inferior)
        referenceLine = this.canvas.height - 82;
      } else {
        // Vestibular superior: píxel 87 desde arriba (simétrico con lingual inferior)
        referenceLine = 87;
      }
    } else {
      // Dientes inferiores (31-48): coordenadas simétricas
      if (this.surface === 'vestibular') {
        // Vestibular inferior: píxel 82 desde abajo (simétrico con palatino superior)
        referenceLine = this.canvas.height - 82;
      } else {
        // Lingual inferior: píxel 87 desde arriba (simétrico con vestibular superior)
        referenceLine = 87;
      }
    }
    
    return referenceLine;
  }
  /**
   * Limpia todos los elementos visuales de un diente específico
   * @param {number} toothNumber - Número del diente
   */
  clearToothVisualElements(toothNumber) {
    if (!this.canvas || !this.ctx) return;
    
    try {
      // Limpiar cache de coordenadas para este diente
      if (this.coordinateCache.has(toothNumber)) {
        this.coordinateCache.delete(toothNumber);
      }
      
      // Limpiar cache de polígonos para este diente
      if (this.polygonCache.has(toothNumber)) {
        this.polygonCache.delete(toothNumber);
      }
      
      // Marcar región como sucia para re-renderizado
      this.dirtyRegions.add(toothNumber);
      
      // Programar re-renderizado
      this.scheduleLinearGraphicsUpdate();
    } catch (error) {
      console.error(`Error limpiando elementos visuales del diente ${toothNumber}:`, error);
    }
  }
  
  /**
   * Limpia elementos visuales para una posición específica de un diente
   * @param {number} toothNumber - Número del diente
   * @param {number} position - Posición (0=mesial, 1=central, 2=distal)
   * @param {string} field - Campo (gingivalMargin o probingDepth)
   */
  clearPositionVisualElements(toothNumber, position, field) {
    if (!this.canvas || !this.ctx) return;
    
    try {
      // Obtener datos actuales del diente
      const currentData = this.coordinateCache.get(toothNumber) || {
        gingivalMargin: [null, null, null],
        probingDepth: [null, null, null]
      };
      
      // Limpiar la posición específica
      if (currentData[field] && Array.isArray(currentData[field])) {
        currentData[field][position] = null;
      }
      
      // Actualizar cache
      this.coordinateCache.set(toothNumber, currentData);
      
      // Limpiar cache de polígonos para forzar re-renderizado
      if (this.polygonCache.has(toothNumber)) {
        this.polygonCache.delete(toothNumber);
      }
      
      // Marcar región como sucia
      this.dirtyRegions.add(toothNumber);
      
      // Programar re-renderizado
      this.scheduleLinearGraphicsUpdate();
    } catch (error) {
      console.error(`Error limpiando elemento visual del diente ${toothNumber}, posición ${position}:`, error);
    }
  }
}

export default PeriodontogramLinearGraphics;