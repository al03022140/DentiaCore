import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './styles/consultas-page.css';
import userNot from '../../assets/images/avatars/UserNot.png';

// Mock Data para visualizar la pantalla inmediatamente
const MOCK_AGENDA = [
  {
    id: 101,
    time: "09:00",
    patientName: "Juan Pérez",
    patientImage: null,
    reason: "Limpieza General",
    status: "Confirmado", // Pendiente, Confirmada, En Progreso, Completada
    age: 34,
    allergies: "Penicilina",
    history: [
      { date: "15/12/2025", action: "Consulta inicial" }
    ],
    plan: [
      { id: 1, text: "Profilaxis completa", done: false },
      { id: 2, text: "Revisión de caries", done: false }
    ],
    isCompleted: false
  },
  {
    id: 102,
    time: "10:30",
    patientName: "María García",
    patientImage: null,
    reason: "Revisión Implante",
    status: "En espera",
    age: 45,
    allergies: "Ninguna",
    history: [
      { date: "10/11/2025", action: "Colocación Implante 36" },
      { date: "24/11/2025", action: "Retiro de puntos" }
    ],
    plan: [
      { id: 1, text: "Radiografía de control", done: false },
      { id: 2, text: "Evaluación de oseointegración", done: false }
    ],
    isCompleted: false
  },
  {
    id: 103,
    time: "12:00",
    patientName: "Carlos López",
    patientImage: null,
    reason: "Dolor Muela",
    status: "Pendiente",
    age: 28,
    allergies: "Ninguna",
    history: [],
    plan: [
      { id: 1, text: "Diagnóstico urgencia", done: false }
    ],
    isCompleted: false
  },
  // Completados
  {
    id: 99,
    time: "08:00",
    patientName: "Ana Martínez",
    patientImage: null,
    reason: "Consulta Ortodoncia",
    status: "Completada",
    age: 22,
    allergies: "Latex",
    history: [],
    plan: [],
    isCompleted: true
  }
];

