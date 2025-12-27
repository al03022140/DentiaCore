/**
 * usePeriodontogramLinearGraphics.js
 * Hook personalizado para manejo de gráficas lineales del periodontograma
 * 
 * EXTENSIÓN del sistema existente - NO duplicación
 * Integra gráficas lineales con el flujo de datos del periodontograma
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import ExtendedRealTimeGraphicsUpdater from '../utils/extended-real-time-graphics-updater.js';
import { UniversalToothValidator } from '../../../shared/validators/universal-tooth-validator.js';
import { PeriodontogramLinearGraphics } from '../utils/periodontogram-linear-graphics.js';
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
} from '../utils/config.js';


export const usePeriodontogramLinearGraphics = ({
  containerRef,
  periodontogramData,
  onDataChange,
  options = {}
}) => {
  // Referencias
  const realTimeUpdaterRef = useRef(null);
  const isInitializedRef = useRef(false);
  const lastDataRef = useRef(null);
  const canvasRefsRef = useRef(new Map()); // Map de tooth number -> canvas ref
  const latestDataRef = useRef(null);
  const pendingDataRef = useRef(null);
  
  // Configuración memoizada
  const linearGraphicsOptions = useMemo(() => ({
    enableLinearGraphics: true,
    enableRealTimeValidation: true,
    enableHoverEffects: true,
    enableFillEffects: true,
    debugMode: false,
    ...options
  }), [options]);
  
  /**
   * Inicializa el sistema de gráficas lineales
   */
  const initializeLinearGraphics = useCallback(() => {
    if (!containerRef?.current || isInitializedRef.current) {
      return;
    }
    
    try {
      // Buscar todos los canvas dentro del contenedor por superficie
      // CORRECCIÓN: Usar selectores específicos para evitar confusión entre vestibulares
      const surfaceSections = [
        { selector: '.vestibular-superior', surface: 'vestibular', section: 'superior' },
        { selector: '.palatine-images', surface: 'palatine', section: 'superior' },
        { selector: '.lingual-images', surface: 'lingual', section: 'inferior' },
        { selector: '.vestibular-inferior', surface: 'vestibular', section: 'inferior' }
      ];
      
      let totalCanvasFound = 0;
      const canvasMap = new Map(); // key: `${toothNumber}-${surface}`, value: canvas
      
      surfaceSections.forEach(({ selector, surface, section: sectionType }) => {
        const section = containerRef.current.querySelector(selector);
        if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🔍 [initializeLinearGraphics] Buscando sección: ${selector} (${sectionType} - ${surface}) - Encontrada: ${!!section}`);
        
        if (section) {
          const canvasElements = section.querySelectorAll('canvas[data-tooth]');
          if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🎨 [initializeLinearGraphics] Canvas encontrados en ${selector} (${sectionType} - ${surface}): ${canvasElements.length}`);
          
          canvasElements.forEach(canvas => {
            const toothNumber = canvas.getAttribute('data-tooth');
            if (toothNumber) {
              // Configurar dimensiones del canvas
              const parentContainer = canvas.parentElement;
              
              if (parentContainer) {
                const containerRect = parentContainer.getBoundingClientRect();
                canvas.width = containerRect.width || LINEAR_GRAPHICS_CONFIG.DIMENSIONS.TOOTH_CANVAS_WIDTH;
                canvas.height = containerRect.height || LINEAR_GRAPHICS_CONFIG.DIMENSIONS.TOOTH_CANVAS_HEIGHT;
                
                canvas.style.width = '100%';
                canvas.style.height = '100%';
              }
              
              // Crear clave única para diente + superficie
              const canvasKey = `${toothNumber}-${surface}`;
              canvasMap.set(canvasKey, canvas);
              totalCanvasFound++;
              
              if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`✅ [initializeLinearGraphics] Canvas registrado: ${canvasKey}`);
            }
          });
        } else {
          if (ADVANCED_LOGGING_CONFIG.enabled) console.warn(`⚠️ [initializeLinearGraphics] No se encontró la sección: ${selector}`);
        }
      });
      
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`📊 [initializeLinearGraphics] Total canvas encontrados: ${totalCanvasFound}`);
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🗺️ [initializeLinearGraphics] Canvas registrados:`, Array.from(canvasMap.keys()));
      
      if (totalCanvasFound === 0) {
        console.error('❌ [initializeLinearGraphics] No se encontraron canvas. Abortando inicialización.');
        return;
      }
      
      // Almacenar referencias de canvas
      canvasRefsRef.current = canvasMap;
      
      // Crear instancia del actualizador extendido con múltiples canvas
      realTimeUpdaterRef.current = new ExtendedRealTimeGraphicsUpdater(
        canvasRefsRef.current,
        null, // engine se puede pasar si existe
        linearGraphicsOptions
      );
      
      isInitializedRef.current = true;
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('🎉 [initializeLinearGraphics] Sistema de gráficas lineales inicializado correctamente');

      const initialDataset = pendingDataRef.current || latestDataRef.current;
      if (initialDataset) {
        try {
          // Normalize: treat zero triples as no-data so nothing draws by default
          const normalizeZeroTriples = (dataset) => {
            const out = {};
            Object.entries(dataset || {}).forEach(([tooth, t]) => {
              if (!t || typeof t !== 'object') { return; }
              const clone = { ...t };
              const faces = ['vestibularSuperior','palatinoSuperior','vestibularInferior','lingualInferior'];
              const fields = ['gingivalMargin','probingDepth'];
              fields.forEach((field) => {
                const v = clone[field];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  faces.forEach((faceKey) => {
                    const arr = v[faceKey];
                    if (Array.isArray(arr) && arr.length === 3) {
                      const allZero = arr.every((n) => Number(n) === 0);
                      if (allZero) {
                        v[faceKey] = [null, null, null];
                      }
                    }
                  });
                }
              });
              out[tooth] = clone;
            });
            return out;
          };
          const normalizedInitial = normalizeZeroTriples(initialDataset);
          realTimeUpdaterRef.current.updateAllLinearGraphics(normalizedInitial);
          lastDataRef.current = normalizedInitial;
        } catch (initialRenderError) {
          if (ADVANCED_LOGGING_CONFIG.enabled) console.error('Error renderizando gráficas iniciales:', initialRenderError);
        } finally {
          pendingDataRef.current = null;
        }
      }
      
    } catch (error) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.error('Error inicializando gráficas lineales:', error);
    }
  }, [containerRef, linearGraphicsOptions]);
  
  /**
   * Actualiza las gráficas lineales con nuevos datos
   */
  const updateLinearGraphics = useCallback((data) => {
    if (!realTimeUpdaterRef.current || !data) {
      return;
    }
    
    try {
      // Verificar si los datos han cambiado
      if (lastDataRef.current === data) {
        return;
      }
      
      // Implementar debounce para optimizar performance
      const debounceDelay = LINEAR_GRAPHICS_CONFIG.PERFORMANCE.DEBOUNCE_DELAY || 16;
      
      if (updateLinearGraphics.timeoutId) {
        clearTimeout(updateLinearGraphics.timeoutId);
      }
      
      updateLinearGraphics.timeoutId = setTimeout(() => {
        // Normalize: treat zero triples as no-data so nothing draws by default
        const normalizeZeroTriples = (dataset) => {
          const out = {};
          Object.entries(dataset || {}).forEach(([tooth, t]) => {
            if (!t || typeof t !== 'object') { return; }
            const clone = { ...t };
            const faces = ['vestibularSuperior','palatinoSuperior','vestibularInferior','lingualInferior'];
            const fields = ['gingivalMargin','probingDepth'];
            fields.forEach((field) => {
              const v = clone[field];
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                faces.forEach((faceKey) => {
                  const arr = v[faceKey];
                  if (Array.isArray(arr) && arr.length === 3) {
                    const allZero = arr.every((n) => Number(n) === 0);
                    if (allZero) {
                      v[faceKey] = [null, null, null];
                    }
                  }
                });
              }
            });
            out[tooth] = clone;
          });
          return out;
        };
        const normalizedData = normalizeZeroTriples(data);
        // MEJORA IMPLEMENTADA: Renderizar polígonos continuos si están habilitados
        if (ADVANCED_POLYGON_CONFIG.enabled) {
          const allTeethData = Object.values(normalizedData || {});
          
          // Renderizar polígonos para margen gingival
          if (allTeethData.some(tooth => tooth?.gingivalMargin)) {
            realTimeUpdaterRef.current.renderContinuousPolygons(allTeethData, 'gingivalMargin');
          }
          
          // Renderizar polígonos para profundidad de sondaje
          if (allTeethData.some(tooth => tooth?.probingDepth)) {
            realTimeUpdaterRef.current.renderContinuousPolygons(allTeethData, 'probingDepth');
          }
        } else {
          // Actualización tradicional
          realTimeUpdaterRef.current.updateAllLinearGraphics(normalizedData);
        }
        
        lastDataRef.current = normalizedData;
      }, debounceDelay);
      
    } catch (error) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.error('Error actualizando gráficas lineales:', error);
    }
  }, []);
  
  /**
   * Actualiza gráficas de un diente específico
   */
  const updateToothLinearGraphics = useCallback((toothNumber, toothData) => {
    if (!realTimeUpdaterRef.current) {
      return;
    }
    
    try {
      // Función auxiliar para extraer datos de mediciones lineales según la superficie específica
      const extractLinearDataForSurface = (fieldData, surface) => {
        
        if (!fieldData) {
          return [null, null, null];
        }
        
        // Si es un array simple (estructura antigua), devolverlo directamente
        if (Array.isArray(fieldData)) {
          const result = fieldData.length === 3 ? fieldData : [null, null, null];
          return result;
        }
        
        // Si es un objeto con caras específicas (nueva estructura)
        if (typeof fieldData === 'object') {
          // Determinar si es diente superior o inferior
          const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
          
          // Determinar la clave de la cara según la superficie y el tipo de diente
          let faceKey;
          if (isUpperTooth) {
            faceKey = surface === 'palatine' ? 'palatinoSuperior' : 'vestibularSuperior';
          } else {
            faceKey = surface === 'lingual' ? 'lingualInferior' : 'vestibularInferior';
          }
          
          const surfaceData = fieldData[faceKey];
          
          if (Array.isArray(surfaceData) && surfaceData.length === 3) {
            return surfaceData;
          }
        }
        
        return [null, null, null];
      };
      
      // Actualizar cache y gráficas usando el sistema de múltiples canvas
      if (realTimeUpdaterRef.current.linearGraphicsInstances) {
        // Determinar superficies disponibles según el tipo de diente
        const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
        const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
        
        if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🦷 [updateToothLinearGraphics] Diente ${toothNumber} - Tipo: ${isUpperTooth ? 'Superior' : 'Inferior'} - Superficies: [${surfaces.join(', ')}]`);
        
        surfaces.forEach(surface => {
          const canvasKey = `${toothNumber}-${surface}`;
          const linearGraphicsInstance = realTimeUpdaterRef.current.linearGraphicsInstances.get(canvasKey);
          
          if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`🎨 [updateToothLinearGraphics] Buscando canvas: ${canvasKey} - Encontrado: ${!!linearGraphicsInstance}`);
          
          if (linearGraphicsInstance) {
            // Extraer datos específicos para esta superficie
            const gm = extractLinearDataForSurface(toothData.gingivalMargin, surface);
            const pd = extractLinearDataForSurface(toothData.probingDepth, surface);
            const gmAllZero = Array.isArray(gm) && gm.length === 3 && gm.every((n) => Number(n) === 0);
            const pdAllZero = Array.isArray(pd) && pd.length === 3 && pd.every((n) => Number(n) === 0);
            const linearData = {
              gingivalMargin: gmAllZero ? [null, null, null] : gm,
              probingDepth: pdAllZero ? [null, null, null] : pd
            };
            
            if (ADVANCED_LOGGING_CONFIG.enabled) console.log(`📊 [updateToothLinearGraphics] Datos para ${canvasKey}:`, linearData);
            
            // Actualizar esta instancia específica
            linearGraphicsInstance.updateToothLinearGraphics(parseInt(toothNumber), linearData);
          }
        });
      }
      
    } catch (error) {
      if (ADVANCED_LOGGING_CONFIG.enabled) console.error(`Error actualizando gráficas del diente ${toothNumber}:`, error);
    }
  }, []);
  
  /**
   * Valida datos de medición en tiempo real
   */
  const validateMeasurement = useCallback((toothNumber, position, field, value) => {
    try {
      // Mapear nombres de campos a tipos de medición en mayúsculas
      const fieldMapping = {
        'probingDepth': 'PROBING_DEPTH',
        'gingivalMargin': 'GINGIVAL_MARGIN',
        'gumWidth': 'GUM_WIDTH',
        'mobility': 'MOBILITY',
        'furca': 'FURCA'
      };
      
      const measurementType = fieldMapping[field] || field.toUpperCase();
      
      // Usar UniversalToothValidator para validación (solo 2 parámetros)
      const validatedValue = UniversalToothValidator.validateMeasurement(value, measurementType);
      
      // Verificar si el valor fue corregido
      const originalValue = parseFloat(value);
      const wasModified = !isNaN(originalValue) && originalValue !== validatedValue;
      
      return {
        valid: !wasModified,
        error: wasModified ? `Valor fuera de rango, corregido a ${validatedValue}` : null,
        warning: null,
        clinicalNote: null,
        suggestion: validatedValue
      };
      
    } catch (error) {
      console.error('Error en validación:', error);
      return {
        valid: false,
        error: 'Error interno de validación'
      };
    }
  }, []);
  
  /**
   * Agrega efecto hover a una posición específica
   */
  const addHoverEffect = useCallback((toothNumber, position) => {
    if (realTimeUpdaterRef.current?.linearGraphicsInstances) {
      // Determinar superficies disponibles según el tipo de diente
      const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
      const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
      
      surfaces.forEach(surface => {
        const canvasKey = `${toothNumber}-${surface}`;
        const linearGraphicsInstance = realTimeUpdaterRef.current.linearGraphicsInstances.get(canvasKey);
        if (linearGraphicsInstance) {
          linearGraphicsInstance.addHoverEffect(toothNumber, position);
        }
      });
    }
  }, []);
  
  /**
   * Remueve efecto hover
   */
  const removeHoverEffect = useCallback((toothNumber, position) => {
    if (realTimeUpdaterRef.current?.linearGraphicsInstances) {
      // Determinar superficies disponibles según el tipo de diente
      const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
      const surfaces = isUpperTooth ? ['vestibular', 'palatine'] : ['vestibular', 'lingual'];
      
      surfaces.forEach(surface => {
        const canvasKey = `${toothNumber}-${surface}`;
        const linearGraphicsInstance = realTimeUpdaterRef.current.linearGraphicsInstances.get(canvasKey);
        if (linearGraphicsInstance) {
          linearGraphicsInstance.removeHoverEffect(toothNumber, position);
        }
      });
    }
  }, []);
  
  /**
   * Obtiene métricas de performance
   */
  const getPerformanceMetrics = useCallback(() => {
    if (!realTimeUpdaterRef.current) {
      return null;
    }
    
    try {
      return realTimeUpdaterRef.current.getExtendedPerformanceMetrics();
    } catch (error) {
      console.error('Error obteniendo métricas:', error);
      return null;
    }
  }, []);
  
  /**
   * Limpia recursos del sistema
   */
  const cleanup = useCallback(() => {
    if (realTimeUpdaterRef.current) {
      realTimeUpdaterRef.current.cleanup();
      realTimeUpdaterRef.current = null;
    }
    
    isInitializedRef.current = false;
    lastDataRef.current = null;
  }, []);
  
  // Efecto para inicialización
  useEffect(() => {
    if (containerRef.current && !isInitializedRef.current) {
      // Pequeño delay para asegurar que los canvas estén completamente montados
      const timeoutId = setTimeout(() => {
        initializeLinearGraphics();
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [containerRef, initializeLinearGraphics]);
  
  // Efecto para actualización de datos
  useEffect(() => {
    latestDataRef.current = periodontogramData;

    if (!periodontogramData) {
      pendingDataRef.current = null;
      return;
    }

    if (!isInitializedRef.current) {
      pendingDataRef.current = periodontogramData;
      return;
    }

    updateLinearGraphics(periodontogramData);
    pendingDataRef.current = null;
  }, [periodontogramData, updateLinearGraphics]);
  
  // Efecto de limpieza
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  // Estado del sistema
  const systemStatus = useMemo(() => ({
    initialized: isInitializedRef.current,
    hasContainer: !!containerRef?.current,
    canvasCount: canvasRefsRef.current?.size || 0,
    hasData: !!periodontogramData,
    hasUpdater: !!realTimeUpdaterRef.current,
    linearGraphicsEnabled: realTimeUpdaterRef.current?.linearGraphicsEnabled || false
  }), [containerRef, periodontogramData]);
  
  // ============================================================================
  // MEJORAS IMPLEMENTADAS - FASE 4: EFECTOS HOVER AVANZADOS
  // ============================================================================
  
  // Función para manejar efectos hover avanzados
  const handleAdvancedHover = useCallback((element, toothNumber, measurementType, value) => {
    if (!ADVANCED_HOVER_CONFIG.enabled || !realTimeUpdaterRef.current) return;
    
    try {
      // Mostrar tooltip avanzado
      if (ADVANCED_HOVER_CONFIG.tooltip.enabled) {
        showAdvancedTooltip(element, toothNumber, measurementType, value);
      }
      
      // Aplicar highlight visual
      if (ADVANCED_HOVER_CONFIG.highlight.enabled) {
        applyHoverHighlight(element, toothNumber);
      }
      
      // Marcar región como dirty para actualización optimizada
      if (realTimeUpdaterRef.current.markDirtyRegion) {
        realTimeUpdaterRef.current.markDirtyRegion(`${toothNumber}_${measurementType}`);
      }
      
    } catch (error) {
      console.error('Error en efectos hover avanzados:', error);
    }
  }, []);
  
  // Función para mostrar tooltip avanzado
  const showAdvancedTooltip = useCallback((element, toothNumber, measurementType, value) => {
    const config = ADVANCED_HOVER_CONFIG.tooltip;
    
    // Crear tooltip si no existe
    let tooltip = document.getElementById('advanced-periodontogram-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'advanced-periodontogram-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        background: ${config.background};
        color: ${config.text_color};
        padding: ${config.padding}px;
        border-radius: ${config.border_radius}px;
        font-size: ${config.font_size}px;
        max-width: ${config.max_width}px;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity ${config.fade_duration}ms ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(tooltip);
    }
    
    // Contenido del tooltip
    const measurementLabel = measurementType === 'gingivalMargin' ? 'Margen Gingival' : 'Profundidad de Sondaje';
    const unit = ADVANCED_HOVER_CONFIG.measurement_preview.format.show_unit ? ' mm' : '';
    const formattedValue = typeof value === 'number' ? value.toFixed(ADVANCED_HOVER_CONFIG.measurement_preview.format.decimal_places) : value;
    
    tooltip.innerHTML = `
      <div><strong>Diente ${toothNumber}</strong></div>
      <div>${measurementLabel}: ${formattedValue}${unit}</div>
      ${getTooltipStatistics(toothNumber, measurementType, value)}
    `;
    
    // Posicionar tooltip
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
    
    // Mostrar con delay
    setTimeout(() => {
      tooltip.style.opacity = '1';
    }, config.delay);
    
    // Auto-hide después de un tiempo
    setTimeout(() => {
      if (tooltip) {
        tooltip.style.opacity = '0';
        setTimeout(() => {
          if (tooltip && tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
          }
        }, config.fade_duration);
      }
    }, 3000);
  }, []);
  
  // Función para obtener estadísticas del tooltip
  const getTooltipStatistics = useCallback((toothNumber, measurementType, value) => {
    if (!ADVANCED_HOVER_CONFIG.measurement_preview.show_statistics) return '';
    
    try {
      // Obtener estadísticas clínicas
      const indicators = ADVANCED_CLINICAL_INDICATORS;
      let status = 'Normal';
      let statusColor = EXTENDED_COLORS.CLINICAL_STATES.HEALTHY;
      
      if (measurementType === 'probingDepth' && value >= indicators.pathological_pockets.threshold) {
        status = 'Bolsa Patológica';
        statusColor = indicators.pathological_pockets.color;
      } else if (measurementType === 'gingivalMargin' && value <= -indicators.severe_recession.threshold) {
        status = 'Recesión Severa';
        statusColor = indicators.severe_recession.color;
      }
      
      return `<div style="color: ${statusColor}; margin-top: 4px;"><small>${status}</small></div>`;
    } catch (error) {
      return '';
    }
  }, []);
  
  // Función para aplicar highlight hover
  const applyHoverHighlight = useCallback((element, toothNumber) => {
    const config = ADVANCED_HOVER_CONFIG.highlight;
    
    // Aplicar estilos de highlight
    element.style.transition = `all ${config.animation.duration}ms ease`;
    element.style.backgroundColor = config.color;
    element.style.opacity = config.opacity;
    element.style.outline = `${config.stroke_width}px solid ${config.color}`;
    
    // Remover highlight al salir
    const removeHighlight = () => {
      element.style.backgroundColor = '';
      element.style.opacity = '';
      element.style.outline = '';
      element.removeEventListener('mouseleave', removeHighlight);
    };
    
    element.addEventListener('mouseleave', removeHighlight);
  }, []);
  
  // ============================================================================
  // MEJORAS IMPLEMENTADAS - FASE 5: FEEDBACK VISUAL EN TIEMPO REAL
  // ============================================================================
  
  // Función para mostrar feedback de validación en tiempo real
  const showRealTimeFeedback = useCallback((element, validationResult, value) => {
    if (!REAL_TIME_FEEDBACK_CONFIG.enabled) return;
    
    try {
      const config = REAL_TIME_FEEDBACK_CONFIG.validation_indicators;
      
      // Determinar color según resultado de validación
      let borderColor = config.colors.valid;
      let feedbackText = '';
      
      if (validationResult.hasErrors) {
        borderColor = config.colors.error;
        feedbackText = validationResult.errors.join(', ');
      } else if (validationResult.hasWarnings) {
        borderColor = config.colors.warning;
        feedbackText = validationResult.warnings.join(', ');
      }
      
      // Aplicar estilos de feedback
      element.style.borderColor = borderColor;
      element.style.borderWidth = '2px';
      element.style.transition = 'border-color 300ms ease';
      
      // Mostrar mensaje de feedback si hay errores o advertencias
      if (feedbackText && (config.show_errors || config.show_warnings)) {
        showFeedbackMessage(element, feedbackText, borderColor);
      }
      
    } catch (error) {
      console.error('Error en feedback visual en tiempo real:', error);
    }
  }, []);
  
  // Función para mostrar mensaje de feedback
  const showFeedbackMessage = useCallback((element, message, color) => {
    // Crear elemento de mensaje
    let feedbackMsg = element.parentNode.querySelector('.real-time-feedback');
    if (!feedbackMsg) {
      feedbackMsg = document.createElement('div');
      feedbackMsg.className = 'real-time-feedback';
      feedbackMsg.style.cssText = `
        position: absolute;
        background: ${color};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        z-index: 1000;
        margin-top: 2px;
        opacity: 0;
        transition: opacity 300ms ease;
      `;
      element.parentNode.appendChild(feedbackMsg);
    }
    
    feedbackMsg.textContent = message;
    feedbackMsg.style.backgroundColor = color;
    feedbackMsg.style.opacity = '1';
    
    // Auto-hide después de 3 segundos
    setTimeout(() => {
      if (feedbackMsg) {
        feedbackMsg.style.opacity = '0';
        setTimeout(() => {
          if (feedbackMsg && feedbackMsg.parentNode) {
            feedbackMsg.parentNode.removeChild(feedbackMsg);
          }
        }, 300);
      }
    }, 3000);
  }, []);
  
  // Función para limpiar las gráficas lineales
  const clearLinearGraphics = useCallback(() => {
    if (!realTimeUpdaterRef.current) return;
    
    try {
      console.log('Limpiando gráficas lineales');
      
      // Limpiar todas las instancias de gráficas lineales
      if (realTimeUpdaterRef.current.linearGraphicsInstances) {
        realTimeUpdaterRef.current.linearGraphicsInstances.forEach((instance) => {
          if (instance.clear) {
            instance.clear();
          }
        });
      }
      
      // Limpiar cachés avanzados
      if (realTimeUpdaterRef.current.clearCaches) {
        realTimeUpdaterRef.current.clearCaches();
      }
      
      console.log('Gráficas lineales limpiadas correctamente');
    } catch (error) {
      console.error('Error al limpiar gráficas lineales:', error);
    }
  }, []);
  
  // Función para calcular puntuación de calidad
  const calculateQualityScore = useCallback((stats, qualityMetrics) => {
    try {
      let score = 0;
      let maxScore = 0;
      
      // Rendimiento (40% del score)
      maxScore += 40;
      if (stats.lastRenderTime <= qualityMetrics.performance.max_render_time) {
        score += 40;
      } else {
        score += Math.max(0, 40 * (1 - (stats.lastRenderTime - qualityMetrics.performance.max_render_time) / qualityMetrics.performance.max_render_time));
      }
      
      // Eficiencia de caché (30% del score)
      maxScore += 30;
      score += 30 * Math.min(1, stats.cacheHitRatio / qualityMetrics.performance.cache_hit_ratio_target);
      
      // Estabilidad (30% del score)
      maxScore += 30;
      score += 30; // Placeholder - implementar métricas de estabilidad
      
      return Math.round((score / maxScore) * 100);
    } catch (error) {
      return 0;
    }
  }, []);

  return {
    // Estado
    systemStatus,
    
    // Métodos principales
    initializeLinearGraphics,
    updateLinearGraphics,
    updateToothLinearGraphics,
    clearLinearGraphics,
    
    // Validación
    validateMeasurement,
    
    // Efectos visuales
    addHoverEffect,
    removeHoverEffect,
    handleAdvancedHover,
    showRealTimeFeedback,
    
    // Utilidades
    getPerformanceMetrics,
    cleanup,
    
    // Referencias (para casos avanzados)
    realTimeUpdaterRef: realTimeUpdaterRef.current
  };
};

export default usePeriodontogramLinearGraphics;