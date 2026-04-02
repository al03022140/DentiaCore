import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import '../Styles/Calendar.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5002';

// ── Auth progress flags ────────────────────────────────────────────────────────
const AUTH_PROGRESS_KEY = 'authInProgress';
const AUTH_FETCH_PROGRESS_KEY = 'authFetchInProgress';
const isAuthInProgress = () => typeof window !== 'undefined' && localStorage.getItem(AUTH_PROGRESS_KEY) === '1';
const setAuthInProgress = () => typeof window !== 'undefined' && localStorage.setItem(AUTH_PROGRESS_KEY, '1');
const clearAuthInProgress = () => typeof window !== 'undefined' && localStorage.removeItem(AUTH_PROGRESS_KEY);
const isAuthFetchInProgress = () => typeof window !== 'undefined' && localStorage.getItem(AUTH_FETCH_PROGRESS_KEY) === '1';
const setAuthFetchInProgress = (value) => {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(AUTH_FETCH_PROGRESS_KEY, '1');
  else localStorage.removeItem(AUTH_FETCH_PROGRESS_KEY);
};

// ── Token storage ──────────────────────────────────────────────────────────────
const storeTokenWithExpiration = (token, expiresIn = 3600, refreshToken = null) => {
  const expirationTime = Date.now() + expiresIn * 1000;
  localStorage.setItem('accessToken', JSON.stringify({ token, expiration: expirationTime, refreshToken }));
};

const getStoredToken = () => {
  try {
    const tokenData = localStorage.getItem('accessToken');
    if (!tokenData) return null;
    if (!tokenData.startsWith('{')) return tokenData;
    const parsed = JSON.parse(tokenData);
    if (!parsed.token || !parsed.expiration) return parsed.token || parsed;
    const timeUntilExpiry = parsed.expiration - Date.now();
    if (timeUntilExpiry > 0) {
      return { token: parsed.token, refreshToken: parsed.refreshToken, needsRefresh: timeUntilExpiry < 5 * 60 * 1000 };
    }
    if (!parsed.refreshToken) localStorage.removeItem('accessToken');
    return parsed.refreshToken ? { token: null, refreshToken: parsed.refreshToken, needsRefresh: true } : null;
  } catch {
    localStorage.removeItem('accessToken');
    return null;
  }
};

const storeEventsLocally = (fetchedEvents) => {
  const expiration = new Date();
  expiration.setMonth(expiration.getMonth() + 1);
  localStorage.setItem('calendarEvents', JSON.stringify({ events: fetchedEvents, expiration: expiration.toISOString() }));
};

const loadLocalEvents = () => {
  try {
    const localData = JSON.parse(localStorage.getItem('calendarEvents'));
    if (localData?.events && localData.expiration) {
      if (new Date(localData.expiration) > new Date()) return localData.events;
      localStorage.removeItem('calendarEvents');
    }
  } catch {
    localStorage.removeItem('calendarEvents');
  }
  return null;
};

