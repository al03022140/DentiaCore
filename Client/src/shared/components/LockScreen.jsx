import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/auth/AuthContext';
import API from '../services/axios-instance';
import './styles/lock-screen.css';
import lockBlockedIcon from '../../assets/images/icons/Lock blocked.svg';

const LockScreenContext = createContext(null);

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos (roles.MD §9.3)
const CHECK_INTERVAL_MS = 30 * 1000;         // comprobar cada 30s
// Debe coincidir con MAX_PIN_ATTEMPTS del backend (authController.js).
// El backend es la fuente de verdad: envía `intentosRestantes` en cada 401.
const MAX_PIN_ATTEMPTS = 5;

export const LockScreenProvider = ({ children }) => {
  const { user, logout } = useAuth();
  const [isLocked, setIsLocked] = useState(() => sessionStorage.getItem('dentiacore_locked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const checkIntervalRef = useRef(null);

  // Registrar actividad del usuario
  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Bloquear pantalla
  const lock = useCallback(async (trigger = 'manual') => {
    setIsLocked(true);
    setPinInput('');
    setError('');
    sessionStorage.setItem('dentiacore_locked', 'true');

    try {
      await API.post('/auth/lock-screen', { trigger });
    } catch {
      // Auditoría no debe bloquear la UI
    }
  }, []);

  // Desbloquear pantalla
  const unlock = useCallback(async (pin) => {
    if (!pin || pin.length !== 4) {
      setError('Ingrese un PIN de 4 dígitos');
      return false;
    }

    // Procesa un intento fallido y actualiza el mensaje con los intentos restantes.
    // Si el backend nos envió `intentosRestantes` lo usamos; si no, calculamos local.
    const handleWrongPin = (remainingFromServer) => {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPinInput('');

      const remaining = typeof remainingFromServer === 'number'
        ? remainingFromServer
        : Math.max(0, MAX_PIN_ATTEMPTS - newAttempts);

      if (remaining <= 0) {
        setError('Demasiados intentos fallidos. Cerrando sesión...');
        sessionStorage.removeItem('dentiacore_locked');
        setTimeout(() => logout(), 1500);
        return false;
      }

      setError(
        remaining === 1
          ? 'PIN incorrecto. Te queda 1 intento antes de cerrar sesión.'
          : `PIN incorrecto. Te quedan ${remaining} intentos antes de cerrar sesión.`
      );
      return false;
    };

    try {
      const res = await API.post('/auth/verify-pin', { pin });
      if (res.data?.valid) {
        setIsLocked(false);
        setPinInput('');
        setError('');
        setAttempts(0);
        sessionStorage.removeItem('dentiacore_locked');
        lastActivityRef.current = Date.now();

        try {
          await API.post('/auth/unlock-screen', {});
        } catch {
          // No bloquear UI por auditoría
        }
        return true;
      }
      // 200 sin valid:true es inesperado; tratar como intento fallido.
      return handleWrongPin(undefined);
    } catch (err) {
      // Sin response → error real de red (servidor caído, timeout, sin internet).
      if (!err?.response) {
        setError('No se pudo conectar con el servidor. Verifique su red.');
        setPinInput('');
        return false;
      }

      const status = err.response.status;
      const data = err.response.data || {};

      // 423 = PIN bloqueado por exceder intentos en backend.
      if (status === 423 || data.locked) {
        setError(data.message || 'PIN bloqueado por demasiados intentos. Cerrando sesión...');
        sessionStorage.removeItem('dentiacore_locked');
        setTimeout(() => logout(), 1800);
        return false;
      }

      // PIN incorrecto: backend devuelve 400/401 con valid:false e intentosRestantes.
      if ((status === 400 || status === 401) && data.valid === false) {
        return handleWrongPin(data.intentosRestantes);
      }

      // Cualquier otro error (5xx, 401 sin valid:false por sesión expirada y refresh
      // fallido, etc.). No contar como intento de PIN.
      setError('No se pudo verificar el PIN. Inicie sesión nuevamente.');
      setPinInput('');
      setTimeout(() => logout(), 1800);
      return false;
    }
  }, [attempts, logout]);

  // Monitorear inactividad
  useEffect(() => {
    if (!user || isLocked) return;

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, registerActivity, { passive: true }));

    checkIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        lock('auto');
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, registerActivity));
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [user, isLocked, registerActivity, lock]);

  // Restaurar bloqueo al recargar
  useEffect(() => {
    if (user && sessionStorage.getItem('dentiacore_locked') === 'true') {
      setIsLocked(true);
    }
  }, [user]);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    unlock(pinInput);
  };

  const value = { isLocked, lock, unlock };

  return (
    <LockScreenContext.Provider value={value}>
      {children}
      {user && isLocked && (
        <div className="lock-screen-overlay">
          <div className="lock-screen-card">
            <div className="lock-screen-icon">
              {user.nombre === 'Administrador Local'
                ? <img src={lockBlockedIcon} alt="Administrador Local" className="theme-icon" style={{ width: 80, height: 80 }} />
                : <span style={{ fontSize: '4.5rem', lineHeight: 1 }}>🔒</span>}
            </div>
            <h2>Pantalla bloqueada</h2>
            <p className="lock-screen-user">{user.nombre || 'Usuario'}</p>
            <p className="lock-screen-hint">Ingrese su PIN para desbloquear</p>

            <form onSubmit={handlePinSubmit} className="lock-screen-form">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPinInput(val);
                  setError('');
                }}
                placeholder="••••"
                autoFocus
                className="lock-screen-input"
              />
              {error && <p className="lock-screen-error">{error}</p>}
              <button type="submit" className="lock-screen-btn" disabled={pinInput.length !== 4}>
                Desbloquear
              </button>
            </form>
          </div>
        </div>
      )}
    </LockScreenContext.Provider>
  );
};

export const useLockScreen = () => {
  const context = useContext(LockScreenContext);
  if (!context) throw new Error('useLockScreen debe usarse dentro de LockScreenProvider');
  return context;
};
