import React, { useState } from 'react';
import PropTypes from 'prop-types';

const ErrorBoundary = ({ 
  children, 
  showDetails = process.env.NODE_ENV === 'development' 
}) => {
  const [state, setState] = useState({ 
    hasError: false, 
    error: null, 
    errorInfo: null 
  });

  if (state.hasError) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fff0f0', border: '1px solid #ffcccc', margin: '20px auto', maxWidth: '600px', borderRadius: '8px' }}>
        <h1 style={{ fontSize: '1.5em', color: '#d9534f' }}>Algo salió mal.</h1>
        <p style={{ color: '#333' }}>Por favor, intenta recargar la página o contacta con el soporte si el problema persiste.</p>
        <button 
          onClick={() => window.location.reload()}
          style={{ padding: '10px 15px', marginTop: '15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Recargar Página
        </button>
        {showDetails && state.error && (
          <details style={{ marginTop: '20px', textAlign: 'left', whiteSpace: 'pre-wrap', color: '#555' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Detalles del Error (para desarrollo)</summary>
            {state.error.toString()}
            <br />
            {state.errorInfo && state.errorInfo.componentStack}
          </details>
        )}
      </div>
    );
  }

  return children;
};

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  showDetails: PropTypes.bool
};

export default ErrorBoundary; 