import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getStoredGoogleToken,
  getFreshGoogleToken,
  fetchGoogleSessionToken,
} from '../../../shared/services/googleTokenService';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5002';

// ── Auth helpers (same as calendar.jsx — kept in sync) ──────────────────────
const AUTH_PROGRESS_KEY = 'authInProgress';
const AUTH_FETCH_PROGRESS_KEY = 'authFetchInProgress';
const isAuthInProgress = () => localStorage.getItem(AUTH_PROGRESS_KEY) === '1';
const setAuthInProgressFlag = () => localStorage.setItem(AUTH_PROGRESS_KEY, '1');
const clearAuthInProgress = () => localStorage.removeItem(AUTH_PROGRESS_KEY);
const isAuthFetchInProgress = () => localStorage.getItem(AUTH_FETCH_PROGRESS_KEY) === '1';
const setAuthFetchInProgress = (v) => {
  if (v) localStorage.setItem(AUTH_FETCH_PROGRESS_KEY, '1');
  else localStorage.removeItem(AUTH_FETCH_PROGRESS_KEY);
};

// A-3/A-4: el almacenamiento/renovación del token de Google vive en
// shared/services/googleTokenService.js (compartido con calendar.jsx). El
// refresh token NUNCA se persiste en el cliente — viaja en cookie httpOnly y
// los endpoints /auth/token y /refresh-token exigen la sesión de la app (JWT),
// que sólo adjunta el interceptor de axios.
const getAccessToken = () => {
  const stored = getStoredGoogleToken();
  if (typeof stored === 'string') return stored;
  return stored?.token || null;
};

