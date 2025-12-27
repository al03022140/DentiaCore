import React, { useEffect, useState } from 'react';
import "../styles/next-patient.css";
import userNot from '../../../assets/images/avatars/UserNot.png'; // Imagen por defecto

const API_URL = import.meta.env.VITE_API_URL;

const NextPatient = () => {
  const [nextPatient, setNextPatient] = useState(null);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const response = await fetch(`${API_URL}/api/patients`);
        const data = await response.json();
        const now = new Date();

        // Verificar que data tenga la estructura esperada
        const patients = data.patients || data;
        if (!Array.isArray(patients)) {
          console.warn('Los datos recibidos no contienen un array de pacientes:', data);
          setNextPatient(null);
          return;
        }

        // Filtrar pacientes con citas futuras y ordenarlos
        const upcomingPatient = patients
          .filter(patient => patient.appointment && new Date(patient.appointment) > now)
          .sort((a, b) => new Date(a.appointment) - new Date(b.appointment))[0];

        setNextPatient(upcomingPatient || null);
      } catch (error) {
        console.error('❌ Error al obtener los pacientes:', error);
      }
    };

    fetchPatients();
  }, []);

  // Si no hay un próximo paciente, muestra un mensaje predeterminado
  if (!nextPatient) {
    return (
      <div className="patient-info-wrapper">
        <div className="patient-info">
          <p>No hay pacientes programados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-info-wrapper">
      <div className="patient-info">
        <div className="patient-image">
          <img src={nextPatient.image || userNot} alt={nextPatient.name || 'Paciente'} />
        </div>
        <div className="patient-details">
          <p>Próximo Paciente:</p>
          <strong>{nextPatient.name}</strong>
          <p>
            {new Date(nextPatient.appointment).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default NextPatient;
