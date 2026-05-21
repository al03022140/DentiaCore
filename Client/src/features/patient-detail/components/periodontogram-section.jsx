import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { ADVANCED_LOGGING_CONFIG } from '../../periodontogram/utils/config.js';
import PeriodontogramDesign from '../../periodontogram/periodontogram-design';
import StatisticsPanel from '../../periodontogram/statistics-panel';
import { validatePeriodontogramData } from '../../../shared/schemas/unified-periodontogram-schema.js';
import { normalizeBackendPeriodontogram } from '../../../shared/utils/periodontogram-normalizer.js';
import { UniversalToothValidator } from '../../../shared/validators/universal-tooth-validator.js';
import { MEASUREMENT_LIMITS } from '../../../shared/config/periodontogram-config';
import PeriodontogramService from '../../../shared/services/periodontogram-service.js';
import { toTriple, pickFaceTriplesFromFourFaces } from '../../../shared/utils/periodontogram-helpers.js';
import { useUnsavedChanges } from '../../../shared/contexts/UnsavedChangesContext.jsx';
import { useDraftPersistence } from '../../../shared/hooks/useDraftPersistence.js';
import '../styles/periodontogram-section.css';

const FIELD_ALIAS_MAP = {
  bleeding: 'sangrado',
  sangrado: 'bleeding',
  suppuration: 'supuracion',
  supuracion: 'suppuration',
  plaque: 'placa',
  placa: 'plaque',
  gingivalMargin: 'margenGingival',
  margenGingival: 'gingivalMargin',
  probingDepth: 'profundidadSondaje',
  profundidadSondaje: 'probingDepth',
  absent: 'ausente',
  ausente: 'absent',
  implant: 'implante',
  implante: 'implant',
  mobility: 'movilidad',
  movilidad: 'mobility',
  gumWidth: 'anchuraEncia',
  anchuraEncia: 'gumWidth',
  prognosis: 'pronostico',
  pronostico: 'prognosis'
};

const applyFieldAlias = (toothData, field) => {
  if (!toothData) return;
  const alias = FIELD_ALIAS_MAP[field];
  if (!alias) return;
  toothData[alias] = toothData[field];
};

