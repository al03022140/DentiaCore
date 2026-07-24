import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../styles/next-patient.css";
import userNot from '../../../assets/images/icons/Profile Default.svg';
import { getTodayAppointments } from '../../../shared/services/appointment-service';

// Prioridad por tiempo restante → color del acento de la card
// (comunica urgencia antes de leer el texto): azul >30, amarillo 15-30,
// naranja 5-15, rojo <5 min (o cita ya en curso).
const priorityTier = (iso) => {
  const min = Math.floor((new Date(iso) - new Date()) / 60000);
  if (min < 5) return 'red';
  if (min < 15) return 'orange';
  if (min < 30) return 'yellow';
  return 'blue';
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

const ageFromDOB = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
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
          .filter(apt => !['Cancelada', 'Pasada', 'NoShow'].includes(apt.estado) && new Date(apt.fecha_hora) > now)
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
  // Relativa a propósito (cookie same-origin + helmet CORP) — ver ConsultasPage.
  const patientImage = patient.photoURL || null;
  const tier = priorityTier(nextPatient.fecha_hora);
  const countdown = formatCountdown(nextPatient.fecha_hora);
  const dayLabel = formatRelativeDay(nextPatient.fecha_hora);
  const motivo = nextPatient.motivo || nextPatient.comentarioProcedimiento;

  // Identidad
  const edad = ageFromDOB(patient.fecha_nacimiento);
  const sexo = patient.sexo || null;                 // hoy no llega (PII fuera del populate)
  const clinicId = patient.paciente_id || null;      // número de expediente
  const patientRouteId = patient._id || null;

  // Cita (chips fila 1) — se renderiza solo lo que tenga dato
  const consultorio = nextPatient.consultorio || null;   // campo futuro

  // Alertas clínicas + estado de pago (fila 2) — datos que HOY no vienen del
  // endpoint; se dejan cableados para renderizar SOLO cuando existan y el
  // usuario tenga rol clínico (decisión de cumplimiento pendiente del dueño).
  const alertas = Array.isArray(nextPatient.alertasMedicas) ? nextPatient.alertasMedicas : [];
  const pagoPendiente = nextPatient.pagoPendiente || null;
  const hasAlertRow = alertas.length > 0 || !!pagoPendiente;

  const goToExpediente = () => {
    if (patientRouteId) navigate(`/patient/${patientRouteId}`);
    else navigate('/consultas');
  };

  return (
    <div
      className={`np-card np-card--p-${tier}`}
      role="button"
      tabIndex={0}
      onClick={goToExpediente}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToExpediente(); }
      }}
      aria-label={`Próximo paciente: ${patientName}. Ver expediente`}
    >
      {/* Header: título + countdown */}
      <div className="np-card_header">
        <span className="np-card_title">Próximo paciente</span>
        {countdown && (
          <span className={`np-card_countdown np-card_countdown--p-${tier}`}>
            {countdown}
          </span>
        )}
      </div>

      {/* Identidad: foto + nombre / ID / edad·sexo */}
      <div className="np-card_identity">
        <div className="np-card_photo">
          <img
            src={patientImage || userNot}
            alt=""
            className={patientImage ? undefined : 'profile-default-avatar'}
            onError={e => {
              e.target.src = userNot;
              e.target.classList.add('profile-default-avatar');
            }}
          />
        </div>
        <div className="np-card_who">
          <span className="np-card_name" title={patientName}>{patientName}</span>
          {(clinicId || edad != null || sexo) && (
            <span className="np-card_meta">
              {clinicId && <span className="np-card_id">{clinicId}</span>}
              {[
                edad != null ? `${edad} años` : null,
                sexo,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </div>

      {/* Fila de la cita: hora (fuerte) + procedimiento como badge */}
      <div className="np-card_row">
        <span className="np-card_hora" title="Hora de la cita">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {formatTime(nextPatient.fecha_hora)}
          {dayLabel !== 'Hoy' && <span className="np-card_dia"> · {dayLabel}</span>}
        </span>
        {motivo && (
          <span className="np-card_proc" title={`Procedimiento: ${motivo}`}>
            {motivo}
          </span>
        )}
        {consultorio && (
          <span className="np-card_proc" title={`Consultorio: ${consultorio}`}>
            {consultorio}
          </span>
        )}
      </div>

      {/* Fila 2: alertas clínicas / pago (solo si hay dato) */}
      {hasAlertRow && (
        <div className="np-card_row np-card_row--alerts">
          {alertas.map((a, i) => (
            <span key={i} className="np-card_chip np-card_chip--alert" title={a}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {a}
            </span>
          ))}
          {pagoPendiente && (
            <span className="np-card_chip np-card_chip--warn" title="Pago pendiente">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              {typeof pagoPendiente === 'string' ? pagoPendiente : 'Pago pendiente'}
            </span>
          )}
        </div>
      )}

      {/* Footer: CTA */}
      <div className="np-card_footer">
        <span className="np-card_cta">
          Abrir expediente
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
    </div>
  );
};

export default NextPatient;
