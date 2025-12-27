import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Table, Modal, message, Tabs } from 'antd';
import { prepareDataSource } from '../utils/odontogram-utils.js';
import { formatDateToDDMMYYYY, getCurrentDateFormatted } from '../../../shared/utils/date-utils.js';
// Eliminados: import { DeleteOutlined, SaveOutlined, RiseOutlined, MedicineBoxOutlined } from '@ant-design/icons';
// import '../../Styles/PatientDetail.css'; // Asumiendo estilos compartidos
import PropTypes from 'prop-types';

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

// Definición inicial de Props (se refinará después)
// interface OdontogramClinicalSectionProps {
//   patientId: string;
//   clinicalData: any[]; // Estado actual del CANVAS
//   onDelete: () => Promise<void>; // Callback para borrar canvas state
//   onDataSave: (savedData: any[]) => void; // Callback para guardar canvas state

//   areScriptsReady: boolean;
//   API_URL: string;
// }

const OdontogramClinicalSection = ({ 
    patientId, 
    clinicalData = [], // Estado actual del CANVAS (snapshot)
    onDelete = () => {}, // Callback al padre para borrar canvas state
    onDataSave = () => {}, // Callback al padre para guardar canvas state

    areScriptsReady = false, // Parámetro por defecto
    canvasRef
}) => {
    
    // ---> LOG PROP RECIBIDA <-----
    // console.log(`[OdontoClinical] Renderizando. Prop clinicalData (Canvas State) RECIBIDA (${Array.isArray(clinicalData) ? clinicalData.length : 'No Array'} items):`, clinicalData);
    // -----------------------------

    // --- Refs ---
    const isMounted = useRef(true); // Para evitar set state en unmounted component

    // --- Estados ---
    // Eliminados: canvasData, detectedDamages, observations, specifications, showAllTeeth, showSpinner
    const [isSaving, setIsSaving] = useState(false);
    const [engineError, setEngineError] = useState(null);
    const [isEngineInitialized, setIsEngineInitialized] = useState(false); // NUEVO ESTADO para habilitar el botón
    const [clinicalHistory, setClinicalHistory] = useState([]); // NUEVO: Estado para el historial clínico
    const [loadingHistory, setLoadingHistory] = useState(false); // NUEVO: Estado de carga del historial
    const [currentCanvasData, setCurrentCanvasData] = useState([]); // NUEVO: Estado para datos actuales del canvas

    // Consolidar refs del motor
    const engineManagerRef = useRef({
        instance: null,
        handlers: null,
        initialized: false
    });

    // Envolver getDamageNameFromIdInternal con useCallback para estabilidad si se pasa como prop o dependencia compleja
    // Si solo se usa internamente en el efecto de saveOdontograma, y este ya depende de engineManagerRef.current.instance,
    // se podría llamar a getDamageNameFromIdInternal directamente dentro del efecto, pasando engineManagerRef.current.instance.
    const getDamageNameFromId = useCallback((damageId) => {
        return getDamageNameFromIdInternal(damageId, engineManagerRef.current.instance);
    }, []); // Dependencia de engineManagerRef.current.instance es implícita, pero useCallback lo memoizará sin ella.
           // Si se quiere re-memoizar cuando el engine cambia, se añadiría engineManagerRef.current.instance a las deps,
           // pero eso es más complejo con refs. Por ahora, se asume que el engine no cambia tan seguido como para necesitarlo.

    // Efecto para manejar isMounted
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // NUEVO: Función para cargar el historial clínico
    const loadClinicalHistory = useCallback(async () => {
        if (!patientId) return;
        
        setLoadingHistory(true);
        try {
            const odontogramaService = await import('../api/odontograma-service.js');
            const history = await odontogramaService.default.getClinicalOdontogramHistory(patientId);
            // Ordenar historial: más recientes primero (descendente por fecha)
            const sortedHistory = Array.isArray(history) ? 
                history.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)) : [];
            setClinicalHistory(sortedHistory);
        } catch (error) {
            console.error('Error al cargar historial clínico:', error);
            setClinicalHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    }, [patientId]);

    // NUEVO: Cargar historial al montar el componente
    useEffect(() => {
        loadClinicalHistory();
    }, [loadClinicalHistory]);

    // --- Funciones ---

    // Nueva función para manejar el borrado del estado clínico con confirmación
    const handleDeleteRequest = useCallback(() => {
        Modal.confirm({
            title: 'Borrar estado actual del odontograma clínico',
            content: 'Esta acción borrará el estado guardado del odontograma clínico actual. El historial de entradas no se verá afectado. Esta acción no se puede deshacer.',
            okText: 'Sí, borrar estado',
            cancelText: 'Cancelar',
            onOk: async () => {
                if (onDelete && typeof onDelete === 'function') {
                    try {
                        await onDelete(); // Llama a la prop pasada por el padre
                        message.info("Estado clínico borrado del servidor.");
                        // Limpiar datos locales del canvas y resetear el motor si está inicializado
                        if (engineManagerRef.current.instance) {
                            engineManagerRef.current.instance.reset(); // Resetea el canvas del motor
                            engineManagerRef.current.instance.update(); // Refresca el canvas
                            console.log("Engine (Clínico) reseteado después de borrar estado.");
                        }
                    } catch (error) {
                        console.error("Error al ejecutar onDelete desde OdontogramClinicalSection:", error);
                        message.error("Hubo un error al intentar borrar el estado clínico.");
                    }
                } else {
                    console.error("La prop onDelete no es una función o no está definida.");
                    message.error("Error interno: no se puede procesar la solicitud de borrado.");
                }
            }
        });
    }, [onDelete, patientId]); // Dependencia de onDelete y patientId

    // Función para guardar el estado actual del canvas clínico
    const triggerSave = useCallback(async () => {
        if (!isEngineInitialized || !engineManagerRef.current.instance) {
            message.warning('El motor del odontograma no está inicializado');
            return;
        }
        
        setIsSaving(true);
        try {
            const engineData = engineManagerRef.current.instance.getData() || [];
            if (!engineData.length) {
                message.info('No hay datos para guardar.');
                return;
            }
            
            // Agregar fecha actual solo a datos nuevos sin fecha
            // Normalizar engineData para asegurar que sea un array
            const normalizedEngineData = Array.isArray(engineData) ? engineData : [];
            const dataWithDates = normalizedEngineData.map(item => ({
                ...item,
                fecha: item.fecha || getCurrentDateFormatted() // Solo asignar fecha si no existe
            }));
            
            if (onDataSave && typeof onDataSave === 'function') {
                await onDataSave(dataWithDates);
                message.success('Odontograma clínico guardado exitosamente');
                await loadClinicalHistory();
            } else {
                console.error('La prop onDataSave no está definida o no es una función');
                message.error('Error interno: no se puede guardar el odontograma');
            }
        } catch (error) {
            console.error('Error al guardar odontograma clínico:', error);
            message.error('Error al guardar el odontograma clínico');
        } finally {
            setIsSaving(false);
        }
    }, [isEngineInitialized, onDataSave, loadClinicalHistory]);

    // Columnas de la tabla - Estado Actual (usa datos directos sin prepareDataSource)
    const odontogramColumns = [
        { title: 'Diente', dataIndex: 'tooth', key: 'tooth', width: 40 },
        { title: 'Daño', dataIndex: 'damage', key: 'damage', width: 100, ellipsis: true },
        { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 60, ellipsis: true },
    ];

    // Columnas para la tabla del historial (usa prepareDataSource)
    const historyColumns = [
        { title: 'Diente', dataIndex: 'diente', key: 'diente', width: 40 },
        { title: 'Daño', dataIndex: 'tipo', key: 'tipo', width: 100, ellipsis: true },
        { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 60 },
    ];

    // Función para obtener el nombre de la superficie (5 superficies básicas)
    const getSurfaceName = (surfaceValue) => {
        const surfaces = {
            '1': 'Vestibular', '2': 'Lingual', '3': 'Mesial', '4': 'Distal', '5': 'Oclusal'
        };
        return surfaces[surfaceValue] || surfaceValue;
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

    // Normaliza los datos para el engine y la tabla. No depende de clinicalData, así evitamos reinstanciar el engine.
    const normalizeForEngine = useCallback(entries => {
        // console.log('[OdontoClinical] normalizeForEngine - entries recibidas:', entries);
        const result = (Array.isArray(entries) ? entries : []).flatMap((e, i) => {
            // console.log(`[OdontoClinical] normalizeForEngine - procesando entrada ${i}:`, e);
            
            // Detectar si los datos vienen del engine (formato simple) o del servidor (formato complejo)
            const isEngineData = e.tooth && !e.engineTeeth;
            
            if (isEngineData) {
                // Datos que vienen directamente del engine - formato simple
                return [{
                    key: `${patientId}-${e.tooth}-${e.damage}-${e.surface || '0'}-${e.fecha || ''}-${i}`,
                    tooth: String(e.tooth),
                    damage: String(e.damage || ''),
                    surface: String(e.surface || '0'),
                    note: String(e.note || ''),
                    fecha: e.fecha || ''
                }];
            } else {
                // Datos que vienen del servidor - formato complejo con engineTeeth
                let engineTeeth = e.engineTeeth;
                if (!engineTeeth || !Array.isArray(engineTeeth) || engineTeeth.length === 0) {
                    if (e.tooth) {
                        engineTeeth = [e.tooth];
                        // console.log(`[OdontoClinical] normalizeForEngine - creando engineTeeth desde tooth: [${e.tooth}]`);
                    } else {
                        console.warn(`[OdontoClinical] normalizeForEngine - entrada ${i} no tiene engineTeeth ni tooth válido, saltando...`);
                        return [];
                    }
                }
                
                // console.log(`[OdontoClinical] normalizeForEngine - engineTeeth final:`, engineTeeth);
                
                return engineTeeth.map(toothNum => ({
                    key: `${patientId}-${toothNum}-${e.damage || e.tipo}-${e.surface || e.superficie || '0'}-${e.fecha || ''}-${i}`,
                    tooth: String(toothNum),
                    damage: String(e.damage || e.tipo),
                    surface: String(e.surface || e.superficie || '0'),
                    note: String(e.note || e.nota || ''),
                    fecha: e.fecha || ''
                }));
            }
        });
        // console.log('[OdontoClinical] normalizeForEngine - resultado final:', result);
        return result;
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
            // console.log('[OdontoClinical] Cargando datos en engine:', engineData);
            if (engineData.length > 0) {
                engine.loadOdontogramaData(engineData);
                // console.log('[OdontoClinical] Datos cargados en engine exitosamente');
            } else {
                // console.log('[OdontoClinical] No hay datos para cargar en el engine');
            }
            engine.start();
            const clickHandler = (e) => engine.onMouseClick(e);
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

    // Efecto para sincronizar el engine con clinicalData
    useEffect(() => {
        const { instance: engine, initialized: engineInitialized } = engineManagerRef.current;
        if (!engineInitialized || !engine || isSaving) {
            return;
        }
        
        const engineData = normalizeForEngine(clinicalData);
        const currentEngineData = engine.getData();
        
        if (JSON.stringify(currentEngineData) !== JSON.stringify(engineData)) {
            engine.processing = true;
            try {
                engine.loadOdontogramaData(engineData);
                engine.update();
            } catch (error) {
                console.error('[OdontoClinical] Error al actualizar engine:', error);
            } finally {
                 engine.processing = false;
            }
        }
    }, [clinicalData, isEngineInitialized, normalizeForEngine]);

    // NUEVO: Efecto para actualizar datos actuales del canvas en tiempo real
    useEffect(() => {
        const { instance: engine, initialized: engineInitialized } = engineManagerRef.current;
        if (!engineInitialized || !engine) {
            setCurrentCanvasData([]);
            return;
        }

        const updateCurrentData = () => {
            try {
                const engineData = engine.getData() || [];
                const normalizedData = normalizeForEngine(engineData);
                
                // Solo actualizar si los datos han cambiado para evitar re-renders innecesios
                setCurrentCanvasData(prevData => {
                    const prevDataStr = JSON.stringify(prevData);
                    const newDataStr = JSON.stringify(normalizedData);
                    
                    if (prevDataStr !== newDataStr) {
                        return normalizedData;
                    }
                    return prevData;
                });
            } catch (error) {
                console.error('[OdontoClinical] Error al obtener datos actuales del canvas:', error);
            }
        };

        // Actualizar inmediatamente
        updateCurrentData();

        // Actualizar cada 1000ms para reflejar cambios en tiempo real (reducido de 500ms para mejor rendimiento)
        const interval = setInterval(updateCurrentData, 1000);

        return () => clearInterval(interval);
     }, [isEngineInitialized, normalizeForEngine]);

    // Listener para el evento unificado 'odontogramSave'
    useEffect(() => {
        // Fallback para evitar que isSaving quede atascado si el usuario cancela el prompt
        let fallbackTimeout = null;
        const handleSaveClinicalData = (event) => {
            clearTimeout(fallbackTimeout);
            const { tipo, patientId: evtId, entries } = event.detail;
            if (tipo !== 'clinico' || evtId !== patientId) return;
            setIsSaving(true);
            try {
                // Usar las entradas normalizadas del evento
                const engineData = entries || engineManagerRef.current.instance?.getUnifiedOdontogramData() || [];
                if (!engineData.length) {
                  message.info('No hay datos para guardar.');
                  setIsSaving(false);
                  return;
                }
                if (onDataSave) onDataSave(engineData);
                message.success('Guardado OK');
            } catch (err) {
                message.error('Error guardando clínico');
            } finally {
                setIsSaving(false);
            }
        };
        document.addEventListener('odontogramSave', handleSaveClinicalData);
        // Fallback: si en 5s no llega el evento, resetea isSaving
        fallbackTimeout = setTimeout(() => {
            if (isSaving) setIsSaving(false);
        }, 5000);
        return () => {
            clearTimeout(fallbackTimeout);
            document.removeEventListener('odontogramSave', handleSaveClinicalData);
        };
    }, [onDataSave, patientId, isSaving]);

    // --- JSX --- 
    // console.log('[OdontoClinical] Antes de RETURN. Estado Canvas (canvasData):', canvasData);
    // console.log('[OdontoClinical] Antes de RETURN. Historial Tabla (clinicalTableHistory):', clinicalTableHistory);
    // Datos del estado actual del canvas (en tiempo real)
    const tableData = useMemo(() => {
        // Usar currentCanvasData si tiene datos, sino usar clinicalData
        const dataToUse = currentCanvasData.length > 0 ? currentCanvasData : clinicalData;
        
        if (!dataToUse || dataToUse.length === 0) {
            return [];
        }
        
        return dataToUse.map((row, index) => {
            const baseDamage = getDamageNameFromIdInternal(row.damage || row.tipo);
            const combinedDamage = combineDamageWithSurface(baseDamage, row.surface);
            
            return {
                key: `current-${index}-${row.tooth}`,
                tooth: row.tooth,
                damage: combinedDamage,
                surface: row.surface,
                note: row.note || '',
                fecha: row.fecha || getCurrentDateFormatted()
            };
        });
    }, [currentCanvasData, clinicalData]);

    // NUEVO: Preparar datos del historial para la tabla
    const historyTableData = useMemo(() => {
        if (!Array.isArray(clinicalHistory) || clinicalHistory.length === 0) {
            return [];
        }
        
        return clinicalHistory.flatMap((historyEntry, historyIndex) => {
            if (!historyEntry.datos || !Array.isArray(historyEntry.datos)) {
                return [];
            }
            
            return historyEntry.datos.map((item, itemIndex) => {
                const baseDamage = getDamageNameFromId(item.damage);
                const combinedDamage = combineDamageWithSurface(baseDamage, item.surface);
                
                return {
                    key: `history-${historyIndex}-${itemIndex}-${item.tooth || 'unknown'}`,
                    tooth: item.tooth || 'N/A',
                    damage: combinedDamage,
                    fecha: historyEntry.fecha ? new Date(historyEntry.fecha).toLocaleDateString('es-ES') : 'N/A'
                };
            });
        });
    }, [clinicalHistory, getDamageNameFromId]);
    return (
        <section className="patient-detail_odontograma">
            <div className="odontograma-section">
              <div className="odontograma-header2">
                <h2>Odontograma Clínico</h2>

              </div>
              <div className="odontograma-wrapper">
                <div className="odontograma-container odontograma-flex-container">
                  <div className="odontograma-canvas-container" style={{ position: 'relative' }}>
                    {engineError && <div className="error-message">{engineError}</div>}
                    <canvas 
                      id="odontograma-canvas-2" 
                      width="1200"
                      height="700"
                      className="odontograma-canvas"
                      ref={canvasRef}
                    />
                    {isSaving && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(255,255,255,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2
                      }}>
                        <span style={{ fontSize: 24, color: '#1890ff' }}>Guardando...</span>
                      </div>
                    )}
                  </div>
                  <div className="odontograma-table-container">
                                        <button
                                            type="button"
                                            className="button-primary odontogram-save-button"
                                            onClick={triggerSave}
                                            disabled={isSaving}
                                        >
                                            {isSaving ? 'Guardando...' : 'Guardar estado'}
                                        </button>
                   
                   <Tabs
                     defaultActiveKey="current"
                     items={[
                       {
                         key: 'current',
                         label: 'Estado Actual',
                         children: (
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
                         )
                       },
                       {
                         key: 'history',
                         label: `Historial (${historyTableData.length})`,
                         children: loadingHistory ? (
                           <div style={{ textAlign: 'center', padding: '20px' }}>
                             <span>Cargando historial...</span>
                           </div>
                         ) : (
                           <Table 
                             columns={historyColumns}
                             dataSource={prepareDataSource(historyTableData, 'clinico-history')}
                             rowKey={r => r.key}
                             size="small"
                             pagination={{ pageSize: 20, showSizeChanger: false }}
                             bordered
                             scroll={{ y: 500 }}
                             tableLayout="fixed"
                             className="odontograma-table"
                             locale={{ emptyText: 'No hay entradas en el historial clínico.' }}
                           />
                         )
                       }
                     ]}
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
  onDelete: PropTypes.func,
  onDataSave: PropTypes.func,
  
  areScriptsReady: PropTypes.bool,
  canvasRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) })
  ]),
};

export default OdontogramClinicalSection;