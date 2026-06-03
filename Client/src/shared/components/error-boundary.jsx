import React from 'react';
import PropTypes from 'prop-types';

// A-1: Los error boundaries DEBEN ser componentes de clase. Un componente de
// función no puede capturar errores de render (no existe getDerivedStateFromError
// ni componentDidCatch para funciones), por lo que el fallback nunca se mostraría.
// Esta clase es el ÚNICO error boundary del cliente: las variantes por módulo se
// expresan pasando un `fallback` (un nodo, o una función ({ error, reset }) => node),
// no creando nuevas clases.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que el siguiente render muestre el fallback.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Guardamos el componentStack para los detalles de desarrollo.
    this.setState({ error, errorInfo });
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    } else {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] Error capturado:', error, errorInfo);
    }
  }

  // Permite que un fallback ofrezca "reintentar" sin recargar toda la página.
  reset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    const { showDetails = process.env.NODE_ENV === 'development', fallback, children } = this.props;
    const { hasError, error, errorInfo } = this.state;

    if (hasError) {
      // Fallback personalizado: función ({ error, errorInfo, reset }) => node, o un nodo.
      if (typeof fallback === 'function') {
        return fallback({ error, errorInfo, reset: this.reset });
      }
      if (fallback !== undefined && fallback !== null) {
        return fallback;
      }
      // Fallback por defecto: recargar la página.
      return (
        <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fff0f0', border: '1px solid #ffcccc', margin: '20px auto', maxWidth: '600px', borderRadius: '8px' }}>
          <h1 style={{ fontSize: '1.5em', color: '#d9534f' }}>Algo salió mal.</h1>
          <p style={{ color: '#333' }}>Por favor, intenta recargar la página o contacta con el soporte si el problema persiste.</p>
          <button
            type="button"
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
  showDetails: PropTypes.bool,
  // Nodo a renderizar, o función ({ error, errorInfo, reset }) => node.
  fallback: PropTypes.oneOfType([PropTypes.node, PropTypes.func]),
  // Callback opcional de logging; si se omite, se registra en consola.
  onError: PropTypes.func
};

export default ErrorBoundary;
