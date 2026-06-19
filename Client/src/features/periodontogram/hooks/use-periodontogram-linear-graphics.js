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
import { logger } from '../../../shared/utils/logger';
import {
  LINEAR_GRAPHICS_CONFIG,
  ADVANCED_LOGGING_CONFIG
} from '../utils/config.js';


// Trata las tripletas todo-cero como "sin dato" para que la gráfica no dibuje
// líneas por defecto. IMPORTANTE: los dientes provienen del estado de React y
// los alias canónicos comparten arrays — se copian campo y caras antes de
// sustituir, nunca se muta el dataset de entrada.
const GRAPHIC_FACE_KEYS = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];
const GRAPHIC_FIELD_KEYS = ['gingivalMargin', 'probingDepth'];

const normalizeZeroTriples = (dataset) => {
  const out = {};
  Object.entries(dataset || {}).forEach(([tooth, t]) => {
    if (!t || typeof t !== 'object') { return; }
    const clone = { ...t };
    GRAPHIC_FIELD_KEYS.forEach((field) => {
      const v = clone[field];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const fieldCopy = { ...v };
        GRAPHIC_FACE_KEYS.forEach((faceKey) => {
          const arr = fieldCopy[faceKey];
          if (Array.isArray(arr) && arr.length === 3) {
            const allZero = arr.every((n) => Number(n) === 0);
            if (allZero) {
              fieldCopy[faceKey] = [null, null, null];
            }
          }
        });
        clone[field] = fieldCopy;
      }
    });
    out[tooth] = clone;
  });
  return out;
};

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
        if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`🔍 [initializeLinearGraphics] Buscando sección: ${selector} (${sectionType} - ${surface}) - Encontrada: ${!!section}`);
        
        if (section) {
          const canvasElements = section.querySelectorAll('canvas[data-tooth]');
          if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`🎨 [initializeLinearGraphics] Canvas encontrados en ${selector} (${sectionType} - ${surface}): ${canvasElements.length}`);
          
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
              
              if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`✅ [initializeLinearGraphics] Canvas registrado: ${canvasKey}`);
            }
          });
        } else {
          if (ADVANCED_LOGGING_CONFIG.enabled) console.warn(`⚠️ [initializeLinearGraphics] No se encontró la sección: ${selector}`);
        }
      });
      
      if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`📊 [initializeLinearGraphics] Total canvas encontrados: ${totalCanvasFound}`);
      if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`🗺️ [initializeLinearGraphics] Canvas registrados:`, Array.from(canvasMap.keys()));
      
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
      if (ADVANCED_LOGGING_CONFIG.enabled) logger.log('🎉 [initializeLinearGraphics] Sistema de gráficas lineales inicializado correctamente');

      const initialDataset = pendingDataRef.current || latestDataRef.current;
      if (initialDataset) {
        try {
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
        const normalizedData = normalizeZeroTriples(data);
        realTimeUpdaterRef.current.updateAllLinearGraphics(normalizedData);
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
        
        if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`🦷 [updateToothLinearGraphics] Diente ${toothNumber} - Tipo: ${isUpperTooth ? 'Superior' : 'Inferior'} - Superficies: [${surfaces.join(', ')}]`);
        
        surfaces.forEach(surface => {
          const canvasKey = `${toothNumber}-${surface}`;
          const linearGraphicsInstance = realTimeUpdaterRef.current.linearGraphicsInstances.get(canvasKey);
          
          if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`🎨 [updateToothLinearGraphics] Buscando canvas: ${canvasKey} - Encontrado: ${!!linearGraphicsInstance}`);
          
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
            
            if (ADVANCED_LOGGING_CONFIG.enabled) logger.log(`📊 [updateToothLinearGraphics] Datos para ${canvasKey}:`, linearData);
            
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
    // Extraer solo .teeth para que las gráficas reciban { toothNumber: toothData } y no el wrapper completo
    const teethOnly = periodontogramData?.teeth || null;
    latestDataRef.current = teethOnly;

    if (!teethOnly) {
      pendingDataRef.current = null;
      return;
    }

    if (!isInitializedRef.current) {
      pendingDataRef.current = teethOnly;
      return;
    }

    updateLinearGraphics(teethOnly);
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
  
  return {
    // Estado
    systemStatus,

    // Métodos principales
    updateToothLinearGraphics,

    // Validación
    validateMeasurement,

    // Efectos visuales
    addHoverEffect,
    removeHoverEffect
  };
};

export default usePeriodontogramLinearGraphics;