import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import "../styles/patient-emergency-contacts.css";

// Componente para mostrar los contactos de emergencia
const PatientEmergencyContacts = ({ contactos = [] }) => {
  const sectionId = `emergency-contacts-${React.useId()}`;

  return (
    <section
      className="patient-detail__section"
      aria-labelledby={sectionId}
    >
      <SectionHeader title="Contactos de Emergencia" id={sectionId} />
      <ul>
        {contactos.length > 0 ? (
          contactos.map((c, i) => (
            <li
              key={`emergency-${i}-${c.nombre?.slice(0,3)}-${c.telefono}`}
            >
              <dl className="emergency-contact-details">
                <div>
                  <dt>Nombre:</dt>
                  <dd>{c.nombre || 'No especificado'}</dd>
                </div>
                <div>
                  <dt>Parentesco:</dt>
                  <dd>{c.parentesco || 'No especificado'}</dd>
                </div>
                <div>
                  <dt>Teléfono:</dt>
                  <dd>{c.telefono || 'No especificado'}</dd>
                </div>
              </dl>
            </li>
          ))
        ) : (
          <li className="no-contacts-message">
            No hay contactos de emergencia registrados.
          </li>
        )}
      </ul>
    </section>
  );
};

PatientEmergencyContacts.propTypes = {
  contactos: PropTypes.arrayOf(
    PropTypes.shape({
      nombre: PropTypes.string,
      parentesco: PropTypes.string,
      telefono: PropTypes.string
    })
  )
};

export default React.memo(PatientEmergencyContacts);