import React, { useState } from 'react';
import PropTypes from 'prop-types';
import "../styles/patient-info-header.css";
import { formatDate, formatAgeYearsOnly } from '../../../shared/utils/formatters';
import ErrorBoundary from '../../../shared/components/error-boundary';
import ImagePreviewModal from '../../../shared/components/ImagePreviewModal.jsx';

// "Empleado, Pensionado…" a partir de las banderas de situación laboral
const situacionLaboralTexto = (situacion_laboral) => {
  if (!situacion_laboral) return null;
  return [
    situacion_laboral.empleado && "Empleado",
    situacion_laboral.pensionado && "Pensionado",
    situacion_laboral.desempleado && "Desempleado",
    situacion_laboral.jubilado && "Jubilado"
  ].filter(Boolean).join(", ") || null;
};

// Componente para mostrar la cabecera de información del paciente
const PatientInfoHeader = ({ patient, proximaCita = null, ultimaCita = null, userNot }) => {
  const [showPhoto, setShowPhoto] = useState(false);

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

  const situacionLaboral = situacionLaboralTexto(situacion_laboral);

  return (
    <ErrorBoundary fallback={<div className="error-fallback">No se pudo cargar la información del paciente</div>}>
      <section
        className="patient-detail__info"
        aria-labelledby="patient-info-header"
      >
        <h2 id="patient-info-header" className="sr-only">Información del Paciente</h2>

        <div className="patient-detail__top">
          <div className="patient-detail__photo">
            <img
              src={photoURL || userNot}
              alt={`Foto de ${primer_nombre} ${apellido_paterno}`}
              className={!photoURL ? 'profile-default-avatar' : undefined}
              onClick={photoURL ? () => setShowPhoto(true) : undefined}
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

            <p className="patient-detail__subline">
              {[
                formatAgeYearsOnly(fecha_nacimiento),
                sexo,
                paciente_id ? `Paciente #${paciente_id}` : null
              ].filter(Boolean).join(' • ')}
            </p>

            {(ultimaCita || proximaCita) && (
              <div className="patient-detail__citas">
                {ultimaCita && (
                  <p className="patient-detail__cita">
                    <strong>Última cita:</strong> <span>{formatDate(ultimaCita.fecha_hora)}</span>
                  </p>
                )}
                {proximaCita && (
                  <p className="patient-detail__cita">
                    <strong>Próxima cita:</strong> <span>{formatDate(proximaCita.fecha_hora)}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="patient-detail__meta-grid">
          <p className="patient-detail__meta-item">
            <strong>Fecha de nacimiento:</strong>
            <span>{formatDate(fecha_nacimiento)}</span>
          </p>
          <p className="patient-detail__meta-item">
            <strong>ID BD:</strong>
            <span title={_id}>{_id}</span>
          </p>
          <p className="patient-detail__meta-item">
            <strong>Fecha de alta:</strong>
            <span>{createdAt ? formatDate(createdAt) : 'No disponible'}</span>
          </p>
          <p className="patient-detail__meta-item">
            <strong>Estado civil:</strong>
            <span className={!estado_civil ? 'patient-detail__value--empty' : undefined}>
              {estado_civil || 'No especificado'}
            </span>
          </p>
          <p className="patient-detail__meta-item">
            <strong>Nacionalidad:</strong>
            <span className={!nacionalidad ? 'patient-detail__value--empty' : undefined}>
              {nacionalidad || 'No especificado'}
            </span>
          </p>
          <p className="patient-detail__meta-item">
            <strong>Situación laboral:</strong>
            <span className={!situacionLaboral ? 'patient-detail__value--empty' : undefined}>
              {situacionLaboral || 'No especificado'}
            </span>
          </p>
          {lugar_nacimiento && (
            <p className="patient-detail__meta-item">
              <strong>Lugar de nacimiento:</strong>
              <span>{lugar_nacimiento}</span>
            </p>
          )}
          {escolaridad && (
            <p className="patient-detail__meta-item">
              <strong>Escolaridad:</strong>
              <span>{escolaridad}</span>
            </p>
          )}
          {situacion_laboral?.empleado && ocupacion && (
            <p className="patient-detail__meta-item">
              <strong>Ocupación:</strong>
              <span>{ocupacion}</span>
            </p>
          )}
        </div>

        {photoURL && (
          <ImagePreviewModal
            open={showPhoto}
            onClose={() => setShowPhoto(false)}
            src={photoURL}
            alt={`Foto de ${primer_nombre} ${apellido_paterno}`}
            title="Foto del paciente"
          />
        )}
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