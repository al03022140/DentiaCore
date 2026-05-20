import React, { useEffect, useState } from 'react';
import "../styles/next-patient.css";
import userNot from '../../../assets/images/icons/Profile Default.svg';
import { getTodayAppointments } from '../../../shared/services/appointment-service';

const STATUS_MAP = {
  Pendiente:  { cssClass: 'waiting',     label: 'Pendiente' },
  Confirmada: { cssClass: 'confirmed',   label: 'Confirmada' },
  EnCurso:    { cssClass: 'in-progress', label: 'En curso' },
};

const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const formatRelativeDay = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, tomorrow)) return 'Mañana';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

const NextPatient = () => {
  const [nextPatient, setNextPatient] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const appointments = await getTodayAppointments();
        if (cancelled) return;
        const now = new Date();
        if (!Array.isArray(appointments)) {
          setNextPatient(null);
          return;
        }
        const upcoming = appointments
          .filter(apt => apt.estado !== 'Cancelada' && apt.estado !== 'Pasada' && new Date(apt.fecha_hora) > now)
          .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))[0];
        setNextPatient(upcoming || null);
      } catch (error) {
        if (cancelled) return;
        console.error('Error al obtener citas:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!nextPatient) {
    return (
      <div className="next-patient-card next-patient-card--empty">
        <div className="next-patient-card_header">
          <span className="next-patient-card_title">Próximo Paciente</span>
        </div>
        <div className="next-patient-card_empty">
          <p>No hay pacientes programados.</p>
        </div>
      </div>
    );
  }

  const patient = nextPatient.paciente_id;
  const patientName = patient
    ? `${patient.nombre || ''} ${patient.apellidos || ''}`.trim()
    : 'Paciente';
  const patientImage = patient?.foto
    ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${patient._id}/${patient.foto}`
    : null;
  const status = STATUS_MAP[nextPatient.estado] || { cssClass: 'waiting', label: nextPatient.estado };

  return (
    <div className="next-patient-card">
      <div className="next-patient-card_header">
        <span className="next-patient-card_title">Próximo Paciente</span>
      </div>

      <div className="next-patient-card_body">
        <div className="next-patient-card_avatar">
          <img
            src={patientImage || userNot}
            alt={patientName}
            className={patientImage ? undefined : 'profile-default-avatar'}
            onError={e => {
              e.target.src = userNot;
              e.target.classList.add('profile-default-avatar');
            }}
          />
        </div>

        <div className="next-patient-card_content">
          <div className="next-patient-card_name-row">
            <strong className="next-patient-card_name">{patientName}</strong>
            <span className={`next-patient-card_status next-patient-card_status--${status.cssClass}`}>
              {status.label}
            </span>
          </div>

          <div className="next-patient-card_chips">
            <span className="next-patient-card_chip next-patient-card_chip--time">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {formatTime(nextPatient.fecha_hora)}
            </span>
            <span className="next-patient-card_chip next-patient-card_chip--day">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {formatRelativeDay(nextPatient.fecha_hora)}
            </span>
            {patient?.telefono && (
              <span className="next-patient-card_chip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {patient.telefono}
              </span>
            )}
          </div>

          {(nextPatient.motivo || nextPatient.comentarioProcedimiento) && (
            <div className="next-patient-card_meta">
              {nextPatient.motivo && (
                <div className="next-patient-card_meta-item">
                  <span className="next-patient-card_meta-label">Motivo</span>
                  <span className="next-patient-card_meta-value">{nextPatient.motivo}</span>
                </div>
              )}
              {nextPatient.comentarioProcedimiento && (
                <div className="next-patient-card_meta-item">
                  <span className="next-patient-card_meta-label">Comentario</span>
                  <span className="next-patient-card_meta-value">{nextPatient.comentarioProcedimiento}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NextPatient;
