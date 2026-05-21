import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../styles/next-patient.css";
import userNot from '../../../assets/images/icons/Profile Default.svg';
import { getTodayAppointments } from '../../../shared/services/appointment-service';

const STATUS_MAP = {
  Pendiente:  { cssClass: 'waiting',     label: 'Pendiente'  },
  Confirmada: { cssClass: 'confirmed',   label: 'Confirmada' },
  EnCurso:    { cssClass: 'in-progress', label: 'En curso'   },
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

const formatCountdown = (iso) => {
  const diffMs = new Date(iso) - new Date();
  const totalMin = Math.floor(diffMs / 60000);
  if (totalMin < 0) return null;
  if (totalMin < 1) return 'En curso';
  if (totalMin < 60) return `en ${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins > 0 ? `en ${hours} h ${mins} min` : `en ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'mañana' : `en ${days} días`;
};

const NextPatient = () => {
  const navigate = useNavigate();
  const [nextPatient, setNextPatient] = useState(null);
  const [, setTick] = useState(0);

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

  // Refresca el countdown cada 30s mientras haya cita.
  useEffect(() => {
    if (!nextPatient) return undefined;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [nextPatient]);

  if (!nextPatient) {
    return (
      <div className="np-home-card np-home-card--empty">
        <div className="np-home-card_header">
          <span className="np-home-card_eyebrow">Próximo Paciente</span>
        </div>
        <div className="np-home-card_empty">
          <div className="np-home-card_empty-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="np-home-card_empty-title">Agenda libre</p>
          <p className="np-home-card_empty-caption">No hay pacientes programados.</p>
          <button
            type="button"
            className="np-home-card_cta np-home-card_cta--ghost"
            onClick={() => navigate('/consultas')}
          >
            Ver agenda
          </button>
        </div>
      </div>
    );
  }

  const patient = nextPatient.paciente_id || {};
  const fullName = [patient.primer_nombre, patient.otros_nombres, patient.apellido_paterno, patient.apellido_materno]
    .filter(Boolean).join(' ').trim();
  const patientName = fullName
    || `${patient.nombre || ''} ${patient.apellidos || ''}`.trim()
    || 'Paciente';
  const photo = patient.photoURL || patient.foto;
  const patientImage = photo && patient._id
    ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${patient._id}/${encodeURIComponent(photo)}`
    : null;
  const status = STATUS_MAP[nextPatient.estado] || { cssClass: 'waiting', label: nextPatient.estado };
  const countdown = formatCountdown(nextPatient.fecha_hora);
  const dayLabel = formatRelativeDay(nextPatient.fecha_hora);
  const motivo = nextPatient.motivo || nextPatient.comentarioProcedimiento;

  return (
    <div className={`np-home-card np-home-card--${status.cssClass}`}>
      <span className="np-home-card_accent" aria-hidden="true" />

      <div className="np-home-card_header">
        <span className="np-home-card_eyebrow">Próximo Paciente</span>
        <span className={`np-home-card_status np-home-card_status--${status.cssClass}`}>
          {status.label}
        </span>
      </div>

      <div className="np-home-card_body">
        <div className={`np-home-card_avatar np-home-card_avatar--${status.cssClass}`}>
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

        <div className="np-home-card_content">
          <div className="np-home-card_time-row">
            <span className="np-home-card_time">{formatTime(nextPatient.fecha_hora)}</span>
            {countdown && (
              <span className={`np-home-card_countdown np-home-card_countdown--${status.cssClass}`}>
                {countdown}
              </span>
            )}
          </div>

          <p className="np-home-card_name" title={patientName}>{patientName}</p>

          <div className="np-home-card_meta-row">
            <span className="np-home-card_meta-chip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dayLabel}
            </span>
            {patient?.telefono && (
              <span className="np-home-card_meta-chip">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {patient.telefono}
              </span>
            )}
          </div>

          {motivo && (
            <p className="np-home-card_motivo" title={motivo}>
              <span className="np-home-card_motivo-label">Motivo</span>
              <span className="np-home-card_motivo-value">{motivo}</span>
            </p>
          )}
        </div>
      </div>

      <div className="np-home-card_footer">
        <button
          type="button"
          className="np-home-card_cta"
          onClick={() => navigate('/consultas')}
        >
          Ir a Consultas
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default NextPatient;
