import React, { useEffect, useState, useRef, useMemo } from 'react';
import '../Styles/Calendar.css';

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

const Calendar = () => {
  // ====== ESTADOS ======
  const [events, setEvents] = useState([]);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [systemDate, setSystemDate] = useState(new Date());
  // Estado para la hora inicial visible en la agenda (se mostrarán 4 horas consecutivas)
  const [topHour, setTopHour] = useState(() => {
    const nowHour = new Date().getHours();
    return Math.max(0, nowHour - 1);
  });
  const currentHour = systemDate.getHours();

  // ====== FUNCIONES DE ALMACENAMIENTO DE TOKEN ======
  const storeTokenWithExpiration = (token, expiresIn = 3600, refreshToken = null) => {
    const expirationTime = new Date().getTime() + (expiresIn * 1000);
    const tokenData = {
      token: token,
      expiration: expirationTime,
      refreshToken: refreshToken // Guardar refresh token para renovación automática
    };
    localStorage.setItem('accessToken', JSON.stringify(tokenData));
    console.log(`🔍 Token almacenado. Expira en ${expiresIn} segundos (${Math.floor(expiresIn / 60)} minutos)`);
  };

  const getStoredToken = () => {
    try {
      const tokenData = localStorage.getItem('accessToken');
      if (!tokenData) return null;
      
      // Si es un string simple (formato antiguo), devolverlo
      if (typeof tokenData === 'string' && !tokenData.startsWith('{')) {
        return tokenData;
      }
      
      const parsed = JSON.parse(tokenData);
      if (parsed.token && parsed.expiration) {
        const now = new Date().getTime();
        const timeUntilExpiry = parsed.expiration - now;
        
        // Si el token expira en menos de 5 minutos, intentar renovarlo
        if (timeUntilExpiry < 5 * 60 * 1000 && parsed.refreshToken) {
          console.log("🔍 Token próximo a expirar, intentando renovar automáticamente...");
          renewAccessToken(parsed.refreshToken);
          return parsed.token; // Devolver el token actual mientras se renueva
        }
        
        // Verificar si el token ha expirado
        if (now < parsed.expiration) {
          const minutesLeft = Math.floor(timeUntilExpiry / 1000 / 60);
          console.log(`🔍 Token válido. Expira en ${minutesLeft} minutos`);
          return parsed.token;
        } else {
          // Si hay refresh token, intentar renovar
          if (parsed.refreshToken) {
            console.log("🔍 Token expirado, intentando renovar con refresh_token...");
            renewAccessToken(parsed.refreshToken);
          } else {
            console.log("🔍 Token expirado y sin refresh_token, eliminando...");
            localStorage.removeItem('accessToken');
          }
          return null;
        }
      }
      return parsed.token || parsed; // Fallback para formatos antiguos
    } catch (error) {
      console.error("Error al obtener token almacenado:", error);
      localStorage.removeItem('accessToken');
      return null;
    }
  };

  const [accessToken, setAccessToken] = useState(getStoredToken() || null);
  const isInitializedRef = useRef(false);
  const authAttemptedRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState('loading'); // 'loading', 'error', 'connection-error', 'success'

  // ====== ALMACENAMIENTO LOCAL ======

  const storeEventsLocally = (fetchedEvents) => {
    const expiration = new Date();
    expiration.setMonth(expiration.getMonth() + 1); // Expira en 1 mes
    localStorage.setItem('calendarEvents', JSON.stringify({
      events: fetchedEvents,
      expiration: expiration.toISOString(),
    }));
  };

  const loadLocalEvents = () => {
    try {
      const localData = JSON.parse(localStorage.getItem('calendarEvents'));
      if (localData && localData.events && localData.expiration) {
        const expirationDate = new Date(localData.expiration);
        if (expirationDate > new Date()) {
          return localData.events;
        } else {
          localStorage.removeItem('calendarEvents');
          console.log('Datos locales expirados y eliminados.');
        }
      }
    } catch (error) {
      console.error('Error al cargar los datos locales:', error);
      localStorage.removeItem('calendarEvents');
    }
    return null;
  };

  // ====== AUTENTICACIÓN CON GOOGLE ======
  const renewAccessToken = async (refreshToken) => {
    try {
      console.log("🔄 Renovando access token con refresh_token...");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/google/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Access token renovado exitosamente");
        storeTokenWithExpiration(data.accessToken, data.expiresIn, data.refreshToken);
        setAccessToken(data.accessToken);
        return data.accessToken;
      } else {
        console.error("❌ Error renovando token:", response.statusText);
        localStorage.removeItem('accessToken');
        setAccessToken(null);
        return null;
      }
    } catch (error) {
      console.error("❌ Error en renovación de token:", error);
      return null;
    }
  };

  const validateToken = async (token) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token);
      if (response.ok) {
        const tokenInfo = await response.json();
        console.log("🔍 Token válido:", tokenInfo);
        return true;
      } else {
        console.log("❌ Token inválido o expirado");
        return false;
      }
    } catch (error) {
      console.error("❌ Error validando token:", error);
      return false;
    }
  };

  const getAuthUrl = async () => {
    if (isAuthFetchInProgress() || isAuthInProgress()) {
      console.log("🔍 Autenticación en curso, evitando nueva solicitud de URL...");
      return;
    }
    try {
      setAuthFetchInProgress(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/google/auth/url`);
      const data = await response.json();
      if (data && data.url && typeof data.url === 'string' && data.url.trim() !== '') {
        setAuthInProgress();
        window.location.href = data.url;
      } else {
        console.error("❌ URL de autenticación no válida:", data);
        setConnectionMessage("❌ Error: No se pudo obtener la URL de autenticación de Google.");
        setAuthFetchInProgress(false);
      }
    } catch (error) {
      console.error("❌ Error obteniendo la URL de autenticación:", error);
      setConnectionMessage("❌ Error de conexión al obtener la autenticación de Google.");
      setAuthFetchInProgress(false);
    }
  };

  const checkAccessToken = async () => {
    const storedAccessToken = getStoredToken();
    if (storedAccessToken) {
      console.log("🔍 Validando accessToken almacenado...");
      const isValid = await validateToken(storedAccessToken);
      if (isValid) {
        console.log("🔍 Usando accessToken válido.");
        setAccessToken(storedAccessToken);
        fetchCalendarEvents(storedAccessToken);
      } else {
        console.log("🔍 Token almacenado inválido, eliminando y solicitando nueva autenticación...");
        localStorage.removeItem("accessToken");
         setAccessToken(null);
        if (!authAttemptedRef.current) {
          authAttemptedRef.current = true;
          setSyncStatus('loading');
          setConnectionMessage("🔄 Redirigiendo a Google para autenticación...");
          getAuthUrl();
        } else {
          setSyncStatus('error');
          setConnectionMessage("❌ No se pudo completar la autenticación con Google.");
        }
      }
    } else if (!authAttemptedRef.current) {
      console.log("🔍 No se encontró accessToken, solicitando autenticación...");
      authAttemptedRef.current = true;
      setSyncStatus('loading');
      setConnectionMessage("🔄 Redirigiendo a Google para autenticación...");
      getAuthUrl();
    } else {
      console.log("🔍 Autenticación ya intentada, no redirigiendo nuevamente.");
      setSyncStatus('error');
      setConnectionMessage("❌ No se pudo completar la autenticación con Google.");
    }
  };

  const fetchCalendarEvents = async (token) => {
    if (!token) {
      console.error("❌ No se encontró un accessToken válido.");
      setSyncStatus('error');
      setConnectionMessage("❌ No se encontró un accessToken válido.");
      return;
    }

    try {
      setSyncStatus('loading');
      setConnectionMessage("🔄 Sincronizando con Google Calendar...");
      console.log("🔍 Obteniendo eventos de Google Calendar con token:", token);

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999).toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${timeMin}&timeMax=${timeMax}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.warn("⚠️ Token inválido/expirado al consultar eventos (",
          response.status, ") -> limpiando y solicitando nueva autenticación");
        localStorage.removeItem('accessToken');
        setAccessToken(null);
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
      console.log("✅ Eventos obtenidos:", data.items);

      setEvents(data.items);
      storeEventsLocally(data.items);
      setSyncStatus('success');
      setConnectionMessage("✅ Eventos sincronizados con Google Calendar.");
    } catch (error) {
      console.error("❌ Error al obtener eventos:", error);
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
    const errorMessage = urlParams.get('message');
    const expiresInParam = urlParams.get('expiresIn');
    
    if (errorFromUrl) {
      console.error("❌ Error de OAuth recibido:", errorFromUrl, errorMessage);
      authAttemptedRef.current = true;
      clearAuthInProgress();
      
      // Manejar diferentes tipos de errores
      if (errorFromUrl === 'invalid_grant') {
        setSyncStatus('error');
        setConnectionMessage("❌ Código de autorización expirado. Haga clic para intentar nuevamente.");
      } else if (errorFromUrl === 'oauth_error') {
        setSyncStatus('error');
        setConnectionMessage("❌ Error de autorización. Haga clic para intentar nuevamente.");
      } else if (errorFromUrl === 'no_code') {
        setSyncStatus('error');
        setConnectionMessage("❌ No se recibió código de autorización. Haga clic para intentar nuevamente.");
      } else {
        setSyncStatus('error');
        setConnectionMessage("❌ Error en la autenticación. Haga clic para intentar nuevamente.");
      }
      
      // Limpiar la URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (tokenFromUrl) {
      console.log("🔍 AccessToken recibido desde URL:", tokenFromUrl);
      if (refreshTokenFromUrl) {
        console.log("✅ RefreshToken recibido - ¡Las credenciales durarán mucho más tiempo!");
      }
      const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;
      storeTokenWithExpiration(
        tokenFromUrl, 
        Number.isFinite(expiresIn) ? expiresIn : 3600,
        refreshTokenFromUrl // Guardar refresh token para renovación automática
      );
      setAccessToken(tokenFromUrl);
      authAttemptedRef.current = true;
      clearAuthInProgress();
      
      // Limpiar la URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Obtener eventos inmediatamente
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
          console.log('🔍 Autenticación marcada en progreso, esperando resultado sin relanzar');
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
      console.log("Eventos cargados desde almacenamiento local.");
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
            console.log("⏰ Token próximo a expirar, renovando proactivamente...");
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

  // Se generan las horas visibles a partir de topHour (se muestran 4 horas consecutivas)
  const visibleHours = Array.from({ length: 7 }, (_, i) => {
    const hour = topHour + i;
    return hour;
  });

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
        <h3>{currentDate.toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())} {year}</h3>
        <div className="days-grid">
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
            // Reiniciar el proceso de autenticación
            authAttemptedRef.current = false;
            localStorage.removeItem('accessToken');
            setAccessToken(null);
            checkAccessToken();
          } else {
            checkAccessToken();
          }
        }}
      >
        {syncStatus === 'loading' ? '🔄' :
         syncStatus === 'error' ? '❌' :
         syncStatus === 'connection-error' ? '❌❌' :
         '✅'}
      </div>

      {/* Bloque superior-izquierdo: muestra el mes y día actual */}
      <div className="day-display">
        <div className="month-name">
          {currentDate.toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())}
        </div>
        <div className="day-number">
          {systemDate.getDate()}
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
    </div>
  );
};

export default Calendar;