import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/app.jsx'; 
import './shared/styles/index.css'; 
// Parchea el engine antes de montar React
import { patchEnginePrototype } from './features/odontogram/utils/odontogram-utils';
import { AuthProvider } from './app/auth/AuthContext';
import { LockScreenProvider } from './shared/components/LockScreen';
import { ThemeProvider } from './shared/context/ThemeContext';
import { useSessionKeepAlive } from './shared/hooks/useSessionKeepAlive';
patchEnginePrototype();

// Refresca el access token al recuperar foco/visibilidad y cada 10 min.
// Evita el escenario "vuelvo de otra app y se cerró la sesión".
const SessionKeepAlive = () => {
  useSessionKeepAlive();
  return null;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <SessionKeepAlive />
        <LockScreenProvider>
          <App />
        </LockScreenProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

