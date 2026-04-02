import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Skeleton, message } from 'antd';
import './styles/patient-detail.css';
import './styles/patient-print.css';
import userNot from '../../assets/images/icons/Profile Default.svg';
import API from '../../shared/services/axios-instance.js';
import { formatDateToDDMMYYYY } from '../../shared/utils/date-utils';
import { useAuth } from '../../app/auth/AuthContext';
import { getSettings } from '../../shared/services/settingsService';
import { getPatientById } from '../../shared/services/api.js';

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
          <button type="button" onClick={() => window.location.reload()}>
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
    <button type="button" onClick={onRetry} className="retry-button">Reintentar</button>
  </div>
);

const NoData = ({ message: msg, onNavigateBack }) => (
  <div className="no-data-container">
    <div className="no-data-message">{msg}</div>
    <button type="button" onClick={onNavigateBack} className="back-to-list-button">
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

function formatPrintDateTime() {
  const d = new Date();
  return d.toLocaleString('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

/**
 * Vista única del expediente para revisión e impresión: todo el contenido visible
 * a la vez (sin pestañas), con pie de documento para firmas y metadatos de impresión.
 */
const PatientPrintPage = () => {
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);
  const { user } = useAuth();
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialData, setInitialData] = useState([]);
  const [initialImageUrl, setInitialImageUrl] = useState(null);
  const [showInitialOdontogramImage, setShowInitialOdontogramImage] = useState(false);
  const [odontogramHistory, setOdontogramHistory] = useState([]);
  const [fetchedInitial, setFetchedInitial] = useState(false);
  const [initialOdontogramLoadStatus, setInitialOdontogramLoadStatus] = useState('loading');
  const [clinicalOdontogramData, setClinicalOdontogramData] = useState([]);
  const [, setClinicalOdontogramExists] = useState(false);
  const [clinicName, setClinicName] = useState('');

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
    return rawHistory.map((item) => ({
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
      const normalizedData = {
        patient: response.patient || null,
        citas: response.citas || null,
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

  useEffect(() => {
    getSettings()
      .then((s) => setClinicName(s.clinicName || ''))
      .catch(() => setClinicName(''));
  }, []);

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
      await new Promise((resolve) => setTimeout(resolve, 100));
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
        setInitialImageUrl(formatImageUrl(data.imageUrl));
        setShowInitialOdontogramImage(true);
        const odontogramData = Array.isArray(data.datos) ? data.datos : Array.isArray(data.data) ? data.data : [];
        setInitialData(odontogramData);
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
  }, [patientId, formatImageUrl, normalizeHistory, resetOdontogramState, fetchedInitial]);

  const deleteInitial = useCallback(async () => {
    try {
      await API.delete(`/patients/${patientId}/odontograma-inicial`);
      message.success('Odontograma inicial eliminado.');
      setFetchedInitial(false);
      await checkInitialOdontogram(true);
    } catch {
      message.error('Error al eliminar odontograma inicial.');
    }
  }, [patientId, checkInitialOdontogram]);

  const handleSaveSuccess = useCallback(async (receivedImageUrl, datos, receivedHistory) => {
    setInitialImageUrl(formatImageUrl(receivedImageUrl));
    setInitialData(datos || []);
    setOdontogramHistory(normalizeHistory(receivedHistory || []));
    setShowInitialOdontogramImage(true);
    setFetchedInitial(false);
    try {
      await checkInitialOdontogram(true);
    } catch (err) {
      console.error('Error al refrescar datos del odontograma inicial:', err);
    }
  }, [formatImageUrl, normalizeHistory, checkInitialOdontogram]);

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

  useEffect(() => {
    resetOdontogramState();
    setFetchedInitial(false);
    setInitialOdontogramLoadStatus('loading');
  }, [patientId, resetOdontogramState]);

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

  const {
    areScriptsReadyState,
    initializationError,
    retryInitialization,
  } = useOdontogramSetup(patientId, fetchPatientData, checkInitialOdontogram, loadScriptsSequentially);

  const patientFullName = patientData
    ? [
        patientData.patient.primer_nombre,
        patientData.patient.apellido_paterno,
        patientData.patient.apellido_materno,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const doctorDisplayName = user?.nombre || 'Profesional tratante';

  useEffect(() => {
    const prevTitle = document.title;
    if (patientFullName) {
      const clinicLabel = clinicName ? ` - ${clinicName}` : '';
      document.title = `Expediente ${patientFullName}${clinicLabel}`;
    }
    return () => {
      document.title = prevTitle;
    };
  }, [patientFullName, clinicName]);

  const handlePrint = useCallback(() => {
    const clinicLabel = clinicName ? ` - ${clinicName}` : '';
    if (patientFullName) {
      document.title = `Expediente ${patientFullName}${clinicLabel}`;
    }
    // Switch to light theme BEFORE opening the print dialog so the canvas
    // engine has two full animation frames to repaint in light colors.
    // ThemeContext's afterprint handler will restore the original theme.
    document.documentElement.setAttribute('data-theme', 'light');
    window.dispatchEvent(new CustomEvent('dentia-theme-change'));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, [patientFullName, clinicName]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoPrint') === '1' && patientData && !loading) {
      const t = setTimeout(() => handlePrint(), 450);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [patientData, loading, handlePrint]);

  if (loading) return <Loading />;
  if (error) return <ErrorFallback msg={error} onRetry={fetchPatientData} />;
  if (!patientData || !patientData.patient) {
    return (
      <NoData
        message="No se encontró información del paciente."
        onNavigateBack={() => navigate('/pacientes')}
      />
    );
  }

  return (
    <div className="patient-detail patient-print-page">
      <div className="patient-print-toolbar no-print">
        <button type="button" className="back-button" onClick={() => navigate(`/patient/${patientId}`)}>
          ← Volver al expediente
        </button>
        <div className="patient-print-toolbar-actions">
          <button type="button" className="Boton_Imprimir" onClick={handlePrint}>
            Imprimir
          </button>
        </div>
      </div>

      <div className="patient-print-meta no-print">
        <p>
          Vista previa de impresión: se incluyen todas las secciones del expediente. Usa el botón Imprimir o el diálogo del navegador (Ctrl/Cmd+P).
        </p>
      </div>

      <div className="patient-detail__content">
        <div className="patient-detail__body patient-print-body">
          <PatientInfoHeader
            patient={patientData.patient}
            userNot={userNot}
            proximaCita={patientData.citas?.proximaCita}
            ultimaCita={patientData.citas?.ultimaCita}
          />

          <section className="patient-print-doc-section">
            <h2 className="patient-print-section-title">Información personal y administrativa</h2>
            <PatientContactInfo contacto={patientData.patient.contacto} email={patientData.patient.email} />
            <PatientDocumentInfo documento={patientData.patient.documento} />
            <PatientEmergencyContacts contactos={patientData.patient.contactos_emergencia} />
            <PatientAppointmentsInfo
              ultimaCita={patientData.citas?.ultimaCita}
              proximaCita={patientData.citas?.proximaCita}
              onAddAppointment={() => {}}
            />
            <PatientChargesCard patientId={patientId} />
          </section>

          <section className="patient-print-doc-section">
            <h2 className="patient-print-section-title">Historia médica</h2>
            <PatientFamilyHistory antecedentes={patientData.patient.antecedentes_heredo_familiares} />
            <PatientMedicalSurvey encuesta={patientData.patient.encuesta_medica} />
            <PatientFemaleInfo
              informacion_femenina={patientData.patient.informacion_femenina}
              sexo={patientData.patient.sexo}
            />
            <PatientHygieneHabits habitos_higiene={patientData.patient.habitos_higiene} />
          </section>

          <section className="patient-print-doc-section">
            <h2 className="patient-print-section-title">Evaluación dental</h2>
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
                <h3 className="patient-print-subsection-title">Odontograma inicial</h3>
                <OdontogramInitialSection
                  canvasRef={canvas1Ref}
                  patientId={patientId}
                  initialTableData={initialData}
                  initialImageUrl={initialImageUrl}
                  showInitialOdontogramImage={showInitialOdontogramImage}
                  setShowInitialOdontogramImage={setShowInitialOdontogramImage}
                  initialSnapshotStatus={initialOdontogramLoadStatus}
                  onDelete={deleteInitial}
                  onSaveSuccess={handleSaveSuccess}
                  onRetryImageLoad={() => checkInitialOdontogram(true)}
                  areScriptsReady={areScriptsReadyState}
                  formatImageUrl={formatImageUrl}
                />
              </OdontogramErrorBoundary>
            ) : !areScriptsReadyState && !initializationError ? (
              <div className="loading-container">
                <Skeleton active paragraph={{ rows: 3 }} />
              </div>
            ) : null}

            {!initializationError && areScriptsReadyState ? (
              <OdontogramErrorBoundary>
                <h3 className="patient-print-subsection-title">Odontograma clínico</h3>
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

            <h3 className="patient-print-subsection-title">Periodontograma</h3>
            <PeriodontogramSection patientId={patientId} />
          </section>

          <section className="patient-print-doc-section">
            <h2 className="patient-print-section-title">Tratamiento y evolución</h2>
            <PatientEvolutionNote
              patientId={patientId}
              initialEvolutionNotes={patientData.patient.notas_evolucion}
              patientData={patientData.patient}
              hideForm
            />
            <PatientTreatmentPlan
              patientId={patientId}
              initialTreatmentPlan={patientData.patient.planes_tratamiento}
            />
          </section>

          <footer className="patient-print-footer">
            <div className="patient-print-footer-meta">
              <p className="patient-print-footer-line">
                <strong>Documento generado:</strong>{' '}
                {formatPrintDateTime()}
              </p>
              {clinicName ? (
                <p className="patient-print-footer-line">
                  <strong>Consultorio:</strong> {clinicName}
                </p>
              ) : null}
              <p className="patient-print-footer-line">
                <strong>Paciente:</strong> {patientFullName}
              </p>
            </div>

            <div className="patient-print-signatures">
              <div className="patient-print-signature-block">
                <div className="patient-print-signature-line" />
                <p className="patient-print-signature-label">{doctorDisplayName}</p>
                <p className="patient-print-signature-role">Nombre y firma del profesional tratante</p>
              </div>
              <div className="patient-print-signature-block">
                <div className="patient-print-signature-line" />
                <p className="patient-print-signature-label">{patientFullName}</p>
                <p className="patient-print-signature-role">Nombre y firma del paciente o tutor</p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default PatientPrintPage;
