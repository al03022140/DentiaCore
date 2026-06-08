import React from 'react';
import PropTypes from 'prop-types';
import ErrorBoundary from '../../../shared/components/error-boundary';

// Boundary del módulo de odontograma. No reimplementa la lógica de captura:
// configura la ErrorBoundary compartida con su fallback propio. Antes esta clase
// estaba duplicada casi idéntica en patient-detail.jsx y PatientPrintPage.jsx.
const odontogramFallback = (
  <div className="error-boundary">
    <h3>Error en el módulo de odontograma</h3>
    <p>Por favor, recarga la página o contacta con soporte.</p>
    <button type="button" onClick={() => window.location.reload()}>
      Recargar página
    </button>
  </div>
);

const OdontogramErrorBoundary = ({ children }) => (
  <ErrorBoundary
    fallback={odontogramFallback}
    onError={(error, errorInfo) => {
      // eslint-disable-next-line no-console
      console.error('Odontogram Error:', error, errorInfo);
    }}
  >
    {children}
  </ErrorBoundary>
);

OdontogramErrorBoundary.propTypes = {
  children: PropTypes.node
};

export default OdontogramErrorBoundary;
