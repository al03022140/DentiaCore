import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Button, Table, Modal, message, Input } from 'antd';
// Use dynamic import for odontograma service to enable better code-splitting
import { prepareDataSource, arrayContainsElement } from '../utils/odontogram-utils.js';
import { formatDateToDDMMYYYY, getCurrentDateFormatted } from '../../../shared/utils/date-utils.js';
// Asumiremos que los estilos relevantes están en PatientDetail.css por ahora
// import '../../Styles/PatientDetail.css'; 

// Añade estas constantes al tope del archivo
const MAX_IMAGE_FETCH_ATTEMPTS = 5;

// Estado único para el flujo inicial
const ESTADOS = {
  CARGANDO: 'cargando',
  EXISTE: 'existe',
  NO_EXISTE: 'no_existe',
  ERROR: 'error',
  RENDERIZADO: 'renderizado'
};

// Hook personalizado para manejar los event listeners del odontograma
const useOdontogramEvents = (setDetectedDamages) => {
    useEffect(() => {
        // Handler para daños dentales
        const handleDamage = (event) => {
            console.log('[EVENT] toothDamageAdded', event.detail);
            const { toothId, damageObject, surface } = event.detail;
            const damageName = damageObject?.name || damageObject?.value || 'Desconocido';
            // console.log(`🦷 Daño detectado (Inicial): ${toothId} - ${damageName}`);
            
            setDetectedDamages(prev => {
                // Asegurar que prev siempre sea un array
                const safeArray = Array.isArray(prev) ? prev : [];
                
                // Log de depuración
                // console.log('Estado actual de detectedDamages:', safeArray);
                // console.log('¿Es un array?', Array.isArray(safeArray));
                
                // Crear el nuevo elemento
                const newElement = { 
                    diente: toothId || 'N/A', 
                    tipo: damageName || 'Desconocido', 
                    superficie: surface || 'N/A', 
                    fecha: getCurrentDateFormatted() 
                };
                
                // Verificar si el elemento ya existe
                if (arrayContainsElement(safeArray, newElement)) {
                    return safeArray;
                }
                
                // Añadir el nuevo elemento
                return [...safeArray, newElement];
            });
        };
        
        // Handler para superficies dentales
        const handleSurface = (event) => {
            console.log('[EVENT] toothSurfaceChanged', event.detail);
            const { toothId, checkboxId, newState } = event.detail;
            if (newState > 0) {
                const surfaceName = checkboxId ? checkboxId.split('_')[1] : 'desconocida';
                // console.log(`🦷 Superficie detectada (Inicial): ${toothId} - ${surfaceName}`);
                
                setDetectedDamages(prev => {
                    // Asegurar que prev siempre sea un array
                    const safeArray = Array.isArray(prev) ? prev : [];
                    
                    // Log de depuración
                    // console.log('Estado actual de detectedDamages (superficie):', safeArray);
                    // console.log('¿Es un array?', Array.isArray(safeArray));
                    
                    // Crear el nuevo elemento
                    const newElement = { 
                        diente: toothId || 'N/A', 
                        tipo: `Superficie ${surfaceName}` || 'Superficie', 
                        superficie: surfaceName || 'N/A', 
                        fecha: getCurrentDateFormatted() 
                    };
                    
                    // Verificar si el elemento ya existe
                    if (arrayContainsElement(safeArray, newElement)) {
                        return safeArray;
                    }
                    
                    // Añadir el nuevo elemento
                    return [...safeArray, newElement];
                });
            }
        };

        // Registrar event listeners
        document.addEventListener('toothDamageAdded', handleDamage);
        document.addEventListener('toothSurfaceChanged', handleSurface);
        
        // Cleanup function
        return () => {
            document.removeEventListener('toothDamageAdded', handleDamage);
            document.removeEventListener('toothSurfaceChanged', handleSurface);
        };
    }, [setDetectedDamages]); // Solo se vuelve a crear si cambia setDetectedDamages
};

// Componente memoizado para la tabla principal
const OdontogramTable = React.memo(({ 
    columns, 
    dataSource = [],
    scroll = { y: 600, x: 180 }
}) => {
    return (
        <Table 
            columns={columns} 
            dataSource={prepareDataSource(dataSource, 'inicial')}
            size="small" 
            pagination={false}
            bordered
            scroll={scroll}
             tableLayout="fixed"
            className="odontograma-table"
        />
    );
});

// Componente memoizado para el canvas del odontograma
const OdontogramCanvas = React.memo(({ 
    canvasRef, 
    showSpinner = false,
    engineError = null,
    onRetry = null
}) => {
    return (
        <div className="odontograma-canvas-container">
            {showSpinner && (
                <>
                    <div className="loading-overlay"></div>
                    <div className="loading-spinner">
                        <p>Guardando...</p>
                    </div>
                </>
            )}
            {engineError && (
                <div className="error-container">
                    <div className="error-message">{engineError}</div>
                    {onRetry && (
                        <Button 
                            type="primary" 
                            onClick={onRetry} 
                            className="retry-button"
                            icon={<span role="img" aria-label="reintentar">🔄</span>}
                        >
                            Reintentar inicialización
                        </Button>
                    )}
                </div>
            )}
            <canvas 
                ref={canvasRef} 
                id="odontograma-canvas" 
                width="1200" 
                height="700" 
                className="odontograma-canvas"
                aria-label="Canvas de odontograma inicial"
            />
        </div>
    );
});

// Componente memoizado para la imagen del odontograma
const OdontogramImage = React.memo(({ 
    imageUrl,
    formatImageUrl,
    onImageLoadFailed,
    maxAttempts = MAX_IMAGE_FETCH_ATTEMPTS
}) => {
    const imageLoadAttemptsRef = useRef(0);
    const timeoutIdRef = useRef(null); // Ref para el ID del timeout
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const currentImageUrl = formatImageUrl(imageUrl);

    useEffect(() => {
        // Resetear estados cuando cambia la URL
        setImageLoading(true);
        setImageError(false);
        imageLoadAttemptsRef.current = 0;
        
        // Limpiar el timeout cuando el componente se desmonte o la URL cambie
        return () => {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
            }
        };
    }, [currentImageUrl]); // Dependencia en currentImageUrl para reiniciar si la imagen cambia

    return (
        <div className="odontograma-image-container">
            <h4>Odontograma Inicial Guardado</h4>
            {imageLoading && !imageError && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p>Cargando imagen del odontograma...</p>
                </div>
            )}
            {imageError && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#ff4d4f' }}>
                    <p>⚠️ No se pudo cargar la imagen del odontograma</p>
                </div>
            )}
            <img 
                key={currentImageUrl} 
                src={currentImageUrl}
                alt="Odontograma Inicial Guardado"
                className="odontograma-image"
                style={{ display: imageLoading || imageError ? 'none' : 'block' }}
                onLoad={() => {
                    console.log('✅ Imagen del odontograma cargada exitosamente');
                    imageLoadAttemptsRef.current = 0; 
                    setImageLoading(false);
                    setImageError(false);
                    if (timeoutIdRef.current) { // Limpiar si carga antes del timeout
                        clearTimeout(timeoutIdRef.current);
                        timeoutIdRef.current = null;
                    }
                }}
                onError={(e) => {
                    if (timeoutIdRef.current) { // Limpiar timeout anterior si existe
                        clearTimeout(timeoutIdRef.current);
                    }
                    imageLoadAttemptsRef.current += 1;
                    console.error(`❌ Error al cargar imagen del odontograma (intento ${imageLoadAttemptsRef.current}/${maxAttempts})`);
                    
                    if (imageLoadAttemptsRef.current >= maxAttempts) {
                        console.error('❌ Máximo de intentos alcanzado, mostrando error');
                        setImageLoading(false);
                        setImageError(true);
                        onImageLoadFailed();
                        if (e.currentTarget) {
                            e.currentTarget.style.display = 'none'; 
                            e.currentTarget.onerror = null;
                        }
                    } else {
                        const newTimestamp = Date.now();
                        try {
                            const currentSrc = e.currentTarget.src;
                            const url = new URL(currentSrc);
                            url.searchParams.set('t', newTimestamp);
                            const nextUrl = url.toString();
                            
                            console.log(`🔄 Reintentando carga de imagen en ${imageLoadAttemptsRef.current} segundos...`);
                            timeoutIdRef.current = setTimeout(() => {
                                if (e.currentTarget && currentImageUrl && 
                                    e.currentTarget.src.startsWith(currentImageUrl.split('?')[0])) {
                                    e.currentTarget.src = nextUrl;
                                }
                                timeoutIdRef.current = null; // Resetear ref después de que el timeout se ejecute
                            }, 1000 * imageLoadAttemptsRef.current);
                        } catch(urlError) {
                            console.error("Error procesando URL para reintento:", urlError);
                            setImageLoading(false);
                            setImageError(true);
                            onImageLoadFailed();
                        }
                    }
                }}
            />
        </div>
    );
});

