import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './styles/consultas-page.css';
import userNot from '../../assets/images/avatars/UserNot.png';
import { getTodayAppointments } from '../../shared/services/appointment-service';
import CreateAppointmentModal from './components/CreateAppointmentModal';

const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const calculateAge = (fechaNacimiento) => {
  if (!fechaNacimiento) return '—';
  const birth = new Date(fechaNacimiento);
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const getPatientName = (apt) => {
  const p = apt.paciente_id;
  if (!p) return 'Paciente desconocido';
  return `${p.nombre || ''} ${p.apellidos || ''}`.trim();
};

const getPatientImage = (apt) => {
  const p = apt.paciente_id;
  if (!p || !p.foto) return null;
  return `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${p._id}/${p.foto}`;
};

const statusMap = {
  Pendiente: 'waiting',
  Confirmada: 'confirmed',
  Cancelada: 'cancelled',
  Pasada: 'completed'
};

const ConsultasPage = () => {
  const navigate = useNavigate();
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [nextPatient, setNextPatient] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadAgenda = useCallback(async () => {
    try {
      setLoading(true);
      const appointments = await getTodayAppointments();
      setAgenda(Array.isArray(appointments) ? appointments : []);
    } catch {
      setAgenda([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgenda(); }, [loadAgenda]);

  // Determine next patient & default selection
  useEffect(() => {
    const now = new Date();
    const upcoming = agenda.filter(a =>
      a.estado !== 'Cancelada' && a.estado !== 'Pasada' && new Date(a.fecha_hora) >= now
    );
    const completed = agenda.filter(a => a.estado === 'Pasada' || a.estado === 'Cancelada');

    if (upcoming.length > 0) {
      setNextPatient(upcoming[0]);
      setSelectedConsultation(upcoming[0]);
    } else if (completed.length > 0) {
      setNextPatient(null);
      setSelectedConsultation(completed[0]);
    } else {
      setNextPatient(null);
      setSelectedConsultation(null);
    }
  }, [agenda]);

  const handleSelectConsultation = (consultation) => {
    setSelectedConsultation(consultation);
  };

  const handleStartConsultation = (apt) => {
    const patientId = apt.paciente_id?._id || apt.paciente_id;
    if (patientId) navigate(`/patient/${patientId}`);
  };

  const now = new Date();
  const upcomingConsultations = agenda.filter(a =>
    a.estado !== 'Cancelada' && a.estado !== 'Pasada' && new Date(a.fecha_hora) >= now
  );
  const completedConsultations = agenda.filter(a =>
    a.estado === 'Pasada' || a.estado === 'Cancelada'
  );

  const renderItems = (items) => {
    if (!items || items.length === 0) return <p className="text-muted">Sin servicios asignados.</p>;
    return (
      <ul className="plan-today-list">
        {items.map((item, idx) => (
          <li key={idx}>
            {item.nombre} — x{item.cantidad} — ${item.subtotal?.toLocaleString('es-MX')}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="consultas-page">
      {/* --- COLUMNA IZQUIERDA --- */}
      <div className="consultas-left">

        {/* Panel Superior: Siguiente Paciente */}
        {loading ? (
          <div className="next-patient-card">
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando agenda...</p>
          </div>
        ) : nextPatient ? (
          <div className="next-patient-card">
            <div className="next-patient-header">
              <img
                src={getPatientImage(nextPatient) || userNot}
                alt={getPatientName(nextPatient)}
                className="next-patient-avatar"
                onError={e => { e.target.src = userNot; }}
              />
              <div className="next-patient-info">
                <span className="next-patient-time">Siguiente: {formatTime(nextPatient.fecha_hora)} hrs</span>
                <h2>{getPatientName(nextPatient)}</h2>
                <span className={`badge-status ${statusMap[nextPatient.estado] || 'waiting'}`}>
                  {nextPatient.estado}
                </span>
              </div>
            </div>

            <div className="next-patient-reason">
              <strong>Motivo de visita:</strong>
              {nextPatient.motivo}
            </div>

            {nextPatient.comentarioProcedimiento && (
              <div className="next-patient-reason">
                <strong>Procedimiento:</strong>
                {nextPatient.comentarioProcedimiento}
              </div>
            )}

            <button
              className="start-consultation-btn"
              onClick={() => handleStartConsultation(nextPatient)}
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
                <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>Detalle de Cita</h3>
                <small>Seleccionada: {getPatientName(selectedConsultation)}</small>
              </div>
              <div className="patient-tags">
                <span>{calculateAge(selectedConsultation.paciente_id?.fecha_nacimiento)} años</span>
              </div>
            </div>

            <div className="timeline-section">
              <h4>Motivo</h4>
              <p>{selectedConsultation.motivo}</p>
            </div>

            {selectedConsultation.comentarioProcedimiento && (
              <div className="timeline-section">
                <h4>Procedimiento</h4>
                <p>{selectedConsultation.comentarioProcedimiento}</p>
              </div>
            )}

            <div className="timeline-section">
              <h4>Servicios a realizar</h4>
              {renderItems(selectedConsultation.items)}
            </div>

            {selectedConsultation.totalEstimado > 0 && (
              <div className="timeline-section">
                <h4>Total estimado</h4>
                <p style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                  ${selectedConsultation.totalEstimado?.toLocaleString('es-MX')}
                </p>
              </div>
            )}

            {selectedConsultation.observaciones && (
              <div className="timeline-section">
                <h4>Observaciones</h4>
                <p>{selectedConsultation.observaciones}</p>
              </div>
            )}

            <div className="detail-actions">
              <button
                className="secondary-btn"
                onClick={() => handleStartConsultation(selectedConsultation)}
              >
                Ver Expediente Completo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- COLUMNA DERECHA --- */}
      <div className="consultas-right">
        <div className="consultas-right-header">
          <h3>Agenda del Día</h3>
          <button
            className="consultas-add-btn"
            onClick={() => setShowCreateModal(true)}
            title="Nueva cita"
          >
            +
          </button>
        </div>

        <div className="consultas-list-container">
          <div className="list-section-title">Próximas Consultas</div>
          {upcomingConsultations.length > 0 ? (
            upcomingConsultations.map(apt => (
              <div
                key={apt._id}
                className={`consultation-item ${selectedConsultation?._id === apt._id ? 'active' : ''}`}
                onClick={() => handleSelectConsultation(apt)}
              >
                <div className="consultation-time-box">
                  <span className="time-hour">{formatTime(apt.fecha_hora)}</span>
                </div>
                <div className="consultation-info">
                  <span className="consultation-patient-name">{getPatientName(apt)}</span>
                  <span className="consultation-reason">{apt.motivo}</span>
                </div>
                <div className={`consultation-status badge-status ${statusMap[apt.estado] || 'waiting'}`}>
                  {apt.estado}
                </div>
              </div>
            ))
          ) : (
            <p style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>No hay consultas pendientes.</p>
          )}

          <div className="list-section-title">Consultas Realizadas</div>
          {completedConsultations.length > 0 ? (
            completedConsultations.map(apt => (
              <div
                key={apt._id}
                className="consultation-item completed"
                onClick={() => handleSelectConsultation(apt)}
              >
                <div className="consultation-time-box">
                  <span className="time-hour">{formatTime(apt.fecha_hora)}</span>
                </div>
                <div className="consultation-info">
                  <span className="consultation-patient-name">{getPatientName(apt)}</span>
                  <span className="consultation-reason">{apt.motivo}</span>
                </div>
                <div className="consultation-status">{apt.estado}</div>
              </div>
            ))
          ) : (
            <p style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Aún no hay consultas completadas.</p>
          )}
        </div>
      </div>

      <CreateAppointmentModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadAgenda}
      />
    </div>
  );
};

export default ConsultasPage;
