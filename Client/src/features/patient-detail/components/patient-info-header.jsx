import React from 'react';
import PropTypes from 'prop-types';
import "../styles/patient-info-header.css";
import { formatDate, formatDateTime, formatAge } from '../../../shared/utils/formatters';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Aquí podrías registrar el error

  }

  render() {
    if (this.state.hasError) {
      return <div className="error-fallback">No se pudo cargar la información del paciente</div>;
    }

    return this.props.children;
  }
}

// Componente para mostrar la cabecera de información del paciente
const PatientInfoHeader = ({ patient, proximaCita = null, ultimaCita = null, userNot }) => {
  // Asegurarse que patient no sea null o undefined antes de acceder a sus propiedades
  if (!patient) {
    return null; // O mostrar un placeholder/loading si se prefiere
  }

  // Desestructurar propiedades del paciente para mayor claridad
  const {
    photoURL, primer_nombre, otros_nombres,
    apellido_paterno, apellido_materno, _id,
    paciente_id, sexo, fecha_nacimiento,
    estado_civil, nacionalidad, lugar_nacimiento,
    ocupacion, escolaridad, situacion_laboral, createdAt
  } = patient;

  return (
    <ErrorBoundary>
      <section 
        className="patient-detail__info"
        aria-labelledby="patient-info-header"
      >
        <h2 id="patient-info-header" className="sr-only">Información del Paciente</h2>
        <div className="patient-detail__photo">
          <img 
            src={photoURL || userNot} 
            alt={`Foto de ${primer_nombre} ${apellido_paterno}`}
            className={!photoURL ? 'profile-default-avatar' : undefined}
            onError={(e) => { 
              e.target.onerror = null; // Prevenir bucles infinitos
              e.target.src = userNot;
              e.target.classList.add('profile-default-avatar');
            }}
          />
        </div>
        <div className="patient-detail__details">
          <h1>
            {primer_nombre} {otros_nombres} {apellido_paterno} {apellido_materno}
          </h1>
          <p><strong>ID BD:</strong> <span>{_id}</span></p>
          <p><strong>ID Paciente:</strong> <span>{paciente_id}</span></p>
          <p>
            <strong>Fecha en que se agrega el paciente:</strong>{" "}
            <span>{createdAt ? formatDate(createdAt) : 'N/A'}</span>
          </p>
          <p><strong>Edad:</strong> <span>{formatAge(fecha_nacimiento)}</span></p>
          <p><strong>Sexo:</strong> <span>{sexo}</span></p>
          <p>
            <strong>Fecha de Nacimiento:</strong>{" "}
            <span>{formatDate(fecha_nacimiento)}</span>
          </p>
          <p><strong>Estado Civil:</strong> <span>{estado_civil}</span></p>
          <p><strong>Nacionalidad:</strong> <span>{nacionalidad}</span></p>
          {lugar_nacimiento && (
            <p><strong>Lugar de Nacimiento:</strong> <span>{lugar_nacimiento}</span></p>
          )}
          {escolaridad && (
            <p><strong>Escolaridad:</strong> <span>{escolaridad}</span></p>
          )}
          {situacion_laboral && (
            <p>
              <strong>Situación Laboral:</strong>{" "}
              <span>
                {[
                  situacion_laboral.empleado && "Empleado",
                  situacion_laboral.pensionado && "Pensionado",
                  situacion_laboral.desempleado && "Desempleado",
                  situacion_laboral.jubilado && "Jubilado"
                ].filter(Boolean).join(", ")}
              </span>
            </p>
          )}
          {situacion_laboral?.empleado && ocupacion && (
            <p><strong>Ocupación:</strong> <span>{ocupacion}</span></p>
          )}
          {proximaCita && (
            <p>
              <strong>Próxima Cita:</strong>{" "}
              <span>{formatDateTime(proximaCita.fecha_hora)}</span>
            </p>
          )}
          {ultimaCita && (
            <p>
              <strong>Última Cita:</strong>{" "}
              <span>
                {formatDate(ultimaCita.fecha_hora)} ({ultimaCita.motivo || "Sin motivo"})
              </span>
            </p>
          )}
        </div>
      </section>
    </ErrorBoundary>
  );
};

PatientInfoHeader.propTypes = {
  patient: PropTypes.shape({
    photoURL: PropTypes.string,
    primer_nombre: PropTypes.string.isRequired,
    otros_nombres: PropTypes.string,
    apellido_paterno: PropTypes.string.isRequired,
    apellido_materno: PropTypes.string,
    _id: PropTypes.string.isRequired,
    paciente_id: PropTypes.string,
    sexo: PropTypes.string,
    fecha_nacimiento: PropTypes.string,
    estado_civil: PropTypes.string,
    nacionalidad: PropTypes.string,
    lugar_nacimiento: PropTypes.string,
    ocupacion: PropTypes.string,
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
  }).isRequired,
  proximaCita: PropTypes.shape({
    fecha_hora: PropTypes.string.isRequired,
    motivo: PropTypes.string,
    estado: PropTypes.string
  }),
  ultimaCita: PropTypes.shape({
    fecha_hora: PropTypes.string.isRequired,
    motivo: PropTypes.string,
    estado: PropTypes.string
  }),
  userNot: PropTypes.string.isRequired
};

export default React.memo(PatientInfoHeader);