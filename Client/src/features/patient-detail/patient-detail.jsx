import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { AppointmentProvider } from "../../shared/contexts/AppointmentContext.jsx";
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
import PatientAttachments from './components/patient-attachments.jsx';
import CreateAppointmentModal from '../consultas/components/CreateAppointmentModal';
import SignaturePadModal from '../../shared/components/SignaturePadModal.jsx';
import DoctorSignStep from '../../shared/components/DoctorSignStep.jsx';
import { useAuth } from '../../app/auth/AuthContext.jsx';
import { hasPermission } from '../../app/auth/permissions';

import { getPatientById } from '../../shared/services/api.js';

const CONSENTIMIENTO_HC_TEXTO = `Yo, el paciente abajo firmante, declaro que la información proporcionada en esta historia clínica es veraz, completa y correcta a mi leal saber y entender. Reconozco que los datos personales y de salud aquí recabados serán utilizados con fines de diagnóstico, tratamiento, prevención y seguimiento de mi atención odontológica.

Otorgo mi consentimiento expreso para la captura, tratamiento y conservación de mis datos clínicos por parte de este consultorio, conforme a:
- NOM-004-SSA3-2012 (Expediente Clínico)
- LFPDPPP, Arts. 8 y 16 (consentimiento informado y derechos ARCO)
- LFPDPPP, Art. 11 (conservación del expediente)

Entiendo que tengo derecho a acceder, rectificar, cancelar u oponerme al tratamiento de mis datos (Derechos ARCO) y que puedo ejercerlos en cualquier momento solicitándolo en este consultorio.`;


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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  // Permiso real (no rol) — matches backend gate `authorize(['patients.update'])`.
  const canFinalizeHC = hasPermission(user?.permissions, ['patients.update']);
  // Cita activa pasada en la URL desde "INICIAR CONSULTA AHORA" (consultas).
  // Si está presente, todo lo que se guarde en este expediente quedará ligado.
  const currentAppointmentId = searchParams.get('appointmentId') || null;

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
  // Flujo de finalización HC: null → 'patient' → 'doctor' → submit
  const [hcStep, setHcStep] = useState(null);
  const [hcPatientSig, setHcPatientSig] = useState(null);
  const [isSavingHCConsent, setIsSavingHCConsent] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeMethod, setRevokeMethod] = useState('pin'); // pin | pad
  const [revokePin, setRevokePin] = useState('');
  const [revokePadOpen, setRevokePadOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  // Marca <body data-pd-page="true"> para que header.css quite el sticky del
  // header global SOLO en esta pagina (el header se queda en su posicion
  // natural y no flota sobre el contenido).
  useEffect(() => {
    document.body.dataset.pdPage = 'true';
    return () => {
      delete document.body.dataset.pdPage;
    };
  }, []);

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
      const result = await odontogramaService.default.saveClinicalOdontogramState(
        patientId,
        entryData,
        currentAppointmentId ? { appointmentId: currentAppointmentId } : {}
      );
      setClinicalOdontogramData(result.datos || entryData || []);
      setClinicalOdontogramExists(result.exists ?? true);
    } catch (err) {
      console.error('Error al guardar odontograma clínico:', err);
      message.error('Error al guardar el odontograma clínico');
    }
  }, [patientId, currentAppointmentId]);

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

  const submitRevocation = useCallback(async (doctorSignature) => {
    setRevoking(true);
    try {
      const { data } = await API.post(`/patients/${patientId}/revoke-hc-consent`, {
        motivo: revokeReason.trim(),
        doctorSignature,
      });
      if (data?.success) {
        message.success('Consentimiento revocado. Ya puedes corregir el expediente.');
        setIsRevokeOpen(false);
        setRevokeReason('');
        setRevokePin('');
        setRevokeMethod('pin');
        setRevokePadOpen(false);
        await fetchPatientData();
      } else {
        throw new Error(data?.error || 'No se pudo revocar el consentimiento');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error al revocar';
      message.error(msg);
      throw err;
    } finally {
      setRevoking(false);
    }
  }, [patientId, revokeReason, fetchPatientData]);

  const handleRevokePinSubmit = useCallback(async () => {
    if (revokeReason.trim().length < 10) {
      message.warning('El motivo debe tener al menos 10 caracteres.');
      return;
    }
    if (!/^\d{4}$/.test(revokePin)) {
      message.warning('Ingrese su PIN de 4 dígitos.');
      return;
    }
    await submitRevocation({ method: 'pin', pin: revokePin });
  }, [revokeReason, revokePin, submitRevocation]);

  const handleRevokePadConfirm = useCallback(async (pngDataUrl) => {
    if (revokeReason.trim().length < 10) {
      message.warning('El motivo debe tener al menos 10 caracteres.');
      return;
    }
    setRevokePadOpen(false);
    await submitRevocation({ method: 'pad', dataUrl: pngDataUrl });
  }, [revokeReason, submitRevocation]);

  // PASO 1 — paciente firma con pad → guardamos PNG y avanzamos al doctor.
  const handleHCPatientSigned = useCallback((pngDataUrl) => {
    setHcPatientSig(pngDataUrl);
    setHcStep('doctor');
  }, []);

  // PASO 2 — doctor co-firma (PIN o pad). Recién aquí se postea al backend.
  const handleHCDoctorSigned = useCallback(async (doctorSignature) => {
    if (!hcPatientSig) {
      message.error('Falta la firma del paciente. Reinicie el flujo.');
      setHcStep(null);
      return;
    }
    setIsSavingHCConsent(true);
    try {
      const { data } = await API.post(`/patients/${patientId}/finalize-history`, {
        patientSignature: hcPatientSig,
        textoConsentimiento: CONSENTIMIENTO_HC_TEXTO,
        doctorSignature,
      });
      if (data?.success) {
        message.success('Historia clínica firmada (paciente + doctor).');
        setHcStep(null);
        setHcPatientSig(null);
        await fetchPatientData();
      } else {
        throw new Error(data?.error || 'No se pudo registrar la firma');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error al guardar la firma';
      message.error(msg);
      throw err; // que el modal muestre el error
    } finally {
      setIsSavingHCConsent(false);
    }
  }, [patientId, hcPatientSig, fetchPatientData]);

  const handleHCCancel = useCallback(() => {
    if (isSavingHCConsent) return;
    setHcStep(null);
    setHcPatientSig(null);
  }, [isSavingHCConsent]);

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

  // Carga el estado clínico al cambiar de paciente. Independiente de
  // `patientData` (sólo necesita patientId) — antes dependíamos del objeto
  // patientData y se re-disparaba cada vez que cambiaba de referencia, que
  // era constantemente.
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    (async () => {
      try {
        const odontogramaService = await import('../odontogram/api/odontograma-service.js');
        if (cancelled) return;
        const clinicalState = await odontogramaService.default.getClinicalOdontogramState(patientId);
        if (cancelled) return;
        setClinicalOdontogramData(clinicalState.datos || []);
        setClinicalOdontogramExists(clinicalState.exists || false);
      } catch {
        if (cancelled) return;
        setClinicalOdontogramData([]);
        setClinicalOdontogramExists(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

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
    {
      key: 'attachments',
      label: 'Adjuntos',
      children: (
        <>
          <h2 className="print-section-title">Adjuntos</h2>
          <PatientAttachments patientId={patientId} />
        </>
      ),
    },
  ];

  return (
    <AppointmentProvider appointmentId={currentAppointmentId}>
    <div className="patient-detail">
      <div className="patient-detail__header">
        <button className="back-button" onClick={() => navigate("/pacientes")}>
          ← Regresar
        </button>
        <div className="patient-detail__header-actions">
          {patientData.patient.consentimientoHC?.firmadoEn && !patientData.patient.consentimientoHC?.revocadoEn ? (
            <>
              <span
                className="hc-consent-badge"
                title={`Firmada el ${new Date(patientData.patient.consentimientoHC.firmadoEn).toLocaleString()} — expediente en solo lectura`}
              >
                ✓ HC firmada · solo lectura
              </span>
              {canFinalizeHC && (
                <button
                  type="button"
                  className="Boton_RevocarHC"
                  onClick={() => setIsRevokeOpen(true)}
                  aria-label="Revocar consentimiento para poder corregir"
                  title="Revocar consentimiento para corregir información clínica"
                >
                  Revocar
                </button>
              )}
            </>
          ) : canFinalizeHC ? (
            <button
              type="button"
              className="Boton_FinalizarHC button-primary"
              onClick={() => setHcStep('patient')}
              aria-label="Finalizar historia clínica con firma del paciente"
            >
              Finalizar historia clínica
            </button>
          ) : null}
          <button
            className="Boton_Editar button-primary"
            onClick={handleEditClick}
            aria-label="Editar datos del paciente"
            disabled={Boolean(patientData.patient.consentimientoHC?.firmadoEn && !patientData.patient.consentimientoHC?.revocadoEn)}
            title={patientData.patient.consentimientoHC?.firmadoEn && !patientData.patient.consentimientoHC?.revocadoEn
              ? 'La HC está firmada por el paciente. Revoque el consentimiento para corregir.'
              : 'Editar datos del paciente'}
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

      {/* PASO 1 — Firma del paciente con pad */}
      <SignaturePadModal
        isOpen={hcStep === 'patient'}
        onClose={handleHCCancel}
        onConfirm={handleHCPatientSigned}
        title="Consentimiento de historia clínica"
        subtitle="El paciente lee el texto y firma en el cuadro"
        signerName={[
          patientData.patient.primer_nombre,
          patientData.patient.otros_nombres,
          patientData.patient.apellido_paterno,
          patientData.patient.apellido_materno,
        ].filter(Boolean).join(' ')}
        signerRole="Paciente"
        consentText={
          <>
            {CONSENTIMIENTO_HC_TEXTO.split('\n\n').map((p, i) => (
              <p key={i} style={{ whiteSpace: 'pre-line' }}>{p}</p>
            ))}
          </>
        }
        confirmLabel="Continuar a firma del doctor"
        loading={isSavingHCConsent}
      />

      {/* PASO 2 — Co-firma del doctor (PIN o pad) */}
      <DoctorSignStep
        isOpen={hcStep === 'doctor'}
        onClose={handleHCCancel}
        onConfirm={handleHCDoctorSigned}
        title="Co-firma del doctor — Historia clínica"
        subtitle="El doctor valida que la historia clínica es completa y correcta (NOM-013)."
        loading={isSavingHCConsent}
      />

      {/* Revocación del consentimiento HC — motivo + firma del doctor */}
      {isRevokeOpen && !revokePadOpen && (
        <div className="signature-pad-overlay" onClick={() => !revoking && setIsRevokeOpen(false)}>
          <div className="signature-pad-card" onClick={(e) => e.stopPropagation()}>
            <div className="signature-pad-header">
              <h2>Revocar consentimiento de HC</h2>
              <p className="signature-pad-subtitle">
                Esto reabre el expediente para correcciones. Quedará registrado el motivo y tu firma.
              </p>
            </div>

            <div className="signature-pad-consent">
              <p><strong>Motivo (mínimo 10 caracteres)</strong></p>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Ej. Corrección de antecedente heredo-familiar incorrecto reportado por el paciente."
                rows={3}
                disabled={revoking}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div className="doctor-sign-tabs">
              <button
                type="button"
                className={`doctor-sign-tab${revokeMethod === 'pin' ? ' is-active' : ''}`}
                onClick={() => setRevokeMethod('pin')}
                disabled={revoking}
              >
                Firmar con PIN
              </button>
              <button
                type="button"
                className={`doctor-sign-tab${revokeMethod === 'pad' ? ' is-active' : ''}`}
                onClick={() => setRevokeMethod('pad')}
                disabled={revoking}
              >
                Firmar con pad
              </button>
            </div>

            {revokeMethod === 'pin' ? (
              <form
                className="doctor-sign-pin"
                onSubmit={(e) => { e.preventDefault(); handleRevokePinSubmit(); }}
              >
                <label htmlFor="revoke-pin">PIN de 4 dígitos</label>
                <input
                  id="revoke-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={revokePin}
                  onChange={(e) => setRevokePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  disabled={revoking}
                  autoFocus
                />
                <div className="signature-pad-actions">
                  <button
                    type="button"
                    className="signature-pad-btn signature-pad-btn-cancel"
                    onClick={() => setIsRevokeOpen(false)}
                    disabled={revoking}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="signature-pad-btn signature-pad-btn-confirm"
                    disabled={revoking || revokePin.length !== 4 || revokeReason.trim().length < 10}
                  >
                    {revoking ? 'Revocando…' : 'Revocar consentimiento'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="doctor-sign-pad-prompt">
                <p>Se abrirá el pad para que dibujes tu firma autorizando la revocación.</p>
                <div className="signature-pad-actions">
                  <button
                    type="button"
                    className="signature-pad-btn signature-pad-btn-cancel"
                    onClick={() => setIsRevokeOpen(false)}
                    disabled={revoking}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="signature-pad-btn signature-pad-btn-confirm"
                    onClick={() => setRevokePadOpen(true)}
                    disabled={revoking || revokeReason.trim().length < 10}
                  >
                    Abrir pad
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <SignaturePadModal
        isOpen={isRevokeOpen && revokePadOpen}
        onClose={() => setRevokePadOpen(false)}
        onConfirm={handleRevokePadConfirm}
        title="Firma del doctor — revocación"
        subtitle="Dibuja tu firma para autorizar la revocación"
        signerName={user?.nombre || ''}
        signerRole={user?.cedulaProfesional ? `Cédula ${user.cedulaProfesional}` : 'Doctor'}
        confirmLabel="Firmar y revocar"
        loading={revoking}
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
    </AppointmentProvider>
  );
};

export default PatientDetail;
