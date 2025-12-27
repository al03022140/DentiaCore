import React, { Suspense, memo } from 'react';
import './LazyWrapper.css';

/**
 * Componente wrapper para carga lazy con fallback personalizado
 * Optimiza el rendimiento cargando componentes bajo demanda
 */
const LazyWrapper = memo(({ 
  children, 
  fallback = <DefaultLoadingFallback />, 
  errorBoundary = true 
}) => {
  const content = (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  );

  if (errorBoundary) {
    return (
      <LazyErrorBoundary>
        {content}
      </LazyErrorBoundary>
    );
  }

  return content;
});

/**
 * Fallback de carga por defecto
 */
const DefaultLoadingFallback = () => (
  <div className="lazy-loading-container">
    <div className="lazy-loading-spinner">
      <div className="spinner"></div>
    </div>
    <p className="lazy-loading-text">Cargando componente...</p>
  </div>
);

/**
 * Error boundary específico para componentes lazy
 */
class LazyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error en componente lazy:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="lazy-error-container">
          <div className="lazy-error-icon">⚠️</div>
          <h3>Error al cargar componente</h3>
          <p>No se pudo cargar el componente solicitado.</p>
          <button 
            className="lazy-error-retry"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC para crear componentes lazy con configuración personalizada
 */
export const createLazyComponent = (importFunction, options = {}) => {
  const LazyComponent = React.lazy(importFunction);
  
  return memo((props) => (
    <LazyWrapper 
      fallback={options.fallback}
      errorBoundary={options.errorBoundary !== false}
    >
      <LazyComponent {...props} />
    </LazyWrapper>
  ));
};

/**
 * Utilidad para pre-cargar componentes lazy
 */
export const preloadComponent = (importFunction) => {
  const componentImport = importFunction();
  return componentImport;
};

LazyWrapper.displayName = 'LazyWrapper';

export default LazyWrapper;