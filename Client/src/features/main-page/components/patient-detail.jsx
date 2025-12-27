// Importaciones principales
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom"; // Hooks de React Router
import "../styles/PatientDetail.css"; // Estilos CSS del componente
import userNot from "../../../assets/images/avatars/UserNot.png"; // Imagen por defecto para pacientes sin foto
import AddPatient from "./AddPatient.jsx"; // Componente para agregar/editar pacientes
import axios from 'axios'; // Para hacer peticiones HTTP
import { Modal, message } from 'antd'; // Componente de tabla de Ant Design - Añadir message
import { formatDateToDDMMYYYY, getCurrentDateFormatted } from '../utils/dateUtils'; // Utilidades de fecha

// Importar componentes modulares de PatientDetailComponents
import OdontogramClinicalSection from './PatientDetailComponents/OdontogramClinicalSection.jsx';
import OdontogramInitialSection from './PatientDetailComponents/OdontogramInitialSection.jsx';
import PatientInfoHeader from './PatientDetailComponents/PatientInfoHeader.jsx';
import PatientAppointmentsInfo from './PatientDetailComponents/PatientAppointmentsInfo.jsx';
import PatientMedicalSurvey from './PatientDetailComponents/PatientMedicalSurvey.jsx';
import PatientEmergencyContacts from './PatientDetailComponents/PatientEmergencyContacts.jsx';
import PatientContactInfo from './PatientDetailComponents/PatientContactInfo.jsx';
import PeriodontogramSection from './PatientDetailComponents/PeriodontogramSection.jsx';
import PatientDocumentInfo from './PatientDetailComponents/PatientDocumentInfo.jsx';
import PatientFemaleInfo from './PatientDetailComponents/PatientFemaleInfo.jsx';
import PatientHygieneHabits from './PatientDetailComponents/PatientHygieneHabits.jsx';

// Utilidades y API
// Funciones para formatear datos del paciente
import { formatName, formatDate, calculateAge } from '../utils/formatters';
// Funciones API para manejo de pacientes
import { getPatientById } from '../api';
import { prepareDataSource } from '../utils/odontogramUtils';

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

