import React from 'react';
import PropTypes from 'prop-types';

// A-1: Los error boundaries DEBEN ser componentes de clase. La versión anterior
// era un componente de función con useState cuyo setState nunca se invocaba (un
// componente de función no puede capturar errores de render), por lo que el
// fallback nunca se mostraba y cualquier error de render dejaba la app en
// blanco. Esta clase implementa getDerivedStateFromError + componentDidCatch.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que el siguiente render muestre el fallback.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Guardamos el componentStack para los detalles de desarrollo y dejamos
    // traza en consola para diagnóstico.
    this.setState({ error, errorInfo });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Error capturado:', error, errorInfo);
  }

  render() {
    const { showDetails = process.env.NODE_ENV === 'development', children } = this.props;
    const { hasError, error, errorInfo } = this.state;

    if (hasError) {
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
          {showDetails && error && (
            <details style={{ marginTop: '20px', textAlign: 'left', whiteSpace: 'pre-wrap', color: '#555' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Detalles del Error (para desarrollo)</summary>
              {error.toString()}
              <br />
              {errorInfo && errorInfo.componentStack}
            </details>
          )}
        </div>
      );
    }

    return children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  showDetails: PropTypes.bool
};

export default ErrorBoundary;
