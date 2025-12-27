import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import "../styles/patient-document-info.css";

// Componente para mostrar la información del documento de identificación
const PatientDocumentInfo = ({ documento = null }) => {
  // Generar un ID único para este componente específico
  const sectionId = `document-info-${Math.random().toString(36).substr(2, 9)}`;
  
  // Si no hay datos del documento, no renderizar nada o un placeholder
  if (!documento) {
    return (
      <section className="patient-detail__section" aria-labelledby={sectionId}>
        <SectionHeader title="Documento de Identificación" id={sectionId} />
        <p>No hay información del documento.</p>
      </section>
    );
  }

  return (
    <section className="patient-detail__section" aria-labelledby={sectionId}>
      <SectionHeader title="Documento de Identificación" id={sectionId} />
      <dl>
        <div>
          <dt>Tipo:</dt>
          <dd>{documento.tipo || 'N/A'}</dd>
        </div>
        <div>
          <dt>Número:</dt>
          <dd>{documento.numero || 'N/A'}</dd>
        </div>
      </dl>
    </section>
  );
};

// Definición de PropTypes para documentación y validación
PatientDocumentInfo.propTypes = {
  documento: PropTypes.shape({
    tipo: PropTypes.string,
    numero: PropTypes.string
  })
};

// Exportar componente memoizado para evitar re-renderizados innecesarios
export default React.memo(PatientDocumentInfo);