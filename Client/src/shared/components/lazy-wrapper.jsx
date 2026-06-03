import React, { Suspense, memo } from 'react';
import './LazyWrapper.css';
import ErrorBoundary from './error-boundary';

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
    // Usa la ErrorBoundary compartida; el fallback recibe `reset` para reintentar
    // el render del componente lazy sin recargar toda la página.
    return (
      <ErrorBoundary
        fallback={({ reset }) => (
          <div className="lazy-error-container">
            <div className="lazy-error-icon">⚠️</div>
            <h3>Error al cargar componente</h3>
            <p>No se pudo cargar el componente solicitado.</p>
            <button type="button" className="lazy-error-retry" onClick={reset}>
              Reintentar
            </button>
          </div>
        )}
        onError={(error, errorInfo) => {
          // eslint-disable-next-line no-console
          console.error('Error en componente lazy:', error, errorInfo);
        }}
      >
        {content}
      </ErrorBoundary>
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
