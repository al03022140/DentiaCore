import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/app.jsx'; 
import './shared/styles/index.css';
// NOTA: se eliminó patchEnginePrototype() — corría ANTES de que los scripts
// del engine cargaran (lazy en patient-detail), así que nunca aplicaba. El
// fetch que pretendía anular se quitó del propio engine.js.
import { AuthProvider } from './app/auth/AuthContext';
import { LockScreenProvider } from './shared/components/LockScreen';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { useSessionKeepAlive } from './shared/hooks/useSessionKeepAlive';
import ErrorBoundary from './shared/components/error-boundary';

// Refresca el access token al recuperar foco/visibilidad y cada 10 min.
// Evita el escenario "vuelvo de otra app y se cerró la sesión".
const SessionKeepAlive = () => {
  useSessionKeepAlive();
  return null;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Boundary raíz: captura crashes fuera del boundary del layout
        (providers, Sidebar/Header, LoginPage, PatientPrintPage) que antes
        dejaban la app en pantalla blanca. El fallback ofrece recargar. */}
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SessionKeepAlive />
          <LockScreenProvider>
            <App />
          </LockScreenProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

