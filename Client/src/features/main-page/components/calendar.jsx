import React, { useEffect, useState, useRef, useMemo } from 'react';
import '../Styles/Calendar.css';
import checkCircle2Icon from '../../../assets/images/icons/check circle 2.svg';

// Helpers de estado de autenticación (evita ReferenceError y duplicación de lógica)
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

// ====== FUNCIONES PURAS DE ALMACENAMIENTO (fuera del componente) ======
const storeTokenWithExpiration = (token, expiresIn = 3600, refreshToken = null) => {
  const expirationTime = Date.now() + (expiresIn * 1000);
  localStorage.setItem('accessToken', JSON.stringify({
    token,
    expiration: expirationTime,
    refreshToken
  }));
};

const getStoredToken = () => {
  try {
    const tokenData = localStorage.getItem('accessToken');
    if (!tokenData) return null;

    // Formato antiguo: string simple
    if (!tokenData.startsWith('{')) return tokenData;

    const parsed = JSON.parse(tokenData);
    if (!parsed.token || !parsed.expiration) return parsed.token || parsed;

    const timeUntilExpiry = parsed.expiration - Date.now();

    if (timeUntilExpiry > 0) {
      return { token: parsed.token, refreshToken: parsed.refreshToken, needsRefresh: timeUntilExpiry < 5 * 60 * 1000 };
    }
    // Expirado
    if (!parsed.refreshToken) localStorage.removeItem('accessToken');
    return parsed.refreshToken ? { token: null, refreshToken: parsed.refreshToken, needsRefresh: true } : null;
  } catch (error) {
    console.error('Error al obtener token almacenado:', error);
    localStorage.removeItem('accessToken');
    return null;
  }
};

const storeEventsLocally = (fetchedEvents) => {
  const expiration = new Date();
  expiration.setMonth(expiration.getMonth() + 1);
  localStorage.setItem('calendarEvents', JSON.stringify({
    events: fetchedEvents,
    expiration: expiration.toISOString(),
  }));
};

const loadLocalEvents = () => {
  try {
    const localData = JSON.parse(localStorage.getItem('calendarEvents'));
    if (localData?.events && localData.expiration) {
      if (new Date(localData.expiration) > new Date()) return localData.events;
      localStorage.removeItem('calendarEvents');
    }
  } catch (error) {
    console.error('Error al cargar datos locales:', error);
    localStorage.removeItem('calendarEvents');
  }
  return null;
};

