// Importaciones principales
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom"; // Hooks de React Router
import "./styles/patient-detail.css"; // Estilos CSS del componente
import userNot from "../../assets/images/avatars/UserNot.png"; // Imagen por defecto para pacientes sin foto
import AddPatient from "../add-patient/add-patient.jsx"; // Componente para agregar/editar pacientes
import API from '../../shared/services/axios-instance.js'; // Instancia configurada de axios
import { Modal, Input, message } from 'antd'; // Componente de tabla de Ant Design - Añadir message
import { formatDateToDDMMYYYY } from '../../shared/utils/date-utils'; // Utilidades de fecha

// Importar componentes modulares de PatientDetailComponents
import OdontogramClinicalSection from '../odontogram/components/odontogram-clinical-section.jsx';
import OdontogramInitialSection from '../odontogram/components/odontogram-initial-section.jsx';
import PatientInfoHeader from './components/patient-info-header.jsx';
import PatientAppointmentsInfo from './components/patient-appointments-info.jsx';
import PatientMedicalSurvey from './components/patient-medical-survey.jsx';
import PatientEmergencyContacts from './components/patient-emergency-contacts.jsx';
import PatientFamilyHistory from './components/patient-family-history.jsx';
import PatientContactInfo from './components/patient-contact-info.jsx';
import PeriodontogramSection from './components/periodontogram-section.jsx';
import PatientDocumentInfo from './components/patient-document-info.jsx';
import PatientFemaleInfo from './components/patient-female-info.jsx';
import PatientHygieneHabits from './components/patient-hygiene-habits.jsx';
import PatientDentalEvaluation from './components/patient-dental-evaluation.jsx';
import PatientTreatmentPlan from './components/patient-treatment-plan.jsx';
import PatientEvolutionNote from './components/patient-evolution-note.jsx';

// Funciones API para manejo de pacientes
import { getPatientById } from '../../shared/services/api.js';

// Error Boundary para secciones críticas
class OdontogramErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Odontogram Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h3>Error en el módulo de odontograma</h3>
          <p>Por favor, recarga la página o contacta con soporte.</p>
          <button onClick={() => window.location.reload()}>
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Componentes de UI para estados de carga/error
const Loading = () => (
  <div className="loading-container">Loading patient data...</div>
);

const ErrorFallback = ({ msg, onRetry }) => (
  <div className="error-container">
    Error: {msg}
    <button onClick={onRetry} className="retry-button">Retry</button>
  </div>
);

const NoData = ({ message, onNavigateBack }) => (
  <div className="no-data-container">
    <div className="no-data-message">{message}</div>
    <button onClick={onNavigateBack} className="back-to-list-button">
      ← Regresar a la lista de pacientes
    </button>
  </div>
);

// Custom hook para la lógica de inicialización odontograma
function useOdontogramSetup(patientId, fetchPatientData, checkInitialOdontogram, loadScriptsSequentially) {
  const [areScriptsReadyState, setAreScriptsReadyState] = useState(false);
  const [initializationError, setInitializationError] = useState(null);

  // Este efecto debe ejecutarse solo una vez al montar el componente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const scriptsLoaded = await loadScriptsSequentially();
        if (!mounted) return;
        setAreScriptsReadyState(scriptsLoaded);
        await fetchPatientData();
        if (scriptsLoaded) {
          await checkInitialOdontogram();
        }
      } catch (err) {
        if (mounted) {
          setInitializationError(err.message || 'Error cargando datos.');
        }
      }
    }
    init();
    return () => { mounted = false; };
  }, []); // Intencionalmente deps vacías: solo al montar

  const retryInitialization = useCallback(() => {
    setInitializationError(null);
    setAreScriptsReadyState(false);
    // Reejecutar la lógica de init
    (async () => {
      try {
        const scriptsLoaded = await loadScriptsSequentially();
        setAreScriptsReadyState(scriptsLoaded);
        await fetchPatientData();
        if (scriptsLoaded) {
          await checkInitialOdontogram();
        }
      } catch (err) {
        setInitializationError(err.message || 'Error cargando datos.');
      }
    })();
  }, [loadScriptsSequentially, fetchPatientData, checkInitialOdontogram]);

  return { areScriptsReadyState, initializationError, retryInitialization };
}

// Constantes para confirmación de eliminación
const REQUIRED_DELETE_PHRASE = 'CONFIRMO ELIMINACION';
const REQUIRED_DELETE_PHRASE_ACCENTED = 'CONFIRMO ELIMINACIÓN';