// ── Component ───────────────────────────────────────────────────────────────
const GoogleCalendarSection = () => {
  const [connectedEmail, setConnectedEmail] = useState(
    () => localStorage.getItem('google_connected_email') || null
  );
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendar, setSelectedCalendar] = useState(
    () => localStorage.getItem('google_selected_calendar') || 'primary'
  );
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | connected | error
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const authAttemptedRef = useRef(false);

  // ── Get a valid token (renueva vía cookie httpOnly si hace falta) ──────────
  const getValidToken = useCallback(async () => getFreshGoogleToken(), []);

  // ── Fetch user info ────────────────────────────────────────────────────────
  const fetchUserInfo = useCallback(async (token) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/google/auth/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          localStorage.setItem('google_connected_email', data.email);
          setConnectedEmail(data.email);
        }
      }
    } catch { /* non-critical */ }
  }, []);

  // ── Fetch calendar list ────────────────────────────────────────────────────
  const fetchCalendars = useCallback(async (token) => {
    if (!token) return;
    setLoadingCalendars(true);
    try {
      const res = await fetch(`${API_BASE}/api/google/calendar/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCalendars(data.calendars || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingCalendars(false); }
  }, []);

  // ── Connect: redirect to Google OAuth ──────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (isAuthFetchInProgress() || isAuthInProgress()) return;
    try {
      setStatus('loading');
      setAuthFetchInProgress(true);
      const response = await fetch(`${API_BASE}/api/google/auth/url?returnPath=${encodeURIComponent('/configuracion/google-calendar')}`);
      const data = await response.json();
      if (!response.ok) {
        setStatus('error');
        setMsg({
          type: 'error',
          text: response.status === 503
            ? (data?.error || 'Google Calendar no está configurado en el servidor.')
            : 'No se pudo iniciar la autenticación con Google.',
        });
        setAuthFetchInProgress(false);
        return;
      }
      if (data?.url?.trim()) {
        setAuthInProgressFlag();
        window.location.href = data.url;
      } else {
        setStatus('error');
        setMsg({ type: 'error', text: 'No se pudo obtener la URL de autenticación.' });
        setAuthFetchInProgress(false);
      }
    } catch {
      setStatus('error');
      setMsg({ type: 'error', text: 'Error de conexión al iniciar autenticación.' });
      setAuthFetchInProgress(false);
    }
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const handleDisconnect = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('google_connected_email');
    localStorage.removeItem('calendarEvents');
    localStorage.removeItem('google_selected_calendar');
    setAuthFetchInProgress(false);
    clearAuthInProgress();
    authAttemptedRef.current = false;
    setConnectedEmail(null);
    setCalendars([]);
    setSelectedCalendar('primary');
    setStatus('idle');
    setMsg({ type: 'success', text: 'Cuenta de Google desconectada.' });
    // Notify other components (Calendar) about the disconnect
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: null }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'google_connected_email', newValue: null }));
  }, []);

  // ── Save calendar selection ────────────────────────────────────────────────
  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    localStorage.setItem('google_selected_calendar', selectedCalendar);
    // Dispatch a storage event so calendar.jsx picks it up immediately
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'google_selected_calendar',
      newValue: selectedCalendar,
    }));
    setTimeout(() => {
      setSaving(false);
      setMsg({ type: 'success', text: 'Calendario seleccionado guardado.' });
    }, 200);
  };

  // ── Handle OAuth callback if we're back from redirect ──────────────────────
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleAuthSuccess = urlParams.get('google_auth') === 'success';
    const errorFromUrl = urlParams.get('error');

    if (errorFromUrl) {
      clearAuthInProgress();
      setAuthFetchInProgress(false);
      setStatus('error');
      const messageFromUrl = urlParams.get('message') || '';
      const errorMessages = {
        invalid_grant: 'Código de autorización expirado. Intente nuevamente.',
        oauth_error: 'Error de autorización de Google.' + (messageFromUrl ? ` (${messageFromUrl})` : ''),
        no_code: 'No se recibió código de autorización.',
        redirect_uri_mismatch: 'URI de redirección no registrada en Google Cloud Console.',
        invalid_client: 'Client ID o Client Secret incorrectos. Verifica las credenciales en .env.',
        auth_error: messageFromUrl || 'Error en la autenticación.',
      };
      setMsg({ type: 'error', text: errorMessages[errorFromUrl] || messageFromUrl || 'Error en la autenticación.' });
      window.history.replaceState({}, document.title, window.location.pathname);
      authAttemptedRef.current = true;
      return;
    }

    if (googleAuthSuccess) {
      window.history.replaceState({}, document.title, window.location.pathname);
      clearAuthInProgress();
      setAuthFetchInProgress(false);
      authAttemptedRef.current = true;
      (async () => {
        try {
          // A-4: el endpoint exige la sesión de la app (JWT en Authorization),
          // por eso va por la instancia de axios (vía googleTokenService).
          const data = await fetchGoogleSessionToken();
          setConnectedEmail(null); // will be fetched below
          setStatus('connected');
          setMsg({ type: 'success', text: 'Cuenta de Google conectada exitosamente.' });
          fetchUserInfo(data.accessToken);
          fetchCalendars(data.accessToken);
        } catch (err) {
          setStatus('error');
          setMsg({
            type: 'error',
            text: err?.response
              ? 'No se pudo leer el token de Google.'
              : 'Error al obtener el token de Google.',
          });
        }
      })();
      return;
    }

    // Normal init: clear any stale auth flags left from a previous interrupted attempt
    clearAuthInProgress();
    setAuthFetchInProgress(false);

    (async () => {
      const token = await getValidToken();
      if (token) {
        setStatus('connected');
        fetchUserInfo(token);
        fetchCalendars(token);
      } else {
        setStatus('idle');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected = status === 'connected' || (connectedEmail && getAccessToken());

  return (
    <div>
      {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}

      {/* Connection status */}
      <div className="settings-form-group">
        <label>Estado de conexión</label>
        {isConnected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.35rem 0.75rem', borderRadius: '999px', fontSize: '0.85rem',
              backgroundColor: 'color-mix(in srgb, var(--color-success, #22c55e) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-success, #22c55e) 35%, transparent)',
              color: 'var(--color-success, #16a34a)',
            }}>
              ✓ Conectado{connectedEmail ? `: ${connectedEmail}` : ''}
            </span>
            <button
              type="button"
              className="settings-btn-danger"
              onClick={handleDisconnect}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="settings-btn-primary"
              onClick={handleConnect}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Conectando…' : 'Conectar con Google Calendar'}
            </button>
            <p className="hint" style={{ marginTop: '0.5rem' }}>
              Conecta tu cuenta de Google para sincronizar citas y eventos con Google Calendar.
            </p>
          </div>
        )}
      </div>

      {/* Calendar selector (only when connected) */}
      {isConnected && (
        <form onSubmit={handleSave}>
          <div className="settings-form-group">
            <label>Calendario destino</label>
            {loadingCalendars ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cargando calendarios…</p>
            ) : calendars.length > 0 ? (
              <>
                <select
                  value={selectedCalendar}
                  onChange={(e) => setSelectedCalendar(e.target.value)}
                >
                  {calendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.summary}{cal.primary ? ' (Principal)' : ''}
                    </option>
                  ))}
                </select>
                <p className="hint" style={{ marginTop: '0.4rem' }}>
                  Las citas y eventos se crearán en este calendario de Google Calendar.
                </p>
              </>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                No se encontraron calendarios. Verifica que tu cuenta tenga al menos un calendario con permisos de escritura.
              </p>
            )}
          </div>

          <div className="settings-form-group">
            <label>Sincronización automática</label>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Los eventos se sincronizan automáticamente cada 5 minutos mientras el calendario está abierto.
              Las citas creadas en el sistema se envían a Google Calendar en tiempo real.
            </p>
          </div>

          {calendars.length > 0 && (
            <div className="settings-actions">
              <button type="submit" className="settings-btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default GoogleCalendarSection;