const OdontogramInitialSection = ({
    canvasRef,
    patientId, 
    initialTableData = [],
    initialImageUrl = null,
    showInitialOdontogramImage = false,
    setShowInitialOdontogramImage,
    onDelete,
    onSaveSuccess,

    areScriptsReady = false,
    formatImageUrl = (url) => url,
    onRetryImageLoad = () => {},
}) => {

    // --- Refs ---
    const imageLoadAttemptsRef = useRef(0); 
    // Consolidar refs del motor
    const engineManagerRef = useRef({
        instance: null,
        handlers: null,
        initialized: false
    });
    // Nuevo ref para evitar doble inicialización en StrictMode
    const didInitRef = useRef(false);
    
    // --- Estados ---
    const [initialOdontogramData, setInitialOdontogramData] = useState(initialTableData);
    const [currentImageUrl, setCurrentImageUrl] = useState(initialImageUrl ? formatImageUrl(initialImageUrl) : ''); 
    const [initialImageLoadFailed, setInitialImageLoadFailed] = useState(false);
    const [showSpinner, setShowSpinner] = useState(false);
    const [isSaving, setIsSaving] = useState(false); 
    const [engineError, setEngineError] = useState(null);
    const [initialized, setInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false); 
    const [showAllTeeth, setShowAllTeeth] = useState(false);
    const [detectedDamages, setDetectedDamages] = useState([]);
    const [advertencias, setAdvertencias] = useState([]);
    const [verificacionDetalle, setVerificacionDetalle] = useState(null);
    const [mostrarDetalleVerificacion, setMostrarDetalleVerificacion] = useState(false);
    // Estado único para el flujo inicial
    const [estadoInicial, setEstadoInicial] = useState(ESTADOS.CARGANDO);
    const [tries, setTries] = useState(0);
    const MAX_TRIES = 5;
    
    // Estados para el modal de confirmación
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmationText, setConfirmationText] = useState('');
    const [isConfirmationValid, setIsConfirmationValid] = useState(false);

  // Lazy-load service when needed
  const getOdontogramaService = useCallback(async () => {
    const mod = await import('../api/odontograma-service.js');
    return mod.default || mod;
  }, []);
    
    // Validar texto de confirmación
    useEffect(() => {
        setIsConfirmationValid(confirmationText.trim().toLowerCase() === 'confirmar');
    }, [confirmationText]);
    
    // Usar nuestro hook personalizado
    useOdontogramEvents(setDetectedDamages);

    // Añade este efecto reactivo mejorado para manejar recargas rápidas:
    useEffect(() => {
      console.log('🔍 [Estado Check] areScriptsReady:', areScriptsReady, 'showInitialOdontogramImage:', showInitialOdontogramImage, 'initialImageUrl:', initialImageUrl);
      
      if (!areScriptsReady) {
        console.log('⏳ Scripts aún no listos, manteniendo estado CARGANDO');
        setEstadoInicial(ESTADOS.CARGANDO);
        return;
      }
      
      // Si showInitialOdontogramImage es true, debemos mostrar la imagen (cuando esté disponible)
      if (showInitialOdontogramImage) {
        if (initialImageUrl) {
          console.log('✅ Imagen disponible, estableciendo estado EXISTE');
          setEstadoInicial(ESTADOS.EXISTE);
          setCurrentImageUrl(initialImageUrl);
          setInitialOdontogramData(initialTableData);
          // Resetear el flag para evitar inicialización del canvas
          didInitRef.current = false;
        } else {
          // showInitialOdontogramImage es true pero no hay URL aún - esperar
          console.log('⏳ Esperando URL de imagen...');
          setEstadoInicial(ESTADOS.CARGANDO);
        }
      } else {
        // No hay imagen guardada, mostrar canvas
        console.log('📝 No hay imagen guardada, estableciendo estado NO_EXISTE');
        setEstadoInicial(ESTADOS.NO_EXISTE);
        setCurrentImageUrl('');
        setInitialOdontogramData([]);
        // Resetear el flag para permitir inicialización del canvas
        didInitRef.current = false;
      }
    }, [initialImageUrl, initialTableData, areScriptsReady, patientId, showInitialOdontogramImage]);

    // Efecto para controlar la visibilidad de todos los dientes en el engine
    useEffect(() => {
        // Solo actualizar si el engine está completamente inicializado y no estamos en proceso de inicialización
        if (engineManagerRef.current.instance && 
            typeof engineManagerRef.current.instance.setShowAllTeeth === 'function' &&
            !isInitializing && 
            estadoInicial === ESTADOS.RENDERIZADO) {
            
            // Usar un pequeño debounce para evitar múltiples actualizaciones rápidas
            const timeoutId = setTimeout(() => {
                if (engineManagerRef.current.instance) {
                    engineManagerRef.current.instance.setShowAllTeeth(showAllTeeth);
                    // Usar requestAnimationFrame para evitar renders excesivos
                    requestAnimationFrame(() => {
                        if (engineManagerRef.current.instance) {
                            if (typeof engineManagerRef.current.instance.update === 'function') {
                                engineManagerRef.current.instance.update();
                            } else if (typeof engineManagerRef.current.instance.refresh === 'function') {
                                engineManagerRef.current.instance.refresh();
                            }
                        }
                    });
                }
            }, 100);
            
            return () => clearTimeout(timeoutId);
        }
    }, [showAllTeeth, isInitializing, estadoInicial]); // Agregamos dependencias de estado

    // Función para obtener el nombre del daño igual que en la sección clínica
    const getDamageName = (damageId) => {
      // Si tienes una función utilitaria global/importada, úsala aquí
      // Por ejemplo: return engineManagerRef.current.instance.constants.getDamageNameById(damageId);
      // Si no existe, puedes replicar la lógica de la sección clínica aquí:
      if (
        engineManagerRef.current &&
        engineManagerRef.current.instance &&
        engineManagerRef.current.instance.constants &&
        typeof engineManagerRef.current.instance.constants.getDamageNameById === 'function'
      ) {
        return engineManagerRef.current.instance.constants.getDamageNameById(damageId);
      }
      // Fallback: intenta con el diccionario anterior
      const dic = {
        1: 'Caries',
        2: 'Corona defectuosa',
        3: 'Corona temporal',
        4: 'Extracción',
        5: 'Fractura',
        6: 'Implante',
        7: 'Restauración',
        8: 'Diastema',
        9: 'Extrusión',
        11: 'Empaste',
        12: 'Prótesis removible',
        13: 'Migración',
        14: 'Rotación',
        15: 'Fusión',
        16: 'Remanente radicular',
        17: 'Macrodoncia',
        18: 'Microdoncia',
        19: 'Impactado',
        20: 'Intrusión',
        21: 'Ectópico',
        22: 'Discrómico',
        23: 'Endodoncia',
        24: 'No erupcionado',
        25: 'Transposición',
        27: 'Supernumerario',
        28: 'Pulpar',
        29: 'Carilla',
        30: 'Poste',
        31: 'Edentulismo',
        32: 'Ortodoncia fija',
        34: 'Prótesis fija',
        37: 'Desgastado',
        38: 'Semi-impactado',
        // ... añade todos los que tu backend acepte
      };
      const key = typeof damageId === 'string' ? parseInt(damageId, 10) : damageId;
      return dic[key] || `Desconocido_${damageId}`;
    };

    // Efecto de inicialización del engine: aborta si ya hay imagen o initialExists
    useEffect(() => {
      // Proteger inicialización con didInitRef
      if (didInitRef.current) {
        console.log('⚠️ Ya se intentó inicializar (didInitRef.current = true), saltando...');
        return;
      }
      if (initialImageLoadFailed) {
        console.log('⚠️ Carga de imagen falló previamente, saltando inicialización...');
        return;
      }
      if (!areScriptsReady) {
        console.log('⚠️ Scripts no listos, saltando inicialización...');
        return;
      }
      if (estadoInicial === ESTADOS.EXISTE || estadoInicial === ESTADOS.CARGANDO) {
        console.log('⚠️ Estado es EXISTE o CARGANDO, saltando inicialización del canvas. Estado:', estadoInicial);
        return; // No inicializar si ya existe imagen o aún está cargando
      }
      if (showInitialOdontogramImage) {
        console.log('⚠️ showInitialOdontogramImage es true, esperando imagen en lugar de inicializar canvas');
        return; // No inicializar si se espera una imagen
      }
      
      // Verificar que el canvas esté disponible antes de iniciar
      if (!canvasRef || !canvasRef.current) {
        console.log("⏳ Canvas aún no disponible, esperando...");
        // Esperar a que el canvas esté disponible con un intervalo
        const canvasCheckInterval = setInterval(() => {
          if (canvasRef && canvasRef.current) {
            console.log("✅ Canvas disponible, procediendo con la inicialización");
            clearInterval(canvasCheckInterval);
            // Marcar que estamos iniciando la inicialización
            didInitRef.current = true;
            // Iniciar la inicialización después de un pequeño retraso para asegurar que todo esté listo
            setTimeout(() => {
              console.log("🔄 Iniciando inicialización del odontograma con retraso controlado");
              console.log('🔍 [DEBUG] Antes de setIsInitializing(true) - isInitializing:', isInitializing, 'initialized:', initialized);
              console.log('🔍 [DEBUG] didInitRef.current:', didInitRef.current);
              setIsInitializing(true);
              console.log('🔍 [DEBUG] setIsInitializing(true) ejecutado');
              // La lógica de inicialización se ejecutará en el otro useEffect que observa isInitializing
            }, 500); // Pequeño retraso para asegurar que los scripts estén completamente cargados
          }
        }, 200); // Verificar cada 200ms
        
        // Limpieza del intervalo si el componente se desmonta
        return () => {
          clearInterval(canvasCheckInterval);
        };
      } else {
        // Canvas ya disponible, proceder directamente
        console.log("✅ Canvas ya disponible, procediendo con la inicialización");
        didInitRef.current = true;
        // Iniciar la inicialización después de un pequeño retraso para asegurar que todo esté listo
        const initTimer = setTimeout(() => {
          console.log("🔄 Iniciando inicialización del odontograma con retraso controlado");
          console.log('🔍 [DEBUG] Antes de setIsInitializing(true) - isInitializing:', isInitializing, 'initialized:', initialized);
          console.log('🔍 [DEBUG] didInitRef.current:', didInitRef.current);
          setIsInitializing(true);
          console.log('🔍 [DEBUG] setIsInitializing(true) ejecutado');
          // La lógica de inicialización se ejecutará en el otro useEffect que observa isInitializing
        }, 500); // Pequeño retraso para asegurar que los scripts estén completamente cargados
        
        return () => {
          clearTimeout(initTimer);
        };
      }
    }, [
      areScriptsReady,
      patientId,
      initialImageLoadFailed,
      estadoInicial,
      canvasRef,
      showInitialOdontogramImage
    ]); // Removemos initialTableData de las dependencias y agregamos showInitialOdontogramImage
    
    // Efecto separado para manejar la inicialización cuando isInitializing cambia a true
     useEffect(() => {
       console.log('🔍 [DEBUG] useEffect de inicialización ejecutado');
       console.log('🔍 [DEBUG] isInitializing:', isInitializing);
       console.log('🔍 [DEBUG] areScriptsReady:', areScriptsReady);
       console.log('🔍 [DEBUG] initialImageLoadFailed:', initialImageLoadFailed);
       
       if (!isInitializing || !areScriptsReady || initialImageLoadFailed) {
         console.log('🔍 [DEBUG] Condiciones no cumplidas, saliendo del useEffect');
         return;
       }
       
       console.log("🚀 Ejecutando lógica de inicialización del odontograma");
       
       const initializeOdontogram = async () => {
         let engine;
         let initializationTimeout;
         let retryCount = 0;
         const maxRetries = 3;
         
         const attemptInitialization = async () => {
           try {
             console.log(`🔄 Intento de inicialización ${retryCount + 1}/${maxRetries + 1}`);
             
             // Verificar primero si el canvas está disponible
             if (!canvasRef || !canvasRef.current) {
               console.warn("⚠️ Canvas no disponible durante el intento de inicialización");
               // Esperar a que el canvas esté disponible con un timeout más corto
               if (retryCount < maxRetries) {
                 retryCount++;
                 console.log(`🔄 Canvas no disponible. Reintentando en 1 segundo (${retryCount}/${maxRetries})...`);
                 setTimeout(attemptInitialization, 1000); // Reintentar después de 1 segundo
                 return; // Salir de la función actual
               } else {
                 throw new Error('Canvas no disponible después de varios intentos');
               }
             }
             
             console.log(`⏱️ Iniciando timeout de 30 segundos para intento ${retryCount + 1}`);
             // Timeout de seguridad para evitar bloqueos
             initializationTimeout = setTimeout(() => {
               console.error("⏰ Timeout: La inicialización del engine tardó más de 30 segundos");
               console.log("🔍 Estado actual - retryCount:", retryCount, "maxRetries:", maxRetries);
               if (retryCount < maxRetries) {
                 retryCount++;
                 console.log(`🔄 Timeout alcanzado, reintentando (${retryCount}/${maxRetries})...`);
                 setTimeout(attemptInitialization, 2000); // Reintentar después de 2 segundos
               } else {
                 console.error("❌ Timeout final alcanzado, mostrando error al usuario");
                 setEngineError('La inicialización del odontograma tardó demasiado. Intenta recargar la página.');
                 setIsInitializing(false);
                 didInitRef.current = false;
               }
             }, 30000); // Aumentado a 30 segundos

             if (!window.Engine) {
               throw new Error('Engine no está definido globalmente');
             }
             
             console.log("🔧 Creando nueva instancia de Engine...");
             engine = new window.Engine({ 
               CONSTANTS: window.Constants ? new window.Constants() : null,
               patientId 
             });

             if (!engine || typeof engine.init !== 'function') {
               throw new Error('Fallo al instanciar Engine');
             }

             // Verificación adicional del canvas
             if (!canvasRef.current) {
               throw new Error('Referencia del canvas no disponible');
             }

             console.log("⚙️ Configurando canvas e inicializando engine...");
             engine.setCanvas(canvasRef.current);
             engine.tipo = 'inicial';
             console.log("🔧 Tipo de odontograma configurado explícitamente como:", engine.tipo);
             
             console.log("⏳ Iniciando engine.init()...");
             const initStartTime = Date.now();
             engine.init();
             console.log(`✅ engine.init() completado en ${Date.now() - initStartTime}ms`);
             
             // Cancelar el timeout tan pronto como engine.init() sea exitoso
             console.log(`✅ Cancelando timeout - inicialización exitosa en intento ${retryCount + 1}`);
             clearTimeout(initializationTimeout);

             // Configurar botones
             if (engine.buttons) {
               console.log("🔘 Configurando botones del engine...");
               engine.buttons.forEach((button) => {
                 if (button?.textBox?.text === "Guardar") {
                   button.active = false;
                   button.rect.x = -1000;
                   if (button.textBox) button.textBox.rect.x = -1000;
                 }
               });
             }

             // Cargar datos existentes si los hay
             if (Array.isArray(initialTableData) && initialTableData.length > 0) {
               console.log("📊 Cargando datos existentes del odontograma inicial...");
               const processedData = prepareDataSource(initialTableData);
               if (typeof engine.loadData === 'function') {
                 engine.loadData(processedData);
               }
             }

             // Configurar event listeners
             const clickHandler = (event) => {
               if (engine && typeof engine.onMouseClick === 'function') {
                 engine.onMouseClick(event);
               }
             };
             const moveHandler = (event) => {
               if (engine && typeof engine.onMouseMove === 'function') {
                 engine.onMouseMove(event);
               }
             };

             const currentCanvas = canvasRef.current;

             currentCanvas.addEventListener('click', clickHandler);
             currentCanvas.addEventListener('mousemove', moveHandler);

             // Guardar referencias ANTES de continuar
             engineManagerRef.current = {
               instance: engine,
               handlers: { click: clickHandler, move: moveHandler },
               initialized: true
             };

             // Iniciar el engine
             if (typeof engine.start === 'function') {
               console.log("▶️ Iniciando engine...");
               engine.start();
             }

             console.log("✅ Inicialización del odontograma completada exitosamente");
             console.log('🔍 [DEBUG] Estableciendo estados después de inicialización exitosa');
             
             // Usar setTimeout para asegurar que los estados se actualicen correctamente
             setTimeout(() => {
               console.log('🔍 [DEBUG] Estableciendo estados finales de inicialización');
               console.log('🔍 [DEBUG] Antes - isInitializing:', isInitializing, 'initialized:', initialized);
               
               setInitialized(true);
               setIsInitializing(false);
               setEngineError(null);
               setEstadoInicial(ESTADOS.RENDERIZADO); // Ocultar el loader
               
               console.log('🔍 [DEBUG] Estados establecidos - isInitializing: false, initialized: true');
               console.log('🔍 [DEBUG] estadoInicial establecido a RENDERIZADO:', ESTADOS.RENDERIZADO);
               
               // Verificar que los estados se hayan establecido correctamente
               setTimeout(() => {
                 console.log('🔍 [DEBUG] Verificación post-establecimiento:');
                 console.log('🔍 [DEBUG] isInitializing actual:', isInitializing);
                 console.log('🔍 [DEBUG] initialized actual:', initialized);
                 console.log('🔍 [DEBUG] engineManagerRef.current.initialized:', engineManagerRef.current?.initialized);
               }, 50);
             }, 100); // Pequeño delay para asegurar la actualización de estados

             // Función de limpieza para eliminar los listeners
             const cleanup = () => {
                 if (currentCanvas) {
                     currentCanvas.removeEventListener('click', clickHandler);
                     currentCanvas.removeEventListener('mousemove', moveHandler);
                 }
             };
             
             // Guardar la función de limpieza en el engineManager para uso posterior
             if (engineManagerRef.current) {
               engineManagerRef.current.cleanup = cleanup;
             }
             
           } catch (error) {
             console.error(`❌ Error en intento ${retryCount + 1}:`, error);
             clearTimeout(initializationTimeout);
             
             // Determinar el tipo de error para personalizar el mensaje y el tiempo de espera
             const errorType = error.message.includes('canvas') ? 'canvas' : 
                              error.message.includes('Engine') ? 'engine' : 'general';
             
             // Personalizar el tiempo de espera según el tipo de error
             const retryDelay = errorType === 'canvas' ? 1000 : 
                               errorType === 'engine' ? 2000 : 3000;
             
             if (retryCount < maxRetries) {
               retryCount++;
               const errorTypeText = errorType === 'canvas' ? 'problema con el canvas' : 
                                    errorType === 'engine' ? 'problema con el motor del odontograma' : 
                                    'error general';
               
               console.log(`🔄 Reintentando inicialización en ${retryDelay/1000} segundos (${retryCount}/${maxRetries}) - Tipo: ${errorTypeText}`);
               setTimeout(attemptInitialization, retryDelay);
             } else {
               console.error("❌ Todos los intentos de inicialización fallaron");
               
               // Mensaje de error más descriptivo según el tipo de error
               let errorMessage = '';
               if (errorType === 'canvas') {
                 errorMessage = `No se pudo acceder al canvas del odontograma: ${error.message}. `;
                 errorMessage += 'Intenta recargar la página o revisar si hay errores en la consola del navegador.';
               } else if (errorType === 'engine') {
                 errorMessage = `Error en el motor del odontograma: ${error.message}. `;
                 errorMessage += 'Verifica que todos los scripts se hayan cargado correctamente.';
               } else {
                 errorMessage = `Error al inicializar el odontograma: ${error.message}. `;
                 errorMessage += 'Intenta recargar la página.';
               }
               
               console.log('🔍 [DEBUG] Estableciendo estados después de fallo final');
               console.log('🔍 [DEBUG] Antes del fallo - isInitializing:', isInitializing, 'initialized:', initialized);
               
               setEngineError(errorMessage);
               setIsInitializing(false);
               setInitialized(false);
               didInitRef.current = false;
               
               console.log('🔍 [DEBUG] Estados establecidos después de fallo - isInitializing: false, initialized: false');
               console.log('🔍 [DEBUG] didInitRef.current reseteado a false');
               
               // Verificar que los estados se hayan establecido correctamente
               setTimeout(() => {
                 console.log('🔍 [DEBUG] Verificación post-fallo:');
                 console.log('🔍 [DEBUG] isInitializing actual:', isInitializing);
                 console.log('🔍 [DEBUG] initialized actual:', initialized);
                 console.log('🔍 [DEBUG] engineError actual:', engineError);
               }, 50);
             }
           }
         };
         
         // Iniciar el primer intento
         attemptInitialization();
       };
       
       // Ejecutar la inicialización
       initializeOdontogram();
       
     }, [areScriptsReady, initialImageLoadFailed, patientId, canvasRef]); // Removemos isInitializing de las dependencias para evitar bucles

    useEffect(() => {
      const handler = async (e) => {
        if (e.detail.tipo === 'inicial' && e.detail.patientId === patientId) {
          let entries = [];
          let blob = null;
          try {
            setIsSaving(true);
            setShowSpinner(true);
            setEngineError(null);
            
            // Si el evento contiene imageData (desde saveOdontogramaInicial), usarlo directamente
             if (e.detail.imageData) {
               // Convertir imageData (base64) a blob sin usar fetch para evitar CSP
               const base64Data = e.detail.imageData.split(',')[1]; // Remover el prefijo data:image/png;base64,
               
               const byteCharacters = atob(base64Data);
               const byteNumbers = new Array(byteCharacters.length);
               for (let i = 0; i < byteCharacters.length; i++) {
                 byteNumbers[i] = byteCharacters.charCodeAt(i);
               }
               const byteArray = new Uint8Array(byteNumbers);
               const blobData = new Blob([byteArray], { type: 'image/png' });
               blob = new File([blobData], `odontograma_${Date.now()}.png`, { type: 'image/png' });
              
              // Procesar datos del engine - usar entries en lugar de data
              const raw = e.detail.entries || e.detail.data;
              
              // Normalizar raw para asegurar que sea un array
              const normalizedRaw = Array.isArray(raw) ? raw : [];
              
              entries = normalizedRaw.map((item) => {
                const damageName = getDamageName(item.damage);
                
                const entry = {
                  tooth: String(item.tooth),
                  damage: damageName.startsWith('Desconocido_') ? String(item.damage) : damageName,
                  diagnostic: item.diagnostic || '',
                  surface: item.surface || 'O',
                  note: item.note || '',
                  date: item.fecha || item.date || getCurrentDateFormatted()
                };
                return entry;
              }).filter(entry => entry.tooth && entry.damage);
            } else {
              // Método anterior usando canvas.toBlob - usar entries en lugar de data
              const raw = e.detail.entries || e.detail.data;
              
              // Normalizar raw para asegurar que sea un array
              const normalizedRaw = Array.isArray(raw) ? raw : [];
              
              entries = normalizedRaw.map((item) => {
                 const damageName = getDamageName(item.damage);
                 
                 const entry = {
                   tooth: String(item.tooth),
                   damage: damageName.startsWith('Desconocido_') ? String(item.damage) : damageName,
                   diagnostic: item.diagnostic || '',
                   surface: item.surface || 'O',
                   note: item.note || '',
                   date: item.fecha || item.date || getCurrentDateFormatted()
                 };
                 return entry;
               }).filter(entry => entry.tooth && entry.damage);
               
              // canvas.toBlob → blob/png
              const canvas = canvasRef.current;
              if (!canvas) throw new Error('Referencia del canvas no encontrada.');
              
              blob = await new Promise((resolve, reject) => {
                try {
                  canvas.toBlob(b => {
                    if (b) {
                      const file = new File([b], `odontograma_${Date.now()}.png`, { type: 'image/png' });
                      resolve(file);
                    } else {
                      reject(new Error('No se pudo extraer blob del canvas.'));
                    }
                  }, 'image/png');
                } catch (error) {
                  reject(error);
                }
              });
            }
             
             // Asegurar que siempre haya al menos una entry
             if (entries.length === 0) {
               entries = [{
                 tooth: '11',
                 damage: 'Sano',
                 diagnostic: '',
                 surface: 'O',
                 note: 'Odontograma inicial sin daños registrados',
                 date: getCurrentDateFormatted()
               }];
             }
            
            // FormData
            const form = new FormData();
            form.append('odontograma', blob);
            form.append('entries', JSON.stringify(entries));
            
            // POST
            let respuestaServidor;
            const service = await getOdontogramaService();
            if (service && typeof service.saveInitialOdontogram === 'function') {
              respuestaServidor = await service.saveInitialOdontogram(patientId, form);
            } else {
              throw new Error('Servicio de guardado de odontograma no disponible.');
            }
            const { exists, imageUrl: receivedImageUrl, datos, history: receivedHistory } = respuestaServidor;
            if (!exists || !receivedImageUrl || !Array.isArray(datos) || !Array.isArray(receivedHistory)) {
              throw new Error('Respuesta incompleta o inválida del servidor.');
            }
            setCurrentImageUrl(formatImageUrl(receivedImageUrl));
            setInitialOdontogramData(datos); 
            message.success('Odontograma inicial guardado.');
            if (onSaveSuccess) onSaveSuccess(receivedImageUrl, datos, receivedHistory);
          } catch (err) {
            console.error('Error guardando odontograma inicial:', err);
            if (err.response?.data?.error?.details) {
              console.error('Detalles de validación:', err.response.data.error.details);
            }
            const msg =
              err.response?.data?.error?.message ||
              err.message ||
              'Error desconocido.';
            message.error(`No se pudo guardar: ${msg}`);
          } finally {
            setIsSaving(false);
            setShowSpinner(false);
          }
        }
      };
      
      // Escuchar el evento unificado 'odontogramSave'
      document.addEventListener('odontogramSave', handler);
      
      return () => {
        document.removeEventListener('odontogramSave', handler);
      };
  }, [patientId, canvasRef, formatImageUrl, onSaveSuccess, getOdontogramaService]);

    // Handler para reintentar inicialización
    const handleRetryInitialization = useCallback(() => {
        console.log("🔄 Reinicio manual solicitado por el usuario");
        console.log('🔍 [DEBUG] Estado antes del reinicio:');
        console.log('🔍 [DEBUG] isInitializing:', isInitializing);
        console.log('🔍 [DEBUG] initialized:', initialized);
        console.log('🔍 [DEBUG] didInitRef.current:', didInitRef.current);
        console.log('🔍 [DEBUG] engineManagerRef.current:', engineManagerRef.current);
        
        // Limpiar estados de error
        setEngineError(null);
        // Resetear flags de inicialización
        didInitRef.current = false;
        setIsInitializing(false);
        setInitialized(false);
        
        console.log('🔍 [DEBUG] Estados reseteados');
        
        // Limpiar cualquier instancia previa del engine
        if (engineManagerRef.current && engineManagerRef.current.instance) {
            try {
                console.log('🧹 Limpiando instancia previa del engine');
                if (typeof engineManagerRef.current.instance.cleanup === 'function') {
                    engineManagerRef.current.instance.cleanup();
                } else if (typeof engineManagerRef.current.cleanup === 'function') {
                    engineManagerRef.current.cleanup();
                } else {
                    engineManagerRef.current.instance.stop = true;
                }
                
                if (canvasRef.current && engineManagerRef.current.handlers) {
                    canvasRef.current.removeEventListener('click', engineManagerRef.current.handlers.click);
                    canvasRef.current.removeEventListener('mousemove', engineManagerRef.current.handlers.move);
                }
            } catch (e) {
                console.error("Error al limpiar instancia previa:", e);
            }
        }
        
        // Resetear el estado del engine manager
        engineManagerRef.current = { instance: null, handlers: null, initialized: false };
        console.log('🔍 [DEBUG] engineManagerRef reseteado');
        
        // Iniciar el proceso de inicialización nuevamente con un pequeño retraso
        setTimeout(() => {
            console.log('🔍 [DEBUG] Estableciendo isInitializing a true después del retraso');
            setIsInitializing(true);
        }, 500);
        
        // Mostrar mensaje al usuario
        message.info('Reiniciando odontograma...');
    }, [isInitializing, initialized]);

    // Función para manejar la confirmación y proceder con el guardado
    const handleConfirmSave = useCallback(async () => {
      try {
        setIsSaving(true);
        setShowConfirmModal(false);
        setConfirmationText('');
        

        
        // Verificar que el engine esté completamente inicializado
        if (!initialized || !engineManagerRef.current?.initialized) {
          // Esperar hasta 10 segundos para que termine la inicialización
          let attempts = 0;
          const maxAttempts = 100; // 10 segundos (100 * 100ms)
          
          while ((!initialized || !engineManagerRef.current?.initialized) && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          // Verificar nuevamente después de la espera
          if (!initialized || !engineManagerRef.current?.initialized) {
            throw new Error('El odontograma aún no está completamente inicializado. Por favor, espera un momento e intenta nuevamente.');
          }
        }
        
        // Verificaciones del estado del engine
        if (!engineManagerRef.current) {
          handleRetryInitialization();
          throw new Error('El gestor del Engine no está inicializado. Se ha iniciado la reinicialización automática.');
        }
        
        if (!engineManagerRef.current.instance) {
          handleRetryInitialization();
          throw new Error('La instancia del Engine no está disponible. Se ha iniciado la reinicialización automática.');
        }
        
        if (!engineManagerRef.current.initialized) {
          handleRetryInitialization();
          throw new Error('El Engine no ha completado su inicialización. Se ha iniciado la reinicialización automática.');
        }
        
        const engine = engineManagerRef.current.instance;
        
        // Verificar que el engine tenga los métodos necesarios
        if (typeof engine.dispatchSaveEvent !== 'function') {
          handleRetryInitialization();
          throw new Error('El método dispatchSaveEvent no está disponible. Se ha iniciado la reinicialización automática.');
        }
        
        // Verificar que el canvas esté disponible
        if (!canvasRef.current) {
          throw new Error('El canvas del odontograma no está disponible.');
        }
        
        // Verificar que el engine esté completamente funcional
        if (!engine.tipo || engine.tipo !== 'inicial') {
          engine.tipo = 'inicial';
        }
        
        await engine.dispatchSaveEvent('inicial');
        
      } catch (err) {
        message.error(`Error al guardar el odontograma: ${err.message}`);
        
        // No reinicializar automáticamente si ya se hizo en este intento
        if (!err.message.includes('Se ha iniciado la reinicialización automática')) {
          if (err.message.includes('Engine no está disponible') || 
              err.message.includes('no ha completado su inicialización') ||
              err.message.includes('aún se está inicializando')) {
            handleRetryInitialization();
          }
        }
      } finally {
        setIsSaving(false);
      }
    }, [handleRetryInitialization, isInitializing, initialized]);
    
    // Función para mostrar el modal de confirmación
    const handleSave = useCallback(() => {
        setShowConfirmModal(true);
        setConfirmationText('');
    }, []);
    
    // Función para cancelar la confirmación
    const handleCancelConfirmation = useCallback(() => {
        setShowConfirmModal(false);
        setConfirmationText('');
    }, []);

    // --- Funciones (sin tipos en parámetros/variables si no son necesarios) ---
    const handleDeleteInitialOdontogram = useCallback(async () => { 
        Modal.confirm({
            title: 'Confirmar Borrado',
            content: '¿Seguro que quieres borrar el odontograma inicial guardado? Esta acción no se puede deshacer.',
            okText: 'Sí, borrar',
            cancelText: 'Cancelar',
            onOk: async () => {
                try {
                    await onDelete();
                    // La notificación de éxito/error ya la maneja el padre (PatientDetail)
                    // message.success('Odontograma inicial borrado.'); 
                } catch (error) {
                    console.error("Error durante el borrado (devuelto al hijo)", error);
                    // message.error('Error al borrar el odontograma.'); // Opcional, si el padre no lo cubre
                }
            }
        });
    }, [onDelete]);

    // --- useEffects (sin tipos en parámetros/variables) ---
    useEffect(() => {
        setInitialOdontogramData(initialTableData);
    }, [initialTableData]);

    useEffect(() => {
        setCurrentImageUrl(initialImageUrl ? formatImageUrl(initialImageUrl) : '');
        setInitialImageLoadFailed(false);
        imageLoadAttemptsRef.current = 0;
        // Resetear flag de inicialización cuando cambia la URL de imagen
        didInitRef.current = false;
        console.log("🔄 Reseteando estado por cambio en initialImageUrl");
    }, [initialImageUrl, formatImageUrl]);
    
    // Efecto adicional para manejar recargas de página
    useEffect(() => {
        const handlePageReload = () => {
            console.log("🔄 Detectada recarga de página, reseteando estado del odontograma inicial");
            didInitRef.current = false;
            engineManagerRef.current = { instance: null, handlers: null, initialized: false };
            setEstadoInicial(ESTADOS.CARGANDO);
            setIsInitializing(false);
            setInitialized(false);
        };
        
        // Detectar si es una recarga de página usando la API moderna
        if (window.performance) {
          const navEntries = performance.getEntriesByType('navigation');
          if (navEntries.length > 0 && navEntries[0].type === 'reload') {
            console.log("🔄 Recarga de página detectada (Navigation Timing API)");
            handlePageReload();
          }
        }
        
        // Fallback para navegadores más antiguos
        if (performance.navigation && performance.navigation.type === 1) {
            console.log("🔄 Recarga de página detectada (Legacy API)");
            handlePageReload();
        }
        
        // También escuchar el evento beforeunload para limpiar
        window.addEventListener('beforeunload', handlePageReload);
        
        return () => {
            window.removeEventListener('beforeunload', handlePageReload);
        };
    }, []);

    useEffect(() => {
        // Este efecto se encarga de la inicialización del motor del odontograma.
        if (initialImageLoadFailed) return;
        
        const { initialized } = engineManagerRef.current;

        // Condiciones previas para la inicialización
        if (!areScriptsReady) {
            console.warn("OdontogramInitialSection: Scripts no listos, esperando.");
            return;
        }
        
        // Si hay imagen y no falló la carga, limpiar engine y salir
        if (showInitialOdontogramImage && !initialImageLoadFailed) {
            if (initialized && engineManagerRef.current.instance) {
                console.log("🧹 Limpiando engine porque se mostrará imagen");
                if (typeof engineManagerRef.current.instance.cleanup === 'function') {
                    engineManagerRef.current.instance.cleanup();
                } else {
                    engineManagerRef.current.instance.stop = true; 
                }
                if (canvasRef.current && engineManagerRef.current.handlers) {
                    try {
                        canvasRef.current.removeEventListener('click', engineManagerRef.current.handlers.click);
                        canvasRef.current.removeEventListener('mousemove', engineManagerRef.current.handlers.move);
                    } catch (e) { /* silent */ }
                }
                engineManagerRef.current = { instance: null, handlers: null, initialized: false };
                didInitRef.current = false; // Resetear para permitir futura inicialización
            }
            return;
        }

        if (!canvasRef.current) {
            console.warn("OdontogramInitialSection: Referencia del canvas no disponible aún.");
            return;
        }

        // Evitar re-inicialización si ya se hizo (pero permitir si didInitRef fue reseteado)
        if (initialized && didInitRef.current) {
            console.log("⚠️ Engine ya inicializado, saltando...");
            return;
        }
        
        // Si el engine está inicializado pero didInitRef fue reseteado, limpiar primero
        if (initialized && !didInitRef.current) {
            console.log("🔄 Reinicializando engine después de reset...");
            if (engineManagerRef.current.instance) {
                if (typeof engineManagerRef.current.instance.cleanup === 'function') {
                    engineManagerRef.current.instance.cleanup();
                } else {
                    engineManagerRef.current.instance.stop = true; 
                }
                if (canvasRef.current && engineManagerRef.current.handlers) {
                    try {
                        canvasRef.current.removeEventListener('click', engineManagerRef.current.handlers.click);
                        canvasRef.current.removeEventListener('mousemove', engineManagerRef.current.handlers.move);
                    } catch (e) { /* silent */ }
                }
            }
            engineManagerRef.current = { instance: null, handlers: null, initialized: false };
        }

        // Marcar que estamos iniciando la inicialización
        didInitRef.current = true;
        setIsInitializing(true);
        console.log("🚀 Iniciando inicialización del engine para odontograma inicial");
        console.log("🔍 Estado antes de inicializar:", {
            initialized,
            isInitializing: true,
            engineManager: engineManagerRef.current,
            didInit: didInitRef.current
        });
        
        let engine; // Renombrado de currentEngineInstance
        let initializationTimeout;

        try {
            // Timeout de seguridad para evitar bloqueos
            initializationTimeout = setTimeout(() => {
                console.error("⏰ Timeout: La inicialización del engine tardó más de 10 segundos");
                setEngineError('La inicialización del odontograma tardó demasiado tiempo. Intenta recargar la página.');
                setIsInitializing(false);
                didInitRef.current = false;
            }, 10000);

            if (!window.Engine) {
                setEngineError('Motor de Odontograma (Engine) no está cargado.');
                throw new Error('Engine no está definido globalmente');
            }
            
            console.log("🔧 Creando nueva instancia de Engine...");
            engine = new window.Engine({ // Usar engine local
                CONSTANTS: window.Constants ? new window.Constants() : null,
                patientId 
            });

            if (!engine || typeof engine.init !== 'function') {
                setEngineError('Fallo al instanciar Engine.');
                throw new Error('Fallo al instanciar Engine');
            }

            console.log("⚙️ Configurando canvas e inicializando engine...");
            engine.setCanvas(canvasRef.current);
            // Asegurar que el tipo sea 'inicial' explícitamente
            engine.tipo = 'inicial';
            console.log("🔧 Tipo de odontograma configurado explícitamente como:", engine.tipo);
            
            console.log("⏳ Iniciando engine.init()...");
            const initStartTime = Date.now();
            engine.init();
            console.log(`✅ engine.init() completado en ${Date.now() - initStartTime}ms`);

            if (engine.buttons) {
                console.log("🔘 Configurando botones del engine...");
                engine.buttons.forEach((button) => {
                    if (button?.textBox?.text === "Guardar") {
                        button.active = false;
                        button.rect.x = -1000;
                        if (button.textBox) button.textBox.rect.x = -1000;
                    }
                });
                console.log("✅ Botones configurados");
            }
            
            console.log("🆔 Configurando patientId:", patientId);
            engine.setPatientId(patientId); 
            
            const dataToLoad = initialTableData; 
            console.log("🔍 Datos a cargar en odontograma inicial:", dataToLoad);
            if (dataToLoad && dataToLoad.length > 0) {
                console.log("📊 Cargando datos existentes en engine inicial");
                const loadStartTime = Date.now();
                engine.loadOdontogramaData(dataToLoad);
                console.log(`✅ Datos cargados en ${Date.now() - loadStartTime}ms`);
            } else {
                console.log("📝 No hay datos previos, iniciando odontograma inicial limpio");
            }
            
            console.log("🚀 Iniciando engine.start()...");
            const startTime = Date.now();
            engine.start();
            console.log(`✅ engine.start() completado en ${Date.now() - startTime}ms`);

            const clickHandler = (e) => engine.onMouseClick(e);
            const moveHandler = (e) => engine.onMouseMove(e);
            
            canvasRef.current.addEventListener('click', clickHandler);
            canvasRef.current.addEventListener('mousemove', moveHandler);
            
            engineManagerRef.current = { // Actualizar el ref consolidado
                instance: engine,
                handlers: { click: clickHandler, move: moveHandler },
                initialized: true
            };
            
            // Limpiar timeout de seguridad
            if (initializationTimeout) {
                clearTimeout(initializationTimeout);
            }
            
            setInitialized(true);
            setIsInitializing(false);
            setEngineError(null);
            console.log("✅ Engine inicializado exitosamente para odontograma inicial");
            console.log("🔍 Estado final del engineManager:", engineManagerRef.current);

        } catch (error) {
            console.error("❌ OdontogramInitialSection: Error inicializando Engine (Inicial):", error);
            setEngineError(prevError => prevError || `Error motor odontograma: ${error.message}`);
            setIsInitializing(false);
            engineManagerRef.current = { ...engineManagerRef.current, initialized: false };
            didInitRef.current = false; // Resetear para permitir reintento
            
            // Limpiar timeout de seguridad
            if (initializationTimeout) {
                clearTimeout(initializationTimeout);
            }
        }

        return () => {
            const { instance: currentEngineInstance, handlers: currentHandlers } = engineManagerRef.current;
            if (currentEngineInstance) {
                if (typeof currentEngineInstance.cleanup === 'function') {
                    currentEngineInstance.cleanup();
                } else {
                    currentEngineInstance.stop = true; 
                }
                if (canvasRef.current && currentHandlers) {
                    try {
                        canvasRef.current.removeEventListener('click', currentHandlers.click);
                        canvasRef.current.removeEventListener('mousemove', currentHandlers.move);
                    } catch (e) {
                        console.warn("OdontogramInitialSection: Advertencia al remover listeners en desmontaje", e);
                    }
                }
                engineManagerRef.current = { instance: null, handlers: null, initialized: false };
            }
        };
    }, [areScriptsReady, patientId, initialTableData, formatImageUrl, initialImageLoadFailed, showInitialOdontogramImage]);

    // Función para obtener el nombre de la superficie (5 superficies básicas)
      const getSurfaceName = (surfaceValue) => {
          const surfaces = {
              '1': 'Vestibular', '2': 'Lingual', '3': 'Mesial', '4': 'Distal', '5': 'Oclusal'
          };
          return surfaces[surfaceValue] || surfaceValue;
      };

    // Función para combinar daño con superficie
     const combineDamageWithSurface = (damage, surface) => {
         if (!surface || surface === '0' || surface === 0 || surface === '5') {
             return damage;
         }
         const surfaceName = getSurfaceName(String(surface));
         return `${damage} - ${surfaceName}`;
     };

    // Procesar datos de la tabla para combinar daño con superficie
    const processedInitialData = useMemo(() => {
        if (!Array.isArray(initialOdontogramData)) return [];
        
        return initialOdontogramData.map(item => ({
            ...item,
            tipo: combineDamageWithSurface(item.tipo, item.superficie)
        }));
    }, [initialOdontogramData]);

    // Columnas de la tabla
    const odontogramColumns = [
        { title: 'Diente', dataIndex: 'diente', key: 'diente', width: 40 },
        { title: 'Daño', dataIndex: 'tipo', key: 'tipo', width: 100, ellipsis: true },
        { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 60, ellipsis: true },
    ];

    // Handler para error de carga de imagen (memoizado)
    const handleImageLoadFailed = useCallback(() => {
        setInitialImageLoadFailed(true);
        // Desactiva el flag de "mostrar imagen" para que NO entre 
        // en el canvas roto al siguiente render
        if (setShowInitialOdontogramImage) {
            setShowInitialOdontogramImage(false);
        }
    }, [setShowInitialOdontogramImage]);

    // Resetear flags al cambiar de paciente
    useEffect(() => {
      console.log('🔄 [OdontogramInitialSection] Reseteando estado por cambio de patientId:', patientId);
      setInitialImageLoadFailed(false);
      if (setShowInitialOdontogramImage) {
          console.log('🔄 [OdontogramInitialSection] Reseteando showInitialOdontogramImage a false');
          setShowInitialOdontogramImage(false);
      }
      setCurrentImageUrl('');
      setInitialOdontogramData([]);
      setTries(0);
    }, [patientId, setShowInitialOdontogramImage]);

    // Removemos los useEffect de monitoreo para evitar renders innecesarios
    // que pueden estar contribuyendo al parpadeo del odontograma

    // --- JSX con componentes memoizados ---
    return (
        <section className="patient-detail_odontograma">
          <div className="odontograma-section">
            <div className="odontograma-header1">
              <h2>Odontograma Inicial</h2>
              {(estadoInicial === ESTADOS.NO_EXISTE || estadoInicial === ESTADOS.RENDERIZADO) && (
                <div className="odontograma-controls">
                  <button 
                    className="button-primary capture-button" 
                    onClick={handleSave}
                    disabled={isSaving || (estadoInicial !== ESTADOS.NO_EXISTE && estadoInicial !== ESTADOS.RENDERIZADO)}
                  >
                    {isSaving ? 'Guardando...' : 'Capturar Odontograma'}
                  </button>
                  <label style={{ marginLeft: '10px', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={showAllTeeth} 
                      onChange={() => setShowAllTeeth(!showAllTeeth)}
                      style={{ marginRight: '5px' }}
                    />
                    Mostrar todos los dientes
                  </label>

                </div>
              )}
            </div>
            <div className="odontograma-container odontograma-flex-container">
              {estadoInicial === ESTADOS.ERROR ? (
                <div className="odontograma-error-placeholder">
                  <p>⚠️ No se pudo cargar el odontograma inicial.</p>
                  <p>Por favor, recarga la página o prueba más tarde.</p>
                  <Button
                    onClick={() => {
                      setInitialImageLoadFailed(false);
                      if (onRetryImageLoad) onRetryImageLoad();
                    }}
                    size="small"
                    style={{ marginTop: '10px' }}
                  >
                    Reintentar carga
                  </Button>
                </div>
              ) : estadoInicial === ESTADOS.EXISTE && currentImageUrl ? (
                <OdontogramImage 
                  imageUrl={currentImageUrl}
                  formatImageUrl={formatImageUrl} 
                  onImageLoadFailed={handleImageLoadFailed}
                />
              ) : (estadoInicial === ESTADOS.NO_EXISTE || estadoInicial === ESTADOS.RENDERIZADO) ? (
                <>
                  {engineError ? (
                    <OdontogramCanvas 
                      canvasRef={canvasRef}
                      showSpinner={showSpinner}
                      engineError={engineError}
                      onRetry={handleRetryInitialization}
                    />
                  ) : isInitializing && estadoInicial !== ESTADOS.RENDERIZADO ? (
                    <OdontogramCanvas 
                      canvasRef={canvasRef}
                      showSpinner={false}
                      engineError={null}
                      onRetry={handleRetryInitialization}
                    />
                  ) : (
                    <OdontogramCanvas 
                      canvasRef={canvasRef}
                      showSpinner={showSpinner}
                      engineError={engineError}
                      onRetry={handleRetryInitialization}
                    />
                  )}
                </>
              ) : (
                <div className="odontograma-loading-placeholder">
                  <p>Cargando odontograma inicial...</p>
                </div>
              )}
              <div className="odontograma-table-container">
                <h3>Historial Inicial</h3>
                <OdontogramTable 
                  columns={odontogramColumns}
                  dataSource={processedInitialData}
                  scroll={{ y: 600 }}
                />
              </div>
            </div>
            {(estadoInicial === ESTADOS.NO_EXISTE || estadoInicial === ESTADOS.RENDERIZADO) && (
              <div className="tools" style={{marginTop: '1rem'}}>
                <p style={{color: '#555', fontSize: '0.9em'}}>Seleccione una herramienta y marque los dientes.</p>
              </div>
            )}

          </div>
          
          {/* Modal de confirmación */}
          <Modal
            title="Confirmar Guardado"
            open={showConfirmModal}
            onOk={handleConfirmSave}
            onCancel={handleCancelConfirmation}
            okText="Guardar"
            cancelText="Cancelar"
            okButtonProps={{ disabled: !isConfirmationValid }}
            destroyOnClose
          >
            <div style={{ marginBottom: '16px' }}>
              <p>Para confirmar el guardado del odontograma, escriba <strong>"Confirmar"</strong> en el campo de abajo:</p>
              <Input
                placeholder="Escriba 'Confirmar' para continuar"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                onPressEnter={() => isConfirmationValid && handleConfirmSave()}
                autoFocus
              />
              {confirmationText && !isConfirmationValid && (
                <p style={{ color: '#ff4d4f', marginTop: '8px', fontSize: '14px' }}>
                  Debe escribir exactamente "Confirmar" para continuar
                </p>
              )}
            </div>
          </Modal>
        </section>
    );
};

// Definiciones de PropTypes para los componentes memoizados
OdontogramTable.propTypes = {
    columns: PropTypes.arrayOf(PropTypes.object).isRequired,
    dataSource: PropTypes.array,
    scroll: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

OdontogramCanvas.propTypes = {
    canvasRef: PropTypes.oneOfType([
        PropTypes.func, 
        PropTypes.shape({ current: PropTypes.instanceOf(Element) })
    ]).isRequired,
    showSpinner: PropTypes.bool,
    engineError: PropTypes.string
};

OdontogramImage.propTypes = {
    imageUrl: PropTypes.string.isRequired,
    formatImageUrl: PropTypes.func.isRequired,
    onImageLoadFailed: PropTypes.func.isRequired,
    maxAttempts: PropTypes.number
};

// PropTypes para el componente principal
OdontogramInitialSection.propTypes = {
    canvasRef: PropTypes.oneOfType([
        PropTypes.func,
        PropTypes.shape({ current: PropTypes.instanceOf(Element) })
    ]),
    patientId: PropTypes.string.isRequired,
    initialTableData: PropTypes.array,
    initialImageUrl: PropTypes.string,
    onDelete: PropTypes.func.isRequired,
    onSaveSuccess: PropTypes.func,

    areScriptsReady: PropTypes.bool,
    formatImageUrl: PropTypes.func.isRequired,
    onRetryImageLoad: PropTypes.func,
};

export default OdontogramInitialSection;