// Componente principal para mostrar y editar detalles del paciente
const PatientDetail = () => {
  // Añadir referencias para los canvas al principio del componente
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);
  

  const { patientId } = useParams();
  const navigate = useNavigate();


  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Estados para el Odontograma Inicial (simplificados)
  const [initialData, setInitialData] = useState([]);
  const [initialImageUrl, setInitialImageUrl] = useState(null);
  const [showInitialOdontogramImage, setShowInitialOdontogramImage] = useState(false); // Controla si se muestra imagen o canvas
  const [odontogramHistory, setOdontogramHistory] = useState([]);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  // Ref para controlar si ya se hizo el fetch inicial (ahora con estado)
  const [fetchedInitial, setFetchedInitial] = useState(false);

  // 1) Declara todos los callbacks primero
  const formatImageUrl = useCallback((url) => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('http')) return url;
    let fullUrl = url;
    if (url.includes('/odontograma-image')) {
        fullUrl = `${window.location.origin}/api/patients/${patientId}/odontograma-image`;
    } else if (url.includes('/odontograma-inicial/image')) {
        fullUrl = `${window.location.origin}/api${url}`;
    } else if (url.startsWith('/api')) {
        fullUrl = `${window.location.origin}${url}`;
    } else if (url.startsWith('/uploads')) {
        fullUrl = `${window.location.origin}${url}`;
    } else if (url.includes('/pacientes/')) {
        fullUrl = `${window.location.origin}${url.replace('/pacientes/', '/patients/')}`;
    } else if (url.startsWith('/')) {
        fullUrl = `${window.location.origin}${url}`;
    } else {
        fullUrl = `${window.location.origin}/api/${url}`;
    }
    try {
        new URL(fullUrl);
        if (fullUrl.includes('/api/') && !fullUrl.includes('?')) {
            fullUrl += `?t=${Date.now()}`;
        }
        return fullUrl;
    } catch (error) {
        console.error('Invalid URL format for formatImageUrl:', url, error);
        return '';
    }
  }, [patientId]);

  const normalizeHistory = useCallback((rawHistory = []) => {
    return rawHistory.map(item => ({
      ...item,
      fecha: item.fecha || item.createdAt || formatDateToDDMMYYYY(new Date()),
    }));
  }, []);

  const resetOdontogramState = useCallback(() => {
    setInitialImageUrl(null);
    setShowInitialOdontogramImage(false);
    setInitialData([]);
    setOdontogramHistory([]);
  }, []);

  const fetchPatientData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPatientById(patientId);
      
      // La respuesta del API ya viene con la estructura correcta: { patient: ..., citas: ... }
      const normalizedData = {
        patient: response.patient || null,
        citas: response.citas || null
      };
      
      if (!normalizedData.patient) {
        console.error('❌ No se encontró información del paciente en la respuesta');
        throw new Error('Patient data not found in response');
      }
      
      setPatientData(normalizedData);
    } catch (e) {
      console.error('❌ Error al cargar datos del paciente:', e);
      setError(e instanceof Error ? e.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  const loadScript = useCallback((src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="/js/${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = `/js/${src}`;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = (err) => reject(new Error(`Error loading script ${src}: ${err.message}`));
      document.head.appendChild(script);
    });
  }, []);

  const patchEnginePrototype = useCallback(() => {
    if (window.Engine) {
      if (!window.Engine.prototype._originalCheckInitialOdontogramStatus) {
        window.Engine.prototype._originalCheckInitialOdontogramStatus = window.Engine.prototype.checkInitialOdontogramStatus;
        window.Engine.prototype.checkInitialOdontogramStatus = function() {
          this.hasSavedInitialOdontogram = false;
          return Promise.resolve({ hasSaved: false });
        };
      }
      return true;
    } else {
      console.warn('Engine no disponible para aplicar parche.');
      return false;
    }
  }, []);

  const loadScriptsSequentially = useCallback(async () => {
    try {
      if (window.Engine && window.Tooth && typeof window.Tooth.prototype.refresh === 'function') {
        patchEnginePrototype();
        return true;
      }
      const scripts = ['constants.js', 'settings.js', 'rect.js', 'textBox.js', 'damage.js', 'tooth.js', 'menuItem.js', 'renderer.js', 'odontogramaGenerator.js', 'collisionHandler.js', 'engine.js'];
      for (const script of scripts) {
        await loadScript(script);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.Engine && window.Tooth && typeof window.Tooth.prototype.refresh === 'function') {
        patchEnginePrototype();
        return true;
      }
      return false;
    } catch (error) {
      throw error;
    }
  }, [loadScript, patchEnginePrototype]);

  const checkInitialOdontogram = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && fetchedInitial) return;
    setFetchedInitial(true);
    if (!patientId) return;
    try {
      const { data } = await API.get(
        `/patients/${patientId}/odontograma-inicial`
      );
      if (data.exists) {
        setInitialImageUrl(formatImageUrl(data.imageUrl));
        setShowInitialOdontogramImage(true);
        const odontogramData = Array.isArray(data.datos) ? data.datos : Array.isArray(data.data) ? data.data : [];
        setInitialData(odontogramData);
        setOdontogramHistory(normalizeHistory(data.history));
      } else {
        resetOdontogramState();
      }
    } catch (error) {
      resetOdontogramState();
    }
  }, [patientId, formatImageUrl, normalizeHistory, resetOdontogramState, fetchedInitial]);

  // Consolidar handler de borrado
  const deleteInitial = useCallback(async () => {
    try {
      await API.delete(`/patients/${patientId}/odontograma-inicial`);
      message.success('Odontograma inicial eliminado.');
      setFetchedInitial(false); // permitimos un nuevo fetch
      await checkInitialOdontogram(); // volvemos a recargar
    } catch {
      message.error('Error al eliminar odontograma inicial.');
    }
  }, [patientId, checkInitialOdontogram]);

  const handleSaveSuccess = useCallback(async (receivedImageUrl, datos, receivedHistory) => {
    // Actualizar el estado con los nuevos datos del odontograma
    setInitialImageUrl(formatImageUrl(receivedImageUrl));
    setInitialData(datos || []);
    setOdontogramHistory(normalizeHistory(receivedHistory || []));
    setShowInitialOdontogramImage(true);
    // Resetear fetchedInitial para permitir que checkInitialOdontogram se ejecute en futuros refreshes
    setFetchedInitial(false);
    
    // Refrescar los datos del servidor para asegurar consistencia
    try {
      await checkInitialOdontogram(true); // Forzar refresh
    } catch (error) {
      console.error('Error al refrescar datos del odontograma inicial:', error);
    }

  }, [formatImageUrl, normalizeHistory, checkInitialOdontogram]);

  // Handler para guardar datos del canvas clínico
  const handleSaveClinicalCanvasData = useCallback(async (entryData) => {
    try {
      const odontogramaService = await import('../odontogram/api/odontograma-service.js');
      const result = await odontogramaService.default.saveClinicalOdontogramState(
        patientId,
        entryData
      );
      
      // Usar la respuesta del servidor para actualizar el estado local
      setClinicalOdontogramData(result.datos || entryData || []);
      setClinicalOdontogramExists(result.exists ?? true);
    } catch (error) {
      console.error('Error al guardar odontograma clínico:', error);
      message.error('Error al guardar el odontograma clínico');
    }
  }, [patientId]);

  // Handler para eliminar estado del canvas clínico
  const handleDeleteClinicalCanvasState = useCallback(async () => {
    try {
      const odontogramaService = await import('../odontogram/api/odontograma-service.js');
      await odontogramaService.default.deleteClinicalOdontogramState(patientId);
      
      // Limpiar el estado local inmediatamente
      setClinicalOdontogramData([]);
      setClinicalOdontogramExists(false);
      
      message.success('Estado del odontograma clínico eliminado exitosamente');
      // Actualizar los datos del paciente para reflejar los cambios
      await fetchPatientData();
    } catch (error) {
      console.error('Error al eliminar estado del odontograma clínico:', error);
      message.error('Error al eliminar el estado del odontograma clínico');
    }
  }, [patientId, fetchPatientData]);

  const handleEditClick = useCallback(() => {
    // Abrir el modal de edición en lugar de navegar
    setIsEditModalOpen(true);
  }, []);

  const handlePrintClick = useCallback(() => {
    // Agregar clase para impresión
    document.body.classList.add('printing-mode');
    
    // Crear sección de aceptación del paciente
    const acceptanceSection = document.createElement('div');
    acceptanceSection.className = 'patient-acceptance-section print-only';
    acceptanceSection.innerHTML = `
      <div class="acceptance-content">
        <h2>Aceptación del Paciente</h2>
        <p>Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
        <div class="signatures-container">
          <div class="signature-block">
            <div class="signature-line"></div>
            <p class="signature-label">${patientData.patient.primer_nombre} ${patientData.patient.apellido_paterno} ${patientData.patient.apellido_materno}</p>
            <p class="signature-title">Firma del Paciente</p>
          </div>
          <div class="signature-block">
            <div class="signature-line"></div>
            <p class="signature-label">Dr. Jeferson Arley Ramirez Mejia</p>
            <p class="signature-title">Firma del Doctor</p>
          </div>
        </div>
      </div>
    `;
    
    // Agregar la sección al final del contenido
    const patientDetailBody = document.querySelector('.patient-detail__body');
    if (patientDetailBody) {
      patientDetailBody.appendChild(acceptanceSection);
    }
    
    // Imprimir
    setTimeout(() => {
      window.print();
      
      // Limpiar después de imprimir
      setTimeout(() => {
        document.body.classList.remove('printing-mode');
        if (acceptanceSection && acceptanceSection.parentNode) {
          acceptanceSection.parentNode.removeChild(acceptanceSection);
        }
      }, 100);
    }, 100);
  }, [patientData]);

  // Abrir modal de confirmación de eliminación (patrón igual a notas de evolución)
  const handleDeleteClick = useCallback(() => {
    setIsDeleteConfirmVisible(true);
    setDeleteConfirmText('');
  }, []);

  // Confirmar en modal y ejecutar eliminación
  const handleDeleteConfirmOk = useCallback(async () => {
    const trimmed = deleteConfirmText.trim();
    if (trimmed !== REQUIRED_DELETE_PHRASE && trimmed !== REQUIRED_DELETE_PHRASE_ACCENTED) {
      message.warning(`Debes escribir ${REQUIRED_DELETE_PHRASE} o ${REQUIRED_DELETE_PHRASE_ACCENTED} para confirmar la eliminación.`);
      return;
    }
    try {
      setIsDeleting(true);
      await API.delete(`/patients/${patientId}`);
      message.success('Paciente eliminado correctamente');
      setIsDeleteConfirmVisible(false);
      navigate('/pacientes');
    } catch (err) {
      console.error('Error al eliminar el paciente:', err);
      message.error('No se pudo eliminar el paciente. Intenta de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteConfirmText, patientId, navigate]);

  // Cancelar modal de confirmación de eliminación
  const handleDeleteConfirmCancel = useCallback(() => {
    setIsDeleteConfirmVisible(false);
    setDeleteConfirmText('');
  }, []);

  const {
    areScriptsReadyState,
    initializationError,
    retryInitialization
  } = useOdontogramSetup(
    patientId,
    fetchPatientData,
    checkInitialOdontogram,
    loadScriptsSequentially
  );



  // Estado para el odontograma clínico
  const [clinicalOdontogramData, setClinicalOdontogramData] = useState([]);
  const [clinicalOdontogramExists, setClinicalOdontogramExists] = useState(false);

  // Cargar estado del odontograma clínico
  const loadClinicalOdontogramState = useCallback(async () => {
    try {
      const odontogramaService = await import('../odontogram/api/odontograma-service.js');
      const clinicalState = await odontogramaService.default.getClinicalOdontogramState(patientId);

      setClinicalOdontogramData(clinicalState.datos || []);
      setClinicalOdontogramExists(clinicalState.exists || false);
    } catch (error) {
      console.error('Error al cargar estado del odontograma clínico:', error);
      setClinicalOdontogramData([]);
      setClinicalOdontogramExists(false);
    }
  }, [patientId]);

  // Cargar estado clínico cuando se carga el paciente
  useEffect(() => {
    if (patientData && patientId) {
      loadClinicalOdontogramState();
    }
  }, [patientData, patientId, loadClinicalOdontogramState]);

  // Validaciones simplificadas antes del render
  if (loading) return <Loading />;
  if (error) return <ErrorFallback msg={error} onRetry={fetchPatientData} />;
  if (!patientData || !patientData.patient) {
    return (
      <NoData 
        message="No se encontró información del paciente. El ID proporcionado no existe en la base de datos." 
        onNavigateBack={() => navigate("/pacientes")}
      />
    );
  }

  return (
    <div className="patient-detail">
      <div className="patient-detail__header">
        <button className="back-button" onClick={() => navigate("/pacientes")}>
          ← Regresar
        </button>
      </div>

      <div className="patient-detail__content">
        <Modal
          open={isEditModalOpen}
          onCancel={() => setIsEditModalOpen(false)}
          footer={null}
          width={1600}
        >
          {patientData && patientData.patient && (
            <AddPatient
              initialPatientData={patientData.patient}
              onSave={() => {
                message.success("Patient updated successfully.");
                setIsEditModalOpen(false);
                fetchPatientData();
              }}
              onCancel={() => setIsEditModalOpen(false)}
            />
          )}
        </Modal>

        <div className="patient-detail__body">
          <PatientInfoHeader
            patient={patientData.patient}
            userNot={userNot}
            proximaCita={patientData.citas?.proximaCita}
            ultimaCita={patientData.citas?.ultimaCita}
            handleEditClick={handleEditClick}
            handlePrintClick={handlePrintClick}
          />

          <PatientEvolutionNote 
            patientId={patientId}
            initialEvolutionNotes={patientData.patient.notas_evolucion}
            patientData={patientData.patient}
          />
          
          <PatientContactInfo contacto={patientData.patient.contacto} email={patientData.patient.email} />
          <PatientDocumentInfo documento={patientData.patient.documento} />
          <PatientEmergencyContacts contactos={patientData.patient.contactos_emergencia} />
          <PatientFamilyHistory antecedentes={patientData.patient.antecedentes_heredo_familiares} />
          <PatientMedicalSurvey encuesta={patientData.patient.encuesta_medica} />
          <PatientFemaleInfo 
            informacion_femenina={patientData.patient.informacion_femenina} 
            sexo={patientData.patient.sexo}
          />
          <PatientHygieneHabits habitos_higiene={patientData.patient.habitos_higiene} />
          <PatientDentalEvaluation patientData={patientData.patient} />
          <PatientAppointmentsInfo 
            ultimaCita={patientData.citas?.ultimaCita} 
            proximaCita={patientData.citas?.proximaCita}
          />

          {initializationError && (
            <div className="canvas-error">
              <p>Could not load odontogram module:</p>
              <p>{initializationError}</p>
              <p>
                Please{" "}
                <a href="#" onClick={(e) => { e.preventDefault(); retryInitialization(); }}>
                  retry initialization
                </a>
                . If the problem persists, contact support.
              </p>
            </div>
          )}

          {!initializationError && areScriptsReadyState ? (
            <OdontogramErrorBoundary>
              <OdontogramInitialSection
                canvasRef={canvas1Ref}
                patientId={patientId}
                initialTableData={initialData}
                initialImageUrl={initialImageUrl}
                showInitialOdontogramImage={showInitialOdontogramImage}
                setShowInitialOdontogramImage={setShowInitialOdontogramImage}
                onDelete={deleteInitial}
                onSaveSuccess={handleSaveSuccess}
                onRetryImageLoad={checkInitialOdontogram}

                areScriptsReady={areScriptsReadyState}
                formatImageUrl={formatImageUrl}
              />
            </OdontogramErrorBoundary>
          ) : !areScriptsReadyState && !initializationError ? (
            <div className="loading-container">Loading initial odontogram module...</div>
          ) : null}
          
          {!initializationError && areScriptsReadyState ? (
            <OdontogramErrorBoundary>
              <OdontogramClinicalSection
                patientId={patientId}
                clinicalData={clinicalOdontogramData}
                onDelete={handleDeleteClinicalCanvasState}
                onDataSave={handleSaveClinicalCanvasData}

                areScriptsReady={areScriptsReadyState}
                canvasRef={canvas2Ref}
              />
            </OdontogramErrorBoundary>
          ) : null}

          <PeriodontogramSection patientId={patientId} />

          <PatientTreatmentPlan 
            patientId={patientId} 
            initialTreatmentPlan={patientData.patient.planes_tratamiento}
          />

          {/* Botón rojo de eliminar paciente con el mismo formato del botón de imprimir, ubicado al final y alineado a la derecha */}
          <div className="patient-detail__bottom-actions">
            <button
              className="Boton_Eliminar"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              aria-label="Eliminar paciente"
              title="Eliminar paciente"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar paciente'}
            </button>
          </div>
        </div>
      </div>

      <Modal
        title="Confirmar eliminación"
        open={isDeleteConfirmVisible}
        onOk={handleDeleteConfirmOk}
        onCancel={handleDeleteConfirmCancel}
        okText="Eliminar"
        cancelText="Cancelar"
      >
        <p>Para confirmar la eliminación, escribe exactamente: <strong>{REQUIRED_DELETE_PHRASE}</strong> o <strong>{REQUIRED_DELETE_PHRASE_ACCENTED}</strong></p>
        <Input
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder={`${REQUIRED_DELETE_PHRASE} / ${REQUIRED_DELETE_PHRASE_ACCENTED}`}
          aria-label="Texto de confirmación de eliminación"
        />
      </Modal>
    </div>
  );
};

export default PatientDetail;
