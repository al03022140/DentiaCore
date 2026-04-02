import React from 'react';
import PropTypes from 'prop-types';
import { formatDateTime } from '../../../shared/utils/formatters';
import "../styles/patient-appointments-info.css";

// Componente para mostrar información de la última y próxima cita
const PatientAppointmentsInfo = ({ 
  ultimaCita = null,
  proximaCita = null,
  onAddAppointment = null
}) => {

  const renderCita = (cita, titulo) => {
    if (!cita) {
      return (
        <div className="empty-message">
          <p className="patient-detail__empty-message">No hay {titulo.toLowerCase()} programada.</p>
        </div>
      );
    }
    return (
      <article data-testid={`cita-${titulo.replace(' ', '-').toLowerCase()}`}>
        <h3>{titulo}</h3>
        <p>
          <strong>Fecha y Hora:</strong>{" "}
          <span>{formatDateTime(cita.fecha_hora)}</span>
        </p>
        <p><strong>Motivo:</strong> <span>{cita.motivo || 'N/A'}</span></p>
        <p><strong>Estado:</strong> <span>{cita.estado || 'N/A'}</span></p>
      </article>
    );
  };

  const noCitas = !ultimaCita && !proximaCita;

  return (
    <section 
      className="patient-detail__section" 
      aria-labelledby="citas-title"
    >
      <div className="patient-appointments-info__header">
        <h2 id="citas-title">Citas</h2>
        {onAddAppointment && (
          <button
            type="button"
            className="patient-appointments-info__add-btn"
            onClick={onAddAppointment}
            aria-label="Agregar cita"
            title="Agregar cita"
          >
            +
          </button>
        )}
      </div>

      {noCitas ? (
        <div className="patient-appointments-info__empty-state">
          <p className="empty-message patient-detail__empty-message">No hay citas programadas.</p>
        </div>
      ) : (
        <>
          {renderCita(ultimaCita, 'Última Cita')}
          {renderCita(proximaCita, 'Próxima Cita')}
        </>
      )}
    </section>
  );
};

// Definición de PropTypes para documentación y validación
PatientAppointmentsInfo.propTypes = {
  ultimaCita: PropTypes.shape({
    fecha_hora: PropTypes.string.isRequired,
    motivo: PropTypes.string,
    estado: PropTypes.string
  }),
  proximaCita: PropTypes.shape({
    fecha_hora: PropTypes.string.isRequired,
    motivo: PropTypes.string,
    estado: PropTypes.string
  }),
  onAddAppointment: PropTypes.func
};

// Exportar componente memoizado para evitar re-renderizados innecesarios
export default React.memo(PatientAppointmentsInfo);