import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import '../styles/patient-medical-cards.css';

// Componente para mostrar las tarjetas de información médica
const PatientMedicalCards = ({ 
  alertasMedicas = [], 
  enfermedades = [], 
  medicamentos = [] 
}) => {
  // IDs únicos para accesibilidad
  const alertasId = `alertas-medicas-${React.useId()}`;
  const enfermedadesId = `enfermedades-${React.useId()}`;
  const medicamentosId = `medicamentos-${React.useId()}`;

  // Función auxiliar para renderizar listas en las tarjetas
  const renderList = (items, keyPrefix, renderItem) => {
    if (!items || items.length === 0) {
      return <li className="no-items-message">No hay {keyPrefix}</li>;
    }
    return items.map((item, index) => renderItem(item, index));
  };

  return (
    <section className="patient-detail__section">
      <div className="patient-detail__medical-cards-container">
      <article 
        className="patient-detail__info-card"
        aria-labelledby={alertasId}
      >
        <SectionHeader title="Alertas Médicas" id={alertasId} />
        <ul>
          {renderList(alertasMedicas, 'alertas', (alerta, index) => (
            <li key={`alerta-${index}-${typeof alerta === 'string' ? alerta.substring(0, 8) : index}`}>
              {alerta}
            </li>
          ))}
        </ul>
      </article>

      <article 
        className="patient-detail__info-card"
        aria-labelledby={enfermedadesId}
      >
        <SectionHeader title="Enfermedades" id={enfermedadesId} />
        <ul>
          {renderList(enfermedades, 'enfermedades', (enf, index) => (
            <li key={`enf-${index}-${typeof enf === 'string' ? enf.substring(0, 8) : index}`}>
              {enf}
            </li>
          ))}
        </ul>
      </article>

      <article 
        className="patient-detail__info-card"
        aria-labelledby={medicamentosId}
      >
        <SectionHeader title="Medicamentos" id={medicamentosId} />
        <ul>
          {renderList(medicamentos, 'medicamentos', (med, index) => (
            <li key={`med-${index}-${typeof med === 'object' ? 
              (med.nombre ? med.nombre.substring(0, 8) : '') : 
              (typeof med === 'string' ? med.substring(0, 8) : '')}-${index}`}>
              {typeof med === 'object' ? (
                <>
                  <strong>{med.nombre || 'N/A'}</strong>
                  {med.dosis && <span> - {med.dosis}</span>}
                  {med.frecuencia && <span> ({med.frecuencia})</span>}
                </>
              ) : (
                <span>{med}</span>
              )}
            </li>
          ))}
        </ul>
      </article>
      </div>
    </section>
  );
};

PatientMedicalCards.propTypes = {
  alertasMedicas: PropTypes.arrayOf(PropTypes.string),
  enfermedades: PropTypes.arrayOf(PropTypes.string),
  medicamentos: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        nombre: PropTypes.string,
        dosis: PropTypes.string,
        frecuencia: PropTypes.string
      })
    ])
  )
};

export default React.memo(PatientMedicalCards);