import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/app.jsx'; 
import './shared/styles/index.css'; 
// Parchea el engine antes de montar React
import { patchEnginePrototype } from './features/odontogram/utils/odontogram-utils';
import { AuthProvider } from './app/auth/AuthContext';
import { LockScreenProvider } from './shared/components/LockScreen';
patchEnginePrototype();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <LockScreenProvider>
        <App />
      </LockScreenProvider>
    </AuthProvider>
  </React.StrictMode>
);

