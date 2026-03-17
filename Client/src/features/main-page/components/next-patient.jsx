import React, { useEffect, useState } from 'react';
import "../styles/next-patient.css";
import userNot from '../../../assets/images/avatars/UserNot.png';
import { getTodayAppointments } from '../../../shared/services/appointment-service';

const NextPatient = () => {
  const [nextPatient, setNextPatient] = useState(null);

  useEffect(() => {
    const fetchNextPatient = async () => {
      try {
        const appointments = await getTodayAppointments();
        const now = new Date();

        if (!Array.isArray(appointments)) {
          setNextPatient(null);
          return;
        }

        // Find first upcoming appointment that isn't cancelled/past
        const upcoming = appointments
          .filter(apt => apt.estado !== 'Cancelada' && apt.estado !== 'Pasada' && new Date(apt.fecha_hora) > now)
          .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))[0];

        setNextPatient(upcoming || null);
      } catch (error) {
        console.error('Error al obtener citas:', error);
      }
    };

    fetchNextPatient();
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
            onError={e => { e.target.src = userNot; }}
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