const ConsultasPage = () => {
  const navigate = useNavigate();
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [nextPatient, setNextPatient] = useState(null);
  const [agenda, setAgenda] = useState(MOCK_AGENDA);

  // Al cargar, determinar quién es el siguiente paciente y seleccionar el primero por defecto
  useEffect(() => {
    // Lógica real: Filtrar por hora actual. Aquí simulamos que el "102" es el siguiente.
    // En produccion usaríamos `new Date()` para comparar.
    const upcoming = agenda.filter(a => !a.isCompleted);
    
    if (upcoming.length > 0) {
      setNextPatient(upcoming[0]);
      setSelectedConsultation(upcoming[0]);
    }
  }, [agenda]);

  const handleSelectConsultation = (consultation) => {
    setSelectedConsultation(consultation);
  };

  const handleStartConsultation = (patientId) => {
    // Navegar al detalle del paciente
    // En un caso real usaríamos el ID real de mongo (ej. _id)
    // Aquí simulamos navegación a un ID genérico si no tenemos el real
    navigate(`/patient/${patientId}`);
  };

  const renderTimeline = (history) => {
    if (!history || history.length === 0) return <p className="text-muted">Sin historial reciente.</p>;
    return (
      <div className="timeline-container">
        {history.map((item, idx) => (
          <div key={idx} className="timeline-item">
            <div className="timeline-date">{item.date}</div>
            <div className="timeline-content">{item.action}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderPlan = (plan) => {
    if (!plan || plan.length === 0) return <p className="text-muted">No hay plan específico definido.</p>;
    return (
      <ul className="plan-today-list">
        {plan.map(item => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    );
  };

  const upcomingConsultations = agenda.filter(c => !c.isCompleted);
  const completedConsultations = agenda.filter(c => c.isCompleted);

  return (
    <div className="consultas-page">
      {/* --- COLUMNA IZQUIERDA --- */}
      <div className="consultas-left">
        
        {/* Panel Superior: Siguiente Paciente */}
        {nextPatient ? (
          <div className="next-patient-card">
            <div className="next-patient-header">
              <img 
                src={nextPatient.patientImage || userNot} 
                alt={nextPatient.patientName} 
                className="next-patient-avatar"
              />
              <div className="next-patient-info">
                <span className="next-patient-time">Siguiente: {nextPatient.time} hrs</span>
                <h2>{nextPatient.patientName}</h2>
                <span className={`badge-status ${nextPatient.status === 'Confirmado' ? 'confirmed' : 'waiting'}`}>
                  {nextPatient.status}
                </span>
              </div>
            </div>

            <div className="next-patient-reason">
              <strong>Motivo de visita:</strong>
              {nextPatient.reason}
            </div>

            <button 
              className="start-consultation-btn"
              onClick={() => handleStartConsultation(nextPatient.id)}
            >
              INICIAR CONSULTA AHORA
            </button>
          </div>
        ) : (
          <div className="next-patient-card">
            <h2>No hay más pacientes por hoy.</h2>
          </div>
        )}

        {/* Panel Inferior: Detalle de Selección */}
        {selectedConsultation && (
          <div className="selected-detail-panel">
            <div className="detail-header-info">
              <div>
                <h3 style={{margin: 0, color: 'var(--color-primary)'}}>Detalle de Cita</h3>
                <small>Seleccionada: {selectedConsultation.patientName}</small>
              </div>
              <div className="patient-tags">
                <span>{selectedConsultation.age} años</span>
                {selectedConsultation.allergies !== "Ninguna" && (
                  <span style={{backgroundColor: '#f8d7da', color: '#721c24'}}>
                    Alergia: {selectedConsultation.allergies}
                  </span>
                )}
              </div>
            </div>

            <div className="timeline-section">
              <h4>Historial Reciente (Lo que se ha hecho)</h4>
              {renderTimeline(selectedConsultation.history)}
            </div>

            <div className="timeline-section">
              <h4>Plan para Hoy (A realizar)</h4>
              {renderPlan(selectedConsultation.plan)}
            </div>

            <div className="detail-actions">
              <button 
                className="secondary-btn"
                 onClick={() => handleStartConsultation(selectedConsultation.id)}
              >
                Ver Expediente Completo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- COLUMNA DERECHA --- */}
      <div className="consultas-right">
        <h3>Agenda del Día</h3>
        
        <div className="consultas-list-container">
          <div className="list-section-title">Próximas Consultas</div>
          {upcomingConsultations.length > 0 ? (
            upcomingConsultations.map(consultation => (
              <div 
                key={consultation.id} 
                className={`consultation-item ${selectedConsultation?.id === consultation.id ? 'active' : ''}`}
                onClick={() => handleSelectConsultation(consultation)}
              >
                <div className="consultation-time-box">
                  <span className="time-hour">{consultation.time}</span>
                </div>
                <div className="consultation-info">
                  <span className="consultation-patient-name">{consultation.patientName}</span>
                  <span className="consultation-reason">{consultation.reason}</span>
                </div>
                <div className="consultation-status">{consultation.status}</div>
              </div>
            ))
          ) : (
            <p style={{padding: '1rem', fontStyle: 'italic', color: '#999'}}>No hay consultas pendientes.</p>
          )}

          <div className="list-section-title">Consultas Realizadas</div>
          {completedConsultations.length > 0 ? (
            completedConsultations.map(consultation => (
              <div 
                key={consultation.id} 
                className="consultation-item completed"
                onClick={() => handleSelectConsultation(consultation)}
              >
                <div className="consultation-time-box">
                  <span className="time-hour">{consultation.time}</span>
                </div>
                <div className="consultation-info">
                  <span className="consultation-patient-name">{consultation.patientName}</span>
                  <span className="consultation-reason">{consultation.reason}</span>
                </div>
                <div className="consultation-status">Completada</div>
              </div>
            ))
          ) : (
            <p style={{padding: '1rem', fontStyle: 'italic', color: '#999'}}>Aún no hay consultas completadas.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsultasPage;
