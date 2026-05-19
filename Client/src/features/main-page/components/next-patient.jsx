import React, { useEffect, useState } from 'react';
import "../styles/next-patient.css";
import userNot from '../../../assets/images/icons/Profile Default.svg';
import { getTodayAppointments } from '../../../shared/services/appointment-service';

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
      <div className="patient-info-wrapper no-patient">
        <div className="patient-info">
          <p>No hay pacientes programados.</p>
        </div>
      </div>
    );
  }

  const patient = nextPatient.paciente_id;
  const patientName = patient ? `${patient.nombre || ''} ${patient.apellidos || ''}`.trim() : 'Paciente';
  const patientImage = patient?.foto
    ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${patient._id}/${patient.foto}`
    : null;

  return (
    <div className="patient-info-wrapper">
      <div className="patient-info">
        <div className="patient-image">
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
        <div className="patient-details">
          <p>Próximo Paciente:</p>
          <strong>{patientName}</strong>
          <p>
            {new Date(nextPatient.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            {nextPatient.motivo ? ` — ${nextPatient.motivo}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

export default NextPatient;