// Componente principal para mostrar y editar detalles del paciente
const PatientDetail = () => {
  // Añadir referencias para los canvas al principio del componente
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);
  

  const [isSavingOdontogram, setIsSavingOdontogram] = useState(false);
  const { patientId } = useParams();
  const navigate = useNavigate();


  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Estados para el Odontograma Inicial (simplificados)
  const [initialData, setInitialData] = useState([]);
  const [initialImageUrl, setInitialImageUrl] = useState(null);
  const [isInitialOdontogramSaved, setIsInitialOdontogramSaved] = useState(false);
  const [showInitialOdontogramImage, setShowInitialOdontogramImage] = useState(false); // Controla si se muestra imagen o canvas
  const [capturedSuccessfully, setCapturedSuccessfully] = useState(false); // Ayuda a la lógica de visualización
  const [odontogramHistory, setOdontogramHistory] = useState([]);

  const imageLoadAttemptsRef = useRef(0);
  const MAX_IMAGE_LOAD_ATTEMPTS = 3; // Número máximo de intentos

  const API_URL = '/api';
  
  // Ref para controlar si ya se hizo el fetch inicial (ahora con estado)
  const [fetchedInitial, setFetchedInitial] = useState(false);

  // 1) Declara todos los callbacks primero
  const formatImageUrl = useCallback((url) => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('http')) return url;
    let fullUrl = url;
    if (url.includes('/odontograma-image')) {
        fullUrl = `${window.location.origin}/api/patients/${patientId}/odontograma-image`;
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
    setIsInitialOdontogramSaved(false);
    setInitialData([]);
    setOdontogramHistory([]);
    setCapturedSuccessfully(false);
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
  }, [patientId, showInitialOdontogramImage]);

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

  const checkInitialOdontogram = useCallback(async () => {
    if (fetchedInitial) return;
    setFetchedInitial(true);
    if (!patientId) return;
    try {
      const { data } = await axios.get(
        `${API_URL}/patients/${patientId}/odontograma-inicial`
      );
      if (data.exists) {
        setInitialImageUrl(formatImageUrl(data.imageUrl));
        setShowInitialOdontogramImage(true);
        setIsInitialOdontogramSaved(true);
        setCapturedSuccessfully(true);
        const odontogramData = Array.isArray(data.datos) ? data.datos : Array.isArray(data.data) ? data.data : [];
        setInitialData(odontogramData);
        setOdontogramHistory(normalizeHistory(data.history));
      } else {
        resetOdontogramState();
      }
    } catch (error) {
      resetOdontogramState();
    }
  }, [patientId, API_URL, formatImageUrl, normalizeHistory, resetOdontogramState, fetchedInitial]);

  // Consolidar handler de borrado
  const deleteInitial = useCallback(async () => {
    try {
      await axios.delete(`${API_URL}/patients/${patientId}/odontograma-inicial`);
      message.success('Odontograma inicial eliminado.');
      setFetchedInitial(false); // permitimos un nuevo fetch
      await checkInitialOdontogram(); // volvemos a recargar
    } catch {
      message.error('Error al eliminar odontograma inicial.');
    }
  }, [API_URL, patientId, checkInitialOdontogram]);

  const handleSaveSuccess = useCallback((receivedImageUrl, datos, receivedHistory) => {
    // Actualizar el estado con los nuevos datos del odontograma
    setInitialImageUrl(formatImageUrl(receivedImageUrl));
    setInitialData(datos || []);
    setOdontogramHistory(normalizeHistory(receivedHistory || []));
    setShowInitialOdontogramImage(true);
    setIsInitialOdontogramSaved(true);
    setCapturedSuccessfully(true);

  }, [formatImageUrl, normalizeHistory]);

  // Handler para guardar datos del canvas clínico
  const handleSaveClinicalCanvasData = useCallback(async (canvasDataUrl, odontogramData) => {
    try {
      const odontogramaService = await import('../services/odontogramaService');
      const result = await odontogramaService.default.saveClinicalOdontogramState(
        patientId,
        canvasDataUrl,
        odontogramData
      );
      
      setClinicalOdontogramData(odontogramData);
      setClinicalOdontogramExists(true);
      message.success('Odontograma clínico guardado exitosamente');
      
      // Refrescar datos del paciente para reflejar cambios
      await fetchPatientData();
    } catch (error) {
      console.error('Error al guardar odontograma clínico:', error);
      message.error('Error al guardar el odontograma clínico');
    }
  }, [patientId, fetchPatientData, showInitialOdontogramImage]);

  // Handler para eliminar estado del canvas clínico
  const handleDeleteClinicalCanvasState = useCallback(async () => {
    try {
      const odontogramaService = await import('../services/odontogramaService');
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
    setIsEditModalOpen(true);
  }, []);
  
  // 2) Ahora que ya existen, invoca el custom hook
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
      const odontogramaService = await import('../services/odontogramaService');
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
  }, [patientData, patientId, loadClinicalOdontogramState, showInitialOdontogramImage]);

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
          title="Edit Patient"
          open={isEditModalOpen}
          onCancel={() => setIsEditModalOpen(false)}
          footer={null}
          width={1200}
        >
          {patientData && patientData.patient && (
            <AddPatient
              isEditing={true}
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
            proximaCita={patientData.citas?.proxima}
            ultimaCita={patientData.citas?.ultima}
            handleEditClick={handleEditClick}
          />
          
          <PatientContactInfo contacto={patientData.patient.contacto} />
          <PatientDocumentInfo documento={patientData.patient.documento} />
          <PatientEmergencyContacts contactos={patientData.patient.contactos_emergencia} />
          <PatientMedicalSurvey encuesta={patientData.patient.encuesta_medica} />
          <PatientFemaleInfo 
            informacion_femenina={patientData.patient.informacion_femenina} 
            sexo={patientData.patient.sexo}
          />
          <PatientHygieneHabits habitos_higiene={patientData.patient.habitos_higiene} />
          <PatientAppointmentsInfo 
            ultimaCita={patientData.citas?.ultima} 
            proximaCita={patientData.citas?.proxima}
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
        </div>
      </div>
      {isSavingOdontogram && (
        <div className="spinner-overlay">
          <div className="spinner-placeholder">Saving...</div>
        </div>
      )}
    </div>
  );
};

export default PatientDetail;
