import { useState, useCallback, useMemo, useEffect, memo, useRef } from 'react';
import { perfMonitor, withRenderCount } from './utils/perf-monitor';
import PeriodontogramUtils from "./utils/periodontogram-utils";
import { getToothNumberButtonProps } from './periodontograma-functions/index.js';
import { VALIDATION_RANGES, ZONE_CONFIG, SELECT_OPTIONS, ROW_DEFINITIONS, FIELD_TYPE_MAP, RESPONSIVE_CONFIG } from './constants/periodontogram-constants';
import { LINEAR_GRAPHICS_CONFIG } from './utils/config';
import BleedingMultiStateCheckbox from './components/bleeding-multi-state-checkbox';
import usePeriodontogramLinearGraphics from './hooks/use-periodontogram-linear-graphics';
import { getToothAvailability } from './utils/periodontogram-state-manager.js';
import './styles/periodontogram-design.css';
import './styles/periodontogram-linear-graphics.css';

const FURCA_DEFAULTS = Object.freeze({
  vestibular: 0,
  lingualPalatino: 0,
  furca1: 0,
  furca2: 0,
  doble: Object.freeze({ furca1: 0, furca2: 0 })
});

const toFurcaNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeFurcaData = (rawFurca) => {
  if (!rawFurca || typeof rawFurca !== 'object') {
    const fallback = toFurcaNumber(rawFurca, FURCA_DEFAULTS.vestibular);
    return {
      vestibular: fallback,
      lingualPalatino: fallback,
      furca1: fallback,
      furca2: fallback,
      doble: { furca1: fallback, furca2: fallback }
    };
  }

  const fallbackVestibular = toFurcaNumber(
    rawFurca.vestibular ?? rawFurca.furca ?? rawFurca.default,
    FURCA_DEFAULTS.vestibular
  );

  const fallbackLingual = toFurcaNumber(
    rawFurca.lingualPalatino ?? rawFurca.lingual ?? rawFurca.palatino,
    fallbackVestibular
  );

  const currentDouble = (rawFurca.doble && typeof rawFurca.doble === 'object') ? rawFurca.doble : {};
  const furca1 = toFurcaNumber(
    currentDouble.furca1 ?? rawFurca.furca1 ?? rawFurca.mesial,
    fallbackVestibular
  );
  const furca2 = toFurcaNumber(
    currentDouble.furca2 ?? rawFurca.furca2 ?? rawFurca.distal,
    fallbackLingual
  );

  return {
    ...rawFurca,
    vestibular: fallbackVestibular,
    lingualPalatino: fallbackLingual,
    furca1,
    furca2,
    doble: {
      ...currentDouble,
      furca1,
      furca2
    }
  };
};

/**
 * Componente de Periodontograma con diseño específico según prototipo
 * SUPERIOR: 12 filas vestibular + imágenes vestibular + imágenes palatino + 6 filas palatino
 * INFERIOR: 6 filas lingual + imágenes lingual + imágenes vestibular + 12 filas vestibular
 */
