import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/auth/AuthContext';
import API from '../services/axios-instance';
import { getSettings } from '../services/settingsService';
import './styles/lock-screen.css';
import lockBlockedIcon from '../../assets/images/icons/Lock blocked.svg';
import lockTimerIcon from '../../assets/images/icons/lock.svg';

const LockScreenContext = createContext(null);

// Default fallback si no se puede leer el setting (en minutos).
const DEFAULT_INACTIVITY_MIN = 15;
const INACTIVITY_MIN_BOUND = 1;
const INACTIVITY_MAX_BOUND = 120;
const CHECK_INTERVAL_MS = 5 * 1000; // chequear cada 5s para countdown granular
// Duración de la "etapa 1" — periodo silencioso de detección antes de
// mostrar la advertencia con countdown.
const STAGE_1_MS = 60 * 1000; // 1 minuto
// Evento que dispara SecuritySection al guardar — permite recargar el timeout
// sin obligar al usuario a refrescar la página.
export const SETTINGS_UPDATED_EVENT = 'dentiacore:settings-updated';
// Debe coincidir con MAX_PIN_ATTEMPTS del backend (authController.js).
// El backend es la fuente de verdad: envía `intentosRestantes` en cada 401.
const MAX_PIN_ATTEMPTS = 5;

const formatMmSs = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const clampInactivity = (minutes) => {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return DEFAULT_INACTIVITY_MIN;
  return Math.min(INACTIVITY_MAX_BOUND, Math.max(INACTIVITY_MIN_BOUND, n));
};

export const LockScreenProvider = ({ children }) => {
  const { user, logout } = useAuth();
  const [isLocked, setIsLocked] = useState(() => sessionStorage.getItem('dentiacore_locked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  // Estado de la advertencia de inactividad — visible durante la etapa 2.
  // `null` = etapa 1 (silenciosa o usuario activo). Número = ms restantes.
  const [warningRemainingMs, setWarningRemainingMs] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const checkIntervalRef = useRef(null);
  // Timeout configurable desde Configuración → Seguridad (en ms).
  // Se inicializa con default y se sobreescribe al cargar settings.
  const inactivityTimeoutMsRef = useRef(DEFAULT_INACTIVITY_MIN * 60 * 1000);

  // Carga el setting del servidor; si falla mantiene el valor previo.
  const loadInactivityTimeout = useCallback(async () => {
    try {
      const settings = await getSettings();
      const min = clampInactivity(settings?.inactivityTimeout);
      inactivityTimeoutMsRef.current = min * 60 * 1000;
    } catch {
      // mantener default / valor anterior
    }
  }, []);

  // Registrar actividad del usuario — resetea ambas etapas a cero.
  // El setter de warningRemainingMs solo se llama si está visible para evitar
  // re-renders innecesarios en cada mousemove.
  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarningRemainingMs((prev) => (prev !== null ? null : prev));
  }, []);

  // Acción "Sigo aquí" — equivalente a registerActivity pero explícito.
  const dismissWarning = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarningRemainingMs(null);
  }, []);

  // Bloquear pantalla
  const lock = useCallback(async (trigger = 'manual') => {
    setIsLocked(true);
    setPinInput('');
    setError('');
    setWarningRemainingMs(null);
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
        setWarningRemainingMs(null);
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

  // Cargar el timeout cuando el usuario inicia sesión.
  useEffect(() => {
    if (user) loadInactivityTimeout();
  }, [user, loadInactivityTimeout]);

  // Reaccionar a cambios desde Configuración sin necesidad de recargar.
  useEffect(() => {
    if (!user) return;
    const handler = (ev) => {
      const detail = ev?.detail || {};
      if (detail.inactivityTimeout !== undefined) {
        const min = clampInactivity(detail.inactivityTimeout);
        inactivityTimeoutMsRef.current = min * 60 * 1000;
        lastActivityRef.current = Date.now(); // resetear contador con el nuevo valor
        setWarningRemainingMs(null);
      } else {
        loadInactivityTimeout();
      }
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
  }, [user, loadInactivityTimeout]);

  // Monitorear inactividad — dos etapas:
  //   Etapa 1 (silenciosa): primer minuto sin actividad → nada visible.
  //   Etapa 2 (countdown): tras 1 min sin actividad, mostrar modal con el
  //   tiempo restante hasta el lock. Cualquier evento del usuario (mouse,
  //   teclado, touch, scroll) resetea inmediatamente a cero (oculta el modal).
  // El lock real dispara al alcanzar el config completo (p. ej. 15 min).
  useEffect(() => {
    if (!user || isLocked) return;

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, registerActivity, { passive: true }));

    checkIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const total = inactivityTimeoutMsRef.current;

      if (elapsed >= total) {
        setWarningRemainingMs(null);
        lock('auto');
        return;
      }

      // Si el timeout total es ≤ 1 min, no usamos etapa 1 — todo el periodo
      // se cuenta como countdown visible para que el usuario alcance a verlo.
      const effectiveStage1 = total > STAGE_1_MS ? STAGE_1_MS : 0;

      if (elapsed >= effectiveStage1) {
        const remaining = total - elapsed;
        setWarningRemainingMs(remaining);
      } else {
        // Aún en etapa 1: ocultar warning si por alguna razón estaba visible.
        setWarningRemainingMs((prev) => (prev !== null ? null : prev));
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

      {/* Advertencia de inactividad (etapa 2). No bloquea la UI — el usuario
          puede seguir trabajando; cualquier interacción la cierra. */}
      {user && !isLocked && warningRemainingMs !== null && (
        <div className="inactivity-warning" role="status" aria-live="polite">
          <img src={lockTimerIcon} alt="" aria-hidden="true" className="inactivity-warning__icon theme-icon" />
          <div className="inactivity-warning__content">
            <strong>Tu sesión se cerrará por inactividad</strong>
            <span>
              Tiempo restante: <strong>{formatMmSs(warningRemainingMs)}</strong>. Mueve el mouse o pulsa una tecla para continuar.
            </span>
          </div>
          <button
            type="button"
            className="inactivity-warning__btn"
            onClick={dismissWarning}
          >
            Sigo aquí
          </button>
        </div>
      )}

      {user && isLocked && (
        <div className="lock-screen-overlay">
          <div className="lock-screen-card">
            <div className="lock-screen-icon">
              <img
                src={lockBlockedIcon}
                alt=""
                aria-hidden="true"
                className="theme-icon"
                style={{ width: 80, height: 80 }}
              />
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
