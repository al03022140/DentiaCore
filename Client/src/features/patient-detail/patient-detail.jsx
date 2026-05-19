import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Tabs, Modal, Input, message, Skeleton } from 'antd';
import "./styles/patient-detail.css";
import userNot from "../../assets/images/icons/Profile Default.svg";
import AddPatient from "../add-patient/add-patient.jsx";
import API from '../../shared/services/axios-instance.js';
import { formatDateToDDMMYYYY } from '../../shared/utils/date-utils';
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
import PatientChargesCard from './components/patient-charges-card.jsx';
import CreateAppointmentModal from '../consultas/components/CreateAppointmentModal';

import { getPatientById } from '../../shared/services/api.js';

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

const Loading = () => (
  <div className="loading-container">
    <Skeleton active paragraph={{ rows: 6 }} />
  </div>
);

const ErrorFallback = ({ msg, onRetry }) => (
  <div className="error-container">
    Error: {msg}
    <button onClick={onRetry} className="retry-button">Reintentar</button>
  </div>
);

const NoData = ({ message: msg, onNavigateBack }) => (
  <div className="no-data-container">
    <div className="no-data-message">{msg}</div>
    <button onClick={onNavigateBack} className="back-to-list-button">
      ← Regresar a la lista de pacientes
    </button>
  </div>
);

function useOdontogramSetup(patientId, fetchPatientData, checkInitialOdontogram, loadScriptsSequentially) {
  const [areScriptsReadyState, setAreScriptsReadyState] = useState(false);
  const [initializationError, setInitializationError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!patientId) return;
      try {
        const scriptsLoaded = await loadScriptsSequentially();
        if (!mounted) return;
        setAreScriptsReadyState(scriptsLoaded);
        await fetchPatientData();
        if (scriptsLoaded) {
          await checkInitialOdontogram(true);
        }
      } catch (err) {
        if (mounted) {
          setInitializationError(err.message || 'Error cargando datos.');
        }
      }
    }
    init();
    return () => { mounted = false; };
  }, [patientId, loadScriptsSequentially, fetchPatientData, checkInitialOdontogram]);

  const retryInitialization = useCallback(() => {
    setInitializationError(null);
    setAreScriptsReadyState(false);
    (async () => {
      try {
        const scriptsLoaded = await loadScriptsSequentially();
        setAreScriptsReadyState(scriptsLoaded);
        await fetchPatientData();
        if (scriptsLoaded && patientId) {
          await checkInitialOdontogram(true);
        }
      } catch (err) {
        setInitializationError(err.message || 'Error cargando datos.');
      }
    })();
  }, [loadScriptsSequentially, fetchPatientData, checkInitialOdontogram, patientId]);

  return { areScriptsReadyState, initializationError, retryInitialization };
}

const REQUIRED_DELETE_PHRASE = 'CONFIRMO ELIMINACION';
const REQUIRED_DELETE_PHRASE_ACCENTED = 'CONFIRMO ELIMINACIÓN';

