import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Table, Modal, message } from 'antd';
import { normalizeEntriesForEngine, sameEntryContent, resetEngineData, formatToothNumber } from '../utils/odontogram-utils.js';
import { useUnsavedChanges } from '../../../shared/contexts/UnsavedChangesContext.jsx';
import { useDraftPersistence } from '../../../shared/hooks/useDraftPersistence.js';
import { getCurrentDateFormatted } from '../../../shared/utils/date-utils.js';
// Mismo módulo que usa el periodontograma: parsea el sello UTC (…Z) con
// Date.UTC. El viejo shared/utils/version-name.js (borrado) parseaba el ISO
// compacto como hora LOCAL → todas las etiquetas corridas por el offset.
import { formatVersionLabel } from '../../../shared/utils/periodontogram-version-time.js';
// Eliminados: import { DeleteOutlined, SaveOutlined, RiseOutlined, MedicineBoxOutlined } from '@ant-design/icons';
// import '../../Styles/PatientDetail.css'; // Asumiendo estilos compartidos
import PropTypes from 'prop-types';
import { logger } from '../../../shared/utils/logger';

// --- Función Auxiliar (Definida al principio) ---
const getDamageNameFromIdInternal = (damageId, engineInstance) => {
    if (!damageId && damageId !== 0) {
        return "Sin especificar";
    }
    
    if (typeof damageId === 'string' && (damageId.includes(' ') || damageId.includes('(') || damageId.includes(':'))) {
        return damageId;
    }
    
    const numericId = typeof damageId === 'string' ? parseInt(damageId, 10) : damageId;
    
    if (isNaN(numericId)) {
        return damageId || "Daño desconocido";
    }
    
    // Intenta obtener el nombre desde las constantes del motor si está disponible
    if (engineInstance && engineInstance.constants) {
        const constants = engineInstance.constants;
        for (const key in constants) {
            if (constants[key] === numericId) {
                const formattedName = key.replace(/_/g, ' ').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                return formattedName;
            }
        }
    }
    
    // Fallback a nombres comunes basados en el engine.js
    const commonDamageNames = { 
        1: 'Caries', 2: 'Corona', 3: 'Corona (Temp)', 4: 'Ausente', 5: 'Fractura',
        6: 'Implante', 8: 'Diastema', 9: 'Extrusión', 11: 'Empaste', 12: 'Prótesis Rem', 
        13: 'Migración', 14: 'Rotación', 15: 'Fusión', 16: 'Remanente R', 
        17: 'Macrodoncia', 18: 'Microdoncia', 19: 'Impactado', 20: 'Intrusión', 
        21: 'Ectópico', 22: 'Discrómico', 23: 'Endodoncia', 24: 'No Erupcionado', 
        25: 'Transposición', 27: 'Supernumerario', 28: 'Daño Pulpar', 29: 'Carilla', 
        30: 'Poste', 31: 'Edéntulismo', 32: 'Orto Fijo', 34: 'Prótesis Fija', 
        37: 'Desgastado', 38: 'Semi-Impactado' 
    };
    
    const result = commonDamageNames[numericId] || `Daño ${numericId}`;
    return result;
};