// ── Format helpers ─────────────────────────────────────────────────────────────
const formatTime = (dateTimeStr) => {
  if (!dateTimeStr) return null;
  const d = new Date(dateTimeStr);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatRelativeSync = (lastSyncTime) => {
  if (!lastSyncTime) return null;
  const diffMs = Date.now() - lastSyncTime;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora mismo';
  if (diffMin === 1) return 'hace 1 min';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  return diffH === 1 ? 'hace 1 hora' : `hace ${diffH} horas`;
};

// Density level for a day's event count
const getDensityClass = (count) => {
  if (count >= 7) return 'has-packed';
  if (count >= 5) return 'has-many';
  if (count >= 3) return 'has-some';
  if (count >= 1) return 'has-few';
  return '';
};

// ── Color legend ───────────────────────────────────────────────────────────────
const ColorLegend = () => (
  <div className="color-legend">
    <span className="color-legend__title">Eventos por día:</span>
    <span className="color-legend__item">
      <span className="color-legend__dot has-few-dot" />1–2
    </span>
    <span className="color-legend__item">
      <span className="color-legend__dot has-some-dot" />3–4
    </span>
    <span className="color-legend__item">
      <span className="color-legend__dot has-many-dot" />5–6
    </span>
    <span className="color-legend__item">
      <span className="color-legend__dot has-packed-dot" />7+
    </span>
  </div>
);

// ── Sync icon SVG ──────────────────────────────────────────────────────────────
const SyncIcon = ({ spinning }) => (
  <svg
    className={`sync-icon-svg${spinning ? ' spinning' : ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="14"
    height="14"
    aria-hidden="true"
  >
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
);

// ── Main component ─────────────────────────────────────────────────────────────
const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [systemDate, setSystemDate] = useState(new Date());
  const currentHour = systemDate.getHours();

  const [syncStatus, setSyncStatus] = useState(() => {
    try {
      const td = localStorage.getItem('accessToken');
      if (!td) return 'idle';
      const p = td.startsWith('{') ? JSON.parse(td) : null;
      return (p?.token || !td.startsWith('{')) ? 'loading' : (p?.refreshToken ? 'loading' : 'idle');
    } catch { return 'idle'; }
  });
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [relativeSync, setRelativeSync] = useState(null);
  const [connectedEmail, setConnectedEmail] = useState(
    () => localStorage.getItem('google_connected_email') || null
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    () => localStorage.getItem('google_selected_calendar') || 'primary'
  );

  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    summary: '', description: '', date: '', startTime: '09:00', endTime: '10:00', location: '',
  });
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Event detail popup / overview
  const [selectedEvent, setSelectedEvent] = useState(null);
  // Date picker overlay
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const isInitializedRef = useRef(false);
  const authAttemptedRef = useRef(false);
  const fetchedRangeRef = useRef({ min: null, max: null });
  const currentHourRef = useRef(null);
  const scheduleContentRef = useRef(null);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const getAccessToken = useCallback(() => {
    const stored = getStoredToken();
    if (typeof stored === 'string') return stored;
    return stored?.token || null;
  }, []);

  const renewAccessToken = useCallback(async (refreshToken) => {
    try {
      const response = await fetch(`${API_BASE}/api/google/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (response.ok) {
        const data = await response.json();
        storeTokenWithExpiration(data.accessToken, data.expiresIn, data.refreshToken);
        return data.accessToken;
      }
      localStorage.removeItem('accessToken');
      return null;
    } catch {
      return null;
    }
  }, []);

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
    } catch { /* non-critical, ignore */ }
  }, []);

  const fetchCalendarEvents = useCallback(async (token, _isRetry = false) => {
    if (!token) {
      setSyncStatus('idle');
      setSyncMessage('');
      return;
    }
    try {
      setSyncStatus('loading');
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999).toISOString();
      const calId = localStorage.getItem('google_selected_calendar') || 'primary';
      const url = `${API_BASE}/api/google/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&calendarId=${encodeURIComponent(calId)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if ((response.status === 401 || response.status === 403) && !_isRetry) {
        // Try refreshing the token before giving up
        const stored = getStoredToken();
        const refreshTk = (typeof stored === 'object' && stored?.refreshToken) || null;
        if (refreshTk) {
          const newToken = await renewAccessToken(refreshTk);
          if (newToken) return fetchCalendarEvents(newToken, true);
        }
        localStorage.removeItem('accessToken');
        setSyncStatus('error');
        setSyncMessage('Sesión de Google expirada. Reconecta en Configuración > Google Calendar.');
        return;
      }
      if (!response.ok) {
        setSyncStatus('connection-error');
        setSyncMessage('No se pudieron obtener los eventos. Verifica tu conexión.');
        return;
      }
      const data = await response.json();
      setEvents(data.items || []);
      storeEventsLocally(data.items || []);
      fetchedRangeRef.current = {
        min: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        max: new Date(now.getFullYear(), now.getMonth() + 2, 0),
      };
      setSyncStatus('success');
      setSyncMessage('Sincronizado con Google Calendar');
      setLastSyncTime(Date.now());
    } catch {
      setSyncStatus('connection-error');
      setSyncMessage('Error de conexión. Verifica tu red.');
    }
  }, [renewAccessToken]);

  const checkAccessToken = useCallback(async () => {
    const stored = getStoredToken();
    if (!stored) {
      setSyncStatus('idle');
      setSyncMessage('');
      return;
    }
    const token = typeof stored === 'string' ? stored : stored?.token;
    // If token needs refresh (or is expired), try refreshing first
    if (stored?.needsRefresh && stored?.refreshToken) {
      const newToken = await renewAccessToken(stored.refreshToken);
      if (newToken) {
        fetchCalendarEvents(newToken);
        return;
      }
    }
    if (token) {
      fetchCalendarEvents(token);
    } else if (stored?.refreshToken) {
      // Token fully expired but refresh token exists
      const newToken = await renewAccessToken(stored.refreshToken);
      if (newToken) {
        fetchCalendarEvents(newToken);
      } else {
        localStorage.removeItem('accessToken');
        setSyncStatus('error');
        setSyncMessage('No se pudo renovar la sesión. Reconecta en Configuración.');
      }
    } else {
      setSyncStatus('idle');
      setSyncMessage('');
    }
  }, [fetchCalendarEvents, renewAccessToken]);

  // ── Effects ────────────────────────────────────────────────────────────────
  // Handle OAuth callback: both old ?accessToken= and new ?google_auth=success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('accessToken');
    const refreshTokenFromUrl = urlParams.get('refreshToken');
    const errorFromUrl = urlParams.get('error');
    const expiresInParam = urlParams.get('expiresIn');
    const googleAuthSuccess = urlParams.get('google_auth') === 'success';

    if (errorFromUrl) {
      authAttemptedRef.current = true;
      clearAuthInProgress();
      setAuthFetchInProgress(false);
      setSyncStatus('error');
      const errorMessages = {
        invalid_grant: 'Código de autorización expirado. Haz clic para intentar nuevamente.',
        oauth_error: 'Error de autorización de Google. Haz clic para intentar nuevamente.',
        no_code: 'No se recibió código de autorización. Haz clic para intentar nuevamente.',
      };
      setSyncMessage(errorMessages[errorFromUrl] || 'Error en la autenticación. Haz clic para intentar nuevamente.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (googleAuthSuccess) {
      // New flow: server set httpOnly cookie, fetch token via secure endpoint
      window.history.replaceState({}, document.title, window.location.pathname);
      clearAuthInProgress();
      setAuthFetchInProgress(false);
      authAttemptedRef.current = true;
      (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/google/auth/token`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            storeTokenWithExpiration(data.accessToken, data.expiresIn, data.refreshToken);
            fetchUserInfo(data.accessToken);
            fetchCalendarEvents(data.accessToken);
            // If there's a saved return path (e.g. from Settings), navigate there
            const returnPath = localStorage.getItem('google_auth_return_path');
            if (returnPath) {
              localStorage.removeItem('google_auth_return_path');
              // Small delay to ensure token is persisted before navigating
              setTimeout(() => { window.location.replace(returnPath); }, 300);
            }
          } else {
            setSyncStatus('error');
            setSyncMessage('No se pudo leer el token de Google.');
          }
        } catch {
          setSyncStatus('error');
          setSyncMessage('Error al obtener el token de Google.');
        }
      })();
      return;
    }

    if (tokenFromUrl) {
      // Legacy flow: token in URL param
      const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;
      storeTokenWithExpiration(tokenFromUrl, Number.isFinite(expiresIn) ? expiresIn : 3600, refreshTokenFromUrl);
      authAttemptedRef.current = true;
      clearAuthInProgress();
      setAuthFetchInProgress(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchUserInfo(tokenFromUrl);
      fetchCalendarEvents(tokenFromUrl);
    }
  }, [fetchCalendarEvents, fetchUserInfo]);

  // Initial auth check — passive, no redirects.
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      if (!authAttemptedRef.current) {
        checkAccessToken();
      }
    }
  }, [checkAccessToken]);

  // Load cached events
  useEffect(() => {
    const localEvents = loadLocalEvents();
    if (localEvents) setEvents(localEvents);
  }, []);

  // System clock tick
  useEffect(() => {
    const interval = setInterval(() => setSystemDate(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Proactive token refresh every 10 minutes (also handles already-expired tokens)
  useEffect(() => {
    const check = async () => {
      try {
        const tokenData = localStorage.getItem('accessToken');
        if (!tokenData || !tokenData.startsWith('{')) return;
        const parsed = JSON.parse(tokenData);
        if (parsed.refreshToken && parsed.expiration) {
          const timeUntilExpiry = parsed.expiration - Date.now();
          if (timeUntilExpiry < 10 * 60 * 1000) {
            await renewAccessToken(parsed.refreshToken);
          }
        }
      } catch { /* ignore */ }
    };
    check();
    const interval = setInterval(check, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [renewAccessToken]);

  // Auto-sync every 5 minutes (with token refresh fallback)
  useEffect(() => {
    const interval = setInterval(async () => {
      const stored = getStoredToken();
      const token = typeof stored === 'string' ? stored : stored?.token;
      if (token) {
        fetchCalendarEvents(token);
      } else if (stored?.refreshToken) {
        const newToken = await renewAccessToken(stored.refreshToken);
        if (newToken) fetchCalendarEvents(newToken);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchCalendarEvents, renewAccessToken]);

  // Update relative sync label every minute
  useEffect(() => {
    const update = () => setRelativeSync(formatRelativeSync(lastSyncTime));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  // Scroll to current hour when the viewed date changes (today → go to current hour, other day → go to top)
  useEffect(() => {
    const container = scheduleContentRef.current;
    if (!container) return;
    const isViewingToday = currentDate.toDateString() === new Date().toDateString();
    if (isViewingToday && currentHourRef.current) {
      currentHourRef.current.scrollIntoView({ block: 'start' });
    } else {
      container.scrollTop = 0;
    }
  }, [currentDate]);

  // Re-fetch when navigating outside fetched range
  useEffect(() => {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const range = fetchedRangeRef.current;
    if (range.min && range.max) {
      const curYM = year * 12 + month;
      const minYM = range.min.getFullYear() * 12 + range.min.getMonth();
      const maxYM = range.max.getFullYear() * 12 + range.max.getMonth();
      if (curYM >= minYM && curYM <= maxYM) return;
    }
    (async () => {
      const stored = getStoredToken();
      let token = typeof stored === 'string' ? stored : stored?.token;
      if (!token && stored?.refreshToken) {
        token = await renewAccessToken(stored.refreshToken);
      }
      if (!token) return;
      const timeMin = new Date(year, month - 1, 1).toISOString();
      const timeMax = new Date(year, month + 2, 0, 23, 59, 59, 999).toISOString();
      const calId = localStorage.getItem('google_selected_calendar') || 'primary';
      try {
        const res = await fetch(
          `${API_BASE}/api/google/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&calendarId=${encodeURIComponent(calId)}`,
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (res.ok) {
          const data = await res.json();
          setEvents(data.items || []);
          storeEventsLocally(data.items || []);
          fetchedRangeRef.current = { min: new Date(year, month - 1, 1), max: new Date(year, month + 1, 28) };
        }
      } catch { /* ignore */ }
    })();
  }, [currentDate, renewAccessToken]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigateDay = (offset) => {
    setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + offset); return d; });
    setSelectedEvent(null);
  };

  const navigateMonth = (offset) => {
    setCurrentDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + offset); return d; });
    setSelectedEvent(null);
  };

  const openDatePicker = () => {
    setPickerYear(currentDate.getFullYear());
    setShowDatePicker(true);
  };

  const selectPickerMonth = (monthIdx) => {
    setCurrentDate(prev => {
      const lastDay = new Date(pickerYear, monthIdx + 1, 0).getDate();
      const day = Math.min(prev.getDate(), lastDay);
      return new Date(pickerYear, monthIdx, day);
    });
    setShowDatePicker(false);
    setSelectedEvent(null);
  };

  // ── Event counts per day (for color density) ───────────────────────────────
  const eventCountByDay = useMemo(() => {
    const counts = {};
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    events.forEach(event => {
      if (event.status === 'cancelled') return;
      let dateStr;
      if (event.start?.date) dateStr = event.start.date;
      else if (event.start?.dateTime) dateStr = event.start.dateTime.slice(0, 10);
      if (!dateStr) return;
      const [ey, em, ed] = dateStr.split('-').map(Number);
      if (ey === year && em - 1 === month) {
        counts[ed] = (counts[ed] || 0) + 1;
      }
    });
    return counts;
  }, [events, currentDate]);

  // ── Filtered events for selected day ──────────────────────────────────────
  const eventsForSelectedDay = useMemo(() => {
    const selectedDayStr = currentDate.toISOString().split('T')[0];
    return events
      .filter(event => {
        if (event.status === 'cancelled') return false;
        if (event.start?.date) return event.start.date === selectedDayStr;
        if (event.start?.dateTime) return new Date(event.start.dateTime).toDateString() === currentDate.toDateString();
        return false;
      })
      .sort((a, b) => {
        const aTime = a.start.dateTime ? new Date(a.start.dateTime) : new Date(a.start.date);
        const bTime = b.start.dateTime ? new Date(b.start.dateTime) : new Date(b.start.date);
        return aTime - bTime;
      });
  }, [events, currentDate]);

  const visibleHours = Array.from({ length: 24 }, (_, i) => i);

  // ── Create event ───────────────────────────────────────────────────────────
  const openEventModal = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    setEventForm({ summary: '', description: '', date: dateStr, startTime: '09:00', endTime: '10:00', location: '' });
    setShowEventModal(true);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    let token = getAccessToken();
    // If no valid token, try refreshing
    if (!token) {
      const stored = getStoredToken();
      if (stored?.refreshToken) {
        token = await renewAccessToken(stored.refreshToken);
      }
    }
    if (!token) {
      setSyncStatus('error');
      setSyncMessage('No hay sesión de Google. Configura en Configuración > Google Calendar.');
      setShowEventModal(false);
      return;
    }
    setCreatingEvent(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const calId = localStorage.getItem('google_selected_calendar') || 'primary';
      const eventBody = {
        summary: eventForm.summary,
        description: eventForm.description || undefined,
        location: eventForm.location || undefined,
        start: { dateTime: `${eventForm.date}T${eventForm.startTime}:00`, timeZone },
        end: { dateTime: `${eventForm.date}T${eventForm.endTime}:00`, timeZone },
        calendarId: calId,
      };

      const doCreate = async (tk) => {
        return fetch(`${API_BASE}/api/google/calendar/events`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        });
      };

      let response = await doCreate(token);

      // Retry once with refreshed token on 401
      if (response.status === 401 || response.status === 403) {
        const stored = getStoredToken();
        if (stored?.refreshToken) {
          const newToken = await renewAccessToken(stored.refreshToken);
          if (newToken) response = await doCreate(newToken);
        }
      }

      if (response.ok) {
        const newEvent = await response.json();
        setEvents(prev => [...prev, newEvent]);
        setShowEventModal(false);
        setSyncStatus('success');
        setSyncMessage('Evento creado en Google Calendar');
        setLastSyncTime(Date.now());
      } else {
        setSyncStatus('error');
        setSyncMessage('Error al crear el evento en Google Calendar.');
      }
    } catch {
      setSyncMessage('Error de conexión al crear el evento.');
    } finally {
      setCreatingEvent(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderHours = () => {
    const allDayEvents = eventsForSelectedDay.filter(e => e.start.date && !e.start.dateTime);
    const timedEvents = eventsForSelectedDay.filter(e => e.start.dateTime);
    const eventsByHour = timedEvents.reduce((acc, event) => {
      const hour = new Date(event.start.dateTime).getHours();
      if (!acc[hour]) acc[hour] = [];
      acc[hour].push(event);
      return acc;
    }, {});

    return (
      <>
        {allDayEvents.length > 0 && (
          <div className="hour">
            <div className="hour-time">Todo el día</div>
            <div className="hour-events">
              {allDayEvents.map(event => (
                <button
                  key={event.id}
                  className="event event--allday"
                  onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                  type="button"
                >
                  {event.summary || 'Sin título'}
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleHours.map(hour => {
          const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
          const hourEvents = eventsByHour[hour] || [];
          const isCurrent = hour === currentHour && currentDate.toDateString() === new Date().toDateString();
          return (
            <div key={hour} ref={isCurrent ? currentHourRef : null} className={`hour ${isCurrent ? 'current-hour' : ''}`}>
              <div className="hour-time">{timeLabel}</div>
              <div className="hour-events">
                {hourEvents.length > 0 ? (
                  hourEvents.map(event => {
                    const minutes = new Date(event.start.dateTime).getMinutes();
                    const isActive = selectedEvent?.id === event.id;
                    return (
                      <button
                        key={event.id}
                        className={`event${isActive ? ' event--active' : ''}`}
                        onClick={() => setSelectedEvent(isActive ? null : event)}
                        type="button"
                      >
                        <span className="event-title">{event.summary || 'Sin título'}</span>
                        {minutes > 0 && (
                          <span className="event-time">:{minutes.toString().padStart(2, '0')}</span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="no-events">Sin eventos</div>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const renderMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const daysInPreviousMonth = new Date(year, month, 0).getDate();
    const dayLabels = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

    const days = [];
    for (let i = firstDayOfWeek; i > 0; i--) {
      days.push(<div key={`prev-${i}`} className="day disabled">{daysInPreviousMonth - i + 1}</div>);
    }
    for (let day = 1; day <= lastDayOfMonth; day++) {
      const date = new Date(year, month, day);
      const isToday = date.toDateString() === new Date().toDateString();
      const isSelected = date.toDateString() === currentDate.toDateString();
      const count = eventCountByDay[day] || 0;
      const densityClass = getDensityClass(count);
      days.push(
        <div
          key={day}
          className={`day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${densityClass}`}
          onClick={() => { setCurrentDate(date); setSelectedEvent(null); }}
          title={count > 0 ? `${count} evento${count > 1 ? 's' : ''}` : undefined}
        >
          {day}
        </div>
      );
    }

    return (
      <div className="month-calendar">
        <div className="days-grid">
          {dayLabels.map((label, i) => <div key={`label-${i}`} className="day-label">{label}</div>)}
          {days}
        </div>
        <ColorLegend />
      </div>
    );
  };

  const isToday = currentDate.toDateString() === systemDate.toDateString();

  // Minimal sync status indicator (no full sync button — config is in Settings)
  const syncIndicatorTitle = syncStatus === 'loading'
    ? 'Sincronizando...'
    : syncStatus === 'success'
    ? (relativeSync ? `Sync ${relativeSync}` : 'Sincronizado')
    : syncStatus === 'error' || syncStatus === 'connection-error'
    ? (syncMessage || 'Error de sincronización')
    : connectedEmail ? 'Conectado' : 'No conectado — configura en Ajustes';

  // ── Listen for calendar selection changes from Settings ──────────────────
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'google_selected_calendar') {
        setSelectedCalendarId(e.newValue || 'primary');
        const token = getAccessToken();
        if (token) fetchCalendarEvents(token);
      }
      // If tokens were cleared from settings (disconnect), reset
      if (e.key === 'accessToken' && !e.newValue) {
        setEvents([]);
        setSyncStatus('idle');
        setSyncMessage('');
        setConnectedEmail(null);
        setLastSyncTime(null);
      }
      if (e.key === 'google_connected_email') {
        setConnectedEmail(e.newValue || null);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [getAccessToken, fetchCalendarEvents]);

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="calendar-wrapper">
      <div className="calendar-container">

        {/* ── Top bar: minimal sync indicator + add button ── */}
        <div className="calendar-topbar">
          <div className="sync-group">
            <span
              className={`sync-indicator sync-indicator--${syncStatus}`}
              title={syncIndicatorTitle}
            >
              <SyncIcon spinning={syncStatus === 'loading'} />
              <span className="sync-indicator__label">
                {syncStatus === 'loading' ? 'Sincronizando...'
                  : syncStatus === 'success' ? (relativeSync || 'Sincronizado')
                  : syncStatus === 'error' || syncStatus === 'connection-error' ? 'Sin conexión'
                  : connectedEmail ? 'Conectado' : 'Sin configurar'}
              </span>
            </span>
          </div>

          <button className="add-event-btn" onClick={openEventModal} title="Agregar evento en Google Calendar">
            <span className="add-event-btn__icon">+</span>
            <span className="add-event-btn__label">Nuevo evento</span>
          </button>
        </div>

        {/* ── Left column: day display ── */}
        <div className="day-display">
          <button className="month-name" onClick={openDatePicker} title="Seleccionar mes y año">
            {currentDate.toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())}
          </button>
          <div className="day-nav">
            <button className="nav-arrow" onClick={() => navigateDay(-1)} title="Día anterior">&#8249;</button>
            <button className="day-number" onClick={openDatePicker} title="Seleccionar mes y año">{currentDate.getDate()}</button>
            <button className="nav-arrow" onClick={() => navigateDay(1)} title="Día siguiente">&#8250;</button>
          </div>
        </div>

        {/* ── Right column: agenda ── */}
        <div className="schedule">
          <div className="schedule-title">
            {isToday ? 'Agenda de hoy' : `Agenda — ${currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`}
          </div>
          <div
            ref={scheduleContentRef}
            className="schedule-content"
          >
            {renderHours()}
          </div>
        </div>

        {/* ── Bottom left: mini calendar ── */}
        {renderMonth()}

      </div>

      {/* ── Event overview modal ── */}
      {selectedEvent && (() => {
        const ev = selectedEvent;
        const isAllDay = !ev.start?.dateTime;
        const startDt = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
        const endDt   = ev.end?.dateTime   ? new Date(ev.end.dateTime)   : null;
        const dateLabel = startDt
          ? startDt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : ev.start?.date
            ? new Date(ev.start.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : 'Sin fecha';
        const duration = startDt && endDt ? (() => {
          const totalMin = Math.round((endDt - startDt) / 60000);
          const h = Math.floor(totalMin / 60), m = totalMin % 60;
          if (h === 0) return `${m}\u00a0min`;
          if (m === 0) return `${h}\u00a0h`;
          return `${h}\u00a0h\u00a0${m}\u00a0min`;
        })() : null;
        const statusMap = {
          confirmed: { label: 'Confirmado', cls: 'eo__status--confirmed' },
          tentative:  { label: 'Tentativo',  cls: 'eo__status--tentative'  },
          cancelled:  { label: 'Cancelado',  cls: 'eo__status--cancelled'  },
        };
        const statusInfo = statusMap[ev.status] || null;
        const isRecurring = !!ev.recurringEventId;
        const videoEp = ev.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video');
        const confName = ev.conferenceData?.conferenceSolution?.name || null;
        const organizer = ev.organizer;
        const attendees = ev.attendees || [];
        const accepted = attendees.filter(a => a.responseStatus === 'accepted').length;
        const declined = attendees.filter(a => a.responseStatus === 'declined').length;
        const pending  = attendees.filter(a => a.responseStatus === 'needsAction' || a.responseStatus === 'tentative').length;
        const getInitials = (name, email) => {
          if (name) {
            const p = name.trim().split(/\s+/);
            return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
          }
          return email ? email[0].toUpperCase() : '?';
        };
        return (
          <div className="event-overview-overlay" onClick={() => setSelectedEvent(null)}>
            <div className="event-overview" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="eo__header">
                <div className="eo__header-main">
                  <div className="eo__title">{ev.summary || 'Sin título'}</div>
                  <div className="eo__meta">
                    {statusInfo && <span className={`eo__status ${statusInfo.cls}`}>{statusInfo.label}</span>}
                    {isRecurring && (
                      <span className="eo__badge eo__badge--recurring" title="Evento recurrente">
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,5 2,2 5,2"/><polyline points="14,11 14,14 11,14"/><path d="M2 2C5 2 14 5 14 11"/><path d="M14 14C11 14 2 11 2 5"/></svg>
                        Recurrente
                      </span>
                    )}
                  </div>
                </div>
                <button className="eo__close" onClick={() => setSelectedEvent(null)} type="button" aria-label="Cerrar">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
                </button>
              </div>

              <div className="eo__body">

                {/* Date & Time */}
                <div className="eo__section">
                  <div className="eo__section-label">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/><line x1="1.5" y1="6" x2="14.5" y2="6"/><line x1="5" y1="1" x2="5" y2="4"/><line x1="11" y1="1" x2="11" y2="4"/></svg>
                    Fecha y hora
                  </div>
                  <div className="eo__section-content">
                    <div className="eo__date-label">{dateLabel}</div>
                    {!isAllDay && startDt && (
                      <div className="eo__time-row">
                        <span className="eo__time-range">{formatTime(ev.start.dateTime)} – {formatTime(ev.end?.dateTime)}</span>
                        {duration && <span className="eo__duration-pill">{duration}</span>}
                      </div>
                    )}
                    {isAllDay && <div className="eo__allday-badge">Todo el día</div>}
                  </div>
                </div>

                {/* Location */}
                {ev.location && (
                  <div className="eo__section">
                    <div className="eo__section-label">
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6C12.5 3.515 10.485 1.5 8 1.5z"/><circle cx="8" cy="6" r="1.5"/></svg>
                      Ubicación
                    </div>
                    <div className="eo__section-content">
                      <div className="eo__location-text">{ev.location}</div>
                    </div>
                  </div>
                )}

                {/* Video call */}
                {videoEp && (
                  <div className="eo__section">
                    <div className="eo__section-label">
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="9" height="8" rx="1.5"/><polyline points="10,6 15,3.5 15,12.5 10,10"/></svg>
                      Videollamada{confName ? ` · ${confName}` : ''}
                    </div>
                    <div className="eo__section-content">
                      <a href={videoEp.uri} target="_blank" rel="noopener noreferrer" className="eo__join-btn">
                        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="9" height="8" rx="1.5"/><polyline points="10,6 15,3.5 15,12.5 10,10"/></svg>
                        Unirse a la reunión
                      </a>
                    </div>
                  </div>
                )}

                {/* People */}
                {(organizer || attendees.length > 0) && (
                  <div className="eo__section">
                    <div className="eo__section-label">
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="4.5" r="2.5"/><path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4"/><circle cx="11.5" cy="5" r="2"/><path d="M14 13c0-2.2-1-3.5-2.5-4"/></svg>
                      Personas
                    </div>
                    <div className="eo__section-content">
                      {organizer && (
                        <div className="eo__organizer-row">
                          <div className="eo__avatar">{getInitials(organizer.displayName, organizer.email)}</div>
                          <div>
                            <div className="eo__organizer-name">{organizer.displayName || organizer.email}</div>
                            <div className="eo__organizer-role">Organizador</div>
                          </div>
                        </div>
                      )}
                      {attendees.length > 0 && (
                        <div className="eo__attendees-block">
                          <div className="eo__attendees-summary">
                            <span>{attendees.length} asistente{attendees.length !== 1 ? 's' : ''}</span>
                            {accepted > 0 && <span className="eo__att-count eo__att-count--yes">✓ {accepted}</span>}
                            {declined > 0 && <span className="eo__att-count eo__att-count--no">✗ {declined}</span>}
                            {pending  > 0 && <span className="eo__att-count eo__att-count--pending">? {pending}</span>}
                          </div>
                          <div className="eo__attendees-list">
                            {attendees.slice(0, 6).map((a, i) => (
                              <span
                                key={i}
                                className={`eo__attendee-chip eo__attendee-chip--${a.responseStatus === 'accepted' ? 'yes' : a.responseStatus === 'declined' ? 'no' : 'pending'}`}
                                title={a.email}
                              >
                                <span className="eo__attendee-chip-dot" />
                                {a.displayName || a.email}
                              </span>
                            ))}
                            {attendees.length > 6 && <span className="eo__attendees-more">+{attendees.length - 6} más</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Description */}
                {ev.description && (
                  <div className="eo__section">
                    <div className="eo__section-label">
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="7.5" x2="14" y2="7.5"/><line x1="2" y1="11" x2="9" y2="11"/></svg>
                      Descripción
                    </div>
                    <div className="eo__section-content">
                      <div className="eo__description-text">{ev.description}</div>
                    </div>
                  </div>
                )}

              </div>{/* /eo__body */}

              {/* Footer */}
              {ev.htmlLink && (
                <div className="eo__footer">
                  <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="eo__footer-btn">
                    Ver en Google Calendar
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><polyline points="10,1 15,1 15,6"/><line x1="9" y1="7" x2="15" y2="1"/></svg>
                  </a>
                </div>
              )}

            </div>{/* /event-overview */}
          </div>
        );
      })()}

      {/* ── Date picker overlay ── */}
      {showDatePicker && (
        <div className="date-picker-overlay" onClick={() => setShowDatePicker(false)}>
          <div className="date-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="date-picker-modal__header">
              <button className="date-picker-modal__year-arrow" onClick={() => setPickerYear(y => y - 1)}>&#8249;</button>
              <span className="date-picker-modal__year">{pickerYear}</span>
              <button className="date-picker-modal__year-arrow" onClick={() => setPickerYear(y => y + 1)}>&#8250;</button>
              <button className="date-picker-modal__close" onClick={() => setShowDatePicker(false)}>×</button>
            </div>
            <div className="date-picker-modal__months">
              {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((name, i) => (
                <button
                  key={i}
                  className={`date-picker-modal__month ${currentDate.getMonth() === i && currentDate.getFullYear() === pickerYear ? 'active' : ''}`}
                  onClick={() => selectPickerMonth(i)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Create event modal ── */}
      {showEventModal && (
        <div className="event-modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="event-modal" onClick={e => e.stopPropagation()}>
            <div className="event-modal__header">
              <h3>Nuevo evento en Google Calendar</h3>
              <button className="event-modal__close" onClick={() => setShowEventModal(false)}>&times;</button>
            </div>
            <form className="event-modal__form" onSubmit={handleCreateEvent}>
              <div className="event-modal__field">
                <label className="event-modal__label">Nombre del evento</label>
                <input
                  className="event-modal__input"
                  type="text"
                  required
                  value={eventForm.summary}
                  onChange={e => setEventForm(f => ({ ...f, summary: e.target.value }))}
                  placeholder="Ej: Consulta dental"
                />
              </div>
              <div className="event-modal__field">
                <label className="event-modal__label">Fecha</label>
                <input
                  className="event-modal__input"
                  type="date"
                  required
                  value={eventForm.date}
                  onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="event-modal__row">
                <div className="event-modal__field">
                  <label className="event-modal__label">Hora inicio</label>
                  <input
                    className="event-modal__input"
                    type="time"
                    required
                    value={eventForm.startTime}
                    onChange={e => setEventForm(f => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="event-modal__field">
                  <label className="event-modal__label">Hora fin</label>
                  <input
                    className="event-modal__input"
                    type="time"
                    required
                    value={eventForm.endTime}
                    onChange={e => setEventForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
              <div className="event-modal__field">
                <label className="event-modal__label">Ubicación</label>
                <input
                  className="event-modal__input"
                  type="text"
                  value={eventForm.location}
                  onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ej: Consultorio 3"
                />
              </div>
              <div className="event-modal__field">
                <label className="event-modal__label">Descripción</label>
                <textarea
                  className="event-modal__textarea"
                  value={eventForm.description}
                  onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalles del evento..."
                  rows={3}
                />
              </div>
              <div className="event-modal__actions">
                <button
                  className="event-modal__btn event-modal__btn--cancel"
                  type="button"
                  onClick={() => setShowEventModal(false)}
                >Cancelar</button>
                <button
                  className="event-modal__btn event-modal__btn--submit"
                  type="submit"
                  disabled={creatingEvent}
                >{creatingEvent ? 'Creando...' : 'Crear en Google Calendar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