const PatientDetail = () => {
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [initialData, setInitialData] = useState([]);
  const [initialExists, setInitialExists] = useState(false);
  const [odontogramHistory, setOdontogramHistory] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [fetchedInitial, setFetchedInitial] = useState(false);
  /** 'loading' | 'saved' | 'none' — resultado de GET /odontograma-inicial para la UI */
  const [initialOdontogramLoadStatus, setInitialOdontogramLoadStatus] = useState('loading');
  const [showCreateAppointmentModal, setShowCreateAppointmentModal] = useState(false);
  const [clinicalOdontogramData, setClinicalOdontogramData] = useState([]);
  const [clinicalOdontogramExists, setClinicalOdontogramExists] = useState(false);

  // Auto-hide del header GLOBAL de la app (.header con "Buenos días, ...") al
  // scrollear hacia abajo dentro de la página del paciente, y la barra de
  // pestañas (selector de secciones) queda flotando arriba en su lugar.
  // El header del paciente (Regresar/Editar) sí hace scroll normal con el
  // contenido — no se queda flotando.
  //
  // Se marca `<body data-pd-app-header-hidden="true">` para que header.css
  // aplique el translate sólo aquí (no en otras páginas). Se limpia al
  // desmontar.
  const [isAppHeaderHidden, setIsAppHeaderHidden] = useState(false);

  useEffect(() => {
    const TOP_THRESHOLD = 80;
    const DELTA = 6;

    let lastY = window.scrollY || 0;
    let ticking = false;

    const readY = (eventTarget) => {
      if (!eventTarget || eventTarget === window || eventTarget === document) {
        return window.scrollY || document.documentElement.scrollTop || 0;
      }
      return eventTarget.scrollTop ?? 0;
    };

    const onScroll = (e) => {
      // El scroll real ocurre en `.content` (overflow-y:auto). Filtramos para
      // ignorar scroll de sub-scrollables (dropdowns, modales) que dispararían
      // el handler con scrollTop sin relación al header.
      const t = e.target;
      const isMain = t === window || t === document ||
        (t && t.classList && t.classList.contains('content'));
      if (!isMain) return;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = readY(t);
        if (y <= TOP_THRESHOLD) {
          setIsAppHeaderHidden(false);
        } else if (y - lastY > DELTA) {
          setIsAppHeaderHidden(true);
        } else if (lastY - y > DELTA) {
          setIsAppHeaderHidden(false);
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  useEffect(() => {
    document.body.dataset.pdAppHeaderHidden = isAppHeaderHidden ? 'true' : 'false';
    document.body.dataset.pdPage = 'true';
    return () => {
      delete document.body.dataset.pdAppHeaderHidden;
      delete document.body.dataset.pdPage;
    };
  }, [isAppHeaderHidden]);

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
    } catch (e) {
        console.error('Invalid URL format for formatImageUrl:', url, e);
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
    setInitialExists(false);
    setInitialData([]);
    setOdontogramHistory([]);
  }, []);

  const fetchPatientData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPatientById(patientId);
      const normalizedData = {
        patient: response.patient || null,
        citas: response.citas || null
      };
      if (!normalizedData.patient) {
        throw new Error('Patient data not found in response');
      }
      setPatientData(normalizedData);
    } catch (e) {
      console.error('Error al cargar datos del paciente:', e);
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

  const verifyEngineLoaded = useCallback(() => {
    return !!(window.Engine && window.Tooth && typeof window.Tooth.prototype.refresh === 'function');
  }, []);

  const loadScriptsSequentially = useCallback(async () => {
    try {
      if (verifyEngineLoaded()) {
        return true;
      }
      const scripts = ['constants.js', 'settings.js', 'rect.js', 'textBox.js', 'damage.js', 'tooth.js', 'menuItem.js', 'renderer.js', 'odontogramaGenerator.js', 'collisionHandler.js', 'engine.js'];
      for (const script of scripts) {
        await loadScript(script);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      return verifyEngineLoaded();
    } catch (err) {
      throw err;
    }
  }, [loadScript, verifyEngineLoaded]);

  const checkInitialOdontogram = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && fetchedInitial) return;
    if (!patientId) return;
    setFetchedInitial(true);
    setInitialOdontogramLoadStatus('loading');
    try {
      const { data } = await API.get(`/patients/${patientId}/odontograma-inicial`);
      if (data.exists) {
        const odontogramData = Array.isArray(data.datos) ? data.datos : Array.isArray(data.data) ? data.data : [];
        setInitialData(odontogramData);
        setInitialExists(true);
        setOdontogramHistory(normalizeHistory(data.history));
        setInitialOdontogramLoadStatus('saved');
      } else {
        resetOdontogramState();
        setInitialOdontogramLoadStatus('none');
      }
    } catch {
      resetOdontogramState();
      setInitialOdontogramLoadStatus('none');
    }
  }, [patientId, normalizeHistory, resetOdontogramState, fetchedInitial]);

  const handleSaveSuccess = useCallback(async (datos, receivedHistory) => {
    setInitialData(datos || []);
    setInitialExists(true);
    setOdontogramHistory(normalizeHistory(receivedHistory || []));
    setInitialOdontogramLoadStatus('saved');
    setFetchedInitial(false);
    try {
      // Refresca desde el servidor para asegurar que estamos viendo el estado real
      // (importante si la respuesta del POST cambia algo o si vino de 409).
      await checkInitialOdontogram(true);
    } catch (err) {
      console.error('Error al refrescar datos del odontograma inicial:', err);
    }
  }, [normalizeHistory, checkInitialOdontogram]);

  useEffect(() => {
    resetOdontogramState();
    setFetchedInitial(false);
    setInitialOdontogramLoadStatus('loading');
  }, [patientId, resetOdontogramState]);

  const handleSaveClinicalCanvasData = useCallback(async (entryData) => {
    try {
      const odontogramaService = await import('../odontogram/api/odontograma-service.js');
      const result = await odontogramaService.default.saveClinicalOdontogramState(patientId, entryData);
      setClinicalOdontogramData(result.datos || entryData || []);
      setClinicalOdontogramExists(result.exists ?? true);
    } catch (err) {
      console.error('Error al guardar odontograma clínico:', err);
      message.error('Error al guardar el odontograma clínico');
    }
  }, [patientId]);

  const handleDeleteClinicalCanvasState = useCallback(async () => {
    try {
      const odontogramaService = await import('../odontogram/api/odontograma-service.js');
      await odontogramaService.default.deleteClinicalOdontogramState(patientId);
      setClinicalOdontogramData([]);
      setClinicalOdontogramExists(false);
      message.success('Estado del odontograma clínico eliminado exitosamente');
      await fetchPatientData();
    } catch (err) {
      console.error('Error al eliminar estado del odontograma clínico:', err);
      message.error('Error al eliminar el estado del odontograma clínico');
    }
  }, [patientId, fetchPatientData]);

  const handleEditClick = useCallback(() => setIsEditModalOpen(true), []);

  const handlePrintClick = useCallback(() => {
    navigate(`/patient/${patientId}/imprimir?autoPrint=1`);
  }, [navigate, patientId]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteConfirmVisible(true);
    setDeleteConfirmText('');
  }, []);

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

  const handleDeleteConfirmCancel = useCallback(() => {
    setIsDeleteConfirmVisible(false);
    setDeleteConfirmText('');
  }, []);

  const {
    areScriptsReadyState,
    initializationError,
    retryInitialization
  } = useOdontogramSetup(patientId, fetchPatientData, checkInitialOdontogram, loadScriptsSequentially);

  const loadClinicalOdontogramState = useCallback(async () => {
    try {
      const odontogramaService = await import('../odontogram/api/odontograma-service.js');
      const clinicalState = await odontogramaService.default.getClinicalOdontogramState(patientId);
      setClinicalOdontogramData(clinicalState.datos || []);
      setClinicalOdontogramExists(clinicalState.exists || false);
    } catch {
      setClinicalOdontogramData([]);
      setClinicalOdontogramExists(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientData && patientId) {
      loadClinicalOdontogramState();
    }
  }, [patientData, patientId, loadClinicalOdontogramState]);

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

  const tabItems = [
    {
      key: 'personal',
      label: 'Información Personal',
      children: (
        <>
          <h2 className="print-section-title">Información Personal</h2>
          <PatientContactInfo contacto={patientData.patient.contacto} email={patientData.patient.email} />
          <PatientDocumentInfo documento={patientData.patient.documento} />
          <PatientEmergencyContacts contactos={patientData.patient.contactos_emergencia} />
          <PatientAppointmentsInfo
            ultimaCita={patientData.citas?.ultimaCita}
            proximaCita={patientData.citas?.proximaCita}
            onAddAppointment={() => setShowCreateAppointmentModal(true)}
          />
          <PatientChargesCard patientId={patientId} />
        </>
      ),
    },
    {
      key: 'medical',
      label: 'Historia Médica',
      children: (
        <>
          <h2 className="print-section-title">Historia Médica</h2>
          <PatientFamilyHistory antecedentes={patientData.patient.antecedentes_heredo_familiares} />
          <PatientMedicalSurvey encuesta={patientData.patient.encuesta_medica} />
          <PatientFemaleInfo
            informacion_femenina={patientData.patient.informacion_femenina}
            sexo={patientData.patient.sexo}
          />
          <PatientHygieneHabits habitos_higiene={patientData.patient.habitos_higiene} />
        </>
      ),
    },
    {
      key: 'dental',
      label: 'Evaluación Dental',
      children: (
        <>
          <h2 className="print-section-title">Evaluación Dental</h2>
          <PatientDentalEvaluation patientData={patientData.patient} />

          {initializationError && (
            <div className="canvas-error">
              <p>No se pudo cargar el módulo de odontograma:</p>
              <p>{initializationError}</p>
              <p>
                <a href="#" onClick={(e) => { e.preventDefault(); retryInitialization(); }}>
                  Reintentar inicialización
                </a>
              </p>
            </div>
          )}

          {!initializationError && areScriptsReadyState ? (
            <OdontogramErrorBoundary>
              <OdontogramInitialSection
                canvasRef={canvas1Ref}
                patientId={patientId}
                initialTableData={initialData}
                exists={initialExists}
                initialSnapshotStatus={initialOdontogramLoadStatus}
                onSaveSuccess={handleSaveSuccess}
                areScriptsReady={areScriptsReadyState}
              />
            </OdontogramErrorBoundary>
          ) : !areScriptsReadyState && !initializationError ? (
            <div className="loading-container">
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
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
        </>
      ),
    },
    {
      key: 'treatment',
      label: 'Tratamiento',
      children: (
        <>
          <h2 className="print-section-title">Tratamiento</h2>
          <PatientEvolutionNote
            patientId={patientId}
            initialEvolutionNotes={patientData.patient.notas_evolucion}
            patientData={patientData.patient}
          />
          <PatientTreatmentPlan
            patientId={patientId}
            initialTreatmentPlan={patientData.patient.planes_tratamiento}
          />
        </>
      ),
    },
  ];

  return (
    <div
      className={`patient-detail${isAppHeaderHidden ? ' patient-detail--app-header-hidden' : ''}`}
    >
      <div className="patient-detail__header">
        <button className="back-button" onClick={() => navigate("/pacientes")}>
          ← Regresar
        </button>
        <div className="patient-detail__header-actions">
          <button
            className="Boton_Editar button-primary"
            onClick={handleEditClick}
            aria-label="Editar datos del paciente"
          >
            Editar
          </button>
          <button
            className="Boton_Imprimir"
            onClick={handlePrintClick}
            aria-label="Imprimir datos del paciente con formato especial"
          >
            Imprimir Formato
          </button>
        </div>
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
                message.success("Paciente actualizado correctamente.");
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
          />

          <Tabs
            defaultActiveKey="personal"
            items={tabItems}
            className="patient-detail-tabs"
            size="large"
          />

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

      <CreateAppointmentModal
        visible={showCreateAppointmentModal}
        onClose={() => setShowCreateAppointmentModal(false)}
        onCreated={fetchPatientData}
        fixedPatient={patientData?.patient ?? null}
      />

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
