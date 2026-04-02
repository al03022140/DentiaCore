import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import "../styles/patient-contact-info.css";

// Componente para mostrar la información de contacto
const PatientContactInfo = ({ contacto = null, email = null }) => {
  // Generar un ID único para este componente específico
  const sectionId = `contact-info-${Math.random().toString(36).substr(2, 9)}`;
  
  // Si no hay datos de contacto, mostrar un mensaje o nada
  if (!contacto) {
    return (
      <section className="patient-detail__section patient-contact-info" aria-labelledby={sectionId}>
        <SectionHeader title="Información de Contacto" id={sectionId} />
        <p className="patient-detail__empty-message">No hay información de contacto disponible.</p>
      </section>
    );
  }

  return (
    <section className="patient-detail__section patient-contact-info" aria-labelledby={sectionId}>
      <SectionHeader title="Información de Contacto" id={sectionId} />
      <dl>
        <div>
          <dt>Email:</dt>
          <dd>{email || 'N/A'}</dd>
        </div>
        <div>
          <dt>Teléfono:</dt>
          <dd>{contacto.telefono || 'N/A'}</dd>
        </div>
        <div>
          <dt>Dirección:</dt>
          <dd>{contacto.direccion || 'N/A'}</dd>
        </div>
        <div>
          <dt>Código Postal:</dt>
          <dd>{contacto.codigo_postal || 'N/A'}</dd>
        </div>
        <div>
          <dt>Colonia:</dt>
          <dd>{contacto.colonia || 'N/A'}</dd>
        </div>
        <div>
          <dt>Número Interior:</dt>
          <dd>{contacto.numero_interior || 'N/A'}</dd>
        </div>
        <div>
          <dt>Número Exterior:</dt>
          <dd>{contacto.numero_exterior || 'N/A'}</dd>
        </div>
        <div>
          <dt>Ciudad:</dt>
          <dd>{contacto.ciudad || 'N/A'}</dd>
        </div>
      </dl>
    </section>
  );
};

// Definición de PropTypes para documentación y validación
PatientContactInfo.propTypes = {
  contacto: PropTypes.shape({
    telefono: PropTypes.string,
    direccion: PropTypes.string,
    codigo_postal: PropTypes.string,
    colonia: PropTypes.string,
    numero_interior: PropTypes.string,
    numero_exterior: PropTypes.string,
    ciudad: PropTypes.string
  }),
  email: PropTypes.string
};

// Exportar componente memoizado para evitar re-renderizados innecesarios
export default React.memo(PatientContactInfo);