const PeriodontogramDesign = ({ 
  periodontogramData = {}, 
  onToothUpdate, 
  selectedTooth, 
  onToothSelect,
  readOnly = false,
  onSaveComplete,
  isSaving = false,
  viewMode = 'rendered',
  onToggleViewMode,
  performanceMode = 'balanced', // 'balanced' | 'fast' | 'minimal'
  debugPerformance = false
}) => {
  const [editingCell, setEditingCell] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [inputValues, setInputValues] = useState({});
  const [manuallyEdited, setManuallyEdited] = useState({});
  const [pendingFocusRequest, setPendingFocusRequest] = useState(null);
  const measurementInputRefs = useRef(new Map());
  const autoAdvanceTimersRef = useRef(new Map());
  const programmaticFocusRef = useRef(null);
  const pendingFocusKeysRef = useRef(new Set());
  
  // Referencias para gráficas lineales
  const canvasRef = useRef(null);
  
  // Hook de gráficas lineales con contenedor principal
  const containerRef = useRef(null);
  
  // Opciones derivadas de performanceMode (balanced | fast | minimal)
  const linearGraphicsDerivedOptions = useMemo(() => {
    if (performanceMode === 'minimal') return { enableLinearGraphics: false, enableHoverEffects: false, enableFillEffects: false };
    if (performanceMode === 'fast') return { enableLinearGraphics: true, enableHoverEffects: false, enableFillEffects: false };
    return { enableLinearGraphics: true, enableHoverEffects: true, enableFillEffects: true }; // balanced
  }, [performanceMode]);

  const {
    systemStatus,
    updateToothLinearGraphics,
    validateMeasurement,
    addHoverEffect,
    removeHoverEffect
  } = usePeriodontogramLinearGraphics({
    containerRef: containerRef,
    periodontogramData,
    onDataChange: onToothUpdate,
    options: {
      enableLinearGraphics: linearGraphicsDerivedOptions.enableLinearGraphics,
      enableRealTimeValidation: true,
      enableHoverEffects: linearGraphicsDerivedOptions.enableHoverEffects,
      enableFillEffects: linearGraphicsDerivedOptions.enableFillEffects,
      debugMode: debugPerformance
    }
  });

  const upperTeeth = useMemo(() => PeriodontogramUtils.getUpperTeeth(), []);
  const lowerTeeth = useMemo(() => PeriodontogramUtils.getLowerTeeth(), []);
  // Arrays de dientes organizados según el diseño (precalculados arriba)

  // Mapeo de etiquetas para los campos
  const fieldLabels = useMemo(() => ({
    toothNumber: 'Diente',
    implant: 'Implante',
    mobility: 'Movilidad',
    prognosis: 'Pronóstico individual',
    furca: 'Furca',
    bleeding: 'Sangrado',
    suppuration: 'Supuración',
    plaque: 'Placa',
    gumWidth: 'Anchura encía',
    gingivalMargin: 'Margen gingival',
    probingDepth: 'Profundidad de sondaje'
  }), []);

  // Mapeo de tipos de campo para el componente
  const fieldTypeMap = useMemo(() => ({
    toothNumber: 'tooth-number-btn',
    implant: 'checkbox',
    mobility: 'select',
    prognosis: 'select',
    furca: 'select',
    bleeding: 'triple-checkbox',
    suppuration: 'triple-checkbox',
    plaque: 'triple-checkbox',
    gumWidth: 'mini-input',
    gingivalMargin: 'triple-input',
    probingDepth: 'triple-input'
  }), []);

  // Función helper para crear filas desde definiciones
  const createRowsFromDefinition = useCallback((definition) => {
    return definition.map(fieldKey => ({
      key: fieldKey,
      label: fieldLabels[fieldKey],
      type: fieldTypeMap[fieldKey]
    }));
  }, [fieldLabels, fieldTypeMap]);

  const selectOptionSets = useMemo(() => ({
    mobility: SELECT_OPTIONS.MOBILITY,
    prognosis: SELECT_OPTIONS.PROGNOSIS,
    furca: SELECT_OPTIONS.FURCA
  }), []);

  // Cache de datos normalizados por diente para evitar trabajo repetido y favorecer React.memo
  const toothCacheRef = useRef(new Map());

  // Invalida cache cuando cambia la referencia principal de datos
  useEffect(() => {
    toothCacheRef.current.clear();
  }, [periodontogramData]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= RESPONSIVE_CONFIG.MOBILE_BREAKPOINT);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const registerMeasurementInput = useCallback((key, node) => {
    if (!key) return;
    if (node) {
      measurementInputRefs.current.set(key, node);
    } else {
      measurementInputRefs.current.delete(key);
    }
  }, []);

  const focusMeasurementInput = useCallback((key, { preferSelect = true } = {}) => {
    if (!key) return false;
    const target = measurementInputRefs.current.get(key);
    if (target) {
      programmaticFocusRef.current = key;
      const selectionStart = typeof target.selectionStart === 'number' ? target.selectionStart : null;
      const selectionEnd = typeof target.selectionEnd === 'number' ? target.selectionEnd : null;
      target.focus();
      if (preferSelect || selectionStart === selectionEnd) {
        requestAnimationFrame(() => {
          if (typeof target.select === 'function') {
            target.select();
          }
          // Limpiar la bandera después de seleccionar, no antes
          requestAnimationFrame(() => {
            if (programmaticFocusRef.current === key) {
              programmaticFocusRef.current = null;
            }
          });
        });
      } else {
        // Si no seleccionamos, limpiar inmediatamente
        requestAnimationFrame(() => {
          if (programmaticFocusRef.current === key) {
            programmaticFocusRef.current = null;
          }
        });
      }
      return true;
    }
    return false;
  }, [programmaticFocusRef]);

  const getFaceKeyForTooth = (side, numericTooth) => {
    const isUpper = numericTooth >= 11 && numericTooth <= 28;
    if (isUpper) {
      return side === 'palatine' ? 'palatinoSuperior' : 'vestibularSuperior';
    }
    return side === 'lingual' ? 'lingualInferior' : 'vestibularInferior';
  };

  const resolveMeasurementNeighbor = useCallback((toothNumber, rowKey, side, index, offset) => {
    if (!offset) return null;

    const numericTooth = typeof toothNumber === 'number' ? toothNumber : parseInt(toothNumber, 10);
    if (!Number.isFinite(numericTooth)) return null;

    const direction = offset > 0 ? 1 : -1;
    const baseFaceKey = getFaceKeyForTooth(side, numericTooth);
    const candidateIndex = index + offset;

    if (candidateIndex >= 0 && candidateIndex <= 2) {
      return {
        key: `${numericTooth}-${rowKey}-${side}-${baseFaceKey}-${candidateIndex}`,
        toothNumber: numericTooth,
        faceKey: baseFaceKey,
        index: candidateIndex
      };
    }

    const sequence = upperTeeth.includes(numericTooth)
      ? upperTeeth
      : lowerTeeth.includes(numericTooth)
        ? lowerTeeth
        : null;

    if (!sequence) return null;

    let position = sequence.indexOf(numericTooth);
    if (position === -1) return null;

    position += direction;

    while (position >= 0 && position < sequence.length) {
      const nextTooth = sequence[position];
      const nextToothData = periodontogramData?.teeth?.[nextTooth];
      const isAbsent = nextToothData?.ausente ?? nextToothData?.absent;

      if (!isAbsent) {
        const nextFaceKey = getFaceKeyForTooth(side, nextTooth);
        const nextIndex = direction > 0 ? 0 : 2;

        return {
          key: `${nextTooth}-${rowKey}-${side}-${nextFaceKey}-${nextIndex}`,
          toothNumber: nextTooth,
          faceKey: nextFaceKey,
          index: nextIndex
        };
      }

      position += direction;
    }

    return null;
  }, [upperTeeth, lowerTeeth, periodontogramData]);

  const focusSiblingMeasurementInput = useCallback((toothNumber, rowKey, side, _faceKey, index, offset) => {
    const neighbor = resolveMeasurementNeighbor(toothNumber, rowKey, side, index, offset);
    if (!neighbor) return false;
    return focusMeasurementInput(neighbor.key);
  }, [resolveMeasurementNeighbor, focusMeasurementInput]);

  const cancelAutoAdvance = useCallback((key) => {
    if (!key) return;
    const timer = autoAdvanceTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      autoAdvanceTimersRef.current.delete(key);
    }
  }, []);

  const shouldAutoAdvanceImmediately = useCallback((fieldKey, rawInputValue) => {
    if (!['gingivalMargin', 'probingDepth'].includes(fieldKey)) {
      return false;
    }

    const value = typeof rawInputValue === 'string' ? rawInputValue.trim() : String(rawInputValue ?? '').trim();
    if (!value || value === '-' || value === '+') {
      return false;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
      return false;
    }

    const measurementRange = fieldKey === 'gingivalMargin'
      ? VALIDATION_RANGES.GINGIVAL_MARGIN
      : VALIDATION_RANGES.PROBING_DEPTH;

    if (!measurementRange) {
      return false;
    }

    if (numeric < measurementRange.min || numeric > measurementRange.max) {
      return false;
    }

    if (value.startsWith('-')) {
      return value.length >= 2;
    }

    return value.length >= 1;
  }, []);

  const scheduleAutoAdvance = useCallback((currentKey, context, { delay = 220 } = {}) => {
    const neighbor = resolveMeasurementNeighbor(
      context.toothNumber,
      context.rowKey,
      context.side,
      context.index,
      1
    );

    cancelAutoAdvance(currentKey);

    if (!neighbor) {
      return;
    }

    const runFocus = () => {
      if (focusMeasurementInput(neighbor.key, { preferSelect: true })) {
        pendingFocusKeysRef.current.delete(neighbor.key);
        return;
      }

      if (!pendingFocusKeysRef.current.has(neighbor.key)) {
        pendingFocusKeysRef.current.add(neighbor.key);
      }
      setPendingFocusRequest({ key: neighbor.key, attempts: 0, preferSelect: true });
    };

    if (delay <= 0) {
      requestAnimationFrame(runFocus);
      return;
    }

    const timer = setTimeout(() => {
      autoAdvanceTimersRef.current.delete(currentKey);
      runFocus();
    }, Math.max(0, delay));
    autoAdvanceTimersRef.current.set(currentKey, timer);
  }, [resolveMeasurementNeighbor, cancelAutoAdvance, focusMeasurementInput, setPendingFocusRequest]);

  useEffect(() => () => {
    autoAdvanceTimersRef.current.forEach(clearTimeout);
    autoAdvanceTimersRef.current.clear();
    measurementInputRefs.current.clear();
  }, []);

  useEffect(() => {
    if (!pendingFocusRequest || !pendingFocusRequest.key) return undefined;

    const { key, attempts = 0, preferSelect = true } = pendingFocusRequest;
    const focused = focusMeasurementInput(key, { preferSelect });
    if (focused) {
      pendingFocusKeysRef.current.delete(key);
      setPendingFocusRequest(null);
      return undefined;
    }

    if (attempts >= 5) {
      pendingFocusKeysRef.current.delete(key);
      setPendingFocusRequest(null);
      return undefined;
    }

    const raf = requestAnimationFrame(() => {
      setPendingFocusRequest((current) => {
        if (!current || current.key !== key) {
          return current;
        }
        return { key, attempts: attempts + 1, preferSelect };
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [pendingFocusRequest, focusMeasurementInput]);

  // Usar función centralizada para determinar si un diente puede tener furca

  // Definir las 11 filas para vestibular según el prototipo (sin notas)
  const vestibularRows = useMemo(() => createRowsFromDefinition(ROW_DEFINITIONS.VESTIBULAR), [createRowsFromDefinition]);

  // Definir las filas para vestibular inferior (diente al final)
  const vestibularLowerRows = useMemo(() => createRowsFromDefinition(ROW_DEFINITIONS.VESTIBULAR_LOWER), [createRowsFromDefinition]);

  // Definir las 6 filas para palatino/lingual según el prototipo
  const palatineRows = useMemo(() => createRowsFromDefinition(ROW_DEFINITIONS.PALATINE), [createRowsFromDefinition]);
  const lingualRows = useMemo(() => createRowsFromDefinition(ROW_DEFINITIONS.LINGUAL), [createRowsFromDefinition]);

  // Usar función centralizada para determinar si necesita doble entrada de furca

  // Obtener datos normalizados de un diente (temporalmente sin cache para debug)
  const getToothData = useCallback((toothNumber) => {
    // TEMPORAL: Removemos cache para evitar problemas con mini inputs
    const raw = periodontogramData?.teeth?.[toothNumber] || {};
    const normalized = {
      ...raw,
      // Preferir claves canónicas del backend (es) y caer a alias (en)
      absent: (raw.ausente ?? raw.absent ?? false),
      implant: (raw.implante ?? raw.implant ?? false),
      mobility: (raw.movilidad ?? raw.mobility ?? 0),
      gumWidth: (raw.anchuraEncia ?? raw.gumWidth ?? 0),
      prognosis: String(raw.pronostico ?? raw.prognosis ?? 'bueno').toLowerCase()
    };
    return normalized;
  }, [periodontogramData]);

  // Actualizar datos de un diente con soporte a estructuras nuevas y legacy
  const updateToothData = useCallback((toothNumber, field, value, side = null, index = null) => {
    if (readOnly) return;

    // Si se pasa un objeto completo (ej: bleeding actualizado) simplemente guardar
    if (typeof value === 'object' && value !== null && index === null && side === null && !Array.isArray(value)) {
      onToothUpdate?.(toothNumber, field, value);
      return;
    }

    const rawTooth = periodontogramData?.teeth?.[toothNumber] || {};

    // Campos de caras múltiples con 4 superficies
    const multiFaceFields = ['bleeding', 'suppuration', 'plaque', 'gingivalMargin', 'probingDepth'];
    const measurementFields = ['gingivalMargin', 'probingDepth'];

    if (index !== null && side !== null && multiFaceFields.includes(field)) {
      const isUpper = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
      let faceKey;
      if (isUpper) {
        faceKey = (side === 'palatine') ? 'palatinoSuperior' : 'vestibularSuperior';
      } else {
        faceKey = (side === 'lingual') ? 'lingualInferior' : 'vestibularInferior';
      }

      const existing = rawTooth[field];
      // Si existe como array simple (legacy) y es un campo de medición, migrar a objeto
      let updated;
      if (existing && Array.isArray(existing) && measurementFields.includes(field)) {
        updated = { [faceKey]: [...existing] };
      } else if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        updated = { ...existing };
      } else {
        updated = {};
      }
      if (!updated[faceKey]) updated[faceKey] = [0,0,0];

      if (['bleeding'].includes(field)) {
        updated[faceKey][index] = Number(value) || 0; // 0-3
      } else if (['suppuration','plaque'].includes(field)) {
        updated[faceKey][index] = value ? 1 : 0; // boolean -> 0/1
      } else {
        updated[faceKey][index] = Number(value) || 0; // mediciones
      }

      onToothUpdate?.(toothNumber, field, updated);

      // Actualizar gráficas en diferido para mediciones
      if (measurementFields.includes(field) && systemStatus.initialized && linearGraphicsDerivedOptions.enableLinearGraphics) {
        const toothDataForGraphics = { ...rawTooth, [field]: updated };
        setTimeout(() => updateToothLinearGraphics(toothNumber, toothDataForGraphics), 0);
      }
      return;
    }

    // Campos con arrays simples (legacy) indexados
    if (index !== null && !multiFaceFields.includes(field)) {
      const existing = rawTooth[field] || [0,0,0];
      const newArray = [...existing];
      newArray[index] = (typeof value === 'number') ? value : (Number(value) || 0);
      onToothUpdate?.(toothNumber, field, newArray);
      return;
    }

    // Escalares simples
    onToothUpdate?.(toothNumber, field, value);
    if (field === 'absent' || field === 'ausente') {
      // Mantener consistencia dual key
      if (field === 'absent') onToothUpdate?.(toothNumber, 'ausente', value);
      if (field === 'ausente') onToothUpdate?.(toothNumber, 'absent', value);
    }
  }, [readOnly, onToothUpdate, periodontogramData, systemStatus.initialized, linearGraphicsDerivedOptions.enableLinearGraphics, updateToothLinearGraphics]);

  // Renderizar celda según tipo
  const toggleToothAbsentHandler = useCallback((toothNumber) => {
    if (readOnly) return;
    const currentData = getToothData(toothNumber);
    const newAbsentValue = !currentData.absent;
    // Usar el actualizador centralizado para sincronizar ambas claves e invalidar cache
    updateToothData(toothNumber, 'absent', newAbsentValue);
  }, [getToothData, updateToothData, readOnly]);

  const renderCell = useCallback((toothNumber, row, side = 'vestibular') => {
    const toothData = getToothData(toothNumber);
    const cellKey = `${toothNumber}-${row.key}-${side}`;
    const getOptionLabel = (fieldKey, option) => {
      if (fieldKey === 'mobility' || fieldKey === 'furca') {
        return option.value;
      }
      return option.label ?? option.value;
    };
    
    switch (row.type) {
      case 'number':
        return (
          <button
            type="button"
            className={`tooth-number-btn ${toothData.absent ? 'absent' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!readOnly) {
                toggleToothAbsentHandler(toothNumber);
              }
            }}
            {...getToothNumberButtonProps(toothNumber, Boolean(toothData.absent))}
            title={`Click para marcar diente ${toothNumber} como ${getToothAvailability(toothData.absent) ? 'ausente' : 'presente'}`}
            style={{ cursor: readOnly ? 'default' : 'pointer', userSelect: 'none', boxShadow: toothData.absent ? '0 0 8px #888' : undefined, transition: 'box-shadow 0.2s' }}
          >
            {toothNumber}
          </button>
        );

      case 'checkbox':
        return (
          <div className="checkbox-cell">
            <input
              type="checkbox"
              checked={toothData[row.key] || false}
              onChange={(e) => updateToothData(toothNumber, row.key, e.target.checked)}
              disabled={readOnly || toothData.absent}
            />
          </div>
        );

      case 'triple-checkbox': {
        // Para bleeding, suppuration y plaque, usar la estructura de caras específicas
        if (['bleeding', 'suppuration', 'plaque'].includes(row.key)) {
          const getFaceKey = (sectionType, toothNumber) => {
            const isUpperTooth = toothNumber >= 11 && toothNumber <= 28;
            if (isUpperTooth) {
              return sectionType === 'palatine' ? 'palatinoSuperior' : 'vestibularSuperior';
            }
            return sectionType === 'lingual' ? 'lingualInferior' : 'vestibularInferior';
          };

          const faceKey = getFaceKey(side, toothNumber);
          const fieldData = toothData[row.key] || {};
          const faceValues = fieldData[faceKey] || [0, 0, 0];

          if (row.key === 'bleeding') {
            return (
              <div className="triple-checkbox">
                {faceValues.map((value, index) => (
                  <BleedingMultiStateCheckbox
                    key={index}
                    value={value}
                    onChange={(newValue) => {
                      const updatedField = { ...fieldData };
                      if (!updatedField[faceKey]) updatedField[faceKey] = [0, 0, 0];
                      updatedField[faceKey][index] = newValue;
                      updateToothData(toothNumber, row.key, updatedField);
                    }}
                    disabled={readOnly || toothData.absent}
                    data-testid={`bleeding-${toothNumber}-${faceKey}-${index}`}
                  />
                ))}
              </div>
            );
          }

          return (
            <div className="triple-checkbox">
              {faceValues.map((value, index) => (
                <input
                  key={index}
                  type="checkbox"
                  checked={Number(value) > 0}
                  onChange={(e) => {
                    const updatedField = { ...fieldData };
                    if (!updatedField[faceKey]) updatedField[faceKey] = [0, 0, 0];
                    updatedField[faceKey][index] = e.target.checked ? 1 : 0;
                    updateToothData(toothNumber, row.key, updatedField);
                  }}
                  disabled={readOnly || toothData.absent}
                  className="mini-checkbox"
                  data-type={row.key}
                  data-testid={`${row.key}-${toothNumber}-${faceKey}-${index}`}
                />
              ))}
            </div>
          );
        }

        const checkboxValues = Array.isArray(toothData[row.key])
          ? toothData[row.key].map(Boolean)
          : [false, false, false];

        return (
          <div className="triple-checkbox">
            {checkboxValues.map((checked, index) => (
              <input
                key={index}
                type="checkbox"
                checked={checked}
                onChange={(e) => updateToothData(toothNumber, row.key, e.target.checked, null, index)}
                disabled={readOnly || toothData.absent}
                className="mini-checkbox"
                data-type={row.key}
              />
            ))}
          </div>
        );
      }

      case 'triple-input':
        // Determinar la cara específica basándose en el side y si es diente superior o inferior
        const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
        let faceKey;
        
        if (isUpperTooth) {
          faceKey = side === 'palatine' ? 'palatinoSuperior' : 'vestibularSuperior';
        } else {
          faceKey = side === 'lingual' ? 'lingualInferior' : 'vestibularInferior';
        }
        
        // Obtener los valores de la cara específica
        const fieldData = toothData[row.key] || {};
        const tripleInputValues = fieldData[faceKey] || [0, 0, 0];
        
        return (
          <div className="triple-input">
            {tripleInputValues.map((value, index) => {
              const tripleInputKey = `${toothNumber}-${row.key}-${side}-${faceKey}-${index}`;
              const isTripleEditing = inputValues[tripleInputKey] !== undefined;
              
              // Asegurar que siempre tenemos un valor válido para mostrar
              let tripleDisplayValue;
              if (isTripleEditing) {
                tripleDisplayValue = inputValues[tripleInputKey];
              } else if (value !== undefined && value !== null) {
                tripleDisplayValue = value.toString();
              } else {
                tripleDisplayValue = '';
              }
              
              return (
                <input
                  key={index}
                  ref={(node) => registerMeasurementInput(tripleInputKey, node)}
                  type="number"
                  inputMode="numeric"
                  min={row.key === 'gingivalMargin' ? VALIDATION_RANGES.GINGIVAL_MARGIN.min : VALIDATION_RANGES.PROBING_DEPTH.min}
                  max={row.key === 'gingivalMargin' ? VALIDATION_RANGES.GINGIVAL_MARGIN.max : VALIDATION_RANGES.PROBING_DEPTH.max}
                  value={tripleDisplayValue}
                  onFocus={(e) => {
                    cancelAutoAdvance(tripleInputKey);
                    const isProgrammatic = programmaticFocusRef.current === tripleInputKey;
                    const numericValue = Number(value);
                    const shouldAutoSelect = isProgrammatic || (!isTripleEditing && (!Number.isFinite(numericValue) || numericValue === 0));

                    if (shouldAutoSelect) {
                      requestAnimationFrame(() => {
                        if (e.target && typeof e.target.select === 'function') {
                          e.target.select();
                        }
                        if (isProgrammatic && programmaticFocusRef.current === tripleInputKey) {
                          programmaticFocusRef.current = null;
                        }
                      });
                    } else if (isProgrammatic && programmaticFocusRef.current === tripleInputKey) {
                      programmaticFocusRef.current = null;
                    }

                    if (['gingivalMargin', 'probingDepth'].includes(row.key) && systemStatus.initialized) {
                      addHoverEffect(toothNumber, index);
                    }
                  }}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    
                    // Marcar como editado manualmente
                    setManuallyEdited(prev => ({
                      ...prev,
                      [tripleInputKey]: true
                    }));
                    // Actualizar el estado local durante la edición
                    setInputValues(prev => ({
                      ...prev,
                      [tripleInputKey]: inputValue
                    }));
                    
                    // Actualizar datos solo si el valor es numérico válido (evitar forzar 0 en estados temporales como '-')
                    if (inputValue === '' || inputValue === '-' || inputValue === '+') {
                      cancelAutoAdvance(tripleInputKey);
                      return;
                    }
                    const numValue = Number(inputValue);
                    if (!Number.isFinite(numValue)) {
                      cancelAutoAdvance(tripleInputKey);
                      return;
                    }
                    updateToothData(toothNumber, row.key, numValue, side, index);
                    const advanceImmediately = shouldAutoAdvanceImmediately(row.key, inputValue);
                    scheduleAutoAdvance(tripleInputKey, {
                      toothNumber,
                      rowKey: row.key,
                      side,
                      faceKey,
                      index
                    }, { delay: advanceImmediately ? 0 : 220 });
                  }}
                  onBlur={(e) => {
                    const inputValue = e.target.value.trim();
                    
                    cancelAutoAdvance(tripleInputKey);

                    if (inputValue === '') {
                      updateToothData(toothNumber, row.key, 0, side, index);
                    } else {
                      const numValue = Number(inputValue);
                      if (Number.isFinite(numValue)) {
                        updateToothData(toothNumber, row.key, numValue, side, index);
                      }
                    }

                    setInputValues(prev => {
                      const newState = { ...prev };
                      delete newState[tripleInputKey];
                      return newState;
                    });
                    setManuallyEdited(prev => {
                      const newState = { ...prev };
                      delete newState[tripleInputKey];
                      return newState;
                    });
                    
                    // EXTENSIÓN: Remover efecto hover para gráficas lineales
                    if (['gingivalMargin', 'probingDepth'].includes(row.key) && systemStatus.initialized) {
                      removeHoverEffect(toothNumber, index);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' && !e.shiftKey && !e.altKey && !e.metaKey) {
                      e.preventDefault();
                      focusSiblingMeasurementInput(toothNumber, row.key, side, faceKey, index, 1);
                      return;
                    }
                    if (e.key === 'ArrowLeft' && !e.shiftKey && !e.altKey && !e.metaKey) {
                      e.preventDefault();
                      focusSiblingMeasurementInput(toothNumber, row.key, side, faceKey, index, -1);
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!focusSiblingMeasurementInput(toothNumber, row.key, side, faceKey, index, 1)) {
                        e.currentTarget.blur();
                      }
                      return;
                    }
                    if (e.key === 'Backspace' && !e.shiftKey && !e.altKey && !e.metaKey) {
                      const { selectionStart, selectionEnd, value: currentValue } = e.currentTarget;
                      const cursorAtStart = selectionStart === 0 && selectionEnd === 0;
                      const isEmpty = !currentValue || currentValue.length === 0;
                      if (cursorAtStart || isEmpty) {
                        if (focusSiblingMeasurementInput(toothNumber, row.key, side, faceKey, index, -1)) {
                          e.preventDefault();
                        }
                      }
                    }
                  }}
                  disabled={readOnly || toothData.absent}
                  className="mini-input"
                />
              );
            })}
          </div>
        );

      case 'select': {
        const options = selectOptionSets[row.key] || [];
        const defaultOptionValue = options[0]?.value ?? '';

        if (row.key === 'furca') {
          const isPalatine = side === 'palatine';
          const isLingual = side === 'lingual';
          const isVestibularSide = !isPalatine && !isLingual;
          const toothNeedsDouble = PeriodontogramUtils.needsDoubleFurca(toothNumber);
          const shouldRenderDouble = toothNeedsDouble && isPalatine;
          const showFurca = PeriodontogramUtils.canHaveFurca(
            toothNumber,
            isVestibularSide,
            isPalatine
          );

          if (!showFurca) {
            return <div className="empty-cell"></div>;
          }

          const normalizedFurca = normalizeFurcaData(toothData[row.key]);

          if (shouldRenderDouble) {
            const furca1Value = normalizedFurca.doble?.furca1 ?? defaultOptionValue;
            const furca2Value = normalizedFurca.doble?.furca2 ?? defaultOptionValue;

            const handleDoubleChange = (key, fallbackValue) => (event) => {
              const newValue = toFurcaNumber(event.target.value, fallbackValue);
              const updatedFurca = {
                ...normalizedFurca,
                doble: {
                  ...normalizedFurca.doble,
                  [key]: newValue
                },
                [key]: newValue
              };
              updatedFurca.furca1 = updatedFurca.doble.furca1;
              updatedFurca.furca2 = updatedFurca.doble.furca2;
              updatedFurca.lingualPalatino = Math.max(updatedFurca.doble.furca1, updatedFurca.doble.furca2);
              updateToothData(toothNumber, row.key, updatedFurca);
            };

            return (
              <div className="select-cell double-furca-cell">
                <select
                  value={furca1Value}
                  onChange={handleDoubleChange('furca1', furca1Value)}
                  disabled={readOnly || toothData.absent}
                  className="mini-select furca-input-double"
                  title="Furca 1"
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getOptionLabel(row.key, option)}
                    </option>
                  ))}
                </select>
                <select
                  value={furca2Value}
                  onChange={handleDoubleChange('furca2', furca2Value)}
                  disabled={readOnly || toothData.absent}
                  className="mini-select furca-input-double"
                  title="Furca 2"
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getOptionLabel(row.key, option)}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          const targetField = (isPalatine || isLingual) ? 'lingualPalatino' : 'vestibular';
          const currentValue = normalizedFurca[targetField] ?? defaultOptionValue;

          return (
            <div className="select-cell furca-single-cell">
              <select
                value={currentValue}
                onChange={(event) => {
                    const newValue = toFurcaNumber(event.target.value, currentValue);
                  const updatedFurca = {
                    ...normalizedFurca,
                    doble: { ...normalizedFurca.doble },
                    [targetField]: newValue
                  };

                  if (!toothNeedsDouble) {
                    updatedFurca.doble.furca1 = newValue;
                    updatedFurca.doble.furca2 = newValue;
                    updatedFurca.furca1 = newValue;
                    updatedFurca.furca2 = newValue;
                    updatedFurca.lingualPalatino = newValue;
                  } else if (targetField === 'lingualPalatino') {
                    updatedFurca.lingualPalatino = Math.max(
                      newValue,
                      updatedFurca.doble.furca1,
                      updatedFurca.doble.furca2
                    );
                  }

                  updateToothData(toothNumber, row.key, updatedFurca);
                }}
                disabled={readOnly || toothData.absent}
                className="mini-select furca-input-single"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {getOptionLabel(row.key, option)}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        const currentValue = toothData[row.key] ?? defaultOptionValue;

        return (
          <div className="select-cell">
            <select
              value={currentValue}
              onChange={(e) => updateToothData(toothNumber, row.key, e.target.value)}
              disabled={readOnly || toothData.absent}
              className="mini-select"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {getOptionLabel(row.key, option)}
                </option>
              ))}
            </select>
          </div>
        );
      }

      case 'tooth-number-btn':
        const buttonClasses = `tooth-number-btn ${
          toothData.absent ? 'absent' : ''
        } ${
          selectedTooth === toothNumber ? 'selected' : ''
        }`;
        
        return (
          <div className="tooth-number-cell">
            <button
              className={buttonClasses}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!readOnly) {
                  toggleToothAbsentHandler(toothNumber);
                }
              }}
              disabled={readOnly}
              title={`Diente ${toothNumber} - Click para marcar como ${getToothAvailability(toothData.absent) ? 'ausente' : 'presente'}`}
            >
              {toothNumber}
            </button>
          </div>
        );

      case 'mini-input':
          const isDisabled = readOnly || toothData.absent;
          const validationRange = row.key === 'gumWidth' ? VALIDATION_RANGES.GUM_WIDTH : VALIDATION_RANGES.PROBING_DEPTH;
        
        // Lógica especial para gumWidth: aceptar valores del 0-3
        if (row.key === 'gumWidth') {
          const currentValue = toothData[row.key];
          const inputKey = `${toothNumber}-${row.key}`;
          const isEditing = inputValues[inputKey] !== undefined;
          
          // FIXME: Asegurar que siempre tenemos un valor válido para mostrar
          let displayValue;
          if (isEditing) {
            displayValue = inputValues[inputKey];
          } else if (currentValue !== undefined && currentValue !== null) {
            displayValue = currentValue.toString();
          } else {
            displayValue = '0';
          }
          
          // Determinar si debe ser rojo basándose en el valor que se está mostrando
          const valueToCheck = isEditing ? parseInt(inputValues[inputKey]) : currentValue;
          const isRedValue = valueToCheck !== undefined && !isNaN(valueToCheck) && valueToCheck >= 0 && valueToCheck <= 2;
          
          return (
            <div className="mini-input-cell">
              <input
                ref={(node) => registerMeasurementInput(inputKey, node)}
                type="text"
                inputMode="numeric"
                value={displayValue}
                onFocus={(e) => {
                  const isProgrammatic = programmaticFocusRef.current === inputKey;
                  const shouldAutoSelect = isProgrammatic || (!isEditing && (Number(currentValue) === 0 || currentValue === '0'));

                  if (shouldAutoSelect) {
                    requestAnimationFrame(() => {
                      if (e.target && typeof e.target.select === 'function') {
                        e.target.select();
                      }
                      if (isProgrammatic && programmaticFocusRef.current === inputKey) {
                        programmaticFocusRef.current = null;
                      }
                    });
                  } else if (isProgrammatic && programmaticFocusRef.current === inputKey) {
                    programmaticFocusRef.current = null;
                  }
                }}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  // Marcar como editado manualmente
                  setManuallyEdited(prev => ({
                    ...prev,
                    [inputKey]: true
                  }));
                  // Actualizar el estado local durante la edición
                  setInputValues(prev => ({
                    ...prev,
                    [inputKey]: inputValue
                  }));
                  
                  // Actualizar datos solo si el valor es numérico válido (no forzar 0)
                  if (inputValue === '') {
                    return;
                  }
                  const numValue = parseInt(inputValue);
                  if (!isNaN(numValue) && numValue >= 0 && numValue <= 10) {
                    updateToothData(toothNumber, row.key, numValue);
                  }
                }}
                onBlur={(e) => {
                  const inputValue = e.target.value.trim();
                  
                  // Validar y actualizar al perder el foco
                  if (inputValue === '') {
                    updateToothData(toothNumber, row.key, 0);
                  } else {
                    const numValue = parseInt(inputValue);
                    if (!isNaN(numValue) && numValue >= 0 && numValue <= 10) {
                      updateToothData(toothNumber, row.key, numValue);
                    }
                  }
                  // Limpiar estados locales tras confirmar el valor
                  setInputValues(prev => {
                    const newState = { ...prev };
                    delete newState[inputKey];
                    return newState;
                  });
                  setManuallyEdited(prev => {
                    const newState = { ...prev };
                    delete newState[inputKey];
                    return newState;
                  });
                }}
                onKeyDown={(e) => {
                  const digitKeys = ['0','1','2','3','4','5','6','7','8','9'];
                  const utilityKeys = ['Backspace','Delete','Tab','Enter','ArrowLeft','ArrowRight'];
                  const hasSelection = e.target.selectionStart !== e.target.selectionEnd;

                  if (digitKeys.includes(e.key)) {
                    // Permitir sobrescribir cuando todo el texto está seleccionado
                    if (e.target.value.length >= 2 && !hasSelection) {
                      e.preventDefault();
                    }
                    return;
                  }

                  if (!utilityKeys.includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                disabled={isDisabled}
                className={`mini-input ${isRedValue ? 'gum-width-red' : ''}`}
                title="La anchura de la encía debe ser un número del 0-10mm. Si no pone nada, por defecto se pone en 0"
                maxLength="2"
              />
            </div>
          );
        }
        
        // Para otros campos mini-input, usar la misma lógica de estado local
        const currentValue = toothData[row.key];
        const inputKey = `${toothNumber}-${row.key}`;
        const isEditing = inputValues[inputKey] !== undefined;
        
        // Asegurar que siempre tenemos un valor válido para mostrar
        let displayValue;
        if (isEditing) {
          displayValue = inputValues[inputKey];
        } else if (currentValue !== undefined && currentValue !== null) {
          displayValue = currentValue.toString();
        } else {
          displayValue = '0';
        }
        
        return (
          <div className="mini-input-cell">
            <input
              ref={(node) => registerMeasurementInput(inputKey, node)}
              type="number"
              min={validationRange.min}
              max={validationRange.max}
              value={displayValue}
              onMouseDown={(e) => {
                // Prevenir el comportamiento por defecto para controlar el foco manualmente
                e.preventDefault();
                
                // Enfocar el input inmediatamente
                e.target.focus();
                
                // Seleccionar después del render
                requestAnimationFrame(() => {
                  if (e.target && typeof e.target.select === 'function') {
                    e.target.select();
                  }
                });
              }}
              onFocus={(e) => {
                const isProgrammatic = programmaticFocusRef.current === inputKey;
                if (isProgrammatic) {
                  programmaticFocusRef.current = null;
                  // Seleccionar cuando es programático
                  requestAnimationFrame(() => {
                    if (e.target && typeof e.target.select === 'function') {
                      e.target.select();
                    }
                  });
                }
              }}
              onChange={(e) => {
                const inputValue = e.target.value;
                // Marcar como editado manualmente
                setManuallyEdited(prev => ({
                  ...prev,
                  [inputKey]: true
                }));
                // Actualizar el estado local durante la edición
                setInputValues(prev => ({
                  ...prev,
                  [inputKey]: inputValue
                }));
                
                // Actualizar datos solo si el valor es numérico válido
                if (inputValue === '' || inputValue === '-' || inputValue === '+') {
                  return;
                }
                const numValue = Number(inputValue);
                if (!Number.isFinite(numValue)) {
                  return;
                }
                updateToothData(toothNumber, row.key, numValue);
              }}
              onBlur={(e) => {
                const inputValue = e.target.value.trim();
                
                if (inputValue === '') {
                  updateToothData(toothNumber, row.key, 0);
                } else {
                  const numValue = Number(inputValue);
                  if (Number.isFinite(numValue)) {
                    updateToothData(toothNumber, row.key, numValue);
                  }
                }

                setInputValues(prev => {
                  const newState = { ...prev };
                  delete newState[inputKey];
                  return newState;
                });
                setManuallyEdited(prev => {
                  const newState = { ...prev };
                  delete newState[inputKey];
                  return newState;
                });
              }}
              disabled={isDisabled}
              className="mini-input"
            />
          </div>
        );

      case 'text':
        const currentTextValue = toothData[row.key];
        const textInputKey = `${toothNumber}-${row.key}`;
        const isTextEditing = inputValues[textInputKey] !== undefined;
        const textDisplayValue = isTextEditing ? inputValues[textInputKey] : (currentTextValue || '');
        
        return (
          <div className="text-cell">
            <input
              type="text"
              value={textDisplayValue}
              onFocus={(e) => {
                // Asegurar que tenemos el valor correcto en el estado local antes de seleccionar
                const currentVal = toothData[row.key] || '';
                
                // Establecer el valor en el estado local si no existe
                if (inputValues[textInputKey] === undefined) {
                  setInputValues(prev => ({
                    ...prev,
                    [textInputKey]: currentVal
                  }));
                }
                
                // Seleccionar todo el texto después de un pequeño delay para asegurar que el valor está establecido
                setTimeout(() => {
                  e.target.select();
                }, 0);
              }}
              onChange={(e) => {
                const inputValue = e.target.value;
                // Marcar como editado manualmente
                setManuallyEdited(prev => ({
                  ...prev,
                  [textInputKey]: true
                }));
                // Actualizar el estado local durante la edición
                setInputValues(prev => ({
                  ...prev,
                  [textInputKey]: inputValue
                }));
                
                // Actualizar inmediatamente los datos del diente
                updateToothData(toothNumber, row.key, inputValue);
              }}
              onBlur={(e) => {
                // No limpiar el estado local inmediatamente para mantener persistencia
                // El estado se limpiará solo cuando sea necesario
              }}
              disabled={readOnly || toothData.absent}
              className="mini-text"
              placeholder="..."
            />
          </div>
        );

      default:
        return <div className="empty-cell"></div>;
    }
  }, [getToothData, updateToothData, toggleToothAbsentHandler, readOnly, inputValues, manuallyEdited, systemStatus, linearGraphicsDerivedOptions, updateToothLinearGraphics, addHoverEffect, removeHoverEffect, selectedTooth, onToothSelect, selectOptionSets, registerMeasurementInput, cancelAutoAdvance, scheduleAutoAdvance, focusSiblingMeasurementInput, setPendingFocusRequest, programmaticFocusRef, pendingFocusKeysRef, shouldAutoAdvanceImmediately]);

  // Renderizar imagen de diente
  const renderToothImage = useCallback((toothNumber, side) => {
    const toothData = getToothData(toothNumber);
    const section = toothNumber >= 30 ? 'down' : 'up';
    const position = PeriodontogramUtils.getToothPosition(toothNumber);
    
    // CORRECCIÓN: Lógica correcta para vistas superiores e inferiores
    let isLingual = false;
    
    if (section === 'up') {
      // Para dientes superiores: palatino usa 'b', vestibular no
      isLingual = side === 'palatine';
    } else {
      // Para dientes inferiores: intercambiar lingual y vestibular
      // lingual -> vestibular (sin 'b'), vestibular -> lingual (con 'b')
      isLingual = side === 'vestibular';
    }
    
    const sidePrefix = isLingual ? 'b' : '';
    
    // Determinar tipo de imagen basado en el estado del diente
    let imageType = 'tooth';
    if (toothData.absent) {
      imageType = 'cross';
    } else if (toothData.implant) {
      imageType = 'implant';
    }
    
    const imagePath = `/images/Periodontogram/${imageType}/${section}${position}${sidePrefix}.png`;
    
    // CORRECCIÓN: Lógica correcta para backgrounds
    let backgroundSection = 'up'; // Default
    
    if (section === 'up') {
      // Para dientes superiores:
      // - Palatino usa background-down
      // - Vestibular usa background-up
      backgroundSection = side === 'palatine' ? 'down' : 'up';
    } else {
      // Para dientes inferiores:
      // - Lingual usa background-up
      // - Vestibular usa background-down
      backgroundSection = side === 'lingual' ? 'up' : 'down';
    }
    
    const backgroundPath = `/images/Periodontogram/background/background-${backgroundSection}.png`;
    
    return (
      <div className={`tooth-image-container ${toothData.absent ? 'absent' : ''}`} data-tooth={toothNumber} data-absent={toothData.absent ? 'true' : 'false'} style={{ position: 'relative' }}>
        <div className="tooth-background">
          <img src={backgroundPath} alt="background" className="background-image" />
        </div>
        <div className="tooth-foreground">
          {/* Imagen principal (diente, implante o cruz) */}
          <img 
            src={imagePath} 
            alt={`Tooth ${toothNumber} ${side}`} 
            className={`tooth-image ${toothData.implant ? 'tooth-implant-overlay' : ''}`}
            style={{
              position: 'relative',
              zIndex: 2
            }}
            onClick={() => onToothSelect?.(toothNumber)}
          />
        </div>
        {toothData.absent && (
          <div className="absence-overlay"></div>
        )}
        {linearGraphicsDerivedOptions.enableLinearGraphics && (
          <canvas 
            data-tooth={toothNumber}
            className="linear-graphics-canvas"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: LINEAR_GRAPHICS_CONFIG.CANVAS.Z_INDEX || 10
            }}
            width={LINEAR_GRAPHICS_CONFIG.DIMENSIONS.TOOTH_CANVAS_WIDTH}
            height={LINEAR_GRAPHICS_CONFIG.DIMENSIONS.TOOTH_CANVAS_HEIGHT}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }, [getToothData, onToothSelect, linearGraphicsDerivedOptions.enableLinearGraphics]);

  // TEMPORAL: Verificar si available llega como false
  // Activar/desactivar monitor según flag
  useEffect(() => { perfMonitor.enable(debugPerformance); }, [debugPerformance]);
  if (debugPerformance) { perfMonitor.countRender('PeriodontogramDesign'); }

  // Sub-componente memoizado para cada celda de datos (reduce trabajo en renders globales)
  // FIXME: Removemos useMemo porque estaba bloqueando los re-renders necesarios para inputValues/manuallyEdited
  const DataCell = memo(({ toothNumber, row, side, iv, me }) => {
    const toothData = getToothData(toothNumber);
    return (
      <div className={`data-cell-container ${toothData.absent ? 'absent' : ''}`}> 
        <div className="data-cell">{renderCell(toothNumber, row, side)}</div>
      </div>
    );
  });

  // Envolver DataCell con contador de renders si debug
  const InstrumentedDataCell = debugPerformance ? withRenderCount(DataCell, 'DataCell') : DataCell;

  return (
    <div 
      ref={containerRef} 
      className={`periodontogram-container ${systemStatus.initialized ? 'linear-graphics-active' : ''} perf-${performanceMode}`}
      data-read-only={readOnly}
    >

      {/* SECCIÓN SUPERIOR */}
      <div className="arch-section superior">
        <h2 className="arch-title">SUPERIOR</h2>
        
        {/* Header eliminado - números ahora solo en fila de dientes */}
        
        {/* 12 Filas Vestibular */}
        <div className="data-section vestibular-rows">
          {vestibularRows.map((row, rowIndex) => (
            <div key={`upper-vest-${row.key}`} className="data-row">
              <div className="row-label">{row.label}</div>
              {upperTeeth.map(toothNumber => (
                <InstrumentedDataCell key={`${toothNumber}-${row.key}`} toothNumber={toothNumber} row={row} side="vestibular" iv={inputValues} me={manuallyEdited} />
              ))}
            </div>
          ))}
        </div>

        {/* Imágenes Vestibular */}
        <div className="images-section vestibular-images vestibular-superior">
          <div className="images-row">
            <div className="row-label">Vestibular</div>
            {upperTeeth.map(toothNumber => (
              <div key={`${toothNumber}-vest-img`} className="image-cell">
                {renderToothImage(toothNumber, 'vestibular')}
              </div>
            ))}
          </div>
        </div>

        {/* Imágenes Palatino */}
        <div className="images-section palatine-images">
          <div className="images-row">
            <div className="row-label">Palatino</div>
            {upperTeeth.map(toothNumber => (
              <div key={`${toothNumber}-pal-img`} className="image-cell">
                {renderToothImage(toothNumber, 'palatine')}
              </div>
            ))}
          </div>
        </div>

        {/* 6 Filas Palatino */}
        <div className="data-section palatine-rows">
          {palatineRows.map((row, rowIndex) => (
            <div key={`upper-pal-${row.key}`} className="data-row">
              <div className="row-label">{row.label}</div>
              {upperTeeth.map(toothNumber => (
                <InstrumentedDataCell key={`${toothNumber}-${row.key}-pal`} toothNumber={toothNumber} row={row} side="palatine" iv={inputValues} me={manuallyEdited} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* SECCIÓN INFERIOR */}
      <div className="arch-section inferior">
        <h2 className="arch-title">INFERIOR</h2>
        
        {/* Header eliminado - números ahora solo en fila de dientes */}
        
        {/* 6 Filas Lingual */}
        <div className="data-section lingual-rows">
              {lingualRows.map((row, rowIndex) => (
            <div key={`lower-ling-${row.key}`} className="data-row">
              <div className="row-label">{row.label}</div>
                  {lowerTeeth.map(toothNumber => (
                    <InstrumentedDataCell key={`${toothNumber}-${row.key}-ling`} toothNumber={toothNumber} row={row} side="lingual" iv={inputValues} me={manuallyEdited} />
                  ))}
            </div>
          ))}
        </div>

        {/* Imágenes Lingual */}
        <div className="images-section lingual-images">
          <div className="images-row">
            <div className="row-label">Lingual</div>
            {lowerTeeth.map(toothNumber => (
              <div key={`${toothNumber}-ling-img`} className="image-cell">
                {renderToothImage(toothNumber, 'lingual')}
              </div>
            ))}
          </div>
        </div>

        {/* Imágenes Vestibular */}
        <div className="images-section vestibular-images vestibular-inferior">
          <div className="images-row">
            <div className="row-label">Vestibular</div>
            {lowerTeeth.map(toothNumber => (
              <div key={`${toothNumber}-vest-img-lower`} className="image-cell">
                {renderToothImage(toothNumber, 'vestibular')}
              </div>
            ))}
          </div>
        </div>

        {/* 12 Filas Vestibular (orden invertido para arco inferior) */}
        <div className="data-section vestibular-rows">
              {vestibularLowerRows.map((row, rowIndex) => (
            <div key={`lower-vest-${row.key}`} className="data-row">
              <div className="row-label">{row.label}</div>
                  {lowerTeeth.map(toothNumber => (
                    <InstrumentedDataCell key={`${toothNumber}-${row.key}-lower`} toothNumber={toothNumber} row={row} side="vestibular" iv={inputValues} me={manuallyEdited} />
                  ))}
            </div>
          ))}
        </div>
      </div>


      
      {/* Canvas overlay se renderiza específicamente en cada tooth-image-container */}
    </div>
  );
};

PeriodontogramDesign.displayName = 'PeriodontogramDesign';

export default memo(PeriodontogramDesign);