const Calendar = () => {
  // ====== ESTADOS ======
  const [events, setEvents] = useState([]);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [systemDate, setSystemDate] = useState(new Date());
  // Estado para la hora inicial visible en la agenda (se muestran 7 horas consecutivas)
  const [topHour, setTopHour] = useState(() => Math.max(0, Math.min(new Date().getHours() - 1, 17)));
  const currentHour = systemDate.getHours();

  const isInitializedRef = useRef(false);
  const authAttemptedRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState('loading');
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    summary: '', description: '', date: '', startTime: '09:00', endTime: '10:00', location: '',
  });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const fetchedRangeRef = useRef({ min: null, max: null });

  // ====== AUTENTICACIÓN CON GOOGLE ======
  const renewAccessToken = async (refreshToken) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/google/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        storeTokenWithExpiration(data.accessToken, data.expiresIn, data.refreshToken);
        return data.accessToken;
      } else {
        console.error('Error renovando token:', response.statusText);
        localStorage.removeItem('accessToken');
        return null;
      }
    } catch (error) {
      console.error('Error en renovación de token:', error);
      return null;
    }
  };

  const getAuthUrl = async () => {
    if (isAuthFetchInProgress() || isAuthInProgress()) return;
    try {
      setAuthFetchInProgress(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/google/auth/url`);
      const data = await response.json();
      if (data && data.url && typeof data.url === 'string' && data.url.trim() !== '') {
        setAuthInProgress();
        window.location.href = data.url;
      } else {
        console.error("URL de autenticación no válida:", data);
        setConnectionMessage("❌ Error: No se pudo obtener la URL de autenticación de Google.");
        setAuthFetchInProgress(false);
      }
    } catch (error) {
      console.error("Error obteniendo la URL de autenticación:", error);
      setConnectionMessage("❌ Error de conexión al obtener la autenticación de Google.");
      setAuthFetchInProgress(false);
    }
  };

  // checkAccessToken: usa el token directamente con fetchCalendarEvents.
  // Si el token es inválido, fetchCalendarEvents maneja el 401/403 y redirige.
  const checkAccessToken = async () => {
    const stored = getStoredToken();
    // getStoredToken retorna string (formato antiguo) u objeto { token, refreshToken, needsRefresh }
    const token = typeof stored === 'string' ? stored : stored?.token;

    if (stored?.needsRefresh && stored?.refreshToken) {
      renewAccessToken(stored.refreshToken);
    }

    if (token) {
      fetchCalendarEvents(token);
    } else if (!authAttemptedRef.current) {
      authAttemptedRef.current = true;
      setSyncStatus('loading');
      setConnectionMessage('🔄 Redirigiendo a Google para autenticación...');
      getAuthUrl();
    } else {
      setSyncStatus('error');
      setConnectionMessage('❌ No se pudo completar la autenticación con Google.');
    }
  };

  const fetchCalendarEvents = async (token) => {
    if (!token) {
      setSyncStatus('error');
      setConnectionMessage('❌ No se encontró un accessToken válido.');
      return;
    }

    try {
      setSyncStatus('loading');
      setConnectionMessage("🔄 Sincronizando con Google Calendar...");

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999).toISOString();

      const url = `${import.meta.env.VITE_API_URL}/api/google/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('accessToken');
        clearAuthInProgress();
        if (!authAttemptedRef.current && !isAuthInProgress()) {
          authAttemptedRef.current = true;
          setSyncStatus('loading');
          setConnectionMessage("🔄 Redirigiendo a Google para autenticación...");
          await getAuthUrl();
        } else {
          setSyncStatus('error');
          setConnectionMessage("❌ La sesión de Google expiró. Haga clic para intentar nuevamente.");
        }
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error en la respuesta:", errorData);
        setSyncStatus('connection-error');
        setConnectionMessage("❌ No se pudieron obtener eventos. Verifique su conexión.");
        return;
      }

      const data = await response.json();

      setEvents(data.items);
      storeEventsLocally(data.items);
      fetchedRangeRef.current = {
        min: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        max: new Date(now.getFullYear(), now.getMonth() + 2, 0),
      };
      setSyncStatus('success');
      setConnectionMessage("✅ Eventos sincronizados con Google Calendar.");
    } catch (error) {
      console.error("Error al obtener eventos:", error);
      setSyncStatus('connection-error');
      setConnectionMessage("❌ No se pudieron obtener eventos. Verifique su conexión.");
    }
  };

  // ====== EFECTOS ======
  // Capturar accessToken de la URL si existe o manejar errores de OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('accessToken');
    const refreshTokenFromUrl = urlParams.get('refreshToken');
    const errorFromUrl = urlParams.get('error');
    const expiresInParam = urlParams.get('expiresIn');
    
    if (errorFromUrl) {
      authAttemptedRef.current = true;
      clearAuthInProgress();
      setSyncStatus('error');

      const errorMessages = {
        invalid_grant: '❌ Código de autorización expirado. Haga clic para intentar nuevamente.',
        oauth_error: '❌ Error de autorización. Haga clic para intentar nuevamente.',
        no_code: '❌ No se recibió código de autorización. Haga clic para intentar nuevamente.',
      };
      setConnectionMessage(errorMessages[errorFromUrl] || '❌ Error en la autenticación. Haga clic para intentar nuevamente.');

      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (tokenFromUrl) {
      const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;
      storeTokenWithExpiration(
        tokenFromUrl,
        Number.isFinite(expiresIn) ? expiresIn : 3600,
        refreshTokenFromUrl
      );
      authAttemptedRef.current = true;
      clearAuthInProgress();
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchCalendarEvents(tokenFromUrl);
    }
  }, []);

  // Inicialización de autenticación (solo se ejecuta una vez)
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('accessToken');
      const errorFromUrl = urlParams.get('error');

      if (!tokenFromUrl && !errorFromUrl) {
        if (isAuthInProgress()) {
          setSyncStatus('loading');
          setConnectionMessage('🔄 Esperando autenticación con Google...');
          return;
        }
        checkAccessToken();
      }
    }
  }, []);

  // Cargar eventos almacenados localmente
  useEffect(() => {
    const localEvents = loadLocalEvents();
    if (localEvents) {
      setEvents(localEvents);
    }
  }, []);

  // Actualizar la hora del sistema cada minuto
  useEffect(() => {
    const updateTime = () => {
      setSystemDate(new Date());
    };
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Verificar periódicamente si el token necesita renovarse (cada 10 minutos)
  useEffect(() => {
    const checkTokenExpiration = () => {
      try {
        const tokenData = localStorage.getItem('accessToken');
        if (!tokenData) return;
        
        const parsed = JSON.parse(tokenData);
        if (parsed.token && parsed.expiration && parsed.refreshToken) {
          const now = new Date().getTime();
          const timeUntilExpiry = parsed.expiration - now;
          
          // Si el token expira en menos de 10 minutos, renovarlo proactivamente
          if (timeUntilExpiry < 10 * 60 * 1000 && timeUntilExpiry > 0) {
            renewAccessToken(parsed.refreshToken);
          }
        }
      } catch (error) {
        console.error("Error verificando expiración de token:", error);
      }
    };
    
    // Verificar cada 10 minutos
    const interval = setInterval(checkTokenExpiration, 10 * 60 * 1000);
    
    // Verificar inmediatamente al montar
    checkTokenExpiration();
    
    return () => clearInterval(interval);
  }, []);

  // ====== HELPERS DE NAVEGACIÓN Y EVENTOS ======
  const getAccessToken = () => {
    const stored = getStoredToken();
    if (typeof stored === 'string') return stored;
    return stored?.token || null;
  };

  const navigateDay = (offset) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d;
    });
  };

  const navigateMonth = (offset) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + offset);
      return d;
    });
  };

  const openEventModal = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    setEventForm({
      summary: '', description: '', date: dateStr,
      startTime: '09:00', endTime: '10:00', location: '',
    });
    setShowEventModal(true);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setSyncStatus('error');
      setConnectionMessage('❌ No hay token. Autentíquese primero.');
      setShowEventModal(false);
      return;
    }
    setCreatingEvent(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const eventBody = {
        summary: eventForm.summary,
        description: eventForm.description || undefined,
        location: eventForm.location || undefined,
        start: { dateTime: `${eventForm.date}T${eventForm.startTime}:00`, timeZone },
        end: { dateTime: `${eventForm.date}T${eventForm.endTime}:00`, timeZone },
      };
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/google/calendar/events`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        }
      );
      if (response.ok) {
        const newEvent = await response.json();
        setEvents(prev => [...prev, newEvent]);
        setShowEventModal(false);
        setSyncStatus('success');
        setConnectionMessage('✅ Evento creado exitosamente.');
      } else {
        setSyncStatus('error');
        setConnectionMessage('❌ Error al crear el evento.');
      }
    } catch (err) {
      console.error('Error creating event:', err);
      setConnectionMessage('❌ Error de conexión al crear el evento.');
    } finally {
      setCreatingEvent(false);
    }
  };

  // Re-fetch events when navigating to a month outside the fetched range
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
    const token = getAccessToken();
    if (token) {
      const timeMin = new Date(year, month - 1, 1).toISOString();
      const timeMax = new Date(year, month + 2, 0, 23, 59, 59, 999).toISOString();
      fetch(
        `${import.meta.env.VITE_API_URL}/api/google/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      )
        .then(res => { if (res.ok) return res.json(); throw new Error('fetch error'); })
        .then(data => {
          setEvents(data.items || []);
          storeEventsLocally(data.items || []);
          fetchedRangeRef.current = {
            min: new Date(year, month - 1, 1),
            max: new Date(year, month + 1, 28),
          };
        })
        .catch(err => console.error('Error re-fetching events:', err));
    }
  }, [currentDate]);

  // Se generan las horas visibles a partir de topHour (se muestran 7 horas consecutivas)
  const visibleHours = Array.from({ length: 7 }, (_, i) => topHour + i);

  // ====== FILTRADO Y ORDENACIÓN DE EVENTOS ======
  // Filtra los eventos para el día seleccionado (optimizado con useMemo)
  const eventsForSelectedDay = useMemo(() => {
    // Formato "YYYY-MM-DD" del día seleccionado
    const selectedDayStr = currentDate.toISOString().split('T')[0];
    const filteredEvents = events.filter(event => {
      // Ignorar eventos cancelados
      if (event.status && event.status === 'cancelled') return false;
      if (event.start) {
        // Eventos de todo el día (sin hora definida)
        if (event.start.date) {
          return event.start.date === selectedDayStr;
        }
        // Eventos con hora definida
        if (event.start.dateTime) {
          const eventDateTime = new Date(event.start.dateTime);
          return eventDateTime.toDateString() === currentDate.toDateString();
        }
      }
      return false;
    });
    // Ordenar los eventos por hora de inicio
    filteredEvents.sort((a, b) => {
      const aTime = a.start.dateTime ? new Date(a.start.dateTime) : new Date(a.start.date);
      const bTime = b.start.dateTime ? new Date(b.start.dateTime) : new Date(b.start.date);
      return aTime - bTime;
    });
    return filteredEvents;
  }, [events, currentDate]);

  // ====== RENDERIZADO ======
  // Renderiza los eventos de "Todo el día" y los eventos con hora agrupados por bloque
  const renderHours = () => {
    const dayEvents = eventsForSelectedDay;
    // Separar eventos de todo el día y con hora
    const allDayEvents = dayEvents.filter(event => event.start.date && !event.start.dateTime);
    const timedEvents = dayEvents.filter(event => event.start.dateTime);
    // Agrupar eventos con hora según la hora de inicio
    const eventsByHour = timedEvents.reduce((acc, event) => {
      const eventDateTime = new Date(event.start.dateTime);
      const hour = eventDateTime.getHours();
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
                <div key={event.id} className="event">
                  {event.summary || 'Sin título'}
                </div>
              ))}
            </div>
          </div>
        )}
        {visibleHours.map(hour => {
          const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
          const hourEvents = eventsByHour[hour] || [];
          // Resalta la hora actual si el día seleccionado es hoy
          const isCurrent = hour === currentHour && currentDate.toDateString() === new Date().toDateString();
          return (
            <div key={hour} className={`hour ${isCurrent ? 'current-hour' : ''}`}>
              <div className="hour-time">{timeLabel}</div>
              <div className="hour-events">
                {hourEvents.length > 0 ? (
                  hourEvents.map(event => {
                    const hasDateTime = event.start && event.start.dateTime;
                    let offsetLabel = null;
                    if (hasDateTime) {
                      const minutes = new Date(event.start.dateTime).getMinutes();
                      if (minutes > 0) {
                        offsetLabel = `:${minutes.toString().padStart(2, '0')}`;
                      }
                    }
                    return (
                      <div key={event.id} className="event">
                        {event.summary || 'Sin título'}
                        {offsetLabel && (
                          <>
                            {' '}
                            <span className="event-time">{offsetLabel}</span>
                          </>
                        )}
                      </div>
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

  // Renderiza el mini-calendario con la grilla de días del mes
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
      days.push(
        <div
          key={day}
          className={`day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => setCurrentDate(date)}
        >
          {day}
        </div>
      );
    }

    return (
      <div className="month-calendar">
        <div className="month-nav">
          <button className="nav-arrow" onClick={() => navigateMonth(-1)} title="Mes anterior">&#8249;</button>
          <h3>{currentDate.toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())} {year}</h3>
          <button className="nav-arrow" onClick={() => navigateMonth(1)} title="Mes siguiente">&#8250;</button>
        </div>
        <div className="days-grid">
          {dayLabels.map((label, i) => (
            <div key={`label-${i}`} className="day-label">{label}</div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  const isToday = currentDate.toDateString() === systemDate.toDateString();

  // ====== RENDERIZADO DEL COMPONENTE ======
  return (
    <div className="calendar-wrapper">
    <div className="calendar-container">
      {/* Indicador de sincronización (emoji + tooltip) */}
      <div
        className="sync-indicator"
        title={connectionMessage}
        onClick={() => {
          if (syncStatus === 'error' || syncStatus === 'connection-error') {
            authAttemptedRef.current = false;
            localStorage.removeItem('accessToken');
          }
          checkAccessToken();
        }}
      >
        {syncStatus === 'loading' ? '🔄' :
         syncStatus === 'error' ? '❌' :
         syncStatus === 'connection-error' ? '❌❌' :
         <img src={checkCircle2Icon} alt="✓" width="20" height="20" />}
      </div>

      {/* Botón para agregar evento */}
      <button
        className="add-event-btn"
        onClick={openEventModal}
        title="Agregar evento"
      >+</button>

      {/* Bloque superior-izquierdo: muestra el mes y día actual */}
      <div className="day-display">
        <div className="month-name">
          {currentDate.toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())}
        </div>
        <div className="day-nav">
          <button className="nav-arrow" onClick={() => navigateDay(-1)} title="Día anterior">&#8249;</button>
          <div className="day-number">
            {currentDate.getDate()}
          </div>
          <button className="nav-arrow" onClick={() => navigateDay(1)} title="Día siguiente">&#8250;</button>
        </div>
      </div>

      {/* Bloque derecho: Agenda para el día seleccionado */}
      <div className="schedule">
        <div className="schedule-title">
          {isToday ? 'Agenda para hoy' : `Agenda para el ${currentDate.toLocaleDateString('es-ES')}`}
        </div>
        <div className="schedule-content" onWheel={(e) => {
          const delta = e.deltaY > 0 ? 1 : -1;
          setTopHour(prev => Math.max(0, Math.min(prev + delta, 23 - 3)));
        }}>
          {renderHours()}
        </div>
      </div>
      {/* Bloque inferior: Mini-calendario del mes */}
      {renderMonth()}
    </div>

    {/* Modal para crear evento */}
    {showEventModal && (
      <div className="event-modal-overlay" onClick={() => setShowEventModal(false)}>
        <div className="event-modal" onClick={e => e.stopPropagation()}>
          <div className="event-modal__header">
            <h3>Agregar Evento</h3>
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
              >{creatingEvent ? 'Creando...' : 'Crear Evento'}</button>
            </div>
          </form>
        </div>
      </div>
    )}
    </div>
  );
};

export default Calendar;