const PeriodontogramSection = ({ patientId }) => {
  if (ADVANCED_LOGGING_CONFIG.enabled) console.log('🚀 PeriodontogramSection montado con patientId:', patientId);
  
  // Estados principales
  const [periodontogramData, setPeriodontogramData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null); // 'network', 'validation', 'server', 'unknown'
  const [periodontogramExists, setPeriodontogramExists] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para el sistema de versiones JSON
  const [editMode, setEditMode] = useState('guardado');
  const [versionList, setVersionList] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [previousData, setPreviousData] = useState(null); // Para rollback
  const [selectedTooth, setSelectedTooth] = useState(null);

  // Tracking de cambios sin guardar para advertir al usuario antes de
  // navegar/cambiar versión y para el listener beforeunload.
  const isDirtyRef = useRef(false);
  // Context global de cambios sin guardar: bloquea navegación SPA al
  // cambiar de paciente si quedan cambios pendientes.
  const { markDirty: ctxMarkDirty, markClean: ctxMarkClean } = useUnsavedChanges();
  const dirtyKey = `periodontogram-${patientId || 'no-patient'}`;
  useEffect(() => () => ctxMarkClean(dirtyKey), [ctxMarkClean, dirtyKey]);

  // Snapshot completo del state del periodontograma para persistencia local.
  // Si la sesión se corta antes de guardar, recuperamos el snapshot al volver.
  const periodontogramRef = useRef(null);
  useEffect(() => { periodontogramRef.current = periodontogramData; }, [periodontogramData]);
  const draft = useDraftPersistence({
    key: `periodontogram-${patientId || 'no-patient'}`,
    enabled: !!patientId && editMode === 'guardado',
    isDirty: () => isDirtyRef.current,
    getSnapshot: () => periodontogramRef.current,
  });
  const draftPromptedRef = useRef(false);
  useEffect(() => { draftPromptedRef.current = false; }, [patientId]);
  // Dedupe de warnings de validación: evita spam si el usuario tipea fuera de rango.
  const lastValidationWarnRef = useRef({ key: null, time: 0 });

  const createEmptyPeriodontogram = useCallback(() => ({
    teeth: {},
    statistics: typeof UniversalToothValidator.getDefaultStatistics === 'function'
      ? UniversalToothValidator.getDefaultStatistics()
      : {
          totalTeeth: 32,
          presentTeeth: 32,
          absentTeeth: 0,
          implants: 0,
          averageProbingDepth: 0,
          bleedingPercentage: 0,
          plaquePercentage: 0
        },
    versionName: null,
    metadata: {
      version: null,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }
  }), []);

  // Normalizador de backend -> frontend vinculado a patientId
  const convertBackendDataToFrontend = useCallback(
    (backendData = {}) => normalizeBackendPeriodontogram(backendData, { patientId, computeStatistics: true }),
    [patientId]
  );

  // Helper: parse different versionName formats to a sortable timestamp (ms)
  const parseVersionNameToTime = useCallback((name) => {
    if (!name || typeof name !== 'string') return NaN;
    try {
      // Special case: Archivado_YYYY-MM-DD or Archivado_YYYY-MM-DD_HH-mm-ss
      const mArchived = name.match(/^Archivado_(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?$/);
      if (mArchived) {
        const [, yyyyA, mma, dda, HHa, MMa, SSa] = mArchived;
        const year = Number(yyyyA);
        const month = Number(mma) - 1;
        const day = Number(dda);
        const hour = Number(HHa ?? '00');
        const minute = Number(MMa ?? '00');
        const second = Number(SSa ?? '00');
        if (year >= 1970 && year <= 2100) {
          return new Date(year, month, day, hour, minute, second).getTime();
        }
      }
      // Case 1: DD-MM-YYYY_HH-mm-ss
      const m1 = name.match(/^(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})$/);
      if (m1) {
        const [, dd, mm, yyyy, HH, MM, SS] = m1;
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS)).getTime();
      }
      // Case 2: Embedded ISO-compact within string, e.g., v001_20250912T235822663Z or 20250912T235822
      const m2 = name.match(/(\d{4})(\d{2})(\d{2})[T_\-]?(\d{2})(\d{2})(\d{2})/);
      if (m2) {
        const [, yyyy, MM, dd, HH, mm, SS] = m2;
        const year = Number(yyyy);
        if (year >= 1970 && year <= 2100) {
          return new Date(year, Number(MM) - 1, Number(dd), Number(HH), Number(mm), Number(SS)).getTime();
        }
      }
      // Fallback: try Date parse
      const t = Date.parse(name);
      return isNaN(t) ? NaN : t;
    } catch {
      return NaN;
    }
  }, []);

  const sortVersionsDesc = useCallback((versions = []) => {
    try {
      const withKey = versions.map((v) => ({ v, t: parseVersionNameToTime(v) }));
      withKey.sort((a, b) => {
        const aOk = Number.isFinite(a.t);
        const bOk = Number.isFinite(b.t);
        if (aOk && bOk) return b.t - a.t; // newer first
        if (aOk && !bOk) return -1; // known time before unknown
        if (!aOk && bOk) return 1;
        // both unknown -> lexical desc
        return String(b.v).localeCompare(String(a.v));
      });
      return withKey.map(x => x.v);
    } catch {
      return Array.isArray(versions) ? versions.slice().sort((a, b) => String(b).localeCompare(String(a))) : [];
    }
  }, [parseVersionNameToTime]);

  // Helper: format version option label as dd/mm/yyyy HH:MM:SS if parsable; else show raw
  const formatVersionLabel = useCallback((name) => {
    const t = parseVersionNameToTime(name);
    if (!Number.isFinite(t)) return String(name);
    const d = new Date(t);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    const SS = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
  }, [parseVersionNameToTime]);

  

  /* -------------------- VALIDACIÓN DE RANGOS -------------------- */
  const validateMeasurementValue = useCallback((field, value) => {
    const limits = MEASUREMENT_LIMITS[field];
    if (!limits) return { valid: true, value };

    if (value === null || value === undefined || value === '') {
      return { valid: true, value: limits.default };
    }

    const numValue = parseFloat(value);
    if (!Number.isFinite(numValue)) {
      return { valid: false, value: limits.default, error: 'Valor debe ser numérico' };
    }

    if (numValue < limits.min) {
      return { valid: false, value: limits.min, error: `Valor mínimo: ${limits.min}${limits.unit || ''}` };
    }

    if (numValue > limits.max) {
      return { valid: false, value: limits.max, error: `Valor máximo: ${limits.max}${limits.unit || ''}` };
    }

    return { valid: true, value: numValue };
  }, []);

  /* -------------------- MANEJO DE ERRORES MEJORADO -------------------- */
  const handleError = useCallback((error, context = '') => {
    console.error(`Error en ${context}:`, error);
    
    let errorType = 'unknown';
    let errorMessage = 'Error desconocido';
    
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('fetch')) {
      errorType = 'network';
      errorMessage = 'Error de conexión. Verifique su conexión a internet.';
    } else if (error.status === 400 || error.message?.includes('validación')) {
      errorType = 'validation';
      errorMessage = 'Error de validación: ' + (error.message || 'Datos inválidos');
    } else if (error.status >= 500) {
      errorType = 'server';
      errorMessage = 'Error del servidor. Intente nuevamente en unos momentos.';
    } else if (error.status === 404) {
      errorType = 'validation';
      errorMessage = 'Recurso no encontrado.';
    } else {
      errorMessage = error.message || 'Error inesperado';
    }
    
    setError(errorMessage);
     setErrorType(errorType);
   }, []);

   /* -------------------- ROLLBACK DE DATOS -------------------- */
   const saveStateForRollback = useCallback(() => {
     // structuredClone preserva Dates, undefined, NaN — a diferencia de
     // JSON.parse(JSON.stringify(...)) que las pierde silenciosamente.
     const snapshot = periodontogramData
       ? structuredClone(periodontogramData)
       : null;
     setPreviousData({
       periodontogramData: snapshot,
       selectedVersion,
       editMode
     });
   }, [periodontogramData, selectedVersion, editMode]);

   const rollbackData = useCallback(() => {
     if (previousData) {
       setPeriodontogramData(previousData.periodontogramData);
       setSelectedVersion(previousData.selectedVersion);
       setEditMode(previousData.editMode);
       setPreviousData(null);
       if (ADVANCED_LOGGING_CONFIG.enabled) console.log('Datos restaurados al estado anterior');
     }
   }, [previousData]);

  // (definido arriba para evitar TDZ)

  /* -------------------------- CARGA INICIAL -------------------------- */
  const loadPeriodontogram = useCallback(async (signal) => {
    if (!patientId) {
      setPeriodontogramData(createEmptyPeriodontogram());
      setPeriodontogramExists(false);
      setVersionList([]);
      setSelectedVersion(null);
      return;
    }

    const isAborted = () => signal?.aborted === true;

    setIsLoading(true);
    setError(null);
    setErrorType(null);

    try {
      const versionsResponse = await PeriodontogramService.getDataVersions(patientId, { signal }).catch((err) => {
        if (err?.status === 404) {
          return [];
        }
        throw err;
      });
      if (isAborted()) return;

      const orderedVersions = sortVersionsDesc(versionsResponse || []);
      const exists = orderedVersions.length > 0;

      setPeriodontogramExists(exists);
      setVersionList(orderedVersions);
      setPreviousData(null);

      if (exists && orderedVersions.length > 0) {
        try {
          const latestVersion = orderedVersions[0];
          const backendData = await PeriodontogramService.getData(patientId, latestVersion, { signal });
          if (isAborted()) return;
          const normalizedData = convertBackendDataToFrontend(backendData);
          setPeriodontogramData(normalizedData);
          setSelectedVersion(latestVersion);
        } catch (loadErr) {
          if (isAborted() || loadErr?.code === 'ERR_CANCELED' || loadErr?.name === 'CanceledError') return;
          console.warn('No se pudo cargar la última versión, iniciando vacío:', loadErr);
          setPeriodontogramData(createEmptyPeriodontogram());
          setSelectedVersion(null);
        }
      } else {
        setPeriodontogramData(createEmptyPeriodontogram());
        setSelectedVersion(null);
      }

      if (typeof UniversalToothValidator.invalidateCache === 'function') {
        UniversalToothValidator.invalidateCache();
      }
    } catch (err) {
      if (isAborted() || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      handleError(err, 'carga inicial');
      setPeriodontogramData(createEmptyPeriodontogram());
      setPeriodontogramExists(false);
      setVersionList([]);
      setSelectedVersion(null);
    } finally {
      if (!isAborted()) {
        setIsLoading(false);
      }
    }
  }, [patientId, sortVersionsDesc, createEmptyPeriodontogram, handleError, convertBackendDataToFrontend]);

  // Cargamos el periodontograma SOLO al cambiar de paciente. AbortController
  // aborta el fetch en curso si el usuario cambia de paciente antes de que
  // termine — evita que la respuesta del paciente A pise los datos del B.
  // eslint-disable-next-line react-hooks/exhaustive-deps porque las funciones
  // internas no necesitan recargar — sólo el patientId define qué cargar.
  useEffect(() => {
    const controller = new AbortController();
    loadPeriodontogram(controller.signal);
    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  /* ---------------------- ACTUALIZAR DIENTE ---------------------- */
  // Warning con dedupe: si el usuario tipea fuera de rango varias veces
  // seguidas en el mismo campo, no spameamos message.warning.
  const warnValidation = useCallback((toothNumber, field, errorText) => {
    const key = `${toothNumber}:${field}`;
    const now = Date.now();
    const last = lastValidationWarnRef.current;
    if (last.key === key && now - last.time < 1500) return;
    lastValidationWarnRef.current = { key, time: now };
    message.warning({
      content: `Diente ${toothNumber} · ${field}: ${errorText}. Valor ajustado.`,
      key: `validation-${key}`,
      duration: 2.5
    });
  }, []);

  const handleToothUpdate = useCallback((toothNumber, field, value, side = null, index = null) => {
    if (editMode !== 'guardado') return;

    // Validar rangos para campos de medición
    let validatedValue = value;
    if (['profundidadSondaje', 'margenGingival', 'mobility'].includes(field)) {
      const validatorField = field === 'profundidadSondaje' ? 'probingDepth' :
                             field === 'margenGingival' ? 'gingivalMargin' : field;
      const validation = validateMeasurementValue(validatorField, value);
      if (!validation.valid) {
        warnValidation(toothNumber, field, validation.error);
      }
      validatedValue = validation.value;
    }

    // Validación específica para anchuraEncia como valor único
    if (field === 'anchuraEncia') {
      const validation = validateMeasurementValue('gumWidth', value);
      if (!validation.valid) {
        warnValidation(toothNumber, field, validation.error);
      }
      validatedValue = validation.value;
    }
    
    setPeriodontogramData(prev => {
      if (!prev) return prev;

      // Actualización inmutable POR DIENTE: sólo el diente editado obtiene una
      // nueva referencia. Permite que React.memo de DataCell salte los dientes
      // que no cambiaron, en vez de re-renderizar las ~384 celdas con cada
      // tecleo (lo que hacía el structuredClone previo).
      const prevTeeth = prev.teeth || {};
      const prevTooth = prevTeeth[toothNumber] || {
        available: true,
        ausente: false,
        absent: false,
        implante: false,
        implant: false,
        pronostico: 'bueno',
        prognosis: 'bueno',
        mobility: MEASUREMENT_LIMITS.mobility.default,
        movilidad: MEASUREMENT_LIMITS.mobility.default,
        anchuraEncia: 0,
        gumWidth: 0,
        furca: { vestibular: 0, lingual: 0, mesial: 0 }
      };

      let updatedTooth;

      if (side && index !== null) {
        const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
        const targetFace = side === 'vestibular'
          ? (isUpperTooth ? 'vestibularSuperior' : 'vestibularInferior')
          : (isUpperTooth ? 'palatinoSuperior' : 'lingualInferior');
        const prevField = (prevTooth[field] && typeof prevTooth[field] === 'object' && !Array.isArray(prevTooth[field]))
          ? prevTooth[field]
          : {};
        const prevFaceArr = Array.isArray(prevField[targetFace]) ? prevField[targetFace] : [0, 0, 0];
        const nextFaceArr = [...prevFaceArr];
        nextFaceArr[index] = validatedValue;
        updatedTooth = { ...prevTooth, [field]: { ...prevField, [targetFace]: nextFaceArr } };
      } else if (side) {
        const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
        const targetFace = side === 'vestibular'
          ? (isUpperTooth ? 'vestibularSuperior' : 'vestibularInferior')
          : (isUpperTooth ? 'palatinoSuperior' : 'lingualInferior');
        const prevField = (prevTooth[field] && typeof prevTooth[field] === 'object' && !Array.isArray(prevTooth[field]))
          ? prevTooth[field]
          : {};
        updatedTooth = { ...prevTooth, [field]: { ...prevField, [targetFace]: validatedValue } };
      } else {
        updatedTooth = { ...prevTooth, [field]: validatedValue };
      }

      applyFieldAlias(updatedTooth, field);

      return {
        ...prev,
        teeth: { ...prevTeeth, [toothNumber]: updatedTooth },
        lastModified: Date.now()
      };
    });
    isDirtyRef.current = true; ctxMarkDirty(dirtyKey);
  }, [editMode, validateMeasurementValue, warnValidation]);

  // Limpiar periodontograma (dejar en blanco)
  const handleClear = useCallback(() => {
    if (editMode !== 'guardado') return;

    if (isDirtyRef.current) {
      const confirmed = window.confirm(
        'Hay cambios sin guardar en el periodontograma. ¿Seguro que deseas limpiar?'
      );
      if (!confirmed) return;
    }

    try {
      if (typeof UniversalToothValidator.invalidateCache === 'function') {
        UniversalToothValidator.invalidateCache();
      }

      // Reutiliza createEmptyPeriodontogram para mantener una sola fuente de
      // verdad del estado vacío (mismas claves, misma forma de statistics).
      setPeriodontogramData(prev => {
        const empty = createEmptyPeriodontogram();
        if (prev?.metadata?.createdAt) {
          empty.metadata = { ...empty.metadata, createdAt: prev.metadata.createdAt };
        }
        return empty;
      });

      setSelectedTooth(null);
      isDirtyRef.current = true; ctxMarkDirty(dirtyKey);
    } catch (e) {
      console.error('Error limpiando periodontograma:', e);
    }
  }, [editMode, createEmptyPeriodontogram]);

    /* -------------------- OPTIMIZACIÓN DE RENDIMIENTO -------------------- */
   // Eliminado: useDebounce ya no es necesario
   // Solo se guarda en caché local, no en backend automáticamente
   
   // Versión inmediata para actualizaciones de estadísticas en tiempo real
   const immediateToothUpdate = useCallback((toothNumber, field, value, side = null, index = null) => {
     // INVALIDAR CACHÉ DE ESTADÍSTICAS EXPLÍCITAMENTE antes de actualizar
     UniversalToothValidator.invalidateCache('statistics');
     
     // Actualizar inmediatamente para estadísticas en tiempo real
     // SOLO guarda en caché local, NO en backend
     handleToothUpdate(toothNumber, field, value, side, index);
   }, [handleToothUpdate]);

   // Las estadísticas se calculan directamente en StatisticsPanel usando UniversalToothValidator
   // No necesitamos memoización adicional aquí

   /* -------------------- CAMBIO DE MODO -------------------- */
  const handleModeChange = useCallback(() => {
    if (editMode === 'guardado' && isDirtyRef.current) {
      const confirmed = window.confirm(
        'Hay cambios sin guardar. Si cambias a Visualización se perderán. ¿Continuar?'
      );
      if (!confirmed) return;
      isDirtyRef.current = false; ctxMarkClean(dirtyKey);
    }
    const newMode = editMode === 'guardado' ? 'visualizacion' : 'guardado';
    setEditMode(newMode);
  }, [editMode]);

   /* -------------------- GESTIÓN DE VERSIONES -------------------- */
  const handleSelectVersion = useCallback(async (ver) => {
    if (isDirtyRef.current) {
      const confirmed = window.confirm(
        'Hay cambios sin guardar. Cambiar de versión los descartará. ¿Continuar?'
      );
      if (!confirmed) return;
      isDirtyRef.current = false; ctxMarkClean(dirtyKey);
    }

    if (!ver || ver === '') {
      setSelectedVersion(null);
      setPeriodontogramData(createEmptyPeriodontogram());

      if (typeof UniversalToothValidator.invalidateCache === 'function') {
        UniversalToothValidator.invalidateCache();
      }
      return;
    }

    setSelectedVersion(ver);
    setIsLoading(true);
    setError(null);
    setErrorType(null);

    saveStateForRollback();
    
    try {
      const backendData = await PeriodontogramService.getData(patientId, ver);
      const normalizedData = convertBackendDataToFrontend(backendData);

      setPeriodontogramData(normalizedData);
      setPeriodontogramExists(true);
    } catch (err) {
      rollbackData(); // Restaurar estado anterior en caso de error
      handleError(err, 'cambio de versión');
    } finally {
      setIsLoading(false);
    }
  }, [patientId, createEmptyPeriodontogram, saveStateForRollback, rollbackData, handleError, convertBackendDataToFrontend]);

  /* --------------------------- GUARDAR --------------------------- */
  const handleSave = useCallback(async () => {
    if (!periodontogramData) return;
    setIsSaving(true);
    setError(null);
    setErrorType(null);
    
    // Guardar estado para rollback
    saveStateForRollback();
    
    try {
      // Si es la primera vez que se guarda, crear el periodontograma en el backend
      if (!periodontogramExists) {
        try {
          await PeriodontogramService.createPeriodontogram(patientId);
          setPeriodontogramExists(true);
          if (ADVANCED_LOGGING_CONFIG.enabled) console.log('✅ Periodontograma creado exitosamente en el backend');
        } catch (createError) {
          if (createError.response?.status === 409) {
            if (ADVANCED_LOGGING_CONFIG.enabled) console.log('📝 Periodontograma ya existe, continuando con guardado');
            setPeriodontogramExists(true);
          } else {
            throw createError;
          }
        }
      }

      if (ADVANCED_LOGGING_CONFIG.enabled) {
        console.log('🔍 DATOS ANTES DE TRANSFORMAR:', {
          periodontogramData,
          teeth: periodontogramData.teeth
        });
      }
      
      // ✅ ESQUEMA UNIFICADO - Helper para generar caras y normalizar números
      const createEmptyFace = () => ({
        placa: [0, 0, 0],
        sangrado: [0, 0, 0],
        supuracion: [0, 0, 0],
        margenGingival: [0, 0, 0],
        profundidadSondaje: [0, 0, 0]
      });
      const clampNumber = (value, min, max, fallback = 0) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.min(Math.max(num, min), max);
      };
      const mobilityLimits = MEASUREMENT_LIMITS.mobility || MEASUREMENT_LIMITS.movilidad || { min: 0, max: 3, default: 0 };
      const gumWidthLimits = MEASUREMENT_LIMITS.gumWidth || MEASUREMENT_LIMITS.anchuraEncia || { min: 0, max: 3, default: 0 };
      const furcaLimits = MEASUREMENT_LIMITS.furca || { min: 0, max: 3, default: 0 };

      const getFaceTriple = (toothData, faceKey, measurementKey) => {
        const faceData = toothData?.[faceKey];
        if (faceData && typeof faceData === 'object') {
          const value = faceData[measurementKey];
          if (Array.isArray(value)) {
            return toTriple(value);
          }
        }
        return undefined;
      };

      const measurementKeys = ['placa', 'sangrado', 'supuracion', 'margenGingival', 'profundidadSondaje'];

      // ✅ ESQUEMA UNIFICADO - Estandarizar payload: cuatro caras canónicas con arrays de 3 valores
      const unifiedTeeth = {};

      // Helpers ahora importados desde shared/utils/periodontogram-helpers.js

      Object.entries(periodontogramData.teeth || {}).forEach(([toothNumber, toothData]) => {
        const tNum = parseInt(toothNumber, 10);
        if (!Number.isFinite(tNum)) {
          return;
        }
        const isUpperTooth = tNum >= 11 && tNum <= 28;

        // 1) Derivar métricas por cara desde estructura de 4 caras si existe en campos raíz
        const metrics = {};
        // Mapeo UI(en) -> esquema(es)
        const fieldMap = {
          plaque: 'placa',
          bleeding: 'sangrado',
          suppuration: 'supuracion',
          gingivalMargin: 'margenGingival',
          probingDepth: 'profundidadSondaje'
        };
        Object.entries(fieldMap).forEach(([uiKey, esKey]) => {
          const candidate = toothData?.[uiKey] || toothData?.[esKey];
          if (candidate && typeof candidate === 'object') {
            metrics[esKey] = pickFaceTriplesFromFourFaces(candidate, isUpperTooth);
          }
        });

        // 2) Construir las 4 caras canónicas en base a las métricas detectadas
        const canonicalFaces = {
          vestibularSuperior: createEmptyFace(),
          palatinoSuperior: createEmptyFace(),
          vestibularInferior: createEmptyFace(),
          lingualInferior: createEmptyFace()
        };

        const applyFaceMetrics = (faceKey, measurementKey, values) => {
          if (!values) {
            return;
          }
          canonicalFaces[faceKey][measurementKey] = toTriple(values);
        };

        measurementKeys.forEach((measurementKey) => {
          if (isUpperTooth) {
            const vestibularValues = metrics[measurementKey]?.vestibular
              ?? getFaceTriple(toothData, 'vestibularSuperior', measurementKey)
              ?? getFaceTriple(toothData, 'vestibular', measurementKey);
            const palatinoValues = metrics[measurementKey]?.palatino
              ?? getFaceTriple(toothData, 'palatinoSuperior', measurementKey)
              ?? getFaceTriple(toothData, 'palatino', measurementKey)
              ?? getFaceTriple(toothData, 'lingual', measurementKey);

            applyFaceMetrics('vestibularSuperior', measurementKey, vestibularValues);
            applyFaceMetrics('palatinoSuperior', measurementKey, palatinoValues);
          } else {
            const vestibularValues = metrics[measurementKey]?.vestibular
              ?? getFaceTriple(toothData, 'vestibularInferior', measurementKey)
              ?? getFaceTriple(toothData, 'vestibular', measurementKey);
            const lingualValues = metrics[measurementKey]?.palatino
              ?? getFaceTriple(toothData, 'lingualInferior', measurementKey)
              ?? getFaceTriple(toothData, 'palatino', measurementKey)
              ?? getFaceTriple(toothData, 'lingual', measurementKey);

            applyFaceMetrics('vestibularInferior', measurementKey, vestibularValues);
            applyFaceMetrics('lingualInferior', measurementKey, lingualValues);
          }
        });

        // 3) Mapear campos simples a español y normalizar
        const movilidad = clampNumber(
          toothData?.movilidad ?? toothData?.mobility ?? mobilityLimits.default,
          mobilityLimits.min ?? 0,
          mobilityLimits.max ?? 3,
          mobilityLimits.default ?? 0
        );

        const anchuraEncia = clampNumber(
          toothData?.anchuraEncia ?? toothData?.gumWidth ?? gumWidthLimits.default,
          gumWidthLimits.min ?? 0,
          gumWidthLimits.max ?? 10,
          gumWidthLimits.default ?? 0
        );

        // pronóstico: aceptar UI "prognosis" o "pronostico", normalizar a minúsculas
        const rawPron = toothData?.pronostico ?? toothData?.prognosis;
        const pronostico = rawPron ? String(rawPron).toLowerCase() : 'bueno';

        // ausente/implante
        const ausente = Boolean(toothData?.ausente ?? toothData?.absent ?? false);
        const implante = Boolean(toothData?.implante ?? toothData?.implant ?? false);

        // 4) Furca: aceptar {vestibular, lingual/lingualPalatino, mesial} o compat {furca1,furca2}
        const normalizeFurcaValue = (val, fallback) => clampNumber(val ?? fallback, furcaLimits.min ?? 0, furcaLimits.max ?? 3, fallback ?? 0);

        const furcaSource = (() => {
          if (typeof toothData?.furca === 'number') {
            return { vestibular: toothData.furca, lingualPalatino: toothData.furca, furca1: toothData.furca, furca2: toothData.furca };
          }
          if (toothData?.furca && typeof toothData.furca === 'object') {
            return toothData.furca;
          }
          return {
            vestibular: toothData?.furcaVestibular,
            lingualPalatino: toothData?.furcaLingual ?? toothData?.furcaLingualPalatino,
            furca1: toothData?.furca1,
            furca2: toothData?.furca2
          };
        })();

        const furcaVestibular = normalizeFurcaValue(furcaSource?.vestibular, 0);
        const furcaLingual = normalizeFurcaValue(furcaSource?.lingualPalatino ?? furcaSource?.lingual, furcaVestibular);
        const furca1 = normalizeFurcaValue(furcaSource?.doble?.furca1 ?? furcaSource?.furca1 ?? furcaSource?.mesial, furcaVestibular);
        const furca2 = normalizeFurcaValue(furcaSource?.doble?.furca2 ?? furcaSource?.furca2 ?? furcaSource?.mesial, furcaLingual);

        const furca = {
          vestibular: furcaVestibular,
          lingualPalatino: furcaLingual,
          doble: {
            furca1,
            furca2
          }
        };

        // 5) Construir diente unificado y limpiar claves no canónicas
        const unifiedTooth = {
          numeroDiente: tNum,
          arcada: isUpperTooth ? 'superior' : 'inferior',
          ausente,
          implante,
          movilidad,
          anchuraEncia,
          furca,
          pronostico,
          vestibularSuperior: canonicalFaces.vestibularSuperior,
          palatinoSuperior: canonicalFaces.palatinoSuperior,
          vestibularInferior: canonicalFaces.vestibularInferior,
          lingualInferior: canonicalFaces.lingualInferior,
          fechaUltimaModificacion: new Date().toISOString()
        };

        unifiedTeeth[toothNumber] = unifiedTooth;
      });
      
      // Validar y normalizar datos usando el esquema unificado
      const validatedData = validatePeriodontogramData({
        pacienteId: patientId,
        teeth: unifiedTeeth,
        statistics: periodontogramData.statistics || {},
        version: new Date().toISOString().replace(/[:.-]/g, '')
      });
      
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('📋 Datos unificados y validados:', validatedData);
      
      // Recalcular estadísticas para asegurar consistencia
  // Calcular estadísticas desde la estructura de UI (campos ingleses con 4-caras)
  const stats = UniversalToothValidator.calculateStatistics({ teeth: periodontogramData.teeth || {} });
      const payload = {
        teeth: validatedData.teeth,
        statistics: stats,
        versionName: validatedData.version
      };
      
      const saveResponse = await PeriodontogramService.saveData(patientId, payload);
      const nextVersionName = saveResponse?.versionName ?? saveResponse?.version ?? payload.versionName;
      setPeriodontogramExists(true);
      setPeriodontogramData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          statistics: stats,
          versionName: nextVersionName,
          metadata: {
            ...(prev.metadata || {}),
            lastModified: new Date().toISOString(),
            version: nextVersionName
          }
        };
      });
      const versions = await PeriodontogramService.getDataVersions(patientId);
      const orderedVersions = sortVersionsDesc(versions);
      setVersionList(orderedVersions);
      setSelectedVersion(nextVersionName ?? orderedVersions[0] ?? null);
      setPreviousData(null);
      isDirtyRef.current = false; ctxMarkClean(dirtyKey);
      draft.clearDraft();
      message.success('Periodontograma guardado');

      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('✅ Periodontograma guardado exitosamente');
    } catch (err) {
        rollbackData(); // Restaurar estado anterior en caso de error
        handleError(err, 'guardado de datos');
      } finally {
      setIsSaving(false);
    }
  }, [patientId, periodontogramData, periodontogramExists, saveStateForRollback, rollbackData, handleError, sortVersionsDesc]);

  // beforeunload: bloquear navegación nativa del navegador (cerrar pestaña,
  // recargar) si hay cambios sin guardar. No previene cambios de ruta SPA;
  // esos los cubrimos con confirms en handleModeChange/handleSelectVersion.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Oferta de recuperación de borrador local. Se dispara cuando termina la
  // carga inicial del paciente: si hay un draft en localStorage de una sesión
  // anterior que se cortó, ofrecemos restaurarlo.
  useEffect(() => {
    if (isLoading) return;
    if (!patientId) return;
    if (draftPromptedRef.current) return;
    if (editMode !== 'guardado') return;

    const existing = draft.loadDraft();
    if (!existing || !existing.data || typeof existing.data !== 'object') return;
    // Verificación mínima: que el borrador tenga teeth.
    const hasTeeth = existing.data.teeth && Object.keys(existing.data.teeth).length > 0;
    if (!hasTeeth) {
      draft.clearDraft();
      return;
    }
    draftPromptedRef.current = true;

    const minutes = Math.max(1, Math.round((Date.now() - existing.savedAt) / 60000));
    const when = minutes < 60
      ? `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
      : `hace ${Math.round(minutes / 60)} h`;

    const ok = window.confirm(
      `Detectamos cambios en el periodontograma de ${when} que no se llegaron a guardar. ¿Recuperarlos?\n\nAceptar = Recuperar borrador.\nCancelar = Descartarlo.`
    );
    if (ok) {
      try {
        setPeriodontogramData(existing.data);
        isDirtyRef.current = true;
        ctxMarkDirty(dirtyKey);
        if (typeof UniversalToothValidator.invalidateCache === 'function') {
          UniversalToothValidator.invalidateCache();
        }
      } catch (err) {
        console.error('[Periodontogram] Error recuperando borrador:', err);
        message.error('No se pudo recuperar el borrador.');
      }
    } else {
      draft.clearDraft();
    }
  }, [isLoading, patientId, editMode, draft, ctxMarkDirty, dirtyKey]);



  /* --------------------------- RENDER --------------------------- */
  return (
    <section className="patient-detail_periodontograma">
      <div className="periodontogram-section">
        <div className="periodontogram-header">
          <h2>Periodontograma</h2>
          <div className="periodontogram-header-actions">
            {editMode === 'guardado' ? (
              <>
                <button
                  className="button-primary"
                  onClick={handleSave}
                  disabled={isSaving || isLoading}
                >
                  {isSaving ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  className="button-secondary"
                  onClick={handleClear}
                  disabled={isSaving || isLoading}
                >
                  Limpiar
                </button>
              </>
            ) : (
              <select
                className="periodontogram-select"
                value={selectedVersion || ''}
                onChange={e => handleSelectVersion(e.target.value)}
              >
                <option value="">Seleccionar versión...</option>
                {versionList.map(v => (
                  <option key={v} value={v}>{formatVersionLabel(v)}</option>
                ))}
              </select>
            )}
            <button
              className="button-secondary"
              onClick={handleModeChange}
            >
              {editMode === 'guardado' ? 'Visualización' : 'Edición'}
            </button>
          </div>
      </div>

      {error && (
        <div className={`error error--${errorType || 'unknown'}`}>
          <span className="error__icon">
            {errorType === 'network' ? '🌐' : 
             errorType === 'validation' ? '⚠️' : 
             errorType === 'server' ? '🔧' : '❌'}
          </span>
          <span className="error__message">{error}</span>
          {errorType === 'network' && (
            <button 
              className="error__retry" 
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      {isLoading && <p>Cargando…</p>}

      {!isLoading && (
        <PeriodontogramDesign
          periodontogramData={periodontogramData}
          onToothUpdate={immediateToothUpdate}
          readOnly={editMode !== 'guardado'}
          selectedTooth={selectedTooth}
          onToothSelect={setSelectedTooth}
        />
      )}

      {!isLoading && periodontogramData && (
        <StatisticsPanel
          data={periodontogramData}
        />
      )}
      </div>
    </section>
  );
};

export default PeriodontogramSection;