const OdontogramClinicalSection = ({
    patientId,
    clinicalData = [], // Estado actual del CANVAS (snapshot)
    onDataSave = () => {}, // Callback al padre para guardar canvas state
    versionList = [], // Lista de versionName (más reciente primero)
    selectedVersion = null, // versionName activo en el selector
    onSelectVersion = () => {}, // Callback al padre para cargar una versión

    areScriptsReady = false, // Parámetro por defecto
    canvasRef
}) => {
    
    // ---> LOG PROP RECIBIDA <-----
    // logger.log(`[OdontoClinical] Renderizando. Prop clinicalData (Canvas State) RECIBIDA (${Array.isArray(clinicalData) ? clinicalData.length : 'No Array'} items):`, clinicalData);
    // -----------------------------

    // --- Estados ---
    const [isSaving, setIsSaving] = useState(false);
    const [engineError, setEngineError] = useState(null);
    const [isEngineInitialized, setIsEngineInitialized] = useState(false);
    const [currentCanvasData, setCurrentCanvasData] = useState([]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Tabla colapsable: por defecto oculta para que el canvas use todo el ancho.
    const [tableVisible, setTableVisible] = useState(false);

    // Consolidar refs del motor
    const engineManagerRef = useRef({
        instance: null,
        handlers: null,
        initialized: false
    });
    // Marca cambios sin guardar — base del warning beforeunload (cierre de
    // pestaña/recarga) y del guard SPA (cambio de paciente vía router).
    // Se mantiene ref + state: ref para handlers (sin re-render), state
    // para el badge visual "No guardado".
    const isDirtyRef = useRef(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const { markDirty: ctxMarkDirty, markClean: ctxMarkClean } = useUnsavedChanges();
    const dirtyKey = `odontogram-clinical-${patientId || 'no-patient'}`;
    const markDirty = useCallback(() => {
        isDirtyRef.current = true;
        setHasUnsavedChanges(true);
        ctxMarkDirty(dirtyKey);
    }, [ctxMarkDirty, dirtyKey]);
    const markClean = useCallback(() => {
        isDirtyRef.current = false;
        setHasUnsavedChanges(false);
        ctxMarkClean(dirtyKey);
    }, [ctxMarkClean, dirtyKey]);
    // Cleanup al desmontar — desregistrar para que un componente que
    // queda dirty no bloquee navegación después de que se desmonta.
    useEffect(() => () => ctxMarkClean(dirtyKey), [ctxMarkClean, dirtyKey]);

    // Persistencia local del borrador: sobrevive a timeouts de sesión.
    const draft = useDraftPersistence({
        key: `odontogram-clinical-${patientId || 'no-patient'}`,
        enabled: !!patientId,
        isDirty: () => isDirtyRef.current,
        getSnapshot: () => engineManagerRef.current?.instance?.getData?.() || [],
    });
    const draftPromptedRef = useRef(false);
    // Cambiar de paciente reinicia el engine; también el aviso de borrador
    // debe re-evaluarse para el paciente nuevo.
    useEffect(() => { draftPromptedRef.current = false; }, [patientId]);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (!isDirtyRef.current) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    useEffect(() => {
        if (!isFullscreen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsFullscreen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    // Envolver getDamageNameFromIdInternal con useCallback para estabilidad si se pasa como prop o dependencia compleja
    // Si solo se usa internamente en el efecto de saveOdontograma, y este ya depende de engineManagerRef.current.instance,
    // se podría llamar a getDamageNameFromIdInternal directamente dentro del efecto, pasando engineManagerRef.current.instance.
    const getDamageNameFromId = useCallback((damageId) => {
        return getDamageNameFromIdInternal(damageId, engineManagerRef.current.instance);
    }, []); // Dependencia de engineManagerRef.current.instance es implícita, pero useCallback lo memoizará sin ella.
           // Si se quiere re-memoizar cuando el engine cambia, se añadiría engineManagerRef.current.instance a las deps,
           // pero eso es más complejo con refs. Por ahora, se asume que el engine no cambia tan seguido como para necesitarlo.

    // --- Funciones ---

    // Anti doble-guardado: ref síncrono que captura clicks rápidos antes de
    // que React procese isSaving. Mismo patrón que `savedOnceRef` en el
    // inicial pero re-usable (acá sí se permite re-guardar varias veces).
    const savingRef = useRef(false);

    // Función para guardar el estado actual del canvas clínico
    const triggerSave = useCallback(async () => {
        if (savingRef.current) {
            // Doble-click instantáneo antes de que isSaving deshabilite el botón.
            return;
        }
        if (!isEngineInitialized || !engineManagerRef.current.instance) {
            message.warning('El motor del odontograma no está inicializado');
            return;
        }
        
        savingRef.current = true;
        setIsSaving(true);
        try {
            const engineData = engineManagerRef.current.instance.getData() || [];
            if (!engineData.length) {
                // Canvas vacío. Si el registro guardado también está vacío no
                // hay nada que persistir; pero si HABÍA daños, el estado vacío
                // es un cambio clínico legítimo (p.ej. se quitó la ortodoncia)
                // — antes este return hacía imposible pasar de N daños a 0.
                const hadData = Array.isArray(clinicalData) && clinicalData.length > 0;
                if (!hadData) {
                    message.info('No hay datos para guardar.');
                    return;
                }
                const ok = window.confirm('El canvas está vacío: se guardará una versión SIN hallazgos (los daños anteriores quedan en el historial de versiones). ¿Continuar?');
                if (!ok) return;
            }
            
            // --- INICIO CORRECCIÓN TIPO VALUE FIX ---
            const normalizedEngineData = Array.isArray(engineData) ? engineData : [];
            
            const dataWithDates = normalizedEngineData.map(item => {
                // 1. Recuperar o inferir el valor de 'tipo'
                let tipoValue = item.tipo;

                // Si es numérico (ID interno), convertir a texto
                if (typeof item.tipo === 'number') {
                    tipoValue = getDamageNameFromId(item.tipo);
                } 
                // Si no existe, buscar en propiedades alternativas
                else if (!tipoValue) {
                    tipoValue = item.name || item.damage || item.value || 
                        (item.damages && item.damages.length > 0 
                            ? item.damages.map(d => d.name || d.value).join(", ") 
                            : null); // CAMBIO: null en lugar de "Daño aplicado" para permitir verificaciones posteriores
                }

                // Lógica adicional del fix: buscar en propiedades internas con guion bajo
                if ((!tipoValue || tipoValue === "") && item._damageType) {
                    tipoValue = item._damageType;
                }
                
                if ((!tipoValue || tipoValue === "") && item._damages && item._damages.length > 0) {
                    tipoValue = item._damages.map(d => d.name || d.value).join(", ");
                }

                // 2. Fallback final para evitar strings vacíos
                if (!tipoValue || tipoValue === "") {
                    tipoValue = "Daño aplicado";
                }

                // NOTA: el backend estampa la `fecha` con new Date() y
                // ignora cualquier valor del cliente (decisión explícita
                // del schema en odontograma.js). No la enviamos para
                // evitar código muerto que confunda al lector.
                return {
                    ...item,
                    tipo: tipoValue
                };
            });
            // --- FIN CORRECCIÓN ---
            
            if (onDataSave && typeof onDataSave === 'function') {
                await onDataSave(dataWithDates);
                markClean();
                draft.clearDraft();
                message.success('Odontograma clínico guardado exitosamente');
            } else {
                console.error('La prop onDataSave no está definida o no es una función');
                message.error('Error interno: no se puede guardar el odontograma');
            }
        } catch (error) {
            console.error('Error al guardar odontograma clínico:', error);
            // Si el padre ya notificó al usuario (p.ej. warning de concurrencia
            // ODONTOGRAMA_STALE) no duplicamos el mensaje. En cualquier caso NO
            // se llega aquí en un guardado exitoso, así que el toast de éxito de
            // arriba ya no aparece junto a un error.
            if (!error?.handled) {
                message.error(error?.message || 'Error al guardar el odontograma clínico');
            }
        } finally {
            setIsSaving(false);
            savingRef.current = false;
        }
    }, [isEngineInitialized, onDataSave, getDamageNameFromId, clinicalData]);

    // Cambio de versión desde el selector. El padre carga los datos en el canvas;
    // aquí gestionamos el confirm de "cambios sin guardar" porque este componente
    // es quien conoce el dirty del engine (isDirtyRef).
    const handleVersionChange = useCallback((e) => {
        const ver = e.target.value;
        if (!ver || ver === selectedVersion) return;
        if (isDirtyRef.current) {
            const ok = window.confirm('Hay cambios sin guardar en el canvas. Cambiar de versión los descartará. ¿Continuar?');
            if (!ok) return;
            markClean();
            draft.clearDraft();
        }
        onSelectVersion(ver);
    }, [selectedVersion, onSelectVersion, markClean, draft]);

    // Columnas de la tabla - Estado Actual (usa datos directos sin prepareDataSource)
    const odontogramColumns = [
        { title: 'Diente', dataIndex: 'tooth', key: 'tooth', width: 40 },
        { title: 'Daño', dataIndex: 'damage', key: 'damage', width: 100, ellipsis: true },
        { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 60, ellipsis: true },
    ];

    // Función para obtener el nombre de la superficie usando códigos de letra del engine
    const getSurfaceName = (surfaceValue) => {
        const surfaces = {
            'V': 'Vestibular', 'M': 'Mesial', 'D': 'Distal', 'L': 'Lingual',
            '0': 'Oclusal', 'O': 'Oclusal', 'P': 'Palatino'
        };
        return surfaces[String(surfaceValue).toUpperCase()] || surfaceValue;
    };

    // Función para combinar daño con superficie
    const combineDamageWithSurface = useCallback((damage, surface) => {
        if (!damage) return 'Sin especificar';
        
        if (!surface || surface === '0' || surface === 0) {
            return damage;
        }
        
        const surfaceName = getSurfaceName(String(surface));
        if (surfaceName && surfaceName !== 'Desconocida') {
            return `${damage} (${surfaceName})`;
        }
        
        return damage;
    }, []);

    // Normaliza los datos para el engine y la tabla delegando en el
    // normalizador COMPARTIDO (el mismo del odontograma inicial). El
    // normalizador local anterior tenía dos bugs que el compartido ya
    // resuelve: (a) descartaba las entradas de espacio inter-dental
    // (`space:` sin tooth — diastema, prótesis fija, orto fijo…), así que
    // esos daños guardados jamás volvían al canvas ni a la tabla al
    // recargar; (b) en entradas sólo-nota producía damage:"undefined"
    // (String('' || undefined)), que el engine trataba como daño no numérico
    // en vez de repoblar el textBox de la nota.
    const normalizeForEngine = useCallback(entries => {
        // Compat: entradas legacy con engineTeeth múltiple y sin tooth se
        // expanden a una entrada por diente antes de normalizar.
        const expanded = (Array.isArray(entries) ? entries : []).flatMap(e => {
            if (e && typeof e === 'object' && !e.tooth && !e.space && Array.isArray(e.engineTeeth) && e.engineTeeth.length > 0) {
                return e.engineTeeth.map(toothNum => ({ ...e, tooth: toothNum }));
            }
            return [e];
        });
        return normalizeEntriesForEngine(expanded).map((e, i) => ({
            key: `${patientId}-${e.space || e.tooth}-${e.damage}-${e.surface}-${e.fecha || ''}-${i}`,
            ...e,
            fecha: e.fecha || ''
        }));
    }, [patientId]);

    // Efecto de inicialización del engine: sólo depende de areScriptsReady, patientId y canvasRef
    useEffect(() => {
        const { initialized } = engineManagerRef.current;
        if (!areScriptsReady) {
            return;
        }
        if (!canvasRef || !canvasRef.current) {
            setEngineError("Error interno: Canvas no encontrado.");
            return;
        }
        if (initialized) {
            if (!isEngineInitialized) setIsEngineInitialized(true);
            return;
        }
        let engine;
        try {
            if (!window.Engine) {
                setEngineError('Motor de Odontograma (Engine) no está cargado.');
                throw new Error('Engine no está definido globalmente');
            }
            engine = new window.Engine({
                CONSTANTS: window.Constants ? new window.Constants() : null,
                patientId
            });
            if (!engine || typeof engine.init !== 'function') {
                setEngineError('Fallo al instanciar Engine.');
                throw new Error('Fallo al instanciar Engine');
            }
            engine.setCanvas(canvasRef.current);
        engine.init();
            if (engine.buttons) {
                engine.buttons.forEach((button) => {
                    if (button?.textBox?.text === "Guardar") {
                        button.active = false; 
                        button.rect.x = -1000; 
                        if(button.textBox) button.textBox.rect.x = -1000;
                    }
                });
            }
            engine.setPatientId(patientId);
            // Usa clinicalData para cargar en el engine
            const engineData = normalizeForEngine(clinicalData);
            // logger.log('[OdontoClinical] Cargando datos en engine:', engineData);
            if (engineData.length > 0) {
                engine.loadOdontogramaData(engineData);
                // logger.log('[OdontoClinical] Datos cargados en engine exitosamente');
            } else {
                // logger.log('[OdontoClinical] No hay datos para cargar en el engine');
            }
            engine.start();
            // Cada click marca dirty (ref para handlers + state para badge)
            // y sincroniza la tabla en el siguiente frame (reemplaza al
            // antiguo setInterval de 1s que leía estados intermedios).
            const clickHandler = (e) => {
                markDirty();
                engine.onMouseClick(e);
                requestAnimationFrame(() => syncCanvasFromEngineRef.current());
            };
            const moveHandler = (e) => engine.onMouseMove(e);
            canvasRef.current.addEventListener('click', clickHandler);
            canvasRef.current.addEventListener('mousemove', moveHandler);
            engineManagerRef.current = {
                instance: engine,
                handlers: { click: clickHandler, move: moveHandler },
                initialized: true
            };
            setIsEngineInitialized(true);
            setEngineError(null);

            // Recuperación de borrador local — la sesión anterior pudo cerrarse
            // antes de guardar (timeout JWT, crash). Si hay un draft válido en
            // localStorage, ofrecemos recuperarlo.
            if (!draftPromptedRef.current) {
                const existing = draft.loadDraft();
                const data = Array.isArray(existing?.data) ? existing.data : [];
                if (data.length > 0) {
                    draftPromptedRef.current = true;
                    const minutes = Math.max(1, Math.round((Date.now() - existing.savedAt) / 60000));
                    const when = minutes < 60
                        ? `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
                        : `hace ${Math.round(minutes / 60)} h`;
                    Modal.confirm({
                        title: 'Cambios sin guardar encontrados',
                        content: `Detectamos cambios en el odontograma clínico de ${when} que no se llegaron a guardar. ¿Recuperarlos?`,
                        okText: 'Recuperar',
                        cancelText: 'Descartar',
                        onOk: () => {
                            try {
                                const entries = normalizeEntriesForEngine(data);
                                if (entries.length > 0 && engineManagerRef.current?.instance) {
                                    // El draft es un snapshot COMPLETO del canvas:
                                    // reemplaza (reset + load), no fusiona.
                                    resetEngineData(engineManagerRef.current.instance);
                                    engineManagerRef.current.instance.loadOdontogramaData(entries);
                                    engineManagerRef.current.instance.update?.();
                                    markDirty();
                                    requestAnimationFrame(() => syncCanvasFromEngineRef.current());
                                }
                            } catch (err) {
                                console.error('[OdontoClinical] Error recuperando borrador:', err);
                                message.error('No se pudo recuperar el borrador.');
                            }
                        },
                        onCancel: () => draft.clearDraft(),
                    });
                }
            }
        } catch (error) {
            setEngineError(prevError => prevError || `Error motor odontograma: ${error.message}`);
            engineManagerRef.current = { ...engineManagerRef.current, initialized: false }; 
            setIsEngineInitialized(false);
        }
        return () => {
            const { instance: currentEngineInstance, handlers: currentHandlers, initialized: wasInitialized } = engineManagerRef.current;
            if (currentEngineInstance && wasInitialized) {
                if (typeof currentEngineInstance.cleanup === 'function') {
                    currentEngineInstance.cleanup();
                } else {
                    currentEngineInstance.stop = true;
                }
                if (canvasRef.current && currentHandlers) {
                    try {
                        canvasRef.current.removeEventListener('click', currentHandlers.click);
                        canvasRef.current.removeEventListener('mousemove', currentHandlers.move);
                    } catch(e) {
                         /* silent */
                    }
                }
            }
            engineManagerRef.current = { instance: null, handlers: null, initialized: false };
            setIsEngineInitialized(false);
        };
    }, [areScriptsReady, patientId, canvasRef]);

    // Efecto para sincronizar el engine con clinicalData.
    //  - Comparación por CONTENIDO clínico (sameEntryContent): el compare
    //    anterior era JSON.stringify de dos formas distintas (getData() crudo
    //    vs normalizado con keys) → SIEMPRE difería y recargaba en cada render.
    //  - reset ANTES de cargar: loadOdontogramaData es ADITIVO (no quita
    //    daños); sin reset, cambiar de versión FUSIONABA la versión elegida
    //    con lo que ya estaba dibujado (y un guardado posterior persistía esa
    //    mezcla como versión nueva).
    useEffect(() => {
        const { instance: engine, initialized: engineInitialized } = engineManagerRef.current;
        if (!engineInitialized || !engine || isSaving) {
            return;
        }

        if (sameEntryContent(engine.getData() || [], clinicalData)) {
            return; // mismo contenido — no tocar el canvas (preserva edición en curso)
        }
        engine.processing = true;
        try {
            resetEngineData(engine);
            engine.loadOdontogramaData(normalizeForEngine(clinicalData));
            engine.update();
            // Sincronizar la tabla con el nuevo estado del engine (reemplaza
            // al antiguo setInterval que polleaba cada 1s).
            requestAnimationFrame(() => syncCanvasFromEngineRef.current());
        } catch (error) {
            console.error('[OdontoClinical] Error al actualizar engine:', error);
        } finally {
             engine.processing = false;
        }
    }, [clinicalData, isEngineInitialized, normalizeForEngine, isSaving]);

    // Sincroniza la tabla del canvas con el estado del engine. Antes esto
    // corría dentro de setInterval(1000) → leía engine.getData() en medio
    // del render con riesgo de capturar estados intermedios. Ahora se
    // dispara desde el clickHandler (vía ref) + una vez al montar + cada
    // vez que clinicalData cambia desde el servidor.
    const syncCanvasFromEngineRef = useRef(() => {});
    useEffect(() => {
        syncCanvasFromEngineRef.current = () => {
            const { instance: engine, initialized } = engineManagerRef.current;
            if (!initialized || !engine) return;
            try {
                const engineData = engine.getData() || [];
                const normalizedData = normalizeForEngine(engineData);
                setCurrentCanvasData(prevData => {
                    const prevStr = JSON.stringify(prevData);
                    const newStr = JSON.stringify(normalizedData);
                    return prevStr !== newStr ? normalizedData : prevData;
                });
            } catch (error) {
                console.error('[OdontoClinical] Error sincronizando canvas:', error);
            }
        };
    }, [normalizeForEngine]);

    // Sync inicial al montar el engine + reset cuando se desmonta.
    useEffect(() => {
        const { instance: engine, initialized } = engineManagerRef.current;
        if (!initialized || !engine) {
            setCurrentCanvasData([]);
            return;
        }
        // Microtask: deja que el engine termine cualquier setup async antes de leer.
        Promise.resolve().then(() => syncCanvasFromEngineRef.current());
     }, [isEngineInitialized]);

    // Listener para el evento unificado 'odontogramSave' (lo emite el botón
    // "Guardar" interno del engine — hoy oculto, se conserva como red de
    // seguridad). Comparte el guard savingRef con triggerSave para que ambos
    // caminos sean mutuamente excluyentes. Se eliminó el "fallback" de 5s que
    // reseteaba isSaving: en guardados legítimamente lentos (>5s; el timeout
    // real de axios es 30s) re-habilitaba el botón a mitad del request.
    useEffect(() => {
        const handleSaveClinicalData = async (event) => {
            const { tipo, patientId: evtId, entries } = event.detail;
            if (tipo !== 'clinico' || evtId !== patientId) return;
            if (savingRef.current) return; // ya hay un guardado en curso
            savingRef.current = true;
            setIsSaving(true);
            try {
                // Usar las entradas normalizadas del evento
                const engineData = entries || engineManagerRef.current.instance?.getUnifiedOdontogramData() || [];
                if (!engineData.length) {
                  message.info('No hay datos para guardar.');
                  return;
                }
                // IMPORTANTE: await — onDataSave es async y lanza en caso de
                // fallo. Sin await, "Guardado OK" salía siempre (incluso al
                // fallar) y el rechazo quedaba sin capturar.
                if (onDataSave) await onDataSave(engineData);
                markClean();
                draft.clearDraft();
                message.success('Guardado OK');
            } catch (err) {
                if (!err?.handled) {
                    message.error(err?.message || 'Error guardando clínico');
                }
            } finally {
                setIsSaving(false);
                savingRef.current = false;
            }
        };
        document.addEventListener('odontogramSave', handleSaveClinicalData);
        return () => {
            document.removeEventListener('odontogramSave', handleSaveClinicalData);
        };
    }, [onDataSave, patientId, markClean, draft]);

    // --- JSX --- 
    // logger.log('[OdontoClinical] Antes de RETURN. Estado Canvas (canvasData):', canvasData);
    // logger.log('[OdontoClinical] Antes de RETURN. Historial Tabla (clinicalTableHistory):', clinicalTableHistory);
    // Datos del estado actual del canvas (en tiempo real)
    const tableData = useMemo(() => {
        // Usar currentCanvasData si tiene datos, sino usar clinicalData
        const dataToUse = currentCanvasData.length > 0 ? currentCanvasData : clinicalData;
        
        if (!dataToUse || dataToUse.length === 0) {
            return [];
        }
        
        return dataToUse.map((row, index) => {
            // Entrada sólo-nota: mostrar la nota en vez de "Sin especificar".
            const rawDamage = row.damage || row.tipo;
            const baseDamage = rawDamage
                ? getDamageNameFromIdInternal(rawDamage)
                : (row.note ? `Nota: ${row.note}` : 'Sin especificar');
            const combinedDamage = combineDamageWithSurface(baseDamage, row.surface);
            // Daños inter-dentales: el objetivo viene en `space` ("1817" → "18-17").
            const target = row.tooth || (row.space ? formatToothNumber(row.space) : '');

            return {
                key: `current-${index}-${target}`,
                tooth: target,
                damage: combinedDamage,
                surface: row.surface,
                note: row.note || '',
                fecha: row.fecha || getCurrentDateFormatted()
            };
        });
    }, [currentCanvasData, clinicalData]);

    return (
        <section className="patient-detail_odontograma">
            <div className="odontograma-section">
              <div className="odontograma-header2">
                <div className="odontograma-initial-heading-block">
                  <h2>
                    Odontograma Clínico
                    {hasUnsavedChanges && (
                      <span
                        style={{ marginLeft: 12, fontSize: 13, color: 'var(--color-warning)', fontWeight: 500 }}
                        title="Hay cambios en el canvas que no han sido persistidos"
                      >
                        ● No guardado
                      </span>
                    )}
                  </h2>
                  <p className="odontograma-initial-status-line" role="status">
                    Selecciona una herramienta, marca los dientes en el canvas y pulsa «Guardar estado». El registro clínico puede actualizarse en cada consulta.
                  </p>
                </div>
                <div className="odontograma-controls">
                  {/* Selector SIEMPRE visible (paridad con el periodontograma):
                      antes se ocultaba con versionList.length>0, así que un
                      paciente sin versiones (legacy sin migrar / sin guardados)
                      no veía el selector. El placeholder cubre la lista vacía. */}
                  <select
                    className="odontograma-version-select"
                    value={selectedVersion || ''}
                    onChange={handleVersionChange}
                    disabled={isSaving}
                    title="Versión del odontograma clínico"
                    aria-label="Versión del odontograma clínico"
                  >
                    <option value="">Seleccionar versión...</option>
                    {versionList.map(v => (
                      <option key={v} value={v}>{formatVersionLabel(v)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button-primary capture-button"
                    onClick={triggerSave}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Guardando...' : 'Guardar estado'}
                  </button>
                  <button
                    type="button"
                    className="odontograma-toggle-table-btn"
                    onClick={() => setTableVisible(v => !v)}
                    aria-pressed={tableVisible}
                    title={tableVisible ? 'Ocultar tabla de daños' : 'Mostrar tabla de daños'}
                  >
                    {tableVisible ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="odontograma-toggle-icon"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="odontograma-toggle-icon"
                        aria-hidden="true"
                      >
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <path d="M9 11h6" />
                        <path d="M9 15h6" />
                      </svg>
                    )}
                    <span>{tableVisible ? 'Ocultar registro' : 'Ver registro'}</span>
                    {tableData.length > 0 && (
                      <span className="odontograma-toggle-badge" aria-label={`${tableData.length} daños`}>
                        {tableData.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div className="odontograma-wrapper">
                <div className={`odontograma-container odontograma-flex-container${tableVisible ? '' : ' odontograma-table-collapsed'}`}>
                  {isFullscreen && (
                    <div
                      className="odontograma-fullscreen-backdrop"
                      onClick={() => setIsFullscreen(false)}
                    />
                  )}
                  <div className={`odontograma-canvas-container${isFullscreen ? ' odontograma-canvas-fullscreen' : ''}`}>
                    {isFullscreen && (
                      <div className="odontograma-fullscreen-header">
                        <h3>Odontograma Clínico</h3>
                        <button
                          className="odontograma-fullscreen-close"
                          onClick={() => setIsFullscreen(false)}
                          title="Cerrar (Esc)"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {!isFullscreen && (
                      <button
                        className="odontograma-expand-btn"
                        onClick={() => setIsFullscreen(true)}
                        title="Ampliar odontograma"
                        aria-label="Ampliar odontograma"
                      >
                        ⛶
                      </button>
                    )}
                    {engineError && <div className="error-message">{engineError}</div>}
                    <canvas 
                      id="odontograma-canvas-2" 
                      width="1200"
                      height="700"
                      className="odontograma-canvas"
                      ref={canvasRef}
                    />
                    {isSaving && (
                      <div className="odontograma-saving-overlay" role="status" aria-live="polite">
                        <span className="odontograma-saving-overlay__text">Guardando...</span>
                      </div>
                    )}
                  </div>
                  <div className="odontograma-table-container">
                   <Table
                     columns={odontogramColumns}
                     dataSource={tableData}
                     rowKey={r => r.key}
                     size="small"
                     pagination={false}
                     bordered
                     scroll={{ y: 500 }}
                     tableLayout="fixed"
                     className="odontograma-table"
                     locale={{ emptyText: 'No hay daños dibujados en el canvas actualmente. Dibuje daños en el odontograma para verlos aquí.' }}
                   />
                  </div>
                </div>
              </div>
            </div>
      </section>
    );
};

OdontogramClinicalSection.propTypes = {
  patientId: PropTypes.string.isRequired,
  clinicalData: PropTypes.array,
  onDataSave: PropTypes.func,
  versionList: PropTypes.array,
  selectedVersion: PropTypes.string,
  onSelectVersion: PropTypes.func,

  areScriptsReady: PropTypes.bool,
  canvasRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) })
  ]),
};

export default OdontogramClinicalSection;