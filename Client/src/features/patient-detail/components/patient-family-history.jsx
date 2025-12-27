import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import "../styles/patient-family-history.css";

// Componente para mostrar los antecedentes heredo familiares
const PatientFamilyHistory = ({ antecedentes = [] }) => {
  const sectionId = `family-history-${React.useId()}`;

  return (
    <section
      className="patient-detail__section"
      aria-labelledby={sectionId}
    >
      <SectionHeader title="Antecedentes Heredo Familiares" id={sectionId} />
      <ul>
        {antecedentes.length > 0 ? (
          antecedentes.map((antecedente, i) => (
            <li
              key={`family-history-${i}-${antecedente.parentesco?.slice(0,3)}-${antecedente.antecedentes?.slice(0,10)}`}
            >
              <dl className="family-history-details">
                <div>
                  <dt>Parentesco:</dt>
                  <dd>{antecedente.parentesco || 'No especificado'}</dd>
                </div>
                <div>
                  <dt>Antecedentes:</dt>
                  <dd>{antecedente.antecedentes || 'No especificado'}</dd>
                </div>
              </dl>
            </li>
          ))
        ) : (
          <li className="no-family-history-message">
            No hay antecedentes heredo familiares registrados.
          </li>
        )}
      </ul>
    </section>
  );
};

PatientFamilyHistory.propTypes = {
  antecedentes: PropTypes.arrayOf(
    PropTypes.shape({
      parentesco: PropTypes.string,
      antecedentes: PropTypes.string
    })
  )
};

export default React.memo(PatientFamilyHistory);